import { describe, expect, it } from "vitest";

import { buildDemoPlan } from "@web/demo/plan";
import {
  applyScenarioAdjustments,
  buildScenarioBaseline,
  deriveScenarioRecommendations,
} from "@web/lib/scenario-builder";

describe("scenario builder integration", () => {
  it("dampens revenue lift for low-confidence channels", () => {
    const plan = buildDemoPlan({
      primaryChannel: "meta",
      automationComfort: "assist",
    });
    const baseline = buildScenarioBaseline(plan);

    const highConfidence = baseline.channels.find((channel) => channel.confidence === "HIGH");
    const lowConfidence = baseline.channels.find((channel) => channel.confidence === "LOW");

    expect(highConfidence).toBeDefined();
    expect(lowConfidence).toBeDefined();

    const adjustments = {
      [highConfidence!.channel]: 1.2,
      [lowConfidence!.channel]: 1.2,
    };

    const outcome = applyScenarioAdjustments(baseline, adjustments);
    const highOutcome = outcome.channels.find((channel) => channel.channel === highConfidence!.channel);
    const lowOutcome = outcome.channels.find((channel) => channel.channel === lowConfidence!.channel);

    expect(highOutcome).toBeDefined();
    expect(lowOutcome).toBeDefined();

    const highLiftEfficiency =
      (highOutcome!.deltaRevenue || 0) / Math.max(highOutcome!.deltaSpend || 1, 1);
    const lowLiftEfficiency =
      (lowOutcome!.deltaRevenue || 0) / Math.max(lowOutcome!.deltaSpend || 1, 1);

    expect(highLiftEfficiency).toBeGreaterThan(lowLiftEfficiency);
    expect(outcome.summary.totalScenarioSpend).toBeGreaterThan(baseline.totalSpend);
    expect(outcome.summary.totalScenarioRevenue).toBeGreaterThan(baseline.totalRevenue);
  });

  it("derives actionable scenario recommendations from the baseline", () => {
    const plan = buildDemoPlan({
      primaryChannel: "meta",
      automationComfort: "assist",
    });
    const baseline = buildScenarioBaseline(plan);
    const recommendations = deriveScenarioRecommendations(baseline);

    expect(recommendations.length).toBeGreaterThan(0);
    const accelerate = recommendations.find((item) => item.id === "accelerate_high_confidence");
    expect(accelerate).toBeDefined();
    expect(accelerate!.adjustments.length).toBeGreaterThan(0);

    const adjustmentMap = accelerate!.adjustments.reduce<Record<string, number>>((acc, adjustment) => {
      acc[adjustment.channel] = adjustment.multiplier;
      return acc;
    }, {});

    const outcome = applyScenarioAdjustments(baseline, adjustmentMap);
    expect(outcome.summary.totalScenarioSpend).toBeGreaterThan(baseline.totalSpend);
    expect(outcome.summary.totalScenarioRevenue).toBeGreaterThan(baseline.totalRevenue);
  });

  it("preserves baseline totals when multipliers remain neutral", () => {
    const plan = buildDemoPlan({
      primaryChannel: "meta",
      automationComfort: "assist",
    });
    const baseline = buildScenarioBaseline(plan);

    const neutralAdjustments = baseline.channels.reduce<Record<string, number>>((acc, channel) => {
      acc[channel.channel] = 1;
      return acc;
    }, {});

    const outcome = applyScenarioAdjustments(baseline, neutralAdjustments);

    expect(outcome.summary.totalScenarioSpend).toBeCloseTo(baseline.totalSpend, 6);
    expect(outcome.summary.totalScenarioRevenue).toBeCloseTo(baseline.totalRevenue, 6);
    expect(outcome.summary.deltaSpend).toBeCloseTo(0, 6);
    expect(outcome.summary.deltaRevenue).toBeCloseTo(0, 6);
  });
});
