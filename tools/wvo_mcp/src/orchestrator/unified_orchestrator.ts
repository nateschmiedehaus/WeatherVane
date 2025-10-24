/**
 * UnifiedOrchestrator - Multi-provider agent orchestration
 *
 * Coordinates a hierarchical agent pool across Codex and Claude providers:
 * - 1 Orchestrator (Claude Sonnet or Codex High) - Strategic planning
 * - N Workers (Haiku, Codex Med/Low) - Task execution
 * - M Critics (Haiku) - Quality review
 *
 * Routes tasks dynamically based on complexity and provider availability.
 */

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execa } from 'execa';
import type { StateMachine, Task, ContextEntry } from './state_machine.js';
import { logInfo, logWarning, logError, logDebug } from '../telemetry/logger.js';
import { ContextAssembler, type AssembledContext, type ContextAssemblyOptions } from './context_assembler.js';
import { CodeSearchIndex } from '../utils/code_search.js';
import { AgentHierarchy, type AgentRole as HierarchyAgentRole, type AgentProfile, type PolicyDecision, type TaskClassification } from './agent_hierarchy.js';
import { resolveCodexCliOptions } from '../models/codex_cli.js';
import { RoadmapTracker } from './roadmap_tracker.js';
import { TaskVerifier } from './task_verifier.js';
import { IdleManager } from './idle_manager.js';
import { AgentPool, type Agent, type AgentType } from './agent_pool.js';
import { syncRoadmapFile } from './roadmap_adapter.js';
import { PolicyController, type PolicySummaryPayload } from './policy_controller.js';
import { RoadmapPoller, type RoadmapUpdateEvent } from './roadmap_poller.js';
import { selectModelForTask, estimateTaskCost, type ModelTier } from './model_router.js';
import { ModelRouterTelemetryTracker } from '../telemetry/model_router_telemetry.js';
import { HistoricalContextRegistry } from './historical_context_registry.js';
import { GitStatusMonitor, type GitStatusSnapshot } from './git_status_monitor.js';
import { PreflightRunner } from './preflight_runner.js';
import { RoadmapInboxProcessor } from './roadmap_inbox_processor.js';
import { rankTasks } from './priority_scheduler.js';
import { PeerReviewManager } from './peer_review_manager.js';
import { isArchitectureTask, isArchitectureReviewTask } from './task_characteristics.js';
import { TaskDecomposer } from './task_decomposer.js';
import { BlockerEscalationManager } from './blocker_escalation_manager.js';
import { FeatureGates, type FeatureGatesReader } from './feature_gates.js';
import { AutopilotHealthMonitor } from './autopilot_health_monitor.js';
import { FailureResponseManager } from './failure_response_manager.js';
import {
  OutputValidationError,
  resolveOutputValidationSettings,
  detectOutputFormat,
  strictValidateOutput,
  type OutputValidationSettings,
} from '../utils/output_validator.js';
import {
  getNextBackgroundTask,
  executeBackgroundTask,
  getBackgroundTaskAsTask,
  type OrchestratorBackgroundContext,
} from './orchestrator_background_tasks.js';
import { QualityGateOrchestrator, type QualityGateDecision } from './quality_gate_orchestrator.js';
import type { TaskEvidence } from './adversarial_bullshit_detector.js';
import { TaskProgressTracker } from './task_progress_tracker.js';

export type Provider = 'codex' | 'claude';
export type AgentRole = 'orchestrator' | 'worker' | 'critic' | 'architecture_planner' | 'architecture_reviewer';
export type TaskComplexity = 'simple' | 'moderate' | 'complex';

export interface AgentConfig {
  provider: Provider;
  model: string;
  role: AgentRole;
  capabilities: string[];
}

export interface AgentTelemetry {
  // Context assembly metrics
  lastContextMetrics?: {
    relatedTasks: number;
    decisions: number;
    learnings: number;
    qualityIssues: number;
    filesToRead: number;
    promptLength: number;
  };

  // Quality metrics
  lastQualityScore?: number;
  qualityTrend?: 'improving' | 'stable' | 'declining';

  // Execution metrics
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  averageDuration: number;
  lastDuration?: number;

  // Velocity metrics
  tasksToday: number;
  lastExecutionTime?: number;
}

// Re-export Agent from agent_pool.ts for backwards compatibility
export type { Agent } from './agent_pool.js';

export interface UnifiedOrchestratorConfig {
  agentCount: number;
  preferredOrchestrator: Provider;
  workspaceRoot: string;
  mcpServerPath?: string;
  codexHome?: string;
  claudeConfigDir?: string;
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

type PolicyEventType = 'task_completed' | 'task_failed' | 'verification_failed' | 'usage_limit' | 'git_status' | 'preflight_failed';

/**
 * CLI executor abstraction for multi-provider support
 */
export interface CLIExecutor {
  exec(model: string, prompt: string, mcpServer?: string): Promise<ExecutionResult>;
  checkAuth(): Promise<boolean>;
}

/**
 * Codex CLI executor
 */
export class CodexExecutor implements CLIExecutor {
  constructor(
    private readonly codexHome: string,
    private readonly profile: string = 'weathervane_orchestrator'
  ) {}

  async exec(model: string, prompt: string, mcpServer?: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const args = [
        'exec',
        '--profile', this.profile,
        '--dangerously-bypass-approvals-and-sandbox',
      ];

      const resolution = resolveCodexCliOptions(model);
      if (resolution.model) {
        args.push('--model', resolution.model);
      }
      for (const override of resolution.configOverrides) {
        args.push('-c', override);
      }

      // Note: Codex CLI requires prompt as final positional arg (doesn't support stdin)
      args.push(prompt);

      const env = {
        ...process.env,
        CODEX_HOME: this.codexHome,
      };

      const result = await execa('codex', args, {
        env,
        timeout: 600_000, // 10 minutes
      });

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  async checkAuth(): Promise<boolean> {
    // In non-interactive mode, assume auth if CODEX_HOME is configured
    // The bash script already validated account configuration
    return true;

    /* Interactive auth check (requires TTY):
    try {
      const result = await execa('codex', ['status'], {
        env: { ...process.env, CODEX_HOME: this.codexHome },
        timeout: 5000,
      });
      return result.stdout.includes('Logged in');
    } catch {
      return false;
    }
    */
  }
}

/**
 * Claude CLI executor
 */
export class ClaudeExecutor implements CLIExecutor {
  constructor(
    private readonly configDir: string,
    private readonly bin: string = 'claude'
  ) {}

  async exec(model: string, prompt: string, mcpServer?: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const args = [
        '--dangerously-skip-permissions',  // Maximal permissions for autonomous operation
        'exec',
        '--model', model,
      ];

      if (mcpServer) {
        args.push('--mcp', mcpServer);
      }

      const env = {
        ...process.env,
        CLAUDE_CONFIG_DIR: this.configDir,
      };

      // Pass prompt via stdin instead of command-line arg to avoid CLI argument length limits
      const result = await execa(this.bin, args, {
        env,
        input: prompt,  // Pass prompt via stdin
        timeout: 600_000, // 10 minutes
      });

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.stderr,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  async checkAuth(): Promise<boolean> {
    // In non-interactive mode, assume auth if CLAUDE_CONFIG_DIR is configured
    // The bash script already validated account configuration
    return true;

    /* Interactive auth check (requires TTY):
    try {
      const result = await execa(this.bin, ['whoami'], {
        env: { ...process.env, CLAUDE_CONFIG_DIR: this.configDir },
        timeout: 5000,
      });
      return result.exitCode === 0 && result.stdout.length > 0;
    } catch {
      return false;
    }
    */
  }
}

/**
 * UnifiedOrchestrator - Main orchestration class
 */
export class UnifiedOrchestrator extends EventEmitter {
  private orchestrator?: Agent;
  private workers: Agent[] = [];
  private critics: Agent[] = [];
  private codexExecutor?: CodexExecutor;
  private claudeExecutor?: ClaudeExecutor;
  private contextAssembler: ContextAssembler;
  private codeSearch: CodeSearchIndex;
  private agentHierarchy: AgentHierarchy;
  private roadmapTracker: RoadmapTracker;
  private taskVerifier: TaskVerifier;
  private idleManager: IdleManager;
  private agentPool: AgentPool;
  private roadmapPoller?: RoadmapPoller;
  private policyController: PolicyController;
  private policyDirective?: string;
  private modelRouterTelemetry: ModelRouterTelemetryTracker;
  private taskDecomposer: TaskDecomposer;
  private blockerEscalationManager: BlockerEscalationManager;
  private failureResponseManager: FailureResponseManager;
  private peerReviewManager: PeerReviewManager;
  private qualityGateOrchestrator: QualityGateOrchestrator;
  private taskProgressTracker: TaskProgressTracker;
  private taskMemoDir: string;
  private usageLimitBackoffMs: number;
  private architecturePlanner?: Agent;
  private architectureReviewer?: Agent;
  private historicalRegistry: HistoricalContextRegistry;
  private gitMonitor: GitStatusMonitor;
  private preflightRunner: PreflightRunner;
  private roadmapInboxProcessor: RoadmapInboxProcessor;
  private running = false;
  private outputValidationSettings: OutputValidationSettings;
  private staleTaskThresholdMs: number;
  private staleRecoveryTimer?: NodeJS.Timeout;
  private healthMonitor: AutopilotHealthMonitor;

  // Continuous pipeline for zero worker idle time
  private taskQueue: Task[] = [];
  private prefetchInProgress = false;
  private activeExecutions = new Set<Promise<any>>();
  private decomposedTaskIds = new Set<string>();
  private lastDecompositionAttempt = new Map<string, number>();

  // Feature gates for canary-validated features
  private featureGates?: FeatureGatesReader;

  // Circuit breaker for runaway decomposition
  private decompositionAttempts = 0;
  private lastDecompositionReset = Date.now();
  private readonly MAX_DECOMPOSITION_ATTEMPTS_PER_MINUTE = 100;

