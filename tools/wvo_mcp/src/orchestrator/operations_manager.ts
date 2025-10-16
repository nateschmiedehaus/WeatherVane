import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import type { AgentPool, AgentType, OutputValidationFailureEvent } from './agent_pool.js';
import type { ExecutionObserver, ExecutionSummary } from './claude_code_coordinator.js';
import type { QualityMonitor } from './quality_monitor.js';
import type {
  PriorityProfile,
  TaskScheduler,
  QueueMetrics,
  SchedulingReason,
} from './task_scheduler.js';
import type { StateMachine } from './state_machine.js';
import type { CodexPresetPerformance } from './model_selector.js';
import { logInfo, logWarning } from '../telemetry/logger.js';
import { TelemetryExporter } from '../telemetry/telemetry_exporter.js';
import { buildExecutionTelemetryRecord } from '../telemetry/execution_telemetry.js';
import { resolveOutputValidationSettings, type OutputValidationMode } from '../utils/output_validator.js';
import type { LiveFlagsReader } from './live_flags.js';

interface OperationsManagerOptions {
  targetCodexRatio?: number;
  historySize?: number;
  qualityWindow?: number;
  liveFlags?: LiveFlagsReader;
}

export interface OperationsSnapshot {
  avgQuality: number;
  failureRate: number;
  codexUsagePercent: number;
  claudeUsagePercent: number;
  codexToClaudeRatio: number;
  queueLength: number;
  blockedTasks: number;
  totalTasks: number;
  mode: StrategyMode;
  timestamp: number;
  rateLimitCodex: number;
  rateLimitClaude: number;
  coordinatorType: AgentType;
  coordinatorAvailable: boolean;
  coordinatorReason: string;
  codexPresetStats: Record<string, CodexPresetPerformance>;
  // Additional properties for MCP status tool
  agent_pool: {
    total_agents: number;
    busy_agents: number;
    idle_agents: number;
    codex_usage_percent: number;
    claude_usage_percent: number;
  };
  queue: {
    ready_count: number;
    pending_count: number;
    review_count: number;
    improvement_count: number;
    batches: Array<{
      reason: SchedulingReason;
      label: string;
      size: number;
      heads: Array<{ id: string; title: string; priority: number }>;
    }>;
    resource: {
      heavy_limit: number;
      active_heavy: number;
      queued_heavy: number;
    };
  };
  quality: {
    total_executions: number;
    avg_duration_seconds: number;
  };
  health_status: string;
  webInspiration: {
    enabled: boolean;
    totalFetches: number;
    successes: number;
    failures: number;
    cacheHits: number;
    averageDurationMs: number;
    averageSizeKb: number;
    topCategories: Array<{ category: string; count: number }>;
  };
  networkFailureCount: number;
  tokenMetrics: {
    averagePromptTokens: number;
    averageCompletionTokens: number;
    averageTotalTokens: number;
    pressure: TokenPressureLevel;
    targetPromptBudget: number;
    cacheEligibleExecutions: number;
    cacheHitExecutions: number;
    cacheStoreExecutions: number;
    cacheHitRate: number;
  };
  validation: {
    totalFailures: number;
    failuresLastHour: number;
    recentFailureRate: number;
    failuresByCode: Record<string, number>;
    shadowFailures: number;
    enforcedFailures: number;
    mode: OutputValidationMode;
    canaryAcknowledged: boolean;
    retryRate: number;
    recoveries: {
      retries: number;
      reassignments: number;
      failures: number;
      lastRecoveryAt?: number;
    };
  };
  costs: CostSnapshot;
}

interface ProviderBudgetThreshold {
  dailyLimitUSD?: number;
  hourlyLimitUSD?: number;
  alertThresholdPercent: number;
}

interface ProviderCostMetrics {
  lastHourUSD: number;
  last24hUSD: number;
  hourlyUtilizationPercent: number | null;
  dailyUtilizationPercent: number | null;
  status: 'ok' | 'warning' | 'critical';
  budget: ProviderBudgetThreshold;
}

interface CostAlert {
  severity: 'warning' | 'critical';
  provider: AgentType;
  period: 'hourly' | 'daily';
  utilizationPercent: number;
  limitUSD: number;
  actualUSD: number;
  message: string;
}

interface CostSnapshot {
  lastUpdated: number;
  windowSeconds: number;
  lastHourUSD: number;
  last24hUSD: number;
  providers: Record<AgentType, ProviderCostMetrics>;
  alerts: CostAlert[];
}

type TokenPressureLevel = 'normal' | 'elevated' | 'critical';

type StrategyMode = 'balance' | 'stabilize' | 'accelerate';

type ResolvedOperationsOptions = {
  targetCodexRatio: number;
  historySize: number;
  qualityWindow: number;
};

const DEFAULT_OPTIONS: ResolvedOperationsOptions = {
  targetCodexRatio: 5,
  historySize: 50,
  qualityWindow: 20,
};

const BASE_STATUS_WEIGHTS: PriorityProfile['statusWeights'] = {
  needs_review: 105,
  needs_improvement: 95,
  pending: 60,
  in_progress: 0,
  blocked: -25,
  done: -40,
};

export class OperationsManager extends EventEmitter implements ExecutionObserver {
  private readonly options: ResolvedOperationsOptions;
  private readonly liveFlags?: LiveFlagsReader;
  private readonly executionHistory: ExecutionSummary[] = [];
  private currentMode: StrategyMode = 'balance';
  private lastSnapshot?: OperationsSnapshot;
  private coordinatorReason = 'primary';
  private lastProfileSignature = '';
  private lastBlockedAlert = 0;
  private readonly rateLimitCounters: Record<'codex' | 'claude_code', number> = {
    codex: 0,
    claude_code: 0,
  };
  private networkFailureCount = 0;
  private validationFailures = 0;
  private validationShadowFailures = 0;
  private validationEnforcedFailures = 0;
  private readonly validationFailureEvents: Array<{
    timestamp: number;
    agentType: AgentType;
    code?: string;
    mode: OutputValidationMode;
    enforced: boolean;
  }> = [];
  private readonly validationRecoveryTotals = {
    retries: 0,
    reassignments: 0,
    failures: 0,
  };
  private lastValidationRecoveryAt?: number;
  private readonly VALIDATION_WINDOW_MS = 60 * 60 * 1000;
  private readonly telemetryExporter: TelemetryExporter;
  private readonly executionTelemetryExporter: TelemetryExporter;
  private readonly webInspirationSummary = {
    enabled: process.env.WVO_ENABLE_WEB_INSPIRATION === '1',
    totalFetches: 0,
    successes: 0,
    failures: 0,
    cacheHits: 0,
    totalDurationMs: 0,
    totalSizeKb: 0,
    categories: {} as Record<string, number>
  };
  private lastSnapshotTime = 0;
  private readonly SNAPSHOT_THROTTLE_MS = 2000; // Max 1 snapshot per 2 seconds
  private readonly LOW_IMPACT_THROTTLE_MS = 10000;
  private readonly COORDINATOR_CHECK_INTERVAL = 30000;
  private coordinatorCheckTimer: NodeJS.Timeout | null = null;
  private readonly workspaceRoot: string;
  private readonly costEvents: Array<{ timestamp: number; agentType: AgentType; cost: number }> = [];
  private readonly COST_WINDOW_MS = 24 * 60 * 60 * 1000;
  private readonly costBudgets: Record<AgentType, ProviderBudgetThreshold>;
  private lastSnapshotExecutionCount = 0;
  private readonly budgetAlertDebounce: Record<string, number> = {};
  private readonly BUDGET_ALERT_DEBOUNCE_MS = 15 * 60 * 1000;
  private readonly budgetAlertContextDisabled =
    typeof process.env.WVO_DISABLE_BUDGET_CONTEXT_ALERTS === 'string' &&
    ['1', 'true', 'yes'].includes(process.env.WVO_DISABLE_BUDGET_CONTEXT_ALERTS.toLowerCase());

