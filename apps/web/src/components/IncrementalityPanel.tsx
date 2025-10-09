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
    <div className={styles.panel}>
      <div className={styles.header}>
        <span>Geo Holdout Experiment</span>
        <span className={ready ? styles.badgeInfo : styles.badgeCaution}>{ready ? "Ready" : "Needs data"}</span>
      </div>
      <p className={styles.bodyCopy}>
        Prove weather impact by splitting geos into control and treatment groups. Control stays on the baseline plan,
        treatment adopts WeatherVane recommendations. After the test window, compare ROAS lift and significance.
      </p>
      {summary && (
        <div className={styles.summaryCard}>
          <div className={styles.summaryHeader}>
            <span>Observed lift</span>
            <span className={significant ? styles.badgeSuccess : styles.badgeMuted}>
              {significant ? "Significant" : "Pending"}
            </span>
          </div>
          <div className={styles.liftValue}>{formatPercent(summary.lift)}</div>
          <dl className={styles.summaryGrid}>
            <div>
              <dt>Absolute lift</dt>
              <dd>{formatNumber(summary.absolute_lift)}</dd>
            </div>
            <div>
              <dt>Confidence band</dt>
              <dd>
                {formatNumber(summary.conf_low)} – {formatNumber(summary.conf_high)}
              </dd>
            </div>
            <div>
              <dt>p-value</dt>
              <dd>{formatPValue(summary.p_value)}</dd>
            </div>
            <div>
              <dt>Sample sizes</dt>
              <dd>
                T: {formatNumber(summary.sample_size_treatment)} · C: {formatNumber(summary.sample_size_control)}
              </dd>
            </div>
            <div>
              <dt>Treatment mean</dt>
              <dd>{formatNumber(summary.treatment_mean, 1)}</dd>
            </div>
            <div>
              <dt>Control mean</dt>
              <dd>{formatNumber(summary.control_mean, 1)}</dd>
            </div>
          </dl>
          <div className={styles.summaryMeta}>Updated {formatTimestamp(summary.generated_at)}</div>
        </div>
      )}
      <dl className={styles.keyStats}>
        <div>
          <dt>Eligible geos</dt>
          <dd>{design.geo_count ?? "—"}</dd>
        </div>
        <div>
          <dt>Control geos</dt>
          <dd>{design.holdout_count ?? controlGeos.length}</dd>
        </div>
        <div>
          <dt>Control spend share</dt>
          <dd>{formatPercent(design.control_share ?? null)}</dd>
        </div>
      </dl>
      {assignment.length > 0 && (
        <div className={styles.assignmentTable}>
          <div className={styles.assignmentHeader}>
            <span>Geo</span>
            <span>Group</span>
            <span>Revenue share</span>
          </div>
          {assignment.map((item) => (
            <div key={`${item.geo}-${item.group}`} className={styles.assignmentRow}>
              <span>{item.geo}</span>
              <span>{item.group}</span>
              <span>{formatPercent(item.weight)}</span>
            </div>
          ))}
        </div>
      )}
      {(design.notes ?? []).length > 0 && (
        <ul className={styles.warningList}>
          {(design.notes ?? []).map((note, index) => (
            <li key={index} className={`${styles.warningItem} ${styles.warningInfo}`}>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
