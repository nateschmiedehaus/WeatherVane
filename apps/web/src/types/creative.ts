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

export interface CreativeResponseReport {
  generated_at: string;
  policy: CreativePolicy;
  summary: CreativeSummary;
  top_creatives: CreativeHighlight[];
  creatives: CreativeRow[];
}

