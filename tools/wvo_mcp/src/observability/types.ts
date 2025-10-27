export interface TaskMetricsSnapshot {
  timestamp: number;
  pendingCount: number;
  readyCount: number;
  inProgressCount: number;
  doneCount: number;
  blockedCount: number;
  queueDepth: number;
  wipUtilization: number;
  throughputLastHour: number;
  throughputLast5Min: number;
}

export interface AutopilotHealthReport {
  running: boolean;
  lastCycle?: number;
  metricsHistory: TaskMetricsSnapshot[];
}

export interface TaskMetricsSummary {
  updatedAt: string;
  running: boolean;
  tasksByState: Record<string, number>;
  queueDepth: number;
  throughputLastHour: number;
  throughputLast5Min: number;
  wipUtilization: number;
  completionRatePerHour: number;
  completionRatePerDay: number;
  successRate: number;
  failureRate: number;
  retryRate: number;
  bottleneckStage?: string;
  drilldown?: Record<string, TaskDrilldownEntry[]>;
}

export interface TaskDrilldownEntry {
  id: string;
  title: string;
  status: string;
  domain?: string;
  milestone?: string;
  labels?: string[];
}

export interface ConsensusHistoryEntry {
  id: string;
  taskId: string;
  type: string;
  timestamp: string;
  quorumSatisfied: boolean;
}

export interface OrchestrationMetrics {
  updatedAt: string;
  totalDecisions: number;
  byType: Record<string, number>;
  history: ConsensusHistoryEntry[];
}

export interface GateBreakdownEntry {
  gate: string;
  approvals: number;
  rejections: number;
}

export interface QualityGateMetricsSummary {
  updatedAt: string;
  totalDecisions: number;
  byType: Record<string, number>;
  consensusReachRate: number;
  rejectionReasons: Array<{ reason: string; count: number }>;
  approvals: number;
  rejections: number;
  gateBreakdown: GateBreakdownEntry[];
  rubricAverages: Record<string, number>;
  adversarialCategories: Array<{ category: string; count: number }>;
}

export interface UsageLog {
  providers: Record<
    string,
    {
      provider: string;
      usage: {
        current_hour: { requests: number; tokens: number };
        current_day: { requests: number; tokens: number };
      };
      warnings: {
        approaching_hourly_limit: boolean;
        approaching_daily_limit: boolean;
        percentage_used: number;
      };
    }
  >;
  last_saved?: string;
}

export interface ResolutionMetricsData {
  updatedAt: string;
  activeLoops: Array<{
    taskId: string;
    attempts: number;
    firstAttemptAt: string;
    lastAttemptAt: string;
    lastLabel: string;
    labels: string[];
    elapsedMs: number;
    runId: string;
    infiniteLoopFlag?: boolean;
  }>;
  stats: {
    totalLoops: number;
    closedLoops: number;
    closedWithin3: number;
    infiniteLoopCount: number;
    incidentCount: number;
    attemptHistogram: Record<string, number>;
  };
  recentEvents: Array<
    | {
        type: 'attempt';
        taskId: string;
        label: string;
        attempt: number;
        timestamp: string;
        runId: string;
      }
    | {
        type: 'closed';
        taskId: string;
        attempts: number;
        closedAt: string;
        durationMs: number;
        runId: string;
      }
    | {
        type: 'incident';
        taskId: string;
        state: string;
        attempt: number;
        timestamp: string;
      }
  >;
  recentlyClosed: Array<{
    taskId: string;
    attempts: number;
    closedAt: string;
    durationMs: number;
    runId: string;
  }>;
}

export interface ResourceMetricsSnapshot {
  timestamp: string;
  memory_used_pct?: number;
  cpu_used_pct?: number;
  claude_processes?: number;
  node_processes?: number;
  throttle_level?: number;
  throttle_params?: Record<string, unknown>;
  disk_used_pct?: number;
}

export interface ProviderCapacityMetrics {
  lastUpdated: string;
  providers: Array<{
    provider: string;
    totalLimitHits: number;
    totalRecoveries: number;
    totalFailovers: number;
    averageDowntimeMs: number;
    longestDowntimeMs: number;
    shortestDowntimeMs: number;
    currentStatus: string;
  }>;
}

export interface ResourceUsageSummary {
  updatedAt: string;
  host: {
    cpuPercent: number;
    memoryPercent: number;
    diskPercent: number;
  };
  processes: {
    claude: number;
    node: number;
  };
  throttle: {
    level: number;
    params: Record<string, unknown> | null;
  };
  providers: ProviderCapacityMetrics['providers'];
  tokenUsage: Array<{
    provider: string;
    hourlyTokens: number;
    dailyTokens: number;
    utilizationPercent: number;
  }>;
  estimatedCostPerTask: number;
}

export interface MetricsSummary {
  executions?: Record<string, unknown>;
  operations?: Record<string, unknown>;
  usage?: Record<string, unknown>;
}

export interface ObservabilityStreamPayload {
  timestamp: string;
  tasks: TaskMetricsSummary;
  quality: QualityGateMetricsSummary;
  resolution: ResolutionMetricsData;
  resources: ResourceUsageSummary;
}
