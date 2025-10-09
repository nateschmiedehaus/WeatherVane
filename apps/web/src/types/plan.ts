import type { ContextWarning } from "./context";
import type { IncrementalityDesign, IncrementalitySummary } from "./incrementality";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface Quantiles {
  p10: number;
  p50: number;
  p90: number;
}

export interface PlanRationale {
  primary_driver: string;
  supporting_factors: string[];
  confidence_level: ConfidenceLevel;
  data_quality: string;
  assumptions: string[];
  risks: string[];
}

export interface PlanSlice {
  plan_date: string;
  geo_group_id: string;
  category: string;
  channel: string;
  cell?: string | null;
  recommended_spend: number;
  expected_revenue: Quantiles;
  expected_roas: Quantiles | null;
  confidence: ConfidenceLevel;
  assumptions: string[];
  rationale: PlanRationale;
  status?: string | null;
}

export interface PlanResponse {
  tenant_id: string;
  generated_at: string;
  horizon_days: number;
  slices: PlanSlice[];
  context_tags: string[];
  data_context?: Record<string, unknown> | null;
  context_warnings?: ContextWarning[];
  incrementality_design?: IncrementalityDesign | null;
  incrementality_summary?: IncrementalitySummary | null;
}
