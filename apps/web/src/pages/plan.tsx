import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";

import { Layout } from "../components/Layout";
import { ContextPanel } from "../components/ContextPanel";
import { IncrementalityPanel } from "../components/IncrementalityPanel";
import { DisclaimerBanner } from "../components/DisclaimerBanner";
import styles from "../styles/plan.module.css";
import { fetchPlan } from "../lib/api";
import type { ConfidenceLevel, PlanResponse, PlanSlice } from "../types/plan";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";
const HORIZON_DAYS = Number(process.env.NEXT_PUBLIC_PLAN_HORIZON ?? "7");

const CONFIDENCE_ORDER: ConfidenceLevel[] = ["HIGH", "MEDIUM", "LOW"];

function formatCurrency(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  const fractionDigits = Math.abs(amount) >= 1000 ? 0 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

function formatRoas(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}×`;
}

function formatDateShort(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDateLong(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateRange(dates: string[]): string {
  if (!dates.length) return "—";
  const sorted = [...dates].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const start = new Date(sorted[0]);
  const end = new Date(sorted[sorted.length - 1]);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";

  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const endLabel = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function driverFromSlice(slice: PlanSlice): string {
  if (slice.rationale?.primary_driver) return slice.rationale.primary_driver;
  const supporting = slice.rationale?.supporting_factors ?? [];
  return supporting[0] ?? "Weather-driven opportunity";
}

type ConfidenceBreakdown = Record<ConfidenceLevel, number>;

interface DayOutlook {
  dateKey: string;
  label: string;
  spend: number;
  topDriver: string;
  topConfidence: ConfidenceLevel | null;
  counts: ConfidenceBreakdown;
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
  const [reloadCount, setReloadCount] = useState(0);

  const fetchLatestPlan = useCallback(() => {
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
        setError(err.message ?? "We ran into an issue loading the latest plan.");
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
    const cancel = fetchLatestPlan();
    return cancel;
  }, [fetchLatestPlan, reloadCount]);

  const handleRetry = () => setReloadCount((value) => value + 1);

  const slices = plan?.slices ?? [];

  const tableRows: PlanRow[] = useMemo(() => {
    if (!slices.length) return [];
    return slices.map((slice) => {
      const roasP50 = slice.expected_roas?.p50 ?? null;
      return {
        key: `${slice.plan_date}-${slice.geo_group_id}-${slice.channel}`,
        date: formatDateShort(slice.plan_date),
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
  }, [slices]);

  const totalRecommendedSpend = useMemo(() => {
    if (!slices.length) return "—";
    const sum = slices.reduce((acc, slice) => acc + slice.recommended_spend, 0);
    return formatCurrency(sum);
  }, [slices]);

  const totalProjectedRevenue = useMemo(() => {
    if (!slices.length) return "—";
    const sum = slices.reduce((acc, slice) => acc + slice.expected_revenue.p50, 0);
    return formatCurrency(sum);
  }, [slices]);

  const uniqueGeos = useMemo(() => {
    if (!slices.length) return 0;
    return new Set(slices.map((slice) => slice.geo_group_id)).size;
  }, [slices]);

  const planDateRange = useMemo(() => {
    if (!slices.length) return "—";
    const dates = slices.map((slice) => slice.plan_date);
    return formatDateRange(dates);
  }, [slices]);

  const confidenceBreakdown: ConfidenceBreakdown = useMemo(
    () =>
      slices.reduce(
        (acc, slice) => {
          acc[slice.confidence] += 1;
          return acc;
        },
        { HIGH: 0, MEDIUM: 0, LOW: 0 } as ConfidenceBreakdown,
      ),
    [slices],
  );

  const totalConfidenceSlices =
    confidenceBreakdown.HIGH + confidenceBreakdown.MEDIUM + confidenceBreakdown.LOW;

  const topOpportunities = useMemo(() => {
    if (!slices.length) return [];
    return [...slices]
      .sort((a, b) => b.expected_revenue.p50 - a.expected_revenue.p50)
      .slice(0, 3);
  }, [slices]);

  const dayOutlook: DayOutlook[] = useMemo(() => {
    if (!slices.length) return [];
    const map = new Map<string, DayOutlook>();

    slices.forEach((slice) => {
      const entry =
        map.get(slice.plan_date) ??
        {
          dateKey: slice.plan_date,
          label: formatDateLong(slice.plan_date),
          spend: 0,
          topDriver: driverFromSlice(slice),
          topConfidence: slice.confidence,
          counts: { HIGH: 0, MEDIUM: 0, LOW: 0 },
        };

      const previousSpend = entry.spend;
      entry.spend += slice.recommended_spend;
      entry.counts[slice.confidence] += 1;

      const currentTopConfidenceIndex = entry.topConfidence
        ? CONFIDENCE_ORDER.indexOf(entry.topConfidence)
        : Number.POSITIVE_INFINITY;
      const newConfidenceIndex = CONFIDENCE_ORDER.indexOf(slice.confidence);
      const shouldReplaceDriver =
        slice.recommended_spend > previousSpend ||
        newConfidenceIndex < currentTopConfidenceIndex;

      if (shouldReplaceDriver) {
        entry.topDriver = driverFromSlice(slice);
        entry.topConfidence = slice.confidence;
      }

      map.set(slice.plan_date, entry);
    });

    return [...map.values()].sort(
      (a, b) => new Date(a.dateKey).getTime() - new Date(b.dateKey).getTime(),
    );
  }, [slices]);

  const generatedAt = plan?.generated_at ? new Date(plan.generated_at).toLocaleString() : "—";
  const contextTags = plan?.context_tags ?? [];
  const contextWarnings = plan?.context_warnings ?? [];
  const datasetRows =
    (plan?.data_context?.metadata as { dataset_rows?: Record<string, unknown> } | undefined)
      ?.dataset_rows ?? {};
  const weatherSource =
    (plan?.data_context?.metadata as { weather_source?: string } | undefined)?.weather_source ??
    "unknown";

  const hasPlanContent = !loading && !error && slices.length > 0;

  return (
    <Layout>
      <Head>
        <title>WeatherVane · Plan</title>
      </Head>
      <div className={styles.root}>
        <DisclaimerBanner message="Predictions reflect historical correlations; causal lift is under validation until Phase 4 completes." />

        <header className={styles.header}>
          <div>
            <p className={styles.pageEyebrow}>This week&apos;s weather-aware plan</p>
            <h2 className={styles.pageTitle}>Transform forecasts into decisions</h2>
            <p className={styles.pageSubtitle}>
              We surface the highest-impact weather opportunities, translate them into budget-ready
              actions, and quantify confidence so your team can move fast with conviction.
            </p>
          </div>
          <div className={styles.summaryCard} role="presentation">
            <dl>
              <div>
                <dt>Plan window</dt>
                <dd>{planDateRange}</dd>
              </div>
              <div>
                <dt>Total recommended spend</dt>
                <dd>{totalRecommendedSpend}</dd>
              </div>
              <div>
                <dt>Projected revenue (p50)</dt>
                <dd>{totalProjectedRevenue}</dd>
              </div>
              <div>
                <dt>Geographies covered</dt>
                <dd>{uniqueGeos || "—"}</dd>
              </div>
              <div>
                <dt>Generated</dt>
                <dd>{generatedAt}</dd>
              </div>
            </dl>
          </div>
        </header>

        {loading && (
          <section className={styles.loadingSection} aria-live="polite">
            <p className={styles.loadingMessage}>Stitching weather signals into your plan…</p>
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonGrid}>
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
              <div className={styles.skeletonCard} />
            </div>
          </section>
        )}

        {error && (
          <div className={styles.error} role="alert">
            <h3 className={styles.errorTitle}>We couldn&apos;t load your plan</h3>
            <p>{error}</p>
            <p className={styles.errorHelper}>
              This usually resolves within a few seconds. You can retry now or check the worker logs
              for pipeline status.
            </p>
            <div className={styles.errorActions}>
              <button type="button" onClick={handleRetry} className={styles.retryButton}>
                Try again
              </button>
            </div>
          </div>
        )}

        {hasPlanContent && (
          <>
            <section className={styles.opportunitiesSection} aria-label="Top opportunities">
              <div className={styles.sectionHeader}>
                <h3>Action queue</h3>
                <p>Start with these high-leverage moves surfaced from the full allocation plan.</p>
              </div>
              <div className={styles.opportunityGrid}>
                {topOpportunities.map((slice) => (
                  <article className={styles.opportunityCard} key={`${slice.plan_date}-${slice.geo_group_id}-${slice.channel}`}>
                    <header className={styles.opportunityHeader}>
                      <span className={styles.opportunityDate}>{formatDateLong(slice.plan_date)}</span>
                      <span
                        className={`${styles.badge} ${styles[`confidence${slice.confidence}`]}`}
                        aria-label={`Confidence ${slice.confidence.toLowerCase()}`}
                      >
                        {slice.confidence.toLowerCase()}
                      </span>
                    </header>
                    <h4 className={styles.opportunityTitle}>{slice.geo_group_id}</h4>
                    <p className={styles.opportunityDriver}>{driverFromSlice(slice)}</p>
                    <dl className={styles.opportunityMetrics}>
                      <div>
                        <dt>Recommended spend</dt>
                        <dd>{formatCurrency(slice.recommended_spend)}</dd>
                      </div>
                      <div>
                        <dt>Projected revenue (p50)</dt>
                        <dd>{formatCurrency(slice.expected_revenue.p50)}</dd>
                      </div>
                      <div>
                        <dt>Projected ROAS (p50)</dt>
                        <dd>{formatRoas(slice.expected_roas?.p50 ?? null)}</dd>
                      </div>
                    </dl>
                    <a className={styles.opportunityLink} href="#plan-details">
                      Jump to full details →
                    </a>
                  </article>
                ))}
              </div>
              {!topOpportunities.length && (
                <p className={styles.opportunityEmpty}>
                  We&apos;ll surface the largest opportunities here as soon as recommendations are
                  available.
                </p>
              )}
            </section>

            <section className={styles.dailySection} aria-label="Daily outlook">
              <div className={styles.sectionHeader}>
                <h3>Seven-day outlook</h3>
                <p>Preview how spend shifts across the horizon and what weather dynamics drive it.</p>
              </div>
              <div className={styles.dayGrid}>
                {dayOutlook.map((day) => (
                  <article key={day.dateKey} className={styles.dayCard}>
                    <header className={styles.dayHeader}>
                      <span>{day.label}</span>
                      <span className={styles.daySpend}>{formatCurrency(day.spend)}</span>
                    </header>
                    <p className={styles.dayDriver}>{day.topDriver}</p>
                    <div className={styles.dayConfidence}>
                      {CONFIDENCE_ORDER.map((level) => {
                        const count = day.counts[level];
                        if (!count) return null;
                        return (
                          <span
                            key={level}
                            className={`${styles.badge} ${styles[`confidence${level}`]}`}
                            aria-label={`${count} ${level.toLowerCase()} confidence recommendation${
                              count > 1 ? "s" : ""
                            }`}
                          >
                            {level.toLowerCase()} · {count}
                          </span>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.insightsSection} aria-label="Confidence insights">
              <div className={styles.insightsGrid}>
                <div className={styles.insightTile}>
                  <h4>{totalConfidenceSlices ? Math.round((confidenceBreakdown.HIGH / totalConfidenceSlices) * 100) : 0}% high confidence</h4>
                  <p>
                    {confidenceBreakdown.HIGH} slices are backed by deep historical coverage and
                    stable causal drivers.
                  </p>
                </div>
                <div className={styles.insightTile}>
                  <h4>{confidenceBreakdown.MEDIUM} medium-confidence slices</h4>
                  <p>
                    These merit manual review. We highlight supporting factors inside the detailed
                    table.
                  </p>
                </div>
                <div className={styles.insightTile}>
                  <h4>{confidenceBreakdown.LOW} exploratory bets</h4>
                  <p>
                    Low-confidence rows tend to coincide with novel campaigns or sparse weather
                    history—treat as optional tests.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}

        {!loading && !error && (
          <section className={styles.contextLayout}>
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
          <section className={styles.tableSection} id="plan-details">
            <details open className={styles.detailWrapper}>
              <summary className={styles.detailSummary}>
                Full allocation table
                <span className={styles.detailHint}>
                  Filter by geo, category, or confidence to inspect individual recommendations.
                </span>
              </summary>
              <div className={styles.tableWrap}>
                <table>
                  <caption className="sr-only">
                    Budget allocation recommendations for the next{" "}
                    {plan?.horizon_days ?? HORIZON_DAYS} days, including geography, category,
                    channel, spend, expected revenue, and confidence signals.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Geo Group</th>
                      <th scope="col">Category</th>
                      <th scope="col">Channel</th>
                      <th scope="col">Spend</th>
                      <th scope="col">Projected revenue (p50)</th>
                      <th scope="col">Projected ROAS (p50)</th>
                      <th scope="col">Confidence</th>
                      <th scope="col">Driver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.key}>
                        <td>{row.date}</td>
                        <td>{row.geo}</td>
                        <td>{row.category}</td>
                        <td>{row.channel}</td>
                        <td>{row.spend}</td>
                        <td>{row.revenueP50}</td>
                        <td>{row.roasP50}</td>
                        <td>
                          <span
                            className={`${styles.badge} ${styles[`confidence${row.confidence}`]}`}
                            aria-label={`Confidence ${row.confidence.toLowerCase()}`}
                          >
                            {row.confidence.toLowerCase()}
                          </span>
                        </td>
                        <td>{row.driver}</td>
                      </tr>
                    ))}
                    {!tableRows.length && (
                      <tr>
                        <td colSpan={9} className={styles.emptyState}>
                          <div className={styles.emptyStateWrap}>
                            <h4>You&apos;re almost ready for weather-aware planning</h4>
                            <p>
                              To generate recommendations we need connected commerce data, at least
                              30 days of order history, and one completed ingestion run.
                            </p>
                            <ul className={styles.emptyChecklist}>
                              <li>Connect Shopify, Meta, and Google Ads in Settings → Connectors</li>
                              <li>Run the worker pipeline or schedule nightly automation</li>
                              <li>Return here as soon as the first run completes (we&apos;ll email you)</li>
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        )}
      </div>
    </Layout>
  );
}
