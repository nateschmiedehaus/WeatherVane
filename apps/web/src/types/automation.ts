import type { ContextWarning } from "./context";

export type AutomationMode = "manual" | "assist" | "autopilot";
export type ConsentStatus = "pending" | "granted" | "revoked";

export interface GuardrailSettings {
  max_daily_budget_delta_pct: number;
  min_daily_spend: number;
  roas_floor: number | null;
  cpa_ceiling: number | null;
  change_windows: string[];
}

export interface AutomationConsent {
  status: ConsentStatus;
  version: string;
  granted_at: string | null;
  revoked_at: string | null;
  actor: string | null;
  channel: string;
}

export interface AutomationSettings {
  mode: AutomationMode;
  pushes_enabled: boolean;
  daily_push_cap: number;
  push_window_start_utc: string | null;
  push_window_end_utc: string | null;
  guardrails: GuardrailSettings;
  consent: AutomationConsent;
  retention_days: number;
  last_export_at: string | null;
  last_delete_at: string | null;
  last_updated_at: string | null;
  updated_by: string | null;
  notes: string | null;
  data_context_tags?: string[];
}

export interface AutomationSettingsResponse {
  tenant_id: string;
  settings: AutomationSettings;
  updated_at: string | null;
  context_tags: string[];
  data_context: Record<string, unknown> | null;
  context_warnings: ContextWarning[];
}

export interface AutomationUpdatePayload extends Partial<AutomationSettings> {
  updated_by?: string | null;
}
