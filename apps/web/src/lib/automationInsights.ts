import type { AuditLogEntry } from "../types/audit";
import type { GuardrailSegment } from "../types/dashboard";

export type AuditTimelineTone = "success" | "caution" | "critical" | "info";

export interface AutomationAuditTimelineItem {
  id: string;
  headline: string;
  detail?: string;
  actor: string;
  occurredAt: string;
  timeAgo: string;
  tone: AuditTimelineTone;
}

export interface GuardrailRiskSummary {
  healthyCount: number;
  watchCount: number;
  breachCount: number;
  risks: GuardrailSegment[];
}

export interface GuardrailPostureSegment {
  status: GuardrailSegment["status"];
  count: number;
  percentage: number;
}

export type GuardrailExecutiveStatus = "critical" | "caution" | "ready";

export interface GuardrailExecutiveSummary {
  status: GuardrailExecutiveStatus;
  headline: string;
  guidance: string;
  recommendation: string;
}

export function mapAutomationAuditLogs(
  logs: AuditLogEntry[],
  now: Date = new Date(),
): AutomationAuditTimelineItem[] {
  return logs.map((log) => {
    const occurredAt = new Date(log.created_at);
    const timeAgo = formatRelativeTime(occurredAt, now);
    const { headline, detail, tone } = describeAuditLog(log);
    return {
      id: String(log.id),
      headline,
      detail,
      actor: log.actor_id ?? (log.actor_type === "system" ? "WeatherVane" : "Unknown actor"),
      occurredAt: log.created_at,
      timeAgo,
      tone,
    };
  });
}

export function summarizeGuardrailRisks(guardrails: GuardrailSegment[]): GuardrailRiskSummary {
  if (!Array.isArray(guardrails) || guardrails.length === 0) {
    return { healthyCount: 0, watchCount: 0, breachCount: 0, risks: [] };
  }

  const counts = guardrails.reduce(
    (acc, segment) => {
      if (segment.status === "breach") {
        acc.breachCount += 1;
      } else if (segment.status === "watch") {
        acc.watchCount += 1;
      } else {
        acc.healthyCount += 1;
      }
      acc.all.push(segment);
      return acc;
    },
    {
      healthyCount: 0,
      watchCount: 0,
      breachCount: 0,
      all: [] as GuardrailSegment[],
    },
  );

  const risks = [...counts.all].sort((a, b) => {
    const severityRank = (status: GuardrailSegment["status"]) => {
      switch (status) {
        case "breach":
          return 0;
        case "watch":
          return 1;
        default:
          return 2;
      }
    };
    const severityDelta = severityRank(a.status) - severityRank(b.status);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    return Math.abs(b.delta_pct) - Math.abs(a.delta_pct);
  });

  return {
    healthyCount: counts.healthyCount,
    watchCount: counts.watchCount,
    breachCount: counts.breachCount,
    risks: risks.slice(0, 5),
  };
}

export function buildGuardrailPostureSegments(
  summary: GuardrailRiskSummary,
): GuardrailPostureSegment[] {
  const order: GuardrailSegment["status"][] = ["breach", "watch", "healthy"];
  const total = summary.breachCount + summary.watchCount + summary.healthyCount;
  if (total === 0) {
    return order.map((status) => ({ status, count: 0, percentage: 0 }));
  }
  return order.map((status) => {
    const count =
      status === "breach"
        ? summary.breachCount
        : status === "watch"
          ? summary.watchCount
          : summary.healthyCount;
    const percentage = count === 0 ? 0 : (count / total) * 100;
    return { status, count, percentage };
  });
}

