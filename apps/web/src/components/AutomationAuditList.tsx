import { useEffect, useMemo, useState } from "react";

import type { AutomationAuditPreview, AutomationAuditStatus } from "../demo/onboarding";
import styles from "./automation-audit-list.module.css";
import {
  buildAutomationTrustSummary,
  filterAutomationAudits,
  isPendingAuditOverdue,
  selectDefaultAutomationAuditFilter,
  type AutomationAuditFilter,
} from "../lib/automationTrust";

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
  approved: "Shipped",
  pending: "Needs review",
  shadow: "Shadow rehearsal",
};

const AUDIT_STATUS_TONES: Record<AutomationAuditStatus, "success" | "caution" | "info"> = {
  approved: "success",
  pending: "caution",
  shadow: "info",
};

const DEFAULT_NEXT_STEP: Record<AutomationAuditStatus, string> = {
  approved: "Monitor live performance; trigger a rollback if the trend slips.",
  pending: "Approve or request changes before the review window closes.",
  shadow: "Promote this rehearsal once your spot checks align with the evidence.",
};

const FILTER_OPTIONS: Array<{
  id: AutomationAuditFilter;
  label: string;
  description: string;
}> = [
  { id: "all", label: "All changes", description: "Every automated change captured here." },
  { id: "pending", label: "Needs review", description: "Actions waiting on your approval." },
  { id: "approved", label: "Shipped", description: "Live changes already executed by automation." },
  { id: "shadow", label: "Rehearsals", description: "Shadow runs proving the plan is safe." },
];

