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

export interface OnboardingAuditEvidenceResponse {
  id?: string | null;
  label?: string | null;
  value?: string | null;
  tone?: string | null;
  context?: string | null;
  link_label?: string | null;
  link_href?: string | null;
}

export interface OnboardingAuditNarrativeResponse {
  why?: string | null;
  impact?: string | null;
  impact_label?: string | null;
  impact_value?: string | null;
  impact_context?: string | null;
  next_step?: string | null;
}

export interface OnboardingAuditActionResponse {
  id?: string | null;
  label?: string | null;
  intent?: string | null;
  href?: string | null;
  tooltip?: string | null;
}

export interface OnboardingAuditResponse {
  id: string;
  status: string;
  headline: string;
  detail?: string | null;
  actor?: string | null;
  occurred_at?: string | null;
  evidence?: OnboardingAuditEvidenceResponse[] | null;
  narrative?: OnboardingAuditNarrativeResponse | null;
  actions?: OnboardingAuditActionResponse[] | null;
}

export interface OnboardingProgressResponse {
  tenant_id: string;
  mode: OnboardingMode;
  generated_at: string;
  fallback_reason?: string | null;
  connectors: OnboardingConnectorResponse[];
  audits: OnboardingAuditResponse[];
}
