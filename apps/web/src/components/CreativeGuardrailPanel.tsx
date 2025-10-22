import type { CreativeChannelGuardrail, CreativeResponseReport } from "../types/creative";
import styles from "../styles/plan.module.css";

interface Props {
  report: CreativeResponseReport;
}

export function CreativeGuardrailPanel({ report }: Props) {
  const highlights = report.top_creatives.slice(0, 3);
  const rows = report.creatives.slice(0, 8);
  const channelRows = (report.channel_guardrails ?? [])
    .slice()
    .sort((a, b) => b.flagged_spend_share - a.flagged_spend_share);
  const spendShares = [
    {
      key: "active",
      label: "Active spend",
      value: report.summary.active_spend_share,
      tone: "active",
    },
    {
      key: "watchlist",
      label: "Watchlist spend",
      value: report.summary.watchlist_spend_share,
      tone: "caution",
    },
    {
      key: "blocked",
      label: "Blocked spend",
      value: report.summary.blocked_spend_share,
      tone: "critical",
    },
  ];
  const guardrailEntries = Object.entries(report.summary.guardrail_counts ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  const toPercent = (value: number): number =>
    Number.isFinite(value) ? Math.round(value * 1000) / 10 : 0;
  const formatGuardrailLabel = (key: string): string => {
    const words = key.split("_").map((word) => {
      if (word.toLowerCase() === "roas") {
        return "ROAS";
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
    return words.join(" ");
  };
  const formatFlaggedBreakdown = (row: CreativeChannelGuardrail): string => {
    if (row.flagged_creatives === 0) {
      return "0";
    }
    const segments: string[] = [];
    if (row.watchlist_creatives > 0) {
      segments.push(`${row.watchlist_creatives} watchlist`);
    }
    if (row.blocked_creatives > 0) {
      segments.push(`${row.blocked_creatives} blocked`);
    }
    const detail = segments.length > 0 ? ` (${segments.join(" · ")})` : "";
    return `${row.flagged_creatives}${detail}`;
  };
  const formatStatusLabel = (status: string | null): string => {
    if (!status) {
      return "";
    }
    return status.charAt(0).toUpperCase() + status.slice(1);
  };
  const formatRepresentative = (row: CreativeChannelGuardrail): string => {
    if (!row.representative_creative) {
      return "—";
    }
    const status = formatStatusLabel(row.representative_status);
    return status ? `${row.representative_creative} (${status})` : row.representative_creative;
  };
  const describeDominantGuardrail = (row: CreativeChannelGuardrail): string => {
    if (!row.top_guardrail || row.top_guardrail_count === 0) {
      return "Clear";
    }
    return `${formatGuardrailLabel(row.top_guardrail)} (${row.top_guardrail_count})`;
  };

  return (
    <section className={styles.contextSection} aria-label="Creative guardrail status">
      <div className={styles.summaryCard}>
        <h3 className="ds-title">Creative guardrails</h3>
        <p className="ds-body">
          Monitoring brand safety and ROAS guardrails. Policy floor {report.policy.roas_floor.toFixed(2)}× · warn threshold{" "}
          {Math.round(report.policy.warn_threshold * 100)}% · block threshold {Math.round(report.policy.block_threshold * 100)}%.
        </p>
        <dl>
          <div>
            <dt className="ds-caption">Creatives scored</dt>
            <dd className="ds-body-strong">{report.summary.creative_count}</dd>
          </div>
          <div>
            <dt className="ds-caption">Active</dt>
            <dd className="ds-body-strong">{report.summary.active_creatives}</dd>
          </div>
          <div>
            <dt className="ds-caption">Watchlist</dt>
            <dd className="ds-body-strong">{report.summary.watchlist_creatives}</dd>
          </div>
          <div>
            <dt className="ds-caption">Blocked</dt>
            <dd className="ds-body-strong">{report.summary.blocked_creatives}</dd>
          </div>
        </dl>
        <div
          className={styles.guardrailSummary}
          role="list"
          aria-label="Spend distribution by guardrail status"
        >
          {spendShares.map((item) => {
            const percent = Math.min(100, Math.max(0, toPercent(item.value)));
            return (
              <div key={item.key} className={styles.guardrailSummaryItem} role="listitem">
                <span className="ds-caption">{item.label}</span>
                <div
                  className={styles.guardrailBar}
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  aria-valuetext={`${percent.toFixed(1)}%`}
                >
                  <div
                    className={styles.guardrailBarFill}
                    data-tone={item.tone}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="ds-body-strong">{percent.toFixed(1)}% of spend</span>
              </div>
            );
          })}
        </div>
        <div className={styles.guardrailBreakdown} aria-live="polite">
          <h4 className="ds-body-strong">Guardrail triggers</h4>
          {guardrailEntries.length > 0 ? (
            <ul className={styles.guardrailBreakdownList}>
              {guardrailEntries.map(([guardrail, count]) => (
                <li key={guardrail} className={styles.guardrailBreakdownItem}>
                  <span className={styles.guardrailBreakdownLabel}>
                    {formatGuardrailLabel(guardrail)}
                  </span>
                  <span className={styles.guardrailBreakdownCount}>{count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={`${styles.guardrailBreakdownEmpty} ds-body`}>
              No guardrail flags detected. Creatives meet policy thresholds.
            </p>
          )}
        </div>
      </div>

      {channelRows.length > 0 && (
        <div className={styles.tableWrap} role="region" aria-label="Channel guardrail posture">
          <div className={styles.tableHeader}>
            <h4 className="ds-body-strong">Channel guardrail posture</h4>
            <p className="ds-caption">Sorted by flagged spend share to elevate riskiest surfaces.</p>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Channel</th>
                <th scope="col">Active creatives</th>
                <th scope="col">Flagged creatives</th>
                <th scope="col">Flagged spend</th>
                <th scope="col">Avg. adj. ROAS</th>
                <th scope="col">Avg. brand safety</th>
                <th scope="col">Dominant guardrail</th>
                <th scope="col">Primary escalation</th>
              </tr>
            </thead>
            <tbody>
              {channelRows.map((channel) => (
                <tr key={channel.channel}>
                  <td>{channel.channel}</td>
                  <td>{`${channel.active_creatives} / ${channel.creative_count}`}</td>
                  <td>{formatFlaggedBreakdown(channel)}</td>
                  <td>{`${toPercent(channel.flagged_spend_share).toFixed(1)}%`}</td>
                  <td>{channel.average_roas.toFixed(2)}×</td>
                  <td>{Math.round(channel.average_brand_safety * 100)}%</td>
                  <td>{describeDominantGuardrail(channel)}</td>
                  <td>{formatRepresentative(channel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.summaryCard} aria-label="Top performing creatives">
        <h4 className="ds-body-strong">Top creatives</h4>
        <ul className={styles.creativeList}>
          {highlights.map((creative) => (
            <li key={creative.creative_id} className="ds-body">
              <strong className="ds-body-strong">{creative.creative_id}</strong> · {creative.channel} ·{" "}
              {creative.roas_adjusted.toFixed(2)}× adj. ROAS · {Math.round(creative.brand_safety_score * 100)}% safety ·{" "}
              {creative.status}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th scope="col">Creative</th>
              <th scope="col">Channel</th>
              <th scope="col">Adj. ROAS</th>
              <th scope="col">Status</th>
              <th scope="col">Guardrail</th>
              <th scope="col">Brand safety</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((creative) => (
              <tr key={creative.creative_id}>
                <td>{creative.creative_id}</td>
                <td>{creative.channel}</td>
                <td>{creative.roas_adjusted.toFixed(2)}×</td>
                <td>{creative.status}</td>
                <td>{creative.guardrail ?? "—"}</td>
                <td>{Math.round(creative.brand_safety_score * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default CreativeGuardrailPanel;
