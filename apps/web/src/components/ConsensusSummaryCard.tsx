import { useMemo } from "react";

import type { ConsensusWorkloadResponse } from "../types/operations";
import {
  buildConsensusTierSummaries,
  buildEscalationSummaries,
  formatTokenBudgetUsd,
  summarizeDecisionMix,
} from "../lib/operations-insights";
import styles from "./consensus-summary-card.module.css";

export interface ConsensusSummaryCardProps {
  workload: ConsensusWorkloadResponse;
  className?: string;
  "data-testid"?: string;
}

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start && !end) {
    return "—";
  }
  const startLabel = start ? formatTimestamp(start) : "—";
  const endLabel = end ? formatTimestamp(end) : "—";
  return `${startLabel} → ${endLabel}`;
}

function formatPercentage(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  const percentage = value * 100;
  if (percentage >= 99.5) {
    return "100%";
  }
  if (percentage <= 0) {
    return "0%";
  }
  return `${percentage.toFixed(1)}%`;
}

export function ConsensusSummaryCard({
  workload,
  className,
  "data-testid": dataTestId,
}: ConsensusSummaryCardProps) {
  const tiers = useMemo(() => buildConsensusTierSummaries(workload), [workload]);
  const signals = useMemo(() => buildEscalationSummaries(workload.escalation_signals), [workload]);
  const decisionMix = useMemo(() => summarizeDecisionMix(workload.decision_mix), [workload]);
  const generatedLabel = formatTimestamp(workload.generated_at);
  const windowLabel = formatDateRange(
    workload.sample_window?.start,
    workload.sample_window?.end,
  );
  const tokenBudget = formatTokenBudgetUsd(workload.token_cost_per_run_usd ?? null);
  const successRate = formatPercentage(workload.execution_health?.success_rate);
  const errorRate = formatPercentage(workload.execution_health?.error_rate);

  return (
    <section
      className={`${styles.root} ds-surface ${className ?? ""}`.trim()}
      data-testid={dataTestId}
      aria-labelledby="consensus-summary-heading"
    >
      <header className={styles.header}>
        <div>
          <p className="ds-eyebrow">Consensus staffing</p>
          <h2 className="ds-title" id="consensus-summary-heading">
            Hierarchical quorum health
          </h2>
        </div>
        <dl className={styles.meta}>
          <div>
            <dt className="ds-caption">Generated</dt>
            <dd className="ds-body-strong">{generatedLabel}</dd>
          </div>
          <div>
            <dt className="ds-caption">Sampling window</dt>
            <dd className="ds-body-strong">{windowLabel}</dd>
          </div>
          <div>
            <dt className="ds-caption">Token budget</dt>
            <dd className="ds-body-strong">{tokenBudget}</dd>
          </div>
        </dl>
      </header>

      <div className={styles.grid}>
        <section className={styles.column}>
          <h3 className="ds-label-strong">Quorum tiers</h3>
          <ul className={styles.tiers}>
            {tiers.map((tier) => (
              <li key={tier.name} className={styles.tierItem}>
                <div className={styles.tierHeader}>
                  <span className={styles.tierName}>{tier.displayName}</span>
                  <span className={styles.tierDuration}>
                    Med {tier.medianDuration} · P90 {tier.p90Duration}
                  </span>
                </div>
                <p className={`${styles.participants} ds-body`}>
                  {tier.participants.join(" · ")}
                </p>
                <p className={`${styles.tierFootnote} ds-caption`}>
                  Token envelope {tier.tokenBudget}
                  {tier.notes ? ` · ${tier.notes}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.column}>
          <h3 className="ds-label-strong">Escalation signals</h3>
          {signals.length === 0 ? (
            <p className={`${styles.empty} ds-body`}>No escalation triggers observed.</p>
          ) : (
            <ul className={styles.signals}>
              {signals.map((signal) => (
                <li key={signal.signal} className={styles.signalItem}>
                  <span className={styles.signalName}>{signal.signal}</span>
                  <span className={styles.signalThreshold}>{signal.threshold}</span>
                  {signal.recommendedAction ? (
                    <p className={`${styles.signalAction} ds-caption`}>
                      {signal.recommendedAction}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={styles.column}>
          <h3 className="ds-label-strong">Decision mix</h3>
          <ul className={styles.decisionMix}>
            {decisionMix.map((entry) => (
              <li key={entry.name}>
                <span className={styles.decisionLabel}>{entry.displayName}</span>
                <span className={styles.decisionValue}>{entry.count}</span>
              </li>
            ))}
          </ul>
          <dl className={styles.execution}>
            <div>
              <dt className="ds-caption">Success rate</dt>
              <dd className="ds-body-strong">{successRate}</dd>
            </div>
            <div>
              <dt className="ds-caption">Error rate</dt>
              <dd className="ds-body-strong">{errorRate}</dd>
            </div>
          </dl>
        </section>
      </div>
    </section>
  );
}
