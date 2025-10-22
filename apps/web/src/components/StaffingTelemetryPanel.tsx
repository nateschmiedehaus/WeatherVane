import { useMemo } from "react";

import type { OrchestrationMetricsResponse } from "../types/operations";
import {
  deriveTelemetrySnapshot,
  formatTelemetryTimestamp,
} from "../lib/staffing-telemetry";
import styles from "./staffing-telemetry-panel.module.css";

export interface StaffingTelemetryPanelProps {
  metrics: OrchestrationMetricsResponse;
  className?: string;
  "data-testid"?: string;
}

function formatSampleWindow(snapshot: ReturnType<typeof deriveTelemetrySnapshot>): string {
  const start = snapshot.sampleWindow?.start
    ? formatTelemetryTimestamp(snapshot.sampleWindow.start)
    : "—";
  const end = snapshot.sampleWindow?.end
    ? formatTelemetryTimestamp(snapshot.sampleWindow.end)
    : "—";
  if (start === "—" && end === "—") {
    return "—";
  }
  return `${start} → ${end}`;
}

export function StaffingTelemetryPanel({
  metrics,
  className,
  "data-testid": dataTestId,
}: StaffingTelemetryPanelProps) {
  const snapshot = useMemo(() => deriveTelemetrySnapshot(metrics, 6), [metrics]);
  const windowLabel = useMemo(() => formatSampleWindow(snapshot), [snapshot]);

  return (
    <section
      className={`${styles.root} ds-surface ${className ?? ""}`.trim()}
      data-testid={dataTestId}
    >
      <header className={styles.header}>
        <div>
          <p className="ds-eyebrow">Dynamic staffing telemetry</p>
          <h2 className="ds-title">Consensus execution history</h2>
        </div>
        <dl className={styles.meta}>
          <div>
            <dt className="ds-caption">Updated</dt>
            <dd className="ds-body-strong">{snapshot.updatedLabel}</dd>
          </div>
          <div>
            <dt className="ds-caption">Lookback window</dt>
            <dd className="ds-body-strong">{windowLabel}</dd>
          </div>
          <div>
            <dt className="ds-caption">Total decisions</dt>
            <dd className="ds-body-strong">{snapshot.totalDecisions}</dd>
          </div>
        </dl>
      </header>

      <div className={styles.grid}>
        <section className={styles.summaryColumn}>
          <h3 className="ds-label-strong">Decision mix</h3>
          {snapshot.decisionTypes.length === 0 ? (
            <p className="ds-body">No consensus decisions recorded yet.</p>
          ) : (
            <ul className={styles.decisionList}>
              {snapshot.decisionTypes.map((entry) => (
                <li key={entry.type}>
                  <span className={styles.decisionType}>{entry.type}</span>
                  <span className={styles.decisionCount}>{entry.count}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="ds-label-strong">Token budget (USD)</h3>
          {snapshot.tokenBudgets.length === 0 ? (
            <p className="ds-body">No token guidance published.</p>
          ) : (
            <ul className={styles.tokenList}>
              {snapshot.tokenBudgets.map((budget) => (
                <li key={budget.name}>
                  <span className={styles.tokenName}>{budget.name}</span>
                  <span className={styles.tokenValue}>{budget.label}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="ds-label-strong">Critic performance</h3>
          {!snapshot.criticPerformance ? (
            <p className="ds-body">No critic telemetry recorded.</p>
          ) : snapshot.criticPerformance.total === 0 ? (
            <p className="ds-body">No critic runs captured for this window.</p>
          ) : (
            <>
              <dl className={styles.criticSummary}>
                <div>
                  <dt className="ds-caption">Passing</dt>
                  <dd className={`${styles.criticStat} ds-body-strong`} data-status="passing">
                    {snapshot.criticPerformance.passing} / {snapshot.criticPerformance.total}
                  </dd>
                </div>
                <div>
                  <dt className="ds-caption">Failing</dt>
                  <dd className={`${styles.criticStat} ds-body-strong`} data-status="failing">
                    {snapshot.criticPerformance.failing}
                  </dd>
                </div>
                <div>
                  <dt className="ds-caption">Updated</dt>
                  <dd className="ds-body-strong">
                    {snapshot.criticPerformance.updatedLabel}
                  </dd>
                </div>
              </dl>
              <ul className={styles.criticList}>
                {snapshot.criticPerformance.critics.map((critic) => (
                  <li key={critic.critic} className={styles.criticItem}>
                    <header className={styles.criticHeader}>
                      <div className={styles.criticIdentity}>
                        <span className={styles.criticName}>{critic.critic}</span>
                        {critic.title ? (
                          <span className={styles.criticTitle}>{critic.title}</span>
                        ) : null}
                      </div>
                      <span
                        className={styles.criticStatus}
                        data-status={critic.passed ? "passing" : "failing"}
                      >
                        {critic.statusLabel}
                      </span>
                    </header>
                    {critic.summary ? (
                      <p className={`${styles.criticSummaryText} ds-caption`}>{critic.summary}</p>
                    ) : null}
                    <footer className={styles.criticFooter}>
                      <span className="ds-caption">{critic.timestampLabel}</span>
                      {critic.domain ? (
                        <span className="ds-caption">{critic.domain}</span>
                      ) : null}
                    </footer>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className={styles.historyColumn}>
          <h3 className="ds-label-strong">Latest decisions</h3>
          {snapshot.history.length === 0 ? (
            <p className="ds-body">Telemetry recorder has not captured decisions yet.</p>
          ) : (
            <ol className={styles.historyList}>
              {snapshot.history.map((entry) => (
                <li key={entry.id} className={styles.historyItem}>
                  <header className={styles.historyHeader}>
                    <span className={styles.historyType}>{entry.type}</span>
                    <span className={styles.historyTimestamp}>{entry.timestampLabel}</span>
                  </header>
                  <dl className={styles.historyMeta}>
                    <div>
                      <dt className="ds-caption">Participants</dt>
                      <dd className="ds-body">{entry.participantsLabel}</dd>
                    </div>
                    <div>
                      <dt className="ds-caption">Duration</dt>
                      <dd className="ds-body">{entry.durationLabel}</dd>
                    </div>
                    <div>
                      <dt className="ds-caption">Token cost</dt>
                      <dd className="ds-body">{entry.tokenCostLabel}</dd>
                    </div>
                    <div>
                      <dt className="ds-caption">Quorum</dt>
                      <dd
                        className={`${styles.historyStatus} ds-body`}
                        data-status={entry.quorumSatisfied ? "met" : "escalated"}
                      >
                        {entry.quorumSatisfied ? "Met" : "Escalated"}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.guidanceColumn}>
          <h3 className="ds-label-strong">Staffing guidance</h3>
          {snapshot.profiles.length === 0 ? (
            <p className="ds-body">No staffing profiles published.</p>
          ) : (
            <ul className={styles.profileList}>
              {snapshot.profiles.map((profile) => (
                <li key={profile.name} className={styles.profileItem}>
                  <header className={styles.profileHeader}>
                    <span className={styles.profileName}>{profile.name}</span>
                    <span className={styles.profileDurations}>
                      Med {profile.medianDurationLabel} · P90 {profile.p90DurationLabel}
                    </span>
                  </header>
                  <p className={`${styles.profileParticipants} ds-body`}>
                    {profile.participantsLabel}
                  </p>
                  {profile.notes ? <p className="ds-caption">{profile.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}

          <h3 className="ds-label-strong">Escalation signals</h3>
          {snapshot.signals.length === 0 ? (
            <p className="ds-body">No live escalation signals recorded.</p>
          ) : (
            <ul className={styles.signalList}>
              {snapshot.signals.map((signal) => (
                <li key={signal.signal} className={styles.signalItem}>
                  <header className={styles.signalHeader}>
                    <span className={styles.signalName}>{signal.signal}</span>
                    <span className={styles.signalThreshold}>{signal.thresholdLabel}</span>
                  </header>
                  <p className="ds-caption">Observed: {signal.observedLabel}</p>
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
      </div>
    </section>
  );
}
