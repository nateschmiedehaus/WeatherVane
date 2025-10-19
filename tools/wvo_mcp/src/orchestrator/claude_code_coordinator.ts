import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import type {
  Agent,
  AgentType,
  AssignmentOptions,
  ExecutionOutcome,
  ExecutionFailureType,
  PromptCacheStatus,
} from './agent_pool.js';
import { AgentPool } from './agent_pool.js';
import type { AssembledContext } from './context_assembler.js';
import { ContextAssembler } from './context_assembler.js';
import type { QualityCheckInput, QualityMonitor } from './quality_monitor.js';
import type {
  ScheduledTask,
  TaskScheduler,
  SchedulingReason,
  BatchInfo,
} from './task_scheduler.js';
import type { StateMachine, Task } from './state_machine.js';
import { selectCodexModel } from './model_selector.js';
import type { CodexOperationalSnapshot } from './model_selector.js';
import type { ReasoningLevel } from './reasoning_classifier.js';
import type { OperationsManager, OperationsSnapshot } from './operations_manager.js';
import { logError, logInfo, logWarning } from '../telemetry/logger.js';
import { CriticEnforcer } from './critic_enforcer.js';
import type { WebInspirationManager } from './web_inspiration_manager.js';
import type { SelfImprovementManager } from './self_improvement_manager.js';
import { standardPromptHeader } from '../utils/prompt_headers.js';
import type { PromptIntent } from '../utils/prompt_headers.js';
import { ResilienceManager } from './resilience_manager.js';
import { resolveOutputValidationSettings } from '../utils/output_validator.js';
import type { LiveFlagsReader } from './live_flags.js';
import { ConsensusEngine, ConsensusTelemetryRecorder } from './consensus/index.js';
import type { ModelManager } from '../models/model_manager.js';

const TOKEN_ESTIMATE_CHAR_RATIO = 4;
const MAX_PROMPT_TOKENS = 600;
const MAX_PROMPT_CHARACTERS = MAX_PROMPT_TOKENS * TOKEN_ESTIMATE_CHAR_RATIO;

const MODEL_COST_TABLE: Record<string, { prompt: number; completion: number }> = {
  'gpt-5-codex': { prompt: 0.012, completion: 0.024 },
  'gpt-5': { prompt: 0.012, completion: 0.03 },
  claude_code: { prompt: 0.011, completion: 0.033 },
};

const COST_TRACKING_DISABLED =
  typeof process.env.WVO_DISABLE_COST_TRACKING === 'string' &&
  ['1', 'true', 'yes'].includes(process.env.WVO_DISABLE_COST_TRACKING.toLowerCase());

function estimateTokenCount(text: string | undefined): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(0, Math.ceil(trimmed.length / TOKEN_ESTIMATE_CHAR_RATIO));
}

function estimateModelCost(
  agentType: Agent['type'],
  modelSlug: string | undefined,
  promptTokens: number,
  completionTokens: number,
  modelManager?: ModelManager
): number | undefined {
  if (COST_TRACKING_DISABLED) {
    return undefined;
  }

  // Try to get cost from model registry first
  if (modelManager && modelSlug) {
    const registryCost = modelManager.getModelCost(agentType === 'codex' ? 'codex' : 'claude', modelSlug);
    if (registryCost) {
      const cost = ((promptTokens * registryCost.input) + (completionTokens * registryCost.output)) / 1000;
      return Number.isFinite(cost) ? Math.round(cost * 1000) / 1000 : undefined;
    }
  }

  // Fall back to hardcoded table
  const pricingKey = agentType === 'codex' ? modelSlug ?? 'gpt-5-codex' : 'claude_code';
  if (!pricingKey) return undefined;

  const pricing = MODEL_COST_TABLE[pricingKey];
  if (!pricing) return undefined;

  const cost =
    ((promptTokens * pricing.prompt) + (completionTokens * pricing.completion)) / 1000;
  return Number.isFinite(cost) ? Math.round(cost * 1000) / 1000 : undefined;
}

export type ExecutionResult = {
  success: boolean;
  output: string;
  durationSeconds: number;
};

export type FinalExecutionStatus = 'done' | 'needs_review' | 'needs_improvement';

export interface ExecutionSummary {
  taskId: string;
  agentId: string;
  agentType: Agent['type'];
  success: boolean;
  failureType?: ExecutionFailureType;
  finalStatus: FinalExecutionStatus;
  durationSeconds: number;
  qualityScore: number;
  issues: string[];
  timestamp: number;
  projectPhase: string;
  coordinatorType?: Agent['type'];
  coordinatorReason?: string;
  coordinatorAvailable?: boolean;
  codexPreset?: string;
  codexModel?: string;
  codexReasoning?: ReasoningLevel;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  tokenCostUSD?: number;
  tokenEstimateStrategy: 'reported' | 'estimated';
  criticsRequired?: string[];
  criticsFailed?: string[];
  correlationId?: string;
  promptCacheStatus?: PromptCacheStatus | 'unknown';
  promptCacheTier?: string;
  promptCacheId?: string;
  promptCacheHit?: boolean;
  promptCacheStore?: boolean;
  promptCacheEligible?: boolean;
  promptCacheRaw?: string;
}

