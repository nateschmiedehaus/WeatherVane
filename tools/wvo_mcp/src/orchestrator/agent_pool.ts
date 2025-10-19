/**
 * Agent Pool - Intelligent routing between Claude Code and Codex workers
 *
 * Architecture:
 * - Claude Code = Staff Engineer/Architect (1 instance, strategic)
 * - Codex Workers = Engineering Team (3-5 instances, parallel execution)
 *
 * Routing Strategy:
 * - Claude Code: Complex reasoning, architecture, reviews, coordination
 * - Codex Workers: Well-defined implementation, tests, docs, fixes
 */

import { EventEmitter } from 'node:events';
import { execa } from 'execa';
import type { Task } from './state_machine.js';
import type { AssembledContext } from './context_assembler.js';
import type { ReasoningLevel } from './reasoning_classifier.js';
import { logInfo, logWarning, logError } from '../telemetry/logger.js';
import { SubscriptionLimitTracker } from '../limits/subscription_tracker.js';
import { UsageEstimator } from '../limits/usage_estimator.js';
import {
  detectOutputFormat,
  OutputValidationError,
  resolveOutputValidationSettings,
  type OutputValidationMode,
  type OutputValidationSettings,
} from '../utils/output_validator.js';

// ============================================================================
// Types
// ============================================================================

export type AgentType = 'claude_code' | 'codex';
export type AgentRole = 'architect' | 'engineer' | 'qa' | 'reviewer';

export interface Agent {
  id: string;
  type: AgentType;
  role: AgentRole;
  baseRole: AgentRole;
  status: 'idle' | 'busy' | 'failed';
  currentTask?: string;
  completedTasks: number;
  failedTasks: number;
  avgDurationSeconds: number;
  lastUsed?: number;
  cooldownUntil?: number;
  promotedAt?: number;
}

export interface AgentCapabilities {
  strengths: string[];
  costPerToken: number;  // Relative cost
  avgSpeedTokensPerSecond: number;
  maxParallelTasks: number;
}

export interface TaskAssignment {
  taskId: string;
  agentId: string;
  assignedAt: number;
  estimatedDuration: number;
  codexModel?: string;
  codexReasoning?: string;
  codexPreset?: string;
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

export interface AgentPoolMetrics {
  totalAgents: number;
  busyAgents: number;
  idleAgents: number;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  avgTaskDuration: number;
  claudeUsagePercent: number;
  codexUsagePercent: number;
}

export type ExecutionFailureType = 'rate_limit' | 'context_limit' | 'network' | 'validation' | 'other';

export type PromptCacheStatus = 'hit' | 'miss' | 'store' | 'bypass' | 'error';

export interface PromptCacheMetadata {
  status: PromptCacheStatus;
  tier?: string;
  cacheId?: string;
  rawLine?: string;
}

export interface OutputValidationFailureEvent {
  taskId: string;
  agentType: AgentType;
  code?: string;
  message: string;
  mode: OutputValidationMode;
  enforced: boolean;
}

const COST_TRACKING_DISABLED =
  typeof process.env.WVO_DISABLE_COST_TRACKING === 'string' &&
  ['1', 'true', 'yes'].includes(process.env.WVO_DISABLE_COST_TRACKING.toLowerCase());

export interface ExecutionOutcome {
  success: boolean;
  output: string;
  durationSeconds: number;
  failureType?: ExecutionFailureType;
  retryAfterSeconds?: number;
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUSD?: number;
  promptCache?: PromptCacheMetadata;
}

function mapCacheStatusWord(word: string): PromptCacheStatus | undefined {
  const normalized = word.toLowerCase();
  switch (normalized) {
    case 'hit':
    case 'warm':
    case 'cached':
    case 'cache_hit':
      return 'hit';
    case 'miss':
    case 'cache_miss':
    case 'notfound':
    case 'nohit':
    case 'nomatch':
      return 'miss';
    case 'store':
    case 'write':
    case 'saving':
    case 'saved':
    case 'storing':
    case 'fill':
    case 'populate':
    case 'eligible':
    case 'commit':
      return 'store';
    case 'skip':
    case 'bypass':
    case 'disabled':
    case 'none':
    case 'ignored':
    case 'n/a':
    case 'na':
      return 'bypass';
    case 'error':
    case 'failed':
    case 'failure':
      return 'error';
    default:
      return undefined;
  }
}

export function parsePromptCacheMetadata(output: string): PromptCacheMetadata | undefined {
  if (!output || !/\bcache\b/i.test(output)) {
    return undefined;
  }

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let sawHit = false;
  let sawStore = false;
  let sawMiss = false;
  let sawBypass = false;
  let sawError = false;
  let tier: string | undefined;
  let cacheId: string | undefined;
  let rawLine: string | undefined;

  for (const line of lines) {
    if (!/\bcache\b/i.test(line)) {
      continue;
    }

    if (!rawLine) {
      rawLine = line;
    }

    const tierMatch = line.match(/\b(?:tier|bucket|level)\b[^A-Za-z0-9]*([A-Za-z0-9._-]+)/i);
    if (tierMatch && !tier) {
      tier = tierMatch[1];
    }

    const idMatch = line.match(/\bcache[-_\s]*(?:id|key)\b[^A-Za-z0-9]*([A-Za-z0-9._:/-]+)/i);
    if (idMatch && !cacheId) {
      cacheId = idMatch[1];
    }

    const statusMatches = line.match(/\b(hit|miss|store|write|saving|saved|storing|fill|warm|cached|eligible|skip|bypass|disabled|none|ignored|error|failed|failure|commit)\b/gi);
    if (statusMatches) {
      for (const match of statusMatches) {
        const status = mapCacheStatusWord(match);
        if (!status) continue;
        if (status === 'hit') {
          sawHit = true;
        } else if (status === 'store') {
          sawStore = true;
        } else if (status === 'miss') {
          sawMiss = true;
        } else if (status === 'bypass') {
          sawBypass = true;
        } else if (status === 'error') {
          sawError = true;
        }
      }
    } else if (line.toLowerCase().includes('miss')) {
      sawMiss = true;
    }
  }

  let status: PromptCacheStatus | undefined;
  if (sawHit) {
    status = 'hit';
  } else if (sawStore) {
    status = 'store';
  } else if (sawMiss) {
    status = 'miss';
  } else if (sawBypass) {
    status = 'bypass';
  } else if (sawError) {
    status = 'error';
  }

  if (!status && !tier && !cacheId) {
    return undefined;
  }

  return {
    status: status ?? 'bypass',
    tier,
    cacheId,
    rawLine,
  };
}

// ============================================================================
// Agent Pool
// ============================================================================

export class AgentPool extends EventEmitter {
  private agents: Map<string, Agent> = new Map();
  private assignments: Map<string, TaskAssignment> = new Map();
  private coordinatorType: AgentType = 'claude_code';
  private readonly coordinatorCandidates: string[] = [];
  private outputValidationCanaryWarningLogged = false;
  private readonly limitTracker: SubscriptionLimitTracker;
  private readonly usageEstimator: UsageEstimator;
  private readonly claudeEnabled: boolean;

