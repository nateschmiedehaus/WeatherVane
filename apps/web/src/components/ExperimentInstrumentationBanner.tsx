import type { InstrumentationSignal } from "../lib/experiment-insights";
import styles from "../styles/plan.module.css";

interface Props {
  signals: InstrumentationSignal[];
}

const toneToBadge: Record<InstrumentationSignal["tone"], "success" | "info" | "caution" | "critical"> = {
  success: "success",
  info: "info",
  caution: "caution",
  critical: "critical",
};

export function ExperimentInstrumentationBanner({ signals }: Props) {
  if (signals.length === 0) {
    return (
      <div className={`${styles.summaryCard} ds-surface-card`} aria-label="Instrumentation health">
        <h3 className="ds-body-strong">Instrumentation health</h3>
        <p className="ds-body">No telemetry captured yet. Confirm webhook delivery and holdout design status.</p>
      </div>
    );
  }

  return (
    <div className={`${styles.summaryCard} ds-surface-card`} aria-label="Instrumentation health">
      <div className={styles.instrumentationHeader}>
        <h3 className="ds-body-strong">Instrumentation health</h3>
        <p className="ds-caption">
          Telemetry guardrails covering sample sufficiency, randomisation, coverage, and webhook delivery.
        </p>
      </div>
      <ul className={styles.instrumentationSignals}>
        {signals.map((signal) => (
          <li key={signal.id} className={styles.instrumentationSignal}>
            <div className={styles.instrumentationSignalLabel}>
              <span className="ds-body-strong">{signal.label}</span>
              <span className="ds-badge" data-tone={toneToBadge[signal.tone]}>
                {signal.value}
              </span>
            </div>
            <p className="ds-caption">{signal.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
