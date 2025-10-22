import type { AutomationAuditPreview } from "../demo/onboarding";
import type { GuardrailSegment } from "../types/dashboard";

import { evaluateAutomationAuditSignals, type TrustTone } from "./automationTrust";
import {
  describeGuardrailPosture,
  summarizeGuardrailRisks,
} from "./automationInsights";
import { describeOnboardingFallback } from "./onboardingFallback";

export interface AutomationReadinessSignals {
  pendingApprovals: number;
  overdueApprovals: number;
  guardrailBreaches: number;
  guardrailWatch: number;
  hasTelemetry: boolean;
  latestApprovedMinutes: number | null;
  latestPendingMinutes: number | null;
  telemetryAgeMinutes: number | null;
  totalAudits: number;
}

export interface AutomationReadinessSnapshot {
  tone: TrustTone;
  score: number;
  headline: string;
  subline: string;
  nextAction: string;
  signals: AutomationReadinessSignals;
}

const MAX_SCORE = 100;
const MIN_SCORE = 0;
export const TELEMETRY_WARNING_MINUTES = 6 * 60;
export const TELEMETRY_CRITICAL_MINUTES = 12 * 60;

type TelemetryRecency = "missing" | "unknown" | "fresh" | "warning" | "critical";

function clampScore(value: number): number {
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(value)));
}

function formatIssueList(issues: string[]): string {
  if (issues.length === 0) {
    return "no outstanding blockers";
  }
  if (issues.length === 1) {
    return issues[0];
  }
  if (issues.length === 2) {
    return `${issues[0]} and ${issues[1]}`;
  }
  return `${issues.slice(0, issues.length - 1).join(", ")}, and ${issues.at(-1)}`;
}

function computeTelemetryAgeMinutes(timestamp: string | null | undefined, now: Date): number | null {
  if (!timestamp) {
    return null;
  }
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const diff = now.getTime() - parsed.getTime();
  if (!Number.isFinite(diff) || diff < 0) {
    return 0;
  }
  return Math.round(diff / 60000);
}

function classifyTelemetryRecency(hasTelemetry: boolean, ageMinutes: number | null): TelemetryRecency {
  if (!hasTelemetry) {
    return "missing";
  }
  if (ageMinutes === null) {
    return "unknown";
  }
  if (ageMinutes >= TELEMETRY_CRITICAL_MINUTES) {
    return "critical";
  }
  if (ageMinutes >= TELEMETRY_WARNING_MINUTES) {
    return "warning";
  }
  return "fresh";
}

function formatTelemetryDuration(ageMinutes: number): string {
  if (ageMinutes < 1) {
    return "just captured";
  }
  if (ageMinutes < 60) {
    return `${Math.round(ageMinutes)}m`;
  }
  if (ageMinutes < 1440) {
    return `${Math.round(ageMinutes / 60)}h`;
  }
  return `${Math.round(ageMinutes / 1440)}d`;
}

