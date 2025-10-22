import { useState } from "react";
import type { ScenarioSnapshot } from "../lib/api";
import styles from "./load-scenario-panel.module.css";

export interface LoadScenarioPanelProps {
  snapshots: ScenarioSnapshot[];
  onLoad: (snapshot: ScenarioSnapshot) => void;
  onDelete: (snapshotId: string) => void;
  loading?: boolean;
}

export function LoadScenarioPanel({
  snapshots,
  onLoad,
  onDelete,
  loading = false,
}: LoadScenarioPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  };

  const formatCurrency = (value: number | null): string => {
    if (value === null) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatRoi = (value: number | null): string => {
    if (value === null || value <= 0) return "—";
    return `${value.toFixed(2)}x`;
  };

  if (loading) {
    return (
      <div className={styles.root}>
        <p className="ds-body" role="status">
          Loading saved scenarios...
        </p>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className={styles.root}>
        <p className="ds-body" role="status">
          No saved scenarios yet. Adjust channels and click &ldquo;Save scenario&rdquo; to create your first snapshot.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.snapshotList} role="list">
        {snapshots.map((snapshot) => {
          const isExpanded = expandedId === snapshot.id;
          const channelCount = Object.keys(snapshot.adjustments).length;

          return (
            <article
              key={snapshot.id}
              className={`${styles.snapshotCard} ${isExpanded ? styles.expanded : ""}`}
              role="listitem"
            >
              <header className={styles.cardHeader}>
                <div className={styles.cardTitle}>
                  <h3 className="ds-subtitle">{snapshot.name}</h3>
                  <span className="ds-caption">{formatDate(snapshot.created_at)}</span>
                </div>
                <div className={styles.cardActions}>
                  <button
                    type="button"
                    onClick={() => onLoad(snapshot)}
                    className={styles.loadButton}
                    aria-label={`Load scenario ${snapshot.name}`}
                  >
                    Load scenario
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : snapshot.id || null)}
                    className={styles.expandButton}
                    aria-label={isExpanded ? "Collapse details" : "Expand details"}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? "−" : "+"}
                  </button>
                </div>
              </header>

              {snapshot.description && (
                <p className={`${styles.description} ds-caption`}>{snapshot.description}</p>
              )}

              {snapshot.tags.length > 0 && (
                <div className={styles.tags} role="list">
                  {snapshot.tags.map((tag) => (
                    <span key={tag} className={styles.tag} role="listitem">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <dl className={styles.summary}>
                <div>
                  <dt className="ds-caption">Channels adjusted</dt>
                  <dd className="ds-body-strong">{channelCount}</dd>
                </div>
                <div>
                  <dt className="ds-caption">Scenario spend</dt>
                  <dd className="ds-body-strong">
                    {formatCurrency(snapshot.total_scenario_spend)}
                  </dd>
                </div>
                <div>
                  <dt className="ds-caption">Scenario ROI</dt>
                  <dd className="ds-body-strong">{formatRoi(snapshot.scenario_roi)}</dd>
                </div>
              </dl>

              {isExpanded && (
                <div className={styles.details}>
                  <h4 className="ds-body-strong">Channel adjustments</h4>
                  <dl className={styles.adjustments}>
                    {Object.entries(snapshot.adjustments).map(([channel, multiplier]) => {
                      const percent = Math.round((multiplier - 1) * 100);
                      const sign = percent > 0 ? "+" : "";
                      return (
                        <div key={channel} className={styles.adjustmentRow}>
                          <dt className="ds-caption">{channel}</dt>
                          <dd className={`ds-body-strong ${percent >= 0 ? styles.positive : styles.negative}`}>
                            {sign}
                            {percent}%
                          </dd>
                        </div>
                      );
                    })}
                  </dl>

                  <div className={styles.detailActions}>
                    <button
                      type="button"
                      onClick={() => snapshot.id && onDelete(snapshot.id)}
                      className={styles.deleteButton}
                    >
                      Delete scenario
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
