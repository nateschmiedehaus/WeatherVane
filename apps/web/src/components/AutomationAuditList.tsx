import type { AutomationAuditPreview, AutomationAuditStatus } from "../demo/onboarding";
import styles from "./automation-audit-list.module.css";

interface AutomationAuditListProps {
  audits: AutomationAuditPreview[];
  title?: string;
  metaLabel?: string | null;
  loading?: boolean;
  isFallback?: boolean;
  errorMessage?: string | null;
  emptyMessage?: string;
  limit?: number;
  className?: string;
}

const AUDIT_STATUS_LABELS: Record<AutomationAuditStatus, string> = {
  approved: "Logged",
  pending: "Pending approval",
  shadow: "Shadow proof",
};

const AUDIT_STATUS_TONES: Record<AutomationAuditStatus, "success" | "caution" | "info"> = {
  approved: "success",
  pending: "caution",
  shadow: "info",
};

export function AutomationAuditList({
  audits,
  title = "Automation audit trail",
  metaLabel,
  loading = false,
  isFallback = false,
  errorMessage,
  emptyMessage = "Guardrail approvals will appear here after the first automation run.",
  limit,
  className,
}: AutomationAuditListProps) {
  const items = typeof limit === "number" ? audits.slice(0, limit) : audits;
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
            {loading ? (
              <span className={`ds-badge ${styles.badge}`} data-tone="info">
                Syncing…
              </span>
            ) : isFallback ? (
              <span className={`ds-badge ${styles.badge}`} data-tone="info">
                Demo proof
              </span>
            ) : (
              <span className={`ds-badge ${styles.badge}`} data-tone="success">
                Live proof
              </span>
            )}
          </div>
        </div>
        {errorMessage && (
          <p className={`${styles.notice} ds-caption`} role="status">
            Showing demo log while the live feed loads — {errorMessage}
          </p>
        )}
      </header>

      {items.length === 0 ? (
        <p className={`${styles.empty} ds-body`}>{emptyMessage}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((audit) => (
            <li
              key={audit.id}
              className={`${styles.item} ds-surface-card ds-transition`}
              data-tone={AUDIT_STATUS_TONES[audit.status]}
            >
              <div className={styles.itemHeader}>
                <div className={styles.itemMeta}>
                  <strong className="ds-body-strong">{audit.headline}</strong>
                  {audit.detail && <p className="ds-body">{audit.detail}</p>}
                </div>
                <span
                  className={`ds-badge ${styles.statusBadge}`}
                  data-tone={AUDIT_STATUS_TONES[audit.status]}
                >
                  {AUDIT_STATUS_LABELS[audit.status]}
                </span>
              </div>
              <div className={`${styles.footer} ds-caption`}>
                <span>{audit.actor ?? "WeatherVane"}</span>
                <span>{audit.timeAgo}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
