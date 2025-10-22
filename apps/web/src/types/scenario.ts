import type { ConfidenceLevel } from "./plan";

export interface ScenarioRecommendationAdjustment {
  channel: string;
  multiplier: number;
  rationale: string;
  confidence: ConfidenceLevel;
}

export interface ScenarioRecommendation {
  id: string;
  label: string;
  description: string;
  adjustments: ScenarioRecommendationAdjustment[];
  tags: string[];
}

export interface ScenarioRecommendationResponse {
  tenant_id: string;
  generated_at: string;
  horizon_days: number;
  recommendations: ScenarioRecommendation[];
}
