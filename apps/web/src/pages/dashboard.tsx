import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

import { Layout } from "../components/Layout";
import styles from "../styles/dashboard.module.css";
import { fetchDashboard } from "../lib/api";
import { summarizeAlerts, summarizeGuardrails, summarizeIngestionLag, summarizeWeatherEvents } from "../lib/dashboard-insights";
import { buildDemoDashboard } from "../demo/dashboard";
import { useDemo } from "../lib/demo";
import type {
  DashboardAlert,
  DashboardResponse,
  GuardrailSegment,
  IngestionConnector,
  WeatherRiskEvent,
} from "../types/dashboard";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";

function formatCurrency(amount: number, unit: string = "usd"): string {
  if (!Number.isFinite(amount)) return "—";
  if (unit === "usd") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  }
  if (unit === "ratio") {
    return `${amount.toFixed(2)}×`;
  }
  if (unit === "pct") {
    return `${amount.toFixed(1)}%`;
  }
  return `${amount}`;
}

function formatDelta(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "±0%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatRelativeTime(raw: string | null | undefined): string {
  if (!raw) return "unknown";
  const timestamp = new Date(raw);
  if (Number.isNaN(timestamp.getTime())) return "unknown";
  const diffMs = Date.now() - timestamp.getTime();
  const diffMinutes = Math.round(diffMs / (60 * 1000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes === 1) return "1 minute ago";
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  const diffDays = Math.round(diffHours / 24);
  return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
}

function guardrailLabel(segment: GuardrailSegment): string {
  const valueLabel = formatCurrency(segment.value, segment.unit);
  const targetLabel = formatCurrency(segment.target, segment.unit);
  return `${valueLabel} · target ${targetLabel}`;
}

function connectorLagDescription(connector: IngestionConnector): string {
  const lag = `${connector.lag_minutes} min lag`;
  const sla = `SLA ${connector.sla_minutes} min`;
  return `${lag} · ${sla}`;
}

function sortEvents(events: WeatherRiskEvent[]): WeatherRiskEvent[] {
  return [...events].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
}

interface SparklineProps {
  values: number[];
  ariaLabel: string;
  tone?: "default" | "positive" | "negative";
}

function Sparkline({ values, ariaLabel, tone = "default" }: SparklineProps) {
  if (!values.length || values.every((value) => value === values[0])) {
    return <div className={styles.sparklinePlaceholder} aria-label={ariaLabel}>steady</div>;
  }

  const width = 120;
  const height = 44;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = values
    .map((value, idx) => {
      const x = (idx / (values.length - 1 || 1)) * width;
      const normalized = (value - min) / range;
      const y = height - normalized * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");
  const strokeClass =
    tone === "positive"
      ? styles.sparklinePositive
      : tone === "negative"
      ? styles.sparklineNegative
      : styles.sparklineDefault;

  return (
    <svg
      className={styles.sparkline}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
    >
      <polyline className={strokeClass} points={path} />
    </svg>
  );
}

interface RiskMapProps {
  events: WeatherRiskEvent[];
}

function RiskMap({ events }: RiskMapProps) {
  const LONG_MIN = -125;
  const LONG_MAX = -66;
  const LAT_MIN = 24;
  const LAT_MAX = 50;

  const markers = events
    .filter((event) => typeof event.longitude === "number" && typeof event.latitude === "number")
    .map((event) => {
      const lon = event.longitude as number;
      const lat = event.latitude as number;
      const x = ((lon - LONG_MIN) / (LONG_MAX - LONG_MIN)) * 100;
      const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * 100;
      return { event, x, y };
    });

  return (
    <div className={styles.mapShell} aria-hidden>
      <div className={styles.mapGradient} />
      {markers.map(({ event, x, y }) => (
        <div
          key={event.id}
          className={`${styles.mapMarker} ${styles[`mapMarker${event.severity}`] ?? ""}`}
          style={{ left: `${x}%`, top: `${y}%` }}
          data-analytics-id={`dashboard.weather_focus.${event.id}`}
        >
          <span className={styles.mapMarkerPulse} />
        </div>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const router = useRouter();
  const { isDemoActive, activateDemo } = useDemo();

  const demoParam = router.query.demo;
  const normalizedDemoParam = Array.isArray(demoParam) ? demoParam[0] : demoParam;
  const wantsDemo =
    router.isReady &&
    typeof normalizedDemoParam !== "undefined" &&
    normalizedDemoParam !== "0" &&
    normalizedDemoParam !== "false";

  useEffect(() => {
    if (wantsDemo && !isDemoActive) {
      activateDemo();
    }
  }, [wantsDemo, isDemoActive, activateDemo]);

  const isDemoMode = isDemoActive || wantsDemo;

  const loadDashboard = useCallback(() => {
    let active = true;
    setLoading(true);
    fetchDashboard(TENANT_ID)
      .then((res) => {
        if (!active) return;
        setSnapshot(res);
        setError(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setSnapshot(buildDemoDashboard());
        setError(err.message || "Falling back to demo telemetry.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isDemoMode) {
      setSnapshot(buildDemoDashboard());
      setLoading(false);
      setError(null);
      return;
    }
    return loadDashboard();
  }, [isDemoMode, loadDashboard, reloadCount]);

  const generatedAtIso = snapshot?.generated_at ?? null;

  const guardrailSummary = useMemo(
    () => summarizeGuardrails(snapshot?.guardrails ?? []),
    [snapshot?.guardrails],
  );
  const alertSummary = useMemo(
    () => summarizeAlerts(snapshot?.alerts ?? []),
    [snapshot?.alerts],
  );
  const ingestionSummary = useMemo(
    () => summarizeIngestionLag(snapshot?.ingestion ?? []),
    [snapshot?.ingestion],
  );
  const weatherSummary = useMemo(
    () =>
      summarizeWeatherEvents(
        snapshot?.weather_events ?? [],
        generatedAtIso ? new Date(generatedAtIso) : new Date(),
      ),
    [snapshot?.weather_events, generatedAtIso],
  );

  const nextEventStart = weatherSummary.nextEvent?.starts_at ?? null;

  return (
    <Layout>
      <Head>
        <title>WeatherOps Dashboard · WeatherVane</title>
      </Head>
      <div className={styles.page} data-testid="dashboard">
        <header className={styles.header}>
          <div>
            <p className="ds-eyebrow">WeatherOps</p>
            <h1 className="ds-display">Guardrail &amp; Weather Command Center</h1>
            <p className="ds-body">
              Track allocator guardrails, connector latency, and upcoming weather events so
              Autopilot stays one step ahead of risk.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={() => setReloadCount((count) => count + 1)}
              className="ds-button"
              data-analytics-id="dashboard.refresh"
              disabled={loading}
            >
              {loading ? "Refreshing…" : "Refresh telemetry"}
            </button>
            <Link
              href="/plan"
              className="ds-button-secondary"
              data-analytics-id="dashboard.guardrail_click"
            >
              Review guardrail queue
            </Link>
          </div>
        </header>

        {error && (
          <div className={`${styles.banner} ds-surface-glass`} role="alert">
            <strong className="ds-label-strong">Using demo telemetry.</strong>
            <span>{error}</span>
          </div>
        )}

        <section className={styles.hero}>
          <div className={`${styles.heroCard} ds-surface`}>
            <h2 className="ds-title">Guardrail health</h2>
            <p className="ds-body">
              {guardrailSummary.overallStatus === "healthy"
                ? "Guardrails holding steady."
                : guardrailSummary.overallStatus === "watch"
                ? "Watch list active; review ROAS drift."
                : "Immediate action required. CPA breach triggered pause."}
            </p>
            <dl className={styles.heroMetrics}>
              <div>
                <dt>Breaches</dt>
                <dd>{guardrailSummary.breachCount}</dd>
              </div>
              <div>
                <dt>Watchlist</dt>
                <dd>{guardrailSummary.watchCount}</dd>
              </div>
              <div>
                <dt>Healthy</dt>
                <dd>{guardrailSummary.healthyCount}</dd>
              </div>
            </dl>
            <p className={`${styles.heroDelta} ds-caption`}>
              Avg delta {guardrailSummary.averageDelta.toFixed(1)}%
            </p>
          </div>
          <div className={styles.guardrailGrid}>
            {(snapshot?.guardrails ?? []).map((segment) => (
              <article
                key={segment.name}
                className={`${styles.guardrailCard} ds-surface-glass`}
                data-analytics-id={`dashboard.guardrail.${segment.name.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <header>
                  <span className={`${styles.statusPill} ${styles[`status${segment.status}`]}`}>
                    {segment.status === "breach"
                      ? "Breach"
                      : segment.status === "watch"
                      ? "Watch"
                      : "Healthy"}
                  </span>
                  <h3 className="ds-label-strong">{segment.name}</h3>
                </header>
                <p className={styles.guardrailValue}>{guardrailLabel(segment)}</p>
                {segment.notes ? <p className="ds-caption">{segment.notes}</p> : null}
                <p className={`${styles.guardrailDelta} ds-caption`}>
                  {formatDelta(segment.delta_pct)} vs yesterday
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.trackers}>
          <header className={styles.sectionHeader}>
            <h2 className="ds-title">Spend &amp; revenue trackers</h2>
            <p className="ds-body">
              Monitor multi-channel pacing and share anomalies with Finance before they escalate.
            </p>
          </header>
          <div className={styles.trackerGrid}>
            {(snapshot?.spend_trackers ?? []).map((tracker) => {
              const tone = tracker.change_pct >= 0 ? "positive" : "negative";
              return (
                <article
                  key={tracker.name}
                  className={`${styles.trackerCard} ds-surface-glass`}
                  data-analytics-id={`dashboard.spend_hover.${tracker.name.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <header>
                    <h3 className="ds-label-strong">{tracker.name}</h3>
                    <span className="ds-caption">{tracker.channel}</span>
                  </header>
                  <p className={styles.trackerValue}>{formatCurrency(tracker.value)}</p>
                  <p className={`${styles.trackerDelta} ds-caption`}>
                    {formatDelta(tracker.change_pct)} vs target{" "}
                    {tracker.target ? formatCurrency(tracker.target) : ""}
                  </p>
                  <Sparkline
                    values={tracker.sparkline}
                    ariaLabel={`${tracker.name} trend`}
                    tone={tone === "positive" ? "positive" : tracker.change_pct === 0 ? "default" : "negative"}
                  />
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.weatherSection}>
          <header className={styles.sectionHeader}>
            <h2 className="ds-title">Weather risks &amp; timeline</h2>
            <p className="ds-body">
              Coordinate proactive moves with Priya and Leo — highlight risk windows before guardrails drift.
            </p>
          </header>
          <div className={styles.weatherGrid}>
            <RiskMap events={snapshot?.weather_events ?? []} />
            <ol className={styles.timeline} data-analytics-id="dashboard.weather_timeline">
              {sortEvents(snapshot?.weather_events ?? []).map((event) => {
                const startsIn = formatRelativeTime(event.starts_at);
                return (
                  <li key={event.id} className={`${styles.timelineItem} ds-surface-glass`}>
                    <header>
                      <span className={`${styles.severity} ${styles[`severity${event.severity}`]}`}>
                        {event.severity}
                      </span>
                      <h3 className="ds-label-strong">{event.title}</h3>
                    </header>
                    <p className="ds-body">{event.description}</p>
                    <p className="ds-caption">
                      {event.geo_region} · starts {startsIn}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
          {weatherSummary.nextEvent ? (
            <p className={`${styles.weatherCallout} ds-caption`}>
              Next event begins {formatRelativeTime(nextEventStart)} · {weatherSummary.highRiskCount} high-risk alerts in queue.
            </p>
          ) : null}
        </section>

        <section className={styles.automationSection}>
          <header className={styles.sectionHeader}>
            <h2 className="ds-title">Automation uptime</h2>
            <p className="ds-body">
              Confirm Autopilot handoffs remain safe. Incident history rolls up to guardrail callouts above.
            </p>
          </header>
          <div className={styles.automationGrid}>
            {(snapshot?.automation ?? []).map((lane) => (
              <article key={lane.name} className={`${styles.automationCard} ds-surface-glass`}>
                <header>
                  <h3 className="ds-label-strong">{lane.name}</h3>
                  <span className={`${styles.laneStatus} ${styles[`lane${lane.status}`]}`}>
                    {lane.status}
                  </span>
                </header>
                <p className={styles.automationValue}>{lane.uptime_pct.toFixed(1)}%</p>
                <p className="ds-caption">
                  {lane.incidents_7d} incidents last 7d · last at {formatRelativeTime(lane.last_incident_at)}
                </p>
                {lane.notes ? <p className="ds-body">{lane.notes}</p> : null}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.ingestionSection}>
          <header className={styles.sectionHeader}>
            <h2 className="ds-title">Ingestion telemetry</h2>
            <p className="ds-body">
              Keep connectors inside SLA so guardrails and forecasts stay fresh.
            </p>
          </header>
          <div className={styles.ingestionSummary}>
            <p className="ds-body">
              Average lag {Math.round(ingestionSummary.averageLagMinutes)} min ·{" "}
              {ingestionSummary.outOfSlaCount} out of SLA
            </p>
            {ingestionSummary.slowestConnector ? (
              <p className="ds-caption">
                Worst offender: {ingestionSummary.slowestConnector.name} ({connectorLagDescription(ingestionSummary.slowestConnector)})
              </p>
            ) : null}
          </div>
          <table className={`${styles.ingestionTable} ds-surface-glass`}>
            <thead>
              <tr>
                <th scope="col">Connector</th>
                <th scope="col">Source</th>
                <th scope="col">Lag</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot?.ingestion ?? []).map((connector) => (
                <tr
                  key={connector.name}
                  data-analytics-id={`dashboard.ingestion.${connector.name.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <th scope="row">{connector.name}</th>
                  <td>{connector.source}</td>
                  <td>{connectorLagDescription(connector)}</td>
                  <td>
                    <span className={`${styles.connectorStatus} ${styles[`connector${connector.status}`]}`}>
                      {connector.status}
                    </span>
                  </td>
                  <td>{formatRelativeTime(connector.last_synced_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={styles.alertSection}>
          <header className={styles.sectionHeader}>
            <h2 className="ds-title">Alert inbox</h2>
            <p className="ds-body">
              Triage and escalate incidents. Critical alerts pause Autopilot until acknowledged.
            </p>
          </header>
          <div className={styles.alertSummary} role="status">
            <p className="ds-body">
              {alertSummary.critical} critical · {alertSummary.warning} warnings · {alertSummary.info} briefs
            </p>
            <p className="ds-caption">{alertSummary.acknowledged} acknowledged in the last cycle.</p>
          </div>
          <ul className={styles.alertList}>
            {(snapshot?.alerts ?? []).map((alert) => (
              <li
                key={alert.id}
                className={`${styles.alertCard} ds-surface-glass`}
                data-analytics-id={`dashboard.alert.${alert.id}`}
              >
                <header>
                  <span className={`${styles.alertSeverity} ${styles[`alert${alert.severity}`]}`}>
                    {alert.severity}
                  </span>
                  <div>
                    <h3 className="ds-label-strong">{alert.title}</h3>
                    <p className="ds-caption">Raised {formatRelativeTime(alert.occurred_at)}</p>
                  </div>
                </header>
                <p className="ds-body">{alert.detail}</p>
                {alert.related_objects.length ? (
                  <p className="ds-caption">Linked: {alert.related_objects.join(", ")}</p>
                ) : null}
                <div className={styles.alertActions}>
                  <button
                    type="button"
                    className="ds-button-tertiary"
                    data-analytics-id="dashboard.alert_ack"
                  >
                    {alert.acknowledged ? "Acknowledged" : "Acknowledge"}
                  </button>
                  <button
                    type="button"
                    className="ds-button"
                    data-analytics-id="dashboard.alert_escalate"
                  >
                    Escalate via Slack
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Layout>
  );
}