export interface ExecutionLifecycleEvent {
  task: Task;
  agent: Agent;
  context: AssembledContext;
  correlationId: string;
  startedAt: number;
}

export interface ExecutionObserver {
  recordExecution(summary: ExecutionSummary): void;
  handleRateLimit?(
    agentId: string,
    agentType: Agent['type'],
    retryAfterSeconds: number,
    message: string
  ): void;
  handleContextLimit?(taskId: string, agentId: string, agentType: Agent['type']): void;
  handleNetworkFailure?(
    taskId: string,
    agentId: string,
    agentType: Agent['type'],
    message: string
  ): void;
}

interface ActiveExecution {
  task: Task;
  agent: Agent;
  context: AssembledContext;
  startedAt: number;
  correlationId: string;
}

/**
 * ClaudeCodeCoordinator orchestrates work between the StateMachine, TaskScheduler,
 * AgentPool, and QualityMonitor. It reacts to roadmap changes, dispatches runnable
 * tasks to available agents, and feeds execution results back into the state machine.
 */
export class ClaudeCodeCoordinator extends EventEmitter {
  private readonly activeExecutions = new Map<string, ActiveExecution>();
  private running = false;
  private tickScheduled = false;
  private readonly dispatching = new Set<string>(); // Race guard: tasks currently being dispatched
  private readonly agentCapacityWarnings = new Map<string, number>();
  private readonly resilienceManager: ResilienceManager;
  private readonly criticEnforcer: CriticEnforcer;
  private readonly selfImprovementManager?: SelfImprovementManager;
  private readonly consensusEngine?: ConsensusEngine;
  private readonly modelManager?: ModelManager;

  // Store bound listeners for proper cleanup
  private readonly boundListeners = {
    taskCreated: () => this.scheduleTick(),
    taskTransition: () => this.scheduleTick(),
    queueUpdated: () => this.scheduleTick()
  };

  constructor(
    private readonly workspaceRoot: string,
    private readonly stateMachine: StateMachine,
    private readonly scheduler: TaskScheduler,
    private readonly agentPool: AgentPool,
    private readonly contextAssembler: ContextAssembler,
    private readonly liveFlags: LiveFlagsReader,
    private readonly qualityMonitor: QualityMonitor,
    private readonly webInspirationManager: WebInspirationManager | undefined,
    private readonly operationsManager?: OperationsManager,
    private readonly observer?: ExecutionObserver,
    resilienceManager?: ResilienceManager,
    selfImprovementManager?: SelfImprovementManager,
    modelManager?: ModelManager
  ) {
    super();
    this.criticEnforcer = new CriticEnforcer(workspaceRoot, { stateMachine });
    this.resilienceManager = resilienceManager ?? new ResilienceManager(this.stateMachine, this.agentPool);
    this.selfImprovementManager = selfImprovementManager;
    this.modelManager = modelManager;

    const consensusEnabled = process.env.WVO_CONSENSUS_ENABLED === '1';
    if (consensusEnabled) {
      const telemetry = new ConsensusTelemetryRecorder(workspaceRoot);
      this.consensusEngine = new ConsensusEngine({
        stateMachine,
        enabled: true,
        telemetryRecorder: telemetry,
      });
    }

    this.stateMachine.on('task:created', this.boundListeners.taskCreated);
    this.stateMachine.on('task:transition', this.boundListeners.taskTransition);
    this.scheduler.on('queue:updated', this.boundListeners.queueUpdated);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleTick();
    logInfo('Coordinator started');
  }

  stop(): void {
    this.running = false;
    this.tickScheduled = false;

    // Clean up event listeners to prevent memory leaks
    this.stateMachine.removeListener('task:created', this.boundListeners.taskCreated);
    this.stateMachine.removeListener('task:transition', this.boundListeners.taskTransition);
    this.scheduler.removeListener('queue:updated', this.boundListeners.queueUpdated);

    logInfo('Coordinator stopped');
  }

  private scheduleTick(): void {
    if (!this.running || this.tickScheduled) return;
    this.tickScheduled = true;
    queueMicrotask(() => {
      this.tickScheduled = false;
      void this.dispatchWork();
    });
  }

  private createExecutionCorrelation(taskId: string): string {
    return `exec:${taskId}:${randomUUID()}`;
  }

  private stageCorrelation(executionId: string, stage: string): string {
    return `${executionId}:${stage}`;
  }

  private async dispatchWork(): Promise<void> {
    if (!this.running) return;

    // Check if MCP infrastructure phases are complete
    if (this.selfImprovementManager) {
      const metaComplete = await this.selfImprovementManager.checkPhaseCompletion();

      if (metaComplete) {
        // Phase completion event is emitted by SelfImprovementManager
        this.emit('meta-work:complete');
      }
    }

    let safetyCounter = 0;
    const maxDispatchesPerTick = 5;

    while (this.agentPool.getAvailableAgents().length > 0 && safetyCounter < maxDispatchesPerTick) {
      const next = this.scheduler.takeNextTask();
      if (!next) break;

      // Race guard: skip if already dispatching this task
      if (this.dispatching.has(next.task.id)) {
        continue;
      }

      this.dispatching.add(next.task.id);
      safetyCounter += 1;
      void this.executeTask(next).catch((error) => {
        logError('Failed to execute task', {
          taskId: next.task.id,
          error: error instanceof Error ? error.message : String(error),
        });
        this.scheduler.releaseTask(next.task.id);
      });
    }
  }

