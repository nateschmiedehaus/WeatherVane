import { describe, expect, it } from "vitest";

import {
  buildExecutiveSummary,
  buildExperimentCsv,
  buildInstrumentationSignals,
  buildSlidesOutline,
} from "../../apps/web/src/lib/experiment-insights";
import type { IncrementalityReport } from "../../apps/web/src/types/incrementality";

const degradedReport: IncrementalityReport = {
  tenant_id: "tenant-risk",
  generated_at: "2025-10-19T09:00:00Z",
  design: {
    status: "ready",
    geo_count: 10,
    holdout_count: 4,
    holdout_ratio: 0.45,
    control_share: 0.45,
    assignment: [],
    tenant_id: "tenant-risk",
    lookback_days: 21,
    notes: [],
    geo_column: "geo",
  },
  summary: {
    treatment_mean: 980,
    control_mean: 1020,
    absolute_lift: -4200,
    lift: -0.041,
    p_value: 0.015,
    conf_low: -7100,
    conf_high: -1300,
    sample_size_treatment: 120,
    sample_size_control: 210,
    generated_at: "2025-10-18T23:30:00Z",
    is_significant: true,
  },
  performance_summary: {
    status: "coverage_below_threshold",
    summary: {
      coverage: { coverage: 0.68 },
    },
    failing_horizons: ["3", "5"],
  },
  backtest: [],
};

describe("Experiments hub export integration", () => {
  it("propagates instrumentation risks through exports", () => {
    const signals = buildInstrumentationSignals(degradedReport);
    const execSummary = buildExecutiveSummary(degradedReport, signals);
    const csv = buildExperimentCsv({ report: degradedReport, executiveSummary: execSummary, signals });
    const outline = buildSlidesOutline({ report: degradedReport, executiveSummary: execSummary, signals });

    const webhookSignal = signals.find((signal) => signal.id === "webhook_delivery");
    expect(webhookSignal?.tone).toBe("caution");

    expect(execSummary?.decisionLabel).toBe("Pause expansion");
    expect(execSummary?.riskCallout).toMatch(/coverage/i);
    expect(csv).toContain("Instrumentation,Webhook status");
    expect(outline).toContain("Webhook status");
    expect(outline).toContain("Fallback plan");
  });
});