export function describeGuardrailPosture(summary: GuardrailRiskSummary): string {
  const total = summary.breachCount + summary.watchCount + summary.healthyCount;
  if (total === 0) {
    return "No guardrail telemetry captured yet. Breach posture will appear after the next automation run.";
  }

  const firstMatch = (status: GuardrailSegment["status"]) =>
    summary.risks.find((risk) => risk.status === status);

  if (summary.breachCount > 0) {
    const topBreach = firstMatch("breach") ?? summary.risks[0];
    const breachLabel = summary.breachCount === 1 ? "breach" : "breaches";
    const focus =
      topBreach && topBreach.name ? ` Start with ${topBreach.name}.` : "";
    const watchNote =
      summary.watchCount > 0
        ? ` ${summary.watchCount} watch ${
            summary.watchCount === 1 ? "item" : "items"
          } also trending high.`
        : "";
    return `${summary.breachCount} guardrail ${breachLabel} require attention.${focus}${watchNote}`.trim();
  }

  if (summary.watchCount > 0) {
    const topWatch = firstMatch("watch") ?? summary.risks[0];
    const watchLabel = summary.watchCount === 1 ? "item" : "items";
    const focus =
      topWatch && topWatch.name ? ` Focus on ${topWatch.name} first.` : "";
    const healthyNote =
      summary.healthyCount > 0
        ? ` ${summary.healthyCount} guardrail${summary.healthyCount === 1 ? "" : "s"} are holding steady.`
        : "";
    return `${summary.watchCount} guardrail watch ${watchLabel} need follow-up.${focus}${healthyNote}`.trim();
  }

  const healthyLabel = summary.healthyCount === 1 ? "guardrail" : "guardrails";
  return `Guardrails holding steady — ${summary.healthyCount} ${healthyLabel} healthy.`;
}

export function buildGuardrailExecutiveSummary(
  summary: GuardrailRiskSummary,
): GuardrailExecutiveSummary {
  const totalSignals = summary.breachCount + summary.watchCount + summary.healthyCount;
  const topBreach = summary.risks.find((risk) => risk.status === "breach");
  const topWatch = summary.risks.find((risk) => risk.status === "watch");

  if (summary.breachCount > 0) {
    const breachesLabel =
      summary.breachCount === 1 ? "1 guardrail breach" : `${summary.breachCount} guardrail breaches`;
    const watchNote =
      summary.watchCount > 0
        ? ` ${summary.watchCount} watch ${summary.watchCount === 1 ? "item" : "items"} trending hot.`
        : "";
    return {
      status: "critical",
      headline: `${breachesLabel} blocking Automation engine`,
      guidance:
        describePrimaryRisk(topBreach) ??
        "Resolve guardrail breaches before re-enabling Automation engine.",
      recommendation: `Assign owners to restore coverage and document mitigation.${watchNote}`.trim(),
    };
  }

  if (totalSignals === 0) {
    return {
      status: "caution",
      headline: "Awaiting guardrail telemetry",
      guidance: "No guardrail signals captured yet; Automation engine lacks production coverage.",
      recommendation:
        "Run a dry-run or manual scenario to populate guardrail telemetry before the next exec review.",
    };
  }

  if (summary.watchCount > 0) {
    const watchLabel =
      summary.watchCount === 1 ? "1 guardrail in watch" : `${summary.watchCount} guardrails in watch`;
    const healthyTail =
      summary.healthyCount > 0
        ? ` ${summary.healthyCount} guardrail${summary.healthyCount === 1 ? "" : "s"} healthy.`
        : "";
    return {
      status: "caution",
      headline: `${watchLabel} before Automation engine`,
      guidance:
        describePrimaryRisk(topWatch) ??
        "Monitor watch items closely before enabling Automation engine.",
      recommendation: `Confirm watch thresholds and owner sign-off before the next activation window.${healthyTail}`.trim(),
    };
  }

  return {
    status: "ready",
    headline: "Guardrails ready for Automation engine",
    guidance: `${summary.healthyCount} guardrail${summary.healthyCount === 1 ? "" : "s"} healthy with no active warnings.`,
    recommendation: "Capture exec sign-off and schedule the Automation engine activation window.",
  };
}

