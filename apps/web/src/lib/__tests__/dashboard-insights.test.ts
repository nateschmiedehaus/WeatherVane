import { describe, expect, it } from "vitest";

import {
  buildSuggestionTelemetryOverview,
  buildSuggestionTelemetryCsv,
  summarizeSuggestionTelemetry,
  buildHighRiskAlertDescriptor,
  weatherRegionSlug,
  summarizeAllocatorDiagnostics,
  topAllocatorRecommendations,
  buildDataCoverageInsight,
  type SuggestionTelemetry,
} from "../dashboard-insights";
import type { AllocatorSummary } from "../../types/dashboard";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function buildTelemetry(
  overrides: Partial<SuggestionTelemetry>,
): SuggestionTelemetry {
  return {
    signature: "Region A|Storm incoming|2025-05-01T12:00:00Z|2|1",
    region: "Region A",
    reason: "Storm incoming",
    view_count: 10,
    focus_count: 4,
    dismiss_count: 2,
    high_risk_count: 1,
    event_count: 1,
    focus_rate: 0.4,
    dismiss_rate: 0.2,
    engagement_rate: 0.6,
    has_scheduled_start: true,
    next_event_starts_at: "2025-05-01T12:00:00Z",
    first_occurred_at: "2025-05-01T10:00:00Z",
    last_occurred_at: "2025-05-01T11:00:00Z",
    tenants: ["demo-tenant"],
    severities: ["high"],
    viewport_breakpoints: ["desktop"],
    metadata: {
      guardrailStatus: "watch",
      tenantMode: "live",
      layoutVariant: "dense",
      regionSummary: "Storm incoming · 2 high-risk alerts",
      suggestionSummary: "Storm incoming",
      ctaShown: true,
    },
    ...overrides,
  };
}

