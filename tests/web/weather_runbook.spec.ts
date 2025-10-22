import { describe, expect, it } from "vitest";

import { buildWeatherRunbookPayload } from "../../apps/web/src/lib/weather-runbook";
import type { DashboardResponse } from "../../apps/web/src/types/dashboard";

describe("weather runbook payload", () => {
  const dashboardFixture: DashboardResponse = {
    tenant_id: "demo-tenant",
    generated_at: "2025-10-20T00:05:00Z",
    guardrails: [
      {
        name: "Budget pacing",
        status: "breach",
        value: 1.42,
        target: 1,
        unit: "ratio",
        delta_pct: 42,
        notes: "Promo overspend",
      },
      {
        name: "ROAS floor",
        status: "watch",
        value: 1.9,
        target: 2.4,
        unit: "ratio",
        delta_pct: -21,
        notes: null,
      },
    ],
    spend_trackers: [],
    weather_events: [
      {
        id: "storm-23",
        title: "Severe thunderstorms",
        description: "High winds expected across the northeast corridor",
        severity: "high",
        geo_region: "Northeast",
        starts_at: "2025-10-20T02:00:00Z",
        ends_at: "2025-10-20T16:00:00Z",
        latitude: null,
        longitude: null,
        weather_type: "thunderstorm",
      },
    ],
    automation: [
      {
        name: "Always-on paid social",
        uptime_pct: 98,
        incidents_7d: 2,
        last_incident_at: "2025-10-18T05:00:00Z",
        status: "degraded",
        notes: "Retry budget exceeded",
      },
    ],
    ingestion: [
      {
        name: "Meta Ads",
        source: "meta",
        status: "delayed",
        lag_minutes: 75,
        sla_minutes: 45,
        last_synced_at: "2025-10-19T22:35:00Z",
        notes: null,
      },
      {
        name: "Google Ads",
        source: "google",
        status: "healthy",
        lag_minutes: 12,
        sla_minutes: 45,
        last_synced_at: "2025-10-19T23:45:00Z",
        notes: null,
      },
    ],
    alerts: [
      {
        id: "alert-1",
        title: "Allocator sync overdue",
        detail: "Allocator refresh stalled due to ingestion lag",
        severity: "warning",
        occurred_at: "2025-10-20T00:10:00Z",
        acknowledged: false,
        acknowledged_at: null,
        escalated_to: null,
        escalated_at: null,
        escalation_channel: null,
        related_objects: [],
      },
    ],
    allocator: null,
    weather_kpis: [
      {
        id: "kpi-1",
        label: "Weather uplift",
        value: 2.1,
        unit: "x",
        delta_pct: 24,
        sparkline: [],
        description: "Incremental lift vs control",
      },
      {
        id: "kpi-2",
        label: "Store downtime risk",
        value: 3.5,
        unit: "hours",
        delta_pct: -15,
        sparkline: [],
        description: "Projected downtime per day",
      },
    ],
    suggestion_telemetry: [],
    suggestion_telemetry_summary: null,
    context_tags: ["WeatherOps"],
    context_warnings: [],
  };

  it("produces runbook sections and dashboards wired to WeatherOps data", () => {
    const payload = buildWeatherRunbookPayload(dashboardFixture, new Date("2025-10-20T01:00:00Z"));

    expect(payload.sections).toHaveLength(5);
    const guardrails = payload.sections.find((section) => section.id === "guardrails");
    const ingestion = payload.sections.find((section) => section.id === "ingestion");
    const weather = payload.sections.find((section) => section.id === "weather");
    const alerts = payload.sections.find((section) => section.id === "alerts");

    expect(guardrails?.status).toBe("critical");
    expect(guardrails?.metrics.find((metric) => metric.label === "Breaches")?.value).toBe("1");

    expect(ingestion?.status).toBe("caution");
    expect(ingestion?.summary).toContain("Lagging connectors");

    expect(weather?.summary).toContain("Severe thunderstorms");
    expect(weather?.actions[1]).toContain("protocol");

    expect(alerts?.status).toBe("caution");
    expect(alerts?.summary).toContain("Alerts require review");

    expect(payload.dashboards).toHaveLength(4);
    expect(payload.dashboards[0]?.statValue).toBe("1 / 2");
    expect(payload.dashboards[1]?.summary).toContain("Lagging connectors");
    expect(payload.generatedAtLabel).toContain("2025");
    expect(payload.generatedAgo).toBe("55 min ago");
  });
});
