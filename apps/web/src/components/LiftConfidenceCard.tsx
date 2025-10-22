import type { ExperimentLift, ExperimentPayload } from "../types/plan";
import styles from "./lift-confidence-card.module.css";

interface LiftConfidenceCardProps {
  lift?: ExperimentLift | null;
  experiment?: ExperimentPayload | null;
  className?: string;
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatPercentDirect(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined, fractionDigits = 2): string {
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

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function LiftConfidenceCard({
  lift,
  experiment,
  className,
}: LiftConfidenceCardProps) {
  if (!lift && !experiment) {
    return null;
  }

  const displayLift = lift || experiment?.lift;
  const ready = displayLift !== undefined && displayLift !== null;
  const significant = displayLift ? Boolean(displayLift.is_significant) : false;

  return (
    <div
      className={`${styles.card} ds-surface-panel ${className ?? ""}`.trim()}
      aria-label="Lift and confidence metrics"
    >
      <div className={styles.header}>
        <span className="ds-caption">Experiment lift & confidence</span>
        <span className="ds-badge" data-tone={significant ? "success" : ready ? "info" : "muted"}>
          {significant ? "Significant" : ready ? "Ready" : "Awaiting results"}
        </span>
      </div>

      {ready && displayLift && (
        <div className={styles.content}>
          <div className={styles.liftSection}>
            <div className={styles.heroMetric}>
              <span className={`${styles.liftValue} ds-metric`}>
                {formatPercentDirect(displayLift.lift_pct)}
              </span>
              <span className="ds-caption">Measured lift</span>
            </div>

            <div className={styles.confidenceInterval}>
              <div className={styles.interval}>
                <span className={styles.label}>95% confidence band</span>
                <div className={styles.range}>
                  <span className={styles.bound}>{formatPercent(displayLift.confidence_low)}</span>
                  <span className={styles.dash}>–</span>
                  <span className={styles.bound}>{formatPercent(displayLift.confidence_high)}</span>
                </div>
              </div>

              <div className={styles.significance}>
                <span className={styles.label}>Statistical significance</span>
                <span className={styles.pValue}>p = {formatPValue(displayLift.p_value)}</span>
                <span className={`${styles.verdict} ds-caption`}>
                  {significant
                    ? "Result is statistically significant at α=0.05"
                    : "Result does not meet significance threshold"}
                </span>
              </div>
            </div>
          </div>

          <dl className={styles.metrics}>
            <div>
              <dt className="ds-caption">Absolute lift</dt>
              <dd className="ds-body-strong">{formatNumber(displayLift.absolute_lift, 2)}</dd>
            </div>
            <div>
              <dt className="ds-caption">Sample size</dt>
              <dd className="ds-body-strong">
                {displayLift.sample_size.toLocaleString()} observations
              </dd>
            </div>
            {displayLift.generated_at && (
              <div>
                <dt className="ds-caption">Generated</dt>
                <dd className="ds-caption">{formatTimestamp(displayLift.generated_at)}</dd>
              </div>
            )}
          </dl>

          {experiment && (
            <div className={styles.experimentDetails}>
              <h4 className="ds-body-strong">Experiment setup</h4>
              <dl className={styles.details}>
                {experiment.treatment_geos.length > 0 && (
                  <div>
                    <dt className="ds-caption">Treatment geos</dt>
                    <dd className="ds-body">{experiment.treatment_geos.join(", ")}</dd>
                  </div>
                )}
                {experiment.control_geos.length > 0 && (
                  <div>
                    <dt className="ds-caption">Control geos</dt>
                    <dd className="ds-body">{experiment.control_geos.join(", ")}</dd>
                  </div>
                )}
                {experiment.treatment_spend !== null && experiment.treatment_spend !== undefined && (
                  <div>
                    <dt className="ds-caption">Treatment spend</dt>
                    <dd className="ds-body-strong">{formatCurrency(experiment.treatment_spend)}</dd>
                  </div>
                )}
                {experiment.control_spend !== null && experiment.control_spend !== undefined && (
                  <div>
                    <dt className="ds-caption">Control spend</dt>
                    <dd className="ds-body-strong">{formatCurrency(experiment.control_spend)}</dd>
                  </div>
                )}
                {experiment.start_date && (
                  <div>
                    <dt className="ds-caption">Window</dt>
                    <dd className="ds-body">
                      {formatTimestamp(experiment.start_date)}
                      {experiment.end_date && (
                        <>
                          {" "}
                          – {formatTimestamp(experiment.end_date)}
                        </>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      )}

      {!ready && (
        <div className={styles.empty}>
          <p className="ds-body">
            {experiment?.status === "running"
              ? "Experiment is running. Results will appear here when complete."
              : "No lift data available yet. Run an experiment to measure weather impact."}
          </p>
        </div>
      )}
    </div>
  );
}
