import type { ContextWarning } from "./context";
import type { ConfidenceLevel } from "./plan";

export interface ReportHeroTile {
  id: string;
  label: string;
  value: number;
  unit: "usd" | "percent" | "multiple" | string;
  narrative: string;
  delta_pct: number | null;
  delta_value: number | null;
}

export interface ReportNarrativeCard {
  id: string;
  headline: string;
  summary: string;
  weather_driver: string;
  spend: number;
  expected_revenue: number;
  confidence: ConfidenceLevel;
  plan_date: string;
  category: string;
  channel: string;
}

export interface ReportTrendPoint {
  date: string;
  recommended_spend: number;
  weather_index: number;
  guardrail_score: number;
}

export interface ReportTrend {
  cadence: string;
  points: ReportTrendPoint[];
}

export interface ReportSchedule {
  status: string;
  cadence: string;
  recipients: string[];
  delivery_format: string;
  next_delivery_at: string | null;
  last_sent_at: string | null;
  can_edit: boolean;
  time_zone: string | null;
  note: string | null;
}

export interface ReportSuccessHighlight {
  headline: string;
  summary: string;
  metric_label: string;
  metric_value: number;
  metric_unit: string;
  cta_label: string;
  cta_href: string;
  persona: string;
}

export interface ReportsResponse {
  tenant_id: string;
  generated_at: string;
  hero_tiles: ReportHeroTile[];
  narratives: ReportNarrativeCard[];
  trend: ReportTrend;
  schedule: ReportSchedule;
  success: ReportSuccessHighlight;
  context_tags: string[];
  data_context?: Record<string, unknown> | null;
  context_warnings?: ContextWarning[];
}
