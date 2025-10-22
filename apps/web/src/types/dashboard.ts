export type GuardrailStatus = "healthy" | "watch" | "breach";

export interface GuardrailSegment {
  name: string;
  status: GuardrailStatus;
  value: number;
  target: number;
  unit: string;
  delta_pct: number;
  notes?: string | null;
}

export interface SpendTracker {
  name: string;
  channel: string;
  value: number;
  change_pct: number;
  target?: number | null;
  unit: string;
  sparkline: number[];
}

export type WeatherRiskSeverity = "low" | "medium" | "high";

export interface WeatherRiskEvent {
  id: string;
  title: string;
  description: string;
  severity: WeatherRiskSeverity;
  geo_region: string;
  starts_at: string;
  ends_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  weather_type?: string | null;
}

export type AutomationLaneStatus = "normal" | "degraded" | "paused";

export interface AutomationLane {
  name: string;
  uptime_pct: number;
  incidents_7d: number;
  last_incident_at?: string | null;
  status: AutomationLaneStatus;
  notes?: string | null;
}

export type ConnectorStatus = "syncing" | "healthy" | "delayed" | "failed";

export interface IngestionConnector {
  name: string;
  source: string;
  status: ConnectorStatus;
  lag_minutes: number;
  sla_minutes: number;
  last_synced_at?: string | null;
  notes?: string | null;
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface DashboardAlert {
  id: string;
  title: string;
  detail: string;
  severity: AlertSeverity;
  occurred_at: string;
  acknowledged: boolean;
  acknowledged_at?: string | null;
  escalated_to?: string | null;
  escalated_at?: string | null;
  escalation_channel?: string | null;
  related_objects: string[];
}

export type AllocatorMode = "automation" | "assist" | "demo" | "fallback";

export type RecommendationSeverity = "critical" | "warning" | "info";

export interface AllocatorRecommendation {
  platform: string;
  spend_delta: number;
  spend_delta_pct: number;
  spend_after: number;
  severity: RecommendationSeverity;
  guardrail_count: number;
  top_guardrail?: string | null;
  notes?: string | null;
}

export interface AllocatorDiagnostics {
  optimizer?: string | null;
  optimizer_winner?: string | null;
  scenario_profit_p10?: number | null;
  scenario_profit_p50?: number | null;
  scenario_profit_p90?: number | null;
  expected_profit_raw?: number | null;
  worst_case_profit?: number | null;
  baseline_profit?: number | null;
  profit_lift?: number | null;
  profit_delta_p50?: number | null;
  profit_delta_expected?: number | null;
  binding_constraints?: Record<string, string[]>;
  optimizer_candidates?: Array<Record<string, unknown>>;
  evaluations?: number | null;
  iterations?: number | null;
  improvements?: number | null;
  iterations_with_improvement?: number | null;
  projection_target?: number | null;
  projection_residual_lower?: number | null;
  projection_residual_upper?: number | null;
  success?: number | null;
  objective_value?: number | null;
  min_softened?: boolean | null;
}

export interface AllocatorSummary {
  run_id?: string | null;
  generated_at?: string | null;
  mode: AllocatorMode;
  total_spend: number;
  total_spend_delta: number;
  total_spend_delta_pct: number;
  guardrail_breaches: number;
  notes: string[];
  recommendations: AllocatorRecommendation[];
  diagnostics?: AllocatorDiagnostics | null;
}

export type WeatherKpiUnit = "usd" | "pct" | "count" | "index" | "hours";

export interface WeatherKpi {
  id: string;
  label: string;
  value: number;
  unit: WeatherKpiUnit;
  delta_pct?: number | null;
  sparkline: number[];
  description: string;
}

export type CoverageStatus = "ok" | "warning" | "critical";

export interface DataCoverageBucket {
  name: string;
  status: CoverageStatus;
  observed_days: number;
  window_days: number;
  coverage_ratio: number;
  latest_date?: string | null;
  sources: string[];
  issues: string[];
  extra_metrics: Record<string, unknown>;
}

export interface TenantDataCoverage {
  tenant_id: string;
  window_days: number;
  end_date: string;
  generated_at: string;
  status: CoverageStatus;
  buckets: Record<string, DataCoverageBucket>;
}

export interface SuggestionTelemetry {
  signature: string;
  region: string;
  reason: string;
  view_count: number;
  focus_count: number;
  dismiss_count: number;
  high_risk_count: number;
  event_count: number;
  focus_rate: number;
  dismiss_rate: number;
  engagement_rate: number;
  has_scheduled_start: boolean;
  next_event_starts_at?: string | null;
  first_occurred_at?: string | null;
  last_occurred_at?: string | null;
  tenants: string[];
  severities: string[];
  viewport_breakpoints: string[];
  metadata: Record<string, unknown>;
}

export interface SuggestionTelemetrySummary {
  total_suggestions: number;
  total_view_count: number;
  total_focus_count: number;
  total_dismiss_count: number;
  average_focus_rate: number;
  average_dismiss_rate: number;
  average_engagement_rate: number;
  top_signature?: string | null;
  top_region?: string | null;
  top_region_summary?: string | null;
  top_reason?: string | null;
  top_focus_rate?: number | null;
  top_dismiss_rate?: number | null;
  top_engagement_rate?: number | null;
  top_focus_count?: number | null;
  top_dismiss_count?: number | null;
  top_view_count?: number | null;
  top_event_count?: number | null;
  top_high_risk_count?: number | null;
  top_has_scheduled_start?: boolean | null;
  top_guardrail_status?: string | null;
  top_layout_variant?: string | null;
  top_last_occurred_at?: string | null;
  top_engagement_confidence_level?: "low" | "medium" | "high" | null;
  top_engagement_confidence_label?: string | null;
}

export interface DashboardResponse {
  tenant_id: string;
  generated_at: string;
  guardrails: GuardrailSegment[];
  spend_trackers: SpendTracker[];
  weather_events: WeatherRiskEvent[];
  automation: AutomationLane[];
  ingestion: IngestionConnector[];
  alerts: DashboardAlert[];
  allocator?: AllocatorSummary | null;
  weather_kpis: WeatherKpi[];
  suggestion_telemetry: SuggestionTelemetry[];
  suggestion_telemetry_summary?: SuggestionTelemetrySummary | null;
  context_tags: string[];
  context_warnings: { code: string; message: string; severity: string }[];
  data_coverage?: TenantDataCoverage | null;
}

export interface AlertAcknowledgeResponse {
  tenant_id: string;
  alert_id: string;
  acknowledged_at: string;
  acknowledged_by?: string | null;
  note?: string | null;
}

export interface AlertEscalateResponse {
  tenant_id: string;
  alert_id: string;
  escalated_at: string;
  channel: string;
  target: string;
  note?: string | null;
}
