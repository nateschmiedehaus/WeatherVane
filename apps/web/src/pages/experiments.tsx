import { useEffect, useState } from "react";
import Head from "next/head";

import { Layout } from "../components/Layout";
import { IncrementalityPanel } from "../components/IncrementalityPanel";
import { BacktestChart } from "../components/BacktestChart";
import { DisclaimerBanner } from "../components/DisclaimerBanner";
import { CreativeGuardrailPanel } from "../components/CreativeGuardrailPanel";
import { RLShadowPanel } from "../components/RLShadowPanel";
import { SaturationPanel } from "../components/SaturationPanel";
import styles from "../styles/plan.module.css";
import { fetchCreativeResponse, fetchExperimentReport, fetchSaturationReport, fetchShadowReport } from "../lib/api";
import type { BacktestPoint, IncrementalityReport } from "../types/incrementality";
import type { CreativeResponseReport } from "../types/creative";
import type { SaturationReport, ShadowRunReport } from "../types/allocator";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";

export default function ExperimentsPage() {
  const [report, setReport] = useState<IncrementalityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creativeReport, setCreativeReport] = useState<CreativeResponseReport | null>(null);
  const [creativeError, setCreativeError] = useState<string | null>(null);
  const [shadowReport, setShadowReport] = useState<ShadowRunReport | null>(null);
  const [shadowError, setShadowError] = useState<string | null>(null);
  const [saturationReport, setSaturationReport] = useState<SaturationReport | null>(null);
  const [saturationError, setSaturationError] = useState<string | null>(null);

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

  useEffect(() => {
    let active = true;
    fetchCreativeResponse(TENANT_ID)
      .then((data) => {
        if (!active) return;
        setCreativeReport(data);
        setCreativeError(null);
      })
      .catch((err) => {
        if (!active) return;
        setCreativeError(err.message ?? "Failed to load creative guardrails");
        setCreativeReport(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchShadowReport(TENANT_ID)
      .then((data) => {
        if (!active) return;
        setShadowReport(data);
        setShadowError(null);
      })
      .catch((err) => {
        if (!active) return;
        setShadowError(err.message ?? "Failed to load RL shadow report");
        setShadowReport(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchSaturationReport(TENANT_ID)
      .then((data) => {
        if (!active) return;
        setSaturationReport(data);
        setSaturationError(null);
      })
      .catch((err) => {
        if (!active) return;
        setSaturationError(err.message ?? "Failed to load saturation optimisation report");
        setSaturationReport(null);
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

        {creativeError && <p className={styles.error}>Creative guardrails unavailable: {creativeError}</p>}
        {creativeReport && <CreativeGuardrailPanel report={creativeReport} />}

        {shadowError && <p className={styles.error}>RL shadow mode unavailable: {shadowError}</p>}
        {shadowReport && <RLShadowPanel report={shadowReport} />}

        {saturationError && <p className={styles.error}>Saturation optimisation unavailable: {saturationError}</p>}
        {saturationReport && <SaturationPanel report={saturationReport} />}
      </div>
    </Layout>
  );
}
