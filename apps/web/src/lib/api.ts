import type {
  AutomationSettingsResponse,
  AutomationUpdatePayload,
} from "../types/automation";
import type { PlanResponse } from "../types/plan";
import type { IncrementalityReport } from "../types/incrementality";
import type { StoriesResponse } from "../types/stories";
import type { CatalogResponse } from "../types/catalog";

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
