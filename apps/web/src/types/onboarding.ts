export type OnboardingMode = "demo" | "live";

export interface OnboardingConnectorResponse {
  slug: string;
  label: string;
  status: string;
  progress: number;
  summary?: string | null;
  action?: string | null;
  updated_at?: string | null;
}

export interface OnboardingAuditResponse {
  id: string;
  status: string;
  headline: string;
  detail?: string | null;
  actor?: string | null;
  occurred_at?: string | null;
}

export interface OnboardingProgressResponse {
  tenant_id: string;
  mode: OnboardingMode;
  generated_at: string;
  fallback_reason?: string | null;
  connectors: OnboardingConnectorResponse[];
  audits: OnboardingAuditResponse[];
}
