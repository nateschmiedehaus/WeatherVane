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

export interface QualityGateMetricsSummary {
  updatedAt: string;
  totalDecisions: number;
  byType: Record<string, number>;
  consensusReachRate: number;
  rejectionReasons: Array<{ reason: string; count: number }>;
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
