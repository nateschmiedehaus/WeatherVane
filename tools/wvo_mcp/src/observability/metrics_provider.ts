import yaml from 'yaml';

import { logWarning } from '../telemetry/logger.js';

import { ObservabilityMetricsLoader } from './metrics_loader.js';
import type {
  MetricsSummary,
  OrchestrationMetrics,
  QualityGateMetricsSummary,
  ResolutionMetricsData,
  ResourceMetricsSnapshot,
  ResourceUsageSummary,
  TaskDrilldownEntry,
  TaskMetricsSummary,
  UsageLog,
  ObservabilityStreamPayload,
} from './types.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 5000;
const DEFAULT_COST_PER_1K_TOKENS = 0.015;

function createDefaultResolutionData(): ResolutionMetricsData {
  return {
    updatedAt: new Date(0).toISOString(),
    activeLoops: [],
    stats: {
      totalLoops: 0,
      closedLoops: 0,
      closedWithin3: 0,
      infiniteLoopCount: 0,
      incidentCount: 0,
      attemptHistogram: {},
    },
    recentEvents: [],
    recentlyClosed: [],
  };
}

function deriveTaskBaseMetrics(
  report?: import('./types.js').AutopilotHealthReport
): TaskMetricsSummary {
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
    completionRatePerHour: latest?.throughputLastHour ?? 0,
    completionRatePerDay: (latest?.throughputLastHour ?? 0) * 24,
    successRate: 0,
    failureRate: 0,
    retryRate: 0,
    bottleneckStage: undefined,
    drilldown: {},
  };
}

