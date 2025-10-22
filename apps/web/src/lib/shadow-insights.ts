import type { ShadowRunReport, ShadowValidationCheck } from "../types/allocator";

const EPSILON = 1e-6;

type Tone = "pass" | "caution" | "critical";

export interface ShadowGuardrailSummaryItem {
  label: string;
  detail: string;
  progress: number;
  tone: Tone;
}

export interface ShadowGuardrailSummary {
  badgeTone: Tone;
  badgeLabel: string;
  message: string;
  items: ShadowGuardrailSummaryItem[];
}

const clampProgress = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
};

const toPercent = (value: number | undefined): string => {
  if (value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
};

const normaliseLabel = (label: string): string =>
  label
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const findCheck = (checks: ShadowValidationCheck[], name: string): ShadowValidationCheck | undefined =>
  checks.find((check) => check.name === name);

export function buildShadowGuardrailSummary(report: ShadowRunReport): ShadowGuardrailSummary {
  const validationChecks = report.validation?.checks ?? [];
  const baselineCheck = findCheck(validationChecks, "baseline_fraction");
  const guardrailCheck = findCheck(validationChecks, "guardrail_violations");

  const baselineFraction = typeof report.diagnostics?.baseline_fraction === "number" ? report.diagnostics.baseline_fraction : baselineCheck?.value;
  const baselineThreshold = typeof baselineCheck?.threshold === "number" ? baselineCheck.threshold : undefined;
  const baselinePass =
    typeof baselineFraction === "number" &&
    (baselineThreshold === undefined || baselineFraction + EPSILON >= baselineThreshold);

  const guardrailViolations = typeof report.guardrail_violations === "number" ? report.guardrail_violations : guardrailCheck?.value ?? 0;
  const guardrailLimit =
    typeof guardrailCheck?.threshold === "number"
      ? guardrailCheck.threshold
      : typeof report.config?.max_guardrail_breaches === "number"
        ? (report.config.max_guardrail_breaches as number)
        : undefined;

  const guardrailTone: Tone =
    guardrailViolations <= 0
      ? "pass"
      : guardrailLimit !== undefined && guardrailViolations < guardrailLimit
        ? "caution"
        : "critical";

  const guardrailProgress =
    guardrailLimit && guardrailLimit > 0
      ? clampProgress(1 - guardrailViolations / guardrailLimit)
      : guardrailViolations <= 0
        ? 1
        : 0;

  const baselineProgress =
    typeof baselineFraction === "number" && baselineThreshold && baselineThreshold > 0
      ? clampProgress(baselineFraction / baselineThreshold)
      : baselinePass
        ? 1
        : 0;

  const baselineDetail =
    typeof baselineFraction === "number" && baselineThreshold !== undefined
      ? `${toPercent(baselineFraction)} · Min ${toPercent(baselineThreshold)}`
      : baselinePass
        ? "Baseline coverage within guardrail"
        : "Baseline coverage needs review";

  const guardrailDetail =
    guardrailLimit !== undefined ? `${guardrailViolations} of ${guardrailLimit} breaches` : `${guardrailViolations} guardrail breaches`;

  const failingChecks = validationChecks.filter((check) => check.status === false);
  const failingLabels = failingChecks.map((check) => normaliseLabel(check.name));

  const badgeTone: Tone =
    failingChecks.length === 0 && guardrailTone === "pass"
      ? "pass"
      : guardrailTone === "critical" || failingChecks.some((check) => check.status === false)
        ? "critical"
        : "caution";

  const badgeLabel =
    badgeTone === "pass" ? "Shadow gate clear" : badgeTone === "caution" ? "Needs attention" : "Action required";

  const attentionReasons: string[] = [];
  if (failingLabels.length > 0) {
    attentionReasons.push(`${failingLabels.length} validation check${failingLabels.length === 1 ? "" : "s"} (${failingLabels.join(", ")})`);
  }

  if (guardrailViolations > 0) {
    attentionReasons.push(
      `${guardrailViolations} guardrail breach${guardrailViolations === 1 ? "" : "es"}${
        guardrailLimit !== undefined ? ` (limit ${guardrailLimit})` : ""
      }`,
    );
  }

  if ((report.disabled_variants ?? []).length > 0) {
    attentionReasons.push(`${report.disabled_variants.length} disabled variant${report.disabled_variants.length === 1 ? "" : "s"}`);
  }

  const message =
    attentionReasons.length === 0
      ? "Validation and stress tests passed guardrail checks. Safe to continue shadow exploration."
      : `Resolve ${attentionReasons.join(" and ")} before expanding live exploration.`;

  const items: ShadowGuardrailSummaryItem[] = [];
  items.push({
    label: "Baseline coverage",
    detail: baselineDetail,
    progress: baselineProgress,
    tone: baselinePass ? "pass" : "critical",
  });

  items.push({
    label: "Guardrail breaches",
    detail: guardrailDetail,
    progress: guardrailProgress,
    tone: guardrailTone,
  });

  return {
    badgeTone,
    badgeLabel,
    message,
    items,
  };
}

export type { Tone as ShadowGuardrailTone };
