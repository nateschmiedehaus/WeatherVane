import { logWarning } from '../telemetry/logger.js';

import { ObservabilityMetricsLoader } from './metrics_loader.js';
import type {
  AutopilotHealthReport,
  OrchestrationMetrics,
  QualityGateMetricsSummary,
  TaskMetricsSummary,
  UsageLog,
} from './types.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

function deriveTaskMetrics(report?: AutopilotHealthReport): TaskMetricsSummary {
  const now = Date.now();
  const history = report?.metricsHistory ?? [];
  const latest = history.at(-1);

  const tasksByState = {
    pending: latest?.pendingCount ?? 0,
    ready: latest?.readyCount ?? 0,
    inProgress: latest?.inProgressCount ?? 0,
    blocked: latest?.blockedCount ?? 0,
    done: latest?.doneCount ?? 0,
  };

  return {
    updatedAt: new Date(latest?.timestamp ?? now).toISOString(),
    running: report?.running ?? false,
    tasksByState,
    queueDepth: latest?.queueDepth ?? 0,
    throughputLastHour: latest?.throughputLastHour ?? 0,
    throughputLast5Min: latest?.throughputLast5Min ?? 0,
    wipUtilization: Number((latest?.wipUtilization ?? 0).toFixed(4)),
  };
}

function deriveQualityGateMetrics(metrics?: OrchestrationMetrics): QualityGateMetricsSummary {
  const history = metrics?.history ?? [];
  const total = history.length || metrics?.totalDecisions || 0;
  const consensusReachRate =
    total === 0 ? 0 : history.filter(item => item.quorumSatisfied).length / total;

  return {
    updatedAt: metrics?.updatedAt ?? new Date().toISOString(),
    totalDecisions: total,
    byType: metrics?.byType ?? {},
    consensusReachRate: Number(consensusReachRate.toFixed(6)),
    rejectionReasons: [],
  };
}

function deriveUsageSnapshot(usage?: UsageLog) {
  if (!usage?.providers) {
    return {
      updatedAt: usage?.last_saved ?? new Date().toISOString(),
      providers: [],
    };
  }

  const providers = Object.entries(usage.providers).map(([key, entry]) => ({
    id: key,
    provider: entry.provider,
    hourlyTokens: entry.usage.current_hour.tokens,
    hourlyRequests: entry.usage.current_hour.requests,
    dailyTokens: entry.usage.current_day.tokens,
    dailyRequests: entry.usage.current_day.requests,
    utilizationPercent: entry.warnings.percentage_used,
  }));

  return {
    updatedAt: usage.last_saved ?? new Date().toISOString(),
    providers,
  };
}

export class ObservabilityMetricsProvider {
  private cache = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly loader: ObservabilityMetricsLoader,
    private readonly cacheTtlMs: number = 5000
  ) {}

  private getCached<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (entry && entry.expiresAt > Date.now()) {
      return Promise.resolve(entry.value);
    }

    return factory().then(value => {
      this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
      return value;
    });
  }

  async getTaskMetrics(): Promise<TaskMetricsSummary> {
    return this.getCached('tasks', async () => {
      const report = await this.loader.loadAutopilotHealth();
      return deriveTaskMetrics(report);
    });
  }

  async getQualityGateMetrics(): Promise<QualityGateMetricsSummary> {
    return this.getCached('quality_gates', async () => {
      const metrics = await this.loader.loadOrchestrationMetrics();
      return deriveQualityGateMetrics(metrics);
    });
  }

  async getUsageSnapshot() {
    return this.getCached('usage', async () => {
      const snapshot = await this.loader.loadUsageLog();
      return deriveUsageSnapshot(snapshot);
    });
  }

  clearCache(): void {
    this.cache.clear();
  }

  handleFileError(relativePath: string, error: unknown): void {
    logWarning('Observability metrics load failed', {
      relativePath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type TaskMetricsResponse = Awaited<ReturnType<ObservabilityMetricsProvider['getTaskMetrics']>>;
export type QualityGateMetricsResponse = Awaited<
  ReturnType<ObservabilityMetricsProvider['getQualityGateMetrics']>
>;
