import { describe, expect, it } from "vitest";

import {
  computeHeroMetricSummary,
  deriveOpportunityQueue,
  driverFromSlice,
} from "../../apps/web/src/lib/plan-insights";
import type { PlanSlice } from "../../apps/web/src/types/plan";

const sampleSlices: PlanSlice[] = [
  {
    plan_date: "2025-05-01",
    geo_group_id: "NYC",
    category: "Paid Search",
    channel: "Google Ads",
    recommended_spend: 1000,
    expected_revenue: { p10: 2000, p50: 2600, p90: 3100 },
    expected_roas: { p10: 1.9, p50: 2.4, p90: 2.8 },
    confidence: "HIGH",
    assumptions: ["baseline uplift holds"],
    rationale: {
      primary_driver: "Heatwave demand spike",
      supporting_factors: ["Evening humidity trend"],
      confidence_level: "HIGH",
      data_quality: "strong",
      assumptions: ["inventory steady"],
      risks: ["Supply chain delays"],
    },
    status: "proposed",
  },
  {
    plan_date: "2025-05-02",
    geo_group_id: "LA",
    category: "Paid Social",
    channel: "Meta",
    recommended_spend: 1500,
    expected_revenue: { p10: 1900, p50: 2400, p90: 2900 },
    expected_roas: { p10: 1.2, p50: 1.6, p90: 1.93 },
    confidence: "MEDIUM",
    assumptions: ["creative fatigue risk"],
    rationale: {
      primary_driver: "Marine layer clearing midweek",
      supporting_factors: ["High beach foot traffic"],
      confidence_level: "MEDIUM",
      data_quality: "moderate",
      assumptions: ["creative fatigue risk"],
      risks: ["Creative fatigue spike"],
    },
    status: "proposed",
  },
  {
    plan_date: "2025-05-03",
    geo_group_id: "Chicago",
    category: "Email",
    channel: "ESP",
    recommended_spend: 800,
    expected_revenue: { p10: 400, p50: 600, p90: 900 },
    expected_roas: { p10: 0.5, p50: 0.75, p90: 1.1 },
    confidence: "LOW",
    assumptions: ["Limited historical data"],
    rationale: {
      primary_driver: "",
      supporting_factors: ["Cold front could suppress demand"],
      confidence_level: "LOW",
      data_quality: "sparse",
      assumptions: ["Limited historical data"],
      risks: ["Storm watch requires operator approval"],
    },
    status: "proposed",
  },
];

describe("plan insights", () => {
  it("summarises hero metrics from plan slices", () => {
    const summary = computeHeroMetricSummary(sampleSlices);

    expect(summary.roiMultiple).toBeCloseTo(1.7, 2);
    expect(summary.roiDeltaPct).toBeCloseTo(69.7, 2);
    expect(summary.guardrailConfidencePct).toBeCloseTo(50, 1);
    expect(summary.topDriver).toBe("Heatwave demand spike");
  });

  it("derives the action queue with primary, follow-up, and risk cards", () => {
    const queue = deriveOpportunityQueue(sampleSlices);

    expect(queue).toHaveLength(3);
    expect(queue[0].kind).toBe("primary");
    expect(queue[0].slice.geo_group_id).toBe("NYC");
    expect(queue[1].kind).toBe("followUp");
    expect(queue[1].slice.geo_group_id).toBe("LA");
    expect(queue[2].kind).toBe("risk");
    expect(queue[2].slice.geo_group_id).toBe("Chicago");
    expect(queue[2].reason).toContain("Limited historical data");
  });

  it("falls back to supporting factors when a primary driver is missing", () => {
    const fallbackSlice: PlanSlice = {
      ...sampleSlices[2],
      rationale: {
        ...sampleSlices[2].rationale,
        primary_driver: "",
        supporting_factors: ["Lake effect snow opportunity"],
      },
    };

    expect(driverFromSlice(fallbackSlice)).toBe("Lake effect snow opportunity");
  });
});