describe("buildSuggestionTelemetryOverview", () => {
  it("backfills overview metrics when the API summary is absent", () => {
    const records: SuggestionTelemetry[] = [
      buildTelemetry({
        view_count: 20,
        focus_count: 5,
        dismiss_count: 3,
        focus_rate: 0.25,
        dismiss_rate: 0.15,
        engagement_rate: 0.4,
        metadata: {
          guardrailStatus: "watch",
          tenantMode: "live",
          layoutVariant: "dense",
          regionSummary: "Storm incoming · 2 high-risk alerts",
          suggestionSummary: "Storm incoming",
          ctaShown: true,
        },
      }),
      buildTelemetry({
        signature: "Region B|Sky clearing|2025-05-01T16:00:00Z|1|0",
        region: "Region B",
        reason: "Sky clearing",
        view_count: 10,
        focus_count: 2,
        dismiss_count: 1,
        focus_rate: 0.2,
        dismiss_rate: 0.1,
        engagement_rate: 0.3,
        metadata: {
          guardrailStatus: "breach",
          tenantMode: "live",
          layoutVariant: "stacked",
          regionSummary: "Sky clearing · guardrail breach",
          suggestionSummary: "Sky clearing",
          ctaShown: false,
        },
      }),
    ];

    const overview = buildSuggestionTelemetryOverview(null, records);

    expect(overview).not.toBeNull();
    expect(overview?.totalSuggestions).toBe(2);
    expect(overview?.totalViewCount).toBe(30);
    expect(overview?.totalInteractions).toBe(11);
    expect(overview?.averageFocusRate).toBeCloseTo(7 / 30, 5);
    expect(overview?.averageDismissRate).toBeCloseTo(4 / 30, 5);
    expect(overview?.averageEngagementRate).toBeCloseTo(11 / 30, 5);
    expect(overview?.topRegion).toBe("Region A");
    expect(overview?.topSummary).toBe("Storm incoming · 2 high-risk alerts");
    expect(overview?.topReason).toBe("Storm incoming");
    expect(overview?.topFocusRate).toBeCloseTo(0.25, 5);
    expect(overview?.topDismissRate).toBeCloseTo(0.15, 5);
    expect(overview?.topEngagementRate).toBeCloseTo(0.4, 5);
    expect(overview?.topHasScheduledStart).toBe(true);
    expect(overview?.topGuardrailStatus).toBe("watch");
    expect(overview?.topLayoutVariant).toBe("dense");
    expect(overview?.topViewCount).toBe(20);
    expect(overview?.topFocusCount).toBe(5);
    expect(overview?.topDismissCount).toBe(3);
    expect(overview?.topHighRiskCount).toBe(1);
    expect(overview?.topHighRiskSeverity).toBe("elevated");
    expect(overview?.topEventCount).toBe(1);
    expect(overview?.topConfidenceLevel).toBe("medium");
    expect(overview?.topConfidenceLabel).toContain("20 views");
    expect(overview?.hasSignals).toBe(true);
  });

  it("promotes average rate fields directly from the API summary", () => {
    const overview = buildSuggestionTelemetryOverview({
      total_suggestions: 2,
      total_view_count: 30,
      total_focus_count: 9,
      total_dismiss_count: 6,
      average_focus_rate: 0.31,
      average_dismiss_rate: 0.22,
      average_engagement_rate: 0.53,
      top_signature: "Region A|Storm incoming|2025-05-01T12:00:00Z|2|1",
      top_region: "Region A",
      top_focus_rate: 0.4,
      top_dismiss_rate: 0.2,
      top_engagement_rate: 0.6,
      top_focus_count: 4,
      top_dismiss_count: 2,
      top_view_count: 10,
      top_event_count: 1,
      top_high_risk_count: 1,
      top_has_scheduled_start: true,
      top_guardrail_status: "watch",
      top_layout_variant: "dense",
      top_last_occurred_at: "2025-05-01T11:00:00Z",
      top_engagement_confidence_level: "medium",
      top_engagement_confidence_label: "Directional signal · 30 views",
    });

    expect(overview).not.toBeNull();
    expect(overview?.averageFocusRate).toBe(0.31);
    expect(overview?.averageDismissRate).toBe(0.22);
    expect(overview?.averageEngagementRate).toBe(0.53);
    expect(overview?.topRegion).toBe("Region A");
    expect(overview?.topFocusRate).toBe(0.4);
    expect(overview?.topDismissRate).toBe(0.2);
    expect(overview?.topEngagementRate).toBe(0.6);
    expect(overview?.topHasScheduledStart).toBe(true);
    expect(overview?.topGuardrailStatus).toBe("watch");
    expect(overview?.topLayoutVariant).toBe("dense");
    expect(overview?.topViewCount).toBe(10);
    expect(overview?.topFocusCount).toBe(4);
    expect(overview?.topDismissCount).toBe(2);
    expect(overview?.topHighRiskCount).toBe(1);
    expect(overview?.topHighRiskSeverity).toBe("elevated");
    expect(overview?.topEventCount).toBe(1);
  });

  it("derives average rate fields from totals when the API omits them", () => {
    const overview = buildSuggestionTelemetryOverview({
      total_suggestions: 1,
      total_view_count: 20,
      total_focus_count: 5,
      total_dismiss_count: 3,
      average_focus_rate: undefined,
      average_dismiss_rate: undefined,
      average_engagement_rate: undefined,
      top_signature: "Region A|Storm incoming|2025-05-01T12:00:00Z|2|1",
      top_region: "Region A",
      top_focus_rate: 0.4,
      top_dismiss_rate: 0.2,
      top_engagement_rate: 0.6,
      top_focus_count: 5,
      top_dismiss_count: 3,
      top_view_count: 20,
      top_event_count: 1,
      top_high_risk_count: 1,
      top_has_scheduled_start: true,
      top_guardrail_status: "watch",
      top_layout_variant: "dense",
      top_last_occurred_at: "2025-05-01T11:00:00Z",
      top_engagement_confidence_level: null,
      top_engagement_confidence_label: "",
    } as any);

    expect(overview).not.toBeNull();
    expect(overview?.averageFocusRate).toBeCloseTo(0.25, 5);
    expect(overview?.averageDismissRate).toBeCloseTo(0.15, 5);
    expect(overview?.averageEngagementRate).toBeCloseTo(0.4, 5);
    expect(overview?.topRegion).toBe("Region A");
    expect(overview?.topFocusRate).toBe(0.4);
    expect(overview?.topDismissRate).toBe(0.2);
    expect(overview?.topEngagementRate).toBe(0.6);
    expect(overview?.topHasScheduledStart).toBe(true);
    expect(overview?.topGuardrailStatus).toBe("watch");
    expect(overview?.topLayoutVariant).toBe("dense");

    const zeroViewOverview = buildSuggestionTelemetryOverview({
      total_suggestions: 1,
      total_view_count: 0,
      total_focus_count: 2,
      total_dismiss_count: 1,
      average_focus_rate: undefined,
      average_dismiss_rate: undefined,
      average_engagement_rate: undefined,
      top_signature: "Region A|Storm incoming|2025-05-01T12:00:00Z|2|1",
      top_region: "Region A",
      top_focus_rate: 0.4,
      top_dismiss_rate: 0.2,
      top_engagement_rate: 0.6,
      top_focus_count: 2,
      top_dismiss_count: 1,
      top_view_count: 0,
      top_event_count: 1,
      top_high_risk_count: 1,
      top_has_scheduled_start: true,
      top_guardrail_status: "watch",
      top_layout_variant: "dense",
      top_last_occurred_at: "2025-05-01T11:00:00Z",
      top_engagement_confidence_level: null,
      top_engagement_confidence_label: "",
    } as any);

    expect(zeroViewOverview).not.toBeNull();
    expect(zeroViewOverview?.averageFocusRate).toBeNull();
    expect(zeroViewOverview?.averageDismissRate).toBeNull();
    expect(zeroViewOverview?.averageEngagementRate).toBeNull();
    expect(zeroViewOverview?.topRegion).toBe("Region A");
    expect(zeroViewOverview?.topFocusRate).toBe(0.4);
    expect(zeroViewOverview?.topDismissRate).toBe(0.2);
    expect(zeroViewOverview?.topEngagementRate).toBe(0.6);
    expect(zeroViewOverview?.topHasScheduledStart).toBe(true);
    expect(zeroViewOverview?.topGuardrailStatus).toBe("watch");
    expect(zeroViewOverview?.topLayoutVariant).toBe("dense");
    expect(zeroViewOverview?.topViewCount).toBe(0);
    expect(zeroViewOverview?.topFocusCount).toBe(2);
    expect(zeroViewOverview?.topDismissCount).toBe(1);
    expect(zeroViewOverview?.topHighRiskCount).toBe(1);
    expect(zeroViewOverview?.topHighRiskSeverity).toBe("elevated");
    expect(zeroViewOverview?.topEventCount).toBe(1);
    expect(zeroViewOverview?.topSummary).toBeNull();
    expect(zeroViewOverview?.topReason).toBeNull();
  });

  it("keeps API-provided rates aligned with per-signature summaries", () => {
    const records: SuggestionTelemetry[] = [
      buildTelemetry({
        signature: "Region A|Storm incoming|2025-05-01T12:00:00Z|2|1",
        view_count: 5,
        focus_count: 1,
        dismiss_count: 0,
        focus_rate: 0.2,
        dismiss_rate: 0,
        engagement_rate: 0.2,
        last_occurred_at: "2025-05-01T11:00:00Z",
      }),
      buildTelemetry({
        signature: "Region B|Sky clearing|2025-05-01T14:00:00Z|1|0",
        region: "Region B",
        reason: "Sky clearing",
        view_count: 0,
        focus_count: 0,
        dismiss_count: 0,
        high_risk_count: 0,
        focus_rate: 0.7,
        dismiss_rate: 0.15,
        engagement_rate: 0.85,
        last_occurred_at: "2025-05-01T12:00:00Z",
        metadata: {
          guardrailStatus: "breach",
          tenantMode: "live",
          layoutVariant: "dense",
          regionSummary: "Clearing skies · monitor guardrails",
          suggestionSummary: "Sky clearing",
          ctaShown: false,
        },
      }),
    ];

    const summaries = summarizeSuggestionTelemetry(records, { limit: 3 });
    const dormant = summaries.find(
      (item) => item.signature === "Region B|Sky clearing|2025-05-01T14:00:00Z|1|0",
    );

    expect(summaries).toHaveLength(2);
    expect(dormant).toBeDefined();
    expect(dormant?.focusRate).toBe(0.7);
    expect(dormant?.dismissRate).toBe(0.15);
    expect(dormant?.engagementRate).toBe(0.85);
    expect(dormant?.highRiskSeverity).toBe("none");
    expect(dormant?.tenantCount).toBe(1);
    expect(dormant?.tenantNames).toEqual(["demo-tenant"]);

    const overview = buildSuggestionTelemetryOverview({
      total_suggestions: summaries.length,
      total_view_count: records.reduce((acc, record) => acc + record.view_count, 0),
      total_focus_count: records.reduce((acc, record) => acc + record.focus_count, 0),
      total_dismiss_count: records.reduce((acc, record) => acc + record.dismiss_count, 0),
      average_focus_rate: 0.45,
      average_dismiss_rate: 0.075,
      average_engagement_rate: 0.525,
      top_signature: dormant?.signature ?? null,
      top_region: dormant?.region ?? null,
      top_focus_rate: dormant?.focusRate ?? null,
      top_dismiss_rate: dormant?.dismissRate ?? null,
      top_engagement_rate: dormant?.engagementRate ?? null,
      top_focus_count: dormant?.focusCount ?? null,
      top_dismiss_count: dormant?.dismissCount ?? null,
      top_view_count: dormant?.viewCount ?? null,
      top_event_count: dormant?.eventCount ?? null,
      top_high_risk_count: dormant?.highRiskCount ?? null,
      top_has_scheduled_start: true,
      top_guardrail_status: dormant?.guardrailStatus ?? null,
      top_layout_variant: dormant?.layoutVariant ?? null,
      top_last_occurred_at: dormant?.lastOccurredAt ?? null,
      top_engagement_confidence_level: null,
      top_engagement_confidence_label: "",
    });

    expect(overview).not.toBeNull();
    expect(overview?.averageFocusRate).toBeCloseTo(0.45, 5);
    expect(overview?.averageDismissRate).toBeCloseTo(0.075, 5);
    expect(overview?.averageEngagementRate).toBeCloseTo(0.525, 5);
    expect(overview?.topConfidenceLevel).toBe("low");
    expect(overview?.topConfidenceLabel).toBe("No direct views yet");
    expect(overview?.topGuardrailStatus).toBe("breach");
    expect(overview?.topLayoutVariant).toBe("dense");
    expect(overview?.topViewCount).toBe(0);
    expect(overview?.topFocusCount).toBe(0);
    expect(overview?.topDismissCount).toBe(0);
    expect(overview?.topHighRiskCount).toBe(dormant?.highRiskCount ?? null);
    expect(overview?.topHighRiskSeverity).toBe(dormant?.highRiskSeverity ?? null);
    expect(overview?.topEventCount).toBe(dormant?.eventCount ?? null);
    expect(overview?.topSummary).toBeNull();
    expect(overview?.topReason).toBeNull();
  });

  it("classifies high-risk severities based on alert count", () => {
    const critical = buildTelemetry({
      signature: "Critical Bay|Storm surge|2025-05-01T18:00:00Z|4|5",
      region: "Critical Bay",
      high_risk_count: 5,
      last_occurred_at: "2025-05-01T18:00:00Z",
    });
    const elevated = buildTelemetry({
      signature: "Elevated Coast|Steady winds|2025-05-01T17:00:00Z|2|1",
      region: "Elevated Coast",
      high_risk_count: 1,
      last_occurred_at: "2025-05-01T17:00:00Z",
    });
    const none = buildTelemetry({
      signature: "Calm Plains|Clear skies|2025-05-01T16:00:00Z|0|0",
      region: "Calm Plains",
      high_risk_count: 0,
      last_occurred_at: "2025-05-01T16:00:00Z",
    });

    const summaries = summarizeSuggestionTelemetry([critical, elevated, none], {
      limit: 3,
    });

    const severityByRegion = new Map(
      summaries.map((entry) => [entry.region, entry.highRiskSeverity]),
    );

    expect(severityByRegion.get("Critical Bay")).toBe("critical");
    expect(severityByRegion.get("Elevated Coast")).toBe("elevated");
    expect(severityByRegion.get("Calm Plains")).toBe("none");
  });

  it("normalises tenant coverage across record and metadata sources", () => {
    const summaries = summarizeSuggestionTelemetry(
      [
        buildTelemetry({
          tenants: ["  Acme  Corp ", "Globex", "Acme Corp"],
          metadata: {
            guardrailStatus: "watch",
            tenantMode: "live",
            layoutVariant: "dense",
            regionSummary: "Testing coverage",
            suggestionSummary: "Testing coverage",
            ctaShown: false,
            tenants: ["Beta LLC", "Globex "],
            primaryTenant: "Northwind Traders",
          },
        }),
      ],
      { limit: 3 },
    );

    const [summary] = summaries;
    expect(summary.tenantCount).toBe(4);
    expect(summary.tenantNames).toEqual([
      "Acme Corp",
      "Globex",
      "Beta LLC",
      "Northwind Traders",
    ]);
  });
});

