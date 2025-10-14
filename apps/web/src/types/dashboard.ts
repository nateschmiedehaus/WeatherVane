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
  escalated_to?: string | null;
  related_objects: string[];
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
  context_tags: string[];
  context_warnings: { code: string; message: string; severity: string }[];
}

