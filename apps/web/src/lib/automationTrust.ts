import type { AutomationAuditPreview, AutomationAuditStatus } from "../demo/onboarding";

export type TrustTone = "success" | "caution" | "info";

export interface AutomationTrustMetric {
  id: string;
  label: string;
  value: string;
  tone: TrustTone;
}

export interface AutomationTrustSummary {
  tone: TrustTone;
  headline: string;
  subline: string;
  nextAction?: string;
  metrics: AutomationTrustMetric[];
}

const REVIEW_WINDOW_HOURS = 24;
const REVIEW_WINDOW_MINUTES = REVIEW_WINDOW_HOURS * 60;

const DEFAULT_SUMMARY: AutomationTrustSummary = {
  tone: "info",
  headline: "Awaiting first WeatherVane change",
  subline:
    "WeatherVane will publish the story, evidence, and next step here once Automation engine ships or requests your review.",
  metrics: [
    { id: "approved", label: "Shipped", value: "0", tone: "info" },
    { id: "pending", label: "Needs review", value: "0", tone: "info" },
    { id: "shadow", label: "Rehearsals", value: "0", tone: "info" },
  ],
};

export type AutomationAuditFilter = AutomationAuditStatus | "all";

export function selectDefaultAutomationAuditFilter(
  audits: AutomationAuditPreview[],
): AutomationAuditFilter {
  if (audits.some((audit) => audit.status === "pending")) {
    return "pending";
  }
  if (audits.length === 0) {
    return "all";
  }
  return "all";
}

function countStatus(audits: AutomationAuditPreview[], status: AutomationAuditStatus): number {
  return audits.reduce((count, audit) => (audit.status === status ? count + 1 : count), 0);
}

function parseMinutesFromRelative(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const normalised = value.trim().toLowerCase();
  if (!normalised) {
    return null;
  }
  if (normalised === "just now") {
    return 0;
  }
  const match = normalised.match(/(\d+(\.\d+)?)/);
  if (!match) {
    return null;
  }
  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }
  if (/\bweek/.test(normalised) || normalised.endsWith("w") || /\dw\b/.test(normalised)) {
    return Math.round(amount * 7 * 24 * 60);
  }
  if (/\bday/.test(normalised) || normalised.endsWith("d") || /\dd\b/.test(normalised)) {
    return Math.round(amount * 24 * 60);
  }
  if (
    /\bhour/.test(normalised) ||
    /\bhr/.test(normalised) ||
    normalised.endsWith("h") ||
    /\dh\b/.test(normalised)
  ) {
    return Math.round(amount * 60);
  }
  if (/\bmin/.test(normalised) || normalised.endsWith("m") || /\dm\b/.test(normalised)) {
    return Math.round(amount);
  }
  return null;
}

function resolveMinutesAgo(audit: AutomationAuditPreview): number | null {
  if (typeof audit.minutesAgo === "number" && Number.isFinite(audit.minutesAgo)) {
    return audit.minutesAgo;
  }
  return parseMinutesFromRelative(audit.timeAgo);
}