  private async executeTask(candidate: ScheduledTask): Promise<void> {
    const task = candidate.task;

    try {
      const operationalSnapshot = this.operationsManager?.getSnapshot?.();
      const initialStrategies = this.getContextStrategies(
        'codex',
        operationalSnapshot?.tokenMetrics.pressure,
      );
      const initialOptions = initialStrategies[0];
      const initialContext = await this.contextAssembler.assembleForTask(task.id, initialOptions);

      // Only attempt web inspiration if enabled to avoid unnecessary function calls
      if (this.webInspirationManager?.isEnabled()) {
        await this.webInspirationManager.ensureInspiration(task);
      }

      if (this.consensusEngine?.shouldEnsureDecision(task, initialContext)) {
        const consensusCorrelation = this.createExecutionCorrelation(task.id);
        await this.consensusEngine.ensureDecision(task, initialContext, {
          correlationId: this.stageCorrelation(consensusCorrelation, 'consensus'),
        });
      }

      const codexOperational: CodexOperationalSnapshot | undefined = operationalSnapshot
        ? {
            mode: operationalSnapshot.mode,
            failureRate: operationalSnapshot.failureRate,
            rateLimitCodex: operationalSnapshot.rateLimitCodex,
            queueLength: operationalSnapshot.queueLength,
            presetStats: operationalSnapshot.codexPresetStats,
          }
        : undefined;

      const codexModelHint = selectCodexModel(task, initialContext, codexOperational, this.modelManager);
      const assignmentOptions = this.computeAssignmentOptions(task, operationalSnapshot, codexModelHint);
      if (assignmentOptions) {
        logInfo('Applying provider override', {
          taskId: task.id,
          rationale: assignmentOptions.rationale,
          forceAgentType: assignmentOptions.forceAgentType,
          preferAgentType: assignmentOptions.preferAgentType,
        });
      }

      const executionCorrelation = this.createExecutionCorrelation(task.id);

      const agent = await this.agentPool.assignTask(task, initialContext, {
        codexModel: codexModelHint.modelSlug,
        codexReasoning: codexModelHint.reasoning,
        codexPreset: codexModelHint.presetId,
      }, assignmentOptions ?? {});
      const strategies = this.getContextStrategies(agent.type, operationalSnapshot?.tokenMetrics.pressure);

      const promptPackage = await this.preparePrompt(
        task,
        agent,
        initialContext,
        strategies,
        {
          reason: candidate.reason,
          batch: candidate.batch,
          operations: operationalSnapshot,
        },
      );
      const { context, prompt } = promptPackage;
      await this.stateMachine.assignTask(task.id, agent.id, this.stageCorrelation(executionCorrelation, 'assign'));

      if (task.status === 'pending') {
        await this.stateMachine.transition(
          task.id,
          'in_progress',
          { assigned_at: Date.now(), agent: agent.id },
          this.stageCorrelation(executionCorrelation, 'start')
        );
      }

      const executionPromise: Promise<ExecutionOutcome> = agent.type === 'claude_code'
        ? this.agentPool.executeWithClaudeCode(task.id, prompt, { workdir: this.workspaceRoot })
        : this.agentPool.executeWithCodex(task.id, prompt, {
            workdir: this.workspaceRoot,
            model: codexModelHint.modelSlug,
            reasoning: codexModelHint.reasoning,
          });

      if (agent.type === 'codex') {
        logInfo('Dispatching task with Codex model selection', {
          taskId: task.id,
          preset: codexModelHint.presetId,
          model: codexModelHint.modelSlug,
          reasoning: codexModelHint.reasoning,
          profile: codexModelHint.profile,
          rationale: codexModelHint.rationale,
          description: codexModelHint.description,
        });
      }

      const startedAt = Date.now();
      this.activeExecutions.set(task.id, {
        task,
        agent,
        context,
        startedAt,
        correlationId: executionCorrelation,
      });
      this.emit('execution:started', {
        task,
        agent,
        context,
        correlationId: executionCorrelation,
        startedAt,
      });

      const result = await executionPromise;
      if (!result.success && result.failureType === 'rate_limit') {
        const cooldownSeconds = result.retryAfterSeconds ?? 300;
        this.agentPool.handleRateLimit(task.id, cooldownSeconds);
        this.scheduler.releaseTask(task.id);
        logWarning('Agent hit usage limit, imposing cooldown', {
          taskId: task.id,
          agent: agent.id,
          cooldownSeconds,
        });
        this.observer?.handleRateLimit?.(agent.id, agent.type, cooldownSeconds, result.output);
        return;
      }

      if (!result.success && result.failureType === 'network') {
        this.scheduler.releaseTask(task.id);
        this.agentPool.completeTask(task.id, false, result.durationSeconds, {
          failureType: 'network',
        });
        const metadata = {
          agent: agent.id,
          blocker_reason: 'network_offline',
          quality_score: 0,
          quality_issues: ['network_error'],
        };
        await this.stateMachine.transition(
          task.id,
          'blocked',
          metadata,
          this.stageCorrelation(executionCorrelation, 'network_failure')
        );
        logWarning('Network failure detected; task marked as blocked', {
          taskId: task.id,
          agent: agent.id,
        });
        this.observer?.handleNetworkFailure?.(task.id, agent.id, agent.type, result.output);
        return;
      }

      if (!result.success && result.failureType === 'context_limit') {
        this.scheduler.releaseTask(task.id);
        this.agentPool.completeTask(task.id, false, result.durationSeconds, {
          failureType: 'context_limit',
        });
        this.observer?.handleContextLimit?.(task.id, agent.id, agent.type);
        logWarning('Context limit encountered; marking task for manual follow-up', {
          taskId: task.id,
          agent: agent.id,
        });
        await this.stateMachine.transition(
          task.id,
          'needs_improvement',
          {
            agent: agent.id,
            quality_score: 0,
            quality_issues: ['context_limit'],
          },
          this.stageCorrelation(executionCorrelation, 'context_limit')
        );
        return;
      }

      if (!result.success && result.failureType === 'validation') {
        await this.handleValidationFailure(task, agent, result, executionCorrelation);
        return;
      }

      await this.handleExecutionResult(
        task,
        agent,
        promptPackage.context,
        promptPackage.prompt,
        result,
        codexModelHint,
        executionCorrelation
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('No agents available')) {
        const now = Date.now();
        const lastLogged = this.agentCapacityWarnings.get(task.id) ?? 0;
        if (now - lastLogged > 30_000) {
          logWarning('All agents busy; deferring task dispatch', {
            taskId: task.id,
            availableAgents: this.agentPool.getAvailableAgents().length,
          });
          this.agentCapacityWarnings.set(task.id, now);
        }
        this.scheduler.releaseTask(task.id);
        return;
      }
      logError('Task dispatch failed', { taskId: task.id, error: message });
      this.scheduler.releaseTask(task.id);
      throw error;
    } finally {
      this.activeExecutions.delete(task.id);
      this.dispatching.delete(task.id); // Remove from race guard
      this.scheduleTick();
    }
  }

