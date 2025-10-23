/**
 * AgentPool - Manages agent reservations and task queueing for true parallelism
 *
 * Solves the race condition problem by:
 * 1. Serializing agent reservations (no concurrent access)
 * 2. Queueing tasks when no agents are available
 * 3. Auto-assigning queued tasks when agents become free
 */

import { EventEmitter } from 'node:events';
import type { TaskComplexity } from './unified_orchestrator.js';
import type { Task } from './state_machine.js';
import { logDebug, logInfo, logWarning } from '../telemetry/logger.js';
import { SubscriptionLimitTracker } from '../limits/subscription_tracker.js';
import { UsageEstimator } from '../limits/usage_estimator.js';
import { resolveWorkspaceRoot } from '../utils/config.js';
import { isArchitectureTask, isArchitectureReviewTask } from './task_characteristics.js';

// Compatibility exports for other files that depend on old agent_pool.ts
export type AgentType = 'claude_code' | 'codex';
export type AgentRole = 'architect' | 'engineer' | 'qa' | 'reviewer' | 'orchestrator' | 'worker' | 'critic' | 'architecture_planner' | 'architecture_reviewer';
export type ExecutionFailureType = 'rate_limit' | 'context_limit' | 'network' | 'validation' | 'other';

// Hybrid Agent interface - supports both old MCP and new UnifiedOrchestrator
export interface Agent {
  id: string;
  type: AgentType; // Legacy property for old code
  role?: AgentRole; // Legacy property for old code
  status: 'idle' | 'busy' | 'error' | 'failed';
  currentTask?: string;
  currentTaskTitle?: string;
  currentTaskDescription?: string;
  currentTaskType?: string;
  currentTaskProgress?: string;
  lastTask?: string;
  lastTaskTitle?: string;
  tasksCompleted: number;
  pid?: number;
  // New structure for unified orchestrator
  config: {
    provider: 'codex' | 'claude';
    role: string;
    model: string;
    reasoningEffort?: string;
    capabilities?: string[];
  };
  // Telemetry for unified orchestrator - required for new architecture, optional for legacy
  telemetry: {
    lastContextMetrics?: {
      relatedTasks: number;
      decisions: number;
      learnings: number;
      qualityIssues: number;
      filesToRead: number;
      promptLength: number;
    };
    lastQualityScore?: number;
    qualityTrend?: 'improving' | 'stable' | 'declining';
    totalTasks: number;
    successfulTasks: number;
    failedTasks: number;
    averageDuration: number;
    lastDuration?: number;
    tasksToday: number;
    lastExecutionTime?: number;
  };
}

export interface TaskAssignmentEventPayload {
  task: Task;
  agent: Agent;
  estimatedDuration: number;
  reasoning: string;
  contextSummary: {
    filesToRead?: string[];
    relatedTasks?: string[];
    qualitySignals?: Array<{ dimension: string; score: number }>;
    researchHighlights?: string[];
  };
}

export interface AssignmentOptions {
  forceAgentType?: AgentType;
  preferAgentType?: AgentType;
  avoidAgentTypes?: AgentType[];
  rationale?: string;
}

export interface ExecutionOutcome {
  success: boolean;
  output?: string;
  error?: string;
  failureType?: ExecutionFailureType;
  // Legacy properties for old MCP architecture
  retryAfterSeconds?: number;
  durationSeconds?: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUSD?: number;
  promptCache?: {
    hit?: boolean;
    status?: string;
    tier?: string;
    cacheId?: string;
    rawLine?: string;
    tokensRead?: number;
    tokensWritten?: number;
  };
}

export interface PromptCacheStatus {
  cacheHit: boolean;
  tokensRead?: number;
  tokensWritten?: number;
}

// Stub function exports for compatibility
export function parsePromptCacheMetadata(_output: string): PromptCacheStatus {
  return { cacheHit: false };
}

export interface OutputValidationFailureEvent {
  task: Task;
  agent: Agent;
  output: string;
  error: string;
  // Legacy properties for old MCP architecture
  mode?: string;
  agentType?: AgentType;
  code?: string;
  enforced?: boolean;
}

interface QueuedTask {
  task: Task;
  complexity: TaskComplexity;
  resolve: (agent: Agent) => void;
  reject: (error: Error) => void;
  queuedAt: number;
}