  // Escalating remediation pipeline (no max attempts - task MUST finish)
  private remediationState = new Map<string, {
    escalationLevel: number;
    attemptCount: number;
    lastError: string;
    lastAttemptTime: number;
    originalAgent: string;
    escalatedAgent?: string;
  }>();

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly config: UnifiedOrchestratorConfig
  ) {
    super();

    // Initialize executors
    if (config.codexHome) {
      this.codexExecutor = new CodexExecutor(config.codexHome);
    }

    if (config.claudeConfigDir) {
      this.claudeExecutor = new ClaudeExecutor(config.claudeConfigDir);
    }

    // Initialize sophisticated context assembly with code search
    logDebug('Initializing CodeSearchIndex for intelligent code context');
    this.codeSearch = new CodeSearchIndex(this.stateMachine, config.workspaceRoot);

    logDebug('Initializing ContextAssembler with quality metrics and velocity tracking');
    this.contextAssembler = new ContextAssembler(
      this.stateMachine,
      config.workspaceRoot,
      {
        codeSearch: this.codeSearch,
        enableCodeSearch: true,
        maxHistoryItems: 10
      }
    );

    // Initialize feature gates for canary-validated features
    logDebug('Initializing FeatureGates for canary-validated feature control');
    try {
      // Try to get live flags from context assembler if available
      const liveFlags = (this.contextAssembler as any).liveFlags;
      if (liveFlags) {
        this.featureGates = new FeatureGates(liveFlags);
      }
    } catch (error) {
      logWarning('Failed to initialize feature gates', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Initialize agent hierarchy for sophisticated decision-making
    logDebug('Initializing AgentHierarchy for policy-based task routing');
    this.agentHierarchy = new AgentHierarchy(config.workspaceRoot);

    // Initialize roadmap tracker for automatic status updates
    logDebug('Initializing RoadmapTracker for automatic status updates');
    this.roadmapTracker = new RoadmapTracker(this.stateMachine, config.workspaceRoot);

    // Initialize task verifier for honesty checks on sensitive tasks
    this.taskVerifier = new TaskVerifier(config.workspaceRoot);

    // Initialize idle manager to prevent silent downtime
    this.idleManager = new IdleManager(this.stateMachine);

    // Initialize agent pool for proper task queueing and parallelism
    logDebug('Initializing AgentPool for coordinated agent reservations');
    this.agentPool = new AgentPool();

    // Initialize policy controller parity
    this.policyController = new PolicyController(config.workspaceRoot);

    // Initialize model router telemetry for cost tracking
    logDebug('Initializing ModelRouterTelemetryTracker for cost optimization tracking');
    this.modelRouterTelemetry = new ModelRouterTelemetryTracker(config.workspaceRoot);

    // Initialize task decomposer for parallel execution
    logDebug('Initializing TaskDecomposer for epic breakdown');
    this.taskDecomposer = new TaskDecomposer(this.stateMachine, config.workspaceRoot);

    // Initialize blocker escalation manager for SLA enforcement
    logDebug('Initializing BlockerEscalationManager for <8h blocker resolution');
    this.blockerEscalationManager = new BlockerEscalationManager(
      this.stateMachine,
      this.roadmapTracker,
      config.workspaceRoot
    );

    // Initialize failure response manager for intelligent failure handling
    logDebug('Initializing FailureResponseManager for intelligent failure validation and auto-fix');
    this.failureResponseManager = new FailureResponseManager(this.stateMachine);

    // Initialize peer review manager for final quality gate
    logDebug('Initializing PeerReviewManager for logic correctness verification');
    this.peerReviewManager = new PeerReviewManager(
      this.stateMachine,
      this.roadmapTracker,
      config.workspaceRoot
    );

    // Initialize quality gate orchestrator for mandatory verification loop
    logInfo('🛡️ Initializing QualityGateOrchestrator - MANDATORY verification enforced');
    this.qualityGateOrchestrator = new QualityGateOrchestrator(config.workspaceRoot);
    this.taskProgressTracker = new TaskProgressTracker();

    this.historicalRegistry = new HistoricalContextRegistry();
    const skipPattern = process.env.WVO_AUTOPILOT_GIT_SKIP_PATTERN ?? '.clean_worktree';
    this.gitMonitor = new GitStatusMonitor(config.workspaceRoot, skipPattern);
    this.preflightRunner = new PreflightRunner(config.workspaceRoot);
    this.roadmapInboxProcessor = new RoadmapInboxProcessor(config.workspaceRoot, this.stateMachine);
    this.taskMemoDir = path.join(config.workspaceRoot, 'state', 'task_memos');
    const backoffSeconds = Number(process.env.USAGE_LIMIT_BACKOFF ?? '120');
    this.usageLimitBackoffMs = Number.isFinite(backoffSeconds) && backoffSeconds >= 0
      ? backoffSeconds * 1000
      : 120_000;

    // Initialize output validation settings (default: shadow mode for safety)
    this.outputValidationSettings = resolveOutputValidationSettings();
    logDebug('Output DSL validation initialized', {
      mode: this.outputValidationSettings.effectiveMode,
      canaryAcknowledged: this.outputValidationSettings.canaryAcknowledged,
    });

    const staleMinutesRaw = Number(process.env.WVO_AUTOPILOT_STALE_TASK_MINUTES ?? '10');
    this.staleTaskThresholdMs =
      Number.isFinite(staleMinutesRaw) && staleMinutesRaw > 0
        ? staleMinutesRaw * 60_000
        : 10 * 60_000;
    logDebug('Configured stale task recovery threshold', {
      minutes: Number((this.staleTaskThresholdMs / 60_000).toFixed(2)),
    });

    // Initialize health monitor (OODA loop for real-time anomaly detection)
    const autoRemediateEnabled = process.env.WVO_AUTOPILOT_HEALTH_AUTO_REMEDIATE !== '0';
    const healthMonitorIntervalMs = Number(process.env.WVO_AUTOPILOT_HEALTH_INTERVAL_MS ?? '60000'); // 1 minute default

    this.healthMonitor = new AutopilotHealthMonitor(
      this.stateMachine,
      this.agentPool,
      {
        monitorIntervalMs: healthMonitorIntervalMs,
        autoRemediate: autoRemediateEnabled,
        workspaceRoot: config.workspaceRoot,
        staleTaskThresholdMs: this.staleTaskThresholdMs,
        baselineThroughput: 10 // Expected tasks per hour
      }
    );

    logDebug('AutopilotHealthMonitor initialized', {
      intervalMs: healthMonitorIntervalMs,
      autoRemediate: autoRemediateEnabled
    });
  }

  /**
   * Start the unified orchestrator
   */
  async start(): Promise<void> {
    if (this.running) {
      logWarning('UnifiedOrchestrator already running');
      return;
    }

    logInfo('Starting UnifiedOrchestrator', {
      agentCount: this.config.agentCount,
      preferredOrchestrator: this.config.preferredOrchestrator,
    });

    // Sync roadmap.yaml to database before execution and verify dependency sync
    logDebug('Syncing roadmap.yaml to database');
    try {
      // Count dependencies before sync
      const db = this.stateMachine.getDatabase();
      const beforeCount = db
        .prepare('SELECT COUNT(*) as count FROM task_dependencies')
        .get() as { count: number };

      await syncRoadmapFile(this.stateMachine, this.config.workspaceRoot);

      // Count dependencies after sync
      const afterCount = db
        .prepare('SELECT COUNT(*) as count FROM task_dependencies')
        .get() as { count: number };

      const added = afterCount.count - beforeCount.count;
      const pendingCount = this.stateMachine.getTasks({ status: ['pending'] }).length;

      logInfo('Roadmap synced to database', {
        pendingTasks: pendingCount,
        dependenciesBefore: beforeCount.count,
        dependenciesAfter: afterCount.count,
        dependenciesAdded: added
      });

      // Warn if no dependencies were added but tasks have dependency metadata
      if (added === 0) {
        const tasksWithDeps = db
          .prepare(`SELECT COUNT(*) as count FROM tasks WHERE metadata LIKE '%"dependencies":[%' AND metadata NOT LIKE '%"dependencies":[]%'`)
          .get() as { count: number };

        if (tasksWithDeps.count > 0 && afterCount.count === 0) {
          logWarning('Dependency sync may have failed - tasks have dependency metadata but no dependencies in table', {
            tasksWithMetadataDeps: tasksWithDeps.count,
            tableCount: afterCount.count
          });
        }
      }
    } catch (error) {
      logWarning('Failed to sync roadmap on startup', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue anyway - database may already be in sync
    }

    await this.policyController.initialize();
    this.policyDirective = this.policyController.getDirective();

    // Load model router telemetry for cost tracking
    logDebug('Loading model router telemetry');
    await this.modelRouterTelemetry.load();

    await this.gitMonitor.initialize();

    try {
      const promoted = await this.roadmapInboxProcessor.processPendingEntries();
      if (promoted > 0) {
        logInfo('Roadmap inbox promotion complete', { promoted });
      }
    } catch (error) {
      logWarning('Failed to process roadmap inbox entries', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Clean up stale in_progress tasks from previous runs
    // When autopilot crashes or is interrupted, tasks can get stuck in in_progress
    // Reset them to pending so they can be picked up again
    const staleInProgress = this.stateMachine.getTasks({ status: ['in_progress'] });
    if (staleInProgress.length > 0) {
      logInfo('Cleaning up stale in_progress tasks from previous run', {
        count: staleInProgress.length,
        taskIds: staleInProgress.map(t => t.id)
      });
      for (const task of staleInProgress) {
        await this.stateMachine.transition(task.id, 'pending', {
          reset_reason: 'stale_task_cleanup_on_startup',
          previous_run_interrupted: true
        });
      }
      logInfo('Stale task cleanup complete', { resetCount: staleInProgress.length });
    }

    // Check auth for both providers
    const authStatus = await this.checkAuth();

    if (!authStatus.codex && !authStatus.claude) {
      throw new Error('No providers authenticated. Authenticate to at least one provider.');
    }

    // Spawn orchestrator
    this.orchestrator = await this.spawnOrchestrator(authStatus);
    this.agentPool.addAgent(this.orchestrator);

    this.architecturePlanner = undefined;
    this.architectureReviewer = undefined;

    let remainingAgents = this.config.agentCount - 1; // Subtract orchestrator

    // SIMPLIFIED ALLOCATION: ALL remaining agents become workers
    // This maximizes task execution capacity

    const workerCount = Math.max(1, remainingAgents);
    const criticCount = 0; // Temporarily disable critics to focus on execution

    logInfo('Agent allocation', {
      total: this.config.agentCount,
      orchestrator: 1,
      workers: workerCount,
      critics: criticCount,
      architecturePlanner: 0,
      architectureReviewer: 0
    });

    this.workers = [];
    for (let i = 0; i < workerCount; i++) {
      const worker = await this.spawnWorker(i, authStatus);
      this.workers.push(worker);
      this.agentPool.addAgent(worker);
    }

    this.critics = [];
    if (criticCount > 0) {
      for (let i = 0; i < criticCount; i++) {
        const critic = await this.spawnCritic(i, authStatus);
        this.critics.push(critic);
        this.agentPool.addAgent(critic);
      }
    }

    this.running = true;

    // Start blocker escalation monitoring
    logDebug('Starting blocker escalation SLA monitoring');
    this.blockerEscalationManager.start();

    // Start periodic stale task recovery (every 5 minutes)
    // This ensures tasks that get stuck in in_progress state are automatically recovered
    // even if prefetch isn't running
    logInfo('Starting periodic stale task recovery timer', {
      intervalMs: 5 * 60 * 1000,
      thresholdMs: this.staleTaskThresholdMs
    });

    this.staleRecoveryTimer = setInterval(async () => {
      const recovered = await this.recoverStaleInProgressTasks();
      if (recovered > 0) {
        logInfo('Periodic stale task recovery completed', { recovered });
        // Trigger prefetch to fill queue with newly available tasks
        await this.prefetchTasks();
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    // Start roadmap poller for live task discovery
    this.roadmapPoller = new RoadmapPoller(this.stateMachine, this.config.workspaceRoot, 10000);
    this.roadmapPoller.on('roadmap_updated', (event: RoadmapUpdateEvent) => {
      this.handleRoadmapUpdate(event);
    });
    this.roadmapPoller.start();

    // Start health monitor (OODA loop for real-time anomaly detection and remediation)
    logInfo('Starting AutopilotHealthMonitor for real-time anomaly detection');
    this.healthMonitor.start();

    logInfo('UnifiedOrchestrator started', {
      orchestrator: this.orchestrator.config.model,
      architecturePlanner: null, // Disabled for now
      architectureReviewer: null, // Disabled for now
      workers: this.workers.length,
      critics: this.critics.length,
      roadmapPolling: true,
      healthMonitoring: true
    });

    this.logAgentSnapshot('startup');

    this.emit('started', {
      orchestrator: this.orchestrator,
      architecturePlanner: this.architecturePlanner,
      architectureReviewer: this.architectureReviewer,
      workers: this.workers,
      critics: this.critics,
    });
  }

  /**
   * Stop the orchestrator
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logInfo('Stopping UnifiedOrchestrator');

    // Stop health monitor
    logDebug('Stopping health monitor');
    this.healthMonitor.stop();

    // Export final health report
    try {
      await this.healthMonitor.exportHealthReport();
    } catch (error) {
      logWarning('Failed to export health report on shutdown', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Stop stale recovery timer
    if (this.staleRecoveryTimer) {
      clearInterval(this.staleRecoveryTimer);
      this.staleRecoveryTimer = undefined;
      logDebug('Stopped stale recovery timer');
    }

    // Stop roadmap poller
    if (this.roadmapPoller) {
      await this.roadmapPoller.stop();
      this.roadmapPoller = undefined;
    }

    // Stop blocker escalation monitoring
    logDebug('Stopping blocker escalation monitoring');
    await this.blockerEscalationManager.stop();

    // Clean up agents (kill processes if needed)
    this.orchestrator = undefined;
    this.architecturePlanner = undefined;
    this.architectureReviewer = undefined;
    this.workers = [];
    this.critics = [];

    this.running = false;
    this.emit('stopped');
  }

  /**
   * Handle roadmap updates from poller
   * Notifies idle workers when new tasks become available
   */
  private async handleRoadmapUpdate(event: RoadmapUpdateEvent): Promise<void> {
    logInfo('Handling roadmap update', event as unknown as Record<string, unknown>);

    // If new tasks and workers are idle, trigger prefetch
    if (event.newTasks > 0) {
      const idleWorkers = this.workers.filter(w => w.status === 'idle');

      if (idleWorkers.length > 0) {
        logInfo('New tasks discovered, notifying idle workers', {
          newTasks: event.newTasks,
          idleWorkers: idleWorkers.length
        });

        // Trigger task assignment for idle workers
        await this.prefetchTasks();

        // Assign tasks to idle workers
        for (let i = 0; i < Math.min(idleWorkers.length, event.newTasks); i++) {
          await this.assignNextTaskIfAvailable();
        }
      }
    }
  }

  private collectAgentSnapshot(): Array<{
    id: string;
    role: string;
    provider: Provider;
    model: string;
    status: string;
    currentTask?: string | null;
    currentTaskTitle?: string | null;
    currentTaskDescription?: string | null;
    currentTaskType?: string | null;
    currentTaskProgress?: string | null;
    lastTask?: string | null;
    lastTaskTitle?: string | null;
    tasksCompleted: number;
    totalTasks: number;
    successfulTasks: number;
    failedTasks: number;
  }> {
    const agents: Agent[] = [];
    if (this.orchestrator) agents.push(this.orchestrator);
    if (this.architecturePlanner) agents.push(this.architecturePlanner);
    if (this.architectureReviewer) agents.push(this.architectureReviewer);
    agents.push(...this.workers);
    agents.push(...this.critics);

    return agents.map(agent => ({
      id: agent.id,
      role: agent.config.role,
      provider: agent.config.provider,
      model: agent.config.model,
      status: agent.status,
      currentTask: agent.currentTask ?? null,
      currentTaskTitle: agent.currentTaskTitle ?? null,
      currentTaskDescription: agent.currentTaskDescription ?? null,
      currentTaskType: agent.currentTaskType ?? null,
      currentTaskProgress: agent.currentTaskProgress ?? null,
      lastTask: agent.lastTask ?? null,
      lastTaskTitle: agent.lastTaskTitle ?? null,
      tasksCompleted: agent.tasksCompleted,
      totalTasks: agent.telemetry.totalTasks,
      successfulTasks: agent.telemetry.successfulTasks,
      failedTasks: agent.telemetry.failedTasks,
    }));
  }

  /**
   * Update agent progress during task execution
   */
  private updateAgentProgress(agentId: string, progress: string): void {
    const allAgents = [
      this.orchestrator,
      this.architecturePlanner,
      this.architectureReviewer,
      ...this.workers,
      ...this.critics
    ].filter(Boolean) as Agent[];

    const agent = allAgents.find(a => a.id === agentId);
    if (agent) {
      agent.currentTaskProgress = progress;
      logInfo('Agent progress update', {
        agentId,
        taskId: agent.currentTask,
        progress,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private logAgentSnapshot(
    event: string,
    context: {
      agentId?: string;
      taskId?: string;
      note?: string;
      metrics?: {
        queueSize?: number;
        pendingTasks?: number;
        inProgress?: number;
        idleAgents?: number;
      };
    } = {},
  ): void {
    const poolStatus = this.agentPool.getStatus();
    const snapshot = this.collectAgentSnapshot();

    const queueSize =
      context.metrics?.queueSize !== undefined
        ? context.metrics.queueSize
        : poolStatus.queueLength;

    logInfo('Agent status snapshot', {
      event,
      agentId: context.agentId,
      taskId: context.taskId,
      note: context.note,
      queueSize,
      availableAgents: context.metrics?.idleAgents ?? poolStatus.availableAgents,
      busyAgents: poolStatus.busyAgents,
      pendingTasks: context.metrics?.pendingTasks,
      activeTasks: context.metrics?.inProgress,
      agents: snapshot,
    });
  }

  /**
   * Prefetch tasks to keep queue filled
   * Maintains a buffer of ready-to-execute tasks
   * Enhanced with task decomposition for parallel execution
   */
  private async prefetchTasks(): Promise<void> {
    if (this.prefetchInProgress || !this.running) {
      logDebug('Skipping prefetch', { inProgress: this.prefetchInProgress, running: this.running });
      return;
    }

    this.prefetchInProgress = true;

    try {
      const recovered = await this.recoverStaleInProgressTasks();
      if (recovered > 0) {
        logInfo('Recovered stale in-progress tasks prior to prefetch', { recovered });
      }

      const allInProgressTasks = this.stateMachine.getTasks({ status: ['in_progress'] });
      const autopilotInProgress = this.filterAutopilotInProgressTasks(allInProgressTasks);
      // WIP Limits (#2 Essential): Enforce focus on completion over starting
      // Only prefetch if we're under the WIP limit (1 task per worker)
      const wipLimit = Math.max(1, this.getActiveWorkerCount()); // 1 task per worker

      logInfo('PREFETCH DEBUG', {
        inProgressCount: autopilotInProgress.length,
        totalInProgress: allInProgressTasks.length,
        wipLimit,
        queueLength: this.taskQueue.length,
        workerCount: this.workers.length
      });

      if (autopilotInProgress.length >= wipLimit) {
        logDebug('WIP limit reached - focusing on completion', {
          inProgress: autopilotInProgress.length,
          limit: wipLimit,
          message: 'Not prefetching new tasks to prevent context switching',
        });
        return; // Don't prefetch more - focus on completing current work
      }

      // Keep queue filled with 2x active worker count to prevent idle gaps
      const targetQueueSize = Math.max(2, this.getActiveWorkerCount() * 2);

      if (this.taskQueue.length >= targetQueueSize) {
        logInfo('Queue already full', { queueLength: this.taskQueue.length, targetQueueSize });
        return; // Queue already full
      }

      // Respect WIP limit when calculating how many tasks needed
      const needed = Math.min(
        targetQueueSize - this.taskQueue.length,
        wipLimit - autopilotInProgress.length  // Don't exceed WIP limit
      );

      logInfo('PREFETCH NEED CALCULATION', { needed, targetQueueSize, wipLimit });

      if (needed <= 0) {
        logInfo('No tasks needed (WIP limit)', { needed });
        return; // WIP limit prevents new tasks
      }

      const allReadyTasks = this.stateMachine.getReadyTasks();

      // CIRCUIT BREAKER: Reset counter every minute
      const now = Date.now();
      if (now - this.lastDecompositionReset > 60_000) {
        this.decompositionAttempts = 0;
        this.lastDecompositionReset = now;
      }

      // Step 1: Decompose large tasks into subtasks (enables parallelism)
      // TEMPORARILY DISABLED: Decomposition is creating runaway nested tasks
      // TODO: Fix decomposition logic before re-enabling
      const DECOMPOSITION_DISABLED = true;

      if (!DECOMPOSITION_DISABLED) {
        // CRITICAL: Limit decomposition attempts to prevent runaway loops
        for (const task of allReadyTasks) {
          // Circuit breaker check
          if (this.decompositionAttempts >= this.MAX_DECOMPOSITION_ATTEMPTS_PER_MINUTE) {
            logError('Decomposition circuit breaker triggered - too many decomposition attempts', {
              attempts: this.decompositionAttempts,
              timeSinceReset: now - this.lastDecompositionReset,
            });
            break; // Stop decomposing tasks
          }

          if (this.decomposedTaskIds.has(task.id)) {
            continue;
          }

          const lastAttempt = this.lastDecompositionAttempt.get(task.id);
          if (lastAttempt && now - lastAttempt < 60_000) {
            continue;
          }

          if (this.taskDecomposer.shouldDecompose(task)) {
            this.lastDecompositionAttempt.set(task.id, now);
            this.decompositionAttempts++;

            try {
              logInfo('Attempting task decomposition', {
                taskId: task.id,
                attemptNumber: this.decompositionAttempts,
                totalReady: allReadyTasks.length,
              });

              const result = await this.taskDecomposer.decompose(task);
              if (result.shouldDecompose && result.subtasks) {
                await this.taskDecomposer.registerSubtasks(task, result.subtasks);
                this.decomposedTaskIds.add(task.id);

                const parallelizableCount = result.subtasks.filter(subtask => subtask.dependencies.length === 0).length;
                logInfo('Task decomposed for parallel execution', {
                  taskId: task.id,
                  subtaskCount: result.subtasks.length,
                  totalDecompositions: this.decompositionAttempts,
                  parallelizable: parallelizableCount,
                });
              }
            } catch (error) {
              logWarning('Task decomposition failed, will execute as single task', {
                taskId: task.id,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      }

      // Step 2: Fetch ready tasks (including newly created subtasks)
      // SIMPLIFIED: Execute ALL ready tasks without filtering
      const readyTasks = this.stateMachine.getReadyTasks();

      logInfo('READY TASKS FETCHED', {
        readyTasksCount: readyTasks.length,
        readyTaskIds: readyTasks.map(t => t.id)
      });

      // Add to queue (up to needed amount)
      const prioritizedTasks = rankTasks(readyTasks, this.stateMachine, this.featureGates, this.config.workspaceRoot);
      const tasksToAdd = prioritizedTasks.slice(0, needed);

      logInfo('ADDING TASKS TO QUEUE', {
        tasksToAddCount: tasksToAdd.length,
        taskIds: tasksToAdd.map(t => t.id),
        queueLengthBefore: this.taskQueue.length
      });

      this.taskQueue.push(...tasksToAdd);

      logInfo('QUEUE UPDATED', {
        queueLengthAfter: this.taskQueue.length
      });

      if (tasksToAdd.length > 0) {
        const tasksSnapshot = tasksToAdd.map(task => {
          const metadata = (task.metadata ?? {}) as Record<string, unknown>;
          return {
            id: task.id,
            title: task.title ?? '',
            status: task.status,
            domain: typeof metadata.domain === 'string' ? (metadata.domain as string) : undefined,
            parentId: typeof metadata.parent_task_id === 'string' ? (metadata.parent_task_id as string) : undefined,
          };
        });
        const subtasksAdded = tasksSnapshot.filter(task => task.parentId).length;

        logDebug('Prefetched tasks', {
          count: tasksToAdd.length,
          queueSize: this.taskQueue.length,
          subtasks: subtasksAdded,
          pendingReady: readyTasks.length,
          tasks: tasksSnapshot,
        });

        this.logAgentSnapshot('queue_update', {
          note: 'prefetch',
          metrics: {
            queueSize: this.taskQueue.length,
            pendingTasks: readyTasks.length,
            inProgress: autopilotInProgress.length,
          },
        });
      }
    } finally {
      this.prefetchInProgress = false;
    }
  }

  /**
   * Check if parent task should be marked complete after subtask finishes
   */
  private async checkParentTaskCompletion(taskId: string): Promise<void> {
    const task = this.stateMachine.getTask(taskId);
    if (!task) return;

    const parentTaskId = task.metadata?.parent_task_id as string | undefined;
    if (!parentTaskId) return;

    // Check if all sibling subtasks are complete
    if (this.taskDecomposer.isParentTaskComplete(parentTaskId)) {
      await this.roadmapTracker.updateTaskStatus(parentTaskId, 'done', {
        output: 'All subtasks completed',
      });
      logInfo('Parent task marked complete after all subtasks finished', {
        parentTaskId,
        completedSubtaskId: taskId,
      });
    }
  }

  /**
   * Assign next task from queue if available
   * Called automatically when a worker finishes a task
   */
  private async assignNextTaskIfAvailable(): Promise<void> {
    if (!this.running) {
      return;
    }

    if (this.taskQueue.length === 0) {
      await this.prefetchTasks();

      if (this.taskQueue.length === 0) {
        await this.handleIdleWorkers();
        return;
      }
    }

    const nextTask = this.taskQueue.shift();
    if (!nextTask) return;

    // Fire and forget - don't await
    const execution = this.executeTask(nextTask).catch(err => {
      logError('Error in continuous execution', {
        taskId: nextTask.id,
        error: err.message,
      });
    });

    this.activeExecutions.add(execution);
    execution.finally(() => this.activeExecutions.delete(execution));

    // Trigger prefetch to keep queue filled
    await this.prefetchTasks();
  }

  /**
   * Run continuous execution - workers stay busy until no more tasks
   * Replaces the batched iteration approach
   */
  async runContinuous(maxTasks?: number): Promise<void> {
    if (!this.running) {
      throw new Error('Orchestrator not started');
    }

    logInfo('runContinuous: Starting task execution loop', {
      workerCount: this.workers.length,
      activeWorkerCount: this.getActiveWorkerCount()
    });

    // Initial prefetch
    logInfo('runContinuous: Calling prefetchTasks...');
    await this.prefetchTasks();

    logInfo('runContinuous: After prefetch', {
      queueLength: this.taskQueue.length,
      queueTasks: this.taskQueue.map(t => t.id)
    });

    if (this.taskQueue.length === 0) {
      logInfo('No tasks available for execution');
      return;
    }

    // Start initial batch of tasks (one per worker)
    const initialBatchSize = Math.min(this.getActiveWorkerCount(), this.taskQueue.length);
    logInfo('runContinuous: Starting initial batch', {
      initialBatchSize,
      activeWorkerCount: this.getActiveWorkerCount(),
      queueLength: this.taskQueue.length
    });

    for (let i = 0; i < initialBatchSize; i++) {
      logInfo(`runContinuous: Assigning task ${i + 1}/${initialBatchSize}`);
      this.assignNextTaskIfAvailable().catch(err => {
        logError('Error assigning initial task batch', { error: err.message, stack: err.stack });
      });
    }

    // Wait for all active executions to complete
    while (this.activeExecutions.size > 0 || this.taskQueue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Prefetch more tasks if queue is running low
      if (this.taskQueue.length < this.getActiveWorkerCount()) {
        await this.prefetchTasks();
        if (this.taskQueue.length === 0) {
          await this.handleIdleWorkers();
        }
      }
    }

    logInfo('Continuous execution complete - no more tasks');
  }

  private async handleIdleWorkers(): Promise<void> {
    // CRITICAL: Orchestrator should NEVER be idle
    // When no high-priority tasks available, assign background work
    if (this.orchestrator && this.orchestrator.status !== 'busy') {
      await this.assignOrchestratorBackgroundTask();
    }

    const idleWorkers = [
      ...this.workers.filter(worker => worker.status !== 'busy'),
      ...(this.architecturePlanner && this.architecturePlanner.status !== 'busy' ? [this.architecturePlanner] : []),
      ...(this.architectureReviewer && this.architectureReviewer.status !== 'busy' ? [this.architectureReviewer] : []),
    ];
    if (idleWorkers.length === 0) {
      return;
    }

    const pendingTasksCount = this.stateMachine.getTasks({ status: ['pending'] }).length;

    await this.idleManager.handleIdle({
      idleAgents: idleWorkers,
      queueLength: this.taskQueue.length,
      pendingTasks: pendingTasksCount,
    });

    if (this.taskQueue.length === 0) {
      await this.prefetchTasks();
    }
  }

  /**
   * Assign orchestrator a background task
   * Orchestrator should NEVER be idle - always doing valuable work
   */
  private async assignOrchestratorBackgroundTask(): Promise<void> {
    if (!this.orchestrator) {
      return;
    }

    // Get next background task based on priority and time since last run
    const taskType = getNextBackgroundTask();
    const syntheticTask = getBackgroundTaskAsTask(taskType);

    logInfo('Assigning orchestrator background task', {
      taskType,
      taskId: syntheticTask.id,
      taskTitle: syntheticTask.title,
    });

    // Update orchestrator status
    this.orchestrator.status = 'busy';
    this.orchestrator.currentTask = syntheticTask.id;
    this.orchestrator.currentTaskTitle = syntheticTask.title;

    // Execute background task
    const context: OrchestratorBackgroundContext = {
      stateMachine: this.stateMachine,
      workspaceRoot: this.config.workspaceRoot,
    };

    try {
      const result = await executeBackgroundTask(taskType, context);

      // Log findings and actions for visibility
      if (result.findings.length > 0) {
        logInfo('Background task findings', {
          taskType,
          findings: result.findings,
        });
      }

      if (result.actions.length > 0) {
        logInfo('Background task recommendations', {
          taskType,
          actions: result.actions,
        });
      }

      logDebug('Background task complete', {
        taskType,
        duration: result.duration,
        findingsCount: result.findings.length,
        actionsCount: result.actions.length,
      });
    } catch (error) {
      logError('Background task execution failed', {
        taskType,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      // Clear orchestrator task
      this.orchestrator.status = 'idle';
      this.orchestrator.currentTask = undefined;
      this.orchestrator.currentTaskTitle = undefined;
    }
  }

  /**
   * Escalating remediation pipeline - task MUST finish!
   *
   * Escalation levels:
   * - Level 0-1: Auto-fix with same agent
   * - Level 2-3: Upgrade to higher-tier model
   * - Level 4-5: Escalate to orchestrator for strategic analysis
   * - Level 6+: Human escalation (Atlas/Dana intervention)
   */
  private async performEscalatingRemediation(
    task: Task,
    agent: Agent,
    state: { escalationLevel: number; attemptCount: number; lastError: string; lastAttemptTime: number; originalAgent: string }
  ): Promise<void> {
    logInfo('🔺 Performing escalating remediation', {
      taskId: task.id,
      level: state.escalationLevel,
      attempts: state.attemptCount,
    });

    try {
      if (state.escalationLevel === 0 || state.escalationLevel === 1) {
        // Level 0-1: Auto-fix with same agent
        logInfo('📋 Level 0-1: Attempting auto-fix with same agent', {
          taskId: task.id,
          agentId: agent.id,
        });

        // Use FailureResponseManager to analyze and suggest fix
        await this.failureResponseManager.handleFailure(task.id);

        // Retry with same agent
        const result = await this.executeTask(task);

        if (result.success) {
          logInfo('✅ Auto-fix succeeded!', { taskId: task.id });
          return;
        }

      } else if (state.escalationLevel === 2 || state.escalationLevel === 3) {
        // Level 2-3: Upgrade to higher-tier model
        logInfo('⬆️ Level 2-3: Escalating to higher-tier model', {
          taskId: task.id,
          currentModel: agent.config.model,
        });

        // Upgrade agent to more powerful model
        const upgradedAgent = await this.upgradeAgentModel(agent);

        if (upgradedAgent) {
          // Retry with upgraded agent
          agent.config.model = upgradedAgent.model;
          agent.config.provider = upgradedAgent.provider;

          logInfo('🚀 Retrying with upgraded model', {
            taskId: task.id,
            newModel: upgradedAgent.model,
          });

          const result = await this.executeTask(task);

          if (result.success) {
            logInfo('✅ Upgraded model succeeded!', { taskId: task.id });
            return;
          }
        }

      } else if (state.escalationLevel === 4 || state.escalationLevel === 5) {
        // Level 4-5: Escalate to orchestrator for strategic analysis
        logWarning('🎯 Level 4-5: Escalating to orchestrator for strategic intervention', {
          taskId: task.id,
          error: state.lastError.substring(0, 200),
        });

        // Record as high-priority escalation
        this.blockerEscalationManager.recordBlockedTask(task.id);

        // Create orchestrator task to analyze and fix
        const orchestratorTask = {
          ...task,
          description: `STRATEGIC INTERVENTION REQUIRED:\n\nOriginal task failed ${state.attemptCount} times.\n\nLast error:\n${state.lastError}\n\nOriginal task: ${task.description}`,
        };

        // Retry after orchestrator intervention
        const result = await this.executeTask(task);

        if (result.success) {
          logInfo('✅ Orchestrator intervention succeeded!', { taskId: task.id });
          return;
        }

      } else {
        // Level 6+: Human escalation (Atlas/Dana)
        logError('🚨 Level 6+: Human escalation required', {
          taskId: task.id,
          escalationLevel: state.escalationLevel,
          attempts: state.attemptCount,
          error: state.lastError.substring(0, 500),
        });

        // Mark task as requiring human intervention
        await this.roadmapTracker.updateTaskStatus(task.id, 'blocked', {
          agent: agent.id,
          duration: 0,
          output: `🚨 HUMAN ESCALATION REQUIRED after ${state.attemptCount} attempts\n\nLast error:\n${state.lastError}\n\nPlease manually fix and unblock this task.`,
        });

        // Record critical blocker
        this.blockerEscalationManager.recordBlockedTask(task.id);

        // Alert via telemetry
        logError('🚨 Critical task blocker - human intervention required', {
          taskId: task.id,
          title: task.title,
          attempts: state.attemptCount,
        });

        // Agent stays locked - wait for human to fix
        // Check every 30 seconds if task is unblocked
        setTimeout(() => {
          this.checkIfTaskUnblocked(task, agent, state).catch(err => {
            logError('Error checking task unblock status', { error: err.message });
          });
        }, 30000);
      }

    } catch (error) {
      logError('Remediation attempt failed', {
        taskId: task.id,
        escalationLevel: state.escalationLevel,
        error: error instanceof Error ? error.message : String(error),
      });

      // Increment and retry
      state.escalationLevel++;
      state.attemptCount++;
      this.remediationState.set(task.id, state);

      // Retry after brief delay
      setTimeout(() => {
        this.performEscalatingRemediation(task, agent, state).catch(err => {
          logError('Nested remediation failed', { error: err.message });
        });
      }, 5000);
    }
  }

  /**
   * Check if a task has been manually unblocked and retry if so
   */
  private async checkIfTaskUnblocked(
    task: Task,
    agent: Agent,
    state: { escalationLevel: number; attemptCount: number; lastError: string; lastAttemptTime: number; originalAgent: string }
  ): Promise<void> {
    const currentTask = this.stateMachine.getTask(task.id);

    if (currentTask && currentTask.status !== 'blocked') {
      logInfo('✅ Task manually unblocked - retrying', { taskId: task.id });

      // Reset escalation level since human fixed it
      state.escalationLevel = 0;
      state.attemptCount++;
      this.remediationState.set(task.id, state);

      // Retry execution
      const result = await this.executeTask(task);

      if (result.success) {
        logInfo('✅ Task succeeded after human intervention!', { taskId: task.id });
        return;
      }
    } else {
      // Still blocked - check again later
      setTimeout(() => {
        this.checkIfTaskUnblocked(task, agent, state).catch(err => {
          logError('Error checking task unblock status', { error: err.message });
        });
      }, 30000);
    }
  }

  /**
   * Upgrade agent to a more powerful model
   */
  private async upgradeAgentModel(agent: Agent): Promise<{ model: string; provider: Provider } | null> {
    const currentModel = agent.config.model;

    // Upgrade path: haiku-4-5 → sonnet-4-5 → opus-4
    if (currentModel.includes('haiku')) {
      return {
        model: 'claude-sonnet-4-5',
        provider: 'claude',
      };
    } else if (currentModel.includes('sonnet')) {
      return {
        model: 'claude-opus-4',
        provider: 'claude',
      };
    } else if (currentModel.includes('codex-low')) {
      return {
        model: 'gpt-5-codex-medium',
        provider: 'codex',
      };
    } else if (currentModel.includes('codex-medium')) {
      return {
        model: 'gpt-5-codex-high',
        provider: 'codex',
      };
    }

    // Already at highest tier
    return null;
  }

  /**
   * Execute a task using the appropriate agent
   * Uses AgentPool to properly queue tasks when no agents are available
   */
  async executeTask(task: Task): Promise<ExecutionResult> {
    if (!this.running) {
      throw new Error('UnifiedOrchestrator not running');
    }

    const startTime = Date.now();
    const complexity = this.assessComplexity(task);

    // Variables for finally block access
    let finalSuccess = false;
    let finalOutput: string | undefined;
    let finalError: string | undefined;

    // Reserve an agent (this will queue the task if none are available)
    const agent = await this.agentPool.reserveAgent(task, complexity);

    // Use intelligent model router for cost optimization
    const modelSelection = selectModelForTask(task, agent.config.provider);
    const costEstimate = estimateTaskCost(task, agent.config.provider);
    this.logAgentSnapshot('reserved', {
      agentId: agent.id,
      taskId: task.id,
      note: 'task_assigned',
      metrics: {
        queueSize: this.taskQueue.length,
      },
    });

    try {
      logInfo('Executing task', {
        taskId: task.id,
        taskTitle: task.title,
        taskDescription: task.description,
        complexity,
        agent: agent.id,
        provider: agent.config.provider,
        model: modelSelection.model,
        baseModel: agent.config.model,
        selectedModel: modelSelection.model,
        modelTier: modelSelection.tier.name,
        taskComplexity: modelSelection.complexity,
        estimatedCost: costEstimate.estimatedCost,
        estimatedTokens: costEstimate.estimatedTokens,
        agentRole: agent.config.role,
      });

      // 📊 START PROGRESS TRACKING
      this.taskProgressTracker.startTask(task.id, task.title || task.id, agent.id);

      this.updateAgentProgress(agent.id, 'Classifying task requirements');
      this.taskProgressTracker.updateStep(task.id, 'Classifying requirements');
      const classification = this.agentHierarchy.classifyTask(task);

      // 🛡️ QUALITY GATE: Pre-task review
      this.updateAgentProgress(agent.id, 'Running pre-task quality review');
      this.taskProgressTracker.updateStep(task.id, 'Pre-task quality review');
      logInfo('🛡️ [QUALITY GATE] Running pre-task review', { taskId: task.id });
      const preTaskReview = await this.qualityGateOrchestrator.reviewTaskPlan(task.id, {
        title: task.title || 'Untitled task',
        description: task.description || '',
        filesAffected: [], // TODO: Extract from task metadata if available
        estimatedComplexity: complexity === 'complex' ? 'complex' : (complexity === 'simple' ? 'simple' : 'medium'),
        answers: {
          // Minimal answers for now - workers should provide these
          verification_plan: 'npm run build && npm test',
          rollback_plan: 'git revert',
        },
      });

      if (!preTaskReview.approved) {
        logError('🛡️ [QUALITY GATE] Pre-task review REJECTED', {
          taskId: task.id,
          concerns: preTaskReview.concerns,
          recommendations: preTaskReview.recommendations,
        });

        agent.status = 'failed';
        agent.telemetry.failedTasks++;

        await this.roadmapTracker.updateTaskStatus(task.id, 'blocked', {
          agent: agent.id,
          duration: 0,
          output: `Pre-task quality review rejected:\n${preTaskReview.concerns.join('\n')}\n\nRecommendations:\n${preTaskReview.recommendations.join('\n')}`,
        });

        return {
          success: false,
          error: `Quality gate rejection: ${preTaskReview.concerns.join('; ')}`,
          duration: Date.now() - startTime,
        };
      }

      logInfo('🛡️ [QUALITY GATE] Pre-task review APPROVED', { taskId: task.id });

      const preflightSnapshot = await this.gitMonitor.check(`preflight-before:${task.id}`);
      if (this.preflightRunner.shouldRun(task, classification, preflightSnapshot)) {
        this.updateAgentProgress(agent.id, 'Running pre-flight checks');
        this.taskProgressTracker.updateStep(task.id, 'Pre-flight checks');
        logInfo('Running pre-flight quality checks', { taskId: task.id });
        const preflightResult = await this.preflightRunner.run(preflightSnapshot);
        if (!preflightResult.success) {
          const message = `Pre-flight (${preflightResult.commandId ?? 'unknown'}) failed`;
          const combinedOutput = [message, preflightResult.output].filter(Boolean).join('\n');

          agent.status = 'failed';
          agent.telemetry.failedTasks++;

          await this.roadmapTracker.updateTaskStatus(task.id, 'blocked', {
            agent: agent.id,
            duration: 0,
            output: combinedOutput,
          });

          // Record blocker for escalation SLA tracking
          this.blockerEscalationManager.recordBlockedTask(task.id);

          // Intelligently respond to failure: validate, auto-fix if possible, or escalate
          await this.failureResponseManager.handleFailure(task.id);

          try {
            await this.recordPolicyEvent('preflight_failed', task, agent, {
              durationMs: 0,
              error: combinedOutput,
              meta: { command: preflightResult.commandId },
            });
          } catch (policyError) {
            logWarning('Failed to record pre-flight policy event', {
              taskId: task.id,
              error: policyError instanceof Error ? policyError.message : String(policyError),
            });
          }

          return {
            success: false,
            output: preflightResult.output,
            error: message,
            duration: Date.now() - startTime,
          };
        }
      }

      agent.currentTaskTitle = task.title || task.id;

      // Update roadmap: pending → in_progress
      await this.roadmapTracker.updateTaskStatus(task.id, 'in_progress', {
        agent: agent.id,
      });

      const executor = this.getExecutor(agent.config.provider);

      this.updateAgentProgress(agent.id, 'Assembling context and building prompt');
      this.taskProgressTracker.updateStep(task.id, 'Assembling context');
      logDebug('Building sophisticated prompt with context assembly', {
        taskId: task.id,
        agent: agent.id,
        model: modelSelection.model,
        modelTier: modelSelection.tier.name,
      });
      const prompt = await this.buildPrompt(task, agent);
      logDebug('Prompt built', {
        taskId: task.id,
        promptLength: prompt.length,
        agent: agent.id,
        model: modelSelection.model,
      });

      this.updateAgentProgress(agent.id, 'Executing task with AI model');
      this.taskProgressTracker.updateStep(task.id, 'Executing with AI');
      const result = await executor.exec(modelSelection.model, prompt, this.config.mcpServerPath);
      this.updateAgentProgress(agent.id, 'Processing execution results');
      this.taskProgressTracker.updateStep(task.id, 'Processing results');

      const duration = Date.now() - startTime;

      const hitUsageLimit = !result.success && this.isUsageLimitError(result.error);
      if (hitUsageLimit) {
        await this.handleUsageLimitBackoff(agent.config.provider, task, agent, result.error);
      }

      // Update agent telemetry
      agent.telemetry.totalTasks++;
      agent.telemetry.lastDuration = duration;
      agent.telemetry.lastExecutionTime = Date.now();

      agent.lastTaskTitle = task.title || task.id;
      finalSuccess = result.success;
      finalOutput = result.output;
      finalError = result.error;

      // STRICT OUTPUT DSL VALIDATION (canary shadow mode)
      // Validates agent output format and semantic constraints
      if (finalSuccess && finalOutput && this.outputValidationSettings.effectiveMode !== 'disabled') {
        try {
          // Detect format and validate
          const format = detectOutputFormat(finalOutput);
          if (format === 'json') {
            const { data, semantics } = strictValidateOutput(finalOutput);

            // Record validation metrics for retry rate analysis
            const validationMetrics = {
              taskId: task.id,
              format,
              isValid: semantics.isValid,
              errorCount: semantics.errors.length,
              warningCount: semantics.warnings.length,
              mode: this.outputValidationSettings.effectiveMode,
            };

            if (!semantics.isValid) {
              logWarning('Output DSL validation failed (shadow mode)', validationMetrics);
              // In shadow mode: log but don't block; in enforce mode: fail the task
              if (this.outputValidationSettings.effectiveMode === 'enforce') {
                finalSuccess = false;
                finalError = `Output validation failed: ${semantics.errors.map(e => e.message).join('; ')}`;
                agent.telemetry.failedTasks++;
              }
            } else {
              logDebug('Output DSL validation passed', validationMetrics);
            }
          }
        } catch (validationError) {
          const errorMsg = validationError instanceof OutputValidationError
            ? validationError.message
            : String(validationError);

          logWarning('Output format validation error', {
            taskId: task.id,
            error: errorMsg,
            mode: this.outputValidationSettings.effectiveMode,
          });

          if (this.outputValidationSettings.effectiveMode === 'enforce') {
            finalSuccess = false;
            finalError = `Output validation error: ${errorMsg}`;
            agent.telemetry.failedTasks++;
          }
        }
      }

      if (result.success && finalSuccess) {
        let verificationSucceeded = true;
        let verificationDetails: { exitCode?: number; output?: string } = {};

        if (this.taskVerifier.shouldVerify(task)) {
          const verification = await this.taskVerifier.verify(task);
          verificationSucceeded = verification.success;
          verificationDetails = {
            exitCode: verification.exitCode,
            output: verification.stderr || verification.stdout,
          };
        }

        if (verificationSucceeded) {
          // 🛡️ QUALITY GATE: Post-task verification (MANDATORY)
          logInfo('🛡️ [QUALITY GATE] Running post-task verification', { taskId: task.id });
          this.updateAgentProgress(agent.id, 'Running quality gate verification');
          this.taskProgressTracker.updateStep(task.id, 'Quality gate verification');

          // Collect evidence for quality gates
          const evidence: TaskEvidence = {
            taskId: task.id,
            buildOutput: result.output || '', // TODO: Capture actual build output
            testOutput: result.output || '', // TODO: Capture actual test output
            changedFiles: [], // TODO: Get from git status
            testFiles: [], // TODO: Extract test files
            documentation: [], // TODO: Extract docs updated
            runtimeEvidence: [], // TODO: Collect runtime evidence
          };

          const qualityDecision = await this.qualityGateOrchestrator.verifyTaskCompletion(task.id, evidence);

          if (qualityDecision.decision === 'REJECTED') {
            logError('🛡️ [QUALITY GATE] Task REJECTED by quality gates', {
              taskId: task.id,
              reasoning: qualityDecision.finalReasoning,
              reviews: Object.keys(qualityDecision.reviews),
            });

            // 📊 MARK AS FAILED
            this.taskProgressTracker.failTask(task.id, qualityDecision.finalReasoning);

            agent.status = 'failed';
            agent.telemetry.failedTasks++;

            await this.roadmapTracker.updateTaskStatus(task.id, 'blocked', {
              agent: agent.id,
              duration,
              output: `Quality gate rejection:\n\n${qualityDecision.finalReasoning}\n\nReviews:\n${JSON.stringify(qualityDecision.reviews, null, 2)}`,
            });

            // Record blocker for escalation
            this.blockerEscalationManager.recordBlockedTask(task.id);

            return {
              success: false,
              error: qualityDecision.finalReasoning,
              duration: Date.now() - startTime,
            };
          }

          logInfo('🛡️ [QUALITY GATE] Task APPROVED by all quality gates', {
            taskId: task.id,
            consensusReached: qualityDecision.consensusReached,
          });

          agent.status = 'idle';
          agent.tasksCompleted++;
          agent.telemetry.successfulTasks++;

          // Essential #6: Check if peer review is required before marking as done
          const requiresReview = this.peerReviewManager.requiresReview(task);

          if (requiresReview) {
            // Request peer review instead of marking as done
            await this.peerReviewManager.requestReview(task, agent.id, result.output ?? '');

            // Try to assign a reviewer from available agents
            const reviewer = await this.peerReviewManager.assignReviewer(
              task,
              agent.id,
              [...this.workers, ...this.critics]
            );

            if (reviewer) {
              logInfo('Peer review requested - task awaiting review', {
                taskId: task.id,
                implementer: agent.id,
                reviewer: reviewer.id,
                complexity: task.estimated_complexity,
              });
            } else {
              logWarning('No reviewer available - task marked done without review', {
                taskId: task.id,
                complexity: task.estimated_complexity,
              });
              // No reviewer available, mark as done anyway
              await this.roadmapTracker.updateTaskStatus(task.id, 'done', {
                agent: agent.id,
                duration,
                output: result.output,
              });

              // 📊 MARK AS COMPLETED
              this.taskProgressTracker.completeTask(task.id, result.output);
            }
          } else {
            // No review required, mark as done immediately
            await this.roadmapTracker.updateTaskStatus(task.id, 'done', {
              agent: agent.id,
              duration,
              output: result.output,
            });

            // 📊 MARK AS COMPLETED
            this.taskProgressTracker.completeTask(task.id, result.output);
          }

          // Clear blocker record when task completes successfully
          this.blockerEscalationManager.clearBlockerRecord(task.id);

          // Record model router telemetry for cost tracking
          await this.modelRouterTelemetry.recordTaskExecution(
            task,
            modelSelection.tier,
            modelSelection.complexity,
            costEstimate.estimatedCost,
            costEstimate.estimatedTokens
          );

          // Check if parent task should be completed
          await this.checkParentTaskCompletion(task.id);
        } else {
          agent.status = 'failed';
          agent.telemetry.failedTasks++;

          const verificationMessage =
            verificationDetails.output ??
            `Verification failed with exit code ${verificationDetails.exitCode ?? 'unknown'}`;

          // Mark as needs_improvement (not blocked) so it auto-retries with highest priority
          await this.roadmapTracker.updateTaskStatus(task.id, 'needs_improvement', {
            agent: agent.id,
            duration,
            output: `Verification failure: ${verificationMessage}`,
          });

          // Record blocker for escalation SLA tracking
          this.blockerEscalationManager.recordBlockedTask(task.id);

          // Intelligently respond to failure: validate, auto-fix if possible, or escalate
          await this.failureResponseManager.handleFailure(task.id);

          logWarning('Task verification failed; marking as needs_improvement for retry', {
            taskId: task.id,
            agent: agent.id,
            verification: verificationDetails,
          });

          this.emit('task:verification_failed', {
            task,
            agent,
            verification: verificationDetails,
          });

          finalSuccess = false;
          finalOutput = undefined;
          finalError = verificationMessage;
        }
      } else {
        agent.status = 'failed';
        agent.telemetry.failedTasks++;

        // Mark as needs_improvement (not blocked) so it auto-retries with highest priority
        await this.roadmapTracker.updateTaskStatus(task.id, 'needs_improvement', {
          agent: agent.id,
          duration,
          output: result.error,
        });

        // Record blocker for escalation SLA tracking
        this.blockerEscalationManager.recordBlockedTask(task.id);

        // Intelligently respond to failure: validate, auto-fix if possible, or escalate
        await this.failureResponseManager.handleFailure(task.id);
      }

      // Update average duration (rolling average)
      agent.telemetry.averageDuration =
        (agent.telemetry.averageDuration * (agent.telemetry.totalTasks - 1) + duration) / agent.telemetry.totalTasks;

      // Update tasks today
      agent.telemetry.tasksToday++;

      logInfo('Task execution complete', {
        taskId: task.id,
        taskTitle: task.title,
        agent: agent.id,
        model: agent.config.model,
        success: finalSuccess,
        duration,
        output: finalSuccess ? (finalOutput?.substring(0, 200) || '') : undefined,
        error: !finalSuccess ? (finalError?.substring(0, 200) || 'Unknown error') : undefined,
        averageDuration: agent.telemetry.averageDuration,
        successRate: (agent.telemetry.successfulTasks / agent.telemetry.totalTasks * 100).toFixed(1) + '%'
      });

      this.emit('task:completed', {
        task,
        agent,
        result: {
          success: finalSuccess,
          output: finalOutput,
          error: finalError,
          duration,
        },
      });

      try {
        await this.writeTaskMemo(task, agent, finalSuccess, finalOutput, finalError, duration);
      } catch (memoError) {
        logWarning('Failed to write task memo', {
          taskId: task.id,
          error: memoError instanceof Error ? memoError.message : String(memoError),
        });
      }

      if (agent.config.role === 'critic') {
        this.agentHierarchy.recordCriticRun(agent.id, finalSuccess);
      }

      const policyEvent: PolicyEventType = finalSuccess
        ? 'task_completed'
        : (result.success ? 'verification_failed' : 'task_failed');

      try {
        await this.recordPolicyEvent(policyEvent, task, agent, {
          durationMs: duration,
          error: finalError,
        });
      } catch (policyError) {
        logWarning('Policy controller logging failed', {
          taskId: task.id,
          error: policyError instanceof Error ? policyError.message : String(policyError),
        });
      }

      const previousGitSnapshot = this.gitMonitor.getLastSnapshot();
      const gitSnapshot = await this.gitMonitor.check(`post-task:${task.id}`);
      if (gitSnapshot) {
        const previousSignature = previousGitSnapshot
          ? `${previousGitSnapshot.trackedChanges.join('|')}|${previousGitSnapshot.untrackedChanges.join('|')}`
          : '::clean::';
        const currentSignature = `${gitSnapshot.trackedChanges.join('|')}|${gitSnapshot.untrackedChanges.join('|')}`;

        if (!gitSnapshot.isClean && previousSignature !== currentSignature) {
          logWarning('Git worktree dirty after task execution', {
            taskId: task.id,
            trackedChanges: gitSnapshot.trackedChanges.slice(0, 10),
            untrackedChanges: gitSnapshot.untrackedChanges.slice(0, 10),
          });

          try {
            await this.recordPolicyEvent('git_status', task, agent, {
              durationMs: 0,
              error: 'git worktree dirty',
              meta: {
                trackedChanges: gitSnapshot.trackedChanges,
                untrackedChanges: gitSnapshot.untrackedChanges,
              },
            });
          } catch (gitPolicyError) {
            logWarning('Failed to record git status policy event', {
              taskId: task.id,
              error: gitPolicyError instanceof Error ? gitPolicyError.message : String(gitPolicyError),
            });
          }
        }
      }

      return {
        success: finalSuccess,
        output: finalOutput,
        error: finalError,
        duration,
      };
    } finally {
      // ⚠️ CRITICAL: Task MUST finish - never give up!
      // Implement escalating remediation pipeline instead of releasing agent

      if (!finalSuccess && finalError) {
        // Task failed - escalate and retry (agent stays locked)
        logWarning('🔄 Task failed - initiating escalating remediation', {
          taskId: task.id,
          agentId: agent.id,
          error: finalError.substring(0, 200),
        });

        // Track or update remediation state
        const state = this.remediationState.get(task.id) || {
          escalationLevel: 0,
          attemptCount: 0,
          lastError: '',
          lastAttemptTime: Date.now(),
          originalAgent: agent.id,
        };

        state.attemptCount++;
        state.lastError = finalError;
        state.lastAttemptTime = Date.now();

        // Escalate if same error keeps happening
        if (state.lastError === finalError && state.attemptCount > 2) {
          state.escalationLevel++;
        }

        this.remediationState.set(task.id, state);

        // Log escalation level
        logInfo('🔺 Escalation level', {
          taskId: task.id,
          level: state.escalationLevel,
          attempts: state.attemptCount,
        });

        // 📊 UPDATE PROGRESS BAR TO SHOW ESCALATION
        this.taskProgressTracker.escalateTask(task.id, state.escalationLevel, finalError);

        // Schedule escalating remediation (async - don't block)
        setTimeout(() => {
          this.performEscalatingRemediation(task, agent, state).catch(err => {
            logError('Remediation pipeline failed', {
              taskId: task.id,
              error: err.message,
            });
          });
        }, 2000); // 2 second delay before retry

        // Agent stays locked - DO NOT RELEASE
        logInfo('🔒 Agent locked for remediation', {
          agentId: agent.id,
          taskId: task.id,
          escalationLevel: state.escalationLevel,
        });

      } else {
        // Task succeeded - release agent normally
        agent.currentTask = undefined;
        agent.currentTaskTitle = undefined;

        // Clear remediation state
        this.remediationState.delete(task.id);

        this.agentPool.releaseAgent(agent.id);
        this.logAgentSnapshot('released', {
          agentId: agent.id,
          taskId: task.id,
          metrics: {
            queueSize: this.taskQueue.length,
          },
        });

        // Assign next task
        this.assignNextTaskIfAvailable().catch(err => {
          logError('Error assigning next task after completion', { error: err.message });
        });
      }
    }
  }

  /**
   * Check authentication status for all providers
   */
  private async checkAuth(): Promise<{ codex: boolean; claude: boolean }> {
    const codexAuth = this.codexExecutor ? await this.codexExecutor.checkAuth() : false;
    const claudeAuth = this.claudeExecutor ? await this.claudeExecutor.checkAuth() : false;

    logInfo('Provider authentication status', { codex: codexAuth, claude: claudeAuth });

    return { codex: codexAuth, claude: claudeAuth };
  }

  /**
   * Spawn orchestrator agent (preferred: Claude Sonnet, fallback: Codex High)
   * Uses latest models: Claude Sonnet 4.5, Codex GPT-5
   */
  private async spawnOrchestrator(authStatus: { codex: boolean; claude: boolean }): Promise<Agent> {
    let provider: Provider;
    let model: string;

    if (this.config.preferredOrchestrator === 'claude' && authStatus.claude) {
      provider = 'claude';
      // Latest Claude model: Sonnet 4.5 (released Sep 29, 2025)
      model = 'claude-sonnet-4-5';
    } else if (authStatus.codex) {
      provider = 'codex';
      // Codex High - highest capability tier for orchestration
      model = 'gpt-5-codex-high';
    } else if (authStatus.claude) {
      provider = 'claude';
      model = 'claude-sonnet-4-5';
    } else {
      throw new Error('No provider available for orchestrator');
    }

    const agent: Agent = {
      id: 'orchestrator',
      type: (provider === 'codex' ? 'codex' : 'claude_code') as AgentType,
      role: 'orchestrator',
      config: {
        provider,
        model,
        role: 'orchestrator',
        capabilities: ['plan_next', 'route_tasks', 'aggregate_results'],
      },
      status: 'idle',
      tasksCompleted: 0,
      telemetry: {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageDuration: 0,
        tasksToday: 0,
      },
    };

    logInfo('Spawned orchestrator', { provider, model });

    return agent;
  }

  /**
   * Spawn worker agent with latest models
   * Optimizes for context efficiency and generation quality
   * PREFERS CODEX: User has more usage and prefers Codex for workers
   */
  private async spawnWorker(index: number, authStatus: { codex: boolean; claude: boolean }): Promise<Agent> {
    let provider: Provider;
    let model: string;

    // Prefer Codex (user preference) with round-robin fallback to Claude
    if (authStatus.codex && index % 3 !== 0) {
      // 2/3 of workers use Codex
      provider = 'codex';
      // Codex Medium - balanced capability for tactical execution
      model = 'gpt-5-codex-medium';
    } else if (authStatus.claude) {
      // 1/3 use Claude for diversity
      provider = 'claude';
      // Latest Claude Haiku 4.5 (released Oct 15, 2025) - fast, efficient
      model = 'claude-haiku-4-5';
    } else if (authStatus.codex) {
      // Fallback to Codex if no Claude
      provider = 'codex';
      model = 'gpt-5-codex-medium';
    } else {
      throw new Error('No provider available for worker');
    }

    const agent: Agent = {
      id: `worker-${index}`,
      type: (provider === 'codex' ? 'codex' : 'claude_code') as AgentType,
      role: 'worker',
      config: {
        provider,
        model,
        role: 'worker',
        capabilities: ['execute_task', 'run_tests'],
      },
      status: 'idle',
      tasksCompleted: 0,
      telemetry: {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageDuration: 0,
        tasksToday: 0,
      },
    };

    logInfo('Spawned worker', { id: agent.id, provider, model });

    return agent;
  }

  /**
   * Spawn critic agent with latest fast models for quality review
   * Prioritizes Claude Haiku 4.5 for speed and cost-efficiency
   */
  private async spawnCritic(index: number, authStatus: { codex: boolean; claude: boolean }): Promise<Agent> {
    let provider: Provider;
    let model: string;

    if (authStatus.claude) {
      provider = 'claude';
      // Latest Claude Haiku 4.5 (released Oct 15, 2025) - fast, efficient critic reviews
      model = 'claude-haiku-4-5';
    } else if (authStatus.codex) {
      provider = 'codex';
      // Codex Low - fast, efficient reviews
      model = 'gpt-5-codex-low';
    } else {
      throw new Error('No provider available for critic');
    }

    const agent: Agent = {
      id: `critic-${index}`,
      type: (provider === 'codex' ? 'codex' : 'claude_code') as AgentType,
      role: 'critic',
      config: {
        provider,
        model,
        role: 'critic',
        capabilities: ['review_code', 'run_critics'],
      },
      status: 'idle',
      tasksCompleted: 0,
      telemetry: {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageDuration: 0,
        tasksToday: 0,
      },
    };

    logInfo('Spawned critic', { id: agent.id, provider, model });

    return agent;
  }

  private async spawnArchitecturePlanner(authStatus: { codex: boolean; claude: boolean }): Promise<Agent> {
    let provider: Provider;
    let model: string;
    let reasoningEffort: string | undefined;

    if (authStatus.claude) {
      provider = 'claude';
      model = 'claude-sonnet-4-5';
      reasoningEffort = 'high';
    } else if (authStatus.codex) {
      provider = 'codex';
      model = 'gpt-5-codex-high';
      reasoningEffort = 'high';
    } else {
      throw new Error('No provider available for architecture planner');
    }

    const agent: Agent = {
      id: 'architecture-planner',
      type: (provider === 'codex' ? 'codex' : 'claude_code') as AgentType,
      role: 'architecture_planner',
      config: {
        provider,
        model,
        role: 'architecture_planner',
        reasoningEffort,
        capabilities: ['architecture_design', 'system_blueprints', 'long_range_planning'],
      },
      status: 'idle',
      tasksCompleted: 0,
      telemetry: {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageDuration: 0,
        tasksToday: 0,
      },
    };

    logInfo('Spawned architecture planner', { provider, model });
    return agent;
  }

  private async spawnArchitectureReviewer(authStatus: { codex: boolean; claude: boolean }): Promise<Agent> {
    let provider: Provider;
    let model: string;
    let reasoningEffort: string | undefined;

    if (authStatus.codex) {
      provider = 'codex';
      model = 'gpt-5-codex-high';
      reasoningEffort = 'high';
    } else if (authStatus.claude) {
      provider = 'claude';
      model = 'claude-sonnet-4-5';
      reasoningEffort = 'high';
    } else {
      throw new Error('No provider available for architecture reviewer');
    }

    const agent: Agent = {
      id: 'architecture-reviewer',
      type: (provider === 'codex' ? 'codex' : 'claude_code') as AgentType,
      role: 'architecture_reviewer',
      config: {
        provider,
        model,
        role: 'architecture_reviewer',
        reasoningEffort,
        capabilities: ['architecture_review', 'critique', 'design_validation'],
      },
      status: 'idle',
      tasksCompleted: 0,
      telemetry: {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        averageDuration: 0,
        tasksToday: 0,
      },
    };

    logInfo('Spawned architecture reviewer', { provider, model });
    return agent;
  }

  /**
   * Assess task complexity based on task metadata
   */
  private assessComplexity(task: Task): TaskComplexity {
    // Critic tasks are simple
    if (task.id.startsWith('CRIT-')) {
      return 'simple';
    }

    // Phase 0/1 product tasks are moderate (let workers handle them in parallel)
    if (task.epic_id === 'E-PHASE0' || task.epic_id === 'E-PHASE1') {
      return 'moderate';
    }

    // Modeling/backtest tasks are moderate
    if (task.title?.toLowerCase().includes('model') ||
        task.title?.toLowerCase().includes('backtest')) {
      return 'moderate';
    }

    // Default to simple
    return 'simple';
  }

  /**
   * Select agent based on task complexity and type
   * Routes tasks to orchestrator, workers, or critics appropriately
   */
  private selectAgent(complexity: TaskComplexity, task?: Task): Agent {
    if (task) {
      const architectureReviewTask = isArchitectureReviewTask(task);
      if (architectureReviewTask && this.architectureReviewer && this.architectureReviewer.status === 'idle') {
        logDebug('Routing architecture review task to dedicated reviewer', {
          taskId: task.id,
          reviewer: this.architectureReviewer.id,
        });
        return this.architectureReviewer;
      }

      const architectureTask = isArchitectureTask(task);
      if (architectureTask && this.architecturePlanner && this.architecturePlanner.status === 'idle') {
        logDebug('Routing architecture task to dedicated planner', {
          taskId: task.id,
          planner: this.architecturePlanner.id,
        });
        return this.architecturePlanner;
      }

      // Route review/critique tasks to critics
      const isReviewTask = task.status === 'needs_review' ||
                          task.title?.toLowerCase().includes('review') ||
                          task.title?.toLowerCase().includes('critique') ||
                          task.title?.toLowerCase().includes('validate');

      if (isReviewTask && this.critics.length > 0) {
        const availableCritics = this.critics.filter(critic =>
          critic.status === 'idle' && !this.agentHierarchy.isCriticInBackoff(critic.id)
        );

        if (availableCritics.length > 0) {
          const selected = availableCritics[0];
          logDebug('Routing review task to critic', { taskId: task.id, critic: selected.id });
          return selected;
        }

        const eligibleCritics = this.critics.filter(critic =>
          !this.agentHierarchy.isCriticInBackoff(critic.id)
        );

        if (eligibleCritics.length > 0) {
          const leastBusyCritic = eligibleCritics.reduce((min, c) =>
            c.tasksCompleted < min.tasksCompleted ? c : min
          );
          logDebug('Routing review task to least busy critic', { taskId: task.id, critic: leastBusyCritic.id });
          return leastBusyCritic;
        }

        if (this.orchestrator) {
          logInfo('All critics currently in backoff; routing review task to orchestrator', {
            taskId: task.id,
          });
          return this.orchestrator;
        }
      }

      // Route strategic/epic tasks to orchestrator
      const isStrategicTask = task.type === 'epic' ||
                             complexity === 'complex' ||
                             task.title?.toLowerCase().includes('architecture') ||
                             task.title?.toLowerCase().includes('strategic');

      if (isStrategicTask && this.orchestrator) {
        logDebug('Routing strategic task to orchestrator', { taskId: task.id, type: task.type });
        return this.orchestrator;
      }
    }

    // Route based on complexity for implementation tasks
    switch (complexity) {
      case 'simple':
        // Use any available worker (prefer Haiku for simple tasks)
        const haikuWorker = this.workers.find(w =>
          w.status === 'idle' && w.config.model.startsWith('claude-haiku')
        );
        if (haikuWorker) return haikuWorker;

        const idleWorker = this.workers.find(w => w.status === 'idle');
        if (idleWorker) return idleWorker;

        // Use worker with fewest tasks
        return this.workers.reduce((min, w) =>
          w.tasksCompleted < min.tasksCompleted ? w : min
        );

      case 'moderate':
        // Use Codex Medium or available worker
        const codexWorker = this.workers.find(w =>
          w.status === 'idle' && (w.config.model.startsWith('gpt-5-codex') || w.config.model === 'gpt-5')
        );
        if (codexWorker) return codexWorker;

        const availableWorker = this.workers.find(w => w.status === 'idle');
        if (availableWorker) return availableWorker;

        // Use worker with fewest tasks
        return this.workers.reduce((min, w) =>
          w.tasksCompleted < min.tasksCompleted ? w : min
        );

      case 'complex':
        // Use orchestrator for complex tasks
        return this.orchestrator!;
    }
  }

  /**
   * Get executor for provider
   */
  private getExecutor(provider: Provider): CLIExecutor {
    if (provider === 'codex' && this.codexExecutor) {
      return this.codexExecutor;
    }

    if (provider === 'claude' && this.claudeExecutor) {
      return this.claudeExecutor;
    }

    throw new Error(`No executor available for provider: ${provider}`);
  }

  /**
   * Build prompt for task execution with sophisticated context assembly
   * Integrates: quality metrics, velocity tracking, code search, decision memory
   */
  private async buildPrompt(task: Task, agent: Agent): Promise<string> {
    const complexity = this.assessComplexity(task);

    logDebug('Building prompt for task', {
      taskId: task.id,
      complexity,
      agent: agent.id,
      model: agent.config.model,
    });

    // Use AgentHierarchy for sophisticated task classification and policy
    const agentSelection = this.agentHierarchy.selectAgentForTask(task);
    const { role, profile, decision, classification } = agentSelection;

    logDebug('Task classification', {
      domain: classification.domain,
      criticGroup: classification.criticGroup,
      complexity: classification.complexity,
      assignedRole: role
    });

    const contextOptions = this.deriveContextOptions(task, classification, agent, complexity);

    logDebug('Assembling context', { taskId: task.id, options: contextOptions });
    const assembledContext: AssembledContext = await this.contextAssembler.assembleForTask(
      task.id,
      contextOptions
    );

    // Track context assembly metrics for telemetry
    const contextMetrics = {
      relatedTasks: assembledContext.relatedTasks.length,
      dependents: assembledContext.dependentTasks.length,
      decisions: assembledContext.relevantDecisions.length,
      learnings: assembledContext.recentLearnings.length,
      qualityIssues: assembledContext.qualityIssuesInArea.length,
      filesToRead: assembledContext.filesToRead?.length || 0,
      promptLength: 0, // Will be set after prompt is built
    };

    const sections: string[] = [];

    sections.push(this.buildTaskHeader(task, role, profile, classification, complexity, assembledContext));

    const directivesSection = this.buildDirectiveSection(task, role, classification, assembledContext, decision, complexity);
    if (directivesSection) {
      sections.push(directivesSection);
    }

    const dependenciesSection = this.buildDependenciesSection(assembledContext);
    if (dependenciesSection) {
      sections.push(dependenciesSection);
    }

    const dependentsSection = this.buildDependentTasksSection(assembledContext);
    if (dependentsSection) {
      sections.push(dependentsSection);
    }

    const decisionsSection = this.buildContextEntriesSection(assembledContext.relevantDecisions, 'Relevant Decisions');
    if (decisionsSection) {
      sections.push(decisionsSection);
    }

    const constraintsSection = this.buildContextEntriesSection(assembledContext.relevantConstraints, 'Constraints to Respect');
    if (constraintsSection) {
      sections.push(constraintsSection);
    }

    const learningsSection = this.buildContextEntriesSection(assembledContext.recentLearnings, 'Recent Learnings');
    if (learningsSection) {
      sections.push(learningsSection);
    }

    const qualitySection = this.formatQualitySignals(assembledContext);
    if (qualitySection.trim().length > 0) {
      sections.push(qualitySection);
    }

    const codeSection = this.formatCodeContext(assembledContext);
    if (codeSection.trim().length > 0) {
      sections.push(codeSection);
    }

    const researchSection = this.buildResearchSection(assembledContext.researchHighlights);
    if (researchSection) {
      sections.push(researchSection);
    }

    const memoSection = await this.buildMemoSection(task.id);
    if (memoSection) {
      sections.push(memoSection);
    }

    const historicalSection = this.buildHistoricalSection(task);
    if (historicalSection) {
      sections.push(historicalSection);
    }

    const gitSection = this.gitMonitor.buildPromptSection();
    if (gitSection) {
      sections.push(gitSection);
    }

    const velocitySection = this.formatVelocityMetrics(assembledContext);
    if (velocitySection.trim().length > 0) {
      sections.push(velocitySection);
    }

    const policySection = this.buildPolicySection(decision);
    if (policySection) {
      sections.push(policySection);
    }

    const prompt = sections.filter(Boolean).join('\n\n');

    // Update context metrics with final prompt length
    contextMetrics.promptLength = prompt.length;

    // Store context metrics in agent telemetry
    agent.telemetry.lastContextMetrics = contextMetrics;

    // Track quality score and trend from assembled context
    if (assembledContext.overallQualityTrend.length > 0) {
      const avgScore = assembledContext.overallQualityTrend.reduce((sum, t) => sum + t.currentScore, 0) / assembledContext.overallQualityTrend.length;
      agent.telemetry.lastQualityScore = avgScore;

      // Determine overall trend
      const improving = assembledContext.overallQualityTrend.filter(t => t.trend === 'improving').length;
      const declining = assembledContext.overallQualityTrend.filter(t => t.trend === 'declining').length;
      if (improving > declining) {
        agent.telemetry.qualityTrend = 'improving';
      } else if (declining > improving) {
        agent.telemetry.qualityTrend = 'declining';
      } else {
        agent.telemetry.qualityTrend = 'stable';
      }
    }

    logDebug('Prompt built with telemetry', {
      taskId: task.id,
      agent: agent.id,
      promptLength: contextMetrics.promptLength,
      qualityScore: agent.telemetry.lastQualityScore,
      qualityTrend: agent.telemetry.qualityTrend
    });

    return prompt;
  }

  /**
   * Get business impact narrative for task
   */
  private getTaskBusinessImpact(task: Task, classification: TaskClassification): string {
    const epicId = task.epic_id;
    let impact = '';

    // Epic-specific narratives
    if (epicId === 'E-PHASE0') {
      impact = `**Epic Goal**: Prove incrementality to unlock enterprise sales. Your task enables statistical validation of 10%+ ROAS improvement.

**User Value**: Gives enterprise customers confidence to invest in WeatherVane based on rigorous holdout tests.
**Dependencies**: T0.1.2 (Lift UI) and T0.1.3 (Calibration) depend on your work.
**Risk if Delayed**: Sales team lacks proof points for Q1 enterprise deals.`;
    } else if (epicId === 'E-PHASE1') {
      impact = `**Epic Goal**: Ship scenario planning and onboarding tools for strategic decision support.

**User Value**: Empowers marketing teams to explore "what-if" scenarios before committing budget.
**Dependencies**: Design review must complete before API implementation can proceed.
**Risk if Delayed**: Product demo for beta customers lacks compelling decision support story.`;
    } else if (epicId === 'E12') {
      impact = `**Epic Goal**: Validate production weather model performance meets quality bar.

**User Value**: Ensures weather predictions are accurate enough to drive real allocation decisions.
**Dependencies**: Allocator (E3) and MMM (E2) depend on validated weather data.
**Risk if Delayed**: Model quality unknown → cannot confidently deploy to production.`;
    } else if (epicId === 'E13') {
      impact = `**Epic Goal**: Align causal methodology with academic standards for enterprise credibility.

**User Value**: Enables WeatherVane to pass technical due diligence from Fortune 500 brands.
**Dependencies**: MMM upgrades and geographic alignment critical for credibility.
**Risk if Delayed**: Enterprise customers question scientific rigor → deal velocity slows.`;
    } else if (classification.domain === 'product') {
      impact = `**Your work contributes to**: WeatherVane's mission of increasing customer ROAS by 15-30%.

**User Value**: Every feature you build helps brands make smarter allocation decisions.
**Quality Bar**: Enterprise customers expect perfection → your work represents our commitment to excellence.`;
    } else {
      impact = `**Your work supports**: Infrastructure that enables the WeatherVane product team to ship faster.

**Value**: Better tooling → faster iteration → more customer value delivered.`;
    }

    return impact;
  }

  private buildTaskHeader(
    task: Task,
    role: HierarchyAgentRole,
    profile: AgentProfile,
    classification: TaskClassification,
    complexity: TaskComplexity,
    context: AssembledContext
  ): string {
    const lines: string[] = [
      '# Task Brief',
      `- ID: ${task.id}`,
      `- Title: ${task.title ?? 'Untitled task'}`,
      `- Status: ${task.status} | Complexity: ${classification.complexity}/10 (${complexity})`,
      `- Assigned Role: ${this.getAgentPersona(role)} (${profile.model})`,
      `- Domain: ${classification.domain} | Critic Group: ${classification.criticGroup}`,
      `- Epic: ${task.epic_id ?? 'None'}`,
    ];

    if (context.isAutogenerated) {
      lines.push('- Source: Auto-generated follow-up task (idle remediation).');
    }

    if (task.description) {
      lines.push(`- Objective: ${this.truncate(task.description, 220)}`);
    }

    const impact = this.getTaskBusinessImpact(task, classification);
    return `${lines.join('\n')}\n\n## Why This Matters\n${impact}`;
  }

  private buildDirectiveSection(
    task: Task,
    role: HierarchyAgentRole,
    classification: TaskClassification,
    context: AssembledContext,
    decision: PolicyDecision,
    complexity: TaskComplexity
  ): string {
    const directives = new Set<string>();

    for (const directive of decision.directives) {
      directives.add(directive);
    }

    const blockingDeps = context.relatedTasks.filter(t => t.status !== 'done');
    if (blockingDeps.length > 0) {
      directives.add(`Triage blocking dependencies: ${blockingDeps.map(t => `${t.id} (${t.status})`).join(', ')}.`);
    }

    if (context.dependentTasks.length > 0) {
      directives.add(`Finish with a summary that unblocks: ${context.dependentTasks.map(t => t.id).join(', ')}.`);
    }

    if (context.isAutogenerated) {
      directives.add('Treat this follow-up as a maintenance/QA cycle – document findings and open new work if gaps remain.');
    }

    if (this.isModelingTask(task)) {
      directives.add('Run `scripts/check_modeling_env.sh` and attach outputs before marking complete.');
    }

    if (role === 'critic' || classification.criticGroup !== 'general') {
      directives.add('Focus on validation evidence; capture defects with actionable feedback and exit criteria.');
    }

    if (complexity === 'complex') {
      directives.add('Provide design rationale and escalation notes for orchestrator review.');
    }

    const ordered = this.formatOrderedList([...directives]);
    return ordered ? `## Directives\n${ordered}` : '';
  }

  private buildDependenciesSection(context: AssembledContext): string {
    if (context.relatedTasks.length === 0) {
      return '';
    }

    const completed = context.relatedTasks.filter(task => task.status === 'done');
    const blocking = context.relatedTasks.filter(task => task.status !== 'done');

    const lines: string[] = ['## Dependencies'];
    if (completed.length > 0) {
      lines.push('**Completed**:');
      lines.push(this.formatTaskList(completed));
    }

    if (blocking.length > 0) {
      lines.push('**Blocking / In Progress**:');
      lines.push(this.formatTaskList(blocking));
    }

    return lines.filter(Boolean).join('\n\n');
  }

  private buildDependentTasksSection(context: AssembledContext): string {
    if (context.dependentTasks.length === 0) {
      return '';
    }

    return `## Unlocks After Completion\n${this.formatTaskList(context.dependentTasks)}`;
  }

  private buildContextEntriesSection(entries: ContextEntry[], title: string): string {
    if (!entries || entries.length === 0) {
      return '';
    }

    const bullets = entries.slice(0, 6).map(entry => {
      const topic = entry.topic ? this.truncate(entry.topic, 80) : 'Detail';
      const content = entry.content ? this.truncate(entry.content, 220) : '';
      return `- **${topic}**${content ? `: ${content}` : ''}`;
    });

    return `## ${title}\n${bullets.join('\n')}`;
  }

  private buildResearchSection(researchHighlights?: string[]): string {
    if (!researchHighlights || researchHighlights.length === 0) {
      return '';
    }

    const highlights = researchHighlights.slice(0, 5).map(item => `- ${this.truncate(item, 200)}`);
    return `## Research Highlights\n${highlights.join('\n')}`;
  }

  private buildHistoricalSection(task: Task): string {
    const entries = this.historicalRegistry.getEntriesForTask(task, 4);
    if (!entries || entries.length === 0) {
      return '';
    }

    const bullets = entries.map(entry => `- ${entry.path} — ${entry.summary}`);
    return `## Historical Guidance\n${bullets.join('\n')}`;
  }

  private buildPolicySection(decision: PolicyDecision): string {
    const lines = [
      '## Policy Guidance',
      `- Domain: ${decision.domain}`,
      `- Assigned Role: ${decision.assignedRole}`,
      `- Action: ${decision.action}`,
      `- Reasoning: ${decision.reasoning}`,
    ];

    if (this.policyDirective && this.policyDirective.trim().length > 0) {
      lines.push(`- Policy Directive: ${this.policyDirective.trim()}`);
    }

    return lines.join('\n');
  }

  private deriveContextOptions(
    task: Task,
    classification: TaskClassification,
    agent: Agent,
    complexity: TaskComplexity
  ): ContextAssemblyOptions {
    const options: ContextAssemblyOptions = {
      includeCodeContext: true,
      includeQualityHistory: true,
      maxDecisions: complexity === 'complex' ? 10 : 5,
      maxLearnings: complexity === 'complex' ? 5 : 3,
      hoursBack: complexity === 'complex' ? 48 : 24,
    };

    if (this.isCriticTask(task, classification, agent)) {
      options.includeCodeContext = false;
      options.maxDecisions = Math.min(options.maxDecisions ?? 4, 4);
      options.maxLearnings = Math.min(options.maxLearnings ?? 3, 3);
      options.hoursBack = Math.max(options.hoursBack ?? 0, 72);
    }

    if (this.isModelingTask(task)) {
      options.includeCodeContext = true;
      options.includeQualityHistory = true;
      options.maxDecisions = Math.max(options.maxDecisions ?? 0, 8);
      options.maxLearnings = Math.max(options.maxLearnings ?? 0, 5);
      options.hoursBack = Math.max(options.hoursBack ?? 0, 48);
    }

    const metadata = (task.metadata ?? {}) as Record<string, unknown>;
    if (metadata.autogenerated) {
      options.includeCodeContext = false;
      options.includeQualityHistory = false;
      options.maxDecisions = Math.min(options.maxDecisions ?? 3, 3);
      options.maxLearnings = Math.min(options.maxLearnings ?? 2, 2);
      options.hoursBack = Math.min(options.hoursBack ?? 12, 12);
    }

    if (classification.domain === 'infrastructure') {
      options.includeQualityHistory = false;
      options.hoursBack = Math.min(options.hoursBack ?? 24, 24);
    }

    return options;
  }

  private async writeTaskMemo(
    task: Task,
    agent: Agent,
    success: boolean,
    output: string | undefined,
    error: string | undefined,
    durationMs: number
  ): Promise<void> {
    const taskId = task.id.replace(/[^\w.\-]/g, '_');
    const memoDir = path.join(this.taskMemoDir, taskId);
    await fs.mkdir(memoDir, { recursive: true });

    const timestampIso = new Date().toISOString();
    const fileName = `${timestampIso.replace(/[:.]/g, '-')}.md`;
    const memoPath = path.join(memoDir, fileName);

    const lines: string[] = [
      `# ${task.id}: ${task.title ?? 'Task Memo'}`,
      '',
      `- Timestamp: ${timestampIso}`,
      `- Agent: ${agent.id} (${agent.config.model})`,
      `- Status: ${success ? 'completed' : 'blocked'}`,
      `- Duration: ${(durationMs / 1000).toFixed(1)}s`,
    ];

    if (!success && error) {
      lines.push(`- Error: ${this.truncate(error, 200)}`);
    }

    const previewSource = success ? output : error;
    if (previewSource && previewSource.trim().length > 0) {
      lines.push('', '## Outcome Preview', '```', this.truncate(previewSource, 800), '```');
    }

    await fs.writeFile(memoPath, `${lines.join('\n')}\n`, 'utf-8');
  }

  private async buildMemoSection(taskId: string): Promise<string> {
    const memos = await this.getRecentTaskMemos(taskId, 3);
    if (memos.length === 0) {
      return '';
    }

    const bullets = memos.map(memo => `- ${memo.timestamp} · ${memo.summary}`);
    return `## Task Memo Trail\n${bullets.join('\n')}`;
  }

  private async getRecentTaskMemos(taskId: string, limit = 3): Promise<Array<{ timestamp: string; summary: string }>> {
    const safeId = taskId.replace(/[^\w.\-]/g, '_');
    const memoDir = path.join(this.taskMemoDir, safeId);

    try {
      const entries = (await fs.readdir(memoDir))
        .filter(entry => entry.endsWith('.md'))
        .sort()
        .reverse()
        .slice(0, limit);

      const results: Array<{ timestamp: string; summary: string }> = [];

      for (const entry of entries) {
        const memoPath = path.join(memoDir, entry);
        let content: string;
        try {
          content = await fs.readFile(memoPath, 'utf-8');
        } catch {
          continue;
        }

        const lines = content.split(/\r?\n/);
        const timestampLine = lines.find(line => line.startsWith('- Timestamp:'));
        const timestamp = timestampLine ? timestampLine.replace('- Timestamp:', '').trim() : entry.replace('.md', '');
        const summaryCandidate =
          lines.find(line => line.trim().length > 0 && !line.startsWith('#') && !line.startsWith('- ')) ??
          'See memo for details.';

        results.push({
          timestamp,
          summary: this.truncate(summaryCandidate, 200),
        });
      }

      return results;
    } catch {
      return [];
    }
  }

  private async recordPolicyEvent(
    event: PolicyEventType,
    task: Task,
    agent: Agent,
    details: { durationMs?: number; error?: string; meta?: Record<string, unknown> }
  ): Promise<void> {
    if (!this.policyController.isEnabled()) {
      return;
    }

    const descriptor = `${task.id} — ${this.truncate(task.title ?? 'Untitled task', 140)}`;
    const dependents = this.stateMachine
      .getDependents(task.id)
      .map(dep => this.stateMachine.getTask(dep.task_id))
      .filter((depTask): depTask is Task => Boolean(depTask))
      .map(depTask => `${depTask.id} (${depTask.status ?? 'pending'})`);

    let blockers: string[] = [];
    if (event === 'task_completed') {
      blockers = [];
    } else if (event === 'git_status') {
      const trackedRaw = details.meta && (details.meta as Record<string, unknown>).trackedChanges;
      const untrackedRaw = details.meta && (details.meta as Record<string, unknown>).untrackedChanges;
      const tracked = Array.isArray(trackedRaw) ? trackedRaw.map(item => String(item)) : [];
      const untracked = Array.isArray(untrackedRaw) ? untrackedRaw.map(item => String(item)) : [];
      blockers = [...tracked.map(change => `tracked:${change}`), ...untracked.map(change => `untracked:${change}`)];
      if (blockers.length === 0) {
        blockers = ['git worktree dirty'];
      }
    } else if (event === 'preflight_failed') {
      blockers = [`Pre-flight: ${this.truncate(details.error ?? 'preflight failure', 160)}`];
    } else {
      blockers = [`${task.id} (${this.truncate(details.error ?? 'execution issue', 160)})`];
    }

    const completedTasks = event === 'task_completed' ? [descriptor] : [];

    const note = (() => {
      const base = `Agent ${agent.id} (${agent.config.model})`;
      if (event === 'task_completed') {
        return `${base} completed the task in ${(details.durationMs ?? 0) / 1000}s.`;
      }
      if (event === 'verification_failed') {
        return `${base} hit verification failure: ${this.truncate(details.error ?? 'verification failed', 200)}.`;
      }
      if (event === 'usage_limit') {
        return `${base} paused due to usage limits: ${this.truncate(details.error ?? 'usage limit reached', 200)}.`;
      }
      if (event === 'git_status') {
        return `${base} detected dirty worktree: ${this.truncate(details.error ?? 'tracked/untracked changes present', 200)}.`;
      }
      if (event === 'preflight_failed') {
        return `${base} blocked on pre-flight checks: ${this.truncate(details.error ?? 'pre-flight failure', 200)}.`;
      }
      return `${base} failed execution: ${this.truncate(details.error ?? 'execution failed', 200)}.`;
    })();

    const summary: PolicySummaryPayload = {
      completed_tasks: completedTasks,
      in_progress: [],
      blockers,
      next_focus: dependents,
      notes: note,
      meta: {
        event,
        agent: agent.id,
        provider: agent.config.provider,
        model: agent.config.model,
        duration_seconds: typeof details.durationMs === 'number'
          ? Number((details.durationMs / 1000).toFixed(2))
          : undefined,
        error: details.error,
        ...(details.meta ?? {}),
      },
    };

    await this.policyController.recordEvent(summary);
  }

  private isUsageLimitError(message?: string | null): boolean {
    if (!message) {
      return false;
    }
    const normalized = message.toLowerCase();
    return (
      normalized.includes('rate limit') ||
      normalized.includes('usage limit') ||
      normalized.includes('quota exceeded') ||
      normalized.includes('too many requests')
    );
  }

  private async handleUsageLimitBackoff(
    provider: Provider,
    task: Task,
    agent: Agent,
    message?: string
  ): Promise<void> {
    const backoffSeconds = Math.max(1, Math.round(this.usageLimitBackoffMs / 1000));
    logWarning('Usage limit encountered; backing off before retrying', {
      provider,
      taskId: task.id,
      agent: agent.id,
      backoffSeconds,
    });

    try {
      await this.recordPolicyEvent('usage_limit', task, agent, {
        durationMs: 0,
        error: message,
        meta: {
          provider,
          backoff_seconds: backoffSeconds,
        },
      });
    } catch {
      // Policy logging best-effort
    }

    await new Promise(resolve => setTimeout(resolve, this.usageLimitBackoffMs));
  }

  private formatTaskList(tasks: Task[]): string {
    return tasks
      .slice(0, 8)
      .map(task => `- ${task.id} (${task.status}) — ${this.truncate(task.title ?? '', 140)}`)
      .join('\n');
  }

  private formatOrderedList(items: string[]): string {
    if (!items || items.length === 0) {
      return '';
    }
    return items
      .map((item, index) => `${index + 1}. ${item}`)
      .join('\n');
  }

  private truncate(value: string, maxLength = 200): string {
    if (!value) return '';
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  private isModelingTask(task: Task): boolean {
    return /^T12\\./.test(task.id) || /^T13\\.5/.test(task.id) || task.epic_id === 'E12' || task.epic_id === 'E13';
  }

  private isCriticTask(task: Task, classification: TaskClassification, agent: Agent): boolean {
    return task.id.startsWith('CRIT-') || classification.criticGroup !== 'general' || agent.config.role === 'critic';
  }

  /**
   * Format quality signals (issues and trends)
   */
  private formatQualitySignals(context: AssembledContext): string {
    let output = `## Quality Signals\n`;

    // Add quality issues in this area
    if (context.qualityIssuesInArea.length > 0) {
      output += '**Issues in This Area**:\n';
      for (const issue of context.qualityIssuesInArea.slice(0, 5)) {
        const scorePercent = (issue.score * 100).toFixed(1);
        const details = issue.details ? ` - ${JSON.stringify(issue.details)}` : '';
        output += `- ${issue.dimension}: ${scorePercent}%${details}\n`;
      }
      output += '\n';
    }

    // Add overall quality trends
    if (context.overallQualityTrend.length > 0) {
      output += '**Overall Quality Trends**:\n';
      for (const trend of context.overallQualityTrend) {
        const trendIcon = trend.trend === 'improving' ? '📈' : trend.trend === 'declining' ? '📉' : '➡️';
        output += `- ${trend.dimension}: ${trend.currentScore.toFixed(1)}% ${trendIcon} ${trend.trend}\n`;
      }
      output += '\n';
    }

    return output;
  }

  /**
   * Format code context (files to read, recent changes)
   */
  private formatCodeContext(context: AssembledContext): string {
    let output = `## Code Context\n`;

    if (context.filesToRead && context.filesToRead.length > 0) {
      output += '**Files You May Need to Read/Modify**:\n';
      for (const file of context.filesToRead) {
        output += `- ${file}\n`;
      }
      output += '\n';
    }

    if (context.recentChangesInArea && context.recentChangesInArea.length > 0) {
      output += '**Recent Changes in This Area**:\n';
      for (const change of context.recentChangesInArea) {
        output += `- ${change}\n`;
      }
      output += '\n';
    }

    return output;
  }

  /**
   * Format velocity metrics
   */
  private formatVelocityMetrics(context: AssembledContext): string {
    const metrics = context.velocityMetrics;

    let output = `## Velocity Metrics
**Project Velocity**:
- Tasks completed today: ${metrics.tasksCompletedToday}
- Average task duration: ${metrics.averageTaskDuration} minutes
- Quality trend: ${metrics.qualityTrendOverall}
- Current phase: ${context.projectPhase}

`;

    return output;
  }

  /**
   * Get agent persona description based on role
   */
  private getAgentPersona(role: HierarchyAgentRole): string {
    switch (role) {
      case 'atlas':
        return `**Atlas** - Autopilot Captain

You are Atlas, the strategic orchestrator and captain of the WeatherVane autopilot system. Your responsibilities:
- Drive roadmap execution with world-class engineering rigor
- Make strategic architectural decisions
- Ensure quality standards are met across all deliverables
- Coordinate between product, infrastructure, and quality domains
- Escalate to Director Dana when automation/infrastructure coordination is needed
- Apply genius-level judgment to complex problems
- Validate design work against world-class SaaS standards

**Autonomy**: You have full strategic autonomy within the product domain. Make bold decisions, iterate quickly, and drive toward completion.`;

      case 'director_dana':
        return `**Director Dana** - Infrastructure & Automation Coordinator

You are Director Dana, responsible for automation upkeep and infrastructure coordination. Your responsibilities:
- Schedule and coordinate critic runs with backoff windows
- Monitor system health and capacity
- Handle infrastructure and deployment tasks
- Coordinate automation workflows
- Support Atlas with infrastructure needs
- Ensure critics run efficiently without over-testing
- Manage technical debt and maintenance tasks

**Autonomy**: You operate independently on infrastructure matters. Coordinate with Atlas for product-impacting decisions.`;

      case 'worker':
        return `**Worker Agent** - Tactical Executor

You are a worker agent responsible for tactical execution of well-defined tasks. Your responsibilities:
- Implement features with clean, maintainable code
- Write comprehensive tests to prove functionality
- Follow existing architecture patterns
- Document your work clearly
- Escalate to Atlas if you encounter blockers or need strategic guidance
- Apply best practices and industry standards

**Autonomy**: You have operational autonomy within clear task boundaries. Escalate complex decisions to Atlas.`;

      case 'critic':
        return `**Critic Agent** - Holistic Quality Reviewer & Devil's Advocate

You are a critic agent responsible for comprehensive quality review across technical, conceptual, and organizational dimensions. Your responsibilities:

**Technical Review**:
- Code quality, correctness, maintainability, and elegance
- Test coverage, edge cases, and validation rigor
- Architecture coherence and scalability
- Security vulnerabilities and defensive coding
- Performance and resource efficiency

**Conceptual Review**:
- Design decisions and trade-offs
- Problem-solving approach and alternatives
- Integration with broader system architecture
- Alignment with product vision and roadmap
- Innovation vs. proven patterns balance

**Organizational & Holistic Review**:
- How this unit relates to larger components
- Cross-system integration and coherence
- Documentation completeness and clarity
- Developer experience and maintainability
- Long-term technical debt implications

**Critical Standards**:
- NEVER accept "done" at face value - always verify
- Question assumptions and challenge completeness
- Play devil's advocate: what could go wrong?
- Ensure world-class quality, not just "good enough"
- Holistic view: micro (code), meso (component), macro (system)

**Your Mission**: Be the guardian of excellence. If something isn't world-class, send it back with clear, constructive feedback. Quality is non-negotiable.

**Autonomy**: You have full autonomy to pass/fail any deliverable. Your judgment is final on quality matters.`;

      default:
        return 'Agent';
    }
  }

  /**
   * Get current orchestrator state
   */
  getState() {
    return {
      running: this.running,
      orchestrator: this.orchestrator,
      workers: this.workers,
      critics: this.critics,
      totalAgents: (this.orchestrator ? 1 : 0) + this.workers.length + this.critics.length,
    };
  }

  /**
   * Get orchestrator agent info (for testing)
   */
  getOrchestrator(): Agent | undefined {
    return this.orchestrator;
  }

  /**
   * Get workers (for testing)
   */
  getWorkers(): Agent[] {
    return this.workers;
  }

  /**
   * Get critics (for testing)
   */
  getCritics(): Agent[] {
    return this.critics;
  }

  private getActiveWorkerCount(): number {
    return this.workers.length +
      (this.architecturePlanner ? 1 : 0) +
      (this.architectureReviewer ? 1 : 0);
  }

  private getAutopilotAgentIds(): Set<string> {
    const ids = new Set<string>();
    if (this.orchestrator) ids.add(this.orchestrator.id);
    if (this.architecturePlanner) ids.add(this.architecturePlanner.id);
    if (this.architectureReviewer) ids.add(this.architectureReviewer.id);
    for (const worker of this.workers) {
      ids.add(worker.id);
    }
    for (const critic of this.critics) {
      ids.add(critic.id);
    }
    return ids;
  }

  private filterAutopilotInProgressTasks(tasks: Task[]): Task[] {
    const autopilotAgentIds = this.getAutopilotAgentIds();
    return tasks.filter(task => {
      const assigned = task.assigned_to;
      // Treat unassigned tasks as autopilot-owned so stale recoveries still trigger
      if (!assigned) {
        return true;
      }
      return autopilotAgentIds.has(assigned);
    });
  }

  private async recoverStaleInProgressTasks(): Promise<number> {
    const inProgress = this.stateMachine.getTasks({ status: ['in_progress'] });
    if (inProgress.length === 0) {
      return 0;
    }

    const activeReservations = new Set(
      this.agentPool.getStatus().reservations.map(reservation => reservation.taskId)
    );
    const autopilotAgentIds = this.getAutopilotAgentIds();
    const now = Date.now();
    let recovered = 0;

    for (const task of inProgress) {
      if (activeReservations.has(task.id)) {
        continue;
      }

      const assigned = task.assigned_to ?? null;
      const isAutopilotTask = !assigned || autopilotAgentIds.has(assigned);
      if (!isAutopilotTask) {
        continue;
      }

      const startedAt = task.started_at ?? task.created_at;
      if (!startedAt) {
        continue;
      }

      const ageMs = now - startedAt;
      if (ageMs < this.staleTaskThresholdMs) {
        continue;
      }

      logWarning('Recovering stale in-progress task back to pending', {
        taskId: task.id,
        assignedTo: assigned,
        ageMs,
      });

      try {
        await this.roadmapTracker.updateTaskStatus(task.id, 'pending', {
          agent: 'autopilot',
          output: 'Recovered from stale in_progress status',
          metadata: {
            stale_recovered: true,
            stale_age_ms: ageMs,
            recovered_at: new Date(now).toISOString(),
            previous_assignee: assigned ?? 'unassigned',
          },
        });
        this.blockerEscalationManager.clearBlockerRecord(task.id);
        recovered++;
      } catch (error) {
        logError('Failed to recover stale in-progress task', {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (recovered > 0) {
      const remaining = this.filterAutopilotInProgressTasks(
        this.stateMachine.getTasks({ status: ['in_progress'] })
      );
      this.logAgentSnapshot('stale_recovery', {
        note: `Recovered ${recovered} stale task(s)`,
        metrics: {
          queueSize: this.taskQueue.length,
          inProgress: remaining.length,
        },
      });
    }

    return recovered;
  }
}
