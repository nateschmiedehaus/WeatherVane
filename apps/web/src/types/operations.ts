export interface ConsensusQuorumProfile {
  name: string;
  display_name: string;
  hierarchy_rank: number;
  default_participants: string[];
  median_duration_seconds?: number | null;
  p90_duration_seconds?: number | null;
  expected_iterations?: number | null;
  token_cost_usd?: number | null;
  notes?: string | null;
}

export interface ConsensusEscalationSignal {
  signal: string;
  threshold_seconds?: number | null;
  threshold?: number | null;
  recommended_action?: string | null;
}

export interface ConsensusSampleWindow {
  start?: string | null;
  end?: string | null;
}

export interface ConsensusWorkloadResponse {
  generated_at?: string | null;
  sample_window?: ConsensusSampleWindow | null;
  decision_mix: Record<string, number>;
  token_cost_per_run_usd?: number | null;
  token_budget_per_run: Record<string, number>;
  quorum_profiles: ConsensusQuorumProfile[];
  escalation_signals: ConsensusEscalationSignal[];
  execution_health: Record<string, number>;
}

export interface OrchestrationHistoryEntry {
  id: string;
  task_id: string;
  type: string;
  timestamp: string;
  quorum_satisfied: boolean;
  participants: string[];
  duration_seconds?: number | null;
  token_cost_usd?: number | null;
}

export interface StaffingGuidanceProfile {
  default_participants: string[];
  median_duration_seconds?: number | null;
  p90_duration_seconds?: number | null;
  expected_iterations?: number | null;
  token_cost_usd?: number | null;
  notes?: string | null;
}

export interface StaffingGuidanceSignal {
  signal: string;
  recommended_action?: string | null;
  threshold_seconds?: number | null;
  observed_value?: number | null;
}

export interface StaffingEscalationTriggers {
  duration_p90_seconds?: number | null;
  retry_threshold?: number | null;
  signals: StaffingGuidanceSignal[];
}

export interface StaffingGuidance {
  source?: string | null;
  sample_window?: ConsensusSampleWindow | null;
  profiles: Record<string, StaffingGuidanceProfile>;
  escalation_triggers: StaffingEscalationTriggers;
  token_budget_usd: Record<string, number | null>;
}

export interface CriticPerformanceSummary {
  total: number;
  passing: number;
  failing: number;
  last_updated?: string | null;
}

export interface CriticPerformanceEntry {
  critic: string;
  title?: string | null;
  domain?: string | null;
  passed: boolean;
  exit_code?: number | null;
  timestamp?: string | null;
  summary?: string | null;
}

export interface CriticPerformanceSnapshot {
  summary: CriticPerformanceSummary;
  critics: CriticPerformanceEntry[];
}

export interface OrchestrationMetricsResponse {
  updated_at: string;
  total_decisions: number;
  by_type: Record<string, number>;
  history: OrchestrationHistoryEntry[];
  staffing_guidance?: StaffingGuidance | null;
  critic_performance?: CriticPerformanceSnapshot | null;
}
