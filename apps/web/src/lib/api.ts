import type {
  AutomationSettingsResponse,
  AutomationUpdatePayload,
} from "../types/automation";
import type { PlanResponse } from "../types/plan";
import type { DashboardResponse } from "../types/dashboard";
import type { IncrementalityReport } from "../types/incrementality";
import type { StoriesResponse } from "../types/stories";
import type { CatalogResponse } from "../types/catalog";
import type { CreativeResponseReport } from "../types/creative";
import type { SaturationReport, ShadowRunReport } from "../types/allocator";
import type {
  OnboardingMode,
  OnboardingProgressResponse,
} from "../types/onboarding";
import type { AlertAcknowledgeResponse, AlertEscalateResponse } from "../types/dashboard";
import type { WeatherFocusSuggestionAnalyticsPayload } from "./dashboard-analytics";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API ${response.status}: ${detail || response.statusText}`);
  }
  return (await response.json()) as T;
}

export function fetchAutomationSettings(
  tenantId: string,
): Promise<AutomationSettingsResponse> {
  return request<AutomationSettingsResponse>(`/settings/${tenantId}/automation`);
}

export function updateAutomationSettings(
  tenantId: string,
  payload: AutomationUpdatePayload,
): Promise<AutomationSettingsResponse> {
  return request<AutomationSettingsResponse>(`/settings/${tenantId}/automation`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchPlan(
  tenantId: string,
  horizonDays = 7,
): Promise<PlanResponse> {
  const search = new URLSearchParams({ horizon_days: String(horizonDays) }).toString();
  return request<PlanResponse>(`/plans/${tenantId}?${search}`);
}

export function fetchStories(
  tenantId: string,
  horizonDays = 7,
  limit = 6,
): Promise<StoriesResponse> {
  const search = new URLSearchParams({ horizon_days: String(horizonDays), limit: String(limit) }).toString();
  return request<StoriesResponse>(`/stories/${tenantId}?${search}`);
}

export function fetchCatalog(
  tenantId: string,
  horizonDays = 7,
  limit = 12,
): Promise<CatalogResponse> {
  const search = new URLSearchParams({ horizon_days: String(horizonDays), limit: String(limit) }).toString();
  return request<CatalogResponse>(`/catalog/${tenantId}?${search}`);
}

export function fetchExperimentReport(tenantId: string): Promise<IncrementalityReport> {
  return request<IncrementalityReport>(`/experiments/${tenantId}`);
}

export function fetchCreativeResponse(tenantId: string): Promise<CreativeResponseReport> {
  return request<CreativeResponseReport>(`/creative/${tenantId}`);
}

export interface FetchDashboardOptions {
  since?: Date | string;
}

function normaliseSinceParam(value: Date | string | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

export function fetchDashboard(
  tenantId: string,
  options?: FetchDashboardOptions,
): Promise<DashboardResponse> {
  const params = new URLSearchParams();
  const since = normaliseSinceParam(options?.since);
  if (since) {
    params.set("since", since);
  }
  const query = params.toString();
  const path = query ? `/dashboard/${tenantId}?${query}` : `/dashboard/${tenantId}`;
  return request<DashboardResponse>(path);
}

export interface AlertAcknowledgePayload {
  acknowledgedBy?: string;
  note?: string;
}

export function acknowledgeDashboardAlert(
  tenantId: string,
  alertId: string,
  payload?: AlertAcknowledgePayload,
): Promise<AlertAcknowledgeResponse> {
  return request<AlertAcknowledgeResponse>(`/dashboard/${tenantId}/alerts/${alertId}/ack`, {
    method: "POST",
    body: JSON.stringify(payload ?? {}),
  });
}

export interface AlertEscalatePayload {
  channel?: string;
  target: string;
  note?: string;
}

export function escalateDashboardAlert(
  tenantId: string,
  alertId: string,
  payload: AlertEscalatePayload,
): Promise<AlertEscalateResponse> {
  return request<AlertEscalateResponse>(`/dashboard/${tenantId}/alerts/${alertId}/escalate`, {
    method: "POST",
    body: JSON.stringify({
      channel: payload.channel ?? "slack",
      target: payload.target,
      note: payload.note ?? undefined,
    }),
  });
}

export function fetchShadowReport(tenantId: string): Promise<ShadowRunReport> {
  return request<ShadowRunReport>(`/allocator/shadow/${tenantId}`);
}

export function fetchSaturationReport(tenantId: string): Promise<SaturationReport> {
  return request<SaturationReport>(`/allocator/saturation/${tenantId}`);
}

export function fetchOnboardingProgress(
  tenantId: string,
  mode: OnboardingMode = "demo",
): Promise<OnboardingProgressResponse> {
  const search = new URLSearchParams({
    tenant_id: tenantId,
    mode,
  }).toString();
  return request<OnboardingProgressResponse>(`/onboarding/progress?${search}`);
}

type OnboardingEventMetadata = Record<string, unknown>;

export async function recordOnboardingEvent(
  tenantId: string,
  name: string,
  mode: OnboardingMode = "demo",
  metadata?: OnboardingEventMetadata,
): Promise<void> {
  try {
    await request<unknown>("/onboarding/events", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: tenantId,
        name,
        mode,
        metadata: metadata ?? undefined,
      }),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console -- surfaced only during local development
      console.warn("Failed to record onboarding event", error);
    }
  }
}

export interface DashboardSuggestionEventDispatch {
  tenantId: string;
  event: string;
  payload: WeatherFocusSuggestionAnalyticsPayload;
  occurredAt?: string;
}

export async function recordDashboardSuggestionEvent(
  dispatch: DashboardSuggestionEventDispatch,
): Promise<void> {
  try {
    await request<unknown>("/analytics/dashboard/suggestion-events", {
      method: "POST",
      body: JSON.stringify({
        tenantId: dispatch.tenantId,
        event: dispatch.event,
        payload: dispatch.payload,
        occurredAt: dispatch.occurredAt ?? undefined,
      }),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console -- surfaced only during local development
      console.warn("Failed to record dashboard suggestion analytics event", error);
    }
  }
}
