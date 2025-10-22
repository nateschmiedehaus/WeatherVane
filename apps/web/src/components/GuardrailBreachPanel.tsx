import styles from "./guardrail-breach-panel.module.css";
import type { GuardrailSegment } from "../types/dashboard";
import {
  buildGuardrailPostureSegments,
  buildGuardrailExecutiveSummary,
  describeGuardrailPosture,
  summarizeGuardrailRisks,
} from "../lib/automationInsights";

interface GuardrailBreachPanelProps {
  guardrails: GuardrailSegment[];
  generatedAt?: string | null;
  loading?: boolean;
  error?: string | null;
  onNavigate?: () => void;
}

export function GuardrailBreachPanel({
  guardrails,
  generatedAt,
  loading = false,
  error,
  onNavigate,
}: GuardrailBreachPanelProps) {
  const summary = summarizeGuardrailRisks(guardrails);
  const distribution = buildGuardrailPostureSegments(summary);
  const hasTelemetry = distribution.some((segment) => segment.count > 0);
  const postureDescription = describeGuardrailPosture(summary);
  const executiveSummary = buildGuardrailExecutiveSummary(summary);
  const meterLabel = hasTelemetry
    ? distribution
        .map((segment) => {
          const statusLabel =
            segment.status === "breach"
              ? "breach"
              : segment.status === "watch"
                ? "watch"
                : "healthy";
          const plural =
            segment.count === 1
              ? statusLabel
              : statusLabel === "watch"
                ? "watch items"
                : `${statusLabel}s`;
          return `${segment.count} ${plural}`;
        })
        .join(", ")
    : "No guardrail telemetry captured yet";
  const showPlaceholder = summary.risks.length === 0;

  return (
    <section className={`${styles.container} ds-surface-panel ds-transition`} aria-live="polite">
      <header className={styles.header}>
        <div>
          <h5 className="ds-subtitle">Guardrail posture</h5>
          <p className="ds-caption">
            Track breaches and watch items before letting automation resume.
          </p>
        </div>
        {onNavigate && (
          <button type="button" className={`ds-ghost ${styles.navigate}`} onClick={onNavigate}>
            Open dashboard
          </button>
        )}
      </header>

      <div className={styles.execSummary} data-tone={executiveSummary.status}>
        <div>
          <p className="ds-caption">Exec review</p>
          <p className="ds-body-strong">{executiveSummary.headline}</p>
        </div>
        <p className="ds-caption">{executiveSummary.guidance}</p>
        <p className="ds-body">{executiveSummary.recommendation}</p>
      </div>

      <dl className={styles.summary}>
        <div>
          <dt className="ds-caption">Breaches</dt>
          <dd className="ds-body-strong" data-tone="critical">
            {summary.breachCount}
          </dd>
        </div>
        <div>
          <dt className="ds-caption">Watch</dt>
          <dd className="ds-body-strong" data-tone="caution">
            {summary.watchCount}
          </dd>
        </div>
        <div>
          <dt className="ds-caption">Healthy</dt>
          <dd className="ds-body-strong" data-tone="success">
            {summary.healthyCount}
          </dd>
        </div>
      </dl>

      <div className={styles.meterSection}>
        <div
          className={styles.meter}
          role="img"
          aria-label={meterLabel}
          data-empty={hasTelemetry ? "false" : "true"}
        >
          {distribution.map((segment) => (
            <span
              key={segment.status}
              className={styles.meterSegment}
              data-status={segment.status}
              style={{
                width: `${segment.count === 0 ? 0 : Number(segment.percentage.toFixed(2))}%`,
              }}
              aria-hidden
            />
          ))}
        </div>
        <p className={`${styles.postureCopy} ds-caption`}>{postureDescription}</p>
      </div>

      {error && (
        <p className={`${styles.notice} ds-caption`} role="status">
          Showing cached guardrail posture — {error}
        </p>
      )}

      {loading && showPlaceholder ? (
        <p className={`${styles.placeholder} ds-body`}>Loading guardrail posture…</p>
      ) : showPlaceholder ? (
        <p className={`${styles.placeholder} ds-body`}>
          No guardrail breaches detected. Automation guardrails are holding steady.
        </p>
      ) : (
        <ul className={styles.list}>
          {summary.risks.map((guardrail) => {
            const ratio = computeRatio(guardrail.value, guardrail.target);
            return (
              <li key={guardrail.name} className={styles.item} data-status={guardrail.status}>
                <header className={styles.itemHeader}>
                  <span className="ds-body-strong">{guardrail.name}</span>
                  <span className="ds-caption">{Math.round(guardrail.delta_pct)}%</span>
                </header>
                <div className={styles.bar}>
                  <div className={styles.track} />
                  <div className={styles.fill} style={{ width: `${Math.min(ratio * 100, 150)}%` }} />
                </div>
                <footer className={`${styles.itemMeta} ds-caption`}>
                  <span>
                    {guardrail.value.toLocaleString(undefined, {
                      maximumFractionDigits: guardrail.unit === "x" ? 2 : 0,
                    })}
                    {guardrail.unit === "x" ? "×" : ` ${guardrail.unit}`}
                  </span>
                  <span>Target {guardrail.target.toLocaleString()}</span>
                </footer>
                {guardrail.notes && <p className="ds-caption">{guardrail.notes}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {generatedAt && (
        <p className={`${styles.footer} ds-caption`}>
          Updated {new Date(generatedAt).toLocaleString()}
        </p>
      )}
    </section>
  );
}

function computeRatio(value: number, target: number): number {
  if (!Number.isFinite(target) || target === 0) {
    return 1;
  }
  return value / target;
}
