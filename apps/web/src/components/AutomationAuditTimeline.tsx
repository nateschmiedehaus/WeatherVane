import styles from "./automation-audit-timeline.module.css";
import type { AutomationAuditTimelineItem } from "../lib/automationInsights";

interface AutomationAuditTimelineProps {
  items: AutomationAuditTimelineItem[];
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  className?: string;
  title?: string;
}

const DEFAULT_EMPTY = "No automation history captured yet. Updates will appear after the first change.";

export function AutomationAuditTimeline({
  items,
  loading = false,
  error,
  emptyMessage = DEFAULT_EMPTY,
  className,
  title = "Audit history",
}: AutomationAuditTimelineProps) {
  const containerClass = [styles.container, "ds-surface-panel", className].filter(Boolean).join(" ");

  return (
    <section className={containerClass} aria-live="polite">
      <header className={styles.header}>
        <div>
          <h5 className="ds-subtitle">{title}</h5>
          <p className="ds-caption">Consent, guardrail, and automation events.</p>
        </div>
        {loading ? (
          <span className={`ds-badge ${styles.badge}`} data-tone="info">
            Syncing…
          </span>
        ) : (
          <span className={`ds-badge ${styles.badge}`} data-tone="success">
            Live
          </span>
        )}
      </header>

      {error && (
        <p className={`${styles.notice} ds-caption`} role="alert">
          Showing offline cache while the live history loads — {error}
        </p>
      )}

      {loading && items.length === 0 ? (
        <p className={`${styles.placeholder} ds-body`}>Loading audit history…</p>
      ) : items.length === 0 ? (
        <p className={`${styles.placeholder} ds-body`}>{emptyMessage}</p>
      ) : (
        <ol className={styles.timeline}>
          {items.map((item) => (
            <li key={item.id} className={styles.event}>
              <span className={styles.dot} data-tone={item.tone} aria-hidden />
              <div className={styles.eventContent}>
                <div className={styles.eventHeader}>
                  <strong className="ds-body-strong">{item.headline}</strong>
                  <span className="ds-caption">{item.timeAgo}</span>
                </div>
                {item.detail && <p className="ds-caption">{item.detail}</p>}
                <footer className={`${styles.meta} ds-caption`}>
                  <span>{item.actor}</span>
                  <time dateTime={item.occurredAt}>{item.occurredAt}</time>
                </footer>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
