import { describe, expect, it } from "vitest";

import {
  buildGuardrailPostureSegments,
  describeGuardrailPosture,
  summarizeGuardrailRisks,
} from "@web/lib/automationInsights";
import type { GuardrailSegment } from "@web/types/dashboard";

describe("guardrail posture helpers", () => {
  it("builds ordered distribution with percentage weighting", () => {
    const segments: GuardrailSegment[] = [
      {
        name: "Spend ceiling",
        status: "breach",
        value: 24500,
        target: 20000,
        unit: "usd",
        delta_pct: 22,
        notes: null,
      },
      {
        name: "Platform hold",
        status: "breach",
        value: 18,
        target: 12,
        unit: "hours",
        delta_pct: 50,
        notes: null,
      },
      {
        name: "CPA floor",
        status: "watch",
        value: 1.1,
        target: 1.3,
        unit: "x",
        delta_pct: -15,
        notes: null,
      },
      {
        name: "Change windows",
        status: "healthy",
        value: 1,
        target: 1,
        unit: "count",
        delta_pct: 0,
        notes: null,
      },
    ];

    const summary = summarizeGuardrailRisks(segments);
    const distribution = buildGuardrailPostureSegments(summary);

    expect(distribution.map((segment) => segment.status)).toEqual([
      "breach",
      "watch",
      "healthy",
    ]);
    expect(distribution[0].percentage).toBeGreaterThan(distribution[1].percentage);
    const totalPercentage = distribution.reduce((sum, segment) => sum + segment.percentage, 0);
    expect(totalPercentage).toBeCloseTo(100, 5);
  });

  it("produces narrative focused on top breach and watch counts", () => {
    const segments: GuardrailSegment[] = [
      {
        name: "CPA floor",
        status: "breach",
        value: 1.05,
        target: 1.25,
        unit: "x",
        delta_pct: -16,
        notes: null,
      },
      {
        name: "Daily spend",
        status: "watch",
        value: 9800,
        target: 9000,
        unit: "usd",
        delta_pct: 9,
        notes: null,
      },
    ];

    const summary = summarizeGuardrailRisks(segments);
    const narrative = describeGuardrailPosture(summary);

    expect(narrative).toContain("CPA floor");
    expect(narrative).toMatch(/watch item/);
  });

  it("returns onboarding message when telemetry empty", () => {
    const narrative = describeGuardrailPosture({
      healthyCount: 0,
      watchCount: 0,
      breachCount: 0,
      risks: [],
    });

    expect(narrative).toContain("No guardrail telemetry");
  });
});
