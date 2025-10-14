import { describe, expect, it } from "vitest";

import {
  summarizeAlerts,
  summarizeGuardrails,
  summarizeIngestionLag,
  summarizeWeatherEvents,
} from "../../apps/web/src/lib/dashboard-insights";
import type {
  DashboardAlert,
  GuardrailSegment,
  IngestionConnector,
  WeatherRiskEvent,
} from "../../apps/web/src/types/dashboard";

describe("dashboard insights", () => {
  it("summarises guardrail status with breach precedence", () => {
    const segments: GuardrailSegment[] = [
      {
        name: "Budget",
        status: "healthy",
        value: 95,
        target: 90,
        unit: "pct",
        delta_pct: 2,
      },
      {
        name: "ROAS",
        status: "watch",
        value: 3.1,
        target: 3,
        unit: "ratio",
        delta_pct: -1.2,
      },
      {
        name: "CPA",
        status: "breach",
        value: 55,
        target: 50,
        unit: "usd",
        delta_pct: 5.4,
      },
    ];

    const summary = summarizeGuardrails(segments);

    expect(summary.breachCount).toBe(1);
    expect(summary.watchCount).toBe(1);
    expect(summary.healthyCount).toBe(1);
    expect(summary.overallStatus).toBe("breach");
    expect(summary.averageDelta).toBeCloseTo(2.07, 2);
  });

  it("reports alert severities and acknowledgement count", () => {
    const alerts: DashboardAlert[] = [
      {
        id: "critical",
        title: "Critical alert",
        detail: "CPA breach in South region",
        severity: "critical",
        occurred_at: new Date().toISOString(),
        acknowledged: false,
        related_objects: [],
      },
      {
        id: "warning",
        title: "Warning alert",
        detail: "Meta connector backing off",
        severity: "warning",
        occurred_at: new Date().toISOString(),
        acknowledged: true,
        related_objects: ["connector:meta"],
      },
      {
        id: "info",
        title: "Informational",
        detail: "Heatwave lift expected",
        severity: "info",
        occurred_at: new Date().toISOString(),
        acknowledged: true,
        related_objects: [],
      },
    ];

    const summary = summarizeAlerts(alerts);

    expect(summary.critical).toBe(1);
    expect(summary.warning).toBe(1);
    expect(summary.info).toBe(1);
    expect(summary.acknowledged).toBe(2);
  });

  it("computes ingestion lag with out-of-sla detection", () => {
    const connectors: IngestionConnector[] = [
      {
        name: "Shopify",
        source: "Commerce",
        status: "healthy",
        lag_minutes: 4,
        sla_minutes: 10,
        last_synced_at: new Date().toISOString(),
        notes: null,
      },
      {
        name: "Meta Ads",
        source: "Paid Social",
        status: "delayed",
        lag_minutes: 26,
        sla_minutes: 15,
        last_synced_at: new Date().toISOString(),
        notes: null,
      },
    ];

    const summary = summarizeIngestionLag(connectors);

    expect(summary.outOfSlaCount).toBe(1);
    expect(summary.slowestConnector?.name).toBe("Meta Ads");
    expect(summary.averageLagMinutes).toBeCloseTo(15, 1);
  });

  it("identifies the next weather event and counts high-risk entries", () => {
    const now = new Date("2025-05-01T12:00:00Z");
    const events: WeatherRiskEvent[] = [
      {
        id: "past",
        title: "Past storm",
        description: "",
        severity: "high",
        geo_region: "North",
        starts_at: "2025-05-01T08:00:00Z",
        ends_at: "2025-05-01T09:00:00Z",
        latitude: 40,
        longitude: -90,
        weather_type: "storm",
      },
      {
        id: "next",
        title: "Upcoming heatwave",
        description: "",
        severity: "medium",
        geo_region: "South",
        starts_at: "2025-05-01T16:00:00Z",
        ends_at: "2025-05-01T20:00:00Z",
        latitude: 32,
        longitude: -95,
        weather_type: "heat",
      },
      {
        id: "later",
        title: "Later hail",
        description: "",
        severity: "high",
        geo_region: "Midwest",
        starts_at: "2025-05-02T04:00:00Z",
        ends_at: "2025-05-02T08:00:00Z",
        latitude: 42,
        longitude: -88,
        weather_type: "hail",
      },
    ];

    const summary = summarizeWeatherEvents(events, now);

    expect(summary.nextEvent?.id).toBe("next");
    expect(summary.highRiskCount).toBe(2);
  });
});