  // Store bound listeners for cleanup
  private readonly boundListeners = {
    qualityEvaluated: () => this.recomputeStrategy('quality'),
    queueUpdated: () => this.recomputeStrategy('queue'),
    taskTransition: () => this.recomputeStrategy('transition'),
    agentCooldown: (data: { agentId: string; agentType: AgentType; seconds: number; reason: string }) => {
      this.recomputeStrategy('cooldown');
      if (data.agentId === 'claude_code') {
        this.agentPool.promoteCoordinatorRole(`cooldown:${data.reason}:${data.seconds}s`);
      }
    },
    agentCooldownCleared: (data: { agentId: string; agentType: AgentType }) => {
      this.recomputeStrategy('cooldown_clear');
      if (data.agentId === 'claude_code') {
        this.checkCoordinatorAvailability('claude_available');
      }
    },
    coordinatorPromoted: (data: { from: string; to: string; reason?: string }) => {
      this.setCoordinatorReason(data?.reason ?? 'failover:unknown');
      this.recomputeStrategy('coordinator_promoted');
    },
    coordinatorDemoted: () => {
      this.setCoordinatorReason('primary');
      this.recomputeStrategy('coordinator_demoted');
    },
    validationFailed: (data: OutputValidationFailureEvent) => {
      this.recordValidationFailure(data);
    },
  };

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly scheduler: TaskScheduler,
    private readonly agentPool: AgentPool,
    private readonly qualityMonitor: QualityMonitor,
    options: OperationsManagerOptions = {}
  ) {
    super();
    this.options = {
      targetCodexRatio: options.targetCodexRatio ?? DEFAULT_OPTIONS.targetCodexRatio,
      historySize: options.historySize ?? DEFAULT_OPTIONS.historySize,
      qualityWindow: options.qualityWindow ?? DEFAULT_OPTIONS.qualityWindow,
    };
    this.liveFlags = options.liveFlags;
    const workspaceRoot = this.stateMachine.getWorkspaceRoot();
    this.workspaceRoot = workspaceRoot;
    this.costBudgets = this.loadBudgetThresholds(workspaceRoot);
    this.telemetryExporter = new TelemetryExporter(workspaceRoot, 'operations.jsonl');
    this.executionTelemetryExporter = new TelemetryExporter(workspaceRoot, 'executions.jsonl');

    // Archive telemetry on startup for fresh session metrics (unless explicitly disabled)
    const cleanTelemetry = process.env.WVO_CLEAN_TELEMETRY !== '0';
    if (cleanTelemetry) {
      void this.telemetryExporter.archiveAndReset();
      void this.executionTelemetryExporter.archiveAndReset();
    }

    this.qualityMonitor.on('quality:evaluated', this.boundListeners.qualityEvaluated);
    this.scheduler.on('queue:updated', this.boundListeners.queueUpdated);
    this.stateMachine.on('task:transition', this.boundListeners.taskTransition);
    this.agentPool.on('agent:cooldown', this.boundListeners.agentCooldown);
    this.agentPool.on('agent:cooldown_cleared', this.boundListeners.agentCooldownCleared);
    this.agentPool.on('coordinator:promoted', this.boundListeners.coordinatorPromoted);
    this.agentPool.on('coordinator:demoted', this.boundListeners.coordinatorDemoted);
    this.agentPool.on('output:validation_failed', this.boundListeners.validationFailed);
    this.coordinatorCheckTimer = setInterval(
      () => this.checkCoordinatorAvailability('periodic'),
      this.COORDINATOR_CHECK_INTERVAL
    );
    this.initializeCoordinatorReason();
  }

  /**
   * Clean up resources and event listeners
   */
  stop(): void {
    this.qualityMonitor.removeListener('quality:evaluated', this.boundListeners.qualityEvaluated);
    this.scheduler.removeListener('queue:updated', this.boundListeners.queueUpdated);
    this.stateMachine.removeListener('task:transition', this.boundListeners.taskTransition);
    this.agentPool.removeListener('agent:cooldown', this.boundListeners.agentCooldown);
    this.agentPool.removeListener('agent:cooldown_cleared', this.boundListeners.agentCooldownCleared);
    this.agentPool.removeListener('coordinator:promoted', this.boundListeners.coordinatorPromoted);
    this.agentPool.removeListener('coordinator:demoted', this.boundListeners.coordinatorDemoted);
    this.agentPool.removeListener('output:validation_failed', this.boundListeners.validationFailed);
    if (this.coordinatorCheckTimer) {
      clearInterval(this.coordinatorCheckTimer);
      this.coordinatorCheckTimer = null;
    }
    this.telemetryExporter.close();
    this.executionTelemetryExporter.close();
  }

  recordExecution(summary: ExecutionSummary): void {
    const status = this.getCoordinatorStatus();
    if (typeof summary.coordinatorAvailable !== 'boolean') {
      summary.coordinatorAvailable = status.available;
    }
    if (!summary.coordinatorType) {
      summary.coordinatorType = status.type;
      if (!summary.coordinatorReason) {
        summary.coordinatorReason = status.reason;
      }
    }
    this.executionHistory.push(summary);
    if (this.executionHistory.length > this.options.historySize) {
      this.executionHistory.shift();
    }
    this.emit('execution:recorded', summary);
    this.appendExecutionTelemetry(summary);
    this.recordCostEvent(summary.agentType, summary.tokenCostUSD, summary.timestamp);
    this.recomputeStrategy('execution');
  }

  private recordValidationFailure(event: OutputValidationFailureEvent): void {
    this.validationFailures += 1;
    if (event.mode === 'shadow') {
      this.validationShadowFailures += 1;
    } else if (event.mode === 'enforce') {
      this.validationEnforcedFailures += 1;
    }
    this.validationFailureEvents.push({
      timestamp: Date.now(),
      agentType: event.agentType,
      code: event.code,
      mode: event.mode,
      enforced: event.enforced,
    });
    this.pruneValidationFailures();
    this.recomputeStrategy('validation_failed');
  }

  recordValidationRecovery(event: {
    taskId: string;
    agentType: AgentType;
    action: 'retry' | 'reassign' | 'checkpoint_and_retry' | 'fail_task';
    mode: OutputValidationMode;
    enforced: boolean;
    reasoning?: string;
    delaySeconds?: number;
  }): void {
    this.lastValidationRecoveryAt = Date.now();
    if (event.action === 'retry' || event.action === 'checkpoint_and_retry') {
      this.validationRecoveryTotals.retries += 1;
    } else if (event.action === 'reassign') {
      this.validationRecoveryTotals.reassignments += 1;
    } else if (event.action === 'fail_task') {
      this.validationRecoveryTotals.failures += 1;
    }
  }

  private pruneValidationFailures(): void {
    const cutoff = Date.now() - this.VALIDATION_WINDOW_MS;
    while (this.validationFailureEvents.length > 0 && this.validationFailureEvents[0].timestamp < cutoff) {
      this.validationFailureEvents.shift();
    }
  }

  private checkCoordinatorAvailability(trigger: string): void {
    const currentCoordinator = this.agentPool.getCoordinatorType();
    if (currentCoordinator === 'claude_code') {
      return;
    }

    this.agentPool.demoteCoordinatorRole();

    const updatedCoordinator = this.agentPool.getCoordinatorType();
    if (updatedCoordinator === 'claude_code') {
      logInfo('Coordinator switched back to Claude Code', { trigger });
      this.emit('coordinator:switched', {
        from: 'codex',
        to: 'claude_code',
        trigger
      });
    }
  }

  recordWebInspiration(event: {
    url: string;
    success: boolean;
    cached: boolean;
    durationMs?: number;
    screenshotSizeKb?: number;
    htmlSizeKb?: number;
    category?: string;
  }): void {
    if (!this.webInspirationSummary.enabled) {
      return;
    }

    this.webInspirationSummary.totalFetches += 1;
    if (event.success) {
      this.webInspirationSummary.successes += 1;
      if (event.cached) {
        this.webInspirationSummary.cacheHits += 1;
      }
    } else {
      this.webInspirationSummary.failures += 1;
    }

    if (typeof event.durationMs === 'number') {
      this.webInspirationSummary.totalDurationMs += event.durationMs;
    }

    const sizeKb = (event.screenshotSizeKb ?? 0) + (event.htmlSizeKb ?? 0);
    this.webInspirationSummary.totalSizeKb += sizeKb;

    if (event.category) {
      const key = event.category.toLowerCase();
      this.webInspirationSummary.categories[key] = (this.webInspirationSummary.categories[key] ?? 0) + 1;
    }
  }

  getSnapshot(): OperationsSnapshot | undefined {
    return this.lastSnapshot ? { ...this.lastSnapshot } : undefined;
  }

  handleRateLimit(agentId: string, agentType: 'codex' | 'claude_code', retryAfterSeconds: number, message: string): void {
    this.rateLimitCounters[agentType] += 1;
    if (agentId === 'claude_code') {
      this.agentPool.promoteCoordinatorRole(`claude_rate_limit:${retryAfterSeconds}s`);
    }
    logWarning('Rate limit encountered', {
      agentId,
      agentType,
      retryAfterSeconds,
      message,
      counters: this.rateLimitCounters,
    });
    this.emit('maintenance:rate_limit', { agentId, agentType, retryAfterSeconds, message });
    this.recomputeStrategy('rate_limit');
  }

  handleContextLimit(taskId: string, agentId: string, agentType: 'codex' | 'claude_code'): void {
    logWarning('Context limit flagged for task', { taskId, agentId, agentType });
    this.emit('maintenance:context_limit', { taskId, agentId, agentType });
  }

  handleNetworkFailure(taskId: string, agentId: string, agentType: 'codex' | 'claude_code', message: string): void {
    this.networkFailureCount += 1;
    logWarning('Network failure detected during task execution', {
      taskId,
      agentId,
      agentType,
      message,
      failureCount: this.networkFailureCount,
    });
    this.emit('maintenance:network_failure', { taskId, agentId, agentType, message });
  }

  private appendExecutionTelemetry(summary: ExecutionSummary): void {
    const record = buildExecutionTelemetryRecord(summary);
    this.executionTelemetryExporter.append(record as unknown as Record<string, unknown>);
  }

  private recomputeStrategy(reason: string): void {
    const now = Date.now();

    if (this.shouldSkipSnapshot(reason, now)) {
      return;
    }

    const snapshot = this.buildSnapshot();
    if (!snapshot) {
      return;
    }

    if (this.efficientOpsEnabled() && !this.isSignificantChange(snapshot, this.lastSnapshot)) {
      this.lastSnapshotTime = now;
      this.lastSnapshot = snapshot;
      this.lastSnapshotExecutionCount = this.executionHistory.length;
      return;
    }

    const newMode = this.determineMode(snapshot);
    this.currentMode = newMode;
    snapshot.mode = newMode;

    this.lastSnapshotTime = now;
    this.lastSnapshot = snapshot;
    this.lastSnapshotExecutionCount = this.executionHistory.length;
    this.emitTelemetry(snapshot);
    this.evaluateBudgetAlerts(snapshot.costs);

    const profile = this.buildPriorityProfile(snapshot);
    const signature = JSON.stringify(profile);

    if (signature !== this.lastProfileSignature) {
      this.scheduler.setPriorityProfile(profile);
      this.lastProfileSignature = signature;
      logInfo('Scheduler priority profile updated', {
        reason,
        mode: snapshot.mode,
        profile,
      });
      this.emit('profile:updated', { profile, snapshot });
    }

    this.evaluateMaintenance(snapshot);
  }

  private efficientOpsEnabled(): boolean {
    return this.liveFlags?.getValue('EFFICIENT_OPERATIONS') === '1';
  }

  private shouldSkipSnapshot(reason: string, now: number): boolean {
    const elapsed = now - this.lastSnapshotTime;
    if (!this.efficientOpsEnabled()) {
      return elapsed < this.SNAPSHOT_THROTTLE_MS && Boolean(this.lastSnapshot);
    }

    const lowImpactReasons = new Set(['queue', 'transition', 'cooldown', 'cooldown_clear']);
    const throttle = lowImpactReasons.has(reason) ? this.LOW_IMPACT_THROTTLE_MS : this.SNAPSHOT_THROTTLE_MS;
    if (elapsed < throttle && this.lastSnapshot) {
      return true;
    }

    if (!this.executionHistoryChangedSinceSnapshot() && reason !== 'coordinator_promoted' && reason !== 'coordinator_demoted') {
      return true;
    }

    return false;
  }

  private executionHistoryChangedSinceSnapshot(): boolean {
    return this.executionHistory.length !== this.lastSnapshotExecutionCount;
  }

  private isSignificantChange(next: OperationsSnapshot, previous?: OperationsSnapshot): boolean {
    if (!previous) return true;
    const deltaQuality = Math.abs(next.avgQuality - previous.avgQuality);
    const deltaFailure = Math.abs(next.failureRate - previous.failureRate);
    const deltaQueue = Math.abs(next.queueLength - previous.queueLength);
    const deltaTokens = Math.abs(next.tokenMetrics.averageTotalTokens - previous.tokenMetrics.averageTotalTokens);
    const modeChanged = next.mode !== previous.mode;
    const blockedChanged = Math.abs(next.blockedTasks - previous.blockedTasks);

    return (
      modeChanged ||
      deltaQuality > 0.01 ||
      deltaFailure > 0.01 ||
      deltaQueue >= 1 ||
      deltaTokens > 10 ||
      blockedChanged >= 1
    );
  }

  private buildSnapshot(): OperationsSnapshot | undefined {
    const recent = this.executionHistory.slice(-this.options.qualityWindow);
    this.pruneValidationFailures();
    const avgQuality =
      recent.length > 0
        ? recent.reduce((sum, item) => sum + item.qualityScore, 0) / recent.length
        : this.stateMachine.getAverageQualityScore();

    const failureRate =
      recent.length > 0
        ? recent.filter((item) => item.finalStatus === 'needs_improvement').length / recent.length
        : 0;

    const usage = this.agentPool.getUsageRatio();
    const totalAgentCompletions = usage.codex + usage.claude;
    const codexUsagePercent = totalAgentCompletions > 0 ? (usage.codex / totalAgentCompletions) * 100 : 0;
    const claudeUsagePercent = totalAgentCompletions > 0 ? (usage.claude / totalAgentCompletions) * 100 : 0;
    const queueLength = this.scheduler.getQueueLength();
    const health = this.stateMachine.getRoadmapHealth();
    const codexPresetStats = this.computeCodexPresetStats(recent);
    const queueMetrics = this.scheduler.getQueueMetrics();
    const tokenMetrics = this.computeTokenMetrics(recent);
    const costMetrics = this.computeCostMetrics();
    const recentValidationFailures = recent.filter((item) => item.failureType === 'validation').length;
    const validationFailureRate =
      recent.length > 0 ? recentValidationFailures / recent.length : 0;
    const failuresByCode = this.validationFailureEvents.reduce<Record<string, number>>((acc, event) => {
      const key = event.code ?? 'unknown';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const validationSettings = resolveOutputValidationSettings();
    const retriesLastWindow = recent.filter((item) => !item.success).length;
    const retryRate = recent.length > 0 ? retriesLastWindow / recent.length : 0;

    const totalAgents = this.agentPool.getAvailableAgents().length + usage.codex + usage.claude;
    const busyAgents = usage.codex + usage.claude;
    const idleAgents = this.agentPool.getAvailableAgents().length;
    const coordinatorStatus = this.getCoordinatorStatus();

    return {
      avgQuality,
      failureRate,
      codexUsagePercent,
      claudeUsagePercent,
      codexToClaudeRatio: usage.ratio,
      queueLength,
      blockedTasks: health.blockedTasks,
      totalTasks: health.totalTasks,
      mode: this.currentMode,
      timestamp: Date.now(),
      rateLimitCodex: this.rateLimitCounters.codex,
      rateLimitClaude: this.rateLimitCounters.claude_code,
      coordinatorType: coordinatorStatus.type,
      coordinatorAvailable: coordinatorStatus.available,
      coordinatorReason: coordinatorStatus.reason,
      codexPresetStats,
      agent_pool: {
        total_agents: totalAgents,
        busy_agents: busyAgents,
        idle_agents: idleAgents,
        codex_usage_percent: codexUsagePercent,
        claude_usage_percent: claudeUsagePercent
      },
      queue: {
        ready_count: queueMetrics.reasonCounts.dependencies_cleared,
        pending_count: health.pendingTasks,
        review_count: queueMetrics.reasonCounts.requires_review,
        improvement_count: queueMetrics.reasonCounts.requires_follow_up,
        batches: this.formatQueueBatches(queueMetrics),
        resource: {
          heavy_limit: queueMetrics.resource.heavyTaskLimit,
          active_heavy: queueMetrics.resource.activeHeavyTasks,
          queued_heavy: queueMetrics.resource.queuedHeavyTasks,
        },
      },
      quality: {
        total_executions: recent.length,
        avg_duration_seconds: recent.length > 0
          ? recent.reduce((sum, r) => sum + r.durationSeconds, 0) / recent.length
          : 0
      },
      health_status: health.averageQualityScore >= 0.85 && failureRate < 0.2 ? 'healthy' : 'degraded',
      webInspiration: {
        enabled: this.webInspirationSummary.enabled,
        totalFetches: this.webInspirationSummary.totalFetches,
        successes: this.webInspirationSummary.successes,
        failures: this.webInspirationSummary.failures,
        cacheHits: this.webInspirationSummary.cacheHits,
        averageDurationMs:
          this.webInspirationSummary.totalFetches > 0
            ? Math.round(this.webInspirationSummary.totalDurationMs / this.webInspirationSummary.totalFetches)
            : 0,
        averageSizeKb:
          this.webInspirationSummary.totalFetches > 0
            ? Math.round(this.webInspirationSummary.totalSizeKb / this.webInspirationSummary.totalFetches)
            : 0,
        topCategories: this.getTopWebInspirationCategories()
      },
      networkFailureCount: this.networkFailureCount,
      tokenMetrics,
      validation: {
        totalFailures: this.validationFailures,
        failuresLastHour: this.validationFailureEvents.length,
        recentFailureRate: validationFailureRate,
        failuresByCode,
        shadowFailures: this.validationShadowFailures,
        enforcedFailures: this.validationEnforcedFailures,
        mode: validationSettings.effectiveMode,
        canaryAcknowledged: validationSettings.canaryAcknowledged,
        retryRate,
        recoveries: {
          retries: this.validationRecoveryTotals.retries,
          reassignments: this.validationRecoveryTotals.reassignments,
          failures: this.validationRecoveryTotals.failures,
          lastRecoveryAt: this.lastValidationRecoveryAt,
        },
      },
      costs: costMetrics,
    };
  }

  private computeCodexPresetStats(executions: ExecutionSummary[]): Record<string, CodexPresetPerformance> {
    const groups = new Map<string, ExecutionSummary[]>();
    for (const execution of executions) {
      if (execution.agentType !== 'codex' || !execution.codexPreset) continue;
      const bucket = groups.get(execution.codexPreset);
      if (bucket) {
        bucket.push(execution);
      } else {
        groups.set(execution.codexPreset, [execution]);
      }
    }

    const stats: Record<string, CodexPresetPerformance> = {};

    for (const [preset, executionsForPreset] of groups.entries()) {
      const sampleSize = executionsForPreset.length;
      if (sampleSize === 0) continue;

      const successCount = executionsForPreset.filter(
        (item) => item.success && item.finalStatus !== 'needs_improvement'
      ).length;
      const avgQuality =
        executionsForPreset.reduce((sum, item) => sum + (item.qualityScore ?? 0), 0) / sampleSize;
      const avgTotalTokens =
        executionsForPreset.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0) / sampleSize;
      const costValues = executionsForPreset
        .map((item) => item.tokenCostUSD)
        .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value));

      stats[preset] = {
        sampleSize,
        successRate: sampleSize > 0 ? successCount / sampleSize : 0,
        avgQuality,
        avgTotalTokens,
        avgCostUSD:
          costValues.length > 0
            ? costValues.reduce((sum, value) => sum + value, 0) / costValues.length
            : undefined,
      };
    }

    return stats;
  }

  private emitTelemetry(snapshot: OperationsSnapshot): void {
    const record: Record<string, unknown> = {
      type: 'operations_snapshot',
      mode: snapshot.mode,
      avgQuality: Number(snapshot.avgQuality.toFixed(3)),
      failureRate: Number(snapshot.failureRate.toFixed(3)),
      queueLength: snapshot.queueLength,
      codexUsagePercent: Number(snapshot.codexUsagePercent.toFixed(2)),
      claudeUsagePercent: Number(snapshot.claudeUsagePercent.toFixed(2)),
      blockedTasks: snapshot.blockedTasks,
      totalTasks: snapshot.totalTasks,
      rateLimitCodex: snapshot.rateLimitCodex,
      rateLimitClaude: snapshot.rateLimitClaude,
      coordinatorType: snapshot.coordinatorType,
      coordinatorAvailable: snapshot.coordinatorAvailable,
      coordinatorReason: snapshot.coordinatorReason,
      webInspiration: snapshot.webInspiration,
      queueBatches: snapshot.queue.batches,
      queueResource: snapshot.queue.resource,
      tokenMetrics: {
        avgPrompt: Number(snapshot.tokenMetrics.averagePromptTokens.toFixed(1)),
        avgCompletion: Number(snapshot.tokenMetrics.averageCompletionTokens.toFixed(1)),
        avgTotal: Number(snapshot.tokenMetrics.averageTotalTokens.toFixed(1)),
        pressure: snapshot.tokenMetrics.pressure,
        targetBudget: snapshot.tokenMetrics.targetPromptBudget,
        cacheEligible: snapshot.tokenMetrics.cacheEligibleExecutions,
        cacheHits: snapshot.tokenMetrics.cacheHitExecutions,
        cacheStores: snapshot.tokenMetrics.cacheStoreExecutions,
        cacheHitRate: Number(snapshot.tokenMetrics.cacheHitRate.toFixed(3)),
      },
      validation: {
        totalFailures: snapshot.validation.totalFailures,
        failuresLastHour: snapshot.validation.failuresLastHour,
        recentFailureRate: Number(snapshot.validation.recentFailureRate.toFixed(3)),
        failuresByCode: snapshot.validation.failuresByCode,
        shadowFailures: snapshot.validation.shadowFailures,
        enforcedFailures: snapshot.validation.enforcedFailures,
        mode: snapshot.validation.mode,
        canaryAcknowledged: snapshot.validation.canaryAcknowledged,
        retryRate: Number(snapshot.validation.retryRate.toFixed(3)),
        recoveries: snapshot.validation.recoveries,
      },
      costMetrics: this.formatCostTelemetry(snapshot.costs),
      budgetPressure: this.getBudgetPressure(snapshot.costs),
    };

    const presetMix = this.formatPresetMix(snapshot.codexPresetStats);
    if (presetMix.length > 0) {
      record.presetMix = presetMix;
    }

    this.telemetryExporter.append(record);
  }

  private formatPresetMix(stats: Record<string, CodexPresetPerformance>): Array<Record<string, unknown>> {
    return Object.entries(stats).map(([preset, data]) => {
      const entry: Record<string, unknown> = {
        preset,
        sampleSize: data.sampleSize,
        successRatePercent: Number((data.successRate * 100).toFixed(1)),
        avgQuality: Number(data.avgQuality.toFixed(3)),
        avgTotalTokens: Math.round(data.avgTotalTokens),
      };
      if (typeof data.avgCostUSD === 'number') {
        entry.avgCostUSD = Number(data.avgCostUSD.toFixed(4));
      }
      return entry;
    });
  }

  private getTopWebInspirationCategories(limit = 5): Array<{ category: string; count: number }> {
    const entries = Object.entries(this.webInspirationSummary.categories);
    entries.sort((a, b) => b[1] - a[1]);
    return entries.slice(0, limit).map(([category, count]) => ({ category, count }));
  }

  private determineMode(snapshot: OperationsSnapshot): StrategyMode {
    const qualityConcern = snapshot.avgQuality < 0.85 || snapshot.failureRate > 0.2;
    const stability = snapshot.avgQuality >= 0.9 && snapshot.failureRate < 0.1;
    const ratio = snapshot.codexToClaudeRatio || 0;
    const rateLimitPressure = snapshot.rateLimitCodex + snapshot.rateLimitClaude;
    const budgetPressure = this.getBudgetPressure(snapshot.costs);

    if (budgetPressure === 'critical') {
      return 'stabilize';
    }

    if (qualityConcern || rateLimitPressure > 3) {
      return 'stabilize';
    }

    if (budgetPressure === 'warning' && this.currentMode === 'accelerate') {
      return 'balance';
    }

    if (stability && ratio >= this.options.targetCodexRatio + 1) {
      return 'accelerate';
    }

    return 'balance';
  }

  private buildPriorityProfile(snapshot: OperationsSnapshot): PriorityProfile {
    const statusWeights: NonNullable<PriorityProfile['statusWeights']> = {
      ...BASE_STATUS_WEIGHTS,
    };

    let complexityBias = 1;
    let stalenessBias = 1;
    const budgetPressure = this.getBudgetPressure(snapshot.costs);

    if (budgetPressure !== 'normal') {
      statusWeights.pending = (statusWeights.pending ?? 60) - 10;
      if (budgetPressure === 'critical') {
        statusWeights.pending = (statusWeights.pending ?? 50) - 10;
        statusWeights.needs_review = (statusWeights.needs_review ?? 105) + 10;
      }
      complexityBias *= 0.9;
    }

    if (this.currentMode === 'stabilize') {
      statusWeights.needs_improvement = (statusWeights.needs_improvement ?? 95) + 25;
      statusWeights.pending = (statusWeights.pending ?? 60) - 10;
      statusWeights.needs_review = (statusWeights.needs_review ?? 105) + 5;
      complexityBias = 0.8;
      stalenessBias = 1.1;
    } else if (this.currentMode === 'accelerate') {
      statusWeights.pending = (statusWeights.pending ?? 60) + 20;
      statusWeights.needs_review = (statusWeights.needs_review ?? 105) - 10;
      complexityBias = 1.5;
      stalenessBias = 1.2;
    }

    if (snapshot.rateLimitCodex > 2) {
      statusWeights.pending = (statusWeights.pending ?? 60) - 12;
      statusWeights.needs_review = (statusWeights.needs_review ?? 105) + 8;
    }

    if (snapshot.failureRate > 0.25) {
      statusWeights.needs_improvement = (statusWeights.needs_improvement ?? 95) + 15;
      stalenessBias += 0.2;
    }

    return {
      statusWeights,
      complexityBias,
      stalenessBias,
    };
  }

  private evaluateMaintenance(snapshot: OperationsSnapshot): void {
    if (snapshot.totalTasks === 0) {
      return;
    }

    const blockedRatio = snapshot.blockedTasks / snapshot.totalTasks;
    if (blockedRatio > 0.2 && Date.now() - this.lastBlockedAlert > 5 * 60 * 1000) {
      logWarning('Roadmap has a high blocked-task ratio', {
        blockedTasks: snapshot.blockedTasks,
        totalTasks: snapshot.totalTasks,
        blockedRatio: blockedRatio.toFixed(2),
      });
      this.lastBlockedAlert = Date.now();
      this.emit('maintenance:blocked_tasks', { snapshot });
    }

    if (snapshot.queueLength < this.agentPool.getAvailableAgents().length) {
      logWarning('Agent capacity under-utilised (queue below available agents)', {
        queueLength: snapshot.queueLength,
        availableAgents: this.agentPool.getAvailableAgents().length,
      });
      this.emit('maintenance:underutilised', { snapshot });
    }

    if (this.currentMode === 'balance') {
      this.rateLimitCounters.codex = Math.max(0, this.rateLimitCounters.codex - 1);
      this.rateLimitCounters.claude_code = Math.max(0, this.rateLimitCounters.claude_code - 1);
    }

    if (snapshot.tokenMetrics.pressure === 'critical') {
      logWarning('Prompt budget under critical pressure', {
        averagePromptTokens: snapshot.tokenMetrics.averagePromptTokens,
        targetPromptBudget: snapshot.tokenMetrics.targetPromptBudget,
      });
      this.emit('maintenance:token_pressure', { snapshot });
    }
  }

  private computeTokenMetrics(executions: ExecutionSummary[]): OperationsSnapshot['tokenMetrics'] {
    const PROMPT_TARGET_DEFAULT = 600;

    if (executions.length === 0) {
      return {
        averagePromptTokens: 0,
        averageCompletionTokens: 0,
        averageTotalTokens: 0,
        pressure: 'normal',
        targetPromptBudget: PROMPT_TARGET_DEFAULT,
        cacheEligibleExecutions: 0,
        cacheHitExecutions: 0,
        cacheStoreExecutions: 0,
        cacheHitRate: 0,
      };
    }

    const sum = executions.reduce(
      (acc, execution) => {
        acc.prompt += execution.promptTokens ?? 0;
        acc.completion += execution.completionTokens ?? 0;
        acc.total += execution.totalTokens ?? 0;

        if (execution.promptCacheHit) {
          acc.cacheHit += 1;
          acc.cacheEligible += 1;
        } else if (execution.promptCacheStore) {
          acc.cacheStore += 1;
          acc.cacheEligible += 1;
        } else if (execution.promptCacheEligible) {
          acc.cacheEligible += 1;
        }

        return acc;
      },
      { prompt: 0, completion: 0, total: 0, cacheEligible: 0, cacheHit: 0, cacheStore: 0 },
    );

    const averagePromptTokens = sum.prompt / executions.length;
    const averageCompletionTokens = sum.completion / executions.length;
    const averageTotalTokens = sum.total / executions.length;

    let pressure: TokenPressureLevel = 'normal';
    if (averagePromptTokens >= 580 || averageTotalTokens >= 1600) {
      pressure = 'critical';
    } else if (averagePromptTokens >= 520 || averageTotalTokens >= 1200) {
      pressure = 'elevated';
    }

    let targetPromptBudget = PROMPT_TARGET_DEFAULT;
    if (pressure === 'critical') {
      targetPromptBudget = 450;
    } else if (pressure === 'elevated') {
      targetPromptBudget = 520;
    }

    const cacheHitRate = sum.cacheEligible > 0 ? sum.cacheHit / sum.cacheEligible : 0;

    return {
      averagePromptTokens,
      averageCompletionTokens,
      averageTotalTokens,
      pressure,
      targetPromptBudget,
      cacheEligibleExecutions: sum.cacheEligible,
      cacheHitExecutions: sum.cacheHit,
      cacheStoreExecutions: sum.cacheStore,
      cacheHitRate,
    };
  }

  private loadBudgetThresholds(workspaceRoot: string): Record<AgentType, ProviderBudgetThreshold> {
    const defaults: Record<AgentType, ProviderBudgetThreshold> = {
      codex: { dailyLimitUSD: 25, hourlyLimitUSD: 5, alertThresholdPercent: 0.8 },
      claude_code: { dailyLimitUSD: 20, hourlyLimitUSD: 4, alertThresholdPercent: 0.8 },
    };

    const configPath = path.join(workspaceRoot, 'config', 'provider_budget_thresholds.json');
    let parsedConfig: Record<string, unknown> | undefined;

    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, 'utf8');
        parsedConfig = JSON.parse(raw) as Record<string, unknown>;
      } catch (error) {
        logWarning('Failed to parse provider budget thresholds config; falling back to defaults', {
          error: error instanceof Error ? error.message : String(error),
          path: configPath,
        });
      }
    }

    const environment = (process.env.WVO_ENVIRONMENT ?? 'production').toLowerCase();
    const environmentConfig =
      parsedConfig && typeof parsedConfig === 'object'
        ? (parsedConfig[environment] ??
            parsedConfig['default'] ??
            parsedConfig['production'])
        : undefined;

    const providerConfig =
      environmentConfig && typeof environmentConfig === 'object'
        ? (environmentConfig as Record<string, unknown>)
        : undefined;

    const budgets: Record<AgentType, ProviderBudgetThreshold> = {
      codex: this.mergeBudget(defaults.codex, providerConfig?.['codex']),
      claude_code: this.mergeBudget(defaults.claude_code, providerConfig?.['claude_code']),
    };

    this.applyBudgetEnvOverrides(budgets);

    return budgets;
  }

  private mergeBudget(base: ProviderBudgetThreshold, input?: unknown): ProviderBudgetThreshold {
    const merged: ProviderBudgetThreshold = { ...base };
    if (!input || typeof input !== 'object') {
      return merged;
    }
    const raw = input as Record<string, unknown>;
    const daily = this.normalizeBudgetNumber(raw['daily_limit_usd'] ?? raw['dailyLimitUSD']);
    if (typeof daily === 'number') {
      merged.dailyLimitUSD = daily;
    }

    const hourly = this.normalizeBudgetNumber(raw['hourly_limit_usd'] ?? raw['hourlyLimitUSD']);
    if (typeof hourly === 'number') {
      merged.hourlyLimitUSD = hourly;
    }

    const alert = this.normalizePercent(raw['alert_threshold_percent'] ?? raw['alertThresholdPercent']);
    if (typeof alert === 'number') {
      merged.alertThresholdPercent = alert;
    }

    if (merged.alertThresholdPercent <= 0 || merged.alertThresholdPercent >= 1) {
      merged.alertThresholdPercent = base.alertThresholdPercent;
    }

    return merged;
  }

  private normalizeBudgetNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return undefined;
  }

  private normalizePercent(value: unknown): number | undefined {
    const numeric = this.normalizeBudgetNumber(value);
    if (typeof numeric !== 'number') {
      return undefined;
    }
    const normalized = numeric > 1 ? numeric / 100 : numeric;
    if (normalized <= 0 || normalized >= 1) {
      return undefined;
    }
    return normalized;
  }

  private applyBudgetEnvOverrides(budgets: Record<AgentType, ProviderBudgetThreshold>): void {
    const codexDaily = this.parseBudgetEnvFloat('WVO_BUDGET_CODEX_DAILY_USD');
    if (codexDaily !== undefined) {
      budgets.codex.dailyLimitUSD = codexDaily;
    }

    const codexHourly = this.parseBudgetEnvFloat('WVO_BUDGET_CODEX_HOURLY_USD');
    if (codexHourly !== undefined) {
      budgets.codex.hourlyLimitUSD = codexHourly;
    }

    const claudeDaily = this.parseBudgetEnvFloat('WVO_BUDGET_CLAUDE_DAILY_USD');
    if (claudeDaily !== undefined) {
      budgets.claude_code.dailyLimitUSD = claudeDaily;
    }

    const claudeHourly = this.parseBudgetEnvFloat('WVO_BUDGET_CLAUDE_HOURLY_USD');
    if (claudeHourly !== undefined) {
      budgets.claude_code.hourlyLimitUSD = claudeHourly;
    }

    const globalAlert = this.parseBudgetPercent('WVO_BUDGET_ALERT_THRESHOLD_PERCENT');
    const codexAlert = this.parseBudgetPercent('WVO_BUDGET_CODEX_ALERT_PERCENT') ?? globalAlert;
    if (codexAlert !== undefined) {
      budgets.codex.alertThresholdPercent = codexAlert;
    }
    const claudeAlert = this.parseBudgetPercent('WVO_BUDGET_CLAUDE_ALERT_PERCENT') ?? globalAlert;
    if (claudeAlert !== undefined) {
      budgets.claude_code.alertThresholdPercent = claudeAlert;
    }
  }

  private parseBudgetEnvFloat(variable: string): number | undefined {
    const raw = process.env[variable];
    if (!raw) {
      return undefined;
    }
    return this.normalizeBudgetNumber(raw);
  }

  private parseBudgetPercent(variable: string): number | undefined {
    const raw = process.env[variable];
    if (!raw) {
      return undefined;
    }
    return this.normalizePercent(raw);
  }

  private recordCostEvent(agentType: AgentType, cost: number | undefined, timestamp: number | undefined): void {
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) {
      return;
    }
    const eventTimestamp =
      typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : Date.now();
    this.costEvents.push({ timestamp: eventTimestamp, agentType, cost });
    this.pruneCostEvents();
  }

  private pruneCostEvents(): void {
    const cutoff = Date.now() - this.COST_WINDOW_MS;
    while (this.costEvents.length > 0 && this.costEvents[0].timestamp < cutoff) {
      this.costEvents.shift();
    }
  }

  private computeCostMetrics(): CostSnapshot {
    const now = Date.now();
    this.pruneCostEvents();
    const hourCutoff = now - 60 * 60 * 1000;
    const dayCutoff = now - this.COST_WINDOW_MS;

    const providers: Record<AgentType, ProviderCostMetrics> = {
      codex: this.buildProviderCostMetrics('codex', hourCutoff, dayCutoff),
      claude_code: this.buildProviderCostMetrics('claude_code', hourCutoff, dayCutoff),
    };

    const lastHourUSD = providers.codex.lastHourUSD + providers.claude_code.lastHourUSD;
    const last24hUSD = providers.codex.last24hUSD + providers.claude_code.last24hUSD;
    const alerts = this.collectCostAlerts(providers);

    return {
      lastUpdated: now,
      windowSeconds: Math.floor(this.COST_WINDOW_MS / 1000),
      lastHourUSD,
      last24hUSD,
      providers,
      alerts,
    };
  }

  private buildProviderCostMetrics(
    provider: AgentType,
    hourCutoff: number,
    dayCutoff: number,
  ): ProviderCostMetrics {
    const budget = this.costBudgets[provider];
    const events = this.costEvents.filter(
      (event) => event.agentType === provider && event.timestamp >= dayCutoff,
    );

    let last24hUSD = 0;
    let lastHourUSD = 0;

    for (const event of events) {
      last24hUSD += event.cost;
      if (event.timestamp >= hourCutoff) {
        lastHourUSD += event.cost;
      }
    }

    const hourlyLimit = budget.hourlyLimitUSD;
    const dailyLimit = budget.dailyLimitUSD;

    const hourlyUtilizationPercent =
      typeof hourlyLimit === 'number' && hourlyLimit > 0
        ? Math.min((lastHourUSD / hourlyLimit) * 100, 999)
        : null;
    const dailyUtilizationPercent =
      typeof dailyLimit === 'number' && dailyLimit > 0
        ? Math.min((last24hUSD / dailyLimit) * 100, 999)
        : null;

    let status: 'ok' | 'warning' | 'critical' = 'ok';
    const threshold = budget.alertThresholdPercent;

    if (
      (typeof hourlyLimit === 'number' && hourlyLimit > 0 && lastHourUSD >= hourlyLimit) ||
      (typeof dailyLimit === 'number' && dailyLimit > 0 && last24hUSD >= dailyLimit)
    ) {
      status = 'critical';
    } else if (
      (typeof hourlyLimit === 'number' &&
        hourlyLimit > 0 &&
        lastHourUSD >= hourlyLimit * threshold) ||
      (typeof dailyLimit === 'number' &&
        dailyLimit > 0 &&
        last24hUSD >= dailyLimit * threshold)
    ) {
      status = 'warning';
    }

    return {
      lastHourUSD,
      last24hUSD,
      hourlyUtilizationPercent,
      dailyUtilizationPercent,
      status,
      budget,
    };
  }

  private collectCostAlerts(providers: Record<AgentType, ProviderCostMetrics>): CostAlert[] {
    const alerts: CostAlert[] = [];
    for (const provider of ['codex', 'claude_code'] as const) {
      const metrics = providers[provider];
      const threshold = metrics.budget.alertThresholdPercent;
      const hourlyLimit = metrics.budget.hourlyLimitUSD;
      const dailyLimit = metrics.budget.dailyLimitUSD;

      if (typeof hourlyLimit === 'number' && hourlyLimit > 0) {
        if (metrics.lastHourUSD >= hourlyLimit) {
          alerts.push({
            severity: 'critical',
            provider,
            period: 'hourly',
            utilizationPercent: metrics.hourlyUtilizationPercent ?? 0,
            limitUSD: hourlyLimit,
            actualUSD: metrics.lastHourUSD,
            message: `Hourly spend ${metrics.lastHourUSD.toFixed(2)} USD reached limit ${hourlyLimit.toFixed(2)} USD.`,
          });
        } else if (metrics.lastHourUSD >= hourlyLimit * threshold) {
          alerts.push({
            severity: 'warning',
            provider,
            period: 'hourly',
            utilizationPercent: metrics.hourlyUtilizationPercent ?? 0,
            limitUSD: hourlyLimit,
            actualUSD: metrics.lastHourUSD,
            message: `Hourly spend ${metrics.lastHourUSD.toFixed(2)} USD is ${Math.round(
              metrics.hourlyUtilizationPercent ?? 0,
            )}% of limit.`,
          });
        }
      }

      if (typeof dailyLimit === 'number' && dailyLimit > 0) {
        if (metrics.last24hUSD >= dailyLimit) {
          alerts.push({
            severity: 'critical',
            provider,
            period: 'daily',
            utilizationPercent: metrics.dailyUtilizationPercent ?? 0,
            limitUSD: dailyLimit,
            actualUSD: metrics.last24hUSD,
            message: `Daily spend ${metrics.last24hUSD.toFixed(2)} USD reached limit ${dailyLimit.toFixed(2)} USD.`,
          });
        } else if (metrics.last24hUSD >= dailyLimit * threshold) {
          alerts.push({
            severity: 'warning',
            provider,
            period: 'daily',
            utilizationPercent: metrics.dailyUtilizationPercent ?? 0,
            limitUSD: dailyLimit,
            actualUSD: metrics.last24hUSD,
            message: `Daily spend ${metrics.last24hUSD.toFixed(2)} USD is ${Math.round(
              metrics.dailyUtilizationPercent ?? 0,
            )}% of limit.`,
          });
        }
      }
    }
    return alerts;
  }

  private evaluateBudgetAlerts(costs: CostSnapshot): void {
    if (costs.alerts.length === 0) {
      return;
    }
    const now = Date.now();
    for (const alert of costs.alerts) {
      const key = `${alert.provider}:${alert.period}:${alert.severity}`;
      const last = this.budgetAlertDebounce[key] ?? 0;
      if (now - last < this.BUDGET_ALERT_DEBOUNCE_MS) {
        continue;
      }
      this.budgetAlertDebounce[key] = now;

      const payload = {
        provider: alert.provider,
        period: alert.period,
        spentUSD: Number(alert.actualUSD.toFixed(4)),
        limitUSD: Number(alert.limitUSD.toFixed(4)),
        utilizationPercent: Number(alert.utilizationPercent.toFixed(2)),
      };

      if (alert.severity === 'critical') {
        logWarning('Provider cost budget breached', payload);
      } else {
        logInfo('Provider cost budget nearing threshold', payload);
      }

      this.emit('maintenance:budget_alert', { alert, costs });
      this.appendBudgetContextAlert(alert);
    }
  }

  private appendBudgetContextAlert(alert: CostAlert): void {
    if (this.budgetAlertContextDisabled) {
      return;
    }
    try {
      const contextPath = path.join(this.workspaceRoot, 'state', 'context.md');
      const timestamp = new Date().toISOString();
      const line = `- ${timestamp} Budget ${alert.severity.toUpperCase()} for ${alert.provider} (${alert.period}) - spent ${alert.actualUSD.toFixed(2)} USD vs limit ${alert.limitUSD.toFixed(2)} USD.`;
      fs.appendFileSync(contextPath, `\n${line}\n`, 'utf8');
    } catch (error) {
      logWarning('Failed to append budget alert to context.md', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getBudgetPressure(costs: CostSnapshot): 'normal' | 'warning' | 'critical' {
    if (costs.alerts.some((alert) => alert.severity === 'critical')) {
      return 'critical';
    }
    if (costs.alerts.some((alert) => alert.severity === 'warning')) {
      return 'warning';
    }
    return 'normal';
  }

  private formatCostTelemetry(costs: CostSnapshot): Record<string, unknown> {
    return {
      lastHourUSD: Number(costs.lastHourUSD.toFixed(4)),
      last24hUSD: Number(costs.last24hUSD.toFixed(4)),
      windowSeconds: costs.windowSeconds,
      providers: {
        codex: this.formatProviderCostTelemetry(costs.providers.codex),
        claude_code: this.formatProviderCostTelemetry(costs.providers.claude_code),
      },
      alerts: costs.alerts.map((alert) => ({
        severity: alert.severity,
        provider: alert.provider,
        period: alert.period,
        utilizationPercent: Number(alert.utilizationPercent.toFixed(2)),
        limitUSD: Number(alert.limitUSD.toFixed(4)),
        actualUSD: Number(alert.actualUSD.toFixed(4)),
      })),
    };
  }

  private formatProviderCostTelemetry(metrics: ProviderCostMetrics): Record<string, unknown> {
    return {
      lastHourUSD: Number(metrics.lastHourUSD.toFixed(4)),
      last24hUSD: Number(metrics.last24hUSD.toFixed(4)),
      hourlyLimitUSD:
        typeof metrics.budget.hourlyLimitUSD === 'number'
          ? Number(metrics.budget.hourlyLimitUSD.toFixed(4))
          : null,
      dailyLimitUSD:
        typeof metrics.budget.dailyLimitUSD === 'number'
          ? Number(metrics.budget.dailyLimitUSD.toFixed(4))
          : null,
      hourlyUtilizationPercent:
        metrics.hourlyUtilizationPercent !== null
          ? Number(metrics.hourlyUtilizationPercent.toFixed(2))
          : null,
      dailyUtilizationPercent:
        metrics.dailyUtilizationPercent !== null
          ? Number(metrics.dailyUtilizationPercent.toFixed(2))
          : null,
      alertThresholdPercent: Number(metrics.budget.alertThresholdPercent.toFixed(3)),
      status: metrics.status,
    };
  }

  getCoordinatorStatus(): { type: AgentType; available: boolean; reason: string } {
    const type = this.agentPool.getCoordinatorType();
    const available = this.agentPool.isCoordinatorAvailable();
    const reason =
      type === 'claude_code'
        ? (available ? 'primary' : 'primary_unavailable')
        : this.normalizeCoordinatorReason(this.coordinatorReason);
    return { type, available, reason };
  }

  private initializeCoordinatorReason(): void {
    const initialType = this.agentPool.getCoordinatorType();
    if (initialType === 'claude_code') {
      this.coordinatorReason = 'primary';
    } else {
      this.coordinatorReason = 'failover:start';
    }
  }

  private setCoordinatorReason(reason: string): void {
    this.coordinatorReason = this.normalizeCoordinatorReason(reason);
  }

  private normalizeCoordinatorReason(reason: string | undefined): string {
    const trimmed = reason?.trim();
    if (trimmed && trimmed.length > 0) {
      return trimmed;
    }
    return this.agentPool.getCoordinatorType() === 'codex' ? 'failover:unknown' : 'primary';
  }

  private formatQueueBatches(queueMetrics: QueueMetrics): Array<{
    reason: SchedulingReason;
    label: string;
    size: number;
    heads: Array<{ id: string; title: string; priority: number }>;
  }> {
    const labels: Record<SchedulingReason, string> = {
      requires_review: 'Review queue',
      requires_follow_up: 'Fix-up queue',
      dependencies_cleared: 'Ready queue',
    };

    return (Object.keys(queueMetrics.reasonCounts) as SchedulingReason[])
      .filter((reason) => queueMetrics.reasonCounts[reason] > 0)
      .map((reason) => ({
        reason,
        label: labels[reason],
        size: queueMetrics.reasonCounts[reason],
        heads: queueMetrics.heads[reason] ?? [],
      }));
  }
}