export function buildAutomationReadinessSnapshot(
  audits: AutomationAuditPreview[] | undefined,
  guardrails: GuardrailSegment[] | undefined,
  options?: {
    guardrailGeneratedAt?: string | null;
    now?: Date;
    isFallback?: boolean;
    fallbackReason?: string | null;
  },
): AutomationReadinessSnapshot {
  const guardrailSummary = summarizeGuardrailRisks(Array.isArray(guardrails) ? guardrails : []);
  const auditSignals = evaluateAutomationAuditSignals(audits);
  const hasTelemetry =
    guardrailSummary.breachCount + guardrailSummary.watchCount + guardrailSummary.healthyCount > 0;
  const now = options?.now ?? new Date();
  const telemetryAgeMinutes = computeTelemetryAgeMinutes(options?.guardrailGeneratedAt, now);
  const telemetryRecency = classifyTelemetryRecency(hasTelemetry, telemetryAgeMinutes);
  const pendingNonOverdue = Math.max(0, auditSignals.pendingCount - auditSignals.overdueCount);

  let score = MAX_SCORE;
  if (!hasTelemetry) {
    score -= 15;
  } else if (telemetryRecency === "unknown") {
    score -= 10;
  } else if (telemetryRecency === "critical") {
    score -= 25;
  } else if (telemetryRecency === "warning") {
    score -= 15;
  }
  if (!auditSignals.hasAudits) {
    score -= 10;
  }
  score -= guardrailSummary.breachCount * 30;
  score -= guardrailSummary.watchCount * 15;
  score -= pendingNonOverdue * 15;
  score -= auditSignals.overdueCount * 35;

  const issues: string[] = [];
  if (auditSignals.overdueCount > 0) {
    issues.push(
      `${auditSignals.overdueCount} overdue approval${auditSignals.overdueCount === 1 ? "" : "s"}`,
    );
  }
  if (guardrailSummary.breachCount > 0) {
    issues.push(
      `${guardrailSummary.breachCount} guardrail breach${guardrailSummary.breachCount === 1 ? "" : "es"}`,
    );
  }
  if (!hasTelemetry) {
    issues.push("guardrail telemetry missing");
  } else if (telemetryRecency === "unknown") {
    issues.push("guardrail telemetry timestamp missing");
  } else if (telemetryRecency === "critical" || telemetryRecency === "warning") {
    if (telemetryAgeMinutes !== null) {
      issues.push(`guardrail telemetry ${formatTelemetryDuration(telemetryAgeMinutes)} old`);
    }
  }
  if (pendingNonOverdue > 0) {
    issues.push(
      `${pendingNonOverdue} pending approval${pendingNonOverdue === 1 ? "" : "s"}`,
    );
  }
  if (guardrailSummary.watchCount > 0) {
    issues.push(
      `${guardrailSummary.watchCount} guardrail watch ${guardrailSummary.watchCount === 1 ? "item" : "items"}`,
    );
  }

  let tone: TrustTone;
  if (
    auditSignals.overdueCount > 0 ||
    guardrailSummary.breachCount > 0 ||
    telemetryRecency === "critical"
  ) {
    tone = "critical";
  } else if (!hasTelemetry) {
    tone = auditSignals.hasAudits ? "caution" : "info";
  } else if (
    pendingNonOverdue > 0 ||
    guardrailSummary.watchCount > 0 ||
    telemetryRecency === "warning" ||
    telemetryRecency === "unknown"
  ) {
    tone = "caution";
  } else if (!auditSignals.hasAudits) {
    tone = "info";
  } else {
    tone = "success";
  }

  const postureCopy = describeGuardrailPosture(guardrailSummary);
  const approvalCopy =
    auditSignals.pendingCount === 0
      ? "No approvals waiting in the queue."
      : auditSignals.overdueCount > 0
        ? `${auditSignals.pendingCount} approvals queued with ${auditSignals.overdueCount} past the review window.`
        : `${auditSignals.pendingCount} approvals pending; all still within the review window.`;
  let telemetryCopy = "";
  if (!hasTelemetry) {
    telemetryCopy =
      "Guardrail telemetry not captured yet — rely on rehearsal evidence before allowing automation to run.";
  } else if (telemetryRecency === "unknown") {
    telemetryCopy =
      "Guardrail telemetry timestamp missing — rerun guardrail export to refresh signals.";
  } else if (telemetryRecency === "critical" && telemetryAgeMinutes !== null) {
    telemetryCopy = `Guardrail telemetry ${formatTelemetryDuration(
      telemetryAgeMinutes,
    )} old — refresh before turning automation back on.`;
  } else if (telemetryRecency === "warning" && telemetryAgeMinutes !== null) {
    telemetryCopy = `Guardrail telemetry ${formatTelemetryDuration(
      telemetryAgeMinutes,
    )} old; schedule a rehearsal to refresh signals.`;
  }

  let headline: string;
  let subline: string;
  let nextAction: string;

  if (tone === "critical") {
    headline = `Automation blocked — ${formatIssueList(issues.slice(0, 2))}`;
    subline = [postureCopy, approvalCopy, telemetryCopy].filter(Boolean).join(" ");
    nextAction =
      auditSignals.overdueCount > 0
        ? "Escalate overdue approvals to Director Dana and unblock the review queue before resuming automation."
        : guardrailSummary.breachCount > 0
          ? "Resolve guardrail breaches and capture mitigation evidence before re-enabling automation."
          : "Refresh guardrail telemetry immediately — run a rehearsal or live sync before re-enabling automation.";
  } else if (tone === "caution") {
    const focus = issues.length
      ? `Focus on ${formatIssueList(issues.slice(0, 2))}.`
      : "Confirm telemetry and approvals before allowing automation to proceed.";
    headline = `Automation waiting — ${formatIssueList(issues.slice(0, 2))}`;
    subline = [postureCopy, approvalCopy, telemetryCopy].filter(Boolean).join(" ");
    nextAction =
      telemetryRecency === "warning" || telemetryRecency === "unknown"
        ? "Refresh guardrail telemetry with a rehearsal and pair with the review owner before enabling automation."
        : `${focus} Pair with the review owner to keep the activation window on track.`;
  } else if (tone === "info") {
    headline = "Automation readiness awaiting telemetry";
    subline = [postureCopy, telemetryCopy || approvalCopy].filter(Boolean).join(" ");
    nextAction =
      "Run a rehearsal to capture guardrail telemetry and log the next approval to build trust signals.";
  } else {
    headline = "Automation ready — guardrails holding steady";
    subline = `${postureCopy} ${approvalCopy}`.trim();
    nextAction = "Capture exec sign-off, notify Director Dana, and schedule the automation activation window.";
  }

  const fallbackActive = Boolean(options?.isFallback);
  const fallbackCopy = fallbackActive
    ? describeOnboardingFallback(options?.fallbackReason ?? null)
    : null;

  if (fallbackCopy) {
    score = clampScore(Math.min(score, fallbackCopy.scoreCap));

    if (tone !== "critical") {
      if (fallbackCopy.tone === "caution") {
        tone = "caution";
      } else if (tone === "success") {
        tone = "info";
      }
    }

    const baseHeadline = headline;
    const baseSubline = subline;
    const baseNextAction = nextAction;

    headline = fallbackCopy.title;

    const fallbackSublinePieces: string[] = [fallbackCopy.summary];
    if (baseSubline) {
      fallbackSublinePieces.push(baseSubline);
    } else if (baseHeadline && baseHeadline !== fallbackCopy.title) {
      fallbackSublinePieces.push(baseHeadline);
    }
    subline = fallbackSublinePieces.join(" ");

    const nextActionPieces = [fallbackCopy.action];
    if (baseNextAction) {
      nextActionPieces.push(baseNextAction);
    }
    nextAction = nextActionPieces.join(" ");
  }

  return {
    tone,
    score: clampScore(score),
    headline,
    subline,
    nextAction,
    signals: {
      pendingApprovals: auditSignals.pendingCount,
      overdueApprovals: auditSignals.overdueCount,
      guardrailBreaches: guardrailSummary.breachCount,
      guardrailWatch: guardrailSummary.watchCount,
      hasTelemetry,
      latestApprovedMinutes: auditSignals.latestApprovedMinutes,
      latestPendingMinutes: auditSignals.latestPendingMinutes,
      telemetryAgeMinutes,
      totalAudits: Array.isArray(audits) ? audits.length : 0,
    },
  };
}
