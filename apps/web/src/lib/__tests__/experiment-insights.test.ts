import { describe, expect, it } from "vitest";

import {
  buildExecutiveSummary,
  buildExperimentCsv,
  buildExportFileName,
  buildInstrumentationSignals,
  buildSlidesOutline,
  type ExperimentExportContext,
} from "../experiment-insights";
import type { IncrementalityReport } from "../../types/incrementality";

const baseReport: IncrementalityReport = {
  tenant_id: "tenant-123",
  generated_at: "2025-10-19T00:00:00Z",
  design: {
    status: "ready",
    geo_count: 12,
    holdout_count: 6,
    holdout_ratio: 0.5,
    control_share: 0.5,
    assignment: [],
    tenant_id: "tenant-123",
    lookback_days: 28,
    notes: [],
    geo_column: "geo",
  },
  summary: {
    treatment_mean: 1280,
    control_mean: 1020,
    absolute_lift: 18400,
    lift: 0.255,
    p_value: 0.03,
    conf_low: 11200,
    conf_high: 24800,
    sample_size_treatment: 520,
    sample_size_control: 508,
    generated_at: "2025-10-18T12:00:00Z",
    is_significant: true,
  },
  performance_summary: {
    status: "ok",
    summary: {
      coverage: { coverage: 0.88 },
      coverage_by_horizon: { "1": { coverage: 0.87 }, "3": { coverage: 0.9 } },
    },
    failing_horizons: [],
  },
  backtest: [],
};

describe("experiment insights executive summary", () => {
  it("promotes a confident approve posture when lift is significant and positive", () => {
    const signals = buildInstrumentationSignals(baseReport);
    const summary = buildExecutiveSummary(baseReport, signals);

    expect(summary).not.toBeNull();
    expect(summary?.decisionLabel).toBe("Approve uplift");
    expect(summary?.decisionTone).toBe("success");
    expect(summary?.confidenceBadge).toContain("confidence");
    expect(summary?.riskCallout).toBeNull();
  });

  it("records instrumentation risks in the executive callout", () => {
    const risky: IncrementalityReport = {
      ...baseReport,
      summary: {
        ...baseReport.summary!,
        absolute_lift: -2200,
        lift: -0.04,
        p_value: 0.02,
        is_significant: true,
        sample_size_treatment: 180,
        sample_size_control: 150,
      },
      performance_summary: {
        status: "coverage_below_threshold",
        summary: {
          coverage: { coverage: 0.7 },
        },
        failing_horizons: ["3"],
      },
    };

    const signals = buildInstrumentationSignals(risky);
    const summary = buildExecutiveSummary(risky, signals);

    expect(summary?.decisionLabel).toBe("Pause expansion");
    expect(summary?.decisionTone).toBe("critical");
    expect(summary?.riskCallout).toMatch(/coverage/i);
  });
});

describe("experiment exports", () => {
  const signals = buildInstrumentationSignals(baseReport);
  const executive = buildExecutiveSummary(baseReport, signals);
  const context: ExperimentExportContext = {
    report: baseReport,
    executiveSummary: executive,
    signals,
  };

  it("builds a CSV export with executive results and instrumentation signals", () => {
    const csv = buildExperimentCsv(context);

    expect(csv).toContain("Executive,Headline");
    expect(csv).toContain("Approve uplift");
    expect(csv).toContain("Instrumentation,Sample size");
    expect(csv).toContain("Forecast,Coverage");
  });

  it("prepares a slide outline referencing lift, telemetry, and fallback", () => {
    const outline = buildSlidesOutline(context);

    expect(outline).toContain("Experiments Hub Executive Brief");
    expect(outline).toContain("Observed lift");
    expect(outline).toContain("Instrumentation Health");
    expect(outline).toContain("Fallback plan");
  });

  it("generates a filename with tenant and timestamp context", () => {
    const filename = buildExportFileName(baseReport, "csv");
    expect(filename).toMatch(/^tenant-123-experiment-/);
    expect(filename.endsWith(".csv")).toBe(true);
  });
});
