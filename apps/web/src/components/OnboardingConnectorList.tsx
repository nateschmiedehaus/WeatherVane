import type { ConnectorProgress, ConnectorStatus } from "../demo/onboarding";
import styles from "./onboarding-connector-list.module.css";

interface OnboardingConnectorListProps {
  connectors: ConnectorProgress[];
  title?: string;
  metaLabel?: string | null;
  loading?: boolean;
  isFallback?: boolean;
  errorMessage?: string | null;
  emptyMessage?: string;
  limit?: number;
  className?: string;
}

const CONNECTOR_STATUS_LABELS: Record<ConnectorStatus, string> = {
  ready: "Connected",
  in_progress: "Configuring",
  action_needed: "Action needed",
};

const CONNECTOR_STATUS_TONES: Record<ConnectorStatus, "success" | "caution" | "critical"> = {
  ready: "success",
  in_progress: "caution",
  action_needed: "critical",
};

export function OnboardingConnectorList({
  connectors,
  title = "Connector readiness",
  metaLabel,
  loading = false,
  isFallback = false,
  errorMessage,
  emptyMessage = "Connectors will appear here after your first ingestion run completes.",
  limit,
  className,
}: OnboardingConnectorListProps) {
  const items = typeof limit === "number" ? connectors.slice(0, limit) : connectors;
  const containerClasses = [styles.container, "ds-surface-panel", "ds-transition", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={containerClasses} aria-live="polite">
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h5 className="ds-subtitle">{title}</h5>
          <div className={styles.meta}>
            {metaLabel && <span className="ds-caption">{metaLabel}</span>}
            <div className={styles.metaBadges}>
              {loading ? (
                <span className={`ds-badge ${styles.badge}`} data-tone="info">
                  Syncing…
                </span>
              ) : isFallback ? (
                <span className={`ds-badge ${styles.badge}`} data-tone="info">
                  Demo snapshot
                </span>
              ) : (
                <span className={`ds-badge ${styles.badge}`} data-tone="success">
                  Live snapshot
                </span>
              )}
            </div>
          </div>
        </div>
        {errorMessage && (
          <p className={`${styles.notice} ds-caption`} role="status">
            Showing demo data while the live snapshot loads — {errorMessage}
          </p>
        )}
      </header>

      {items.length === 0 ? (
        <p className={`${styles.empty} ds-body`}>{emptyMessage}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((connector) => (
            <li
              key={connector.slug}
              className={`${styles.item} ds-surface-card ds-transition`}
              data-status={connector.status}
              data-tone={CONNECTOR_STATUS_TONES[connector.status]}
            >
              <div className={styles.itemHeader}>
                <strong className="ds-body-strong">{connector.label}</strong>
                <span
                  className={`ds-badge ${styles.statusBadge}`}
                  data-tone={CONNECTOR_STATUS_TONES[connector.status]}
                >
                  {CONNECTOR_STATUS_LABELS[connector.status]}
                </span>
              </div>
              {connector.summary && <p className={`${styles.summary} ds-body`}>{connector.summary}</p>}
              <div className={`${styles.progressRow} ds-caption`}>
                <span>{connector.progress}%</span>
                <div className={styles.progressBar} aria-hidden="true">
                  <div
                    className={styles.progressFill}
                    style={{ transform: `scaleX(${Math.max(connector.progress, 0) / 100})` }}
                  />
                </div>
                {connector.focus && <span>{connector.focus}</span>}
              </div>
              <div className={`${styles.footer} ds-caption`}>
                <span>{connector.timeAgo}</span>
                {connector.action && <span className={`${styles.action} ds-pill`}>{connector.action}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