  private async handleExecutionResult(
    task: Task,
    agent: Agent,
    context: AssembledContext,
    prompt: string,
    result: ExecutionOutcome,
    codexModelHint?: ReturnType<typeof selectCodexModel>,
    executionCorrelation?: string
  ): Promise<void> {
    const correlationId =
      executionCorrelation ??
      this.activeExecutions.get(task.id)?.correlationId ??
      this.createExecutionCorrelation(task.id);
    const stage = (name: string) => this.stageCorrelation(correlationId, name);

    this.agentPool.completeTask(task.id, result.success, result.durationSeconds, {
      failureType: result.success ? undefined : result.failureType,
      retryAfterSeconds: result.retryAfterSeconds,
    });

    const qualityInput: QualityCheckInput = {
      task,
      agentId: agent.id,
      agentType: agent.type,
      success: result.success,
      durationSeconds: result.durationSeconds,
      outputExcerpt: result.output.slice(0, 4000),
    };

    const qualityResult = await this.qualityMonitor.evaluate(qualityInput);

    const baseSuccess = result.success && qualityResult.status !== 'fail';
    let finalStatus: FinalExecutionStatus;

    if (!baseSuccess) {
      finalStatus = 'needs_improvement';
    } else if (task.status === 'needs_review' || agent.type === 'claude_code') {
      finalStatus = 'done';
    } else {
      finalStatus = 'needs_review';
    }

    let criticOutcome:
      | Awaited<ReturnType<CriticEnforcer['enforce']>>
      | undefined;
    let criticIssues: string[] = [];

    if (baseSuccess) {
      criticOutcome = await this.criticEnforcer.enforce(task.id);
      if (criticOutcome.required.length > 0 && !criticOutcome.passed) {
        criticIssues = criticOutcome.failedCritics.map((critic) => `critic_failed:${critic}`);
        finalStatus = 'needs_improvement';
      }
    }

    const combinedIssues = [...qualityResult.issues, ...criticIssues];
    if (!result.success && result.failureType === 'validation') {
      combinedIssues.push('output_validation_failed');
    }

    const transitionMetadata: Record<string, unknown> = {
      agent: agent.id,
      quality_score: qualityResult.score,
    };
    if (criticOutcome?.required?.length) {
      transitionMetadata.required_critics = criticOutcome.required;
    }

    if (finalStatus === 'needs_improvement') {
      transitionMetadata.quality_issues = combinedIssues;
      await this.stateMachine.transition(task.id, 'needs_improvement', transitionMetadata, stage('needs_improvement'));
      this.scheduler.releaseTask(task.id);
      logWarning('Task requires additional work', {
        taskId: task.id,
        agent: agent.id,
        issues: combinedIssues,
      });
    } else if (finalStatus === 'done') {
      await this.stateMachine.transition(task.id, 'done', transitionMetadata, stage('done'));
      this.scheduler.completeTask(task.id);
      logInfo('Task completed', { taskId: task.id, agent: agent.id, status: 'done' });

      // Check for self-modification and trigger restart if needed
      if (this.selfImprovementManager) {
        const selfModified = await this.selfImprovementManager.checkForSelfModification(task);

        if (selfModified) {
          // Only restart if all critics passed (safe to apply changes)
          const safeToRestart = !criticOutcome || criticOutcome.passed;

          if (safeToRestart) {
            logInfo('Orchestrator self-modification detected, preparing restart', {
              taskId: task.id,
              taskTitle: task.title,
            });

            // Schedule restart after current execution completes
            queueMicrotask(async () => {
              const restarted = await this.selfImprovementManager!.executeRestart(
                task.id,
                `Self-modification: ${task.title}`
              );

              if (restarted) {
                // Note: This process will be replaced by the restart
                // New process will resume from SQLite state
                logInfo('Restart successful, new process will take over');
              }
            });
          } else {
            logWarning('Self-modification detected but critics failed, skipping restart', {
              taskId: task.id,
              failedCritics: criticOutcome?.failedCritics,
            });
          }
        }
      }
    } else {
      await this.stateMachine.transition(task.id, 'needs_review', transitionMetadata, stage('needs_review'));
      this.scheduler.releaseTask(task.id);
      logInfo('Task ready for review', { taskId: task.id, agent: agent.id });
    }

    const reportedTokens = result.tokenUsage;
    const promptTokens = reportedTokens?.promptTokens ?? estimateTokenCount(prompt);
    const completionTokens =
      reportedTokens?.completionTokens ??
      (reportedTokens?.totalTokens
        ? Math.max(reportedTokens.totalTokens - promptTokens, 0)
        : estimateTokenCount(result.output));
    const totalTokens = reportedTokens?.totalTokens ?? promptTokens + completionTokens;
    const tokenEstimateStrategy: 'reported' | 'estimated' = reportedTokens ? 'reported' : 'estimated';

    const modelSlug = agent.type === 'codex' ? codexModelHint?.modelSlug : undefined;
    const tokenCostUSD = COST_TRACKING_DISABLED
      ? undefined
      : result.costUSD ??
        estimateModelCost(agent.type, modelSlug, promptTokens, completionTokens, this.modelManager);

    const coordinatorStatus =
      this.operationsManager?.getCoordinatorStatus() ?? {
        type: this.agentPool.getCoordinatorType(),
        available: this.agentPool.isCoordinatorAvailable(),
        reason:
          this.agentPool.getCoordinatorType() === 'claude_code'
            ? 'primary'
            : 'failover:unknown',
      };

    const promptCache = result.promptCache;
    const promptCacheStatus: PromptCacheStatus | 'unknown' = promptCache?.status ?? 'unknown';
    const promptCacheHit = promptCache?.status === 'hit';
    const promptCacheStore = promptCache?.status === 'store';
    const promptCacheEligible =
      promptCache ? promptCache.status !== 'bypass' && promptCache.status !== 'error' : false;

    if (promptCache?.status === 'hit') {
      logInfo('Prompt cache hit detected', {
        taskId: task.id,
        agent: agent.id,
        agentType: agent.type,
        tier: promptCache.tier,
        cacheId: promptCache.cacheId,
      });
    } else if (promptCache?.status === 'store') {
      logInfo('Prompt cache store event', {
        taskId: task.id,
        agent: agent.id,
        agentType: agent.type,
        tier: promptCache.tier,
        cacheId: promptCache.cacheId,
      });
    } else if (promptCache?.status === 'error') {
      logWarning('Prompt cache error reported by provider', {
        taskId: task.id,
        agent: agent.id,
        agentType: agent.type,
        details: promptCache.rawLine,
      });
    }

    const summary: ExecutionSummary = {
      taskId: task.id,
      agentId: agent.id,
      agentType: agent.type,
      success: result.success,
      finalStatus,
      durationSeconds: result.durationSeconds,
      qualityScore: qualityResult.score,
      issues: combinedIssues,
      timestamp: Date.now(),
      projectPhase: context.projectPhase,
      coordinatorType: coordinatorStatus.type,
      coordinatorReason: coordinatorStatus.reason,
      coordinatorAvailable: coordinatorStatus.available,
      codexPreset: agent.type === 'codex' ? codexModelHint?.presetId : undefined,
      codexModel: agent.type === 'codex' ? codexModelHint?.modelSlug : undefined,
      codexReasoning: agent.type === 'codex' ? codexModelHint?.reasoning : undefined,
      promptTokens,
      completionTokens,
      totalTokens,
      tokenCostUSD,
      tokenEstimateStrategy,
      criticsRequired: criticOutcome?.required?.length ? criticOutcome.required : undefined,
      criticsFailed:
        criticOutcome && criticOutcome.failedCritics.length > 0 ? criticOutcome.failedCritics : undefined,
      correlationId,
      failureType: result.success ? undefined : result.failureType ?? 'other',
      promptCacheStatus: promptCache ? promptCacheStatus : undefined,
      promptCacheTier: promptCache?.tier,
      promptCacheId: promptCache?.cacheId,
      promptCacheHit: promptCache ? promptCacheHit : undefined,
      promptCacheStore: promptCache ? promptCacheStore : undefined,
      promptCacheEligible: promptCache ? promptCacheEligible : undefined,
      promptCacheRaw: promptCache?.rawLine,
    };

    this.emit('execution:completed', summary);
    this.observer?.recordExecution(summary);

    if (result.success) {
      this.resilienceManager.resetRetries(task.id);
    }
  }

