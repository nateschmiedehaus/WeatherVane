export interface IncrementalityAssignment {
  geo: string;
  group: string;
  weight: number;
}

export interface IncrementalityDesign {
  status: string;
  geo_count?: number | null;
  holdout_count?: number | null;
  holdout_ratio?: number | null;
  control_share?: number | null;
  assignment?: IncrementalityAssignment[];
  tenant_id?: string | null;
  lookback_days?: number | null;
  notes?: string[];
  geo_column?: string | null;
}

export interface IncrementalitySummary {
  treatment_mean: number;
  control_mean: number;
  absolute_lift: number;
  lift: number;
  p_value: number;
  conf_low: number;
  conf_high: number;
  sample_size_treatment: number;
  sample_size_control: number;
  generated_at?: string | null;
  is_significant?: boolean | null;
}

export interface IncrementalityReport {
  tenant_id: string;
  generated_at: string;
  design: IncrementalityDesign;
  summary?: IncrementalitySummary | null;
  performance_summary?: Record<string, unknown> | null;
  backtest?: BacktestPoint[] | null;
}

export interface BacktestPoint {
  timestamp?: string | null;
  horizon_days?: number | null;
  actual: number;
  predicted: number;
  error: number;
  absolute_error: number;
  cumulative_actual: number;
  cumulative_predicted: number;
  cumulative_lift?: number | null;
  cumulative_lift_pct?: number | null;
}