describe("buildDataCoverageInsight", () => {
  it("orders buckets and normalises metrics", () => {
    const coverage = {
      tenant_id: "tenant-123",
      window_days: 90,
      end_date: "2025-03-31",
      generated_at: "2025-04-01T09:00:00Z",
      status: "warning" as const,
      buckets: {
        weather: {
          name: "weather",
          status: "warning" as const,
          observed_days: 79,
          window_days: 90,
          coverage_ratio: 0.88,
          latest_date: "2025-03-30",
          sources: ["experiments/features/weather_join_validation.json"],
          issues: [" Gap on 2025-03-05 ", "Gap on 2025-03-05"],
          extra_metrics: { geocoded_order_ratio: 0.84 },
        },
        sales: {
          name: "sales",
          status: "ok" as const,
          observed_days: 90,
          window_days: 90,
          coverage_ratio: 1.02,
          latest_date: "2025-03-31",
          sources: ["storage/lake/raw/tenant-123_shopify_orders"],
          issues: [],
          extra_metrics: {},
        },
        spend: {
          name: "spend",
          status: "critical" as const,
          observed_days: 65,
          window_days: 90,
          coverage_ratio: 0.72,
          latest_date: "2025-03-28",
          sources: ["storage/lake/raw/tenant-123_meta_ads", " storage/lake/raw/tenant-123_google_ads "],
          issues: ["Meta dataset missing", "  Meta dataset missing "],
          extra_metrics: {},
        },
      },
    };

    const insight = buildDataCoverageInsight(coverage);

    expect(insight).not.toBeNull();
    expect(insight?.status).toBe("warning");
    expect(insight?.windowDays).toBe(90);
    expect(insight?.endDateIso).toBe("2025-03-31T00:00:00.000Z");
    expect(insight?.generatedAtIso).toBe("2025-04-01T09:00:00.000Z");
    expect(insight?.buckets.map((bucket) => bucket.key)).toEqual(["sales", "spend", "weather"]);
    const [sales, spend, weather] = insight?.buckets ?? [];
    expect(sales.coverageRatio).toBe(1);
    expect(sales.missingDays).toBe(0);
    expect(spend.missingDays).toBe(25);
    expect(spend.issues).toEqual(["Meta dataset missing"]);
    expect(spend.sources).toEqual([
      "storage/lake/raw/tenant-123_meta_ads",
      "storage/lake/raw/tenant-123_google_ads",
    ]);
    expect(weather.geocodedRatio).toBeCloseTo(0.84);
    expect(weather.issues).toEqual(["Gap on 2025-03-05"]);
    expect(weather.latestDateIso).toBe("2025-03-30T00:00:00.000Z");
  });

  it("returns null when coverage snapshot is unavailable", () => {
    expect(buildDataCoverageInsight(null)).toBeNull();
    expect(buildDataCoverageInsight(undefined)).toBeNull();
  });
});