  private computeAssignmentOptions(
    task: Task,
    snapshot: OperationsSnapshot | undefined,
    codexSelection: ReturnType<typeof selectCodexModel>
  ): AssignmentOptions | undefined {
    const options: AssignmentOptions = {};
    const reasons: string[] = [];

    const claudeAvailable = this.agentPool.hasAvailableAgent('claude_code');
    const codexAvailable = this.agentPool.hasAvailableAgent('codex');

    const claudeRatePressure = (snapshot?.rateLimitClaude ?? 0) >= 2;
    const codexRatePressure = (snapshot?.rateLimitCodex ?? 0) >= 3;
    const elevatedFailure = (snapshot?.failureRate ?? 0) > 0.35;

    if (task.status === 'needs_review') {
      if (!claudeAvailable) {
        options.forceAgentType = 'codex';
        reasons.push('claude_unavailable');
      } else if (claudeRatePressure) {
        options.forceAgentType = 'codex';
        reasons.push('claude_rate_pressure');
      }
    } else {
      const complexity = task.estimated_complexity ?? 5;
      const allowClaude = complexity <= 5 && codexSelection.profile !== 'high';
      if (allowClaude && claudeAvailable) {
        if (!codexAvailable) {
          options.preferAgentType = 'claude_code';
          reasons.push('codex_unavailable');
        } else if (codexRatePressure) {
          options.preferAgentType = 'claude_code';
          reasons.push('codex_rate_pressure');
        } else if (elevatedFailure) {
          options.preferAgentType = 'claude_code';
          reasons.push('codex_failure_rate');
        }
      }
    }

    if (reasons.length === 0) {
      return undefined;
    }

    options.rationale = reasons.join('+');
    return options;
  }

