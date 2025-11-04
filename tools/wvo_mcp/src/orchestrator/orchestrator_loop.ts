/**
 * OrchestratorLoop - Main coordination loop for autonomous execution
 *
 * This class provides a single, clean interface for orchestrating all
 * autonomous activities. It replaces the scattered logic in autopilot.sh
 * with a testable, observable TypeScript implementation.
 *
 * Based on architecture refactor Phase 1: Extract Core Loop
 * See: /tmp/architecture_critique_synthesis.md lines 285-329
 *
 * Philosophy:
 * - Single place to understand "what happens next"
 * - Everything else is implementation details (policy, executor, critics)
 * - Emit events for observability
 * - Fail gracefully with detailed telemetry
 */

import { EventEmitter } from 'node:events';

import { logInfo, logWarning, logError } from '../telemetry/logger.js';

import { PolicyEngine, type OrchestratorAction } from './policy_engine.js';
import type { QualityMonitor } from './quality_monitor.js';
import type { StateMachine, Task, RoadmapHealth, TaskStatus } from './state_machine.js';
import type { TaskScheduler, QueueMetrics } from './task_scheduler.js';
import { AdaptiveRoadmap } from './adaptive_roadmap.js';
import { ContextManager } from './context_manager.js';
import { QualityTrendsAnalyzer } from './quality_trends.js';
import { ContextAssembler } from './context_assembler.js';
import { MCPClient } from './mcp_client.js';
import { WorkProcessEnforcer } from './work_process_enforcer.js';
import { MetricsCollector } from '../telemetry/metrics_collector.js';

/**
 * OrchestratorEvent - Events emitted by the orchestrator
 */
export interface OrchestratorEvent {
  timestamp: number;
  type: 'tick' | 'decision' | 'action' | 'error' | 'idle' | 'stopped';
  data?: Record<string, unknown>;
}

/**
 * ExecutionResult - Result of executing an action
 */
export interface ExecutionResult {
  success: boolean;
  action: OrchestratorAction;
  duration: number;
  error?: Error;
  details?: Record<string, unknown>;
}

/**
 * OrchestratorLoopOptions - Configuration options
 */
export interface OrchestratorLoopOptions {
  /**
   * Enable dry-run mode (no actual execution)
   */
  dryRun?: boolean;

  /**
   * Tick interval in milliseconds
   */
  tickInterval?: number;

  /**
   * Minimum tick interval in milliseconds (clamped lower bound for adaptive scheduling)
   */
  minTickInterval?: number;

  /**
   * Maximum tick interval in milliseconds (upper bound for adaptive scheduling)
   */
  maxTickInterval?: number;

  /**
   * Interval to use when the orchestrator is in background monitoring mode.
   * Defaults to the greater of tickInterval * 4 or healthCheckInterval, capped at maxTickInterval.
   */
  monitoringTickInterval?: number;

  /**
   * Maximum interval (ms) between monitoring ticks once the system is considered stable.
   */
  monitoringMaxInterval?: number;

  /**
   * Number of consecutive healthy reviews required before using the maximum monitoring interval.
   */
  monitoringStabilityThreshold?: number;

  /**
   * Ratio (0-1) controlling random jitter added to monitoring intervals to avoid synchronization.
   */
  monitoringJitterRatio?: number;

  /**
   * Maximum consecutive idle ticks (no pending tasks) before the orchestrator enters
   * background monitoring mode. Prevents loop churn while keeping periodic health checks alive.
   */
  maxIdleTicksBeforeStop?: number;

  /**
   * Maximum errors before stopping
   */
  maxErrors?: number;

  /**
   * Error window in milliseconds
   */
  errorWindow?: number;

  /**
   * Enable telemetry events
   */
  enableTelemetry?: boolean;

  /**
   * Interval between mandatory health reviews (ms). Ensures periodic audits even when idle.
   */
  healthCheckInterval?: number;

  /**
   * Debounce window for external wake-up signals (ms). Prevents storm of nudges.
   */
  immediateSignalDebounceMs?: number;

  /**
   * Enable adaptive roadmap extension
   */
  enableAdaptiveRoadmap?: boolean;

  /**
   * Enable context manager for task execution
   */
  enableContextManager?: boolean;

  /**
   * Enable quality trends analysis
   */
  enableQualityTrends?: boolean;

  /**
   * Enable MCP integration for external tools
   */
  enableMCPIntegration?: boolean;

  /**
   * Enable programmatic work process enforcement
   */
  enableWorkProcessEnforcement?: boolean;

  /**
   * Workspace root for file operations
   */
  workspaceRoot?: string;
}

interface HealthSummarySnapshot {
  timestamp: number;
  issues: string[];
  health: RoadmapHealth;
  queue: QueueMetrics;
}

const HEALTH_ISSUE_DEFINITIONS: Record<
  string,
  { title: string; description: string; complexity: number }
> = {
  blocked_without_pending: {
    title: 'Unblock roadmap tasks',
    description:
      'Several tasks remain blocked while no fresh work is entering the queue. Investigate dependencies and clear blockers so new execution can begin.',
    complexity: 3,
  },
  work_ready_during_monitoring: {
    title: 'Resume orchestrator dispatch',
    description:
      'Runnable work appeared while the orchestrator was in monitoring mode. Verify scheduling signals, restart the loop if required, and confirm dispatch resumes.',
    complexity: 2,
  },
  pending_stalled: {
    title: 'Pending work stalled',
    description:
      'Pending items are waiting without progress. Validate prioritisation, ensure prerequisites are complete, and kick off execution.',
    complexity: 2,
  },
  in_progress_stalled: {
    title: 'In-progress tasks stalled',
    description:
      'In-progress items have not advanced within the expected window. Review assignments, collect diagnostics, and reassign or restart agents as needed.',
    complexity: 3,
  },
  review_queue_backlog: {
    title: 'Clear review backlog',
    description:
      'The review queue is saturated. Schedule review passes or auto-review flows to keep the roadmap flowing.',
    complexity: 2,
  },
  heavy_queue_saturated: {
    title: 'Relieve heavy task pressure',
    description:
      'All heavy slots are occupied while additional heavy tasks queue up. Consider reprioritising work or temporarily increasing heavy-task capacity.',
    complexity: 3,
  },
  recent_errors: {
    title: 'Stabilise orchestrator errors',
    description:
      'The orchestrator has encountered repeated errors recently. Collect the failing traces, restart components if necessary, and confirm healthy execution.',
    complexity: 3,
  },
};

const HEALTH_TASK_STATUSES_FOR_RESOLUTION: TaskStatus[] = [
  'pending',
  'needs_review',
  'needs_improvement',
  'blocked',
];

function sanitizeIssueKey(value: string): string {
  return value.replace(/[^a-z0-9:_-]/gi, '_').toLowerCase();
}

function extractIssueKey(issue: string): { key: string; detail?: string } {
  const [rawKey, detail] = issue.split(':', 2);
  return { key: sanitizeIssueKey(rawKey), detail: detail?.trim() || undefined };
}

