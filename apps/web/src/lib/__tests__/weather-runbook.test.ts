import { describe, expect, it } from "vitest";

import {
  buildGuardrailRunbookSection,
  buildIngestionRunbookSection,
  buildWeatherRunbookSection,
} from "../weather-runbook";
import type {
  GuardrailSegment,
  IngestionConnector,
  WeatherKpi,
  WeatherRiskEvent,
} from "../../types/dashboard";

describe("weather runbook helpers", () => {
  it("flags guardrail breaches as critical and surfaces the top variance", () => {
    const guardrails: GuardrailSegment[] = [
      {
        name: "Budget pacing",
        status: "breach",
        value: 1.45,
        target: 1,
        unit: "ratio",
        delta_pct: 45,
        notes: "Campaign overspend",
      },
      {
        name: "ROAS floor",
        status: "watch",
        value: 1.8,
        target: 2.2,
        unit: "ratio",
        delta_pct: -18,
        notes: null,
      },
      {
        name: "CPA",
        status: "healthy",
        value: 52,
        target: 55,
        unit: "usd",
        delta_pct: -5,
        notes: null,
      },
    ];

    const section = buildGuardrailRunbookSection(guardrails);

    expect(section.status).toBe("critical");
    expect(section.summary).toContain("Budget pacing");
    expect(section.metrics.find((metric) => metric.label === "Breaches")?.value).toBe("1");
    expect(section.actions[1]).toContain("Escalate");
  });

  it("surfaces ingestion failures and names the impacted connector", () => {
    const connectors: IngestionConnector[] = [
      {
        name: "Meta Ads",
        source: "meta",
        status: "failed",
        lag_minutes: 240,
        sla_minutes: 60,
        last_synced_at: "2025-10-19T23:00:00Z",
        notes: "Auth revoked",
      },
      {
        name: "Google Ads",
        source: "google",
        status: "delayed",
        lag_minutes: 95,
        sla_minutes: 45,
        last_synced_at: "2025-10-19T22:45:00Z",
        notes: null,
      },
    ];

    const section = buildIngestionRunbookSection(connectors);

    expect(section.status).toBe("critical");
    expect(section.summary).toContain("Meta Ads");
    expect(section.metrics.find((metric) => metric.label === "Failed")?.helper).toBe("Meta Ads");
    expect(section.actions[1]).toContain("data engineering");
  });

  it("classifies high severity weather events and captures KPI impact deltas", () => {
    const events: WeatherRiskEvent[] = [
      {
        id: "ev-1",
        title: "Severe thunderstorms",
        description: "Storm front moving across northeast corridor",
        severity: "high",
        geo_region: "Northeast",
        starts_at: "2025-10-20T00:00:00Z",
        ends_at: "2025-10-21T06:00:00Z",
        latitude: null,
        longitude: null,
        weather_type: "thunderstorm",
      },
      {
        id: "ev-2",
        title: "Heatwave tapering",
        description: "Temperatures normalising after peak",
        severity: "medium",
        geo_region: "West",
        starts_at: "2025-10-21T12:00:00Z",
        ends_at: null,
        latitude: null,
        longitude: null,
        weather_type: "heat",
      },
    ];
    const kpis: WeatherKpi[] = [
      {
        id: "kpi-1",
        label: "Weather-attributed revenue",
        value: 1.9,
        unit: "x",
        delta_pct: 18,
        sparkline: [],
        description: "Weather uplift vs control",
      },
      {
        id: "kpi-2",
        label: "Store downtime risk",
        value: 2.4,
        unit: "hours",
        delta_pct: -12,
        sparkline: [],
        description: "Projected downtime per store",
      },
    ];

    const section = buildWeatherRunbookSection(events, kpis, new Date("2025-10-20T01:00:00Z"));

    expect(section.status).toBe("critical");
    expect(section.summary).toContain("Severe thunderstorms");
    expect(section.metrics[0]?.value).toBe("1");
    expect(section.metrics[3]?.helper).toContain("1.9");
    expect(section.actions[1]).toContain("protocol");
  });
});