  private getPromptMode(): 'compact' | 'verbose' {
    return this.liveFlags.getValue('PROMPT_MODE') as 'compact' | 'verbose';
  }

  private resolvePromptIntent(status: Task['status']): PromptIntent {
    if (status === 'needs_review') return 'review';
    if (status === 'needs_improvement') return 'remediation';
    return 'execute';
  }

  private buildStandardPromptHeader(
    task: Task,
    agent: Agent,
    context: AssembledContext,
    promptMode: 'compact' | 'verbose',
  ): string {
    const projectName = process.env.WVO_PROJECT_NAME?.trim() || 'WeatherVane';
    const environment = process.env.WVO_ENVIRONMENT?.trim() || 'production';

    return standardPromptHeader({
      projectName,
      projectPhase: context.projectPhase,
      environment,
      promptMode,
      agentType: agent.type,
      agentRole: agent.role,
      intent: this.resolvePromptIntent(task.status),
    });
  }

  private buildPromptHeader(
    task: Task,
    agent: Agent,
    options: {
      reason: SchedulingReason;
      batch?: BatchInfo;
      operations?: OperationsSnapshot;
    },
  ): string {
    const reasonLabels: Record<SchedulingReason, string> = {
      requires_review: 'Review queue',
      requires_follow_up: 'Fix-up queue',
      dependencies_cleared: 'Ready queue',
    };

    const agentDescriptor =
      agent.type === 'codex'
        ? `Codex • ${agent.role}`
        : `Claude Code • ${agent.role}`;

    const batch = options.batch;
    const reasonLabel = reasonLabels[options.reason];
    const reasonLine = batch
      ? `${reasonLabel} — batch ${batch.position} of ${batch.size}`
      : reasonLabel;

    const queueSummary = options.operations
      ? `Queue: total ${options.operations.queueLength} | review ${options.operations.queue.review_count} | fix-ups ${options.operations.queue.improvement_count} | ready ${options.operations.queue.ready_count}`
      : undefined;

    const tokenLine = options.operations?.tokenMetrics
      ? `Token budget: ≤${options.operations.tokenMetrics.targetPromptBudget} tokens (pressure: ${options.operations.tokenMetrics.pressure})`
      : `Token budget: ≤${MAX_PROMPT_TOKENS} tokens`;

    const operationsLine = options.operations
      ? `Operations mode: ${options.operations.mode} | Health: ${options.operations.health_status}`
      : undefined;

    const lines = [
      '### WeatherVane Execution Brief',
      `Task: [${task.id}] ${task.title}`,
      `Agent: ${agent.id} (${agentDescriptor})`,
      `Queue reason: ${reasonLine}`,
    ];

    if (queueSummary) {
      lines.push(queueSummary);
    }
    lines.push(tokenLine);
    if (operationsLine) {
      lines.push(operationsLine);
    }

    return lines.join('\n');
  }

