import type { IncrementalityReport, IncrementalitySummary } from "../types/incrementality";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface InstrumentationSignal {
  id: string;
  label: string;
  value: string;
  tone: "success" | "info" | "caution" | "critical";
  detail: string;
}

export interface ExecutiveSummary {
  headline: string;
  liftNarrative: string;
  confidenceNarrative: string;
  confidenceBadge: string;
  confidenceLevel: ConfidenceLevel;
  decisionLabel: string;
  decisionTone: "success" | "info" | "caution" | "critical";
  recommendation: string;
  fallbackPlan: string;
  riskCallout: string | null;
  generatedAt: string | null;
}

export interface ExperimentExportContext {
  report: IncrementalityReport | null;
  executiveSummary: ExecutiveSummary | null;
  signals: InstrumentationSignal[];
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return currencyFormatter.format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatPercentWhole(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${Math.round(value * 100)}%`;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

interface PerformanceSnapshot {
  status: string;
  coverage: number | null;
  failingHorizons: string[];
}

function extractPerformance(report: IncrementalityReport | null): PerformanceSnapshot {
  const raw = report?.performance_summary;
  if (!raw || typeof raw !== "object") {
    return {
      status: "unknown",
      coverage: null,
      failingHorizons: [],
    };
  }

  const record = raw as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : "unknown";

  let coverage: number | null = null;
  const summary = record.summary;
  if (summary && typeof summary === "object") {
    const summaryRecord = summary as Record<string, unknown>;
    const coverageNode = summaryRecord.coverage;
    if (coverageNode && typeof coverageNode === "object") {
      const coverageRecord = coverageNode as Record<string, unknown>;
      const coverageValue = coverageRecord.coverage;
      if (typeof coverageValue === "number" && Number.isFinite(coverageValue)) {
        coverage = coverageValue;
      }
    }
  }

  const failing = Array.isArray(record.failing_horizons)
    ? (record.failing_horizons as unknown[]).filter((entry): entry is string => typeof entry === "string")
    : [];

  return {
    status,
    coverage,
    failingHorizons: failing,
  };
}

function estimateConfidence(summary: IncrementalitySummary | null | undefined): number {
  if (!summary) {
    return 0;
  }
  const pValue = typeof summary.p_value === "number" ? summary.p_value : 1;
  if (!Number.isFinite(pValue)) {
    return 0;
  }
  const estimate = 1 - Math.max(0, Math.min(1, pValue));
  return Math.max(0, Math.min(99, Math.round(estimate * 100)));
}

function toConfidenceLevel(confidencePercent: number): ConfidenceLevel {
  if (confidencePercent >= 95) {
    return "high";
  }
  if (confidencePercent >= 80) {
    return "medium";
  }
  return "low";
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

export function buildInstrumentationSignals(report: IncrementalityReport | null): InstrumentationSignal[] {
  const summary = report?.summary ?? null;
  const design = report?.design ?? null;
  const performance = extractPerformance(report);
  const signals: InstrumentationSignal[] = [];

  const treatmentSize = summary?.sample_size_treatment ?? null;
  const controlSize = summary?.sample_size_control ?? null;
  const totalSample = (treatmentSize ?? 0) + (controlSize ?? 0);
  const totalSampleTone = totalSample >= 800 ? "success" : totalSample >= 400 ? "caution" : "critical";
  const sampleDetail =
    totalSample > 0
      ? `Treatment ${treatmentSize?.toLocaleString() ?? "—"} · Control ${controlSize?.toLocaleString() ?? "—"} participants`
      : "No observations captured yet.";

  signals.push({
    id: "sample_size",
    label: "Sample size",
    value: totalSample > 0 ? `${totalSample.toLocaleString()} events` : "Awaiting telemetry",
    tone: totalSample > 0 ? totalSampleTone : "caution",
    detail: sampleDetail,
  });

  const targetControlShare = safeNumber(design?.control_share) ?? safeNumber(design?.holdout_ratio) ?? 0.5;
  const targetTreatmentShare = 1 - targetControlShare;
  const observedTreatmentShare = totalSample > 0 && treatmentSize !== null ? treatmentSize / totalSample : null;
  const balanceDelta =
    observedTreatmentShare === null ? null : Math.abs(observedTreatmentShare - targetTreatmentShare);

  let balanceTone: "success" | "info" | "caution" | "critical" = "info";
  let balanceDetail = "Randomisation health pending sample collection.";
  let balanceValue = "Pending";
  if (observedTreatmentShare !== null) {
    balanceValue = `${formatPercentWhole(observedTreatmentShare)} treatment`;
    if (balanceDelta !== null) {
      if (balanceDelta <= 0.05) {
        balanceTone = "success";
        balanceDetail = "Treatment vs control within ±5% of design target.";
      } else if (balanceDelta <= 0.1) {
        balanceTone = "caution";
        balanceDetail = "Slight imbalance detected; monitor assignments before approving lift.";
      } else {
        balanceTone = "critical";
        balanceDetail = "Large imbalance between treatment and control; replenish holdout before acting.";
      }
    }
  }

  signals.push({
    id: "treatment_balance",
    label: "Treatment balance",
    value: balanceValue,
    tone: balanceTone,
    detail: balanceDetail,
  });

  const coverage = performance.coverage;
  let coverageTone: "success" | "info" | "caution" | "critical" = "info";
  let coverageDetail = "Forecast coverage telemetry not yet available.";
  if (coverage !== null) {
    coverageTone = coverage >= 0.85 ? "success" : coverage >= 0.75 ? "caution" : "critical";
    const failingHorizonCopy =
      performance.failingHorizons.length > 0
        ? `Failing horizons: ${performance.failingHorizons.join(", ")} day(s).`
        : "All horizons meeting the target window.";
    coverageDetail = `${formatPercent(coverage)} coverage vs 80% target. ${failingHorizonCopy}`;
  }

  signals.push({
    id: "forecast_coverage",
    label: "Forecast coverage",
    value: coverage !== null ? formatPercent(coverage) : "Awaiting coverage feed",
    tone: coverageTone,
    detail: coverageDetail,
  });

  let webhookTone: "success" | "info" | "caution" | "critical" = "info";
  let webhookValue = "Monitoring";
  let webhookDetail = "Webhook delivery health unknown; confirm instrumentation dashboard.";

  if (performance.status === "ok") {
    webhookTone = "success";
    webhookValue = "Healthy";
    webhookDetail = "Allocator telemetry flowing; no delivery gaps detected.";
  } else if (performance.status === "coverage_below_threshold") {
    webhookTone = "caution";
    webhookValue = "Degraded";
    webhookDetail = "Coverage dipped below the 80% guardrail. Investigate missing events or replay webhooks.";
  } else if (performance.status === "missing_data") {
    webhookTone = "critical";
    webhookValue = "No data";
    webhookDetail = "No recent experiment telemetry recorded; validate webhook + ETL status.";
  }

  signals.push({
    id: "webhook_delivery",
    label: "Webhook status",
    value: webhookValue,
    tone: webhookTone,
    detail: webhookDetail,
  });

  return signals;
}

export function buildExecutiveSummary(
  report: IncrementalityReport | null,
  instrumentation?: InstrumentationSignal[],
): ExecutiveSummary | null {
  const summary = report?.summary ?? null;
  const performance = extractPerformance(report);
  const confidencePercent = estimateConfidence(summary);
  const confidenceLevel = toConfidenceLevel(confidencePercent);
  const generatedAt = formatDate(summary?.generated_at);
  const instrumentationAlerts = (instrumentation ?? []).filter(
    (signal) => signal.tone === "caution" || signal.tone === "critical",
  );

  if (!summary) {
    return {
      headline: "Awaiting experiment telemetry",
      liftNarrative: "Treatment vs control performance will populate once lift is calculated.",
      confidenceNarrative: "WeatherVane will publish confidence once the first observation window completes.",
      confidenceBadge: "Confidence pending",
      confidenceLevel,
      decisionLabel: "Hold decision",
      decisionTone: "info",
      recommendation: "Keep budgets steady until the experiment runs long enough to generate lift.",
      fallbackPlan:
        "If telemetry remains missing for 24 hours, trigger instrumentation replay and confirm webhook health checks.",
      riskCallout: performance.status === "missing_data" ? "No experiment events received in the latest cycle." : null,
      generatedAt,
    };
  }

  const liftPercent = typeof summary.lift === "number" ? summary.lift : 0;
  const liftNarrative =
    liftPercent !== 0
      ? `Treatment outperformed control by ${formatPercent(liftPercent)} lift (${formatCurrency(summary.absolute_lift)} incremental revenue).`
      : "Treatment performance matched the control; lift is effectively flat.";

  const confidencePercentLabel =
    confidencePercent > 0 ? `${confidencePercent}% confidence` : "Confidence pending";
  const confidenceNarrative =
    confidencePercent > 0
      ? `WeatherVane is ${confidencePercent}% confident the observed lift reflects true revenue impact.`
      : "Confidence remains low until we gather more signal.";

  const isSignificant = summary.is_significant ?? (summary.p_value ?? 1) < 0.05;
  const positiveLift = (summary.absolute_lift ?? 0) > 0;
  const totalSample = (summary.sample_size_treatment ?? 0) + (summary.sample_size_control ?? 0);

  let decisionLabel = "Hold decision";
  let decisionTone: "success" | "info" | "caution" | "critical" = "info";
  let recommendation =
    "Monitor the next observation window, then revisit once confidence crosses the 80% guardrail.";
  let fallbackPlan =
    "If lift remains inconclusive, plan a rerun with extended duration or broadened geo coverage.";

  if (isSignificant && positiveLift) {
    decisionLabel = "Approve uplift";
    decisionTone = instrumentationAlerts.length > 0 ? "caution" : "success";
    recommendation =
      "Authorize the recommended budget increase and brief finance on the incremental revenue expectation.";
    fallbackPlan =
      "If conversion quality drifts, revert top underperforming geos to baseline while keeping incident logging active.";
  } else if (isSignificant && !positiveLift) {
    decisionLabel = "Pause expansion";
    decisionTone = "critical";
    recommendation =
      "Halt incremental spend and run instrumentation for regression. Share findings with the allocator strike team.";
    fallbackPlan =
      "Switch the affected markets back to control allocations and escalate to allocator operations for remediation.";
  } else if (!isSignificant && positiveLift) {
    decisionLabel = confidenceLevel === "high" ? "Approve uplift" : "Hold decision";
    decisionTone = confidenceLevel === "high" ? "caution" : "info";
    recommendation =
      confidenceLevel === "high"
        ? "Proceed with a limited rollout while extending the observation window for confirmation."
        : "Extend the test window or enlarge the holdout until confidence clears the 80% guardrail.";
  } else {
    decisionLabel = "Hold decision";
    decisionTone = "info";
  }

  if (totalSample < 400) {
    recommendation =
      "Grow the sample to at least 400 observations before presenting lift to leadership.";
  }

  const riskCallout =
    instrumentationAlerts.length > 0
      ? instrumentationAlerts
          .map((signal) => `${signal.label}: ${signal.detail}`)
          .join(" ")
      : null;

  return {
    headline: positiveLift
      ? "Experiment indicates incremental revenue lift"
      : "Experiment lift requires further validation",
    liftNarrative,
    confidenceNarrative,
    confidenceBadge: confidencePercentLabel,
    confidenceLevel,
    decisionLabel,
    decisionTone,
    recommendation,
    fallbackPlan,
    riskCallout,
    generatedAt,
  };
}

function escapeCsvValue(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildExperimentCsv(context: ExperimentExportContext): string {
  const rows: string[][] = [];
  const { report, executiveSummary, signals } = context;
  const summary = report?.summary ?? null;

  rows.push(["Section", "Metric", "Value", "Notes"]);
  rows.push([
    "Executive",
    "Headline",
    executiveSummary?.headline ?? "Awaiting experiment telemetry",
    executiveSummary?.liftNarrative ?? "Telemetry pending.",
  ]);
  rows.push([
    "Executive",
    "Decision",
    executiveSummary?.decisionLabel ?? "Hold decision",
    executiveSummary?.recommendation ?? "Await additional data before acting.",
  ]);
  rows.push([
    "Executive",
    "Confidence",
    executiveSummary?.confidenceNarrative ?? "Confidence will populate after first run.",
    executiveSummary?.riskCallout ?? "",
  ]);

  if (summary) {
    rows.push([
      "Experiment",
      "Lift %",
      formatPercent(summary.lift),
      `Absolute lift ${formatCurrency(summary.absolute_lift)}`,
    ]);
    rows.push([
      "Experiment",
      "Confidence interval",
      `${formatCurrency(summary.conf_low)} – ${formatCurrency(summary.conf_high)}`,
      "95% confidence band",
    ]);
    rows.push([
      "Experiment",
      "Sample sizes",
      `Treatment ${summary.sample_size_treatment?.toLocaleString() ?? "—"} · Control ${summary.sample_size_control?.toLocaleString() ?? "—"}`,
      "",
    ]);
  }

  signals.forEach((signal) => {
    rows.push(["Instrumentation", signal.label, signal.value, signal.detail]);
  });

  const coverage = extractPerformance(report).coverage;
  if (coverage !== null) {
    rows.push(["Forecast", "Coverage", formatPercent(coverage), "Coverage vs target"]);
  }

  return rows.map((row) => row.map((value) => escapeCsvValue(value ?? "")).join(",")).join("\n");
}

export function buildSlidesOutline(context: ExperimentExportContext): string {
  const { report, executiveSummary, signals } = context;
  const summary = report?.summary ?? null;

  const lines: string[] = [];
  lines.push("## Experiments Hub Executive Brief");
  lines.push("");
  lines.push(`Headline: ${executiveSummary?.headline ?? "Awaiting experiment telemetry"}`);
  lines.push(`Decision: ${executiveSummary?.decisionLabel ?? "Hold decision"} (${executiveSummary?.confidenceNarrative ?? "Confidence pending."})`);
  lines.push(`Recommendation: ${executiveSummary?.recommendation ?? "Await additional data before acting."}`);
  if (executiveSummary?.riskCallout) {
    lines.push(`Risks: ${executiveSummary.riskCallout}`);
  }
  lines.push("");
  lines.push("### Experiment Results");
  if (summary) {
    lines.push(`• Observed lift: ${formatPercent(summary.lift)} (${formatCurrency(summary.absolute_lift)} incremental revenue)`);
    lines.push(`• Confidence interval: ${formatCurrency(summary.conf_low)} – ${formatCurrency(summary.conf_high)}`);
    lines.push(
      `• Sample sizes: Treatment ${summary.sample_size_treatment?.toLocaleString() ?? "—"} · Control ${summary.sample_size_control?.toLocaleString() ?? "—"}`,
    );
  } else {
    lines.push("• Lift pending first observation window.");
  }

  lines.push("");
  lines.push("### Instrumentation Health");
  if (signals.length === 0) {
    lines.push("• Instrumentation telemetry pending.");
  } else {
    signals.forEach((signal) => {
      lines.push(`• ${signal.label}: ${signal.value} — ${signal.detail}`);
    });
  }

  lines.push("");
  lines.push("### Next Steps & Fallback");
  lines.push(`• Primary action: ${executiveSummary?.recommendation ?? "Collect additional telemetry."}`);
  lines.push(`• Fallback plan: ${executiveSummary?.fallbackPlan ?? "If lift remains inconclusive, rerun with larger sample."}`);

  const generatedAt = executiveSummary?.generatedAt;
  if (generatedAt) {
    lines.push("");
    lines.push(`Generated at: ${generatedAt}`);
  }

  return lines.join("\n");
}

export function buildExportFileName(report: IncrementalityReport | null, extension: string): string {
  const tenant = report?.tenant_id ? report.tenant_id.replace(/[^a-zA-Z0-9_-]/g, "-") : "experiments";
  const timestamp = (formatDate(report?.generated_at) ?? new Date().toISOString()).replace(/[:]/g, "-");
  return `${tenant}-experiment-${timestamp}.${extension}`.toLowerCase();
}
