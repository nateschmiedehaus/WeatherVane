import { describe, expect, it } from "vitest";

import {
  buildPlanCsv,
  buildPlanExportFilename,
  buildExperimentCsv,
  buildPlanWithExperimentsCsv,
  buildExperimentsExportFilename,
} from "../plan-export";
import type { PlanResponse, ExperimentPayload } from "../../types/plan";

const samplePlan: PlanResponse = {
  tenant_id: "demo-tenant",
  generated_at: "2025-10-21T05:15:00Z",
  horizon_days: 7,
  slices: [
    {
      plan_date: "2025-10-22",
      geo_group_id: "metro-nyc",
      category: "Outerwear",
      channel: "Meta",
      cell: "Upper funnel",
      recommended_spend: 12500,
      expected_revenue: { p10: 18000, p50: 24000, p90: 32000 },
      expected_roas: { p10: 1.2, p50: 1.9, p90: 2.6 },
      confidence: "HIGH",
      assumptions: ["Creative refresh holds lift"],
      rationale: {
        primary_driver: "Warm surge increasing jacket demand",
        supporting_factors: ["Geo clusters show +14% CTR", "Inventory healthy"],
        confidence_level: "HIGH",
        data_quality: "GOOD",
        assumptions: ["Guardrails stable"],
        risks: ["Severe weather could suppress turnout"],
      },
      status: "primary",
    },
  ],
  context_tags: [],
};

describe("plan export helpers", () => {
  it("buildPlanCsv serialises plan slices with escaped text", () => {
    const csv = buildPlanCsv(samplePlan);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual(
      [
        "plan_date",
        "geo_group_id",
        "category",
        "channel",
        "cell",
        "confidence",
        "recommended_spend",
        "expected_revenue_p10",
        "expected_revenue_p50",
        "expected_revenue_p90",
        "expected_roas_p10",
        "expected_roas_p50",
        "expected_roas_p90",
        "primary_driver",
        "supporting_factors",
        "assumptions",
        "risks",
      ].join(","),
    );
    expect(lines[1]).toContain("2025-10-22,metro-nyc,Outerwear,Meta,Upper funnel,HIGH,12500");
    expect(lines[1]).toContain("18000,24000,32000,1.2,1.9,2.6");
    expect(lines[1]).toContain("Warm surge increasing jacket demand");
    expect(lines[1]).toContain("Geo clusters show +14% CTR; Inventory healthy");
    expect(lines[1]).toContain("Guardrails stable");
    expect(lines[1]).toContain("Severe weather could suppress turnout");
  });

  it("buildPlanExportFilename generates sanitised filename", () => {
    expect(buildPlanExportFilename(samplePlan.tenant_id, samplePlan.generated_at)).toEqual(
      "weathervane-plan-demo-tenant-2025-10-21T05-15-00Z.csv",
    );
  });

  it("buildPlanExportFilename falls back on invalid timestamps", () => {
    expect(buildPlanExportFilename("demo tenant!", "invalid")).toEqual(
      "weathervane-plan-demo-tenant--unknown.csv",
    );
  });

  it("buildExperimentCsv serialises experiment data with lift", () => {
    const experiment: ExperimentPayload = {
      experiment_id: "exp-1",
      status: "completed",
      metric_name: "roas",
      treatment_geos: ["NYC", "LA"],
      control_geos: ["SF"],
      treatment_spend: 50000,
      control_spend: 25000,
      lift: {
        absolute_lift: 0.2,
        lift_pct: 20.0,
        confidence_low: 0.1,
        confidence_high: 0.3,
        p_value: 0.001,
        sample_size: 1000,
        is_significant: true,
        generated_at: "2025-10-21T10:00:00Z",
      },
    };

    const csv = buildExperimentCsv([experiment]);
    const lines = csv.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("experiment_id");
    expect(lines[0]).toContain("lift_pct");
    expect(lines[0]).toContain("is_significant");
    expect(lines[1]).toContain("exp-1");
    expect(lines[1]).toContain("completed");
    expect(lines[1]).toContain("20");
    expect(lines[1]).toContain("true");
  });

  it("buildPlanWithExperimentsCsv combines plan and experiment sections", () => {
    const experiment: ExperimentPayload = {
      experiment_id: "exp-1",
      status: "completed",
      metric_name: "roas",
      treatment_geos: ["NYC"],
      control_geos: ["SF"],
      lift: {
        absolute_lift: 0.15,
        lift_pct: 15.0,
        confidence_low: 0.08,
        confidence_high: 0.22,
        p_value: 0.02,
        sample_size: 500,
        is_significant: true,
      },
    };

    const planWithExperiments: PlanResponse = {
      ...samplePlan,
      experiments: [experiment],
    };

    const csv = buildPlanWithExperimentsCsv(planWithExperiments);

    expect(csv).toContain("[EXPERIMENTS]");
    expect(csv).toContain("exp-1");
    expect(csv).toContain("2025-10-22");
  });

  it("buildExperimentsExportFilename generates valid filename", () => {
    expect(buildExperimentsExportFilename("demo-tenant", samplePlan.generated_at)).toEqual(
      "weathervane-experiments-demo-tenant-2025-10-21T05-15-00Z.csv",
    );
  });
});