  private buildDirective(task: Task, agent: Agent): string {
    const base = `You are ${agent.type === 'claude_code' ? 'Claude Code' : 'Codex'}, working inside a shared repository.`;

    if (task.status === 'needs_review') {
      return `${base}\n\nPerform a rigorous review of the changes for task [${task.id}] and either approve or describe required follow-up work.`;
    }

    if (task.status === 'needs_improvement') {
      const metadata = (task.metadata ?? {}) as Record<string, unknown>;
      const notedIssues = Array.isArray(metadata['quality_issues'])
        ? (metadata['quality_issues'] as unknown[]).map(String).join('; ')
        : 'Resolve the issues noted in the previous attempt.';
      return `${base}\n\nPrevious attempt flagged issues: ${notedIssues}\n\nFix the task and ensure all quality gates pass.`;
    }

    return `${base}\n\nImplement the work for task [${task.id}] as described above. Keep changes focused, add necessary tests, and ensure all tooling passes.`;
  }

  private async preparePrompt(
    task: Task,
    agent: Agent,
    initialContext: AssembledContext,
    strategies: ReadonlyArray<{
      includeCodeContext: boolean;
      includeQualityHistory: boolean;
      maxDecisions: number;
      maxLearnings: number;
      hoursBack: number;
    }>,
    promptOptions: {
      reason: SchedulingReason;
      batch?: BatchInfo;
      operations?: OperationsSnapshot;
    },
  ): Promise<{ context: AssembledContext; prompt: string }> {
    const targetPromptBudget = Math.min(
      MAX_PROMPT_TOKENS,
      promptOptions.operations?.tokenMetrics?.targetPromptBudget ?? MAX_PROMPT_TOKENS,
    );

    let lastContext = initialContext;
    let lastPrompt = this.composePrompt(task, agent, initialContext, promptOptions);
    let lastTokens = estimateTokenCount(lastPrompt);

    if (lastTokens <= targetPromptBudget && lastPrompt.length <= MAX_PROMPT_CHARACTERS) {
      return { context: initialContext, prompt: lastPrompt };
    }

    for (let index = 1; index < strategies.length; index++) {
      const options = strategies[index];
      const context = await this.contextAssembler.assembleForTask(task.id, options);
      const prompt = this.composePrompt(task, agent, context, promptOptions);
      const tokenEstimate = estimateTokenCount(prompt);
      lastContext = context;
      lastPrompt = prompt;
      lastTokens = tokenEstimate;

      if (tokenEstimate <= targetPromptBudget && prompt.length <= MAX_PROMPT_CHARACTERS) {
        return { context, prompt };
      }
    }

    const minimalContext = await this.contextAssembler.assembleForTask(task.id, {
      includeCodeContext: agent.type === 'codex',
      includeQualityHistory: false,
      maxDecisions: 1,
      maxLearnings: 1,
      hoursBack: Math.min(6, strategies[strategies.length - 1]?.hoursBack ?? 6),
    });
    const minimalPrompt = this.composeMinimalPrompt(task, agent, minimalContext, promptOptions);
    const minimalTokens = estimateTokenCount(minimalPrompt);
    const minimalLength = minimalPrompt.length;

    logWarning('Prompt exceeded compact budget; using minimal context', {
      taskId: task.id,
      previousTokens: lastTokens,
      minimalTokens,
      minimalLength,
      targetPromptBudget,
    });

    if (minimalTokens > targetPromptBudget || minimalLength > MAX_PROMPT_CHARACTERS) {
      logWarning('Minimal prompt still above target; proceeding with best effort', {
        taskId: task.id,
        tokens: minimalTokens,
        characters: minimalLength,
        targetPromptBudget,
      });
    }

    return { context: minimalContext, prompt: minimalPrompt };
  }

  private composePrompt(
    task: Task,
    agent: Agent,
    context: AssembledContext,
    options: {
      reason: SchedulingReason;
      batch?: BatchInfo;
      operations?: OperationsSnapshot;
    },
  ): string {
    const promptMode = this.getPromptMode();
    const useCompact = promptMode !== 'verbose';
    const contextBlock = useCompact
      ? this.contextAssembler.formatForPromptCompact(context)
      : this.contextAssembler.formatForPrompt(context);
    const contextSection = useCompact
      ? `## Evidence Pack (compact)\n${contextBlock}`
      : contextBlock;
    const directive = this.buildDirective(task, agent);
    const standardHeader = this.buildStandardPromptHeader(task, agent, context, promptMode);
    const executionBrief = this.buildPromptHeader(task, agent, options);
    return `${standardHeader}\n\n${executionBrief}\n\n${contextSection}\n\n---\n\n${directive}`;
  }

