import { describe, expect, it } from "vitest";

import {
  summarizeAlerts,
  summarizeEscalations,
  summarizeGuardrails,
  summarizeIngestionLag,
  summarizeWeatherEvents,
  groupWeatherEventsByRegion,
  filterWeatherEventsByRegion,
  mapWeatherTimelineItems,
  normalizeWeatherRegionLabel,
  describeWeatherRegionGroup,
  resolveRegionFilterTarget,
  weatherRegionSlug,
  findRegionLabelBySlug,
  stackGuardrails,
  determineDashboardMode,
  formatRelativeTime,
  buildWeatherSuggestionIdleStory,
  buildWeatherFocusInsights,
  selectWeatherFocusSuggestion,
  describeGuardrailHero,
  summarizeAllocatorPressure,
  summarizeAllocatorDiagnostics,
  summarizeSuggestionTelemetry,
  buildSuggestionTelemetryOverview,
  buildHighRiskAlertDescriptor,
  describeHighRiskAlerts,
  topAllocatorRecommendations,
  formatWeatherKpiValue,
  type DashboardMode,
  type WeatherTimelineItem,
  type UpcomingWeather,
  type WeatherFocusSuggestion,
} from "../../apps/web/src/lib/dashboard-insights";
import {
  buildSuggestionDismissEvent,
  buildSuggestionFocusEvent,
  buildSuggestionMetadata,
  buildSuggestionSignature,
  buildSuggestionViewEvent,
  resolveViewportBreakpoint,
} from "../../apps/web/src/lib/dashboard-analytics";
import type {
  AllocatorSummary,
  DashboardAlert,
  GuardrailSegment,
  IngestionConnector,
  SuggestionTelemetry,
  SuggestionTelemetrySummary,
  WeatherKpi,
  WeatherRiskEvent,
  WeatherRegionGroup,
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

  describe("describeGuardrailHero", () => {
    const baseSummary = {
      healthyCount: 0,
      watchCount: 0,
      breachCount: 0,
      averageDelta: 0,
      overallStatus: "healthy" as const,
    };

    it("encourages setup when no guardrails exist", () => {
      const copy = describeGuardrailHero(baseSummary, { guardrailCount: 0 });
      expect(copy).toContain("No guardrails published yet");
    });

    it("highlights breach urgency", () => {
      const copy = describeGuardrailHero(
        { ...baseSummary, breachCount: 1, overallStatus: "breach" },
        { guardrailCount: 2 },
      );
      expect(copy).toContain("Guardrail breach detected");
    });

    it("frames watchlist drift", () => {
      const copy = describeGuardrailHero(
        { ...baseSummary, watchCount: 2, overallStatus: "watch" },
        { guardrailCount: 4 },
      );
      expect(copy).toContain("Guardrails are drifting");
    });

    it("confirms steady state when healthy", () => {
      const copy = describeGuardrailHero(
        { ...baseSummary, healthyCount: 5, overallStatus: "healthy" },
        { guardrailCount: 5 },
      );
      expect(copy).toContain("Guardrails holding steady");
    });
  });

  describe("determineDashboardMode", () => {
    const baseGuardrails = {
      healthyCount: 2,
      watchCount: 0,
      breachCount: 0,
      averageDelta: 0,
      overallStatus: "healthy" as const,
    };
    const baseAlerts = {
      critical: 0,
      warning: 0,
      info: 0,
      acknowledged: 0,
    };
    const generatedAt = "2025-05-01T12:00:00Z";
    const now = new Date("2025-05-01T12:15:00Z");

    const compute = (overrides: {
      guardrails?: Partial<typeof baseGuardrails>;
      alerts?: Partial<typeof baseAlerts>;
      generatedAt?: string | null;
      nowOffsetMinutes?: number;
    }): DashboardMode => {
      const generatedAtInput =
        Object.prototype.hasOwnProperty.call(overrides, "generatedAt") &&
        overrides.generatedAt !== undefined
          ? overrides.generatedAt
          : generatedAt;

      return determineDashboardMode({
        guardrails: { ...baseGuardrails, ...(overrides.guardrails ?? {}) },
        alerts: { ...baseAlerts, ...(overrides.alerts ?? {}) },
        generatedAt: generatedAtInput ?? undefined,
        now:
          typeof overrides.nowOffsetMinutes === "number"
            ? new Date(now.getTime() + overrides.nowOffsetMinutes * 60000)
            : now,
      });
    };

    it("returns brief when telemetry is fresh and healthy", () => {
      expect(compute({})).toBe("brief");
    });

    it("returns incident when a guardrail breach exists", () => {
      expect(
        compute({ guardrails: { overallStatus: "breach", breachCount: 1 } }),
      ).toBe("incident");
    });

    it("returns incident when critical alerts are active", () => {
      expect(compute({ alerts: { critical: 1 } })).toBe("incident");
    });

    it("returns watch when guardrails are on watch but no breach", () => {
      expect(
        compute({ guardrails: { overallStatus: "watch", watchCount: 1 } }),
      ).toBe("watch");
    });

    it("returns offline when telemetry is stale", () => {
      expect(compute({ nowOffsetMinutes: 45 })).toBe("offline");
    });

    it("returns offline when generated timestamp missing", () => {
      expect(compute({ generatedAt: null })).toBe("offline");
    });
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

  it("summarises escalation load and recency", () => {
    const alerts: DashboardAlert[] = [
      {
        id: "recent-escalation",
        title: "Recent escalation",
        detail: "CPA breach escalating to on-call",
        severity: "critical",
        occurred_at: "2025-05-01T11:50:00Z",
        acknowledged: false,
        acknowledged_at: null,
        escalated_to: "On-call Operator",
        escalated_at: "2025-05-01T11:55:00Z",
        escalation_channel: "slack",
        related_objects: [],
      },
      {
        id: "older-escalation",
        title: "Older escalation",
        detail: "Connector outage escalated to data team",
        severity: "warning",
        occurred_at: "2025-05-01T10:00:00Z",
        acknowledged: true,
        acknowledged_at: "2025-05-01T10:30:00Z",
        escalated_to: "Data Team",
        escalated_at: "2025-05-01T10:05:00Z",
        escalation_channel: "pagerduty",
        related_objects: [],
      },
      {
        id: "non-escalated",
        title: "Non escalated info",
        detail: "Weather brief only",
        severity: "info",
        occurred_at: "2025-05-01T09:00:00Z",
        acknowledged: false,
        acknowledged_at: null,
        escalated_to: null,
        escalated_at: null,
        escalation_channel: null,
        related_objects: [],
      },
    ];

    const summary = summarizeEscalations(alerts);

    expect(summary.totalEscalated).toBe(2);
    expect(summary.activeCount).toBe(1);
    expect(summary.lastEscalatedTarget).toBe("On-call Operator");
    expect(summary.lastEscalationChannel).toBe("slack");
    expect(summary.lastEscalatedAt).toBe("2025-05-01T11:55:00.000Z");
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

  it("formats relative time for past and future timestamps", () => {
    const reference = new Date("2025-05-01T12:00:00Z");

    expect(formatRelativeTime("2025-05-01T12:00:00Z", { now: reference })).toBe(
      "just now",
    );
    expect(formatRelativeTime("2025-05-01T11:55:00Z", { now: reference })).toBe(
      "5 minutes ago",
    );
    expect(formatRelativeTime("2025-05-01T12:20:00Z", { now: reference })).toBe(
      "in 20 minutes",
    );
    expect(formatRelativeTime("2025-05-02T12:00:00Z", { now: reference })).toBe(
      "in 1 day",
    );
    expect(formatRelativeTime("invalid", { now: reference })).toBe("unknown");
  });

  it("groups weather events by region with severity ordering", () => {
    const events: WeatherRiskEvent[] = [
      {
        id: "alpha-high",
        title: "Alpha storm",
        description: "",
        severity: "high",
        geo_region: "Alpha",
        starts_at: "2025-05-01T14:00:00Z",
        ends_at: null,
        latitude: 40,
        longitude: -100,
        weather_type: "storm",
      },
      {
        id: "alpha-medium",
        title: "Alpha drizzle",
        description: "",
        severity: "medium",
        geo_region: "Alpha",
        starts_at: "2025-05-01T18:00:00Z",
        ends_at: null,
        latitude: null,
        longitude: null,
        weather_type: "rain",
      },
      {
        id: "beta-low",
        title: "Beta wind",
        description: "",
        severity: "low",
        geo_region: " Beta ",
        starts_at: "2025-05-02T08:00:00Z",
        ends_at: null,
        latitude: 35,
        longitude: -90,
        weather_type: "wind",
      },
      {
        id: "no-region",
        title: "Mystery weather",
        description: "",
        severity: "medium",
        geo_region: "",
        starts_at: "2025-05-01T10:00:00Z",
        ends_at: null,
        latitude: null,
        longitude: null,
        weather_type: null,
      },
    ];

    const groups = groupWeatherEventsByRegion(events);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toMatchObject({
      region: "Alpha",
      eventCount: 2,
      highRiskCount: 1,
      highestSeverity: "high",
      nextEventStartsAt: "2025-05-01T14:00:00.000Z",
    });
    expect(groups[1]).toMatchObject({
      region: "Unspecified region",
      eventCount: 1,
      highRiskCount: 0,
      highestSeverity: "medium",
    });
    expect(groups[2]).toMatchObject({
      region: "Beta",
      eventCount: 1,
      highRiskCount: 0,
      highestSeverity: "low",
    });
  });

  it("normalizes weather region labels by trimming and collapsing whitespace", () => {
    expect(normalizeWeatherRegionLabel("  gulf   coast  ")).toBe("gulf coast");
    expect(normalizeWeatherRegionLabel(null)).toBe("Unspecified region");
    expect(normalizeWeatherRegionLabel("")).toBe("Unspecified region");
  });

  it("creates stable slugs for weather regions", () => {
    expect(weatherRegionSlug("Gulf Coast")).toBe("gulf-coast");
    expect(weatherRegionSlug("  Gulf   Coast ")).toBe("gulf-coast");
    expect(weatherRegionSlug(null)).toBe("unspecified-region");
  });

  it("finds region labels when provided a slugged query value", () => {
    const regions: WeatherRegionGroup[] = [
      {
        region: "Gulf Coast",
        eventCount: 3,
        highRiskCount: 1,
        highestSeverity: "high",
        nextEventStartsAt: "2025-05-01T10:00:00Z",
      },
      {
        region: "Unspecified region",
        eventCount: 1,
        highRiskCount: 0,
        highestSeverity: "low",
        nextEventStartsAt: null,
      },
    ];

    expect(findRegionLabelBySlug(regions, "gulf-coast")).toBe("Gulf Coast");
    expect(findRegionLabelBySlug(regions, "gulf coast")).toBe("Gulf Coast");
    expect(findRegionLabelBySlug(regions, "UNSPECIFIED-REGION")).toBe("Unspecified region");
    expect(findRegionLabelBySlug(regions, "unknown-region")).toBeNull();
  });

  it("summarises weather region groups with event, risk, and schedule metadata", () => {
    const region: WeatherRegionGroup = {
      region: "Gulf Coast",
      eventCount: 4,
      highRiskCount: 2,
      highestSeverity: "high",
      nextEventStartsAt: "2025-05-01T16:00:00Z",
    };
    const summary = describeWeatherRegionGroup(region, {
      now: new Date("2025-05-01T12:00:00Z"),
    });

    expect(summary).toBe("4 events · 2 high-risk alerts · Next starts in 4 hours");

    const noRiskRegion: WeatherRegionGroup = {
      region: "Northern Plains",
      eventCount: 1,
      highRiskCount: 0,
      highestSeverity: "medium",
      nextEventStartsAt: null,
    };
  expect(describeWeatherRegionGroup(noRiskRegion, { now: new Date("2025-05-01T12:00:00Z") })).toBe(
    "1 event · No high-risk alerts · No upcoming events scheduled",
  );
});

  describe("buildWeatherSuggestionIdleStory", () => {
    it("provides quiet-state copy when no weather signals exist", () => {
      const now = new Date("2025-05-01T12:00:00Z");

      const story = buildWeatherSuggestionIdleStory([], { now });

      expect(story.heading).toBe("No weather signals detected");
      expect(story.detail).toContain("hasn't detected active weather risk windows");
      expect(story.caption).toContain("new weather events register on telemetry");
    });

    it("rolls up high-risk coverage and upcoming schedule across regions", () => {
      const events: WeatherRiskEvent[] = [
        {
          id: "alpha",
          title: "Alpha storm",
          description: "Heavy rain arriving",
          severity: "high",
          geo_region: "Gulf Coast",
          starts_at: "2025-05-01T12:30:00Z",
          ends_at: null,
          latitude: 29.95,
          longitude: -90.07,
          weather_type: "rain",
        },
        {
          id: "beta",
          title: "Beta wind",
          description: "Wind advisory",
          severity: "medium",
          geo_region: "Great Plains",
          starts_at: "2025-05-02T08:00:00Z",
          ends_at: null,
          latitude: 35.47,
          longitude: -97.52,
          weather_type: "wind",
        },
      ];

      const regions = groupWeatherEventsByRegion(events);
      const now = new Date("2025-05-01T12:00:00Z");

      const story = buildWeatherSuggestionIdleStory(regions, { now });

      expect(story.heading).toBe("Monitoring weather signals");
      expect(story.detail).toContain("2 weather events");
      expect(story.detail).toContain("2 regions");
      expect(story.detail).toContain("1 high-risk alert");
      expect(story.caption).toContain("Next potential weather window begins in 30 minutes");
    });
  });

  describe("buildWeatherFocusInsights", () => {
    it("summarises focused regions with event counts, scheduling, and risk context", () => {
      const weatherSummary: UpcomingWeather = {
        nextEvent: {
          id: "evt-123",
          title: "Heavy rain cells",
          description: "",
          severity: "high",
          geo_region: "Gulf Coast",
          starts_at: "2025-05-01T14:00:00Z",
          ends_at: null,
          latitude: 29.9,
          longitude: -90.07,
          weather_type: "rain",
        },
        highRiskCount: 2,
      };

      const result = buildWeatherFocusInsights({
        focusedRegion: "Gulf Coast",
        isRegionFiltering: true,
        weatherSummary,
        timelineLength: 3,
        nextEventStart: "2025-05-01T14:00:00Z",
        regionSummary: "3 events · 2 high-risk alerts · Next starts in 4 hours",
        now: new Date("2025-05-01T10:00:00Z"),
      });

      expect(result.calloutText).toBe(
        "Showing 3 weather events for Gulf Coast. Next event begins in 4 hours. 2 high-risk alerts in view.",
      );
      expect(result.regionFocus).toEqual({
        label: "Gulf Coast",
        summary: "3 events · 2 high-risk alerts · Next starts in 4 hours",
      });
    });

    it("indicates when no events match the focused region", () => {
      const summary: UpcomingWeather = {
        nextEvent: null,
        highRiskCount: 0,
      };
      const result = buildWeatherFocusInsights({
        focusedRegion: "Northern Plains",
        isRegionFiltering: true,
        weatherSummary: summary,
        timelineLength: 0,
        nextEventStart: null,
        regionSummary: undefined,
        now: new Date("2025-05-01T10:00:00Z"),
      });

      expect(result.calloutText).toBe("No weather events scheduled for Northern Plains.");
      expect(result.regionFocus).toBeNull();
    });

    it("summarises overall queue when no region is focused", () => {
      const summary: UpcomingWeather = {
        nextEvent: null,
        highRiskCount: 3,
      };
      const result = buildWeatherFocusInsights({
        focusedRegion: null,
        isRegionFiltering: false,
        weatherSummary: summary,
        timelineLength: 0,
        nextEventStart: null,
        regionSummary: undefined,
        now: new Date("2025-05-01T10:00:00Z"),
      });

      expect(result.calloutText).toBe("3 high-risk weather alerts in queue.");
      expect(result.regionFocus).toBeNull();
    });
  });

  describe("allocator helpers", () => {
    const baseSummary: AllocatorSummary = {
      run_id: "demo",
      generated_at: "2025-05-01T12:00:00Z",
      mode: "assist",
      total_spend: 250000,
      total_spend_delta: -33000,
      total_spend_delta_pct: -11.6,
      guardrail_breaches: 1,
      notes: [],
      recommendations: [
        {
          platform: "Email",
          spend_delta: 2000,
          spend_delta_pct: 5,
          spend_after: 30000,
          severity: "info",
          guardrail_count: 0,
          top_guardrail: null,
          notes: null,
        },
        {
          platform: "Meta",
          spend_delta: -15000,
          spend_delta_pct: -12,
          spend_after: 110000,
          severity: "critical",
          guardrail_count: 1,
          top_guardrail: "CPA breach detected",
          notes: null,
        },
        {
          platform: "Google",
          spend_delta: -8000,
          spend_delta_pct: -6,
          spend_after: 140000,
          severity: "warning",
          guardrail_count: 1,
          top_guardrail: "Budget delta exceeds policy",
          notes: null,
        },
      ],
    };

    it("returns muted tone when summary unavailable", () => {
      expect(summarizeAllocatorPressure(null)).toEqual({
        tone: "muted",
        message: "Allocator telemetry unavailable.",
      });
    });

    it("highlights critical guardrail pressure", () => {
      const summary = summarizeAllocatorPressure(baseSummary);
      expect(summary.tone).toBe("critical");
      expect(summary.message).toContain("Meta throttled");
    });

    it("surfaces warning tone when no critical recommendations exist", () => {
      const withoutCritical: AllocatorSummary = {
        ...baseSummary,
        recommendations: baseSummary.recommendations.filter(
          (rec) => rec.severity !== "critical",
        ),
        guardrail_breaches: 0,
      };
      const summary = summarizeAllocatorPressure(withoutCritical);
      expect(summary.tone).toBe("caution");
      expect(summary.message).toContain("Google");
    });

    it("returns top recommendations bounded by provided limit", () => {
      const topTwo = topAllocatorRecommendations(baseSummary, 2);
      expect(topTwo).toHaveLength(2);
      expect(topTwo[0].platform).toBe("Meta");
      expect(topTwo[1].platform).toBe("Google");
    });

    it("returns null diagnostics when allocator summary omits telemetry", () => {
      expect(summarizeAllocatorDiagnostics(baseSummary)).toBeNull();
    });

    it("summarizes optimizer and constraints when diagnostics exist", () => {
      const diagnosticsSummary = summarizeAllocatorDiagnostics({
        ...baseSummary,
        diagnostics: {
          optimizer: "projected_gradient",
          optimizer_winner: "projected_gradient",
          optimizer_candidates: [
            { optimizer: "projected_gradient", profit: 430, success: 1 },
            { optimizer: "coordinate_ascent", profit: 410, success: 0.82 },
          ],
          scenario_profit_p10: 380,
          scenario_profit_p50: 430,
          scenario_profit_p90: 460,
          profit_delta_p50: 30,
          expected_profit_raw: 435,
          profit_delta_expected: 18,
          profit_lift: 25,
          worst_case_profit: 360,
          baseline_profit: 405,
          binding_constraints: {
            binding_min_spend_by_cell: ["Meta", "Google"],
          },
        },
      });

      expect(diagnosticsSummary).not.toBeNull();
      expect(diagnosticsSummary?.optimizerLabel).toBe("Projected gradient");
      expect(diagnosticsSummary?.profitP10).toBe(380);
      expect(diagnosticsSummary?.profitP50Delta).toBe(30);
      expect(diagnosticsSummary?.profitP50DeltaDirection).toBe("positive");
      expect(diagnosticsSummary?.profitP90).toBe(460);
      expect(diagnosticsSummary?.baselineProfit).toBe(405);
      expect(diagnosticsSummary?.expectedProfitDelta).toBe(18);
      expect(diagnosticsSummary?.expectedProfitDeltaDirection).toBe("positive");
      expect(diagnosticsSummary?.profitLiftDirection).toBe("positive");
      expect(diagnosticsSummary?.bindingHighlights).toContain(
        "Per-market minimums affects Meta and Google",
      );
      expect(diagnosticsSummary?.optimizerCandidates).toHaveLength(2);
      expect(diagnosticsSummary?.optimizerCandidates[0]?.isWinner).toBe(true);
      expect(diagnosticsSummary?.optimizerCandidates[0]?.label).toBe(
        "Projected gradient",
      );
      expect(diagnosticsSummary?.optimizerCandidates[1]?.label).toBe(
        "Coordinate ascent",
      );
    });
  });

  describe("weather KPI formatting", () => {
    it("formats currency KPI values with grouping", () => {
      const kpi: WeatherKpi = {
        id: "revenue_at_risk",
        label: "Revenue at risk",
        value: 12500,
        unit: "usd",
        delta_pct: null,
        sparkline: [1, 2, 3],
        description: "Demo description",
      };
      expect(formatWeatherKpiValue(kpi)).toBe("$12,500");
    });

    it("formats percentage KPI values", () => {
      const kpi: WeatherKpi = {
        id: "conversion_lift",
        label: "Conversion lift",
        value: 8.345,
        unit: "pct",
        delta_pct: null,
        sparkline: [1, 2],
        description: "Demo description",
      };
      expect(formatWeatherKpiValue(kpi)).toBe("8.3%");
    });

    it("formats hour-based KPI values", () => {
      const kpi: WeatherKpi = {
        id: "lead_time",
        label: "Lead time",
        value: 4.75,
        unit: "hours",
        delta_pct: null,
        sparkline: [4.75],
        description: "Lead time description",
      };
      expect(formatWeatherKpiValue(kpi)).toBe("4.8h");
    });
  });

  it("resolves passthrough tokens when determining region filter targets", () => {
    expect(resolveRegionFilterTarget(null)).toBeNull();
    expect(resolveRegionFilterTarget("  ")).toBeNull();
    expect(resolveRegionFilterTarget("All Regions")).toBeNull();
    expect(resolveRegionFilterTarget("global")).toBeNull();
    expect(resolveRegionFilterTarget("*")).toBeNull();
    expect(resolveRegionFilterTarget("gulf coast")).toBe("gulf coast");
  });

  it("filters weather events by region label", () => {
    const events: WeatherRiskEvent[] = [
      {
        id: "alpha",
        title: "Alpha storm",
        description: "",
        severity: "high",
        geo_region: "Alpha",
        starts_at: "2025-05-01T14:00:00Z",
        ends_at: null,
        latitude: 40,
        longitude: -100,
        weather_type: "storm",
      },
      {
        id: "beta",
        title: "Beta wind",
        description: "",
        severity: "medium",
        geo_region: "Beta",
        starts_at: "2025-05-02T08:00:00Z",
        ends_at: null,
        latitude: 35,
        longitude: -90,
        weather_type: "wind",
      },
    ];

    expect(filterWeatherEventsByRegion(events, null)).toHaveLength(2);
    expect(filterWeatherEventsByRegion(events, "alpha")).toEqual([events[0]]);
    expect(filterWeatherEventsByRegion(events, "ALPHA")).toEqual([events[0]]);
    expect(filterWeatherEventsByRegion(events, "Beta")).toEqual([events[1]]);
  });

  it("treats broad region tokens as passthrough filters", () => {
    const events: WeatherRiskEvent[] = [
      {
        id: "alpha",
        title: "Alpha storm",
        description: "",
        severity: "high",
        geo_region: "Alpha",
        starts_at: "2025-05-01T14:00:00Z",
        ends_at: null,
        latitude: 40,
        longitude: -100,
        weather_type: "storm",
      },
      {
        id: "beta",
        title: "Beta wind",
        description: "",
        severity: "medium",
        geo_region: "Beta",
        starts_at: "2025-05-02T08:00:00Z",
        ends_at: null,
        latitude: 35,
        longitude: -90,
        weather_type: "wind",
      },
    ];

    expect(filterWeatherEventsByRegion(events, "All regions")).toEqual(events);
    expect(filterWeatherEventsByRegion(events, "ALL")).toEqual(events);
    expect(filterWeatherEventsByRegion(events, " any ")).toEqual(events);
    expect(filterWeatherEventsByRegion(events, "   ")).toEqual(events);
    expect(filterWeatherEventsByRegion(events, " global ")).toEqual(events);
  });

  it("filters weather events when provided a region slug", () => {
    const events: WeatherRiskEvent[] = [
      {
        id: "slugged",
        title: "Gulf coast storm",
        description: "",
        severity: "high",
        geo_region: "Gulf Coast",
        starts_at: "2025-05-01T14:00:00Z",
        ends_at: null,
        latitude: 29.95,
        longitude: -90.07,
        weather_type: "storm",
      },
      {
        id: "other",
        title: "Northern plains wind",
        description: "",
        severity: "medium",
        geo_region: "Northern Plains",
        starts_at: "2025-05-02T08:00:00Z",
        ends_at: null,
        latitude: 35,
        longitude: -90,
        weather_type: "wind",
      },
    ];

    expect(filterWeatherEventsByRegion(events, "gulf-coast")).toEqual([events[0]]);
    expect(filterWeatherEventsByRegion(events, "northern-plains")).toEqual([events[1]]);
  });

  it("filters weather events with unspecified region labels", () => {
    const events: WeatherRiskEvent[] = [
      {
        id: "alpha",
        title: "Alpha storm",
        description: "",
        severity: "medium",
        geo_region: "",
        starts_at: "2025-05-01T14:00:00Z",
        ends_at: null,
        latitude: 40,
        longitude: -100,
        weather_type: "storm",
      },
      {
        id: "beta",
        title: "Beta wind",
        description: "",
        severity: "high",
        geo_region: "Beta",
        starts_at: "2025-05-02T08:00:00Z",
        ends_at: null,
        latitude: 35,
        longitude: -90,
        weather_type: "wind",
      },
    ];

    expect(filterWeatherEventsByRegion(events, "Unspecified region")).toEqual([events[0]]);
  });

  it("filters weather events after normalizing whitespace in region labels", () => {
    const events: WeatherRiskEvent[] = [
      {
        id: "gulf",
        title: "Gulf coast rain",
        description: "",
        severity: "medium",
        geo_region: "Gulf  Coast",
        starts_at: "2025-05-03T12:00:00Z",
        ends_at: null,
        latitude: 29.95,
        longitude: -90.07,
        weather_type: "rain",
      },
    ];

    expect(filterWeatherEventsByRegion(events, "  gulf coast ")).toEqual(events);
  });

  it("maps weather timeline items with normalized labels and slugs", () => {
    const events: WeatherRiskEvent[] = [
      {
        id: "alpha",
        title: "Alpha storm",
        description: "",
        severity: "high",
        geo_region: "  Gulf   Coast ",
        starts_at: "2025-05-01T14:00:00Z",
        ends_at: null,
        latitude: 40,
        longitude: -100,
        weather_type: "storm",
      },
      {
        id: "beta",
        title: "Beta wind",
        description: "",
        severity: "medium",
        geo_region: null,
        starts_at: "2025-05-02T08:00:00Z",
        ends_at: null,
        latitude: 35,
        longitude: -90,
        weather_type: "wind",
      },
    ];

    const items = mapWeatherTimelineItems(events, null);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject<WeatherTimelineItem>({
      regionLabel: "Gulf Coast",
      regionSlug: "gulf-coast",
      isActive: false,
    });
    expect(items[0].event.id).toBe("alpha");
    expect(items[1]).toMatchObject<WeatherTimelineItem>({
      regionLabel: "Unspecified region",
      regionSlug: "unspecified-region",
      isActive: false,
    });
  });

  it("marks timeline items active when the focused region matches ignoring case and whitespace", () => {
    const events: WeatherRiskEvent[] = [
      {
        id: "alpha",
        title: "Alpha storm",
        description: "",
        severity: "high",
        geo_region: "Gulf Coast",
        starts_at: "2025-05-01T14:00:00Z",
        ends_at: null,
        latitude: 40,
        longitude: -100,
        weather_type: "storm",
      },
      {
        id: "beta",
        title: "Beta wind",
        description: "",
        severity: "medium",
        geo_region: "Northern Plains",
        starts_at: "2025-05-02T08:00:00Z",
        ends_at: null,
        latitude: 35,
        longitude: -90,
        weather_type: "wind",
      },
    ];

    const focused = mapWeatherTimelineItems(events, "  gulf   coast ");
    expect(focused[0].isActive).toBe(true);
    expect(focused[1].isActive).toBe(false);

    const cleared = mapWeatherTimelineItems(events, "All regions");
    expect(cleared[0].isActive).toBe(false);
    expect(cleared[1].isActive).toBe(false);
  });

  it("marks timeline items active when the focused region is provided as a slug", () => {
    const events: WeatherRiskEvent[] = [
      {
        id: "slugged",
        title: "Gulf coast storm",
        description: "",
        severity: "high",
        geo_region: "Gulf Coast",
        starts_at: "2025-05-01T14:00:00Z",
        ends_at: null,
        latitude: 29.95,
        longitude: -90.07,
        weather_type: "storm",
      },
      {
        id: "other",
        title: "Northern plains wind",
        description: "",
        severity: "medium",
        geo_region: "Northern Plains",
        starts_at: "2025-05-02T08:00:00Z",
        ends_at: null,
        latitude: 35,
        longitude: -90,
        weather_type: "wind",
      },
    ];

    const items = mapWeatherTimelineItems(events, "gulf-coast");
    expect(items[0].isActive).toBe(true);
    expect(items[1].isActive).toBe(false);
  });

  it("builds guardrail stack data weighted by delta magnitude", () => {
    const segments: GuardrailSegment[] = [
      {
        name: "Budget",
        status: "healthy",
        value: 95,
        target: 90,
        unit: "pct",
        delta_pct: 4,
      },
      {
        name: "ROAS",
        status: "watch",
        value: 2.8,
        target: 3,
        unit: "ratio",
        delta_pct: -6.5,
      },
      {
        name: "CPA",
        status: "breach",
        value: 58,
        target: 50,
        unit: "usd",
        delta_pct: 16,
      },
    ];

    const stack = stackGuardrails(segments);
    const totalFraction = stack.reduce((sum, item) => sum + item.fraction, 0);

    expect(stack).toHaveLength(3);
    expect(totalFraction).toBeCloseTo(1, 5);
    expect(stack.find((item) => item.name === "CPA")?.fraction ?? 0).toBeGreaterThan(
      stack.find((item) => item.name === "Budget")?.fraction ?? 0,
    );
    expect(stack.find((item) => item.name === "ROAS")?.fraction ?? 0).toBeGreaterThan(0);
  });

  describe("selectWeatherFocusSuggestion", () => {
    const now = new Date("2025-05-01T12:00:00Z");

    it("returns null when no regions are provided", () => {
      expect(selectWeatherFocusSuggestion([], { now })).toBeNull();
    });

    it("prioritises high-severity regions with imminent events", () => {
      const regions: WeatherRegionGroup[] = [
        {
          region: "Northern Plains",
          eventCount: 2,
          highRiskCount: 1,
          highestSeverity: "medium",
          nextEventStartsAt: "2025-05-01T22:00:00Z",
        },
        {
          region: "Gulf Coast",
          eventCount: 3,
          highRiskCount: 2,
          highestSeverity: "high",
          nextEventStartsAt: "2025-05-01T14:00:00Z",
        },
      ];

      const suggestion = selectWeatherFocusSuggestion(regions, { now });

      expect(suggestion?.region).toBe("Gulf Coast");
      expect(suggestion?.severity).toBe("high");
      expect(suggestion?.summary).toContain("3 events");
      expect(suggestion?.reason).toContain("High-risk conditions detected.");
      expect(suggestion?.reason).toContain("Next event in 2 hours");
    });

    it("falls back to the most urgent named region when unspecified is present", () => {
      const regions: WeatherRegionGroup[] = [
        {
          region: "Unspecified region",
          eventCount: 3,
          highRiskCount: 0,
          highestSeverity: "medium",
          nextEventStartsAt: "2025-05-01T13:00:00Z",
        },
        {
          region: "Great Lakes",
          eventCount: 1,
          highRiskCount: 0,
          highestSeverity: "medium",
          nextEventStartsAt: "2025-05-01T15:00:00Z",
        },
      ];

      const suggestion = selectWeatherFocusSuggestion(regions, { now });

      expect(suggestion?.region).toBe("Great Lakes");
      expect(suggestion?.reason).toContain("Next event in 3 hours");
    });

    it("prefers regions with earlier events when severity scores tie", () => {
      const regions: WeatherRegionGroup[] = [
        {
          region: "Pacific Northwest",
          eventCount: 2,
          highRiskCount: 1,
          highestSeverity: "medium",
          nextEventStartsAt: "2025-05-01T17:00:00Z",
        },
        {
          region: "Mid-Atlantic",
          eventCount: 2,
          highRiskCount: 1,
          highestSeverity: "medium",
          nextEventStartsAt: "2025-05-01T14:30:00Z",
        },
      ];

      const suggestion = selectWeatherFocusSuggestion(regions, { now });

      expect(suggestion?.region).toBe("Mid-Atlantic");
    });
  });

  describe("buildSuggestionMetadata", () => {
    const suggestion: WeatherFocusSuggestion = {
      region: "Gulf Coast",
      summary: "3 events · 2 high-risk alerts · Next starts in 2 hours",
      severity: "high",
      highRiskCount: 2,
      eventCount: 3,
      nextEventStartsAt: "2025-05-01T14:00:00Z",
      reason: "High-risk conditions detected. Next event in 2 hours. 2 high-risk alerts in queue.",
    };

    it("builds an enriched metadata envelope with guardrail and alert context", () => {
      const metadata = buildSuggestionMetadata({
        suggestion,
        viewportBreakpoint: "desktop",
        isRegionFiltering: false,
        regionSummaries: {
          "Gulf Coast": "3 events · 2 high-risk alerts · Next starts in 2 hours",
        },
        isDemoMode: false,
        guardrailStatus: "watch",
        criticalAlertCount: 3,
      });

      expect(metadata).toEqual({
        layoutVariant: "dense",
        ctaShown: true,
        regionSlug: "gulf-coast",
        signature: buildSuggestionSignature(suggestion),
        suggestionSummary: suggestion.summary,
        regionSummary: "3 events · 2 high-risk alerts · Next starts in 2 hours",
        tenantMode: "live",
        guardrailStatus: "watch",
        criticalAlertCount: 3,
      });
    });

    it("keeps CTA exposure sticky across subsequent emissions for the same signature", () => {
      const first = buildSuggestionMetadata({
        suggestion,
        viewportBreakpoint: "desktop",
        isRegionFiltering: false,
        regionSummaries: {
          "Gulf Coast": "3 events · 2 high-risk alerts · Next starts in 2 hours",
        },
        isDemoMode: false,
        guardrailStatus: "watch",
        criticalAlertCount: 1,
      });

      const followUp = buildSuggestionMetadata({
        suggestion,
        viewportBreakpoint: "desktop",
        isRegionFiltering: true,
        regionSummaries: {
          "Gulf Coast": "3 events · 2 high-risk alerts · Next starts in 2 hours",
        },
        isDemoMode: false,
        guardrailStatus: "watch",
        criticalAlertCount: 1,
        previousMetadata: first,
      });

      expect(first.ctaShown).toBe(true);
      expect(followUp.ctaShown).toBe(true);
    });

    it("falls back to the suggestion summary when no region synopsis exists", () => {
      const metadata = buildSuggestionMetadata({
        suggestion,
        viewportBreakpoint: "mobile",
        isRegionFiltering: false,
        regionSummaries: {},
        isDemoMode: true,
        guardrailStatus: "breach",
        criticalAlertCount: 0,
      });

      expect(metadata.layoutVariant).toBe("stacked");
      expect(metadata.regionSummary).toBe(suggestion.summary);
      expect(metadata.tenantMode).toBe("demo");
    });
  });

  describe("buildSuggestionTelemetryOverview", () => {
    it("summarises totals and preserves provided confidence metadata", () => {
      const summary: SuggestionTelemetrySummary = {
        total_suggestions: 6,
        total_view_count: 420,
        total_focus_count: 128,
        total_dismiss_count: 32,
        average_focus_rate: 0.31,
        average_dismiss_rate: 0.09,
        average_engagement_rate: 0.4,
        top_signature: "Gulf Coast|High-risk weather events incoming.|2025-05-01T14:00:00Z|2|3",
        top_region: "Gulf Coast",
        top_focus_rate: 0.45,
        top_dismiss_rate: 0.15,
        top_engagement_rate: 0.6,
        top_focus_count: 45,
        top_dismiss_count: 15,
        top_view_count: 120,
        top_event_count: 5,
        top_high_risk_count: 2,
        top_has_scheduled_start: true,
        top_guardrail_status: "watch",
        top_layout_variant: "dense",
        top_last_occurred_at: "2025-05-01T15:00:00Z",
        top_engagement_confidence_level: "medium",
        top_engagement_confidence_label: "Directional signal · 120 views",
      };

      const overview = buildSuggestionTelemetryOverview(summary);

      expect(overview).not.toBeNull();
      expect(overview?.hasSignals).toBe(true);
      expect(overview?.totalSuggestions).toBe(6);
      expect(overview?.totalViewCount).toBe(420);
      expect(overview?.totalInteractions).toBe(160);
      expect(overview?.averageEngagementRate).toBeCloseTo(0.4, 5);
      expect(overview?.topConfidenceLevel).toBe("medium");
      expect(overview?.topConfidenceLabel).toBe("Directional signal · 120 views");
      expect(overview?.topGuardrailStatus).toBe("watch");
      expect(overview?.topLayoutVariant).toBe("dense");
      expect(overview?.topHighRiskSeverity).toBe("elevated");
      expect(overview?.topSummary).toBeNull();
      expect(overview?.topReason).toBeNull();
    });

    it("computes fallback confidence metadata when summary omits labels", () => {
      const summary: SuggestionTelemetrySummary = {
        total_suggestions: 2,
        total_view_count: 0,
        total_focus_count: 3,
        total_dismiss_count: 1,
        average_focus_rate: 0,
        average_dismiss_rate: 0,
        average_engagement_rate: 0,
        top_focus_count: 3,
        top_dismiss_count: 1,
        top_view_count: 0,
        top_engagement_confidence_level: null,
        top_engagement_confidence_label: null,
      };

      const overview = buildSuggestionTelemetryOverview(summary);

      expect(overview).not.toBeNull();
      expect(overview?.hasSignals).toBe(true);
      expect(overview?.totalInteractions).toBe(4);
      expect(overview?.topConfidenceLevel).toBe("low");
      expect(overview?.topConfidenceLabel).toBe("Low sample · 4 interactions");
      expect(overview?.topGuardrailStatus).toBeNull();
      expect(overview?.topLayoutVariant).toBeNull();
      expect(overview?.topHighRiskSeverity).toBeNull();
      expect(overview?.topSummary).toBeNull();
      expect(overview?.topReason).toBeNull();
    });

    it("returns null when summary reports no active signals or confidence metadata", () => {
      const summary: SuggestionTelemetrySummary = {
        total_suggestions: 0,
        total_view_count: 0,
        total_focus_count: 0,
        total_dismiss_count: 0,
        average_focus_rate: 0,
        average_dismiss_rate: 0,
        average_engagement_rate: 0,
        top_focus_rate: null,
        top_dismiss_rate: null,
        top_engagement_rate: null,
        top_focus_count: null,
        top_dismiss_count: null,
        top_view_count: null,
        top_engagement_confidence_level: null,
        top_engagement_confidence_label: null,
      };

      const overview = buildSuggestionTelemetryOverview(summary);

      expect(overview).toBeNull();
    });

    it("surfaces high-risk badge metadata for the top signal overview", () => {
      const records: SuggestionTelemetry[] = [
        {
          signature: "Coastal Ridge|High surf alerts.|2025-05-01T10:00:00Z|2|4",
          region: "Coastal Ridge",
          reason: "High surf alerts.",
          view_count: 48,
          focus_count: 18,
          dismiss_count: 6,
          high_risk_count: 4,
          event_count: 2,
          focus_rate: 18 / 48,
          dismiss_rate: 6 / 48,
          engagement_rate: (18 + 6) / 48,
          has_scheduled_start: false,
          next_event_starts_at: null,
          first_occurred_at: "2025-05-01T08:00:00Z",
          last_occurred_at: "2025-05-01T09:30:00Z",
          tenants: ["demo-tenant"],
          severities: ["high"],
          viewport_breakpoints: ["desktop"],
          metadata: {
            guardrailStatus: "watch",
            tenantMode: "live",
            layoutVariant: "dense",
            suggestionSummary: "Storm surge · Prepare rerouting.",
            regionSummary: "2 events · 4 high-risk alerts · Monitoring surf rise",
            ctaShown: true,
          },
        },
      ];

      const overview = buildSuggestionTelemetryOverview(null, records);

      expect(overview).not.toBeNull();
      expect(overview?.topHighRiskSeverity).toBe("critical");
      expect(overview?.topHighRiskCount).toBe(4);
      expect(overview?.topSummary).toBe(
        "2 events · 4 high-risk alerts · Monitoring surf rise",
      );
      expect(overview?.topReason).toBe("High surf alerts.");

      const descriptor = buildHighRiskAlertDescriptor(
        overview?.topHighRiskSeverity ?? "none",
        overview?.topHighRiskCount ?? 0,
      );

      expect(descriptor.hasBadge).toBe(true);
      expect(descriptor.badgeLabel).toBe("Critical risk");
      expect(descriptor.safeCount).toBe(4);
      expect(descriptor.severity).toBe("critical");
    });
  });

  describe("describeHighRiskAlerts", () => {
    it("emits badge detail and count label for critical alerts", () => {
      const description = describeHighRiskAlerts("critical", 4);
      expect(description.badge).toBe("Critical risk");
      expect(description.detail).toBe("Critical risk · 4 alerts");
      expect(description.count).toBe(4);
      expect(description.countLabel).toBe("4 high-risk alerts");
    });

    it("surfaces count-based detail when severity metadata is unavailable", () => {
      const description = describeHighRiskAlerts(null, 3);
      expect(description.badge).toBeNull();
      expect(description.detail).toBe("3 high-risk alerts logged");
      expect(description.count).toBe(3);
      expect(description.countLabel).toBe("3 high-risk alerts");
    });

    it("handles zero counts without emitting high-risk copy", () => {
      const description = describeHighRiskAlerts("none", 0);
      expect(description.badge).toBeNull();
      expect(description.detail).toBe("No high-risk alerts logged");
      expect(description.count).toBe(0);
      expect(description.countLabel).toBeNull();
    });
  });

  describe("summarizeSuggestionTelemetry", () => {
    const baseTelemetry: SuggestionTelemetry = {
      signature: "Gulf Coast|High-risk weather events incoming.|2025-05-01T14:00:00Z|2|3",
      region: "Gulf Coast",
      reason: "High-risk weather events incoming.",
      view_count: 54,
      focus_count: 19,
      dismiss_count: 6,
      high_risk_count: 2,
      event_count: 3,
      focus_rate: 19 / 54,
      dismiss_rate: 6 / 54,
      engagement_rate: (19 + 6) / 54,
      has_scheduled_start: true,
      next_event_starts_at: "2025-05-01T14:00:00Z",
      first_occurred_at: "2025-05-01T12:00:00Z",
      last_occurred_at: "2025-05-01T15:00:00Z",
      tenants: ["demo-tenant"],
      severities: ["high"],
      viewport_breakpoints: ["desktop", "tablet"],
      metadata: {
        layoutVariant: "dense",
        ctaShown: true,
        regionSlug: "gulf-coast",
        suggestionSummary: "3 events · 2 high-risk alerts · Next starts in 2 hours",
        regionSummary: "3 events · 2 high-risk alerts · Next starts in 2 hours",
        tenantMode: "live",
        guardrailStatus: "watch",
        criticalAlertCount: 4,
      },
    };

    it("derives enriched summary data when metadata is available", () => {
    const summaries = summarizeSuggestionTelemetry([baseTelemetry]);

    expect(summaries).toHaveLength(1);
    const summary = summaries[0];
    expect(summary.region).toBe("Gulf Coast");
      expect(summary.summary).toBe("3 events · 2 high-risk alerts · Next starts in 2 hours");
      expect(summary.guardrailStatus).toBe("watch");
      expect(summary.tenantMode).toBe("live");
      expect(summary.layoutVariant).toBe("dense");
      expect(summary.ctaShown).toBe(true);
      expect(summary.viewCount).toBe(54);
    expect(summary.focusCount).toBe(19);
    expect(summary.highRiskSeverity).toBe("elevated");
    expect(summary.nextEventStartsAt).toBe("2025-05-01T14:00:00Z");
    expect(summary.focusRate).toBeCloseTo(19 / 54, 5);
    expect(summary.dismissRate).toBeCloseTo(6 / 54, 5);
    expect(summary.engagementRate).toBeCloseTo((19 + 6) / 54, 5);
    expect(summary.engagementConfidenceLevel).toBe("high");
    expect(summary.engagementConfidenceLabel).toBe("High confidence · 54 views");
    expect(summary.tenantCount).toBe(1);
    expect(summary.tenantNames).toEqual(["demo-tenant"]);
    });

    it("sorts summaries by recency and applies the requested limit", () => {
      const newerTelemetry: SuggestionTelemetry = {
        ...baseTelemetry,
        signature: "Pacific Northwest|Monitoring heavy rain bands.|2025-05-01T18:00:00Z|1|1",
        region: "Pacific Northwest",
        reason: "Monitoring heavy rain bands.",
        view_count: 12,
        focus_count: 5,
        dismiss_count: 2,
        high_risk_count: 4,
        focus_rate: 5 / 12,
        dismiss_rate: 2 / 12,
        engagement_rate: (5 + 2) / 12,
        last_occurred_at: "2025-05-01T16:00:00Z",
        metadata: {
          layoutVariant: "dense",
          ctaShown: true,
          regionSummary: "Rain bands approaching; prep reallocation.",
          tenantMode: "demo",
          guardrailStatus: "healthy",
        },
      };

    const summaries = summarizeSuggestionTelemetry([baseTelemetry, newerTelemetry], { limit: 1 });

    expect(summaries).toHaveLength(1);
    expect(summaries[0].region).toBe("Pacific Northwest");
    expect(summaries[0].guardrailStatus).toBe("healthy");
    expect(summaries[0].highRiskSeverity).toBe("critical");
    expect(summaries[0].engagementConfidenceLevel).toBe("medium");
    expect(summaries[0].engagementConfidenceLabel).toBe("Directional signal · 12 views");
    expect(summaries[0].tenantCount).toBe(1);
    });

    it("falls back to reason copy when metadata is empty", () => {
      const sparseTelemetry: SuggestionTelemetry = {
        ...baseTelemetry,
        region: "   Mountain West   ",
        metadata: {},
        reason: "Storm window quiet across Mountain West.",
        last_occurred_at: null,
        view_count: 0,
        focus_count: 0,
        dismiss_count: 0,
        high_risk_count: 0,
        focus_rate: 0,
        dismiss_rate: 0,
        engagement_rate: 0,
      };

      const summaries = summarizeSuggestionTelemetry([sparseTelemetry]);

      expect(summaries).toHaveLength(1);
      const summary = summaries[0];
      expect(summary.region).toBe("Mountain West");
    expect(summary.summary).toBe("Storm window quiet across Mountain West.");
    expect(summary.guardrailStatus).toBe("unknown");
    expect(summary.ctaShown).toBe(false);
    expect(summary.highRiskSeverity).toBe("none");
    expect(summary.lastOccurredAt).toBeNull();
    expect(summary.focusRate).toBe(0);
    expect(summary.dismissRate).toBe(0);
    expect(summary.engagementRate).toBe(0);
    expect(summary.tenantCount).toBe(1);
    expect(summary.engagementConfidenceLevel).toBe("low");
    expect(summary.engagementConfidenceLabel).toBe("No direct views yet");
    });

    it("guards against division by zero when impressions are absent", () => {
      const zeroViews: SuggestionTelemetry = {
        ...baseTelemetry,
        view_count: 0,
        focus_count: 3,
        dismiss_count: 1,
        focus_rate: 0,
        dismiss_rate: 0,
        engagement_rate: 0,
      };

      const [summary] = summarizeSuggestionTelemetry([zeroViews]);

    expect(summary.focusRate).toBe(0);
    expect(summary.dismissRate).toBe(0);
    expect(summary.engagementRate).toBe(0);
    expect(summary.viewCount).toBe(0);
    expect(summary.focusCount).toBe(3);
    expect(summary.dismissCount).toBe(1);
    expect(summary.highRiskSeverity).toBe("elevated");
    expect(summary.engagementConfidenceLevel).toBe("low");
    expect(summary.engagementConfidenceLabel).toBe("Low sample · 4 interactions");
    });

    it("honours precomputed rate fields when tenant filtering removes raw counts", () => {
      const filteredTelemetry: SuggestionTelemetry = {
        ...baseTelemetry,
        view_count: 0,
        focus_count: 0,
        dismiss_count: 0,
        focus_rate: 0.42,
        dismiss_rate: 0.18,
        engagement_rate: 0.6,
      };

      const [summary] = summarizeSuggestionTelemetry([filteredTelemetry]);

    expect(summary.viewCount).toBe(0);
    expect(summary.focusCount).toBe(0);
    expect(summary.dismissCount).toBe(0);
    expect(summary.focusRate).toBeCloseTo(0.42, 5);
    expect(summary.dismissRate).toBeCloseTo(0.18, 5);
    expect(summary.engagementRate).toBeCloseTo(0.6, 5);
    expect(summary.highRiskSeverity).toBe("elevated");
    expect(summary.engagementConfidenceLevel).toBe("low");
    expect(summary.engagementConfidenceLabel).toBe("No direct views yet");
  });
});

  describe("dashboard suggestion analytics events", () => {
    const suggestion: WeatherFocusSuggestion = {
      region: "Gulf Coast",
      summary: "3 events · 2 high-risk alerts · Next starts in 2 hours",
      severity: "high",
      highRiskCount: 2,
      eventCount: 3,
      nextEventStartsAt: "2025-05-01T14:00:00Z",
      reason: "High-risk conditions detected. Next event in 2 hours. 2 high-risk alerts in queue.",
    };

    const baseMetadata = () => ({
      layoutVariant: "dense" as const,
      ctaShown: true,
      regionSlug: "gulf-coast",
      signature: buildSuggestionSignature(suggestion),
      suggestionSummary: suggestion.summary,
      regionSummary: suggestion.summary,
      tenantMode: "live" as const,
      guardrailStatus: "watch" as const,
      criticalAlertCount: 1,
    });

    const buildExpectedMetadata = (
      overrides: Partial<ReturnType<typeof baseMetadata>> = {},
    ) => ({
      ...baseMetadata(),
      ...overrides,
    });

    it("builds a suggestion view analytics payload with scheduling metadata", () => {
      const metadata = buildExpectedMetadata();
      const event = buildSuggestionViewEvent(suggestion, { metadata });

      expect(event.event).toBe("dashboard.weather_focus.suggestion.view");
      expect(event.payload).toEqual({
        region: suggestion.region,
        severity: "high",
        highRiskCount: 2,
        eventCount: 3,
        nextEventStartsAt: suggestion.nextEventStartsAt,
        hasScheduledStart: true,
        reason: suggestion.reason,
        viewportBreakpoint: "unknown",
        metadata,
      });
    });

    it("builds a suggestion focus analytics payload with the same structure", () => {
      const metadata = buildExpectedMetadata({ ctaShown: true });
      const event = buildSuggestionFocusEvent(suggestion, { metadata });

      expect(event.event).toBe("dashboard.weather_focus.suggestion.focus");
      expect(event.payload).toEqual({
        region: suggestion.region,
        severity: "high",
        highRiskCount: 2,
        eventCount: 3,
        nextEventStartsAt: suggestion.nextEventStartsAt,
        hasScheduledStart: true,
        reason: suggestion.reason,
        viewportBreakpoint: "unknown",
        metadata,
      });
    });

    it("preserves enriched metadata envelope fields for downstream analytics", () => {
      const metadata = {
        layoutVariant: "dense" as const,
        ctaShown: true,
        regionSlug: "gulf-coast",
        signature: buildSuggestionSignature(suggestion),
        suggestionSummary: suggestion.summary,
        regionSummary: suggestion.summary,
        tenantMode: "demo" as const,
        guardrailStatus: "breach" as const,
        criticalAlertCount: 4,
      };

      const event = buildSuggestionFocusEvent(suggestion, { metadata });

      expect(event.payload.metadata).toEqual(metadata);
    });

    it("builds a suggestion dismiss analytics payload with scheduling metadata", () => {
      const metadata = buildExpectedMetadata({ ctaShown: false });
      const event = buildSuggestionDismissEvent(suggestion, { metadata });

      expect(event.event).toBe("dashboard.weather_focus.suggestion.dismiss");
      expect(event.payload).toEqual({
        region: suggestion.region,
        severity: "high",
        highRiskCount: 2,
        eventCount: 3,
        nextEventStartsAt: suggestion.nextEventStartsAt,
        hasScheduledStart: true,
        reason: suggestion.reason,
        viewportBreakpoint: "unknown",
        metadata,
      });
    });

    it("defaults metadata when none provided", () => {
      const event = buildSuggestionViewEvent(suggestion);

      expect(event.payload.metadata).toEqual({
        layoutVariant: "dense",
        ctaShown: false,
        regionSlug: "gulf-coast",
        signature: buildSuggestionSignature(suggestion),
        suggestionSummary: suggestion.summary,
        regionSummary: suggestion.summary,
      });
    });

    it("produces stable deduplication signatures for identical suggestions", () => {
      const signature = buildSuggestionSignature(suggestion);
      const duplicateSignature = buildSuggestionSignature({ ...suggestion });

      expect(signature).toBe(duplicateSignature);
    });

    it("produces distinct signatures when suggestion metadata changes", () => {
      const signature = buildSuggestionSignature(suggestion);
      const alteredSignature = buildSuggestionSignature({
        ...suggestion,
        reason: "New risk factors detected.",
      });

      expect(signature).not.toBe(alteredSignature);
    });

    it("normalises schedule metadata in deduplication signatures", () => {
      const signature = buildSuggestionSignature({
        ...suggestion,
        nextEventStartsAt: " 2025-05-01T14:00:00Z ",
      });

      expect(signature).toContain("2025-05-01T14:00:00Z");
      expect(signature).not.toContain(" 2025-05-01T14:00:00Z ");
    });

    it("falls back to unknown severity when the suggestion omits severity data", () => {
      const mutedSuggestion: WeatherFocusSuggestion = {
        ...suggestion,
        severity: null,
      };

      const event = buildSuggestionViewEvent(mutedSuggestion);
      expect(event.payload.severity).toBe("unknown");
    });

    it("omits schedule metadata when the suggestion lacks a next event start time", () => {
      const noScheduleSuggestion: WeatherFocusSuggestion = {
        ...suggestion,
        nextEventStartsAt: null,
      };

      const event = buildSuggestionViewEvent(noScheduleSuggestion);
      expect(event.payload.nextEventStartsAt).toBeNull();
      expect(event.payload.hasScheduledStart).toBe(false);
    });

    it("omits schedule metadata when the suggestion provides an invalid timestamp", () => {
      const malformedSuggestion: WeatherFocusSuggestion = {
        ...suggestion,
        nextEventStartsAt: "  not-a-real-timestamp  ",
      };

      const event = buildSuggestionViewEvent(malformedSuggestion);
      expect(event.payload.nextEventStartsAt).toBeNull();
      expect(event.payload.hasScheduledStart).toBe(false);
    });

    it("normalises schedule metadata by trimming whitespace before emission", () => {
      const paddedSuggestion: WeatherFocusSuggestion = {
        ...suggestion,
        nextEventStartsAt: " 2025-05-01T14:00:00Z ",
      };

      const event = buildSuggestionViewEvent(paddedSuggestion);
      expect(event.payload.nextEventStartsAt).toBe("2025-05-01T14:00:00Z");
      expect(event.payload.hasScheduledStart).toBe(true);
    });

    it("uses the provided viewport breakpoint when emitting payloads", () => {
      const event = buildSuggestionViewEvent(suggestion, {
        viewportBreakpoint: "tablet",
      });

      expect(event.payload.viewportBreakpoint).toBe("tablet");
    });

    it("normalises unexpected viewport values to unknown", () => {
      const event = buildSuggestionFocusEvent(suggestion, {
        viewportBreakpoint: "giant" as unknown as "mobile",
      });

      expect(event.payload.viewportBreakpoint).toBe("unknown");
    });

    it("annotates analytics payloads with the responsive breakpoint for narrow viewports", () => {
      const mobileBreakpoint = resolveViewportBreakpoint(480);
      const event = buildSuggestionViewEvent(suggestion, {
        viewportBreakpoint: mobileBreakpoint,
      });

      expect(event.payload.viewportBreakpoint).toBe("mobile");
    });

    it("records tablet analytics metadata exactly at the tablet breakpoint floor", () => {
      const tabletBreakpoint = resolveViewportBreakpoint(640);
      const event = buildSuggestionViewEvent(suggestion, {
        viewportBreakpoint: tabletBreakpoint,
      });

      expect(event.payload.viewportBreakpoint).toBe("tablet");
    });

    it("captures desktop breakpoint context when the viewport meets the large-screen threshold", () => {
      const desktopBreakpoint = resolveViewportBreakpoint(1024);
      const event = buildSuggestionFocusEvent(suggestion, {
        viewportBreakpoint: desktopBreakpoint,
      });

      expect(event.payload.viewportBreakpoint).toBe("desktop");
    });
  });

  describe("resolveViewportBreakpoint", () => {
    it("classifies narrow widths as mobile", () => {
      expect(resolveViewportBreakpoint(375)).toBe("mobile");
    });

    it("classifies mid-sized widths as tablet", () => {
      expect(resolveViewportBreakpoint(800)).toBe("tablet");
    });

    it("classifies wide widths as desktop", () => {
      expect(resolveViewportBreakpoint(1366)).toBe("desktop");
    });

    it("returns unknown for invalid inputs", () => {
      expect(resolveViewportBreakpoint(null)).toBe("unknown");
      expect(resolveViewportBreakpoint(-50)).toBe("unknown");
      expect(resolveViewportBreakpoint(NaN)).toBe("unknown");
    });

    it("treats breakpoint boundaries consistently for responsive QA", () => {
      expect(resolveViewportBreakpoint(639)).toBe("mobile");
      expect(resolveViewportBreakpoint(640)).toBe("tablet");
      expect(resolveViewportBreakpoint(1023)).toBe("tablet");
      expect(resolveViewportBreakpoint(1024)).toBe("desktop");
    });
  });
});
