import { describe, expect, it } from "vitest";

import type { ShadowRunReport } from "../../types/allocator";
import { buildShadowGuardrailSummary } from "../shadow-insights";

const baseReport: ShadowRunReport = {
  generated_at: "2025-10-20T00:00:00Z",
  average_reward: 0,
  guardrail_violations: 0,
  q_values: { baseline: 0 },
  selection_counts: { baseline: 0 },
  episodes: [],
  guardrail_breach_counts: {},
  disabled_variants: [],
  diagnostics: {},
  config: {},
  scenario: {},
  validation: {
    checks: [],
    notes: [],
    summary: {
      episodes: 0,
      safety_override_rate: 0,
      disabled_variants: [],
    },
    stress_test: {
      config: {
        episodes: 0,
        epsilon: 0,
        max_guardrail_breaches: 0,
        seed: 0,
      },
      guardrail_violations: 0,
      guardrail_breach_counts: {},
      selection_counts: {},
      disabled_variants: [],
      episodes: [],
      assertions: {},
    },
  },
};

const makeReport = (overrides: Partial<ShadowRunReport>): ShadowRunReport => ({
  ...baseReport,
  ...overrides,
  q_values: overrides.q_values ?? baseReport.q_values,
  selection_counts: overrides.selection_counts ?? baseReport.selection_counts,
  episodes: overrides.episodes ?? baseReport.episodes,
  diagnostics: overrides.diagnostics ?? baseReport.diagnostics,
  guardrail_breach_counts: overrides.guardrail_breach_counts ?? baseReport.guardrail_breach_counts,
  disabled_variants: overrides.disabled_variants ?? baseReport.disabled_variants,
  config: overrides.config ?? baseReport.config,
  scenario: overrides.scenario ?? baseReport.scenario,
  validation: {
    ...baseReport.validation,
    ...(overrides.validation ?? {}),
    checks: overrides.validation?.checks ?? baseReport.validation.checks,
    notes: overrides.validation?.notes ?? baseReport.validation.notes,
    summary: {
      ...baseReport.validation.summary,
      ...(overrides.validation?.summary ?? {}),
      disabled_variants:
        overrides.validation?.summary?.disabled_variants ?? baseReport.validation.summary.disabled_variants,
    },
    stress_test: {
      ...baseReport.validation.stress_test,
      ...(overrides.validation?.stress_test ?? {}),
      assertions:
        overrides.validation?.stress_test?.assertions ?? baseReport.validation.stress_test.assertions,
      guardrail_breach_counts:
        overrides.validation?.stress_test?.guardrail_breach_counts ??
        baseReport.validation.stress_test.guardrail_breach_counts,
      selection_counts:
        overrides.validation?.stress_test?.selection_counts ??
        baseReport.validation.stress_test.selection_counts,
      disabled_variants:
        overrides.validation?.stress_test?.disabled_variants ??
        baseReport.validation.stress_test.disabled_variants,
      episodes:
        overrides.validation?.stress_test?.episodes ?? baseReport.validation.stress_test.episodes,
    },
  },
});

describe("buildShadowGuardrailSummary", () => {
  it("marks guardrails as clear when validation passes", () => {
    const report = makeReport({
      diagnostics: { baseline_fraction: 0.25 },
      guardrail_violations: 0,
      validation: {
        checks: [
          { name: "baseline_fraction", value: 0.25, threshold: 0.2, status: true },
          { name: "guardrail_violations", value: 0, threshold: 2, status: true },
        ],
      },
    });

    const summary = buildShadowGuardrailSummary(report);
    expect(summary.badgeTone).toBe("pass");
    expect(summary.badgeLabel).toBe("Shadow gate clear");
    expect(summary.items[0]?.tone).toBe("pass");
    expect(summary.items[0]?.progress).toBeCloseTo(1);
  });

  it("surfaces critical baseline coverage when below threshold", () => {
    const report = makeReport({
      diagnostics: { baseline_fraction: 0.12 },
      guardrail_violations: 0,
      validation: {
        checks: [
          { name: "baseline_fraction", value: 0.12, threshold: 0.2, status: false },
          { name: "guardrail_violations", value: 0, threshold: 2, status: true },
        ],
      },
    });

    const summary = buildShadowGuardrailSummary(report);
    expect(summary.badgeTone).toBe("critical");
    const baseline = summary.items.find((item) => item.label === "Baseline coverage");
    expect(baseline?.tone).toBe("critical");
    expect(baseline?.progress).toBeCloseTo(0.6, 1);
    expect(summary.message).toContain("validation check");
  });

  it("treats non-zero guardrail breaches within limit as caution", () => {
    const report = makeReport({
      diagnostics: { baseline_fraction: 0.25 },
      guardrail_violations: 1,
      validation: {
        checks: [
          { name: "baseline_fraction", value: 0.25, threshold: 0.2, status: true },
          { name: "guardrail_violations", value: 1, threshold: 3, status: true },
        ],
      },
    });

    const summary = buildShadowGuardrailSummary(report);
    expect(summary.badgeTone).toBe("caution");
    const guardrail = summary.items.find((item) => item.label === "Guardrail breaches");
    expect(guardrail?.tone).toBe("caution");
    expect(guardrail?.progress).toBeCloseTo(1 - 1 / 3, 4);
    expect(summary.message).toContain("guardrail breach");
  });

  it("flags critical when guardrail breaches meet or exceed limit", () => {
    const report = makeReport({
      diagnostics: { baseline_fraction: 0.25 },
      guardrail_violations: 3,
      validation: {
        checks: [
          { name: "baseline_fraction", value: 0.25, threshold: 0.2, status: true },
          { name: "guardrail_violations", value: 3, threshold: 3, status: false },
        ],
      },
    });

    const summary = buildShadowGuardrailSummary(report);
    expect(summary.badgeTone).toBe("critical");
    const guardrail = summary.items.find((item) => item.label === "Guardrail breaches");
    expect(guardrail?.tone).toBe("critical");
    expect(guardrail?.progress).toBe(0);
  });
});