  private async handleValidationFailure(
    task: Task,
    agent: Agent,
    result: ExecutionOutcome,
    executionCorrelation: string
  ): Promise<void> {
    const attemptNumber = this.resilienceManager.getAttemptNumber(task.id);
    const validationSettings = resolveOutputValidationSettings();
    const recovery = await this.resilienceManager.handleFailure({
      taskId: task.id,
      agentId: agent.id,
      failureType: 'validation',
      retryAfterSeconds: result.retryAfterSeconds,
      attemptNumber,
      originalError: result.output,
    });

    this.operationsManager?.recordValidationRecovery({
      taskId: task.id,
      agentType: agent.type,
      action: recovery.action,
      mode: validationSettings.effectiveMode,
      enforced: validationSettings.effectiveMode !== 'disabled',
      reasoning: recovery.reasoning,
      delaySeconds: recovery.delaySeconds,
    });

    this.agentPool.completeTask(task.id, false, result.durationSeconds, {
      failureType: 'validation',
    });

    if (recovery.action === 'fail_task') {
      const metadata: Record<string, unknown> = {
        agent: agent.id,
        quality_score: 0,
        quality_issues: ['output_validation_failed'],
        recovery_reason: recovery.reasoning,
      };
      await this.stateMachine.transition(
        task.id,
        'needs_improvement',
        metadata,
        this.stageCorrelation(executionCorrelation, 'validation_failed')
      );
      this.scheduler.releaseTask(task.id);
      logWarning('Validation failures exhausted retries; task requires follow-up', {
        taskId: task.id,
        agent: agent.id,
        reasoning: recovery.reasoning,
      });
      return;
    }

    this.scheduler.releaseTask(task.id);

    logInfo('Validation failure recovery scheduled', {
      taskId: task.id,
      agent: agent.id,
      action: recovery.action,
      reasoning: recovery.reasoning,
      delaySeconds: recovery.delaySeconds ?? 0,
      requestedAgentType: recovery.newAgentType,
    });
  }

  private composeMinimalPrompt(
    task: Task,
    agent: Agent,
    context: AssembledContext,
    options: {
      reason: SchedulingReason;
      batch?: BatchInfo;
      operations?: OperationsSnapshot;
    },
  ): string {
    const sections: string[] = [];

    const summary = [
      '## Current Task',
      `**${this.clampText(`[${task.id}] ${task.title}`, 140)}**`,
      task.description ? this.clampText(task.description, 200) : '',
      `Status: ${task.status} | Complexity: ${task.estimated_complexity ?? 'TBD'}`
    ].filter(Boolean).join('\n');
    sections.push(summary);

    if (context.relevantDecisions.length > 0) {
      const decision = context.relevantDecisions[0];
      sections.push(`## Key Decision\n- ${this.clampText(`${decision.topic}: ${decision.content}`, 200)}`);
    }

    if (context.relevantConstraints.length > 0) {
      const constraint = context.relevantConstraints[0];
      sections.push(`## Constraint\n- ${this.clampText(`${constraint.topic}: ${constraint.content}`, 200)}`);
    }

    if (context.recentLearnings.length > 0) {
      const learning = context.recentLearnings[0];
      sections.push(`## Learning\n- ${this.clampText(`${learning.topic}: ${learning.content}`, 200)}`);
    }

    if (context.filesToRead && context.filesToRead.length > 0) {
      sections.push(`## File\n- ${this.clampText(context.filesToRead[0], 160)}`);
    }

    const directive = this.buildDirective(task, agent);
    const promptMode = this.getPromptMode();
    const standardHeader = this.buildStandardPromptHeader(task, agent, context, promptMode);
    const executionBrief = this.buildPromptHeader(task, agent, options);
    return `${standardHeader}\n\n${executionBrief}\n\n${sections.join('\n\n')}\n\n---\n\n${directive}`;
  }

  private clampText(text: string, maxLength = 200): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }
    const truncated = normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd();
    return `${truncated}...`;
  }

  private getContextStrategies(
    agentType: AgentType,
    pressure: OperationsSnapshot['tokenMetrics']['pressure'] | undefined = 'normal',
  ): ReadonlyArray<{
    includeCodeContext: boolean;
    includeQualityHistory: boolean;
    maxDecisions: number;
    maxLearnings: number;
    hoursBack: number;
  }> {
    const includeCodeByDefault = agentType === 'codex';

    if (pressure === 'critical') {
      return [
        { includeCodeContext: includeCodeByDefault, includeQualityHistory: false, maxDecisions: 3, maxLearnings: 1, hoursBack: 6 },
        { includeCodeContext: includeCodeByDefault, includeQualityHistory: false, maxDecisions: 2, maxLearnings: 1, hoursBack: 4 },
        { includeCodeContext: includeCodeByDefault, includeQualityHistory: false, maxDecisions: 1, maxLearnings: 0, hoursBack: 2 },
      ];
    }

    if (pressure === 'elevated') {
      return [
        { includeCodeContext: true, includeQualityHistory: agentType !== 'codex', maxDecisions: 5, maxLearnings: 2, hoursBack: 18 },
        { includeCodeContext: includeCodeByDefault, includeQualityHistory: false, maxDecisions: 4, maxLearnings: 2, hoursBack: 12 },
        { includeCodeContext: includeCodeByDefault, includeQualityHistory: false, maxDecisions: 2, maxLearnings: 1, hoursBack: 8 },
        { includeCodeContext: includeCodeByDefault, includeQualityHistory: false, maxDecisions: 1, maxLearnings: 1, hoursBack: 6 },
      ];
    }

    return [
      { includeCodeContext: true, includeQualityHistory: true, maxDecisions: 6, maxLearnings: 3, hoursBack: 24 },
      { includeCodeContext: true, includeQualityHistory: true, maxDecisions: 4, maxLearnings: 2, hoursBack: 12 },
      { includeCodeContext: true, includeQualityHistory: false, maxDecisions: 3, maxLearnings: 2, hoursBack: 12 },
      { includeCodeContext: includeCodeByDefault, includeQualityHistory: false, maxDecisions: 2, maxLearnings: 1, hoursBack: 6 },
    ];
  }
}