export interface AgentPoolStatus {
  totalAgents: number;
  availableAgents: number;
  busyAgents: number;
  queueLength: number;
  reservations: Array<{agentId: string; taskId: string}>;
}

interface AgentPoolInitOptions {
  workspaceRoot?: string;
}

export class AgentPool extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private reservations: Map<string, string> = new Map(); // agentId -> taskId
  private taskQueue: QueuedTask[] = [];
  private readonly workspaceRoot: string;
  private readonly limitTracker: SubscriptionLimitTracker;
  private readonly usageEstimator: UsageEstimator;
  private coordinatorType: AgentType = 'codex';
  private coordinatorAvailable = true;

  constructor(
    optionsOrWorkspace?: AgentPoolInitOptions | string | null,
    _legacyCodexWorkers?: number,
    legacyOptions?: AgentPoolInitOptions
  ) {
    super();
    const normalized = this.normalizeOptions(optionsOrWorkspace, legacyOptions);
    this.workspaceRoot = normalized.workspaceRoot ?? resolveWorkspaceRoot();
    this.limitTracker = new SubscriptionLimitTracker(this.workspaceRoot);
    this.usageEstimator = new UsageEstimator(this.limitTracker);
    this.limitTracker.on('limit:alert', (data) => {
      logWarning('Provider approaching usage limit', data);
    });
    void this.initializeUsageTracking();
  }

  /**
   * Add an agent to the pool
   */
  addAgent(agent: Agent): void {
    this.agents.set(agent.id, agent);
    logDebug('Agent added to pool', { agentId: agent.id, role: agent.config.role, model: agent.config.model });
  }

  /**
   * Reserve an agent for a task
   * Returns immediately if an agent is available, otherwise queues the task
   */
  async reserveAgent(task: Task, complexity: TaskComplexity): Promise<Agent> {
    return new Promise((resolve, reject) => {
      const agent = this.findAvailableAgent(complexity, task);

      if (agent) {
        // Agent available - reserve immediately
        this.reserve(agent, task);
        logDebug('Agent reserved', { agentId: agent.id, taskId: task.id, taskTitle: task.title });
        resolve(agent);
      } else {
        // No agent available - queue the task
        const queued: QueuedTask = {
          task,
          complexity,
          resolve,
          reject,
          queuedAt: Date.now(),
        };
        this.taskQueue.push(queued);

        logDebug('Task queued (no available agents)', {
          taskId: task.id,
          queuePosition: this.taskQueue.length,
          busyAgents: this.reservations.size,
        });

        this.emitStatusUpdate();
      }
    });
  }

  /**
   * Release an agent back to the pool and process queued tasks
   */
  releaseAgent(agentId: string): void {
    this.reservations.delete(agentId);
    const agent = this.agents.get(agentId);

    if (agent) {
      agent.status = 'idle';
      const previousTask = agent.currentTask;
      const previousTaskTitle = agent.currentTaskTitle;
      agent.lastTask = previousTask;
      agent.lastTaskTitle = previousTaskTitle;
      agent.currentTask = undefined;
      agent.currentTaskTitle = undefined;
      agent.currentTaskDescription = undefined;
      agent.currentTaskType = undefined;
      agent.currentTaskProgress = undefined;

      logDebug('Agent released', {
        agentId,
        previousTask,
        queueLength: this.taskQueue.length,
      });
    }

    // Process next queued task
    this.processQueue();
    this.emitStatusUpdate();
  }

  /**
   * Get current pool status
   */
  getStatus(): AgentPoolStatus {
    const available = Array.from(this.agents.values()).filter(
      a => a.status === 'idle' && !this.reservations.has(a.id)
    );

    return {
      totalAgents: this.agents.size,
      availableAgents: available.length,
      busyAgents: this.reservations.size,
      queueLength: this.taskQueue.length,
      reservations: Array.from(this.reservations.entries()).map(([agentId, taskId]) => ({
        agentId,
        taskId,
      })),
    };
  }

  /**
   * Process queued tasks - assign to available agents
   */
  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    const next = this.taskQueue[0];
    const agent = this.findAvailableAgent(next.complexity, next.task);

    if (agent) {
      // Remove from queue and assign
      this.taskQueue.shift();
      this.reserve(agent, next.task);

      const waitTime = Date.now() - next.queuedAt;
      logInfo('Task dequeued and assigned', {
        taskId: next.task.id,
        agentId: agent.id,
        waitTimeMs: waitTime,
        remainingQueue: this.taskQueue.length,
      });

      next.resolve(agent);

      // Try to process more queued tasks (might have multiple idle agents)
      this.processQueue();
    }
  }

  /**
   * Reserve an agent (mark as busy)
   */
  private reserve(agent: Agent, task: { id: string; title?: string; description?: string; type?: string }): void {
    this.reservations.set(agent.id, task.id);
    agent.status = 'busy';
    agent.currentTask = task.id;
    agent.currentTaskTitle = task.title || task.id;
    agent.currentTaskDescription = task.description;
    agent.currentTaskType = task.type;
    agent.currentTaskProgress = 'Starting...';
  }

  /**
   * Find an available agent based on complexity and task routing
   * Returns null if no agents are available
   */
  private findAvailableAgent(complexity: TaskComplexity, task: Task): Agent | null {
    const available = Array.from(this.agents.values()).filter(
      a => a.status === 'idle' && !this.reservations.has(a.id)
    );

    if (available.length === 0) {
      return null;
    }

    // Apply routing logic based on task characteristics
    const orchestrator = available.find(a => a.config.role === 'orchestrator');
    const workers = available.filter(a => a.config.role === 'worker');
    const critics = available.filter(a => a.config.role === 'critic');
    const architecturePlanner = available.find(a => a.config.role === 'architecture_planner');
    const architectureReviewer = available.find(a => a.config.role === 'architecture_reviewer');

    const architectureTask = isArchitectureTask(task);
    const architectureReviewTask = isArchitectureReviewTask(task);

    if (architectureReviewTask && architectureReviewer) {
      return architectureReviewer;
    }

    if (architectureTask && architecturePlanner) {
      return architecturePlanner;
    }

    // Route review/critique tasks to critics
    const isReviewTask = task.status === 'needs_review' ||
                        task.title?.toLowerCase().includes('review') ||
                        task.title?.toLowerCase().includes('critique') ||
                        task.title?.toLowerCase().includes('validate');

    if (isReviewTask && critics.length > 0) {
      return critics[0];
    }

    // Route strategic/epic tasks to orchestrator
    const isStrategicTask = task.type === 'epic' ||
                           complexity === 'complex' ||
                           task.title?.toLowerCase().includes('architecture') ||
                           task.title?.toLowerCase().includes('strategic');

    if (isStrategicTask && orchestrator) {
      return orchestrator;
    }

    // Route based on complexity
    switch (complexity) {
      case 'simple':
      case 'moderate':
        // Use round-robin for maximum parallelism
        // Pick the worker with the fewest completed tasks to balance load
        if (workers.length > 0) {
          const leastBusy = workers.reduce((min, w) =>
            w.tasksCompleted < min.tasksCompleted ? w : min
          );
          return leastBusy;
        }
        return orchestrator || available[0];

      case 'complex':
        // Use orchestrator for complex strategic tasks
        return orchestrator || available[0];

      default:
        return available[0];
    }
  }

  /**
   * Emit status update event
   */
  private emitStatusUpdate(): void {
    this.emit('status:updated', this.getStatus());
  }

  // ============================================================================
  // Compatibility Methods (for old agent_pool.ts API)
  // These are stubs to satisfy TypeScript compilation
  // They should NOT be called in the new UnifiedOrchestrator flow
  // ============================================================================

  getAvailableAgents(): Agent[] {
    return Array.from(this.agents.values()).filter(
      a => a.status === 'idle' && !this.reservations.has(a.id)
    );
  }

  hasAvailableAgent(_type?: string): boolean {
    return this.getAvailableAgents().length > 0;
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  getCoordinatorType(): string {
    return this.coordinatorType;
  }

  isCoordinatorAvailable(): boolean {
    return this.coordinatorAvailable;
  }

  async assignTask(_task: Task, _context: any, _options: any, _assignmentOptions: any): Promise<Agent> {
    throw new Error('assignTask() not implemented in new AgentPool - use reserveAgent() instead');
  }

  async completeTask(_taskId: string, _agent: Agent, _outcome: ExecutionOutcome, _durationMs: number): Promise<void> {
    throw new Error('completeTask() not implemented in new AgentPool - use releaseAgent() instead');
  }

  async executeWithClaudeCode(_taskId: string, _prompt: string, _options: any): Promise<ExecutionOutcome> {
    throw new Error('executeWithClaudeCode() not implemented in new AgentPool - use UnifiedOrchestrator.executeTask() instead');
  }

  async executeWithCodex(_taskId: string, _prompt: string, _options: any): Promise<ExecutionOutcome> {
    throw new Error('executeWithCodex() not implemented in new AgentPool - use UnifiedOrchestrator.executeTask() instead');
  }

  handleRateLimit(_taskId: string, _cooldownSeconds: number): void {
    this.coordinatorAvailable = false;
    this.emit('agent:cooldown', {
      reason: 'rate_limit',
      seconds: _cooldownSeconds,
      taskId: _taskId,
    });
  }

  imposeCooldown(_agentId: string, _durationMs: number): void {
    this.coordinatorAvailable = false;
    this.emit('agent:cooldown', {
      agentId: _agentId,
      reason: 'manual',
      seconds: Math.round(_durationMs / 1000),
    });
  }

  clearCooldown(_agentId: string): void {
    this.coordinatorAvailable = true;
    this.emit('agent:cooldown_cleared', {
      agentId: _agentId,
    });
  }

  promoteCoordinatorRole(_agentId?: string): void {
    const desired: AgentType =
      _agentId && _agentId.toLowerCase().includes('claude') ? 'claude_code' : 'codex';

    if (this.coordinatorType !== desired) {
      this.coordinatorType = desired;
      this.emit('coordinator:promoted', {
        coordinator: desired,
        reason: _agentId ?? 'auto',
      });
    }
  }

  demoteCoordinatorRole(_agentId?: string): void {
    if (this.coordinatorType !== 'codex') {
      this.coordinatorType = 'codex';
      this.emit('coordinator:demoted', {
        coordinator: 'codex',
        reason: _agentId ?? 'auto',
      });
    }
  }

  getUsageRatio(): { codex: number; claude: number; ratio: number } {
    // Count busy agents by provider for backwards compatibility with OperationsManager
    const busyAgents = Array.from(this.reservations.keys())
      .map(id => this.agents.get(id))
      .filter(Boolean);

    const codexBusy = busyAgents.filter(a => a!.config.provider === 'codex').length;
    const claudeBusy = busyAgents.filter(a => a!.config.provider === 'claude').length;
    const total = this.agents.size;
    const ratio = total > 0 ? this.reservations.size / total : 0;

    return {
      codex: codexBusy,
      claude: claudeBusy,
      ratio,
    };
  }

  getUsageEstimator(): any {
    return this.usageEstimator;
  }

  private normalizeOptions(
    optionsOrWorkspace?: AgentPoolInitOptions | string | null,
    legacyOptions?: AgentPoolInitOptions
  ): AgentPoolInitOptions {
    if (typeof optionsOrWorkspace === 'string') {
      return { ...legacyOptions, workspaceRoot: optionsOrWorkspace };
    }
    if (optionsOrWorkspace && typeof optionsOrWorkspace === 'object') {
      return optionsOrWorkspace;
    }
    return legacyOptions ?? {};
  }

  private async initializeUsageTracking(): Promise<void> {
    try {
      await this.limitTracker.initialize();
    } catch (error) {
      logWarning('Usage tracker initialization failed, continuing with defaults', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const claudeTier = this.normalizeTier(process.env.CLAUDE_SUBSCRIPTION_TIER);
    const codexTier = this.normalizeTier(process.env.CODEX_SUBSCRIPTION_TIER);

    if (!this.limitTracker.getUsage('codex', 'default')) {
      this.limitTracker.registerProvider('codex', 'default', codexTier);
    }

    if (process.env.WVO_DISABLE_CLAUDE !== '1' && !this.limitTracker.getUsage('claude', 'default')) {
      this.limitTracker.registerProvider('claude', 'default', claudeTier);
    }
  }

  private normalizeTier(raw?: string): 'free' | 'pro' | 'team' | 'enterprise' {
    const normalized = (raw ?? 'pro').toLowerCase();
    if (normalized === 'free' || normalized === 'team' || normalized === 'enterprise' || normalized === 'pro') {
      return normalized as 'free' | 'pro' | 'team' | 'enterprise';
    }
    return 'pro';
  }
}
