import type { IncrementalityDesign, IncrementalitySummary } from "../types/incrementality";
import styles from "./context-panel.module.css";

interface IncrementalityPanelProps {
  design?: IncrementalityDesign | null;
  summary?: IncrementalitySummary | null;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatPValue(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value < 0.001) return "< 0.001";
  return value.toFixed(3);
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
  } catch (error) {
    return "—";
  }
}

export function IncrementalityPanel({ design, summary }: IncrementalityPanelProps) {
  if (!design) return null;

  const ready = design.status === "ready";
  const assignment = design.assignment ?? [];
  const controlGeos = assignment.filter((entry) => entry.group === "control");
  const treatmentGeos = assignment.filter((entry) => entry.group === "treatment");
  const significant = summary ? Boolean(summary.is_significant ?? (summary.p_value < 0.05)) : false;

  return (
    <div className={`${styles.panel} ds-surface-panel`} aria-label="Geo holdout experiment">
      <div className={styles.header}>
        <span className="ds-caption">Geo holdout experiment</span>
        <span className="ds-badge" data-tone={ready ? "info" : "caution"}>
          {ready ? "Ready" : "Needs data"}
        </span>
      </div>
      <p className={`${styles.bodyCopy} ds-body`}>
        Prove weather impact by splitting geos into control and treatment groups. Control stays on the baseline plan,
        treatment adopts WeatherVane recommendations. After the test window, compare ROAS lift and significance.
      </p>
      {summary && (
        <div className={`${styles.summaryCard} ds-surface-card`}>
          <div className={styles.summaryHeader}>
            <span className="ds-caption">Observed lift</span>
            <span className="ds-badge" data-tone={significant ? "success" : "muted"}>
              {significant ? "Significant" : "Pending"}
            </span>
          </div>
          <div className={`${styles.liftValue} ds-metric`}>{formatPercent(summary.lift)}</div>
          <dl className={styles.summaryGrid}>
            <div>
              <dt className="ds-caption">Absolute lift</dt>
              <dd className="ds-body-strong">{formatNumber(summary.absolute_lift)}</dd>
            </div>
            <div>
              <dt className="ds-caption">Confidence band</dt>
              <dd className="ds-body-strong">
                {formatNumber(summary.conf_low)} – {formatNumber(summary.conf_high)}
              </dd>
            </div>
            <div>
              <dt className="ds-caption">p-value</dt>
              <dd className="ds-body-strong">{formatPValue(summary.p_value)}</dd>
            </div>
            <div>
              <dt className="ds-caption">Sample sizes</dt>
              <dd className="ds-body-strong">
                T: {formatNumber(summary.sample_size_treatment)} · C: {formatNumber(summary.sample_size_control)}
              </dd>
            </div>
            <div>
              <dt className="ds-caption">Treatment mean</dt>
              <dd className="ds-body-strong">{formatNumber(summary.treatment_mean, 1)}</dd>
            </div>
            <div>
              <dt className="ds-caption">Control mean</dt>
              <dd className="ds-body-strong">{formatNumber(summary.control_mean, 1)}</dd>
            </div>
          </dl>
          <div className={`${styles.summaryMeta} ds-caption`}>Updated {formatTimestamp(summary.generated_at)}</div>
        </div>
      )}
      <dl className={styles.keyStats}>
        <div>
          <dt className="ds-caption">Eligible geos</dt>
          <dd className="ds-body-strong">{design.geo_count ?? "—"}</dd>
        </div>
        <div>
          <dt className="ds-caption">Control geos</dt>
          <dd className="ds-body-strong">{design.holdout_count ?? controlGeos.length}</dd>
        </div>
        <div>
          <dt className="ds-caption">Control spend share</dt>
          <dd className="ds-body-strong">{formatPercent(design.control_share ?? null)}</dd>
        </div>
      </dl>
      {assignment.length > 0 && (
        <div className={styles.assignmentTable}>
          <div className={styles.assignmentHeader}>
            <span className="ds-caption">Geo</span>
            <span className="ds-caption">Group</span>
            <span className="ds-caption">Revenue share</span>
          </div>
          {assignment.map((item) => (
            <div key={`${item.geo}-${item.group}`} className={styles.assignmentRow}>
              <span className="ds-body">{item.geo}</span>
              <span className="ds-body">{item.group}</span>
              <span className="ds-body">{formatPercent(item.weight)}</span>
            </div>
          ))}
        </div>
      )}
      {(design.notes ?? []).length > 0 && (
        <ul className={styles.warningList}>
          {(design.notes ?? []).map((note, index) => (
            <li key={index} className={`${styles.warningItem} ${styles.warningInfo}`}>
              <span className="ds-body">{note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
