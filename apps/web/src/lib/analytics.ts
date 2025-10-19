export interface AnalyticsEventPayload {
  [key: string]: unknown;
}

export interface AnalyticsDispatchOptions {
  event: string;
  payload?: AnalyticsEventPayload;
  timestamp?: string;
}

function getTimestamp(): string {
  return new Date().toISOString();
}

export function trackDashboardEvent(
  event: string,
  payload: AnalyticsEventPayload = {},
): void {
  if (typeof window === "undefined") {
    return;
  }

  const timestamp = getTimestamp();
  const detail: AnalyticsDispatchOptions = { event, payload, timestamp };

  if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
    window.dispatchEvent(new CustomEvent("analytics:track", { detail }));
  }

  const dataLayer = (window as unknown as { dataLayer?: unknown[] }).dataLayer;
  if (Array.isArray(dataLayer)) {
    dataLayer.push({ analyticsEvent: event, ...payload, timestamp });
  }
}