describe("buildHighRiskAlertDescriptor", () => {
  it("returns badge metadata for critical severity", () => {
    const descriptor = buildHighRiskAlertDescriptor("critical", 4.6);
    expect(descriptor.severity).toBe("critical");
    expect(descriptor.safeCount).toBe(5);
    expect(descriptor.badgeLabel).toBe("Critical risk");
    expect(descriptor.hasBadge).toBe(true);
  });

  it("normalises unknown severity and invalid counts", () => {
    const descriptor = buildHighRiskAlertDescriptor(null, -3);
    expect(descriptor.severity).toBe("none");
    expect(descriptor.safeCount).toBe(0);
    expect(descriptor.badgeLabel).toBeNull();
    expect(descriptor.hasBadge).toBe(false);
  });
});

describe("buildSuggestionTelemetryCsv", () => {
  it("builds a CSV export with metadata and escaped values", () => {
    const records: SuggestionTelemetry[] = [
      buildTelemetry({
        region: "Region, North",
        reason: 'Storm "alpha" incoming',
        view_count: 12,
        focus_count: 5,
        dismiss_count: 1,
        high_risk_count: 3,
        event_count: 2,
        metadata: {
          guardrailStatus: "watch",
          tenantMode: "live",
          layoutVariant: "dense",
          regionSummary: 'Storm "alpha" incoming',
          suggestionSummary: 'Storm "alpha" incoming',
          ctaShown: true,
        },
      }),
    ];

    const summaries = summarizeSuggestionTelemetry(records, { limit: 3 });
    const overview = buildSuggestionTelemetryOverview(null, records);
    const csv = buildSuggestionTelemetryCsv(summaries, {
      overview,
      generatedAt: "2025-05-01T12:00:00Z",
      tenantId: "demo-tenant",
    });

    const lines = csv.split("\n");

    expect(lines[0]).toBe("Metric,Value");
    expect(lines.some((line) => line.startsWith("Generated At,"))).toBe(true);
    expect(lines).toContain("Tenant,demo-tenant");
    expect(lines).toContain('Top region,"Region, North"');
    expect(lines).toContain("Top high-risk severity,critical");

    const headerLineIndex = lines.findIndex((line) =>
      line.startsWith("Region,Summary,Reason,High risk severity"),
    );
    expect(headerLineIndex).toBeGreaterThanOrEqual(0);
    const headerColumns =
      headerLineIndex >= 0 ? lines[headerLineIndex].split(",") : [];
    expect(headerColumns).toContain("Tenant count");
    expect(headerColumns).toContain("Tenant sample");

    const dataLine = lines.find((line) => line.startsWith('"Region, North",'));
    expect(dataLine).toBeDefined();
    expect(dataLine).toContain('"Storm ""alpha"" incoming"');
    const columns = dataLine ? parseCsvLine(dataLine) : [];
    expect(columns).toHaveLength(23);
    expect(columns[14]).toBe("1");
    expect(columns[15]).toBe("demo-tenant");
  });

  it("returns header rows when no summaries exist", () => {
    const csv = buildSuggestionTelemetryCsv([], {
      generatedAt: "2025-05-01T12:00:00Z",
    });

    const lines = csv.split("\n");
    const headerLine = lines[lines.length - 1];
    const columns = headerLine.split(",");

    expect(columns).toHaveLength(23);
    expect(columns[0]).toBe("Region");
    expect(columns[1]).toBe("Summary");
    expect(columns[columns.length - 1]).toBe("Engagement confidence label");
  });
});

