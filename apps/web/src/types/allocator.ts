export interface ShadowEpisode {
  index: number;
  variant: string;
  reward: number;
  candidate_profit: number;
  baseline_profit: number;
  guardrail_violated: boolean;
  realised_roas: Record<string, number>;
  disabled_after_episode: boolean;
  safety_override: boolean;
}

export interface ShadowValidationCheck {
  name: string;
  status: boolean;
  value: number;
  threshold: number;
  observed_baseline_runs?: number;
  required_baseline_runs?: number;
}

export interface ShadowValidationSummary {
  episodes: number;
  safety_override_rate: number;
  disabled_variants: string[];
}

export interface ShadowValidationStressEpisode {
  index: number;
  variant: string;
  guardrail_violated: boolean;
  disabled_after_episode: boolean;
}

export interface ShadowValidationStressConfig {
  episodes: number;
  epsilon: number;
  seed: number;
  max_guardrail_breaches: number;
}

export interface ShadowValidationStressTest {
  config: ShadowValidationStressConfig;
  guardrail_violations: number;
  guardrail_breach_counts: Record<string, number>;
  selection_counts: Record<string, number>;
  disabled_variants: string[];
  episodes: ShadowValidationStressEpisode[];
  assertions: Record<string, boolean>;
}

export interface ShadowValidation {
  checks: ShadowValidationCheck[];
  summary: ShadowValidationSummary;
  notes: string[];
  stress_test: ShadowValidationStressTest;
}

export interface ShadowRunReport {
  generated_at: string;
  average_reward: number;
  guardrail_violations: number;
  q_values: Record<string, number>;
  selection_counts: Record<string, number>;
  episodes: ShadowEpisode[];
  guardrail_breach_counts: Record<string, number>;
  disabled_variants: string[];
  diagnostics: Record<string, number>;
  config: Record<string, unknown>;
  scenario: Record<string, unknown>;
  validation: ShadowValidation;
}

export interface SaturationMarket {
  name: string;
  allocated_spend: number;
  share: number;
  fair_share: number;
  min_share: number;
  revenue: number;
  roas: number;
  saturation_ratio: number;
  lift_vs_current: number;
  current_spend: number;
  weather_multiplier: number;
  guardrail_binding: boolean;
}

export interface SaturationSummary {
  profit: number;
  baseline_profit: number;
  profit_lift: number;
  weighted_fairness_gap: number;
  max_fairness_gap: number;
  total_revenue: number;
  total_spend: number;
}

export interface SaturationReport {
  generated_at: string;
  total_budget: number;
  fairness_floor: number;
  roas_floor: number;
  summary: SaturationSummary;
  markets: SaturationMarket[];
  allocator: Record<string, unknown>;
}
