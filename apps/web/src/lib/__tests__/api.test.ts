import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchDashboard } from "../api";
import type { DashboardResponse } from "../../types/dashboard";

const mockDashboardResponse: DashboardResponse = {
  tenant_id: "demo-tenant",
  generated_at: new Date("2025-05-01T12:00:00Z").toISOString(),
  guardrails: [],
  spend_trackers: [],
  weather_events: [],
  automation: [],
  ingestion: [],
  alerts: [],
  allocator: null,
  weather_kpis: [],
  suggestion_telemetry: [],
  suggestion_telemetry_summary: null,
  context_tags: [],
  context_warnings: [],
};

describe("fetchDashboard", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockDashboardResponse,
    });
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appends a since query parameter when provided a Date lookback", async () => {
    const since = new Date("2025-05-01T00:00:00Z");

    await fetchDashboard("demo-tenant", { since });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [RequestInfo | URL, RequestInit?];
    const requestUrl = new URL(typeof url === "string" ? url : url.toString());
    expect(requestUrl.pathname).toBe("/v1/dashboard/demo-tenant");
    expect(requestUrl.searchParams.get("since")).toBe(since.toISOString());
  });

  it("omits the since query parameter when no lookback is provided", async () => {
    await fetchDashboard("demo-tenant");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [RequestInfo | URL, RequestInit?];
    const requestUrl = new URL(typeof url === "string" ? url : url.toString());
    expect(requestUrl.searchParams.has("since")).toBe(false);
  });

  it("ignores invalid since values to avoid emitting malformed requests", async () => {
    await fetchDashboard("demo-tenant", { since: "not-a-real-timestamp" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0] as [RequestInfo | URL, RequestInit?];
    const requestUrl = new URL(typeof url === "string" ? url : url.toString());
    expect(requestUrl.searchParams.has("since")).toBe(false);
  });
});
