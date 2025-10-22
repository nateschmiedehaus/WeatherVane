import type { ConfidenceLevel } from "../types/plan";
import type { ConfidenceMixSegment } from "../lib/plan-insights";
import styles from "./confidence-mix-bar.module.css";

interface ConfidenceMixBarProps {
  segments: ConfidenceMixSegment[];
  total: number;
  className?: string;
}

const LEVEL_LABEL: Record<ConfidenceLevel, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const formatSummary = (segments: ConfidenceMixSegment[]): string => {
  const parts = segments
    .filter((segment) => segment.count > 0)
    .map(
      (segment) =>
        `${segment.count} ${segment.level.toLowerCase()} confidence ${
          segment.count === 1 ? "slice" : "slices"
        } (${segment.percentage.toFixed(1)}%)`,
    );
  return parts.length ? parts.join(", ") : "No confidence slices available yet";
};

export function ConfidenceMixBar({ segments, total, className }: ConfidenceMixBarProps) {
  if (total === 0) {
    return <p className={`${styles.empty} ${className ?? ""}`.trim()}>Awaiting telemetry</p>;
  }

  const summary = formatSummary(segments);

  return (
    <div className={`${styles.container} ${className ?? ""}`.trim()}>
      <div className={styles.bar} role="img" aria-label={`Confidence mix: ${summary}`}>
        {segments.map((segment) => {
          const width = Math.max(0, segment.percentage);
          return (
            <span
              key={segment.level}
              className={`${styles.segment} ${styles[`segment${segment.level}`]}`}
              style={{ flexBasis: `${width}%`, flexGrow: width }}
            >
              <span className={styles.srOnly}>
                {LEVEL_LABEL[segment.level]} confidence {segment.count}{" "}
                {segment.count === 1 ? "slice" : "slices"} ({segment.percentage.toFixed(1)}%)
              </span>
            </span>
          );
        })}
      </div>
      <dl className={styles.legend}>
        {segments.map((segment) => (
          <div key={segment.level} className={styles.legendItem}>
            <dt className={styles.legendLabel}>{LEVEL_LABEL[segment.level]}</dt>
            <dd className={styles.legendValue}>
              {segment.count} {segment.count === 1 ? "slice" : "slices"} ·{" "}
              {segment.percentage.toFixed(1)}%
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

