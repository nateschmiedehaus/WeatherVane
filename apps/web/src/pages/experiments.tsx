import { useEffect, useState } from "react";
import Head from "next/head";

import { Layout } from "../components/Layout";
import { IncrementalityPanel } from "../components/IncrementalityPanel";
import { BacktestChart } from "../components/BacktestChart";
import { DisclaimerBanner } from "../components/DisclaimerBanner";
import styles from "../styles/plan.module.css";
import { fetchExperimentReport } from "../lib/api";
import type { BacktestPoint, IncrementalityReport } from "../types/incrementality";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";

export default function ExperimentsPage() {
  const [report, setReport] = useState<IncrementalityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchExperimentReport(TENANT_ID)
      .then((data) => {
        if (!active) return;
        setReport(data);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message ?? "Failed to load experiment");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
        active = false;
    };
  }, []);

  const summary = report?.summary;
  const backtest = (report?.backtest ?? []) as BacktestPoint[];
  const performance = report?.performance_summary as (
    | { status?: string; summary?: { coverage?: { coverage?: number }; coverage_by_horizon?: Record<string, { coverage?: number }>; failing_horizons?: string[]; } }
    | undefined
  );

  return (
    <Layout>
      <Head>
        <title>WeatherVane · Experiments</title>
      </Head>
      <div className={styles.root}>
        <DisclaimerBanner message="Experiments measure correlations today; causal validation under active development." />
        <section className={styles.header}>
          <div>
            <h2>Geo Holdout Experiments</h2>
            <p>
              Track weather impact experiments. Use the control group as baseline, then quantify lift and
              significance to build trust with marketing and finance teams.
            </p>
          </div>
        </section>

        {loading && <p className={styles.status}>Loading experiment design…</p>}
        {error && <p className={styles.error}>{error}</p>}

        {!loading && !error && report && (
          <section className={styles.contextSection}>
            <IncrementalityPanel design={report.design} summary={report.summary ?? null} />
          </section>
        )}
        {!loading && !error && (
          <section className={styles.contextSection}>
            <BacktestChart points={backtest} title="Backtest timeline" />
          </section>
        )}

        {!loading && !error && performance?.summary && (
          <section className={styles.contextSection}>
            <div className={styles.summaryCard}>
              <h3>Forecast coverage</h3>
              <p>
                Overall p10–p90 coverage: {Math.round((((performance.summary as any).coverage?.coverage ?? 0) * 100))}%
              </p>
              {performance.failing_horizons && (performance.failing_horizons as string[]).length > 0 ? (
                <p className={styles.error}>
                  Horizon bands below target: {(performance.failing_horizons as string[]).join(", ")} day lookahead.
                </p>
              ) : (
                <p>All horizons meet the target coverage.</p>
              )}
              {performance.summary && (performance.summary as any).coverage_by_horizon && (
                <dl>
                  {Object.entries((performance.summary as any).coverage_by_horizon as Record<string, { coverage?: number }>).map(([horizon, cov]) => (
                    <div key={horizon}>
                      <dt>Day {horizon}</dt>
                      <dd>{Math.round(((cov?.coverage ?? 0) * 100))}%</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