function deriveQualityMetrics(
  orchestration: OrchestrationMetrics | undefined,
  decisions: Array<Record<string, unknown>>
): QualityGateMetricsSummary {
  const history = orchestration?.history ?? [];
  const totalOrchestrationDecisions =
    history.length || orchestration?.totalDecisions || decisions.length;

  const consensusReachRate =
    totalOrchestrationDecisions === 0
      ? 0
      : history.filter((item) => item.quorumSatisfied).length /
        totalOrchestrationDecisions;

  let approvals = 0;
  let rejections = 0;
  const rejectionMap = new Map<string, number>();
  const gateBreakdownMap = new Map<string, { approvals: number; rejections: number }>();
  const rubricTotals = new Map<string, { sum: number; count: number }>();
  const adversarialMap = new Map<string, number>();

  for (const decision of decisions) {
    const decisionStatus = decision['decision'];
    const isApproved =
      typeof decisionStatus === 'string' && decisionStatus === 'APPROVED';
    if (isApproved) {
      approvals += 1;
    } else {
      rejections += 1;
      const rawReason = decision['finalReasoning'];
      const reason =
        typeof rawReason === 'string' && rawReason.length > 0
          ? rawReason
          : 'unspecified';
      rejectionMap.set(reason, (rejectionMap.get(reason) ?? 0) + 1);
    }

    const reviews = decision['reviews'];
    if (!reviews || typeof reviews !== 'object') {
      continue;
    }

    for (const [gate, rawReview] of Object.entries(
      reviews as Record<string, unknown>
    )) {
      if (!rawReview || typeof rawReview !== 'object') {
        continue;
      }
      const review = rawReview as Record<string, unknown>;
      const transformedGate = gate.replace(/_/g, ' ');
      const gateEntry =
        gateBreakdownMap.get(transformedGate) ?? { approvals: 0, rejections: 0 };
      if (review['approved'] === true) {
        gateEntry.approvals += 1;
      } else {
        gateEntry.rejections += 1;
        const concerns = review['concerns'];
        if (Array.isArray(concerns)) {
          for (const concern of concerns) {
            if (typeof concern === 'string') {
              rejectionMap.set(concern, (rejectionMap.get(concern) ?? 0) + 1);
            }
          }
        }
      }
      gateBreakdownMap.set(transformedGate, gateEntry);

      const rubric = review['rubric'];
      if (rubric && typeof rubric === 'object') {
        for (const [dimension, value] of Object.entries(
          rubric as Record<string, unknown>
        )) {
          if (typeof value === 'number' && Number.isFinite(value)) {
            const entry = rubricTotals.get(dimension) ?? { sum: 0, count: 0 };
            entry.sum += value;
            entry.count += 1;
            rubricTotals.set(dimension, entry);
          }
        }
      }

      let adversarialCategory: string | undefined;
      const rawCategory = review['adversarialCategory'];
      if (typeof rawCategory === 'string' && rawCategory.length > 0) {
        adversarialCategory = rawCategory;
      } else {
        const concerns = review['concerns'];
        if (Array.isArray(concerns)) {
          adversarialCategory = concerns.find(
            (concern) =>
              typeof concern === 'string' &&
              concern.toLowerCase().includes('adversarial')
          ) as string | undefined;
        }
      }
      if (adversarialCategory) {
        adversarialMap.set(
          adversarialCategory,
          (adversarialMap.get(adversarialCategory) ?? 0) + 1
        );
      }
    }
  }

  const rejectionReasons = Array.from(rejectionMap.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const gateBreakdown = Array.from(gateBreakdownMap.entries()).map(
    ([gate, counts]) => ({
      gate,
      approvals: counts.approvals,
      rejections: counts.rejections,
    })
  );

  const rubricAverages: Record<string, number> = {};
  for (const [dimension, { sum, count }] of rubricTotals.entries()) {
    rubricAverages[dimension] = count > 0 ? Number((sum / count).toFixed(3)) : 0;
  }

  const adversarialCategories = Array.from(adversarialMap.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return {
    updatedAt: orchestration?.updatedAt ?? new Date().toISOString(),
    totalDecisions: decisions.length,
    byType: orchestration?.byType ?? {},
    consensusReachRate: Number(consensusReachRate.toFixed(6)),
    rejectionReasons,
    approvals,
    rejections,
    gateBreakdown,
    rubricAverages,
    adversarialCategories,
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

function calculateBottleneckStage(tasks: Record<string, number>): string | undefined {
  const entries = Object.entries(tasks).filter(([key]) => key !== 'done');
  if (!entries.length) {
    return undefined;
  }
  const total = entries.reduce((acc, [, count]) => acc + count, 0);
  if (total === 0) {
    return undefined;
  }
  const [stage, count] = entries.reduce((currentMax, entry) =>
    entry[1] > currentMax[1] ? entry : currentMax
  );
  const ratio = count / total;
  if (ratio < 0.25) {
    return undefined;
  }
  return stage;
}

function parseRoadmapTasks(yamlText?: string): Record<string, TaskDrilldownEntry[]> {
  if (!yamlText) {
    return {};
  }
  let document: any;
  try {
    document = yaml.parse(yamlText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWarning('Failed to parse roadmap YAML for observability drilldown', { error: message });
    return {};
  }

  const buckets: Record<string, TaskDrilldownEntry[]> = {
    pending: [],
    ready: [],
    inProgress: [],
    blocked: [],
    done: [],
  };

  const epics: any[] = Array.isArray(document?.epics) ? document.epics : [];
  for (const epic of epics) {
    const epicTitle = epic?.title;
    const milestones: any[] = Array.isArray(epic?.milestones) ? epic.milestones : [];
    for (const milestone of milestones) {
      const milestoneTitle = milestone?.title;
      const tasks: any[] = Array.isArray(milestone?.tasks) ? milestone.tasks : [];
      for (const task of tasks) {
        if (!task?.id || !task?.title) {
          continue;
        }
        const status =
          typeof task.status === 'string'
            ? task.status.toLowerCase()
            : 'pending';
        const entry: TaskDrilldownEntry = {
          id: task.id,
          title: task.title,
          status,
          domain: task.domain,
          milestone: milestoneTitle,
          labels: Array.isArray(task.labels) ? task.labels : undefined,
        };
        if (status.includes('block')) {
          buckets.blocked.push(entry);
        } else if (status.includes('progress')) {
          buckets.inProgress.push(entry);
        } else if (status.includes('ready')) {
          buckets.ready.push(entry);
        } else if (status.includes('done') || status.includes('complete')) {
          buckets.done.push(entry);
        } else {
          buckets.pending.push(entry);
        }
      }
    }
  }

  for (const key of Object.keys(buckets)) {
    buckets[key] = buckets[key].slice(0, 20);
  }

  return buckets;
}

function sumDailyTokens(usage?: UsageLog): number {
  if (!usage?.providers) {
    return 0;
  }
  return Object.values(usage.providers).reduce(
    (acc, provider) => acc + provider.usage.current_day.tokens,
    0
  );
}

function resolveDiskPercent(
  resourceMetrics: ResourceMetricsSnapshot | undefined,
  metricsSummary: MetricsSummary | undefined
): number {
  if (typeof resourceMetrics?.disk_used_pct === 'number') {
    return resourceMetrics.disk_used_pct;
  }
  const operations = metricsSummary?.operations;
  if (!operations || typeof operations !== 'object') {
    return 0;
  }
  const latestSnapshot = (operations as Record<string, unknown>).latest_snapshot;
  if (!latestSnapshot || typeof latestSnapshot !== 'object') {
    return 0;
  }
  const diskUsage = (latestSnapshot as Record<string, unknown>).diskUsage;
  return typeof diskUsage === 'number' ? diskUsage : 0;
}

function resolveThrottleParams(
  params: ResourceMetricsSnapshot['throttle_params']
): Record<string, unknown> | null {
  if (!params || typeof params !== 'object') {
    return null;
  }
  return { ...(params as Record<string, unknown>) };
}

export class ObservabilityMetricsProvider {
  private cache = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly loader: ObservabilityMetricsLoader,
    private readonly cacheTtlMs: number = DEFAULT_CACHE_TTL_MS
  ) {}

  private getCached<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (entry && entry.expiresAt > Date.now()) {
      return Promise.resolve(entry.value);
    }

    return factory().then((value) => {
      this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
      return value;
    });
  }

  async getTaskMetrics(): Promise<TaskMetricsSummary> {
    return this.getCached('tasks', async () => this.buildTaskMetrics());
  }

  async getQualityGateMetrics(): Promise<QualityGateMetricsSummary> {
    return this.getCached('quality_gates', async () => this.buildQualityMetrics());
  }

  async getResolutionMetrics(): Promise<ResolutionMetricsData> {
    return this.getCached('resolution', async () => {
      const snapshot = await this.loader.loadResolutionMetrics();
      return snapshot ?? createDefaultResolutionData();
    });
  }

  async getResourceSnapshot(): Promise<ResourceUsageSummary> {
    return this.getCached('resources', async () => this.buildResourceSnapshot());
  }

  async getUsageSnapshot() {
    return this.getCached('usage', async () => {
      const usage = await this.loader.loadUsageLog();
      return deriveUsageSnapshot(usage);
    });
  }

  async getStreamPayload(): Promise<ObservabilityStreamPayload> {
    const [tasks, quality, resolution, resources] = await Promise.all([
      this.getTaskMetrics(),
      this.getQualityGateMetrics(),
      this.getResolutionMetrics(),
      this.getResourceSnapshot(),
    ]);
    return {
      timestamp: new Date().toISOString(),
      tasks,
      quality,
      resolution,
      resources,
    };
  }

  async getTaskExportCsv(): Promise<string> {
    const metrics = await this.getTaskMetrics();
    const rows = [
      'state,count',
      ...Object.entries(metrics.tasksByState).map(([state, count]) => `${state},${count}`),
    ];
    return rows.join('\n');
  }

  async getResolutionExportCsv(): Promise<string> {
    const snapshot = await this.getResolutionMetrics();
    const header = 'task_id,attempts,last_label,elapsed_ms,first_attempt_at,last_attempt_at';
    const rows = snapshot.activeLoops.map(
      (loop) =>
        `${loop.taskId},${loop.attempts},${loop.lastLabel},${loop.elapsedMs},${loop.firstAttemptAt},${loop.lastAttemptAt}`
    );
    return [header, ...rows].join('\n');
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

  private async buildTaskMetrics(): Promise<TaskMetricsSummary> {
    const [health, orchestration, decisions, resolutionSnapshot, roadmapYaml] =
      await Promise.all([
        this.loader.loadAutopilotHealth(),
        this.loader.loadOrchestrationMetrics(),
        this.loader.loadQualityGateDecisions(300),
        this.getResolutionMetrics(),
        this.loader.loadRoadmapYaml(),
      ]);

    const summary = deriveTaskBaseMetrics(health);

    const approvals = decisions.filter(
      (decision) => decision['decision'] === 'APPROVED'
    ).length;
    const totalDecisions =
      decisions.length || orchestration?.totalDecisions || approvals;
    const successRate =
      totalDecisions === 0 ? 0 : approvals / totalDecisions;
    summary.successRate = Number(successRate.toFixed(4));
    summary.failureRate = Number((1 - successRate).toFixed(4));
    summary.retryRate =
      totalDecisions === 0
        ? 0
        : Number(
            (
              (resolutionSnapshot.stats.totalLoops ?? 0) / totalDecisions
            ).toFixed(4)
          );
    summary.bottleneckStage = calculateBottleneckStage(summary.tasksByState);
    summary.drilldown = parseRoadmapTasks(roadmapYaml);

    return summary;
  }

  private async buildQualityMetrics(): Promise<QualityGateMetricsSummary> {
    const [orchestration, decisions] = await Promise.all([
      this.loader.loadOrchestrationMetrics(),
      this.loader.loadQualityGateDecisions(500),
    ]);
    return deriveQualityMetrics(orchestration, decisions);
  }

  private async buildResourceSnapshot(): Promise<ResourceUsageSummary> {
    const [
      resourceMetrics,
      providerMetrics,
      usageLog,
      orchestration,
      metricsSummary,
    ] = await Promise.all([
      this.loader.loadResourceMetrics(),
      this.loader.loadProviderCapacity(),
      this.loader.loadUsageLog(),
      this.loader.loadOrchestrationMetrics(),
      this.loader.loadMetricsSummary(),
    ]);

    const host: ResourceUsageSummary['host'] = {
      cpuPercent: resourceMetrics?.cpu_used_pct ?? 0,
      memoryPercent: resourceMetrics?.memory_used_pct ?? 0,
      diskPercent: resolveDiskPercent(resourceMetrics, metricsSummary),
    };

    const processes: ResourceUsageSummary['processes'] = {
      claude: resourceMetrics?.claude_processes ?? 0,
      node: resourceMetrics?.node_processes ?? 0,
    };

    const throttleParams = resolveThrottleParams(resourceMetrics?.throttle_params);
    const throttle: ResourceUsageSummary['throttle'] = {
      level: resourceMetrics?.throttle_level ?? 0,
      params: throttleParams,
    };

    const tokenUsage =
      usageLog?.providers
        ? Object.values(usageLog.providers).map((provider) => ({
            provider: provider.provider,
            hourlyTokens: provider.usage.current_hour.tokens,
            dailyTokens: provider.usage.current_day.tokens,
            utilizationPercent: provider.warnings.percentage_used,
          }))
        : [];

    const totalDailyTokens = sumDailyTokens(usageLog);
    const totalDecisions = orchestration?.totalDecisions ?? 1;
    const estimatedCostPerTask =
      totalDailyTokens === 0
        ? 0
        : Number(
            (
              ((totalDailyTokens / 1000) * DEFAULT_COST_PER_1K_TOKENS) /
              totalDecisions
            ).toFixed(5)
          );

    return {
      updatedAt:
        resourceMetrics?.timestamp ?? new Date().toISOString(),
      host,
      processes,
      throttle,
      providers: providerMetrics?.providers ?? [],
      tokenUsage,
      estimatedCostPerTask,
    };
  }
}

export type TaskMetricsResponse = Awaited<
  ReturnType<ObservabilityMetricsProvider['getTaskMetrics']>
>;
export type QualityGateMetricsResponse = Awaited<
  ReturnType<ObservabilityMetricsProvider['getQualityGateMetrics']>
>;
