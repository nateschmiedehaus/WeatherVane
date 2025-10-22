import { describe, expect, it } from "vitest";

import {
  computeConfidenceMixSummary,
  computeHeroMetricSummary,
} from "../plan-insights";
import type { PlanSlice } from "../../types/plan";

const makeSlice = (overrides: Partial<PlanSlice>): PlanSlice => ({
  plan_date: "2025-10-21",
  geo_group_id: "metro-nyc",
  category: "Outerwear",
  channel: "Meta",
  recommended_spend: 1000,
  expected_revenue: { p10: 1200, p50: 1500, p90: 1800 },
  expected_roas: { p10: 1.1, p50: 1.4, p90: 1.7 },
  confidence: "HIGH",
  assumptions: [],
  rationale: {
    primary_driver: "Warm surge boosting jackets",
    supporting_factors: [],
    confidence_level: "HIGH",
    data_quality: "GOOD",
    assumptions: [],
    risks: [],
  },
  ...overrides,
});

describe("computeHeroMetricSummary", () => {
  it("aggregates ROI, lift, guardrail confidence, and driver", () => {
    const slices: PlanSlice[] = [
      makeSlice({
        recommended_spend: 1000,
        expected_revenue: { p10: 1200, p50: 1600, p90: 2100 },
        confidence: "HIGH",
      }),
      makeSlice({
        plan_date: "2025-10-22",
        geo_group_id: "metro-bos",
        channel: "Google",
        recommended_spend: 800,
        expected_revenue: { p10: 900, p50: 1000, p90: 1300 },
        confidence: "MEDIUM",
        rationale: {
          primary_driver: "",
          supporting_factors: ["Cold snap expected"],
          confidence_level: "MEDIUM",
          data_quality: "OK",
          assumptions: [],
          risks: ["Creative fatigue"],
        },
      }),
      makeSlice({
        plan_date: "2025-10-23",
        geo_group_id: "texas",
        channel: "Email",
        recommended_spend: 400,
        expected_revenue: { p10: 350, p50: 360, p90: 500 },
        confidence: "LOW",
      }),
    ];

    const summary = computeHeroMetricSummary(slices);
    expect(summary.roiMultiple).toBeCloseTo((1600 + 1000 + 360) / (1000 + 800 + 400));
    expect(summary.roiDeltaPct).toBeCloseTo(((1600 + 1000 + 360 - (1000 + 800 + 400)) / (1000 + 800 + 400)) * 100);
    expect(summary.liftAmount).toBeCloseTo(1600 + 1000 + 360 - (1000 + 800 + 400));
    expect(summary.guardrailConfidencePct).toBeCloseTo(((1 + 0.5) / 3) * 100);
    expect(summary.topDriver).toEqual("Warm surge boosting jackets");
  });

  it("returns null metrics when slices are empty", () => {
    const summary = computeHeroMetricSummary([]);
    expect(summary.roiMultiple).toBeNull();
    expect(summary.roiDeltaPct).toBeNull();
    expect(summary.liftAmount).toBeNull();
    expect(summary.guardrailConfidencePct).toBeNull();
    expect(summary.topDriver).toBeNull();
  });
});

describe("computeConfidenceMixSummary", () => {
  it("counts confidence segments and returns percentages", () => {
    const slices: PlanSlice[] = [
      makeSlice({ confidence: "HIGH" }),
      makeSlice({ plan_date: "2025-10-22", confidence: "HIGH" }),
      makeSlice({ plan_date: "2025-10-23", confidence: "MEDIUM" }),
      makeSlice({ plan_date: "2025-10-24", confidence: "LOW" }),
    ];

    const summary = computeConfidenceMixSummary(slices);

    expect(summary.total).toBe(4);
    expect(summary.counts.HIGH).toBe(2);
    expect(summary.counts.MEDIUM).toBe(1);
    expect(summary.counts.LOW).toBe(1);
    expect(summary.segments.map((segment) => segment.percentage)).toEqual([50, 25, 25]);
  });

  it("returns zeroed summary when no slices exist", () => {
    const summary = computeConfidenceMixSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.counts.HIGH).toBe(0);
    expect(summary.segments.every((segment) => segment.percentage === 0)).toBe(true);
  });
});
