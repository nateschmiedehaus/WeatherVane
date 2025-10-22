import { buildShadowGuardrailSummary } from "../lib/shadow-insights";
import type { ShadowRunReport } from "../types/allocator";
import styles from "../styles/plan.module.css";

interface Props {
  report: ShadowRunReport;
}

export function RLShadowPanel({ report }: Props) {
  const variants = Object.entries(report.q_values).sort((a, b) => b[1] - a[1]);
  const winning = variants[0];
  const recentEpisodes = report.episodes.slice(-5);
  const baselineFraction = report.diagnostics["baseline_fraction"] ?? 0;
  const safetyOverrideRate = report.diagnostics["safety_override_rate"] ?? 0;
  const validation = report.validation;
  const validationChecks = validation.checks ?? [];
  const validationNotes = validation.notes ?? [];
  const validationSummary = validation.summary;
  const stressTest = validation.stress_test;
  const stressEpisodes = stressTest.episodes.slice(0, 5);
  const stressAssertions = stressTest.assertions ?? {};
  const guardrailSummary = buildShadowGuardrailSummary(report);

  const formatShare = (value: number | undefined): string => {
    if (value === undefined || Number.isNaN(value)) return "—";
    if (Math.abs(value) <= 1) {
      return `${(value * 100).toFixed(1)}%`;
    }
    return value.toFixed(2);
  };

  const normaliseLabel = (label: string): string =>
    label
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  return (
    <section className={styles.contextSection} aria-label="Reinforcement learning shadow mode">
      <div className={styles.summaryCard}>
        <h3 className="ds-title">Reinforcement-learning shadow mode</h3>
        <p className="ds-body">
          Safe exploration runs alongside production allocator to gauge lift before rollout. Average reward {report.average_reward.toFixed(3)} · guardrail
          breaches {report.guardrail_violations}.
        </p>
        <dl>
          <div>
            <dt className="ds-caption">Top variant</dt>
            <dd className="ds-body-strong">{winning ? `${winning[0]} (${winning[1].toFixed(3)} avg reward)` : "n/a"}</dd>
          </div>
          <div>
            <dt className="ds-caption">Explored variants</dt>
            <dd className="ds-body-strong">{Object.keys(report.selection_counts).length}</dd>
          </div>
          <div>
            <dt className="ds-caption">Disabled variants</dt>
            <dd className="ds-body-strong">
              {report.disabled_variants.length ? report.disabled_variants.join(", ") : "None"}
            </dd>
          </div>
          <div>
            <dt className="ds-caption">Baseline coverage</dt>
            <dd className="ds-body-strong">{(baselineFraction * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt className="ds-caption">Safety overrides</dt>
            <dd className="ds-body-strong">{(safetyOverrideRate * 100).toFixed(1)}%</dd>
          </div>
        </dl>
        {validationSummary && (
          <dl className={styles.validationSummary}>
            <div>
              <dt className="ds-caption">Episodes simulated</dt>
              <dd className="ds-body-strong">{validationSummary.episodes}</dd>
            </div>
            <div>
              <dt className="ds-caption">Shadow override rate</dt>
              <dd className="ds-body-strong">{formatShare(validationSummary.safety_override_rate)}</dd>
            </div>
            <div>
              <dt className="ds-caption">Variants disabled</dt>
              <dd className="ds-body-strong">
                {validationSummary.disabled_variants.length
                  ? validationSummary.disabled_variants.join(", ")
                  : "None"}
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className={styles.validationGrid}>
        <div className={styles.validationCard} aria-label="Safety validation checks">
          <h4 className="ds-title">Validation checks</h4>
          <ul className={styles.validationList}>
            {validationChecks.map((check) => (
              <li key={check.name} className={styles.validationItem}>
                <div>
                  <span className="ds-body-strong">{normaliseLabel(check.name)}</span>
                  <span className={styles.validationMetric}>
                    Value {formatShare(check.value)} · Threshold {formatShare(check.threshold)}
                    {typeof check.required_baseline_runs === "number" && typeof check.observed_baseline_runs === "number" ? (
                      <> · Runs {check.observed_baseline_runs}/{check.required_baseline_runs}</>
                    ) : null}
                  </span>
                </div>
                <span
                  className={`${styles.validationBadge} ${
                    check.status ? styles.validationPass : styles.validationFail
                  }`}
                >
                  {check.status ? "Pass" : "Fail"}
                </span>
              </li>
            ))}
          </ul>
          {validationNotes.length > 0 && (
            <ul className={styles.validationNotes}>
              {validationNotes.map((note) => (
                <li key={note} className="ds-body">
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.validationCard} aria-label="Guardrail stress test">
          <h4 className="ds-title">Guardrail stress test</h4>
          <p className="ds-body">
            Forced sequence injects a synthetic breach to ensure automatic disablement and logging paths remain healthy.
          </p>
          <dl className={styles.validationSummary}>
            <div>
              <dt className="ds-caption">Breaches recorded</dt>
              <dd className="ds-body-strong">{stressTest.guardrail_violations}</dd>
            </div>
            <div>
              <dt className="ds-caption">Disabled variants</dt>
              <dd className="ds-body-strong">
                {stressTest.disabled_variants.length ? stressTest.disabled_variants.join(", ") : "None"}
              </dd>
            </div>
            <div>
              <dt className="ds-caption">Assertions</dt>
              <dd className="ds-body-strong">
                {Object.entries(stressAssertions)
                  .map(([key, value]) => `${normaliseLabel(key)}: ${value ? "True" : "False"}`)
                  .join(" · ")}
              </dd>
            </div>
          </dl>

          {stressEpisodes.length > 0 && (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Episode</th>
                    <th scope="col">Variant</th>
                    <th scope="col">Guardrail</th>
                    <th scope="col">Disabled</th>
                  </tr>
                </thead>
                <tbody>
                  {stressEpisodes.map((episode) => (
                    <tr key={episode.index}>
                      <td>{episode.index}</td>
                      <td>{episode.variant}</td>
                      <td>{episode.guardrail_violated ? "⚠ Breach" : "—"}</td>
                      <td>{episode.disabled_after_episode ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className={styles.guardrailStatus}>
        <span className={styles.guardrailStatusBadge} data-tone={guardrailSummary.badgeTone}>
          {guardrailSummary.badgeLabel}
        </span>
        <p className="ds-body">{guardrailSummary.message}</p>
        <div className={styles.guardrailSummary}>
          {guardrailSummary.items.map((item) => {
            const width = Math.min(100, Math.max(0, Math.round(item.progress * 100)));
            return (
              <div key={item.label} className={styles.guardrailSummaryItem}>
                <div>
                  <span className="ds-caption">{item.label}</span>
                  <span className="ds-body-strong">{item.detail}</span>
                </div>
                <div className={styles.guardrailBar} role="presentation">
                  <div
                    className={styles.guardrailBarFill}
                    style={{ width: `${width}%` }}
                    data-tone={item.tone === "pass" ? undefined : item.tone}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th scope="col">Episode</th>
              <th scope="col">Variant</th>
              <th scope="col">Reward</th>
              <th scope="col">Candidate profit</th>
              <th scope="col">Guardrail</th>
              <th scope="col">Safety override</th>
            </tr>
          </thead>
          <tbody>
            {recentEpisodes.map((episode) => (
              <tr key={episode.index}>
                <td>{episode.index}</td>
                <td>{episode.variant}</td>
                <td>{episode.reward.toFixed(3)}</td>
                <td>{episode.candidate_profit.toFixed(2)}</td>
                <td>{episode.guardrail_violated ? "⚠" : "—"}</td>
                <td>{episode.safety_override ? "Applied" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default RLShadowPanel;
