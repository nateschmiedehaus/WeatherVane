import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";

import { Layout } from "../components/Layout";
import { ContextPanel } from "../components/ContextPanel";
import { RetryButton } from "../components/RetryButton";
import styles from "../styles/reports.module.css";
import { fetchReports } from "../lib/api";
import type { ReportsResponse, ReportNarrativeCard } from "../types/reports";
import {
  buildNarrativeSummary,
  buildReportSharePayload,
  buildTrendRows,
  deriveHeroView,
  formatCurrency,
  formatReportDate,
} from "../lib/reports-insights";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";
const HORIZON_DAYS = Number(process.env.NEXT_PUBLIC_PLAN_HORIZON ?? "7");

type ShareStatus = "idle" | "copied" | "error" | "email";

export default function ReportsPage() {
  const [report, setReport] = useState<ReportsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [shareFocusId, setShareFocusId] = useState<string | null>(null);

  const sharePayload = useMemo(() => {
    if (!report) {
      return "";
    }
    return buildReportSharePayload(report, {
      includeTrend: true,
      horizonDays: HORIZON_DAYS,
      focusNarrativeId: shareFocusId ?? undefined,
    });
  }, [report, shareFocusId]);

  const heroView = report ? deriveHeroView(report) : [];
  const trendRows = report ? buildTrendRows(report.trend.points) : [];
  const contextTags = report?.context_tags ?? [];
  const contextWarnings = report?.context_warnings ?? [];

  const fetchReportsData = useCallback(() => {
    let active = true;
    setLoading(true);
    fetchReports(TENANT_ID, HORIZON_DAYS)
      .then((payload) => {
        if (!active) return;
        setReport(payload);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message ?? "Failed to load executive report");
        setReport(null);
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
    const cancel = fetchReportsData();
    return cancel;
  }, [fetchReportsData, reloadCount]);

  const handleRetry = () => {
    setReloadCount((value) => value + 1);
  };

  const handleCopyShare = useCallback(async () => {
    if (!sharePayload) return;
    try {
      const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
      if (!clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await clipboard.writeText(sharePayload);
      setShareStatus("copied");
    } catch (copyError) {
      console.error("Failed to copy report briefing", copyError);
      setShareStatus("error");
    }
  }, [sharePayload]);

  const handleSlackShare = useCallback(async () => {
    await handleCopyShare();
  }, [handleCopyShare]);

  const handleEmailShare = useCallback(() => {
    if (!sharePayload) return;
    const subject = encodeURIComponent("WeatherVane executive weather report");
    const body = encodeURIComponent(sharePayload);
    if (typeof window !== "undefined") {
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }
    setShareStatus("email");
  }, [sharePayload]);

  const handleFocusNarrative = (card: ReportNarrativeCard) => {
    setShareFocusId(card.id);
    setShareStatus("idle");
  };

  const shareFeedback = useMemo(() => {
    switch (shareStatus) {
      case "copied":
        return "Briefing copied to clipboard.";
      case "email":
        return "Launching email composer with executive briefing.";
      case "error":
        return "Share failed. Use Cmd/Ctrl+C to copy manually.";
      default:
        return "";
    }
  }, [shareStatus]);
  const shareTone = shareStatus === "error" ? "critical" : shareStatus === "idle" ? "muted" : "success";

  const generatedAt = report?.generated_at ? formatReportDate(report.generated_at) : "—";
  const nextDelivery = report?.schedule.next_delivery_at
    ? formatReportDate(report.schedule.next_delivery_at)
    : "Not scheduled";
  const lastSent = report?.schedule.last_sent_at
    ? formatReportDate(report.schedule.last_sent_at)
    : "No deliveries yet";

  return (
    <Layout>
      <Head>
        <title>WeatherVane · Reports</title>
      </Head>
      <div className={styles.root}>
        <section className={styles.header}>
          <div>
            <h2 className="ds-display-small">Executive Reports</h2>
            <p className="ds-body">
              Story-driven spend narratives blending weather signals and finance outcomes. Share a
              memo-ready briefing in minutes with the confidence that guardrails stay intact.
            </p>
            <div className={styles.heroTiles}>
              {heroView.map((hero) => (
                <article key={hero.id} className={styles.heroTile}>
                  <header className={styles.cardHeader}>
                    <h3 className="ds-title-small">{hero.label}</h3>
                    {hero.deltaLabel ? (
                      <span className={styles.heroDelta} aria-label={`${hero.label} delta`}>
                        {hero.deltaLabel}
                      </span>
                    ) : null}
                  </header>
                  <p className={styles.heroMetric}>{hero.valueLabel}</p>
                  <p className={styles.heroNarrative}>{hero.narrative}</p>
                </article>
              ))}
            </div>
            <div className={styles.shareActions}>
              <button
                type="button"
                onClick={handleEmailShare}
                disabled={!report}
                className="ds-button"
                data-variant="ghost"
              >
                Share via email
              </button>
              <button
                type="button"
                onClick={handleSlackShare}
                disabled={!report}
                className="ds-button"
                data-variant="secondary"
              >
                Copy for Slack
              </button>
              <button
                type="button"
                onClick={handleCopyShare}
                disabled={!report}
                className="ds-button"
                data-variant="primary"
                data-state={shareStatus === "copied" ? "success" : shareStatus === "error" ? "error" : undefined}
              >
                Copy executive briefing
              </button>
              <span
                className={shareFeedback ? "ds-status" : "sr-only"}
                data-tone={shareFeedback ? shareTone : undefined}
                role="status"
                aria-live="polite"
              >
                {shareFeedback || " "}
              </span>
            </div>
          </div>
          <aside className={styles.meta}>
            <dl>
              <div>
                <dt className="ds-caption">Generated</dt>
                <dd className="ds-body-strong">{generatedAt}</dd>
              </div>
              <div>
                <dt className="ds-caption">Cadence</dt>
                <dd className="ds-body-strong">{report?.trend.cadence ?? `${HORIZON_DAYS}-day`}</dd>
              </div>
              <div>
                <dt className="ds-caption">Next delivery</dt>
                <dd className="ds-body-strong">{nextDelivery}</dd>
              </div>
              <div>
                <dt className="ds-caption">Recipients</dt>
                <dd className="ds-body-strong">
                  {report?.schedule.recipients?.length
                    ? report.schedule.recipients.join(", ")
                    : "Not configured"}
                </dd>
              </div>
            </dl>
          </aside>
        </section>

        {loading && (
          <p className={`${styles.status} ds-body`} role="status" aria-live="polite">
            Loading executive report…
          </p>
        )}

        {error && (
          <div className={styles.error} role="alert">
            <p className="ds-body">{error}</p>
            <RetryButton onClick={handleRetry}>Retry loading report</RetryButton>
          </div>
        )}

        {!loading && !error && report && (
          <>
            <section className={styles.contextSection}>
              <ContextPanel tags={contextTags} warnings={contextWarnings} />
            </section>

            <section className={styles.cards}>
              {report.narratives.length ? (
                report.narratives.map((card) => (
                  <article key={card.id} className={styles.card}>
                    <header className={styles.cardHeader}>
                      <h3 className="ds-title-small">{card.headline}</h3>
                      <span className={styles.chip} data-tone={card.confidence.toLowerCase()}>
                        {card.confidence} confidence
                      </span>
                    </header>
                    <p className={styles.cardSummary}>{buildNarrativeSummary(card)}</p>
                    <dl className="ds-metadata">
                      <div>
                        <dt>Spend</dt>
                        <dd>{formatCurrency(card.spend, "usd")}</dd>
                      </div>
                      <div>
                        <dt>Expected revenue</dt>
                        <dd>{formatCurrency(card.expected_revenue, "usd")}</dd>
                      </div>
                      <div>
                        <dt>Plan date</dt>
                        <dd>{formatReportDate(card.plan_date)}</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      onClick={() => handleFocusNarrative(card)}
                      className="ds-link"
                    >
                      Focus share on this narrative
                    </button>
                  </article>
                ))
              ) : (
                <p className={styles.cardEmpty}>
                  No narratives yet. Run ingest pipelines to populate spend stories.
                </p>
              )}
            </section>

            <section className={styles.trendSection}>
              <h3 className="ds-title-small">Trend explorer</h3>
              {trendRows.length ? (
                <table className={styles.trendTable}>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Recommended spend</th>
                      <th scope="col">Weather index</th>
                      <th scope="col">Guardrail score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendRows.map((row) => (
                      <tr key={row.dateLabel}>
                        <td>{row.dateLabel}</td>
                        <td>{row.spendLabel}</td>
                        <td>{row.weatherLabel}</td>
                        <td>{row.guardrailLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={styles.trendEmpty}>
                  Trend data will appear after the first weekly refresh with live spend coverage.
                </p>
              )}
            </section>

            <section className={styles.schedule}>
              <header className={styles.cardHeader}>
                <h3 className="ds-title-small">Export scheduler</h3>
                <span className={styles.scheduleStatus} data-state={report.schedule.status}>
                  {report.schedule.status.toUpperCase()}
                </span>
              </header>
              <ul className={styles.scheduleList}>
                <li>Cadence: {report.schedule.cadence}</li>
                <li>Delivery format: {report.schedule.delivery_format.toUpperCase()}</li>
                <li>Next delivery: {nextDelivery}</li>
                <li>Last sent: {lastSent}</li>
              </ul>
              <p className="ds-body">
                {report.schedule.note ?? "Weekly briefings are ready to send once recipients confirm."}
              </p>
            </section>

            <section className={styles.successCard}>
              <h3 className="ds-title-small">Success highlight</h3>
              <p className="ds-body">{report.success.summary}</p>
              <span className={styles.successMetric}>
                {formatCurrency(report.success.metric_value, report.success.metric_unit)}
              </span>
              <div className={styles.successActions}>
                <Link href={report.success.cta_href} className="ds-link">
                  {report.success.cta_label}
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
