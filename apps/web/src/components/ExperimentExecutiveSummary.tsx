import type { ExecutiveSummary, ConfidenceLevel } from "../lib/experiment-insights";
import styles from "../styles/plan.module.css";

interface Props {
  summary: ExecutiveSummary;
}

function badgeTone(level: ConfidenceLevel): "success" | "info" | "caution" {
  if (level === "high") {
    return "success";
  }
  if (level === "medium") {
    return "caution";
  }
  return "info";
}

export function ExperimentExecutiveSummary({ summary }: Props) {
  return (
    <div className={`${styles.summaryCard} ds-surface-card`} aria-label="Executive summary for experiments hub">
      <div className={styles.experimentSummaryHeader}>
        <div className={styles.experimentSummaryTitle}>
          <h3 className="ds-title">{summary.headline}</h3>
          <div className={styles.experimentSummaryBadges}>
            <span className="ds-badge" data-tone={summary.decisionTone}>
              {summary.decisionLabel}
            </span>
            <span className="ds-badge" data-tone={badgeTone(summary.confidenceLevel)}>
              {summary.confidenceBadge}
            </span>
          </div>
        </div>
        {summary.generatedAt && (
          <span className="ds-caption">Updated {new Date(summary.generatedAt).toLocaleString()}</span>
        )}
      </div>
      <div className={styles.experimentSummaryContent}>
        <p className="ds-body">{summary.liftNarrative}</p>
        <p className="ds-body">{summary.confidenceNarrative}</p>
        <p className="ds-body">{summary.recommendation}</p>
        <div className={styles.experimentSummaryFallback}>
          <span className="ds-caption">Fallback</span>
          <p className="ds-body">{summary.fallbackPlan}</p>
        </div>
        {summary.riskCallout && (
          <div className={styles.experimentSummaryRisk}>
            <span className="ds-caption">Risks</span>
            <p className="ds-body">{summary.riskCallout}</p>
          </div>
        )}
      </div>
    </div>
  );
}