describe("topAllocatorRecommendations", () => {
  const summary: AllocatorSummary = {
    mode: "assist",
    total_spend: 150000,
    total_spend_delta: -12000,
    total_spend_delta_pct: -8,
    guardrail_breaches: 1,
    notes: [],
    recommendations: [
      {
        platform: "Email",
        spend_delta: 2500,
        spend_delta_pct: 4,
        spend_after: 30000,
        severity: "info",
        guardrail_count: 0,
        top_guardrail: null,
        notes: null,
      },
      {
        platform: "Meta",
        spend_delta: -15000,
        spend_delta_pct: -10,
        spend_after: 90000,
        severity: "critical",
        guardrail_count: 2,
        top_guardrail: "CPA breach detected",
        notes: null,
      },
      {
        platform: "Google",
        spend_delta: -5000,
        spend_delta_pct: -6,
        spend_after: 40000,
        severity: "warning",
        guardrail_count: 1,
        top_guardrail: "Budget delta exceeds policy",
        notes: null,
      },
      {
        platform: "CTV",
        spend_delta: -3000,
        spend_delta_pct: -7,
        spend_after: 12000,
        severity: "warning",
        guardrail_count: 1,
        top_guardrail: "Learning cap",
        notes: null,
      },
    ],
  };

  it("orders recommendations by severity and magnitude before trimming", () => {
    const ordered = topAllocatorRecommendations(summary, 4);
    expect(ordered.map((item) => item.platform)).toEqual([
      "Meta",
      "Google",
      "CTV",
      "Email",
    ]);
  });

  it("returns a bounded slice when limit is provided", () => {
    const topTwo = topAllocatorRecommendations(summary, 2);
    expect(topTwo).toHaveLength(2);
    expect(topTwo[0]?.platform).toBe("Meta");
    expect(topTwo[1]?.platform).toBe("Google");
  });

  it("returns an empty list when limit resolves below one", () => {
    expect(topAllocatorRecommendations(summary, -2)).toEqual([]);
    expect(topAllocatorRecommendations(summary, Number.NaN)).toEqual([]);
  });
});

