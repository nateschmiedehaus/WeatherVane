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
