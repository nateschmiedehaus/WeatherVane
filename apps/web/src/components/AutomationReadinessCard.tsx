import styles from "./automation-readiness-card.module.css";

import {
  TELEMETRY_CRITICAL_MINUTES,
  TELEMETRY_WARNING_MINUTES,
  type AutomationReadinessSnapshot,
} from "../lib/automationReadiness";

interface AutomationReadinessCardProps {
  snapshot: AutomationReadinessSnapshot;
  loading?: boolean;
}

function formatMinutesAgo(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) {
    return "—";
  }
  if (minutes < 1) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${Math.round(minutes)}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatTelemetryAge(minutes: number | null, hasTelemetry: boolean): string {
  if (!hasTelemetry) {
    return "Missing";
  }
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) {
    return "Unknown";
  }
  if (minutes < 1) {
    return "Fresh";
  }
  if (minutes < 60) {
    return `${Math.round(minutes)}m old`;
  }
  if (minutes < 1440) {
    return `${Math.round(minutes / 60)}h old`;
  }
  return `${Math.round(minutes / 1440)}d old`;
}

function telemetryTone(
  telemetryAgeMinutes: number | null,
  hasTelemetry: boolean,
): "success" | "caution" | "critical" | "info" {
  if (!hasTelemetry) {
    return "caution";
  }
  if (telemetryAgeMinutes === null || !Number.isFinite(telemetryAgeMinutes)) {
    return "caution";
  }
  if (telemetryAgeMinutes >= TELEMETRY_CRITICAL_MINUTES) {
    return "critical";
  }
  if (telemetryAgeMinutes >= TELEMETRY_WARNING_MINUTES) {
    return "caution";
  }
  return "success";
}

const TONE_BADGE: Record<string, "success" | "caution" | "critical" | "info"> = {
  success: "success",
  caution: "caution",
  critical: "critical",
  info: "info",
};

export function AutomationReadinessCard({ snapshot, loading = false }: AutomationReadinessCardProps) {
  const badgeTone = TONE_BADGE[snapshot.tone] ?? "info";
  const { signals } = snapshot;

  return (
    <section
      className={`${styles.container} ds-surface-panel ds-transition`}
      data-tone={snapshot.tone}
      aria-live="polite"
    >
      <header className={styles.header}>
        <div>
          <h5 className="ds-subtitle">Automation readiness</h5>
          <p className="ds-caption">Combined signal from guardrail posture and approval telemetry.</p>
        </div>
        <div className={styles.score} aria-label={`Automation readiness score ${snapshot.score} of 100`}>
          <span className={styles.scoreValue}>{snapshot.score}</span>
          <span className={styles.scoreLabel}>Score</span>
        </div>
      </header>

      <div className={styles.summary}>
        <span className={`ds-badge ${styles.badge}`} data-tone={badgeTone}>
          {loading ? "Syncing…" : snapshot.tone === "success" ? "Ready" : snapshot.tone === "critical" ? "Blocked" : "Needs attention"}
        </span>
        <p className="ds-body-strong">{snapshot.headline}</p>
        <p className="ds-caption">{snapshot.subline}</p>
        <p className="ds-caption-strong">Next: {snapshot.nextAction}</p>
      </div>

      <dl className={styles.signals} data-loading={loading ? "true" : undefined}>
        <div>
          <dt className="ds-caption">Guardrail breaches</dt>
          <dd className="ds-body-strong" data-tone={signals.guardrailBreaches > 0 ? "critical" : "info"}>
            {signals.guardrailBreaches}
          </dd>
        </div>
        <div>
          <dt className="ds-caption">Watch items</dt>
          <dd className="ds-body-strong" data-tone={signals.guardrailWatch > 0 ? "caution" : "info"}>
            {signals.guardrailWatch}
          </dd>
        </div>
        <div>
          <dt className="ds-caption">Pending approvals</dt>
          <dd className="ds-body-strong" data-tone={signals.pendingApprovals > 0 ? "caution" : "info"}>
            {signals.pendingApprovals}
          </dd>
        </div>
        <div>
          <dt className="ds-caption">Overdue approvals</dt>
          <dd className="ds-body-strong" data-tone={signals.overdueApprovals > 0 ? "critical" : "info"}>
            {signals.overdueApprovals}
          </dd>
        </div>
        <div>
          <dt className="ds-caption">Telemetry age</dt>
          <dd
            className="ds-body-strong"
            data-tone={telemetryTone(signals.telemetryAgeMinutes, signals.hasTelemetry)}
          >
            {formatTelemetryAge(signals.telemetryAgeMinutes, signals.hasTelemetry)}
          </dd>
        </div>
        <div>
          <dt className="ds-caption">Latest approval</dt>
          <dd className="ds-body">{formatMinutesAgo(signals.latestApprovedMinutes)}</dd>
        </div>
        <div>
          <dt className="ds-caption">Oldest pending</dt>
          <dd className="ds-body">{formatMinutesAgo(signals.latestPendingMinutes)}</dd>
        </div>
      </dl>
    </section>
  );
}