describe("summarizeAllocatorDiagnostics", () => {
  const baseSummary: AllocatorSummary = {
    mode: "assist",
    total_spend: 250000,
    total_spend_delta: -12000,
    total_spend_delta_pct: -4.8,
    guardrail_breaches: 0,
    notes: [],
    recommendations: [],
    diagnostics: {
      optimizer: "projected_gradient",
      optimizer_winner: "projected_gradient",
      optimizer_candidates: [
        {
          optimizer: "projected_gradient",
          profit: 430,
          success: 1,
        },
        {
          optimizer: "coordinate_ascent",
          profit: 422.5,
          success: 0.86,
        },
      ],
      scenario_profit_p10: 395,
      scenario_profit_p50: 430,
      scenario_profit_p90: 468,
      profit_delta_p50: 30,
      expected_profit_raw: 435,
      profit_delta_expected: 35,
      profit_lift: 25,
      baseline_profit: 400,
      evaluations: 180,
      iterations: 12,
      improvements: 6,
      projection_target: 500000,
      projection_residual_lower: 0,
      projection_residual_upper: 0.0003,
      success: 0.9,
      objective_value: -430,
      min_softened: false,
      iterations_with_improvement: 7,
      binding_constraints: {
        binding_min_spend_by_cell: ["meta", "google"],
        binding_roas_floor: ["display"],
      },
    },
  };

  it("returns null when diagnostics are missing", () => {
    expect(summarizeAllocatorDiagnostics(null)).toBeNull();
    expect(
      summarizeAllocatorDiagnostics({
        ...baseSummary,
        diagnostics: undefined,
      }),
    ).toBeNull();
  });

  it("summarizes optimizer and binding constraints", () => {
    const summary = summarizeAllocatorDiagnostics(baseSummary);
    expect(summary).not.toBeNull();
    expect(summary?.optimizerLabel).toBe("Projected gradient");
    expect(summary?.profitP10).toBe(395);
    expect(summary?.profitP50).toBe(430);
    expect(summary?.profitP90).toBe(468);
    expect(summary?.profitP50Delta).toBe(30);
    expect(summary?.profitP50DeltaDirection).toBe("positive");
    expect(summary?.baselineProfit).toBe(400);
    expect(summary?.expectedProfitDelta).toBe(35);
    expect(summary?.expectedProfitDeltaDirection).toBe("positive");
    expect(summary?.profitLiftDirection).toBe("positive");
    expect(summary?.bindingHighlights).toContain("Per-market minimums affects Meta and Google");
    expect(summary?.bindingHighlights).toContain("ROAS floor affects Display");
    expect(summary?.evaluationCount).toBe(180);
    expect(summary?.iterationCount).toBe(12);
    expect(summary?.improvementCount).toBe(6);
    expect(summary?.projectionTarget).toBe(500000);
    expect(summary?.projectionResidualLower).toBe(0);
    expect(summary?.projectionResidualUpper).toBeCloseTo(0.0003);
    expect(summary?.successScore).toBeCloseTo(0.9);
    expect(summary?.wasMinSoftened).toBe(false);
    expect(summary?.objectiveValue).toBe(-430);
    expect(summary?.optimizerCandidates).toHaveLength(2);
    expect(summary?.optimizerCandidates[0]).toMatchObject({
      id: "projected_gradient",
      label: "Projected gradient",
      profit: 430,
      success: 1,
      isWinner: true,
    });
    expect(summary?.optimizerCandidates[1]).toMatchObject({
      id: "coordinate_ascent",
      label: "Coordinate ascent",
      profit: 422.5,
      success: 0.86,
      isWinner: false,
    });
  });

  it("falls back to iterations_with_improvement when direct metrics missing", () => {
    const summary = summarizeAllocatorDiagnostics({
      ...baseSummary,
      diagnostics: {
        ...baseSummary.diagnostics,
        improvements: undefined,
        iterations: undefined,
        iterations_with_improvement: 9,
      },
    });
    expect(summary).not.toBeNull();
    expect(summary?.iterationCount).toBe(9);
    expect(summary?.improvementCount).toBe(9);
  });

  it("derives expected profit delta from baseline when explicit metric missing", () => {
    const summary = summarizeAllocatorDiagnostics({
      ...baseSummary,
      diagnostics: {
        ...baseSummary.diagnostics,
        profit_delta_expected: undefined,
      },
    });
    expect(summary).not.toBeNull();
    expect(summary?.expectedProfitDelta).toBeCloseTo(35);
  });

  it("uses nfev when evaluation counts are missing", () => {
    const summary = summarizeAllocatorDiagnostics({
      ...baseSummary,
      diagnostics: {
        ...baseSummary.diagnostics,
        evaluations: undefined,
        nfev: 42,
      } as any,
    });
    expect(summary).not.toBeNull();
    expect(summary?.evaluationCount).toBe(42);
  });
});

describe("weatherRegionSlug", () => {
  it("normalizes whitespace and casing while caching slugs", () => {
    const first = weatherRegionSlug("  North   America  ");
    const second = weatherRegionSlug("north america");
    expect(first).toBe("north-america");
    expect(second).toBe(first);
  });

  it("falls back to unspecified when region is blank", () => {
    expect(weatherRegionSlug("")).toBe("unspecified-region");
    expect(weatherRegionSlug(null)).toBe("unspecified-region");
  });
});
