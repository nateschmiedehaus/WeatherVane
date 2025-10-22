import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";

import { Layout } from "../components/Layout";
import { ContextPanel } from "../components/ContextPanel";
import styles from "../styles/weather-runbook.module.css";
import { fetchDashboard } from "../lib/api";
import { buildWeatherRunbookPayload, type WeatherRunbookPayload } from "../lib/weather-runbook";
import type { DashboardResponse } from "../types/dashboard";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";

type LoadingState = "idle" | "loading" | "error";

export default function WeatherRunbookPage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  const loadDashboard = useCallback(() => {
    let cancelled = false;
    setLoadingState("loading");
    fetchDashboard(TENANT_ID)
      .then((response) => {
        if (cancelled) return;
        setDashboard(response);
        setErrorMessage(null);
        setLoadingState("idle");
      })
      .catch((error) => {
        if (cancelled) return;
        setDashboard(null);
        setErrorMessage(error.message ?? "Failed to load WeatherOps dashboard data.");
        setLoadingState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cancel = loadDashboard();
    return cancel;
  }, [loadDashboard, reloadCount]);

  const runbook: WeatherRunbookPayload | null = useMemo(() => {
    if (!dashboard) {
      return null;
    }
    return buildWeatherRunbookPayload(dashboard);
  }, [dashboard]);

  const handleReload = () => setReloadCount((value) => value + 1);

  const contextTags = dashboard?.context_tags ?? [];
  const contextWarnings = dashboard?.context_warnings ?? [];
  const freshnessClass =
    runbook?.stalenessMinutes != null
      ? runbook.stalenessMinutes > 60
        ? styles.statusCaution
        : styles.statusSteady
      : styles.statusCaution;

  return (
    <Layout>
      <Head>
        <title>WeatherVane · Weather runbook</title>
      </Head>
      <div className={styles.root}>
        <section className={styles.hero}>
          <div className={styles.heroHeader}>
            <h2 className="ds-title">Weather capability runbook</h2>
            {runbook?.generatedAgo && (
              <span className={`${styles.statusPill} ${freshnessClass}`}>
                Refreshed {runbook.generatedAgo}
              </span>
            )}
            <p className="ds-body">
              Live guardrail, ingestion, automation, weather, and alert posture pulled from WeatherOps. Use this
              runbook to guide incident response and daily operating reviews.
            </p>
          </div>
          <dl className={styles.heroMeta}>
            <div>
              <dt className="ds-caption">Last WeatherOps refresh</dt>
              <dd className="ds-body-strong">{runbook?.generatedAtLabel ?? "Unknown"}</dd>
            </div>
            <div>
              <dt className="ds-caption">Tenant</dt>
              <dd className="ds-body-strong">{dashboard?.tenant_id ?? TENANT_ID}</dd>
            </div>
            <div>
              <dt className="ds-caption">Context tags</dt>
              <dd className="ds-body-strong">
                {contextTags.length === 0 ? "None" : contextTags.join(" · ")}
              </dd>
            </div>
          </dl>
          <div className={styles.heroActions}>
            <button
              type="button"
              onClick={handleReload}
              className={styles.reloadButton}
              disabled={loadingState === "loading"}
            >
              {loadingState === "loading" ? "Refreshing…" : "Refresh data"}
            </button>
            {errorMessage && <span className="ds-caption ds-eyebrow-neutral">{errorMessage}</span>}
          </div>
        </section>

        {(contextTags.length > 0 || contextWarnings.length > 0) && (
          <div className={styles.contextBlock}>
            <ContextPanel tags={contextTags} warnings={contextWarnings} />
          </div>
        )}

        {loadingState === "loading" && (
          <p className="ds-body" role="status">
            Loading WeatherOps data…
          </p>
        )}
        {loadingState === "error" && !errorMessage && (
          <p className="ds-body" role="alert">
            Failed to load WeatherOps data.
          </p>
        )}

        {runbook && (
          <>
            <section className={styles.sections} aria-label="Runbook sections">
              {runbook.sections.map((section) => (
                <article key={section.id} className={styles.sectionCard}>
                  <header className={styles.sectionHeader}>
                    <div>
                      <h3 className="ds-title">{section.title}</h3>
                      <p className={`${styles.owner} ds-caption`}>Primary owner · {section.owner}</p>
                    </div>
                    <span
                      className={`${styles.statusPill} ${
                        section.status === "critical"
                          ? styles.statusCritical
                          : section.status === "caution"
                            ? styles.statusCaution
                            : styles.statusSteady
                      }`}
                    >
                      {section.statusLabel}
                    </span>
                  </header>
                  <p className={`${styles.summary} ds-body`}>{section.summary}</p>
                  <ul className={styles.metrics}>
                    {section.metrics.map((metric) => (
                      <li
                        key={`${section.id}-${metric.label}`}
                        className={`${styles.metric} ${
                          metric.tone === "critical"
                            ? styles.toneCritical
                            : metric.tone === "caution"
                              ? styles.toneCaution
                              : metric.tone === "success"
                                ? styles.toneSuccess
                                : metric.tone === "info"
                                  ? styles.toneInfo
                                  : styles.toneMuted
                        }`}
                      >
                        <span className="ds-caption">{metric.label}</span>
                        <span className="ds-body-strong">{metric.value}</span>
                        {metric.helper && <span className="ds-caption">{metric.helper}</span>}
                      </li>
                    ))}
                  </ul>
                  <div className={styles.actions}>
                    <h4 className="ds-caption">Next actions</h4>
                    <ul>
                      {section.actions.map((action, index) => (
                        <li key={`${section.id}-action-${index}`} className="ds-body">
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={styles.escalation}>
                    <span className="ds-caption">Escalation channel</span>
                    <span className="ds-body-strong">{section.escalation}</span>
                  </div>
                </article>
              ))}
            </section>

            <section className={styles.monitoring} aria-label="Monitoring dashboards">
              <div className={styles.monitoringHeader}>
                <h3 className="ds-title">Monitoring dashboards</h3>
                <span className="ds-caption">
                  Built from live WeatherOps telemetry. Open each dashboard for deeper drill-downs.
                </span>
              </div>
              <div className={styles.monitoringGrid}>
                {runbook.dashboards.map((card) => (
                  <article key={card.id} className={styles.monitoringCard}>
                    <h4 className="ds-body-strong">{card.title}</h4>
                    <p className="ds-body">{card.summary}</p>
                    <div className={styles.monitoringStat}>
                      <span className="ds-caption">{card.statLabel}</span>
                      <strong>{card.statValue}</strong>
                      {card.helper && <span className="ds-caption">{card.helper}</span>}
                    </div>
                    {card.link && (
                      <Link href={card.link} className={styles.monitoringLink}>
                        View dashboard →
                      </Link>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  );
}