  private readonly capabilities: Record<AgentType, AgentCapabilities> = {
    claude_code: {
      strengths: [
        'architectural_decisions',
        'complex_refactoring',
        'code_review',
        'system_design',
        'quality_assessment',
        'strategic_planning'
      ],
      costPerToken: 1.0,  // Baseline
      avgSpeedTokensPerSecond: 150,
      maxParallelTasks: 1  // Single coordinator
    },
    codex: {
      strengths: [
        'feature_implementation',
        'test_writing',
        'bug_fixes',
        'documentation',
        'refactoring',
        'migrations'
      ],
      costPerToken: 0.6,  // Cheaper than Claude
      avgSpeedTokensPerSecond: 200,
      maxParallelTasks: 5  // Multiple parallel workers
    }
  };

  constructor(
    private workspaceRoot: string,
    private codexWorkers: number = 3,  // Default: 3 Codex workers
    options: { enableClaude?: boolean } = {}
  ) {
    super();
    this.claudeEnabled = options.enableClaude ?? true;
    this.limitTracker = new SubscriptionLimitTracker(workspaceRoot);
    this.usageEstimator = new UsageEstimator(this.limitTracker);
    this.initializeAgents();
    void this.initializeLimitTracking();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize limit tracking for providers
   */
  private async initializeLimitTracking(): Promise<void> {
    try {
      await this.limitTracker.initialize();

      // Register providers based on environment configuration
      // Users can configure their subscription tiers via env vars
      const claudeTier = (process.env.CLAUDE_SUBSCRIPTION_TIER ?? 'pro') as 'free' | 'pro' | 'team';
      const codexTier = (process.env.CODEX_SUBSCRIPTION_TIER ?? 'pro') as 'free' | 'pro' | 'team';

      if (this.claudeEnabled) {
        this.limitTracker.registerProvider('claude', 'default', claudeTier);
      }
      this.limitTracker.registerProvider('codex', 'default', codexTier);

      // Listen to limit warnings
      this.limitTracker.on('limit:alert', (data) => {
        logWarning('Provider approaching usage limit', data);
      });

      this.limitTracker.on('limit:warning', (data) => {
        logWarning('Provider at 95% of usage limit', data);
        this.emit('provider:limit_warning', data);
      });

      this.limitTracker.on('limit:critical', (data) => {
        logError('Provider at critical usage level', data);
        this.emit('provider:limit_critical', data);
      });

      logInfo('Subscription limit tracking initialized', {
        claudeTier: this.claudeEnabled ? claudeTier : 'disabled',
        codexTier,
      });
    } catch (error) {
      logWarning('Failed to initialize limit tracking', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private initializeAgents(): void {
    // Initialize Claude Code coordinator if enabled
    if (this.claudeEnabled) {
      this.agents.set('claude_code', {
        id: 'claude_code',
        type: 'claude_code',
        role: 'architect',
        baseRole: 'architect',
        status: 'idle',
        completedTasks: 0,
        failedTasks: 0,
        avgDurationSeconds: 0
      });
    } else {
      this.coordinatorType = 'codex';
    }

    // Initialize Codex workers
    for (let i = 1; i <= this.codexWorkers; i++) {
      const baseRole: AgentRole = i === 1 ? 'engineer' : i === 2 ? 'qa' : 'engineer';
      const agent: Agent = {
        id: `codex_worker_${i}`,
        type: 'codex',
        role: baseRole,
        baseRole,
        status: 'idle',
        completedTasks: 0,
        failedTasks: 0,
        avgDurationSeconds: 0
      };
      this.agents.set(agent.id, agent);
      if (i === 1) {
        this.coordinatorCandidates.push(agent.id);
      }
    }

    if (!this.claudeEnabled && this.coordinatorCandidates.length === 0) {
      logWarning('No Codex coordinator candidates available; consider increasing codexWorkers');
    }
  }

  private getCoordinatorCandidate(): Agent | undefined {
    const candidateId = this.coordinatorCandidates[0];
    return candidateId ? this.agents.get(candidateId) ?? undefined : undefined;
  }

  promoteCoordinatorRole(reason: string): void {
    if (!this.claudeEnabled) {
      return;
    }
    const claudeAgent = this.agents.get('claude_code');
    if (!claudeAgent) return;

    const claudeOnCooldown = this.isOnCooldown(claudeAgent) || claudeAgent.status !== 'idle';
    if (!claudeOnCooldown) {
      return;
    }

    const candidate = this.getCoordinatorCandidate();
    if (!candidate) {
      logWarning('No Codex coordinator candidate available for promotion', { reason });
      return;
    }

    if (this.coordinatorType === 'codex') {
      return;
    }

    candidate.role = 'architect';
    candidate.promotedAt = Date.now();
    this.coordinatorType = 'codex';

    logWarning('Promoted Codex to coordinator role', {
      codexId: candidate.id,
      reason,
      claudeStatus: claudeAgent.status,
      claudeCooldownMs: claudeAgent.cooldownUntil ? Math.max(claudeAgent.cooldownUntil - Date.now(), 0) : 0,
    });

    this.emit('coordinator:promoted', {
      from: 'claude_code',
      to: candidate.id,
      reason,
    });
  }

  demoteCoordinatorRole(): void {
    if (!this.claudeEnabled) {
      return;
    }
    if (this.coordinatorType !== 'codex') {
      return;
    }

    const claudeAgent = this.agents.get('claude_code');
    const candidate = this.getCoordinatorCandidate();
    if (!claudeAgent || !candidate) {
      return;
    }

    const claudeAvailable = claudeAgent.status === 'idle' && !this.isOnCooldown(claudeAgent);
    if (!claudeAvailable) {
      return;
    }

    candidate.role = candidate.baseRole;
    candidate.promotedAt = undefined;
    this.coordinatorType = 'claude_code';

    logInfo('Demoted Codex coordinator; Claude available again', {
      codexId: candidate.id,
    });

    this.emit('coordinator:demoted', {
      from: candidate.id,
      to: 'claude_code',
    });
  }

  getCoordinatorType(): AgentType {
    return this.coordinatorType;
  }

  isCoordinatorAvailable(): boolean {
    if (this.coordinatorType === 'claude_code') {
      if (!this.claudeEnabled) {
        return false;
      }
      const claudeAgent = this.agents.get('claude_code');
      if (!claudeAgent) return false;
      return claudeAgent.status === 'idle' && !this.isOnCooldown(claudeAgent);
    }

    const candidate = this.getCoordinatorCandidate();
    if (!candidate) return false;
    return candidate.status === 'idle' && !this.isOnCooldown(candidate);
  }

  // ==========================================================================
  // Task Assignment (Smart Routing)
  // ==========================================================================

  /**
   * Assign task to the best available agent
   */
  async assignTask(
    task: Task,
    context: AssembledContext,
    modelHint?: { codexModel?: string; codexReasoning?: ReasoningLevel; codexPreset?: string },
    options: AssignmentOptions = {}
  ): Promise<Agent> {
    // 1. Check quota pressure and adjust recommendations
    const taskEstimate = this.usageEstimator.estimateTask(
      task.description || task.title,
      (context.filesToRead?.length ?? 0) * 500 // rough estimate: 500 tokens per file
    );

    const availableProviders: Array<{ provider: 'claude' | 'codex'; account: string }> = [];
    if (this.claudeEnabled) {
      availableProviders.push({ provider: 'claude', account: 'default' });
    }
    availableProviders.push({ provider: 'codex', account: 'default' });

    const recommendation = this.usageEstimator.recommendProvider(
      taskEstimate,
      availableProviders
    );

    // 2. Determine optimal agent type, considering quota
    const avoidTypes = new Set(options.avoidAgentTypes ?? []);
    let recommendedType =
      options.forceAgentType ?? options.preferAgentType ?? this.recommendAgentType(task, context);

    // Override recommendation if quota is critical
    if (recommendation.quota_pressure === 'critical' || recommendation.quota_pressure === 'high') {
      const preferredProvider = recommendation.preferred_provider;
      const preferredType: AgentType = preferredProvider === 'claude' ? 'claude_code' : 'codex';

      if (!avoidTypes.has(preferredType)) {
        logInfo('Overriding agent selection due to quota pressure', {
          originalType: recommendedType,
          newType: preferredType,
          pressure: recommendation.quota_pressure,
          reasoning: recommendation.reasoning,
        });
        recommendedType = preferredType;
      }
    }

    // 3. Check if recommended provider can handle the request
    if (!this.claudeEnabled && recommendedType === 'claude_code') {
      recommendedType = 'codex';
    }

    const providerName = recommendedType === 'claude_code' ? 'claude' : 'codex';
    const canHandle = this.limitTracker.canMakeRequest(
      providerName,
      'default',
      taskEstimate.estimated_tokens
    );

    if (!canHandle) {
      logWarning('Recommended provider cannot handle request due to limits', {
        provider: providerName,
        taskId: task.id,
        estimatedTokens: taskEstimate.estimated_tokens,
      });

      // Try fallback
      const fallbackType: AgentType = recommendedType === 'claude_code' ? 'codex' : 'claude_code';
      const fallbackProvider = fallbackType === 'claude_code' ? 'claude' : 'codex';

      if (
        this.claudeEnabled &&
        !avoidTypes.has(fallbackType) &&
        this.limitTracker.canMakeRequest(
        fallbackProvider,
        'default',
        taskEstimate.estimated_tokens
      )) {
        recommendedType = fallbackType;
        logInfo('Switched to fallback provider', {
          fallback: fallbackProvider,
          taskId: task.id,
        });
      } else {
        logWarning('No providers available due to quota limits', {
          taskId: task.id,
          estimatedTokens: taskEstimate.estimated_tokens,
        });
      }
    }

    // 4. Find available agent
    const searchOrder: AgentType[] = [];
    if (!avoidTypes.has(recommendedType)) {
      searchOrder.push(recommendedType);
    }
    const alternateType: AgentType = recommendedType === 'claude_code' ? 'codex' : 'claude_code';
    if (this.claudeEnabled || alternateType === 'codex') {
      if (!avoidTypes.has(alternateType)) {
        searchOrder.push(alternateType);
      }
    }

    for (const candidateType of searchOrder) {
      const agent = this.findAvailableAgent(candidateType);
      if (agent) {
        if (candidateType !== recommendedType) {
          this.emit('agent:fallback', {
            task: task.id,
            from: recommendedType,
            to: candidateType,
            reason: options.rationale,
          });
        }
        return this.recordAssignment(task, agent, context, modelHint);
      }
    }

    throw new Error(`No agents available (all ${this.agents.size} agents busy)`);
  }

  /**
   * Recommend agent type based on task characteristics
   */
  private recommendAgentType(task: Task, context: AssembledContext): AgentType {
    if (!this.claudeEnabled) {
      return 'codex';
    }
    if (this.coordinatorType === 'codex') {
      if (task.status === 'needs_review') {
        return 'codex';
      }

      const complexity = task.estimated_complexity ?? 5;
      if (complexity >= 8) {
        return 'codex';
      }

      const hasArchitecturalDecisions = context.relevantDecisions.length > 3;
      const hasQualityIssues = context.qualityIssuesInArea.length > 0;
      if (hasArchitecturalDecisions || hasQualityIssues) {
        return 'codex';
      }

      return 'codex';
    }

    if (task.status === 'needs_review') {
      return 'claude_code';
    }

    if (task.status === 'needs_improvement') {
      return 'codex';
    }

    // High complexity → Claude Code (better reasoning)
    if ((task.estimated_complexity || 5) >= 8) {
      return 'claude_code';
    }

    // Epic-level tasks → Claude Code (strategic)
    if (task.type === 'epic') {
      return 'claude_code';
    }

    // Code review tasks → Claude Code (quality assessment)
    if (task.title.toLowerCase().includes('review')) {
      return 'claude_code';
    }

    // Architecture/design tasks → Claude Code
    const architectureKeywords = ['design', 'architecture', 'methodology', 'approach', 'strategy'];
    const titleLower = task.title.toLowerCase();
    if (architectureKeywords.some(kw => titleLower.includes(kw))) {
      return 'claude_code';
    }

    // Has many decisions/constraints in context → Claude Code (needs understanding)
    if (context.relevantDecisions.length > 3 || context.relevantConstraints.length > 2) {
      return 'claude_code';
    }

    // Quality issues in area → Claude Code (careful work needed)
    if (context.qualityIssuesInArea.length > 3) {
      return 'claude_code';
    }

    // Everything else → Codex (implementation work)
    return 'codex';
  }

  private findAvailableAgent(type: AgentType): Agent | null {
    const available = Array.from(this.agents.values())
      .filter(a => a.type === type && a.status === 'idle' && !this.isOnCooldown(a));

    if (available.length === 0) return null;

    // Prefer agents with lower utilization (load balancing)
    available.sort((a, b) => a.completedTasks - b.completedTasks);
    return available[0];
  }

  private recordAssignment(
    task: Task,
    agent: Agent,
    context: AssembledContext,
    modelInfo?: { codexModel?: string; codexReasoning?: string; codexPreset?: string }
  ): Agent {
    // Estimate duration based on agent's historical performance
    const estimatedDuration = this.estimateDuration(task, agent);

    agent.status = 'busy';
    agent.currentTask = task.id;
    agent.lastUsed = Date.now();

    this.assignments.set(task.id, {
      taskId: task.id,
      agentId: agent.id,
      assignedAt: Date.now(),
      estimatedDuration,
      codexModel: modelInfo?.codexModel,
      codexReasoning: modelInfo?.codexReasoning,
      codexPreset: modelInfo?.codexPreset,
    });

    const contextSummary: TaskAssignmentEventPayload['contextSummary'] = {
      filesToRead: context.filesToRead?.slice(0, 10),
      relatedTasks: context.relatedTasks?.slice(0, 8).map((related) => related.id),
      qualitySignals: context.qualityIssuesInArea?.slice(0, 5).map((issue) => ({
        dimension: issue.dimension,
        score: issue.score,
      })),
      researchHighlights: context.researchHighlights?.slice(0, 5),
    };

    this.emit('task:assigned', {
      task,
      agent,
      estimatedDuration,
      reasoning: this.getAssignmentReasoning(task, agent, context),
      contextSummary,
    });

    return agent;
  }

  /**
   * Get human-readable reasoning for assignment decision
   */
  private getAssignmentReasoning(task: Task, agent: Agent, context: AssembledContext): string {
    const reasons: string[] = [];

    if (agent.type === 'claude_code') {
      if ((task.estimated_complexity || 5) >= 8) {
        reasons.push('high complexity requires deep reasoning');
      }
      if (task.type === 'epic') {
        reasons.push('epic-level task needs strategic thinking');
      }
      if (context.relevantDecisions.length > 3) {
        reasons.push('many architectural decisions in context');
      }
      if (context.qualityIssuesInArea.length > 3) {
        reasons.push('quality issues require careful work');
      }
    } else {
      reasons.push('well-defined implementation work');
      if ((task.estimated_complexity || 5) < 8) {
        reasons.push('moderate complexity suitable for autonomous execution');
      }
    }

    return reasons.join('; ');
  }

  // ==========================================================================
  // Task Completion
  // ==========================================================================

  completeTask(
    taskId: string,
    success: boolean,
    durationSeconds: number,
    metadata?: {
      failureType?: ExecutionFailureType;
      retryAfterSeconds?: number;
      tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    }
  ): void {
    const assignment = this.assignments.get(taskId);
    if (!assignment) {
      throw new Error(`No assignment found for task ${taskId}`);
    }

    const agent = this.agents.get(assignment.agentId);
    if (!agent) {
      throw new Error(`Agent ${assignment.agentId} not found`);
    }

    // Record usage in limit tracker
    if (metadata?.tokenUsage && success) {
      const providerName = agent.type === 'claude_code' ? 'claude' : 'codex';
      this.limitTracker.recordUsage(
        providerName,
        'default',
        1, // requests
        metadata.tokenUsage.totalTokens
      );
    }

    // Update agent stats
    agent.status = 'idle';
    agent.currentTask = undefined;

    if (success) {
      const previousCompletions = agent.completedTasks;
      const newCompletions = previousCompletions + 1;

      agent.completedTasks = newCompletions;

      const totalDuration = agent.avgDurationSeconds * previousCompletions;
      agent.avgDurationSeconds = (totalDuration + durationSeconds) / newCompletions;
    } else {
      agent.failedTasks++;
      if (metadata?.failureType === 'rate_limit') {
        this.setAgentCooldown(agent, metadata.retryAfterSeconds ?? 300, 'usage_limit');
      } else {
        agent.status = 'failed';  // Temporarily mark as failed

        // Reset after 30 seconds
        setTimeout(() => {
          if (agent.status === 'failed') {
            agent.status = 'idle';
          }
        }, 30000);
      }
    }

    this.assignments.delete(taskId);

    this.emit('task:completed', {
      taskId,
      agentId: agent.id,
      success,
      durationSeconds,
      agent
    });
  }

  // ==========================================================================
  // Duration Estimation
  // ==========================================================================

  private estimateDuration(task: Task, agent: Agent): number {
    // Base estimate from task complexity (1-10 scale → 5-50 minutes)
    const complexity = task.estimated_complexity || 5;
    let baseMinutes = complexity * 5;

    // Adjust based on agent's historical performance
    if (agent.avgDurationSeconds > 0) {
      // Use agent's average as signal
      baseMinutes = (baseMinutes + agent.avgDurationSeconds / 60) / 2;
    }

    // Adjust based on agent type
    if (agent.type === 'claude_code') {
      // Claude Code is slower but more thoughtful
      baseMinutes *= 1.3;
    } else {
      // Codex is faster
      baseMinutes *= 0.8;
    }

    return Math.round(baseMinutes * 60);  // Convert to seconds
  }

  // ==========================================================================
  // Agent Management
  // ==========================================================================

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  getAvailableAgents(): Agent[] {
    return Array.from(this.agents.values()).filter((agent) => agent.status === 'idle' && !this.isOnCooldown(agent));
  }

  getBusyAgents(): Agent[] {
    return Array.from(this.agents.values()).filter(a => a.status === 'busy');
  }

  /**
   * Get Codex-to-Claude ratio (should be ~5:1 for optimal efficiency)
   */
  getUsageRatio(): { codex: number; claude: number; ratio: number } {
    const codexTasks = Array.from(this.agents.values())
      .filter(a => a.type === 'codex')
      .reduce((sum, a) => sum + a.completedTasks, 0);

    const claudeTasks = Array.from(this.agents.values())
      .filter(a => a.type === 'claude_code')
      .reduce((sum, a) => sum + a.completedTasks, 0);

    const ratio = claudeTasks > 0 ? codexTasks / claudeTasks : 0;

    return { codex: codexTasks, claude: claudeTasks, ratio };
  }

  getMetrics(): AgentPoolMetrics {
    const all = this.getAllAgents();
    const busy = this.getBusyAgents();
    const idle = this.getAvailableAgents();

    const totalCompleted = all.reduce((sum, a) => sum + a.completedTasks, 0);
    const totalFailed = all.reduce((sum, a) => sum + a.failedTasks, 0);
    const avgDuration = all.reduce((sum, a) => sum + a.avgDurationSeconds, 0) / all.length;

    const usage = this.getUsageRatio();
    const totalTasks = usage.codex + usage.claude;

    return {
      totalAgents: all.length,
      busyAgents: busy.length,
      idleAgents: idle.length,
      totalTasksCompleted: totalCompleted,
      totalTasksFailed: totalFailed,
      avgTaskDuration: avgDuration,
      claudeUsagePercent: totalTasks > 0 ? (usage.claude / totalTasks) * 100 : 0,
      codexUsagePercent: totalTasks > 0 ? (usage.codex / totalTasks) * 100 : 0
    };
  }

  hasAvailableAgent(type: AgentType): boolean {
    return this.getAvailableAgents().some(agent => agent.type === type);
  }

  /**
   * Get usage estimator for quota checks
   */
  getUsageEstimator(): UsageEstimator {
    return this.usageEstimator;
  }

  /**
   * Get subscription limit tracker
   */
  getLimitTracker(): SubscriptionLimitTracker {
    return this.limitTracker;
  }

  /**
   * Get current quota status
   */
  getQuotaStatus() {
    return this.usageEstimator.getPressureReport();
  }

  /**
   * Stop the agent pool and cleanup
   */
  async stop(): Promise<void> {
    await this.limitTracker.stop();
  }

  // ==========================================================================
  // Agent Execution (Interface with actual CLI tools)
  // ==========================================================================

  private extractUsageMetrics(stdout?: string, stderr?: string): { tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }; costUSD?: number; promptCache?: PromptCacheMetadata } | undefined {
    const combined = [stdout, stderr].filter((segment) => typeof segment === 'string' && segment.trim().length > 0).join('\n');
    if (!combined) {
      return undefined;
    }

    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    let totalTokens: number | undefined;

    const tokenRegex = /(prompt|completion|total|input|output)[ _-]?tokens?(?:\s*(?:[:=]|is|used|were)\s*|\s+)(\d+)/gi;
    for (const match of combined.matchAll(tokenRegex)) {
      const key = match[1]?.toLowerCase();
      const rawValue = Number.parseInt(match[2] ?? '', 10);
      if (!Number.isNaN(rawValue)) {
        if (key === 'prompt' || key === 'input') {
          promptTokens = rawValue;
        } else if (key === 'completion' || key === 'output') {
          completionTokens = rawValue;
        } else if (key === 'total') {
          totalTokens = rawValue;
        }
      }
    }

    // Calculate total if we have prompt and completion but not total
    if (typeof totalTokens !== 'number' && typeof promptTokens === 'number' && typeof completionTokens === 'number') {
      totalTokens = promptTokens + completionTokens;
    }

    let costUSD: number | undefined;
    if (!COST_TRACKING_DISABLED) {
      const costRegexes = [
        /cost(?:\s*usd)?[^0-9]*(\d+\.\d+|\d+)/gi,
        /\$(\d+\.\d+)/g,
      ];

      for (const regex of costRegexes) {
        for (const match of combined.matchAll(regex)) {
          const rawCost = Number.parseFloat(match[1] ?? '');
          if (!Number.isNaN(rawCost)) {
            costUSD = rawCost;
          }
        }
        if (typeof costUSD === 'number') {
          break;
        }
      }
    }

    const hasUsage = typeof promptTokens === 'number'
      || typeof completionTokens === 'number'
      || typeof totalTokens === 'number';

    const promptCache = parsePromptCacheMetadata(combined);

    if (!hasUsage && typeof costUSD !== 'number' && !promptCache) {
      return undefined;
    }

    const result: { tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number }; costUSD?: number; promptCache?: PromptCacheMetadata } = {};

    if (hasUsage) {
      result.tokenUsage = {
        promptTokens: promptTokens ?? 0,
        completionTokens: completionTokens ?? 0,
        totalTokens: totalTokens ?? 0,
      };
    }

    if (!COST_TRACKING_DISABLED && typeof costUSD === 'number') {
      result.costUSD = costUSD;
    }

    if (promptCache) {
      result.promptCache = promptCache;
    }

    return result;
  }

  /** 
   * Execute task with Claude Code
   */
  async executeWithClaudeCode(
    taskId: string,
    prompt: string,
    options: { timeout?: number; workdir?: string } = {}
  ): Promise<ExecutionOutcome> {
    const startTime = Date.now();

    try {
      const result = await execa('claude', ['chat', '--message', prompt], {
        cwd: options.workdir || this.workspaceRoot,
        timeout: options.timeout || 30 * 60 * 1000,  // 30 min default
        encoding: 'utf8'
      });

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const usageMetrics = this.extractUsageMetrics(result.stdout, result.stderr);

      const normalizedOutput = (result.stdout ?? '').replace(/\r\n/g, '\n');
      if (result.exitCode === 0) {
        const validation = this.enforceOutputValidation(taskId, 'claude_code', normalizedOutput);
        if (validation.violation && validation.settings.effectiveMode !== 'disabled') {
          const outputExcerpt = normalizedOutput.trim().slice(0, 2000);
          return {
            success: false,
            output: `output_validation_failed:${validation.message ?? 'output_validation_failed'}\n\n${outputExcerpt}`,
            durationSeconds,
            failureType: 'validation',
          };
        }
      }

      return {
        success: result.exitCode === 0,
        output: result.exitCode === 0 ? normalizedOutput.trim() : normalizedOutput,
        durationSeconds,
        tokenUsage: usageMetrics?.tokenUsage,
        costUSD: usageMetrics?.costUSD,
        promptCache: usageMetrics?.promptCache,
      };
    } catch (error: any) {
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const message = this.normalizeErrorOutput(error);
      const failure = this.detectFailure(message);
      const usageMetrics = this.extractUsageMetrics(error?.stdout, error?.stderr);

      this.emit('agent:error', {
        agentType: 'claude_code',
        taskId,
        error: message,
        failureType: failure?.failureType,
        retryAfterSeconds: failure?.retryAfterSeconds
      });

      return {
        success: false,
        output: message,
        durationSeconds,
        failureType: failure?.failureType,
        retryAfterSeconds: failure?.retryAfterSeconds,
        tokenUsage: usageMetrics?.tokenUsage,
        costUSD: usageMetrics?.costUSD,
        promptCache: usageMetrics?.promptCache,
      };
    }
  }

  /**
   * Execute task with Codex
   */
  async executeWithCodex(
    taskId: string,
    prompt: string,
    options: { timeout?: number; workdir?: string; model?: string; reasoning?: 'minimal' | 'low' | 'medium' | 'high' } = {}
  ): Promise<ExecutionOutcome> {
    const startTime = Date.now();

    try {
      const args = [
        'exec',
        '--full-auto',
        '--sandbox', 'danger-full-access'
      ];

      if (options.model) {
        args.push('--model', options.model);
      }
      if (options.reasoning) {
        args.push('--reasoning', options.reasoning);
      }

      args.push(prompt);

      const result = await execa('codex', args, {
        cwd: options.workdir || this.workspaceRoot,
        timeout: options.timeout || 30 * 60 * 1000,  // 30 min default
        encoding: 'utf8'
      });

      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const usageMetrics = this.extractUsageMetrics(result.stdout, result.stderr);

      const normalizedOutput = (result.stdout ?? '').replace(/\r\n/g, '\n');
      if (result.exitCode === 0) {
        const validation = this.enforceOutputValidation(taskId, 'codex', normalizedOutput);
        if (validation.violation && validation.settings.effectiveMode !== 'disabled') {
          const outputExcerpt = normalizedOutput.trim().slice(0, 2000);
          return {
            success: false,
            output: `output_validation_failed:${validation.message ?? 'output_validation_failed'}\n\n${outputExcerpt}`,
            durationSeconds,
            failureType: 'validation',
          };
        }
      }

      return {
        success: result.exitCode === 0,
        output: result.exitCode === 0 ? normalizedOutput.trim() : normalizedOutput,
        durationSeconds,
        tokenUsage: usageMetrics?.tokenUsage,
        costUSD: usageMetrics?.costUSD,
        promptCache: usageMetrics?.promptCache,
      };
    } catch (error: any) {
      const durationSeconds = Math.floor((Date.now() - startTime) / 1000);
      const message = this.normalizeErrorOutput(error);
      const failure = this.detectFailure(message);
      const usageMetrics = this.extractUsageMetrics(error?.stdout, error?.stderr);

      this.emit('agent:error', {
        agentType: 'codex',
        taskId,
        error: message,
        failureType: failure?.failureType,
        retryAfterSeconds: failure?.retryAfterSeconds
      });

      return {
        success: false,
        output: message,
        durationSeconds,
        failureType: failure?.failureType,
        retryAfterSeconds: failure?.retryAfterSeconds,
        tokenUsage: usageMetrics?.tokenUsage,
        costUSD: usageMetrics?.costUSD,
        promptCache: usageMetrics?.promptCache,
      };
    }
  }

  imposeCooldown(agentId: string, seconds: number, reason: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.setAgentCooldown(agent, seconds, reason);
  }

  private setAgentCooldown(agent: Agent, seconds: number, reason: string): void {
    const cooldownMs = Math.max(5, seconds) * 1000;
    agent.status = 'failed';
    agent.cooldownUntil = Date.now() + cooldownMs;
    this.emit('agent:cooldown', {
      agentId: agent.id,
      agentType: agent.type,
      seconds: Math.round(cooldownMs / 1000),
      reason
    });

    setTimeout(() => {
      if (agent.cooldownUntil && agent.cooldownUntil <= Date.now()) {
        agent.cooldownUntil = undefined;
        agent.status = 'idle';
        this.emit('agent:cooldown_cleared', { agentId: agent.id, agentType: agent.type });
      }
    }, cooldownMs + 100);
  }

  handleRateLimit(taskId: string, retryAfterSeconds: number): void {
    const assignment = this.assignments.get(taskId);
    if (!assignment) return;
    const agent = this.agents.get(assignment.agentId);
    if (!agent) return;

    agent.currentTask = undefined;
    agent.failedTasks++;
    this.setAgentCooldown(agent, retryAfterSeconds, 'usage_limit');
    this.assignments.delete(taskId);
  }

  clearCooldown(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.cooldownUntil = undefined;
    if (agent.status === 'failed') {
      agent.status = 'idle';
    }
    this.emit('agent:cooldown_cleared', { agentId: agent.id, agentType: agent.type });
  }

  private isOnCooldown(agent: Agent): boolean {
    if (!agent.cooldownUntil) return false;
    if (agent.cooldownUntil <= Date.now()) {
      agent.cooldownUntil = undefined;
      if (agent.status === 'failed') {
        agent.status = 'idle';
      }
      return false;
    }
    return true;
  }

  private normalizeErrorOutput(error: any): string {
    if (!error) return 'Unknown failure';
    if (typeof error === 'string') return error;
    if (error.stderr) return String(error.stderr);
    if (error.shortMessage) return String(error.shortMessage);
    if (error.message) return String(error.message);
    return JSON.stringify(error);
  }

  private detectFailure(output: string | undefined): { failureType: ExecutionFailureType; retryAfterSeconds?: number } | undefined {
    if (!output) return undefined;
    const text = output.toLowerCase();

    if (
      text.includes('error sending request') ||
      text.includes('resolve host') ||
      text.includes('name or service not known') ||
      text.includes('getaddrinfo') ||
      text.includes('temporary failure in name resolution') ||
      text.includes('enotfound') ||
      text.includes('econnreset') ||
      text.includes('econnrefused') ||
      text.includes('connection refused') ||
      text.includes('connect econn')
    ) {
      return { failureType: 'network' };
    }

    if (text.includes('rate limit') || text.includes('usage limit') || text.includes('too many requests')) {
      const retryAfterSeconds = this.extractRetryAfter(output);
      return { failureType: 'rate_limit', retryAfterSeconds };
    }

    if (text.includes('maximum context') || text.includes('context length') || text.includes('too long') || text.includes('input is too long')) {
      return { failureType: 'context_limit' };
    }

    return undefined;
  }

  private enforceOutputValidation(
    taskId: string,
    agentType: AgentType,
    rawOutput: string
  ): { settings: OutputValidationSettings; violation: boolean; message?: string; code?: string } {
    const settings = resolveOutputValidationSettings();

    if (
      settings.configuredMode === 'enforce' &&
      settings.effectiveMode !== 'enforce' &&
      !this.outputValidationCanaryWarningLogged
    ) {
      logWarning('Output validation enforcement requested without canary acknowledgement', {
        taskId,
        agentType,
        configuredMode: settings.configuredMode,
      });
      this.outputValidationCanaryWarningLogged = true;
    }

    const shouldValidate = settings.effectiveMode !== 'disabled';
    if (!shouldValidate) {
      return { settings, violation: false };
    }

    const normalized = rawOutput.trim();

    try {
      detectOutputFormat(normalized);
      return { settings, violation: false };
    } catch (error: unknown) {
      const validationError = error instanceof OutputValidationError ? error : undefined;
      const message = validationError
        ? `${validationError.code}: ${validationError.message}`
        : `unexpected_output_validation_error: ${String(error)}`;
      const code = validationError?.code ?? 'unknown';
      logWarning(`${agentType === 'claude_code' ? 'Claude Code' : 'Codex'} output validation failed`, {
        taskId,
        agentType,
        code,
        mode: settings.effectiveMode,
        enforced: shouldValidate,
      });
      this.emit('output:validation_failed', {
        taskId,
        agentType,
        code: validationError?.code,
        message,
        mode: settings.effectiveMode,
        enforced: shouldValidate,
      } satisfies OutputValidationFailureEvent);
      return { settings, violation: true, message, code };
    }
  }

  private extractRetryAfter(output: string): number | undefined {
    const regex = /try again in (?:(\d+)\s*hour[s]?)?(?:\s*(\d+)\s*minute[s]?)?/i;
    const match = output.match(regex);
    if (match) {
      const hours = parseInt(match[1] ?? '0', 10);
      const minutes = parseInt(match[2] ?? '0', 10);
      const seconds = hours * 3600 + minutes * 60;
      if (seconds > 0) return seconds;
    }

    const retryMatch = output.match(/retry after\s*(\d+)\s*second[s]?/i);
    if (retryMatch) {
      const seconds = parseInt(retryMatch[1], 10);
      if (!Number.isNaN(seconds)) return seconds;
    }

    return undefined;
  }
}
