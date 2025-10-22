import { describe, expect, it } from "vitest";

import {
  applyScenarioAdjustments,
  buildScenarioBaseline,
  deriveScenarioRecommendations,
} from "../scenario-builder";
import type { PlanResponse } from "../../types/plan";

const samplePlan: PlanResponse = {
  tenant_id: "demo",
  generated_at: "2025-10-20T00:00:00Z",
  horizon_days: 7,
  context_tags: [],
  slices: [
    {
      plan_date: "2025-10-20",
      geo_group_id: "Gulf",
      category: "Cooling",
      channel: "Meta Advantage+",
      recommended_spend: 4200,
      expected_revenue: { p10: 6800, p50: 11200, p90: 14800 },
      expected_roas: { p10: 1.6, p50: 2.67, p90: 3.52 },
      confidence: "HIGH",
      assumptions: [],
      rationale: {
        primary_driver: "Heatwave lift",
        supporting_factors: [],
        confidence_level: "HIGH",
        data_quality: "High",
        assumptions: [],
        risks: [],
      },
    },
    {
      plan_date: "2025-10-21",
      geo_group_id: "Rockies",
      category: "Outerwear",
      channel: "Google Search",
      recommended_spend: 2600,
      expected_revenue: { p10: 4100, p50: 7200, p90: 9300 },
      expected_roas: { p10: 1.55, p50: 2.77, p90: 3.58 },
      confidence: "MEDIUM",
      assumptions: [],
      rationale: {
        primary_driver: "Cold front",
        supporting_factors: [],
        confidence_level: "MEDIUM",
        data_quality: "Medium",
        assumptions: [],
        risks: [],
      },
    },
    {
      plan_date: "2025-10-22",
      geo_group_id: "Northwest",
      category: "Rainwear",
      channel: "Email · Klaviyo",
      recommended_spend: 1100,
      expected_revenue: { p10: 2200, p50: 3600, p90: 4500 },
      expected_roas: { p10: 2.0, p50: 3.27, p90: 4.09 },
      confidence: "LOW",
      assumptions: [],
      rationale: {
        primary_driver: "Atmospheric river",
        supporting_factors: [],
        confidence_level: "LOW",
        data_quality: "Low",
        assumptions: [],
        risks: [],
      },
    },
  ],
};

describe("scenario builder baseline", () => {
  it("aggregates plan slices by channel and orders by spend", () => {
    const baseline = buildScenarioBaseline(samplePlan);
    expect(baseline.horizonDays).toBe(7);
    expect(baseline.totalSpend).toBeCloseTo(7900);
    expect(baseline.totalRevenue).toBeCloseTo(22000);
    expect(baseline.channels).toHaveLength(3);
    expect(baseline.channels[0]?.channel).toBe("Meta Advantage+");
    expect(baseline.channels[1]?.channel).toBe("Google Search");
    expect(baseline.channels[2]?.channel).toBe("Email · Klaviyo");
    expect(baseline.channels[0]?.baseRoi).toBeCloseTo(11200 / 4200, 5);
  });

  it("applies per-channel multipliers with risk-weighted revenue adjustments", () => {
    const baseline = buildScenarioBaseline(samplePlan);
    const outcome = applyScenarioAdjustments(baseline, {
      "Meta Advantage+": 1.1,
      "Google Search": 0.9,
      "Email · Klaviyo": 1.25,
    });

    const meta = outcome.channels.find((channel) => channel.channel === "Meta Advantage+");
    expect(meta?.scenarioSpend).toBeCloseTo(4620);
    expect(meta?.scenarioRevenue).toBeGreaterThan(11200);
    expect(meta?.scenarioRoi).toBeGreaterThan(2.4);

    const email = outcome.channels.find((channel) => channel.channel === "Email · Klaviyo");
    expect(email?.scenarioSpend).toBeCloseTo(1375);
    expect(email?.scenarioRevenue).toBeLessThanOrEqual(3600 * 1.25);

    expect(outcome.summary.totalScenarioSpend).toBeGreaterThan(7900);
    expect(outcome.summary.totalScenarioRevenue).toBeGreaterThan(22000);
    expect(outcome.summary.weightedConfidence).toBe("MEDIUM");
  });

  it("recommends accelerating and trimming the appropriate channels", () => {
    const baseline = buildScenarioBaseline(samplePlan);
    const recommendations = deriveScenarioRecommendations(baseline);

    expect(recommendations.length).toBeGreaterThanOrEqual(2);

    const accelerate = recommendations.find((item) => item.id === "accelerate_high_confidence");
    expect(accelerate).toBeDefined();
    expect(accelerate?.adjustments.every((adjustment) => adjustment.multiplier > 1)).toBe(true);

    const stabilise = recommendations.find((item) => item.id === "stabilise_low_signal");
    expect(stabilise).toBeDefined();
    expect(
      stabilise?.adjustments.some((adjustment) => adjustment.channel === "Email · Klaviyo"),
    ).toBe(true);

    const rebalance = recommendations.find((item) => item.id === "rebalance_mix");
    expect(rebalance).toBeDefined();
    const rebalanceChannels = rebalance?.adjustments.map((adjustment) => adjustment.channel) ?? [];
    expect(rebalanceChannels).toEqual(expect.arrayContaining(["Meta Advantage+", "Email · Klaviyo"]));
  });
});
