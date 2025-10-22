import { describe, expect, it } from "vitest";

import {
  buildReportSharePayload,
  buildTrendRows,
  deriveHeroView,
  formatCurrency,
} from "../../apps/web/src/lib/reports-insights";
import type { ReportsResponse } from "../../apps/web/src/types/reports";

const baseReport: ReportsResponse = {
  tenant_id: "demo",
  generated_at: "2025-10-19T12:00:00Z",
  hero_tiles: [
    {
      id: "roi",
      label: "Weather ROI",
      value: 2.1,
      unit: "multiple",
      narrative: "Heatwave demand leads NYC",
      delta_pct: 32.5,
      delta_value: 14800,
    },
    {
      id: "spend",
      label: "Recommended spend",
      value: 28900,
      unit: "usd",
      narrative: "Meta pushes anchor the narrative",
      delta_pct: null,
      delta_value: 4800,
    },
    {
      id: "guardrails",
      label: "Guardrail confidence",
      value: 82.4,
      unit: "percent",
      narrative: "High confidence across primary slices",
      delta_pct: null,
      delta_value: null,
    },
  ],
  narratives: [
    {
      id: "2025-10-18::NYC::Meta",
      headline: "Paid Social · NYC",
      summary: "",
      weather_driver: "Heatwave drives boardwalk traffic",
      spend: 12500,
      expected_revenue: 32500,
      confidence: "HIGH",
      plan_date: "2025-10-18T00:00:00Z",
      category: "Paid Social",
      channel: "Meta",
    },
    {
      id: "2025-10-19::Chicago::Google",
      headline: "Search · Chicago",
      summary: "",
      weather_driver: "Lake storms boost conversion intent",
      spend: 8400,
      expected_revenue: 15400,
      confidence: "MEDIUM",
      plan_date: "2025-10-19T00:00:00Z",
      category: "Search",
      channel: "Google",
    },
  ],
  trend: {
    cadence: "7-day",
    points: [
      {
        date: "2025-10-18T00:00:00Z",
        recommended_spend: 12500,
        weather_index: 102.5,
        guardrail_score: 88,
      },
      {
        date: "2025-10-19T00:00:00Z",
        recommended_spend: 8400,
        weather_index: 94.2,
        guardrail_score: 75,
      },
    ],
  },
  schedule: {
    status: "active",
    cadence: "weekly",
    recipients: ["sarah@demo.com"],
    delivery_format: "pdf",
    next_delivery_at: "2025-10-26T12:00:00Z",
    last_sent_at: "2025-10-19T12:00:00Z",
    can_edit: true,
    time_zone: "America/New_York",
    note: null,
  },
  success: {
    headline: "NYC unlocked weather-driven win",
    summary: "Weather uplift converted Meta pushes into revenue",
    metric_label: "Incremental revenue",
    metric_value: 19800,
    metric_unit: "usd",
    cta_label: "Open Plan",
    cta_href: "/plan?source=reports",
    persona: "finance",
  },
  context_tags: ["demo"],
  context_warnings: [],
  data_context: { system: "demo" },
};

describe("reports insights helpers", () => {
  it("derives hero view models with formatted deltas", () => {
    const heroes = deriveHeroView(baseReport);
    expect(heroes).toHaveLength(3);
    expect(heroes[0].label).toBe("Weather ROI");
    expect(heroes[0].valueLabel).toContain("2.1");
    expect(heroes[0].deltaLabel).toContain("+");
    expect(heroes[1].valueLabel).toBe(formatCurrency(28900, "usd"));

    const trendRows = buildTrendRows(baseReport.trend.points);
    expect(trendRows[0].dateLabel).toContain("2025");
    expect(trendRows[0].spendLabel).toContain("$");
    expect(trendRows[0].guardrailLabel).toContain("%");
  });

  it("builds an executive-ready share payload including hero, narrative, and trend context", () => {
    const payload = buildReportSharePayload(baseReport, {
      includeTrend: true,
      focusNarrativeId: "2025-10-19::Chicago::Google",
      horizonDays: 7,
    });

    expect(payload).toContain("Executive Weather Report");
    expect(payload).toContain("Hero metrics:");
    expect(payload).toContain("Storyline highlights");
    expect(payload).toContain("Chicago");
    expect(payload).toContain("Trend snapshot");
    expect(payload).toContain("Scheduler: ACTIVE");
    expect(payload).toContain("CTA: Open Plan");
  });
});
