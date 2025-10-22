export interface CreativePolicy {
  roas_floor: number;
  warn_threshold: number;
  block_threshold: number;
  min_impressions: number;
}

export interface CreativeSummary {
  creative_count: number;
  active_creatives: number;
  blocked_creatives: number;
  watchlist_creatives: number;
  average_roas: number;
  median_roas: number;
  active_spend_share: number;
  watchlist_spend_share: number;
  blocked_spend_share: number;
  guardrail_counts: Record<string, number>;
}

export interface CreativeHighlight {
  creative_id: string;
  channel: string;
  roas_adjusted: number;
  brand_safety_score: number;
  status: string;
}

export interface CreativeRow {
  creative_id: string;
  channel: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  revenue: number;
  brand_safety_score: number;
  brand_safety_tier: string;
  brand_safety_factor: number;
  sample_size_factor: number;
  ctr: number;
  cvr: number;
  aov: number;
  roas_smoothed: number;
  roas_adjusted: number;
  guardrail_factor: number;
  status: string;
  guardrail: string | null;
  spend_share: number;
  profit_expectation: number;
}

export interface CreativeChannelGuardrail {
  channel: string;
  creative_count: number;
  active_creatives: number;
  watchlist_creatives: number;
  blocked_creatives: number;
  flagged_creatives: number;
  active_spend_share: number;
  watchlist_spend_share: number;
  blocked_spend_share: number;
  flagged_spend_share: number;
  average_roas: number;
  average_brand_safety: number;
  top_guardrail: string | null;
  top_guardrail_count: number;
  representative_creative: string | null;
  representative_status: string | null;
}

export interface CreativeResponseReport {
  generated_at: string;
  policy: CreativePolicy;
  summary: CreativeSummary;
  top_creatives: CreativeHighlight[];
  creatives: CreativeRow[];
  channel_guardrails: CreativeChannelGuardrail[];
}