export function AutomationAuditList({
  audits,
  title = "Automation change log",
  metaLabel,
  loading = false,
  isFallback = false,
  errorMessage,
  emptyMessage = "Change history appears once WeatherVane makes its first move.",
  limit,
  className,
}: AutomationAuditListProps) {
  const summary = buildAutomationTrustSummary(audits);
  const [filter, setFilter] = useState<AutomationAuditFilter>(() =>
    selectDefaultAutomationAuditFilter(audits),
  );
  const [userOverrodeFilter, setUserOverrodeFilter] = useState(false);
  const statusCounts = useMemo(() => {
    const counts: Record<AutomationAuditStatus, number> = {
      approved: 0,
      pending: 0,
      shadow: 0,
    };
    for (const audit of audits) {
      counts[audit.status] += 1;
    }
    return counts;
  }, [audits]);
  const hasPending = statusCounts.pending > 0;
  const metricCounts = useMemo(() => {
    const counts = new Map<AutomationAuditStatus, string>();
    for (const metric of summary.metrics) {
      if (metric.id === "approved" || metric.id === "pending" || metric.id === "shadow") {
        counts.set(metric.id, metric.value);
      }
    }
    return counts;
  }, [summary.metrics]);

  useEffect(() => {
    const nextDefault = selectDefaultAutomationAuditFilter(audits);
    setFilter((current) => {
      if (current === "pending" && !hasPending) {
        return nextDefault;
      }
      if (!userOverrodeFilter && current === "all" && nextDefault === "pending") {
        return "pending";
      }
      return current;
    });
  }, [audits, hasPending, userOverrodeFilter]);

  useEffect(() => {
    if (!hasPending) {
      setUserOverrodeFilter(false);
    }
  }, [hasPending]);

  const filteredItems = useMemo(() => filterAutomationAudits(audits, filter), [audits, filter]);
  const items = useMemo(
    () => (typeof limit === "number" ? filteredItems.slice(0, limit) : filteredItems),
    [filteredItems, limit],
  );
  const totalCount = audits.length;
  const visibleCount = filteredItems.length;
  const containerClasses = [styles.container, "ds-surface-panel", "ds-transition", className]
    .filter(Boolean)
    .join(" ");

  const resolvedMetaLabel = metaLabel ?? "Transparent by design";
  const filterOptions = FILTER_OPTIONS.map((option) => {
    const disabled =
      option.id !== "all" && statusCounts[option.id as AutomationAuditStatus] === 0;
    return { ...option, disabled };
  });

  const resolvedEmptyMessage =
    items.length === 0 && filter !== "all"
      ? {
          pending: "You're caught up — WeatherVane will alert you when a new review lands.",
          approved: "Automation hasn't shipped a change yet. Once it does, the story lands here.",
          shadow: "No rehearsals recorded yet. WeatherVane runs one before first launch.",
        }[filter] ?? emptyMessage
      : emptyMessage;

  return (
    <section
      className={containerClasses}
      aria-live="polite"
      data-testid="automation-change-log"
    >
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h5 className="ds-subtitle">{title}</h5>
          <div className={styles.meta}>
            {resolvedMetaLabel && <span className="ds-caption">{resolvedMetaLabel}</span>}
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

      {summary && (
        <div
          className={styles.summary}
          data-tone={summary.tone}
          role="status"
          aria-live="polite"
          data-testid="automation-change-log-summary"
        >
          <div className={styles.summaryCopy}>
            <p className="ds-body-strong">{summary.headline}</p>
            <p className="ds-caption">{summary.subline}</p>
            {summary.nextAction && (
              <p
                className={`${styles.summaryAction} ds-caption-strong`}
                data-testid="automation-summary-next-action"
              >
                Next: {summary.nextAction}
              </p>
            )}
          </div>
          <dl className={styles.summaryMetrics}>
            {summary.metrics.map((metric) => (
              <div key={metric.id} className={styles.summaryMetric} data-tone={metric.tone}>
                <dt className="ds-caption">{metric.label}</dt>
                <dd className="ds-title-xs">{metric.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <fieldset className={styles.filters} aria-label="Filter change log">
        <legend className="ds-caption">Show me</legend>
        <div
          className={styles.filterGroup}
          role="toolbar"
          aria-label="Change log filters"
          data-testid="automation-change-log-filters"
        >
          {filterOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`${styles.filterButton} ds-pill ds-caption-strong`}
              data-active={filter === option.id ? "true" : undefined}
              data-testid={`automation-filter-${option.id}`}
              onClick={() => {
                setFilter(option.id);
                setUserOverrodeFilter(true);
              }}
              disabled={option.disabled}
              aria-pressed={filter === option.id}
              aria-label={`${option.label}${option.disabled ? " (no entries yet)" : ""}`}
              title={option.description}
            >
              <span className={styles.filterLabel}>{option.label}</span>
              <span
                className={styles.filterCount}
                data-testid={`automation-filter-count-${option.id}`}
              >
                {option.id === "all" ? totalCount : metricCounts.get(option.id) ?? "0"}
              </span>
            </button>
          ))}
        </div>
        <p className={`${styles.filterHint} ds-caption`}>
          {filter === "all"
            ? `Showing ${visibleCount} change${visibleCount === 1 ? "" : "s"} from newest to oldest.`
            : `Showing ${visibleCount} ${filterOptions.find((option) => option.id === filter)?.label.toLowerCase()} entr${
                visibleCount === 1 ? "y" : "ies"
              }.`}
        </p>
      </fieldset>

      {items.length === 0 ? (
        <p className={`${styles.empty} ds-body`}>{resolvedEmptyMessage}</p>
      ) : (
        <ul className={styles.list}>
          {items.map((audit) => {
            const isOverdue = isPendingAuditOverdue(audit);
            const statusLabel = AUDIT_STATUS_LABELS[audit.status];
            const statusTitle = isOverdue ? `${statusLabel} — approval overdue` : statusLabel;
            return (
              <li
                key={audit.id}
                className={`${styles.item} ds-surface-card ds-transition`}
                data-tone={AUDIT_STATUS_TONES[audit.status]}
                data-status={audit.status}
                data-overdue={isOverdue ? "true" : undefined}
                data-testid="automation-change-log-item"
                data-log-id={audit.id}
              >
                <header className={styles.itemHeader}>
                  <div className={styles.itemTitle}>
                    <span className="ds-caption-strong">What changed</span>
                    <strong className="ds-body-strong">{audit.headline}</strong>
                  </div>
                  <span
                    className={`ds-badge ${styles.statusBadge}`}
                    data-tone={AUDIT_STATUS_TONES[audit.status]}
                    title={statusTitle}
                  >
                    {statusLabel}
                  </span>
                </header>

                <div className={styles.narrativeGrid}>
                  <div className={styles.narrativeBlock}>
                    <span className="ds-caption-strong">Why WeatherVane moved</span>
                    <p className="ds-body" data-testid="automation-narrative-why">
                      {audit.narrative?.why ?? audit.detail}
                    </p>
                  </div>
                  <div className={`${styles.narrativeBlock} ${styles.impactBlock}`}>
                    <span className="ds-caption-strong">Impact so far</span>
                    <div className={styles.impactValue} data-testid="automation-narrative-impact">
                      <strong className="ds-title-xs">
                        {audit.narrative?.impactValue ?? "—"}
                      </strong>
                      <span className="ds-caption">
                        {audit.narrative?.impactLabel ?? "Impact"}
                      </span>
                    </div>
                    {(audit.narrative?.impactContext || audit.narrative?.impact) && (
                      <p className="ds-caption" data-testid="automation-narrative-impact-context">
                        {audit.narrative?.impactContext ?? audit.narrative?.impact}
                      </p>
                    )}
                  </div>
                  <div className={styles.narrativeBlock}>
                    <span className="ds-caption-strong">Next step</span>
                    <p className="ds-body" data-testid="automation-narrative-next-step">
                      {audit.narrative?.nextStep ?? DEFAULT_NEXT_STEP[audit.status]}
                    </p>
                  </div>
                </div>

                {audit.actions && audit.actions.length > 0 && (
                  <div className={styles.actions}>
                    {audit.actions.map((action) => {
                      const intent = action.intent ?? "acknowledge";
                      return action.href ? (
                        <a
                          key={action.id}
                          className={`${styles.actionButton} ds-pill ds-caption-strong`}
                          data-intent={intent}
                          href={action.href}
                          title={action.tooltip ?? action.label}
                        >
                          {action.label}
                        </a>
                      ) : (
                        <button
                          key={action.id}
                          type="button"
                          className={`${styles.actionButton} ds-pill ds-caption-strong`}
                          data-intent={intent}
                          title={action.tooltip ?? action.label}
                        >
                          {action.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {audit.evidence && audit.evidence.length > 0 && (
                  <div className={styles.evidence} role="group" aria-label={`Evidence for ${audit.headline}`}>
                    <div className={styles.evidenceBadges}>
                      {audit.evidence.slice(0, 3).map((item) => (
                        <span
                          key={item.id}
                          className={`${styles.evidenceBadge} ds-caption`}
                          data-tone={item.tone ?? "info"}
                        >
                          <span className={styles.evidenceBadgeLabel}>{item.label}</span>
                          <strong className={styles.evidenceBadgeValue}>{item.value}</strong>
                        </span>
                      ))}
                    </div>
                    <details className={styles.evidenceDetails}>
                      <summary className={`${styles.evidenceSummary} ds-caption-strong`}>
                        Evidence packet <span className={styles.evidenceCount}>({audit.evidence.length})</span>
                      </summary>
                      <ul className={styles.evidenceList}>
                        {audit.evidence.map((item) => (
                          <li key={item.id} className={styles.evidenceItem} data-tone={item.tone ?? "info"}>
                            <div className={styles.evidenceItemHeader}>
                              <span className="ds-caption-strong">{item.label}</span>
                              <span className="ds-body-strong">{item.value}</span>
                            </div>
                            {item.context && <p className="ds-caption">{item.context}</p>}
                            {item.link && (
                              <a
                                className={`${styles.evidenceLink} ds-caption`}
                                href={item.link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {item.link.label}
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                )}

                <footer className={`${styles.footer} ds-caption`}>
                  <span>{audit.actor ?? "WeatherVane"}</span>
                  <span>{audit.timeAgo}</span>
                </footer>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
