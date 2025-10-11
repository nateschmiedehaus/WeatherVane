import { EventEmitter } from 'node:events';

import type { AgentPool, AgentType } from './agent_pool.js';
import type { ExecutionObserver, ExecutionSummary } from './claude_code_coordinator.js';
import type { QualityMonitor } from './quality_monitor.js';
import type { PriorityProfile, TaskScheduler } from './task_scheduler.js';
import type { StateMachine } from './state_machine.js';
import type { CodexPresetPerformance } from './model_selector.js';
import { logInfo, logWarning } from '../telemetry/logger.js';
import { TelemetryExporter } from '../telemetry/telemetry_exporter.js';

interface OperationsManagerOptions {
  targetCodexRatio?: number;
  historySize?: number;
  qualityWindow?: number;
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
}

type StrategyMode = 'balance' | 'stabilize' | 'accelerate';

const DEFAULT_OPTIONS: Required<OperationsManagerOptions> = {
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
  private readonly options: Required<OperationsManagerOptions>;
  private readonly executionHistory: ExecutionSummary[] = [];
  private currentMode: StrategyMode = 'balance';
  private lastSnapshot?: OperationsSnapshot;
  private lastProfileSignature = '';
  private lastBlockedAlert = 0;
  private readonly rateLimitCounters: Record<'codex' | 'claude_code', number> = {
    codex: 0,
    claude_code: 0,
  };
  private readonly telemetryExporter: TelemetryExporter;
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
  private readonly COORDINATOR_CHECK_INTERVAL = 30000;
  private coordinatorCheckTimer: NodeJS.Timeout | null = null;

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
    coordinatorPromoted: () => this.recomputeStrategy('coordinator_promoted'),
    coordinatorDemoted: () => this.recomputeStrategy('coordinator_demoted')
  };

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly scheduler: TaskScheduler,
    private readonly agentPool: AgentPool,
    private readonly qualityMonitor: QualityMonitor,
    options: OperationsManagerOptions = {}
  ) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.telemetryExporter = new TelemetryExporter(this.stateMachine.getWorkspaceRoot());
    this.qualityMonitor.on('quality:evaluated', this.boundListeners.qualityEvaluated);
    this.scheduler.on('queue:updated', this.boundListeners.queueUpdated);
    this.stateMachine.on('task:transition', this.boundListeners.taskTransition);
    this.agentPool.on('agent:cooldown', this.boundListeners.agentCooldown);
    this.agentPool.on('agent:cooldown_cleared', this.boundListeners.agentCooldownCleared);
    this.agentPool.on('coordinator:promoted', this.boundListeners.coordinatorPromoted);
    this.agentPool.on('coordinator:demoted', this.boundListeners.coordinatorDemoted);
    this.coordinatorCheckTimer = setInterval(
      () => this.checkCoordinatorAvailability('periodic'),
      this.COORDINATOR_CHECK_INTERVAL
    );
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
    if (this.coordinatorCheckTimer) {
      clearInterval(this.coordinatorCheckTimer);
      this.coordinatorCheckTimer = null;
    }
    this.telemetryExporter.close();
  }

  recordExecution(summary: ExecutionSummary): void {
    this.executionHistory.push(summary);
    if (this.executionHistory.length > this.options.historySize) {
      this.executionHistory.shift();
    }
    this.emit('execution:recorded', summary);
    this.recomputeStrategy('execution');
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

  private recomputeStrategy(reason: string): void {
    const now = Date.now();

    // Throttle expensive snapshot building
    if (now - this.lastSnapshotTime < this.SNAPSHOT_THROTTLE_MS && this.lastSnapshot) {
      // Use cached snapshot for high-frequency events
      return;
    }

    const snapshot = this.buildSnapshot();
    if (!snapshot) {
      return;
    }

    this.lastSnapshotTime = now;
    this.lastSnapshot = snapshot;
    this.currentMode = this.determineMode(snapshot);
    this.emitTelemetry(snapshot);

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

  private buildSnapshot(): OperationsSnapshot | undefined {
    const recent = this.executionHistory.slice(-this.options.qualityWindow);
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

    const totalAgents = this.agentPool.getAvailableAgents().length + usage.codex + usage.claude;
    const busyAgents = usage.codex + usage.claude;
    const idleAgents = this.agentPool.getAvailableAgents().length;
    const coordinatorType = this.agentPool.getCoordinatorType();
    const coordinatorAvailable = this.agentPool.isCoordinatorAvailable();

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
      coordinatorType,
      coordinatorAvailable,
      codexPresetStats,
      agent_pool: {
        total_agents: totalAgents,
        busy_agents: busyAgents,
        idle_agents: idleAgents,
        codex_usage_percent: codexUsagePercent,
        claude_usage_percent: claudeUsagePercent
      },
      queue: {
        ready_count: queueLength,
        pending_count: health.pendingTasks,
        review_count: 0, // TODO: track separately
        improvement_count: 0 // TODO: track separately
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
      }
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
      webInspiration: snapshot.webInspiration
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

    if (qualityConcern || rateLimitPressure > 3) {
      return 'stabilize';
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
  }
}