function formatPendingAge(minutes: number): string {
  if (minutes >= 24 * 60) {
    const days = Math.round(minutes / (24 * 60));
    return `${days}d`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function buildMetrics(
  audits: AutomationAuditPreview[],
  approvedCount: number,
  pendingCount: number,
  shadowCount: number,
): AutomationTrustMetric[] {
  const total = audits.length;
  const shippedTone: TrustTone = approvedCount > 0 ? "success" : total > 0 ? "info" : "info";
  const pendingTone: TrustTone = pendingCount > 0 ? "caution" : total > 0 ? "info" : "info";
  const rehearsalTone: TrustTone = shadowCount > 0 ? "info" : total > 0 ? "success" : "info";

  return [
    {
      id: "approved",
      label: "Shipped",
      value: String(approvedCount),
      tone: shippedTone,
    },
    {
      id: "pending",
      label: "Needs review",
      value: String(pendingCount),
      tone: pendingTone,
    },
    {
      id: "shadow",
      label: "Rehearsals",
      value: String(shadowCount),
      tone: rehearsalTone,
    },
  ];
}

function selectLatestByStatus(
  audits: AutomationAuditPreview[],
  status: AutomationAuditStatus,
): AutomationAuditPreview | undefined {
  let latest: { audit: AutomationAuditPreview; minutes: number | null } | undefined;
  for (const audit of audits) {
    if (audit.status !== status) {
      continue;
    }
    const minutes = resolveMinutesAgo(audit);
    if (!latest) {
      latest = { audit, minutes };
      continue;
    }
    if (minutes === null && latest.minutes === null) {
      continue;
    }
    if (minutes === null) {
      continue;
    }
    if (latest.minutes === null || minutes < latest.minutes) {
      latest = { audit, minutes };
    }
  }
  return latest?.audit;
}

export interface AutomationAuditSignals {
  approvedCount: number;
  pendingCount: number;
  shadowCount: number;
  overdueCount: number;
  latestApprovedMinutes: number | null;
  latestPendingMinutes: number | null;
  hasAudits: boolean;
}

export function filterAutomationAudits(
  audits: AutomationAuditPreview[],
  filter: AutomationAuditFilter,
): AutomationAuditPreview[] {
  if (filter === "all") {
    return audits;
  }
  return audits.filter((audit) => audit.status === filter);
}

export function evaluateAutomationAuditSignals(
  audits: AutomationAuditPreview[] | undefined,
): AutomationAuditSignals {
  const list = Array.isArray(audits) ? audits : [];
  const approvedCount = countStatus(list, "approved");
  const pendingCount = countStatus(list, "pending");
  const shadowCount = countStatus(list, "shadow");
  const overdueCount = list.filter((audit) => isPendingAuditOverdue(audit)).length;
  const latestApproved = selectLatestByStatus(list, "approved");
  const latestPending = selectLatestByStatus(list, "pending");

  return {
    approvedCount,
    pendingCount,
    shadowCount,
    overdueCount,
    latestApprovedMinutes: latestApproved ? resolveMinutesAgo(latestApproved) ?? null : null,
    latestPendingMinutes: latestPending ? resolveMinutesAgo(latestPending) ?? null : null,
    hasAudits: list.length > 0,
  };
}

function buildPendingSummary(
  audits: AutomationAuditPreview[],
  metrics: AutomationTrustMetric[],
  pendingCount: number,
): AutomationTrustSummary {
  const latestPending = selectLatestByStatus(audits, "pending");
  const pendingAudits = audits.filter((audit) => audit.status === "pending");
  const overdueAudits = pendingAudits
    .map((audit) => ({
      audit,
      minutes: resolveMinutesAgo(audit),
    }))
    .filter(
      (entry): entry is { audit: AutomationAuditPreview; minutes: number } =>
        entry.minutes !== null && entry.minutes >= REVIEW_WINDOW_MINUTES,
    );
  const overdueCount = overdueAudits.length;
  const headline =
    overdueCount > 0
      ? overdueCount === 1
        ? "1 approval overdue — Automation engine still waiting"
        : `${overdueCount} approvals overdue — Automation engine still waiting`
      : pendingCount === 1
        ? "1 change needs your approval"
        : `${pendingCount} changes need your approval`;

  const why = latestPending?.narrative?.why ?? latestPending?.detail;
  let subline =
    why ??
    "WeatherVane is holding recent moves until an approver signs off. Guardrails are still protecting live spend.";

  let nextStep =
    latestPending?.narrative?.nextStep ??
    `Approve or request changes within ${REVIEW_WINDOW_HOURS}h to keep Automation engine on schedule.`;

  if (overdueCount > 0) {
    const mostOverdue = overdueAudits.reduce((current, candidate) =>
      candidate.minutes > current.minutes ? candidate : current,
    );
    const pendingAge = formatPendingAge(mostOverdue.minutes);
    const overdueWhy = mostOverdue.audit.narrative?.why ?? mostOverdue.audit.detail;
    subline = overdueWhy
      ? `${overdueWhy} WeatherVane has held this change ${pendingAge} past the ${REVIEW_WINDOW_HOURS}h review window.`
      : `WeatherVane has held the pending change ${pendingAge} past the ${REVIEW_WINDOW_HOURS}h review window.`;

    const escalationNote =
      "Escalate to Director Dana or delegate backup coverage so Automation engine can resume safely.";
    if (mostOverdue.audit.narrative?.nextStep) {
      nextStep = `${mostOverdue.audit.narrative.nextStep} ${escalationNote}`;
    } else if (latestPending?.narrative?.nextStep && latestPending.id !== mostOverdue.audit.id) {
      nextStep = `${latestPending.narrative.nextStep} ${escalationNote}`;
    } else {
      nextStep = `Assign an approver immediately. ${escalationNote}`;
    }
  }

  return {
    tone: "caution",
    headline,
    subline,
    nextAction: nextStep,
    metrics,
  };
}

function buildApprovedSummary(
  audits: AutomationAuditPreview[],
  metrics: AutomationTrustMetric[],
  approvedCount: number,
  shadowCount: number,
): AutomationTrustSummary {
  const latestApproved = selectLatestByStatus(audits, "approved");
  const nextShadow = selectLatestByStatus(audits, "shadow");

  const headline =
    approvedCount === 1 ? "Automation engine shipped 1 change" : `Automation engine shipped ${approvedCount} changes`;

  const sublineParts: string[] = [];
  if (latestApproved?.narrative?.impact) {
    sublineParts.push(latestApproved.narrative.impact);
  } else if (latestApproved?.narrative?.impactContext) {
    sublineParts.push(latestApproved.narrative.impactContext);
  } else {
    sublineParts.push("Guardrails held steady and the move stayed inside the safety band.");
  }
  if (latestApproved?.timeAgo) {
    sublineParts.push(`Last shipped ${latestApproved.timeAgo}.`);
  }
  if (shadowCount > 0 && nextShadow?.narrative?.nextStep) {
    sublineParts.push(nextShadow.narrative.nextStep);
  }

  return {
    tone: "success",
    headline,
    subline: sublineParts.join(" "),
    metrics,
  };
}

function buildShadowSummary(
  audits: AutomationAuditPreview[],
  metrics: AutomationTrustMetric[],
  shadowCount: number,
): AutomationTrustSummary {
  const latestShadow = selectLatestByStatus(audits, "shadow");
  const headline =
    shadowCount === 1
      ? "Shadow rehearsal ready for promotion"
      : `${shadowCount} shadow rehearsals ready for promotion`;

  const subline =
    latestShadow?.narrative?.impactContext ??
    "Rehearsals prove the rollback path and retention hooks before Automation engine ships live changes.";

  const nextAction =
    latestShadow?.narrative?.nextStep ??
    "Promote the rehearsal once manual spot checks align with expectations.";

  return {
    tone: "info",
    headline,
    subline,
    nextAction,
    metrics,
  };
}

export function buildAutomationTrustSummary(
  audits: AutomationAuditPreview[] | undefined,
): AutomationTrustSummary {
  if (!audits || audits.length === 0) {
    return DEFAULT_SUMMARY;
  }

  const approvedCount = countStatus(audits, "approved");
  const pendingCount = countStatus(audits, "pending");
  const shadowCount = countStatus(audits, "shadow");

  const metrics = buildMetrics(audits, approvedCount, pendingCount, shadowCount);

  if (pendingCount > 0) {
    return buildPendingSummary(audits, metrics, pendingCount);
  }

  if (approvedCount > 0) {
    return buildApprovedSummary(audits, metrics, approvedCount, shadowCount);
  }

  return buildShadowSummary(audits, metrics, shadowCount);
}

export function isPendingAuditOverdue(audit: AutomationAuditPreview): boolean {
  if (audit.status !== "pending") {
    return false;
  }
  const minutes = resolveMinutesAgo(audit);
  return minutes !== null && minutes >= REVIEW_WINDOW_MINUTES;
}