/**
 * OrchestratorLoop - Main coordination loop
 *
 * Responsibilities:
 * - Decide what to do next (via PolicyEngine)
 * - Execute actions safely
 * - Emit events for observability
 * - Handle errors gracefully
 * - Provide clean start/stop interface
 */
export class OrchestratorLoop extends EventEmitter {
  private readonly policy: PolicyEngine;
  private readonly options: Required<OrchestratorLoopOptions>;
  private running = false;
  private tickCount = 0;
  private errorCount = 0;
  private lastErrors: number[] = [];
  private tickTimer?: NodeJS.Timeout;
  private consecutiveIdleTicks = 0;
  private currentTickInterval: number;
  private lastIdleReason: string | null = null;
  private tickRunning = false;
  private nextTickOverride?: number;
  private mode: 'active' | 'monitoring' = 'active';
  private lastHealthReview = 0;
  private lastActivityAt = Date.now();

  // Intelligence components
  private mcpClient?: MCPClient;
  private workProcessEnforcer?: WorkProcessEnforcer;
  private metricsCollector?: MetricsCollector;
  private adaptiveRoadmap?: AdaptiveRoadmap;
  private contextManager?: ContextManager;
  private qualityTrends?: QualityTrendsAnalyzer;
  private lastRoadmapExtension = 0;
  private readonly ROADMAP_EXTENSION_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private lastImmediateSignal = 0;
  private lastHealthSummary?: HealthSummarySnapshot;
  private monitoringStabilityScore = 0;
  private currentMonitoringInterval!: number;
  private healthReviewAlarm?: NodeJS.Timeout;
  private readonly boundTaskCreated = () => this.requestImmediateTick('task_created');
  private readonly boundTaskTransition = () => this.requestImmediateTick('task_transition');
  private readonly boundQueueUpdated = () => this.requestImmediateTick('queue_update');
  private readonly boundQualityEvaluated = () => this.requestImmediateTick('quality_signal');

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly scheduler: TaskScheduler,
    private readonly qualityMonitor: QualityMonitor,
    options: OrchestratorLoopOptions = {}
  ) {
    super();
    const baseTickInterval = options.tickInterval ?? 30000; // 30 seconds
    const minTickInterval = options.minTickInterval ?? Math.min(5000, baseTickInterval);
    const maxTickInterval = options.maxTickInterval ?? 300000; // 5 minutes cap
    const healthCheckInterval = options.healthCheckInterval ?? 300000; // 5 minutes
    const monitoringTickInterval =
      options.monitoringTickInterval ??
      Math.min(maxTickInterval, Math.max(baseTickInterval * 4, healthCheckInterval));
    const monitoringMaxInterval =
      options.monitoringMaxInterval ??
      Math.min(maxTickInterval, Math.max(healthCheckInterval * 2, monitoringTickInterval * 3));
    const monitoringStabilityThreshold = options.monitoringStabilityThreshold ?? 3;
    const monitoringJitterRatio = Math.min(
      Math.max(options.monitoringJitterRatio ?? 0.12, 0),
      0.4,
    );
    const immediateSignalDebounceMs = options.immediateSignalDebounceMs ?? 1500;

    this.policy = new PolicyEngine(stateMachine, {
      dryRun: options.dryRun,
      criticApprovalRequired: true,
      criticApprovalPatterns: {
        'T12.*': ['modeling_reality_v2', 'data_quality'],
        'T13.*': ['modeling_reality_v2', 'academic_rigor', 'causal'],
        'T-MLR-*': ['modeling_reality_v2', 'academic_rigor'],
        '*': []
      }
    });
    this.options = {
      dryRun: options.dryRun ?? false,
      tickInterval: baseTickInterval,
      minTickInterval,
      maxTickInterval,
      monitoringTickInterval,
      monitoringMaxInterval,
      monitoringStabilityThreshold,
      monitoringJitterRatio,
      maxIdleTicksBeforeStop: options.maxIdleTicksBeforeStop ?? 8,
      maxErrors: options.maxErrors ?? 5,
      errorWindow: options.errorWindow ?? 300000,
      enableTelemetry: options.enableTelemetry ?? true,
      healthCheckInterval,
      immediateSignalDebounceMs,
      enableAdaptiveRoadmap: options.enableAdaptiveRoadmap ?? false,
      enableContextManager: options.enableContextManager ?? false,
      enableQualityTrends: options.enableQualityTrends ?? false,
      enableMCPIntegration: options.enableMCPIntegration ?? false,
      enableWorkProcessEnforcement: options.enableWorkProcessEnforcement ?? false,
      workspaceRoot: options.workspaceRoot ?? process.cwd(),
    };
    this.currentTickInterval = this.clampInterval(this.options.tickInterval);
    this.currentMonitoringInterval = this.clampInterval(this.options.monitoringTickInterval);
    this.monitoringStabilityScore = 0;
    this.lastHealthReview = Date.now();
    this.lastActivityAt = Date.now();

    // Initialize intelligence components based on feature flags
    const workspaceRoot = this.options.workspaceRoot || process.cwd();

    // Initialize MCP client if enabled
    if (this.options.enableMCPIntegration) {
      try {
        this.mcpClient = new MCPClient(workspaceRoot, {
          maxRetries: 3,
          retryDelayMs: 1000,
          timeoutMs: 30000,
          enabled: true
        });
        logInfo('MCPClient initialized for orchestrator integration');
      } catch (error) {
        logError('Failed to initialize MCPClient', { error: String(error) });
      }
    }

    if (this.options.enableAdaptiveRoadmap) {
      try {
        const contextAssembler = new ContextAssembler(
          stateMachine,
          workspaceRoot
        );
        this.adaptiveRoadmap = new AdaptiveRoadmap(
          stateMachine,
          contextAssembler,
          this.mcpClient  // Pass MCP client for external task fetching
        );
        logInfo('AdaptiveRoadmap initialized' + (this.mcpClient ? ' with MCP integration' : ''));
      } catch (error) {
        logError('Failed to initialize AdaptiveRoadmap', { error: String(error) });
      }
    }

    if (this.options.enableContextManager) {
      try {
        this.contextManager = new ContextManager(
          workspaceRoot,
          this.mcpClient  // Pass MCP client for context persistence
        );
        logInfo('ContextManager initialized' + (this.mcpClient ? ' with MCP persistence' : ''));
      } catch (error) {
        logError('Failed to initialize ContextManager', { error: String(error) });
      }
    }

    if (this.options.enableQualityTrends) {
      try {
        this.qualityTrends = new QualityTrendsAnalyzer(
          stateMachine,
          workspaceRoot,
          this.mcpClient  // Pass MCP client for critics integration
        );
        logInfo('QualityTrends initialized' + (this.mcpClient ? ' with MCP critics' : ''));

        // Hook into quality monitor events
        this.qualityMonitor.on('quality:evaluated', async (result: any) => {
          if (this.qualityTrends) {
            await this.qualityTrends.recordScore({
              taskId: result.taskId,
              score: result.score,
              timestamp: Date.now(),
              agentType: result.agentType || 'unknown',
              category: this.categorizeTask(result.task),
              metadata: result.metadata
            });
          }
        });
      } catch (error) {
        logError('Failed to initialize QualityTrends', { error: String(error) });
      }
    }

    // Initialize WorkProcessEnforcer if enabled
    if (this.options.enableWorkProcessEnforcement) {
      try {
        this.workProcessEnforcer = new WorkProcessEnforcer(stateMachine, workspaceRoot, this.metricsCollector);
        logInfo('WorkProcessEnforcer initialized - programmatic process enforcement active');
      } catch (error) {
        logError('Failed to initialize WorkProcessEnforcer', { error: String(error) });
      }
    }

    this.stateMachine.on('task:created', this.boundTaskCreated);
    this.stateMachine.on('task:transition', this.boundTaskTransition);
    this.scheduler.on('queue:updated', this.boundQueueUpdated);
    this.qualityMonitor.on('quality:evaluated', this.boundQualityEvaluated);
  }

  /**
   * Start the orchestrator loop
   */
  async start(): Promise<void> {
    if (this.running) {
      logWarning('OrchestratorLoop already running');
      return;
    }

    logInfo('Starting OrchestratorLoop', {
      dryRun: this.options.dryRun,
      tickInterval: this.options.tickInterval,
    });

    this.running = true;
    this.tickCount = 0;
    this.errorCount = 0;
    this.lastErrors = [];
    this.consecutiveIdleTicks = 0;
    this.currentTickInterval = this.clampInterval(this.options.tickInterval);
    this.lastIdleReason = null;
    this.tickRunning = false;
    this.nextTickOverride = undefined;
    this.mode = 'active';
    this.lastHealthReview = Date.now();
    this.lastActivityAt = Date.now();
    this.lastImmediateSignal = 0;
    this.lastHealthSummary = undefined;
    this.monitoringStabilityScore = 0;
    this.currentMonitoringInterval = this.clampInterval(this.options.monitoringTickInterval);
    this.clearHealthReviewAlarm();

    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = undefined;
    }

    // Start the main loop
    this.scheduleTick();
  }

  /**
   * Stop the orchestrator loop
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logInfo('Stopping OrchestratorLoop', {
      totalTicks: this.tickCount,
      errors: this.errorCount,
    });

    this.running = false;
    this.tickRunning = false;
    this.nextTickOverride = undefined;
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = undefined;
    }
    this.clearHealthReviewAlarm();

    this.emitEvent({
      timestamp: Date.now(),
      type: 'stopped',
      data: {
        totalTicks: this.tickCount,
        errors: this.errorCount,
      },
    });
  }

  /**
   * Execute one tick of the orchestrator loop
   */
  async tick(): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.tickCount++;
    this.tickRunning = true;

    this.emitEvent({
      timestamp: startTime,
      type: 'tick',
      data: { tickNumber: this.tickCount },
    });

    await this.runHealthReviewIfDue(startTime);

    // Run intelligence features
    await this.runIntelligenceFeatures();

    try {
      // 1. Get current system state
      const state = this.policy.getSystemState();

      // 2. Decide what to do
      const decision = await this.policy.decide(state);

      this.emitEvent({
        timestamp: Date.now(),
        type: 'decision',
        data: {
          decision,
          state,
        },
      });

      // 3. Execute the action
      const result = await this.executeAction(decision);

      // 4. Record telemetry
      if (this.options.enableTelemetry) {
        await this.recordTelemetry(decision, result);
      }

      // 5. Track idle state for intelligent backoff
      const idleReason =
        decision.type === 'idle'
          ? decision.reason ?? null
          : decision.type === 'wait'
            ? decision.reason ?? null
            : null;

      if (decision.type === 'idle' || decision.type === 'wait') {
        this.consecutiveIdleTicks++;
        if (idleReason) {
          this.lastIdleReason = idleReason;
        }
        if (this.consecutiveIdleTicks <= 1) {
          this.setCurrentTickInterval(this.options.tickInterval);
        } else {
          const backoffMultiplier = Math.pow(2, this.consecutiveIdleTicks - 1);
          const backoffInterval = this.options.tickInterval * backoffMultiplier;
          this.setCurrentTickInterval(backoffInterval);
        }

        if (
          this.lastIdleReason === 'no_pending_tasks' &&
          this.consecutiveIdleTicks >= this.options.maxIdleTicksBeforeStop
        ) {
          this.enterMonitoringMode(this.lastIdleReason, decision);
        }
      } else {
        // Active work - reset idle counter
        this.consecutiveIdleTicks = 0;
        this.mode = 'active';
        this.setCurrentTickInterval(this.options.tickInterval);
        this.lastIdleReason = null;
        this.lastActivityAt = Date.now();
        this.clearHealthReviewAlarm();
      }

      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.handleError(err);

      return {
        success: false,
        action: { type: 'idle', reason: 'error' },
        duration: Date.now() - startTime,
        error: err,
      };
    } finally {
      // Schedule next tick if still running
      if (this.running) {
        this.scheduleTick();
      }
      this.tickRunning = false;
    }
  }

  /**
   * Execute an orchestrator action
   */
  private async executeAction(action: OrchestratorAction): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      logInfo(`Executing action: ${action.type}`, { action });

      if (this.options.dryRun) {
        logInfo('[DRY-RUN] Would execute action', { action });
        return {
          success: true,
          action,
          duration: Date.now() - startTime,
          details: { dryRun: true },
        };
      }

      // Execute based on action type
      switch (action.type) {
        case 'run_task':
          await this.executeTask(action.task);
          break;

        case 'run_critic':
          await this.executeCritic(action.critic, action.category);
          break;

        case 'restart_worker':
          await this.restartWorker(action.reason);
          break;

        case 'escalate':
          await this.escalateIssue(action.issue, action.severity);
          break;

        case 'wait':
          await this.sleep(action.duration);
          break;

        case 'idle':
          // Nothing to do
          break;

        default:
          logWarning('Unknown action type', { action });
      }

      this.emitEvent({
        timestamp: Date.now(),
        type: 'action',
        data: { action, success: true },
      });

      return {
        success: true,
        action,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logError(`Action execution failed: ${err.message}`, { action, error: err.stack });

      this.emitEvent({
        timestamp: Date.now(),
        type: 'error',
        data: { action, error: err.message },
      });

      return {
        success: false,
        action,
        duration: Date.now() - startTime,
        error: err,
      };
    }
  }

  /**
   * Execute a task
   *
   * This method now integrates with the critic approval policy:
   * - Tasks matching critic patterns (T12.*, T13.*, T-MLR-*) require all critics to pass
   * - If critics are required but not yet evaluated, task remains in in_progress state
   * - Once all required critics pass, task transitions to done
   * - If any required critic fails, task transitions to needs_improvement
   */
  private async executeTask(task: Task): Promise<void> {
    logInfo(`Executing task: ${task.id}`, { task });

    // CRITICAL: Validate work process BEFORE marking as in_progress
    if (this.workProcessEnforcer) {
      try {
        const validation = await this.workProcessEnforcer.validatePhaseSequence(task);
        if (!validation.valid) {
          logError(`Task ${task.id} violates work process - blocking execution`, {
            taskId: task.id,
            violations: validation.violations,
            requiredPhase: validation.requiredPhase,
            actualPhase: validation.actualPhase
          });

          // Reject task that skips phases
          await this.stateMachine.transition(task.id, 'blocked');
          await this.syncTaskStatusToMCP(task.id, 'blocked');

          // Add violation to context as a constraint
          this.stateMachine.addContextEntry({
            entry_type: 'constraint',
            topic: 'work_process_violation',
            content: `Task ${task.id} attempted to skip phases: ${validation.violations.join(', ')}`,
            confidence: 1.0,
            metadata: {
              taskId: task.id,
              violations: validation.violations,
              enforcement: 'blocked'
            }
          });

          return; // Don't execute task that violates process
        }
      } catch (error) {
        logError('WorkProcessEnforcer validation failed', { error: String(error) });
        // FAIL CLOSED: If enforcer fails, don't execute task
        await this.stateMachine.transition(task.id, 'blocked');
        await this.syncTaskStatusToMCP(task.id, 'blocked');
        throw new Error(`Work process enforcement failed: ${error}`);
      }
    }

    // Mark task as in progress
    await this.stateMachine.transition(task.id, 'in_progress');
    await this.syncTaskStatusToMCP(task.id, 'in_progress');

    // CRITICAL: Register task with work process enforcer
    if (this.workProcessEnforcer) {
      try {
        await this.workProcessEnforcer.startCycle(task.id);
        logInfo('Task registered with work process enforcer', {
          taskId: task.id,
          phase: 'STRATEGIZE'
        });
      } catch (error) {
        // If already registered (e.g., retry), log but continue
        if (error instanceof Error && error.message.includes('already in cycle')) {
          logWarning('Task already registered with enforcer', { taskId: task.id });
        } else {
          logError('Failed to register task with enforcer', { error: String(error) });
          // FAIL CLOSED: If we can't register, block the task
          await this.stateMachine.transition(task.id, 'blocked');
          await this.syncTaskStatusToMCP(task.id, 'blocked');
          throw new Error(`Failed to start work cycle: ${error}`);
        }
      }
    }

    // Assemble context if ContextManager is enabled
    let context = null;
    if (this.contextManager) {
      try {
        const complexity = this.assessTaskComplexity(task);
        const contextComplexity = complexity === 'simple' ? 'minimal' :
                                  complexity === 'medium' ? 'detailed' : 'comprehensive';

        context = this.contextManager.assembleContext(task, contextComplexity);

        logInfo('Context assembled for task', {
          taskId: task.id,
          complexity: contextComplexity,
          contextSize: context.contextSize
        });
      } catch (error) {
        logError('Failed to assemble context', { error: String(error) });
        // Continue without context
      }
    }

    // Integrate with actual task executor
    // We use a simple simulation here since the UnifiedOrchestrator handles actual execution
    // In production, this would call UnifiedOrchestrator.executeTask() or use AgentPool
    try {
      // Simulate task complexity assessment
      const complexity = this.assessTaskComplexity(task);

      // Simulate execution time based on complexity
      const executionTime = complexity === 'simple' ? 1000 : complexity === 'medium' ? 2000 : 3000;

      logInfo(`Simulating task execution`, {
        taskId: task.id,
        complexity,
        estimatedTime: executionTime,
        hasContext: !!context
      });

      // Simulate work being done
      await this.sleep(executionTime);

      // Add execution context
      this.stateMachine.addContextEntry({
        entry_type: 'decision',
        topic: 'task_executed',
        content: `Task ${task.id} executed with ${complexity} complexity`,
        confidence: 0.9,
        metadata: {
          taskId: task.id,
          complexity,
          executionTime,
        },
      });
    } catch (error) {
      logError(`Task execution failed: ${task.id}`, {
        error: error instanceof Error ? error.message : String(error),
        taskId: task.id
      });

      // Transition to blocked state on error
      await this.stateMachine.transition(task.id, 'blocked');
      await this.syncTaskStatusToMCP(task.id, 'blocked');
      return;
    }

    // Check critic approval policy before allowing completion
    const requiredCritics = this.policy.getRequiredCritics(task.id);

    if (requiredCritics.length > 0) {
      // Task requires critic approval
      const canComplete = this.policy.canCompleteTask(task.id);

      if (!canComplete) {
        // Check if critics have been evaluated
        const approvalStatus = this.policy.getCriticApprovalStatus(task.id);

        if (!approvalStatus) {
          // Critics haven't been evaluated yet - keep task in progress and escalate for critic run
          logInfo(`Task ${task.id} awaiting critic evaluation`, {
            requiredCritics,
            taskId: task.id,
          });

          this.stateMachine.addContextEntry({
            entry_type: 'decision',
            topic: 'task_pending_critic_approval',
            content: `Task ${task.id} is awaiting evaluation from required critics: ${requiredCritics.join(', ')}`,
            confidence: 0.95,
            metadata: {
              taskId: task.id,
              requiredCritics,
              taskTitle: task.title,
            },
          });

          // Task stays in in_progress state, waiting for critic results
          return;
        } else {
          // Critic evaluation has started but not all critics passed
          const passedCount = approvalStatus.passedCritics.size;
          const failedCritics = Array.from(approvalStatus.failedCritics.entries()).map(
            ([critic, reason]) => `${critic}: ${reason}`
          );

          logInfo(`Task ${task.id} critic approval incomplete`, {
            passedCritics: Array.from(approvalStatus.passedCritics),
            failedCritics,
            requiredCritics,
          });

          // Transition to needs_improvement state to trigger remediation
          await this.stateMachine.transition(
            task.id,
            'needs_improvement',
            {
              critic_approval_status: {
                requiredCritics,
                passedCritics: Array.from(approvalStatus.passedCritics),
                failedCritics: Object.fromEntries(approvalStatus.failedCritics),
              },
            }
          );

          return;
        }
      }

      // All critics have passed - proceed with completion
      logInfo(`Task ${task.id} has passed all required critic approvals`, {
        requiredCritics,
        approvalStatus: this.policy.getCriticApprovalStatus(task.id),
      });
    } else {
      // No critic approval required for this task
      logInfo(`Task ${task.id} has no required critics`, { taskId: task.id });
    }

    // Mark task as completed
    await this.stateMachine.transition(task.id, 'done');
    await this.syncTaskStatusToMCP(task.id, 'done');

    // Run MCP critics on completed work
    await this.runMCPCriticsIfEnabled(task.id);
  }

  /**
   * Execute a critic
   */
  private async executeCritic(critic: string, category?: string): Promise<void> {
    logInfo(`Running critic: ${critic}`, { category });

    // Integrate with QualityMonitor
    try {
      // Get a sample task for evaluation (in production, this would be the actual task)
      const tasks = this.stateMachine.getTasks({ status: ['in_progress'] });
      const task = tasks[0] || {
        id: 'test-task',
        title: 'Test Task',
        status: 'in_progress' as const,
        type: 'task' as const,
      };

      // Run quality evaluation for the critic
      const result = await this.qualityMonitor.evaluate({
        task,
        agentId: 'orchestrator',
        agentType: 'claude_code',
        success: true,
        durationSeconds: 60,
        outputExcerpt: `Running critic ${critic}`,
      });

      // Record result in context
      this.stateMachine.addContextEntry({
        entry_type: 'decision',
        topic: `critic_${critic}`,
        content: `Critic ${critic} evaluation: ${result.status === 'pass' ? 'PASSED' : 'FAILED'}`,
        confidence: 0.8,
        metadata: {
          critic,
          category,
          result: result.status === 'pass',
          issues: result.issues || [],
          score: result.score,
        },
      });

      // Update policy engine with critic result (using task ID from context)
      const taskId = task.id;
      this.policy.recordCriticResult(
        taskId,
        critic,
        result.status === 'pass',
        result.status !== 'pass' ? result.issues.join('; ') : undefined
      );

      if (result.status !== 'pass') {
        logWarning(`Critic ${critic} failed`, {
          critic,
          issues: result.issues,
          score: result.score,
        });
      }
    } catch (error) {
      logError(`Failed to execute critic: ${critic}`, {
        error: error instanceof Error ? error.message : String(error),
        critic,
        category,
      });

      // Record failure (using a generic task ID)
      const tasks = this.stateMachine.getTasks({ status: ['in_progress'] });
      const taskId = tasks[0]?.id || 'unknown-task';
      this.policy.recordCriticResult(
        taskId,
        critic,
        false,
        `Execution error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Restart worker
   */
  private async restartWorker(reason: string): Promise<void> {
    logWarning('Worker restart requested', { reason });

    // Simple subprocess restart simulation
    // In production, this would use WorkerManager or child_process management
    try {
      // Record restart request
      this.stateMachine.addContextEntry({
        entry_type: 'decision',
        topic: 'worker_restart',
        content: `Worker restart initiated: ${reason}`,
        confidence: 1.0,
        metadata: {
          reason,
          timestamp: Date.now(),
        },
      });

      // Simulate worker shutdown
      logInfo('Shutting down worker process', { reason });
      await this.sleep(500);

      // Simulate worker restart
      logInfo('Starting new worker process', { reason });
      await this.sleep(500);

      // Verify worker is healthy
      const healthCheck = await this.checkWorkerHealth();
      if (healthCheck) {
        logInfo('Worker restarted successfully', { reason });
      } else {
        throw new Error('Worker health check failed after restart');
      }
    } catch (error) {
      logError('Worker restart failed', {
        error: error instanceof Error ? error.message : String(error),
        reason,
      });

      // Escalate if worker restart fails
      await this.escalateIssue(`Worker restart failed: ${error instanceof Error ? error.message : String(error)}`, 'high');
    }
  }

  /**
   * Check worker health (simple simulation)
   */
  private async checkWorkerHealth(): Promise<boolean> {
    // Simulate health check - in production would check actual process status
    try {
      // Check if we can communicate with worker
      await this.sleep(100);

      // Simulate health check passing 95% of the time
      return Math.random() > 0.05;
    } catch {
      return false;
    }
  }

  /**
   * Escalate an issue
   */
  private async escalateIssue(issue: string, severity: string): Promise<void> {
    logError(`Escalation requested: ${issue}`, { severity });

    // TODO: Integrate with escalation system
    // For now, just record in state machine
    this.stateMachine.addContextEntry({
      entry_type: 'decision',
      topic: 'escalation',
      content: issue,
      confidence: 1.0,
      metadata: { severity },
    });
  }

  /**
   * Sleep for specified duration
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Assess task complexity based on various factors
   */
  private assessTaskComplexity(task: Task): 'simple' | 'medium' | 'complex' {
    // Assess based on task properties
    let score = 0;

    // Check description length
    if (task.description && task.description.length > 500) score++;
    if (task.description && task.description.length > 1000) score++;

    // Check for specific keywords in title/description
    const content = `${task.title || ''} ${task.description || ''}`.toLowerCase();
    if (content.includes('refactor') || content.includes('architecture')) score += 2;
    if (content.includes('integration') || content.includes('migrate')) score += 2;
    if (content.includes('fix') || content.includes('bug')) score++;
    if (content.includes('test') || content.includes('verify')) score++;
    if (content.includes('implement') || content.includes('feature')) score += 2;

    // Check task metadata if available
    if (task.metadata) {
      if (task.metadata.estimated_complexity) {
        score += Number(task.metadata.estimated_complexity) || 0;
      }
      if (task.metadata.dependencies && Array.isArray(task.metadata.dependencies)) {
        score += task.metadata.dependencies.length;
      }
    }

    // Map score to complexity level
    if (score <= 2) return 'simple';
    if (score <= 5) return 'medium';
    return 'complex';
  }

  private scheduleTick(): void {
    if (!this.running) {
      return;
    }

    const delay = this.determineNextTickDelay();
    const modeSnapshot = this.mode;

    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
    }

    if (modeSnapshot === 'monitoring') {
      logInfo('Orchestrator monitoring cadence', {
        nextTickMs: delay,
        lastIdleReason: this.lastIdleReason,
      });
    } else if (this.consecutiveIdleTicks >= 2 && delay > this.options.tickInterval) {
      logInfo(`Orchestrator idle (${this.consecutiveIdleTicks} ticks), backing off to ${Math.round(delay / 1000)}s`, {
        consecutiveIdle: this.consecutiveIdleTicks,
        nextTickMs: delay,
      });
    }

    this.tickTimer = setTimeout(() => {
      this.tickTimer = undefined;
      void this.tick();
    }, delay);
  }

  private determineNextTickDelay(): number {
    if (typeof this.nextTickOverride === 'number') {
      const override = this.clampInterval(this.nextTickOverride);
      this.nextTickOverride = undefined;
      return override;
    }

    if (this.mode === 'monitoring') {
      const base = this.currentMonitoringInterval;
      const jitterRange = Math.round(base * this.options.monitoringJitterRatio);
      const jitter = jitterRange > 0 ? Math.floor(Math.random() * jitterRange) : 0;
      return this.clampInterval(base + jitter);
    }

    return this.clampInterval(this.currentTickInterval);
  }

  private clampInterval(value: number): number {
    return Math.max(this.options.minTickInterval, Math.min(value, this.options.maxTickInterval));
  }

  /**
   * Categorize a task for quality trends analysis
   */
  private categorizeTask(task: Task | { title?: string; type?: string }): 'code' | 'test' | 'docs' | 'review' | 'other' {
    const title = task.title?.toLowerCase() || '';
    const type = (task as any).type?.toLowerCase() || '';

    if (title.includes('test') || type.includes('test')) {
      return 'test';
    }
    if (title.includes('doc') || title.includes('readme') || type.includes('doc')) {
      return 'docs';
    }
    if (title.includes('review') || title.includes('pr') || type.includes('review')) {
      return 'review';
    }
    if (title.includes('implement') || title.includes('fix') || title.includes('refactor') || type.includes('code')) {
      return 'code';
    }
    return 'other';
  }

  /**
   * Run intelligence features during tick cycle
   */
  private async runIntelligenceFeatures(): Promise<void> {
    try {
      // 1. Check and extend roadmap if needed
      if (this.adaptiveRoadmap) {
        const now = Date.now();
        if (now - this.lastRoadmapExtension > this.ROADMAP_EXTENSION_INTERVAL) {
          const extended = await this.adaptiveRoadmap.checkAndExtend();
          if (extended) {
            logInfo('Roadmap extended with new tasks');
            this.lastRoadmapExtension = now;
          }
        }
      }

      // 2. Check quality trends for degradation
      if (this.qualityTrends) {
        const alerts = await this.qualityTrends.checkForDegradation();
        if (alerts.length > 0) {
          for (const alert of alerts) {
            logWarning('Quality alert', {
              severity: alert.severity,
              message: alert.message,
              suggestions: alert.suggestions
            });
          }
        }
      }

      // 3. Analyze trends periodically
      if (this.qualityTrends && this.tickCount % 10 === 0) {
        const trends = await this.qualityTrends.analyzeTrends('daily');
        logInfo('Quality trends', {
          averageScore: trends.averageScore.toFixed(3),
          trend: trends.trend,
          sampleCount: trends.sampleCount
        });
      }

    } catch (error) {
      logError('Error in intelligence features', { error: String(error) });
      // Don't fail the tick, just log the error
    }
  }

  private setCurrentTickInterval(value: number): void {
    this.currentTickInterval = this.clampInterval(value);
  }

  private requestImmediateTick(reason: string): void {
    if (!this.running) {
      return;
    }

    const now = Date.now();
    if (now - this.lastImmediateSignal < this.options.immediateSignalDebounceMs) {
      return;
    }
    this.lastImmediateSignal = now;
    this.mode = 'active';
    this.lastIdleReason = null;
    this.consecutiveIdleTicks = 0;
    this.setCurrentTickInterval(this.options.minTickInterval);
    this.nextTickOverride = this.options.minTickInterval;

    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = undefined;
    }

    if (this.tickRunning) {
      return;
    }

    this.scheduleTick();
  }

  private updateMonitoringCadence(issuesDetected: boolean): void {
    if (this.mode !== 'monitoring') {
      this.monitoringStabilityScore = 0;
      this.currentMonitoringInterval = this.clampInterval(this.options.monitoringTickInterval);
      return;
    }

    if (issuesDetected) {
      this.monitoringStabilityScore = 0;
      this.currentMonitoringInterval = this.clampInterval(this.options.monitoringTickInterval);
      return;
    }

    const threshold = Math.max(0, this.options.monitoringStabilityThreshold);
    if (threshold > 0 && this.monitoringStabilityScore < threshold) {
      this.monitoringStabilityScore += 1;
    }

    const growthFactor = 1 + this.monitoringStabilityScore;
    const candidate = this.options.monitoringTickInterval * growthFactor;
    const bounded = Math.min(candidate, this.options.monitoringMaxInterval);
    this.currentMonitoringInterval = this.clampInterval(
      Math.max(this.options.monitoringTickInterval, bounded),
    );
  }

  private armHealthReviewAlarm(): void {
    if (this.options.healthCheckInterval <= 0 || !this.running) {
      return;
    }

    this.clearHealthReviewAlarm();

    this.healthReviewAlarm = setTimeout(() => {
      this.healthReviewAlarm = undefined;
      this.requestImmediateTick('health_review_alarm');
    }, this.options.healthCheckInterval);

    this.healthReviewAlarm.unref?.();
  }

  private clearHealthReviewAlarm(): void {
    if (!this.healthReviewAlarm) {
      return;
    }
    clearTimeout(this.healthReviewAlarm);
    this.healthReviewAlarm = undefined;
  }

  /**
   * Handle an error
   */
  private handleError(error: Error): void {
    const now = Date.now();
    this.errorCount++;
    this.lastErrors.push(now);

    // Remove old errors outside the window
    this.lastErrors = this.lastErrors.filter(
      t => now - t < this.options.errorWindow
    );

    logError(`Orchestrator error: ${error.message}`, {
      errorCount: this.errorCount,
      recentErrors: this.lastErrors.length,
      error: error.stack,
    });

    // Stop if too many recent errors
    if (this.lastErrors.length >= this.options.maxErrors) {
      logError(`Too many errors, stopping orchestrator: ${error.message}`, {
        maxErrors: this.options.maxErrors,
        errorWindow: this.options.errorWindow,
        error: error.stack,
      });
      void this.stop();
    }

    this.emitEvent({
      timestamp: now,
      type: 'error',
      data: {
        error: error.message,
        stack: error.stack,
        errorCount: this.errorCount,
        recentErrors: this.lastErrors.length,
      },
    });
  }

  private async runHealthReviewIfDue(now: number): Promise<void> {
    if (!this.shouldRunHealthReview(now)) {
      return;
    }

    try {
      await this.performPeriodicReview(now);
    } catch (error) {
      logWarning('Orchestrator health review failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private shouldRunHealthReview(now: number): boolean {
    if (this.options.healthCheckInterval <= 0) {
      return false;
    }

    if (now - this.lastHealthReview >= this.options.healthCheckInterval) {
      return true;
    }

    const latestError = this.lastErrors[this.lastErrors.length - 1];
    if (
      typeof latestError === 'number' &&
      now - latestError < this.options.errorWindow &&
      now - this.lastHealthReview >= this.options.minTickInterval * 3
    ) {
      return true;
    }

    return false;
  }

  private async performPeriodicReview(now: number): Promise<void> {
    this.lastHealthReview = now;

    try {
      const health = this.stateMachine.getRoadmapHealth();
      const queue = this.scheduler.getQueueMetrics();
      const modeSnapshot = this.mode;
      const issues = this.evaluateHealthSignals(health, queue, now, modeSnapshot);

      // If new work is detected while monitoring, resume active cadence promptly.
      if (
        modeSnapshot === 'monitoring' &&
        (queue.size > 0 || health.pendingTasks > 0 || health.inProgressTasks > 0)
      ) {
        logInfo('Work detected during monitoring; resuming active cadence', {
          queueSize: queue.size,
          pendingTasks: health.pendingTasks,
          inProgressTasks: health.inProgressTasks,
        });
        this.mode = 'active';
        this.consecutiveIdleTicks = 0;
        this.lastIdleReason = null;
        this.setCurrentTickInterval(this.options.tickInterval);
        this.nextTickOverride = this.options.minTickInterval;
      }

      logInfo('Orchestrator periodic review', {
        mode: this.mode,
        queueSize: queue.size,
        pendingTasks: health.pendingTasks,
        inProgressTasks: health.inProgressTasks,
        blockedTasks: health.blockedTasks,
        issues,
      });

      this.emitEvent({
        timestamp: now,
        type: issues.length > 0 ? 'error' : 'idle',
        data: {
          reason: 'health_review',
          issues,
          mode: this.mode,
          queueSize: queue.size,
          pendingTasks: health.pendingTasks,
          inProgressTasks: health.inProgressTasks,
          blockedTasks: health.blockedTasks,
        },
      });

      await this.syncHealthIssueTasks(issues, health, queue, now);

      this.updateMonitoringCadence(issues.length > 0);
      if (this.mode === 'monitoring') {
        this.armHealthReviewAlarm();
      } else {
        this.clearHealthReviewAlarm();
      }

      if (issues.length > 0) {
        try {
          this.stateMachine.addContextEntry({
            entry_type: 'decision',
            topic: 'orchestrator_health_check',
            content: `Periodic review detected: ${issues.join(', ')}`,
            confidence: 0.6,
            metadata: {
              issues,
              mode: this.mode,
              queue: {
                size: queue.size,
                reasonCounts: { ...queue.reasonCounts },
                resource: { ...queue.resource },
              },
              health,
            },
          });
        } catch (error) {
          logWarning('Failed to record health review context entry', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        // Schedule an immediate follow-up tick to address the issues.
        this.requestImmediateTick('health_issue');
      }

      this.lastHealthSummary = {
        timestamp: now,
        issues,
        health,
        queue,
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private evaluateHealthSignals(
    health: RoadmapHealth,
    queue: QueueMetrics,
    now: number,
    modeSnapshot: 'active' | 'monitoring',
  ): string[] {
    const issues: string[] = [];

    if (health.blockedTasks > 0 && health.pendingTasks === 0) {
      issues.push(`blocked_without_pending:${health.blockedTasks}`);
    }

    if (queue.size > 0 && modeSnapshot === 'monitoring') {
      issues.push(`work_ready_during_monitoring:${queue.size}`);
    }

    if (health.pendingTasks > 0 && modeSnapshot === 'monitoring') {
      issues.push(`pending_stalled:${health.pendingTasks}`);
    }

    if (health.inProgressTasks > 0 && now - this.lastActivityAt > this.options.healthCheckInterval) {
      issues.push('in_progress_stalled');
    }

    if (queue.reasonCounts.requires_review > 0 && queue.reasonCounts.requires_review === queue.size) {
      issues.push('review_queue_backlog');
    }

    if (
      queue.resource.activeHeavyTasks >= queue.resource.heavyTaskLimit &&
      queue.resource.queuedHeavyTasks > 0
    ) {
      issues.push('heavy_queue_saturated');
    }

    const recentErrors = this.lastErrors.filter(
      (timestamp) => now - timestamp < this.options.errorWindow,
    );
    if (recentErrors.length > 0) {
      issues.push(`recent_errors:${recentErrors.length}`);
    }

    return issues;
  }

  private buildHealthSnapshot(health: RoadmapHealth, queue: QueueMetrics): {
    health: {
      total: number;
      pending: number;
      inProgress: number;
      blocked: number;
      completionRate: number;
    };
    queue: {
      size: number;
      reasonCounts: QueueMetrics['reasonCounts'];
      resource: QueueMetrics['resource'];
    };
  } {
    return {
      health: {
        total: health.totalTasks,
        pending: health.pendingTasks,
        inProgress: health.inProgressTasks,
        blocked: health.blockedTasks,
        completionRate: Number(health.completionRate.toFixed(3)),
      },
      queue: {
        size: queue.size,
        reasonCounts: { ...queue.reasonCounts },
        resource: { ...queue.resource },
      },
    };
  }

  private async syncHealthIssueTasks(
    issues: string[],
    health: RoadmapHealth,
    queue: QueueMetrics,
    timestamp: number,
  ): Promise<void> {
    if (this.options.dryRun) {
      return;
    }

    try {
      const snapshot = this.buildHealthSnapshot(health, queue);
      const activeKeys = new Set<string>();

      for (const issue of issues) {
        const { key, detail } = extractIssueKey(issue);
        if (!key) {
          continue;
        }
        activeKeys.add(key);
        await this.ensureHealthTask(key, detail, snapshot, timestamp);
      }

      await this.resolveClearedHealthTasks(activeKeys, snapshot, timestamp);
    } catch (error) {
      logWarning('Failed to synchronise orchestrator health tasks', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async ensureHealthTask(
    key: string,
    detail: string | undefined,
    snapshot: ReturnType<typeof this.buildHealthSnapshot>,
    timestamp: number,
  ): Promise<void> {
    const taskId = `orchestrator:health:${key}`;
    const template =
      HEALTH_ISSUE_DEFINITIONS[key] ??
      ({
        title: `Investigate orchestrator issue (${key})`,
        description:
          'Automatically generated follow-up task to investigate an orchestrator health issue. Review logs, confirm routing, and close out once stability is restored.',
        complexity: 2,
      } as const);

    const existing = this.stateMachine.getTask(taskId);
    const existingIssueMeta =
      (existing?.metadata as Record<string, unknown> | undefined)?.orchestrator_health_issue as
        | Record<string, unknown>
        | undefined;
    const firstSeen =
      typeof existingIssueMeta?.first_seen === 'number' ? existingIssueMeta.first_seen : timestamp;

    const baseMetadata = {
      orchestrator_generated: true,
      orchestrator_health_issue: {
        key,
        detail: detail ?? null,
        first_seen: firstSeen,
        last_seen: timestamp,
        snapshot,
      },
    };

    if (!existing) {
      this.stateMachine.createTask({
        id: taskId,
        title: template.title,
        description:
          detail && detail.length > 0
            ? `${template.description}\n\nDetail: ${detail}`
            : template.description,
        type: 'task',
        status: 'pending',
        estimated_complexity: template.complexity,
        metadata: baseMetadata,
      });
      return;
    }

    const nextStatus: TaskStatus = existing.status === 'done' ? 'pending' : existing.status;
    await this.stateMachine.transition(taskId, nextStatus, baseMetadata);
  }

  private async resolveClearedHealthTasks(
    activeKeys: Set<string>,
    snapshot: ReturnType<typeof this.buildHealthSnapshot>,
    timestamp: number,
  ): Promise<void> {
    const candidates = this.stateMachine.getTasks({
      status: HEALTH_TASK_STATUSES_FOR_RESOLUTION,
    });

    for (const task of candidates) {
      if (!task.id.startsWith('orchestrator:health:')) {
        continue;
      }

      const metadata = task.metadata as Record<string, unknown> | undefined;
      const issueMeta = metadata?.orchestrator_health_issue as Record<string, unknown> | undefined;
      if (!issueMeta) {
        continue;
      }

      const keyRaw = issueMeta.key;
      const key = typeof keyRaw === 'string' ? sanitizeIssueKey(keyRaw) : '';
      if (!key || activeKeys.has(key)) {
        continue;
      }

      await this.stateMachine.transition(task.id, 'done', {
        orchestrator_generated: true,
        orchestrator_health_issue: {
          ...issueMeta,
          resolved_at: timestamp,
          snapshot,
        },
      });
      await this.syncTaskStatusToMCP(task.id, 'done');
    }
  }

  /**
   * Emit a telemetry event
   */
  private emitEvent(event: OrchestratorEvent): void {
    if (!this.options.enableTelemetry) {
      return;
    }

    this.emit('event', event);
  }

  /**
   * Record telemetry for an action
   */
  private async recordTelemetry(
    action: OrchestratorAction,
    result: ExecutionResult
  ): Promise<void> {
    try {
      // Record decision in state machine
      this.stateMachine.addContextEntry({
        entry_type: 'decision',
        topic: 'orchestrator_action',
        content: `Action: ${action.type}`,
        confidence: result.success ? 1.0 : 0.0,
        metadata: {
          action,
          result,
        },
      });
    } catch (error) {
      // Don't let telemetry errors crash the orchestrator
      logWarning('Telemetry recording failed', { error });
    }
  }

  /**
   * Get orchestrator status
   */
  getStatus(): {
    running: boolean;
    tickCount: number;
    errorCount: number;
    recentErrors: number;
    consecutiveIdleTicks: number;
    currentTickInterval: number;
    lastIdleReason: string | null;
    mode: 'active' | 'monitoring';
    lastHealthReview: number;
    lastActivityAt: number;
    lastHealthSummary?: HealthSummarySnapshot;
    monitoringStabilityScore: number;
    currentMonitoringInterval: number;
    healthReviewAlarmArmed: boolean;
    config: Required<OrchestratorLoopOptions>;
  } {
    return {
      running: this.running,
      tickCount: this.tickCount,
      errorCount: this.errorCount,
      recentErrors: this.lastErrors.length,
      consecutiveIdleTicks: this.consecutiveIdleTicks,
      currentTickInterval: this.currentTickInterval,
      lastIdleReason: this.lastIdleReason,
      mode: this.mode,
      lastHealthReview: this.lastHealthReview,
      lastActivityAt: this.lastActivityAt,
      lastHealthSummary: this.lastHealthSummary
        ? {
            timestamp: this.lastHealthSummary.timestamp,
            issues: [...this.lastHealthSummary.issues],
            health: { ...this.lastHealthSummary.health },
            queue: {
              ...this.lastHealthSummary.queue,
              reasonCounts: { ...this.lastHealthSummary.queue.reasonCounts },
              heads: {
                requires_review: [...this.lastHealthSummary.queue.heads.requires_review],
                requires_follow_up: [...this.lastHealthSummary.queue.heads.requires_follow_up],
                dependencies_cleared: [...this.lastHealthSummary.queue.heads.dependencies_cleared],
              },
              resource: { ...this.lastHealthSummary.queue.resource },
            },
          }
        : undefined,
      monitoringStabilityScore: this.monitoringStabilityScore,
      currentMonitoringInterval: this.currentMonitoringInterval,
      healthReviewAlarmArmed: Boolean(this.healthReviewAlarm),
      config: this.options,
    };
  }

  /**
   * Check if orchestrator is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Sync task status with MCP server
   */
  private async syncTaskStatusToMCP(taskId: string, status: string): Promise<void> {
    if (!this.mcpClient) {
      return;
    }

    try {
      const response = await this.mcpClient.planUpdate(taskId, status);
      if (response?.success) {
        logInfo('Task status synced to MCP', {
          taskId,
          status,
          message: response.message
        });
      }
    } catch (error) {
      logWarning('Failed to sync task status to MCP', {
        taskId,
        status,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Run MCP critics on completed work
   */
  private async runMCPCriticsIfEnabled(taskId: string): Promise<void> {
    if (!this.qualityTrends || !this.mcpClient) {
      return;
    }

    try {
      const task = this.stateMachine.getTask(taskId);
      if (!task) {
        return;
      }

      // Infer task type from title/description
      const taskType = this.inferTaskType(task);

      // Run MCP critics and record score
      const score = await this.qualityTrends.runMCPCritics(taskId, taskType);

      if (score) {
        logInfo('MCP critics completed for task', {
          taskId,
          score: score.score,
          category: score.category
        });
      }
    } catch (error) {
      logWarning('Failed to run MCP critics', {
        taskId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Infer task type from task title/description
   */
  private inferTaskType(task: Task): string {
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    if (text.includes('test') || text.includes('spec')) return 'test';
    if (text.includes('doc') || text.includes('readme')) return 'docs';
    if (text.includes('review') || text.includes('critic')) return 'review';
    if (text.includes('code') || text.includes('implement')) return 'code';
    if (text.includes('build') || text.includes('compile')) return 'build';

    return 'general';
  }

  private enterMonitoringMode(reason: string | null, decision: OrchestratorAction): void {
    if (this.mode === 'monitoring') {
      return;
    }

    this.emitEvent({
      timestamp: Date.now(),
      type: 'idle',
      data: {
        reason: `${reason ?? 'idle'}_monitoring`,
        consecutiveIdle: this.consecutiveIdleTicks,
      },
    });

    try {
      this.stateMachine.addContextEntry({
        entry_type: 'decision',
        topic: 'orchestrator_sleep',
        content: `Switched orchestrator to monitoring after ${this.consecutiveIdleTicks} idle ticks (${reason ?? 'idle'})`,
        confidence: 1.0,
        metadata: {
          reason: reason ?? 'idle',
          consecutiveIdleTicks: this.consecutiveIdleTicks,
          lastDecision: decision,
        },
      });
    } catch (error) {
      logWarning('Telemetry recording failed for sleep entry', { error });
    }

    this.mode = 'monitoring';
    this.monitoringStabilityScore = 0;
    this.currentMonitoringInterval = this.clampInterval(this.options.monitoringTickInterval);
    this.setCurrentTickInterval(this.options.monitoringTickInterval);
    this.nextTickOverride = this.options.monitoringTickInterval;
    this.armHealthReviewAlarm();

    logInfo('No pending tasks detected; switching to monitoring cadence', {
      consecutiveIdleTicks: this.consecutiveIdleTicks,
      monitoringTickIntervalMs: this.options.monitoringTickInterval,
    });
  }
}
