import { useEffect, useMemo, useState } from "react";
import Head from "next/head";

import { Layout } from "../components/Layout";
import { ContextPanel } from "../components/ContextPanel";
import { IncrementalityPanel } from "../components/IncrementalityPanel";
import { DisclaimerBanner } from "../components/DisclaimerBanner";
import styles from "../styles/plan.module.css";
import { fetchPlan } from "../lib/api";
import type { PlanResponse, PlanSlice } from "../types/plan";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";
const HORIZON_DAYS = Number(process.env.NEXT_PUBLIC_PLAN_HORIZON ?? "7");

function formatCurrency(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatRoas(value: number | null | undefined): string {
  if (!value || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}×`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function driverFromSlice(slice: PlanSlice): string {
  if (slice.rationale?.primary_driver) return slice.rationale.primary_driver;
  const supporting = slice.rationale?.supporting_factors ?? [];
  return supporting[0] ?? "Weather-driven opportunity";
}

interface PlanRow {
  key: string;
  date: string;
  geo: string;
  category: string;
  channel: string;
  spend: string;
  revenueP50: string;
  roasP50: string;
  confidence: string;
  driver: string;
}

export default function PlanPage() {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPlan(TENANT_ID, HORIZON_DAYS)
      .then((res) => {
        if (!active) return;
        setPlan(res);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message ?? "Failed to load plan");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const rows: PlanRow[] = useMemo(() => {
    if (!plan?.slices?.length) return [];
    return plan.slices.map((slice) => {
      const roasP50 = slice.expected_roas?.p50 ?? null;
      return {
        key: `${slice.plan_date}-${slice.geo_group_id}-${slice.channel}`,
        date: formatDate(slice.plan_date),
        geo: slice.geo_group_id,
        category: slice.category,
        channel: slice.channel,
        spend: formatCurrency(slice.recommended_spend),
        revenueP50: formatCurrency(slice.expected_revenue.p50),
        roasP50: formatRoas(roasP50),
        confidence: slice.confidence,
        driver: driverFromSlice(slice),
      };
    });
  }, [plan]);

  const totalSpend = useMemo(() => {
    if (!plan?.slices?.length) return "—";
    const sum = plan.slices.reduce((acc, slice) => acc + slice.recommended_spend, 0);
    return formatCurrency(sum);
  }, [plan]);

  const generatedAt = plan?.generated_at ? new Date(plan.generated_at).toLocaleString() : "—";
  const contextTags = plan?.context_tags ?? [];
  const datasetRows = (plan?.data_context?.metadata as { dataset_rows?: Record<string, unknown> } | undefined)?.dataset_rows ?? {};
  const weatherSource = (plan?.data_context?.metadata as { weather_source?: string } | undefined)?.weather_source ?? "unknown";
  const contextWarnings = plan?.context_warnings ?? [];

  return (
    <Layout>
      <Head>
        <title>WeatherVane · Plan</title>
      </Head>
      <div className={styles.root}>
        <DisclaimerBanner message="Predictions reflect historical correlations; causal lift is under validation until Phase 4 completes." />
        <section className={styles.header}>
          <div>
            <h2>7-day weather-aware plan</h2>
            <p>
              Rolling horizon with expected revenue bands, weather drivers, and guardrail checks. Adjust
              totals or forecast intensity to see instant reflows.
            </p>
          </div>
          <div className={styles.summaryCard}>
            <dl>
              <div>
                <dt>Total recommended spend</dt>
                <dd>{totalSpend}</dd>
              </div>
              <div>
                <dt>Plan generated</dt>
                <dd>{generatedAt}</dd>
              </div>
              <div>
                <dt>Horizon</dt>
                <dd>{plan?.horizon_days ?? HORIZON_DAYS} days</dd>
              </div>
            </dl>
            <div className={styles.actions}>
              <button type="button">Adjust budget</button>
              <button type="button" className={styles.secondary}>
                Download CSV
              </button>
            </div>
          </div>
        </section>

        {loading && <p className={styles.status}>Loading latest plan…</p>}
        {error && <p className={styles.error}>{error}</p>}

        {!loading && !error && (
          <section className={styles.contextSection}>
            <ContextPanel tags={contextTags} warnings={contextWarnings} />
            <IncrementalityPanel
              design={plan?.incrementality_design ?? null}
              summary={plan?.incrementality_summary ?? null}
            />
            <div className={styles.contextMeta}>
              <div className={styles.metaRow}>
                <span className={styles.metaLabel}>Weather source</span>
                <span className={styles.metaValue}>{weatherSource}</span>
              </div>
              {Object.keys(datasetRows).length > 0 && (
                <dl className={styles.datasetStats}>
                  {Object.entries(datasetRows).map(([name, value]) => (
                    <div key={name}>
                      <dt>{name}</dt>
                      <dd>{typeof value === "number" ? value.toLocaleString() : String(value ?? "—")}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </section>
        )}

        {!loading && !error && (
          <section className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Geo Group</th>
                  <th scope="col">Category</th>
                  <th scope="col">Channel</th>
                  <th scope="col">Spend</th>
                  <th scope="col">Expected revenue (p50)</th>
                  <th scope="col">Expected ROAS (p50)</th>
                  <th scope="col">Confidence</th>
                  <th scope="col">Driver</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.date}</td>
                    <td>{row.geo}</td>
                    <td>{row.category}</td>
                    <td>{row.channel}</td>
                    <td>{row.spend}</td>
                    <td>{row.revenueP50}</td>
                    <td>{row.roasP50}</td>
                    <td>
                      <span className={`${styles.badge} ${styles[`confidence${row.confidence}`]}`}>
                        {row.confidence}
                      </span>
                    </td>
                    <td>{row.driver}</td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={9} className={styles.emptyState}>
                      No plan slices available yet. Run the pipeline to generate recommendations.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </Layout>
  );
}