function describeAuditLog(log: AuditLogEntry): {
  headline: string;
  detail?: string;
  tone: AuditTimelineTone;
} {
  const action = log.action.toLowerCase();
  const payload = (log.payload ?? {}) as Record<string, unknown>;

  if (action === "automation.settings.updated") {
    return describeSettingsUpdate(payload);
  }

  if (action.startsWith("privacy.request.")) {
    const requestType = action.split(".").pop();
    const requestedBy = typeof payload.requested_by === "string" ? payload.requested_by : log.actor_id;
    return {
      headline: `Data ${requestType} requested`,
      detail: requestedBy ? `Requested by ${requestedBy}` : undefined,
      tone: "info",
    };
  }

  if (action.includes("guardrail") && action.includes("breach")) {
    const guardrailRaw = payload.guardrail ?? payload.name ?? payload.top_guardrail;
    const label = typeof guardrailRaw === "string" ? guardrailRaw : "Guardrail";
    return {
      headline: `${label} breach logged`,
      detail: typeof payload.message === "string" ? payload.message : undefined,
      tone: "critical",
    };
  }

  return {
    headline: action.replace(/\./g, " "),
    detail: typeof payload.message === "string" ? payload.message : undefined,
    tone: "info",
  };
}

function describeSettingsUpdate(payload: Record<string, unknown>): {
  headline: string;
  detail?: string;
  tone: AuditTimelineTone;
} {
  const changes = (payload.changes ?? payload) as Record<string, unknown>;
  const modeChange = extractBeforeAfter(changes, "mode");
  const consentChange = extractBeforeAfter(changes, "consent_status");

  if (modeChange && consentChange) {
    return {
      headline: `Mode ${modeChange.before ?? ""} → ${modeChange.after ?? ""}`.trim(),
      detail: `Consent ${consentChange.before ?? ""} → ${consentChange.after ?? ""}`.trim() || undefined,
      tone: toneForMode(modeChange.after),
    };
  }

  if (modeChange) {
    return {
      headline: `Mode ${modeChange.before ?? ""} → ${modeChange.after ?? ""}`.trim(),
      tone: toneForMode(modeChange.after),
    };
  }

  if (consentChange) {
    return {
      headline: `Consent ${consentChange.before ?? ""} → ${consentChange.after ?? ""}`.trim(),
      tone: toneForConsent(consentChange.after),
    };
  }

  return {
    headline: "Automation settings updated",
    tone: "info",
  };
}

function extractBeforeAfter(
  payload: Record<string, unknown>,
  key: string,
): { before: string | null; after: string | null } | null {
  const entry = payload[key];
  if (
    entry &&
    typeof entry === "object" &&
    "before" in entry &&
    "after" in entry &&
    entry.before !== entry.after
  ) {
    return {
      before: normaliseValue(entry.before),
      after: normaliseValue(entry.after),
    };
  }
  return null;
}

function normaliseValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    const inner = (value as Record<string, unknown>).value;
    return typeof inner === "string" ? inner : JSON.stringify(inner);
  }
  return String(value);
}

function toneForMode(mode: string | null): AuditTimelineTone {
  if (!mode) {
    return "info";
  }
  const value = mode.toLowerCase();
  if (value === "automation") {
    return "success";
  }
  if (value === "assist") {
    return "info";
  }
  return "caution";
}

function toneForConsent(consent: string | null): AuditTimelineTone {
  if (!consent) {
    return "info";
  }
  const value = consent.toLowerCase();
  if (value === "granted") {
    return "success";
  }
  if (value === "revoked") {
    return "critical";
  }
  return "info";
}

function formatRelativeTime(date: Date, now: Date): string {
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.max(Math.round(diffMs / 60000), 0);

  if (diffMinutes < 1) {
    return "Just now";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks < 4) {
    return `${diffWeeks}w ago`;
  }
  const diffMonths = Math.round(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function describePrimaryRisk(risk: GuardrailSegment | undefined): string | undefined {
  if (!risk) {
    return undefined;
  }
  const label =
    typeof risk.name === "string" && risk.name.trim().length > 0 ? risk.name : "Primary guardrail";
  const delta = risk.delta_pct;
  if (!Number.isFinite(delta)) {
    return `${label} requires manual review — telemetry unavailable.`;
  }
  const deltaMagnitude = Math.round(Math.abs(delta));
  if (deltaMagnitude === 0) {
    return `${label} is hovering at target — confirm signal quality before re-enabling Automation engine.`;
  }
  const direction = delta > 0 ? "above" : "below";
  return `${label} is ${deltaMagnitude}% ${direction} target.`;
}
