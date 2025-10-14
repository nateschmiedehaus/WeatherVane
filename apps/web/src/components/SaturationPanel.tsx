import type { SaturationReport } from "../types/allocator";
import styles from "../styles/plan.module.css";

interface Props {
  report: SaturationReport;
}

export function SaturationPanel({ report }: Props) {
  const markets = report.markets.slice(0, 6);

  return (
    <section className={styles.contextSection} aria-label="Cross-market saturation optimisation">
      <div className={styles.summaryCard}>
        <h3 className="ds-title">Cross-market saturation optimisation</h3>
        <p className="ds-body">
          Fairness floor {Math.round(report.fairness_floor * 100)}% · baseline profit {report.summary.baseline_profit.toFixed(2)} · projected profit{" "}
          {report.summary.profit.toFixed(2)} · lift {(report.summary.profit_lift >= 0 ? "+" : "") + report.summary.profit_lift.toFixed(2)}.
        </p>
        <dl>
          <div>
            <dt className="ds-caption">Weighted fairness gap</dt>
            <dd className="ds-body-strong">{report.summary.weighted_fairness_gap.toFixed(3)}</dd>
          </div>
          <div>
            <dt className="ds-caption">Max gap</dt>
            <dd className="ds-body-strong">{report.summary.max_fairness_gap.toFixed(3)}</dd>
          </div>
          <div>
            <dt className="ds-caption">Total spend</dt>
            <dd className="ds-body-strong">{report.summary.total_spend.toFixed(2)}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th scope="col">Market</th>
              <th scope="col">Spend</th>
              <th scope="col">Share</th>
              <th scope="col">Fair share</th>
              <th scope="col">Adj. ROAS</th>
              <th scope="col">Guardrail</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((market) => (
              <tr key={market.name}>
                <td>{market.name}</td>
                <td>{market.allocated_spend.toFixed(2)}</td>
                <td>{Math.round(market.share * 100)}%</td>
                <td>{Math.round(market.fair_share * 100)}%</td>
                <td>{market.roas.toFixed(2)}×</td>
                <td>{market.guardrail_binding ? "Binding" : "Clear"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default SaturationPanel;
