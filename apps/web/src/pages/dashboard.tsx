import Head from "next/head";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/router";

import { Layout } from "../components/Layout";
import styles from "../styles/dashboard.module.css";
import {
  acknowledgeDashboardAlert,
  escalateDashboardAlert,
  fetchDashboard,
  recordDashboardSuggestionEvent,
} from "../lib/api";
import { trackDashboardEvent } from "../lib/analytics";
import {
  summarizeAlerts,
  summarizeGuardrails,
  summarizeIngestionLag,
  summarizeEscalations,
  summarizeWeatherEvents,
  groupWeatherEventsByRegion,
  filterWeatherEventsByRegion,
  mapWeatherTimelineItems,
  normalizeWeatherRegionLabel,
  weatherRegionSlug,
  findRegionLabelBySlug,
  stackGuardrails,
  describeGuardrailHero,
  describeWeatherRegionGroup,
  formatRelativeTime,
  determineDashboardMode,
  type DashboardMode,
  type GuardrailSummary,
  type WeatherTimelineItem,
  buildWeatherFocusInsights,
  selectWeatherFocusSuggestion,
  buildWeatherSuggestionIdleStory,
  summarizeAllocatorPressure,
  summarizeSuggestionTelemetry,
  buildSuggestionTelemetryOverview,
  describeHighRiskAlerts,
  topAllocatorRecommendations,
  formatWeatherKpiValue,
  formatDashboardCount,
  type SuggestionHighRiskSeverity,
  type EngagementConfidenceLevel,
  type SuggestionTelemetryOverview,
  type WeatherFocusSuggestion,
} from "../lib/dashboard-insights";
import {
  buildSuggestionFocusEvent,
  buildSuggestionDismissEvent,
  buildSuggestionMetadata,
  buildSuggestionSignature,
  buildSuggestionViewEvent,
  resolveViewportBreakpoint,
  type ViewportBreakpoint,
  type WeatherSuggestionAnalyticsMetadata,
} from "../lib/dashboard-analytics";
import { buildDemoDashboard } from "../demo/dashboard";
import { useDemo } from "../lib/demo";
import type {
  AllocatorSummary,
  AutomationLane,
  DashboardAlert,
  DashboardResponse,
  GuardrailSegment,
  IngestionConnector,
  WeatherRiskEvent,
  WeatherKpi,
} from "../types/dashboard";

const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "demo-tenant";
const DEFAULT_ESCALATION_TARGET = "#weather-ops";
const SUGGESTION_TELEMETRY_LOOKBACK_HOURS = 48;

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

function formatPercentage(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0%";
  }
  if (value >= 0.999) {
    return "100%";
  }
  const scaled = value * 100;
  const fractionDigits = scaled >= 10 ? 1 : scaled >= 1 ? 1 : 2;
  return `${scaled.toFixed(fractionDigits)}%`;
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

type BadgeTone = "info" | "success" | "caution" | "critical" | "muted";

function guardrailBadge(status: GuardrailSegment["status"]): { tone: BadgeTone; label: string } {
  switch (status) {
    case "breach":
      return { tone: "critical", label: "Breach" };
    case "watch":
      return { tone: "caution", label: "Watch" };
    default:
      return { tone: "success", label: "Healthy" };
  }
}

function connectorBadge(status: IngestionConnector["status"]): { tone: BadgeTone; label: string } {
  switch (status) {
    case "delayed":
      return { tone: "caution", label: "Delayed" };
    case "failed":
      return { tone: "critical", label: "Failed" };
    case "syncing":
      return { tone: "info", label: "Syncing" };
    default:
      return { tone: "success", label: "Healthy" };
  }
}

function automationBadge(status: AutomationLane["status"]): { tone: BadgeTone; label: string } {
  switch (status) {
    case "degraded":
      return { tone: "caution", label: "Degraded" };
    case "paused":
      return { tone: "critical", label: "Paused" };
    default:
      return { tone: "success", label: "Normal" };
  }
}

function alertBadge(severity: DashboardAlert["severity"]): { tone: BadgeTone; label: string } {
  switch (severity) {
    case "critical":
      return { tone: "critical", label: "Critical" };
    case "warning":
      return { tone: "caution", label: "Warning" };
    default:
      return { tone: "info", label: "Info" };
  }
}

function weatherSeverityBadge(severity: WeatherRiskEvent["severity"]): { tone: BadgeTone; label: string } {
  switch (severity) {
    case "high":
      return { tone: "critical", label: "High" };
    case "medium":
      return { tone: "caution", label: "Medium" };
    default:
      return { tone: "info", label: "Low" };
  }
}

function contextSeverityBadge(severity: string | undefined): { tone: BadgeTone; label: string } {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
      return { tone: "critical", label: "Critical" };
    case "warning":
      return { tone: "caution", label: "Warning" };
    case "success":
      return { tone: "success", label: "Success" };
    case "info":
    default:
      return { tone: "info", label: "Info" };
  }
}

export interface SuggestionTelemetryTopSignalDisplay {
  region: string;
  summary: string | null;
  reason: string | null;
  meta: string;
  confidenceLevel: EngagementConfidenceLevel | null;
  highRiskBadge: string | null;
  highRiskDetail: string;
  highRiskSeverity: SuggestionHighRiskSeverity;
  highRiskCount: number;
}

export function buildSuggestionTelemetryTopSignal(
  overview: SuggestionTelemetryOverview | null | undefined,
): SuggestionTelemetryTopSignalDisplay | null {
  if (!overview?.topRegion) {
    return null;
  }

  const rateParts: string[] = [];
  if (overview.topEngagementRate !== null) {
    rateParts.push(`Engagement ${formatPercentage(overview.topEngagementRate)}`);
  }
  if (overview.topFocusRate !== null) {
    rateParts.push(`Focus ${formatPercentage(overview.topFocusRate)}`);
  }
  if (overview.topDismissRate !== null) {
    rateParts.push(`Dismiss ${formatPercentage(overview.topDismissRate)}`);
  }
  if (overview.topHasScheduledStart) {
    rateParts.push("Scheduled start");
  }

  const metaParts: string[] = [];
  const confidenceLabel = overview.topConfidenceLabel.trim();
  if (confidenceLabel) {
    metaParts.push(confidenceLabel);
  }
  if (overview.topGuardrailStatus) {
    const guardrailDescriptor = guardrailBadge(overview.topGuardrailStatus).label.toLowerCase();
    metaParts.push(`Guardrail ${guardrailDescriptor}`);
  }
  if (overview.topLayoutVariant) {
    metaParts.push(
      overview.topLayoutVariant === "dense" ? "Dense layout" : "Stacked layout",
    );
  }

  const highRiskCopy = describeHighRiskAlerts(
    overview.topHighRiskSeverity,
    overview.topHighRiskCount,
  );
  if (highRiskCopy.countLabel && !highRiskCopy.badge) {
    metaParts.push(highRiskCopy.countLabel);
  }
  if (highRiskCopy.badge) {
    metaParts.push(highRiskCopy.detail);
  }

  const topEventCount = overview.topEventCount;
  if (typeof topEventCount === "number" && topEventCount > 0) {
    const label = topEventCount === 1 ? "event tracked" : "events tracked";
    metaParts.push(`${formatDashboardCount(topEventCount)} ${label}`);
  }
  metaParts.push(...rateParts);

  return {
    region: overview.topRegion,
    summary: overview.topSummary,
    reason: overview.topReason,
    meta: metaParts.join(" · "),
    confidenceLevel: overview.topConfidenceLevel,
    highRiskBadge: highRiskCopy.badge,
    highRiskDetail: highRiskCopy.detail,
    highRiskSeverity: highRiskCopy.severity,
    highRiskCount: highRiskCopy.count,
  };
}

function sortEvents(events: WeatherRiskEvent[]): WeatherRiskEvent[] {
  return [...events].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
}

function toAnalyticsSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
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
  selectedRegion: string | null;
  onRegionSelect: (region: string) => void;
  regionSummaries: Record<string, string>;
}

function RiskMap({
  events,
  selectedRegion,
  onRegionSelect,
  regionSummaries,
}: RiskMapProps) {
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
      const regionLabel = normalizeWeatherRegionLabel(event.geo_region);
      const regionSlug = weatherRegionSlug(regionLabel);
      const summary = regionSummaries[regionLabel];
      const baseAriaLabel = `Focus weather events for ${regionLabel}`;
      const ariaLabel = summary ? `${baseAriaLabel}. ${summary}` : baseAriaLabel;
      return { event, x, y, regionLabel, regionSlug, summary, ariaLabel };
    });

  return (
    <div
      className={styles.mapShell}
      role="region"
      aria-label="Weather risk map"
      data-filtering={selectedRegion ? "true" : "false"}
      data-selected-region={selectedRegion ?? ""}
    >
      <div className={styles.mapGradient} aria-hidden />
      {markers.map(({ event, x, y, regionLabel, regionSlug, summary, ariaLabel }) => {
        const isActive = selectedRegion ? regionLabel === selectedRegion : false;
        const isDimmed = Boolean(selectedRegion) && !isActive;
        return (
          <button
            type="button"
            key={event.id}
            className={[
              styles.mapMarker,
              styles[`mapMarker${event.severity}`] ?? "",
              isDimmed ? styles.mapMarkerDimmed : "",
              isActive ? styles.mapMarkerActive : "",
            ]
            .filter(Boolean)
            .join(" ")}
            style={{ left: `${x}%`, top: `${y}%` }}
            data-analytics-id={`dashboard.weather_focus.marker.${regionSlug}`}
            data-region={regionSlug}
            data-selected={isActive ? "true" : "false"}
            aria-label={ariaLabel}
            title={summary ?? regionLabel}
            aria-pressed={isActive}
            onClick={() => onRegionSelect(regionLabel)}
          >
            <span className={styles.mapMarkerDot} />
            <span className={styles.mapMarkerPulse} />
          </button>
        );
      })}
    </div>
  );
}

interface GuardrailStackedBarProps {
  stack: ReturnType<typeof stackGuardrails>;
  onNavigate: () => void;
  summary: GuardrailSummary;
}

function GuardrailStackedBar({ stack, onNavigate, summary }: GuardrailStackedBarProps) {
  if (!stack.length) {
    return null;
  }

  const ariaText = `Guardrail health: ${summary.healthyCount} healthy, ${summary.watchCount} on watch, ${summary.breachCount} in breach`;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onNavigate();
    }
  };

  return (
    <div className={styles.guardrailBarContainer}>
      <div
        role="button"
        tabIndex={0}
        className={styles.guardrailBarInteractive}
        onClick={onNavigate}
        onKeyDown={handleKeyDown}
        data-analytics-id="dashboard.guardrail_click"
        aria-label={ariaText}
      >
        {stack.map((segment) => (
          <span
            key={segment.name}
            className={`${styles.guardrailBarSegment} ${styles[`guardrailBarSegment${segment.status}`] ?? ""}`}
            style={{ flexGrow: Math.max(segment.fraction, 0.05), flexBasis: 0 }}
            title={`${segment.name}: ${formatDelta(segment.deltaPct)}`}
          />
        ))}
      </div>
      <ul className={styles.guardrailBarLegend}>
        {stack.map((segment) => (
          <li key={segment.name}>
            <span className={`${styles.guardrailLegendDot} ${styles[`guardrailLegendDot${segment.status}`] ?? ""}`} />
            <span className="ds-caption">{segment.name}</span>
            <span className={`${styles.guardrailLegendDelta} ds-caption`}>{formatDelta(segment.deltaPct)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function DashboardPage() {
  const [snapshot, setSnapshot] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [ackPendingId, setAckPendingId] = useState<string | null>(null);
  const [escalatePendingId, setEscalatePendingId] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [focusedRegion, setFocusedRegion] = useState<string | null>(null);
  const suggestionViewRef = useRef<string | null>(null);
  const suggestionFocusRef = useRef<WeatherFocusSuggestion | null>(null);
  const suggestionMetadataRef = useRef<WeatherSuggestionAnalyticsMetadata | null>(null);
  const router = useRouter();
  const handleGuardrailNavigate = useCallback(() => {
    void router.push("/plan?focus=guardrails");
  }, [router]);
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
    const since = new Date(
      Date.now() - SUGGESTION_TELEMETRY_LOOKBACK_HOURS * 60 * 60 * 1000,
    );
    fetchDashboard(TENANT_ID, { since })
      .then((res) => {
        if (!active) return;
        setSnapshot(res);
        setTelemetryError(null);
        setAlertError(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setSnapshot(buildDemoDashboard());
        setTelemetryError(err.message || "Falling back to demo telemetry.");
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
      setTelemetryError(null);
      setAlertError(null);
      return;
    }
    return loadDashboard();
  }, [isDemoMode, loadDashboard, reloadCount]);

  const generatedAtIso = snapshot?.generated_at ?? null;
  const generatedAtDate = useMemo(
    () => (generatedAtIso ? new Date(generatedAtIso) : new Date()),
    [generatedAtIso],
  );

  const guardrails = useMemo(() => snapshot?.guardrails ?? [], [snapshot]);
  const alerts = useMemo(() => snapshot?.alerts ?? [], [snapshot]);
  const ingestionConnectors = useMemo(() => snapshot?.ingestion ?? [], [snapshot]);
  const weatherEvents = useMemo(() => snapshot?.weather_events ?? [], [snapshot]);
  const automationLanes = useMemo(() => snapshot?.automation ?? [], [snapshot]);
  const spendTrackers = useMemo(() => snapshot?.spend_trackers ?? [], [snapshot]);
  const contextTags = useMemo(() => snapshot?.context_tags ?? [], [snapshot]);
  const contextWarnings = useMemo(() => snapshot?.context_warnings ?? [], [snapshot]);
  const allocatorSummary = useMemo<AllocatorSummary | null>(
    () => snapshot?.allocator ?? null,
    [snapshot],
  );
  const weatherKpis = useMemo<WeatherKpi[]>(
    () => snapshot?.weather_kpis ?? [],
    [snapshot],
  );
  const suggestionTelemetry = useMemo(
    () => snapshot?.suggestion_telemetry ?? [],
    [snapshot],
  );
  const suggestionTelemetrySummary = useMemo(
    () => snapshot?.suggestion_telemetry_summary ?? null,
    [snapshot],
  );
  const suggestionTelemetrySummaries = useMemo(
    () => summarizeSuggestionTelemetry(suggestionTelemetry, { limit: 3 }),
    [suggestionTelemetry],
  );
  const suggestionTelemetryOverview = useMemo(
    () =>
      buildSuggestionTelemetryOverview(
        suggestionTelemetrySummary,
        suggestionTelemetry,
      ),
    [suggestionTelemetrySummary, suggestionTelemetry],
  );
  const suggestionTelemetryTopSignal = useMemo(
    () => buildSuggestionTelemetryTopSignal(suggestionTelemetryOverview),
    [suggestionTelemetryOverview],
  );
  const hasSuggestionTelemetry = suggestionTelemetrySummaries.length > 0;
  const showSuggestionTelemetryOverview =
    hasSuggestionTelemetry && !!suggestionTelemetryOverview?.hasSignals;

  const guardrailSummary = useMemo(
    () => summarizeGuardrails(guardrails),
    [guardrails],
  );
  const guardrailStack = useMemo(
    () => stackGuardrails(guardrails),
    [guardrails],
  );
  const guardrailCount = guardrails.length;
  const averageGuardrailDeltaLabel =
    guardrailCount > 0 ? `${guardrailSummary.averageDelta.toFixed(1)}%` : "—";
  const hasAlerts = alerts.length > 0;
  const hasAutomation = automationLanes.length > 0;
  const hasSpendTrackers = spendTrackers.length > 0;
  const hasIngestionConnectors = ingestionConnectors.length > 0;
  const alertSummary = useMemo(
    () => summarizeAlerts(alerts),
    [alerts],
  );
  const escalationSummary = useMemo(
    () => summarizeEscalations(alerts),
    [alerts],
  );
  const ingestionSummary = useMemo(
    () => summarizeIngestionLag(ingestionConnectors),
    [ingestionConnectors],
  );
  const weatherRegions = useMemo(
    () => groupWeatherEventsByRegion(weatherEvents),
    [weatherEvents],
  );
  const regionSummaries = useMemo(
    () =>
      weatherRegions.reduce<Record<string, string>>((acc, region) => {
        acc[region.region] = describeWeatherRegionGroup(region, {
          now: generatedAtDate,
        });
        return acc;
      }, {}),
    [weatherRegions, generatedAtDate],
  );
  const regionQuerySlug = useMemo(() => {
    if (!router.isReady) {
      return null;
    }
    const param = router.query.region;
    if (Array.isArray(param)) {
      return param[param.length - 1] ?? null;
    }
    return typeof param === "string" ? param : null;
  }, [router.isReady, router.query.region]);
  const filteredWeatherEvents = useMemo(
    () => filterWeatherEventsByRegion(weatherEvents, focusedRegion),
    [weatherEvents, focusedRegion],
  );
  const overallWeatherSummary = useMemo(
    () => summarizeWeatherEvents(weatherEvents, generatedAtDate),
    [weatherEvents, generatedAtDate],
  );
  const filteredWeatherSummary = useMemo(
    () => summarizeWeatherEvents(filteredWeatherEvents, generatedAtDate),
    [filteredWeatherEvents, generatedAtDate],
  );
  const weatherSummary = focusedRegion ? filteredWeatherSummary : overallWeatherSummary;
  const weatherTimelineEvents = useMemo(
    () => sortEvents(filteredWeatherEvents),
    [filteredWeatherEvents],
  );
  const weatherTimelineItems = useMemo<WeatherTimelineItem[]>(
    () => mapWeatherTimelineItems(weatherTimelineEvents, focusedRegion),
    [weatherTimelineEvents, focusedRegion],
  );
  const totalWeatherEvents = weatherEvents.length;
  const allRegionsSummary = useMemo(() => {
    const eventLabel =
      totalWeatherEvents === 1 ? "1 event" : `${totalWeatherEvents} events`;
    const highRiskLabel =
      overallWeatherSummary.highRiskCount === 0
        ? "No high-risk alerts"
        : `${overallWeatherSummary.highRiskCount} high-risk alert${
            overallWeatherSummary.highRiskCount === 1 ? "" : "s"
          }`;
    const scheduleLabel = overallWeatherSummary.nextEvent
      ? `Next starts ${formatRelativeTime(
          overallWeatherSummary.nextEvent.starts_at,
          { now: generatedAtDate },
        )}`
      : "No upcoming events scheduled";
    return `${eventLabel} · ${highRiskLabel} · ${scheduleLabel}`;
  }, [totalWeatherEvents, overallWeatherSummary, generatedAtDate]);
  const isRegionFiltering = focusedRegion !== null;
  const computeSuggestionMetadata = useCallback(
    (
      suggestion: WeatherFocusSuggestion,
      viewportBreakpoint: ViewportBreakpoint | null | undefined,
    ): WeatherSuggestionAnalyticsMetadata =>
      buildSuggestionMetadata({
        suggestion,
        viewportBreakpoint,
        isRegionFiltering,
        regionSummaries,
        isDemoMode,
        guardrailStatus: guardrailSummary.overallStatus,
        criticalAlertCount: alertSummary.critical,
        previousMetadata: suggestionMetadataRef.current,
      }),
    [
      isRegionFiltering,
      regionSummaries,
      isDemoMode,
      guardrailSummary.overallStatus,
      alertSummary.critical,
    ],
  );
  const activeRegionSummary = useMemo(
    () => (focusedRegion ? regionSummaries[focusedRegion] ?? null : null),
    [focusedRegion, regionSummaries],
  );
  const suggestedRegion = useMemo(
    () =>
      isRegionFiltering
        ? null
        : selectWeatherFocusSuggestion(weatherRegions, { now: generatedAtDate }),
    [isRegionFiltering, weatherRegions, generatedAtDate],
  );
  const suggestionIdleStory = useMemo(
    () => buildWeatherSuggestionIdleStory(weatherRegions, { now: generatedAtDate }),
    [weatherRegions, generatedAtDate],
  );
  const allocatorPressure = useMemo(
    () => summarizeAllocatorPressure(allocatorSummary),
    [allocatorSummary],
  );
  const allocatorRecommendations = useMemo(
    () => topAllocatorRecommendations(allocatorSummary, 3),
    [allocatorSummary],
  );

  useEffect(() => {
    if (isRegionFiltering || !suggestedRegion) {
      suggestionViewRef.current = null;
      suggestionMetadataRef.current = null;
      return;
    }
    const signature = buildSuggestionSignature(suggestedRegion);
    if (suggestionViewRef.current === signature) {
      return;
    }
    suggestionViewRef.current = signature;
    emitSuggestionEvent(buildSuggestionViewEvent, suggestedRegion);
  }, [emitSuggestionEvent, isRegionFiltering, suggestedRegion]);

  useEffect(() => {
    const trackedSuggestion = suggestionFocusRef.current;
    if (!trackedSuggestion) {
      return;
    }
    if (focusedRegion === trackedSuggestion.region) {
      return;
    }
    emitSuggestionEvent(buildSuggestionDismissEvent, trackedSuggestion);
    suggestionFocusRef.current = null;
  }, [emitSuggestionEvent, focusedRegion]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    if (!regionQuerySlug) {
      return;
    }
    if (!weatherRegions.length) {
      return;
    }

    const matchedRegion = findRegionLabelBySlug(weatherRegions, regionQuerySlug);
    if (matchedRegion) {
      if (matchedRegion !== focusedRegion) {
        setFocusedRegion(matchedRegion);
      }
      return;
    }

    const nextQuery = { ...router.query };
    delete nextQuery.region;
    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true, scroll: false },
    );
  }, [router, router.query, weatherRegions, regionQuerySlug, focusedRegion]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    const targetSlug = focusedRegion ? weatherRegionSlug(focusedRegion) : null;
    if (targetSlug === regionQuerySlug) {
      return;
    }

    const nextQuery = { ...router.query };
    if (targetSlug) {
      nextQuery.region = targetSlug;
    } else {
      delete nextQuery.region;
    }

    void router.replace(
      { pathname: router.pathname, query: nextQuery },
      undefined,
      { shallow: true, scroll: false },
    );
  }, [router, router.query, focusedRegion, regionQuerySlug]);

  useEffect(() => {
    if (!focusedRegion) {
      return;
    }
    if (!weatherRegions.some((region) => region.region === focusedRegion)) {
      setFocusedRegion(null);
    }
  }, [focusedRegion, weatherRegions]);

  const nextEventStart = weatherSummary.nextEvent?.starts_at ?? null;
  const dashboardMode: DashboardMode = useMemo(
    () =>
      determineDashboardMode({
        guardrails: guardrailSummary,
        alerts: alertSummary,
        generatedAt: generatedAtIso ?? undefined,
      }),
    [guardrailSummary, alertSummary, generatedAtIso],
  );
  const lastEscalationRelative = useMemo(
    () =>
      escalationSummary.lastEscalatedAt
        ? formatRelativeTime(escalationSummary.lastEscalatedAt)
        : null,
    [escalationSummary.lastEscalatedAt],
  );
  const lastEscalationChannelLabel = useMemo(() => {
    const channel = escalationSummary.lastEscalationChannel;
    if (!channel) {
      return null;
    }
    return channel.charAt(0).toUpperCase() + channel.slice(1);
  }, [escalationSummary.lastEscalationChannel]);
  const lastEscalationDescription = useMemo(() => {
    if (!escalationSummary.lastEscalatedAt) {
      return "No escalations recorded this cycle.";
    }
    const target = escalationSummary.lastEscalatedTarget ?? "—";
    const channel = lastEscalationChannelLabel ? ` via ${lastEscalationChannelLabel}` : "";
    const timing = lastEscalationRelative ? ` · ${lastEscalationRelative}` : "";
    return `Last escalated to ${target}${channel}${timing}.`;
  }, [
    escalationSummary.lastEscalatedAt,
    escalationSummary.lastEscalatedTarget,
    lastEscalationChannelLabel,
    lastEscalationRelative,
  ]);

  const handleRegionToggle = useCallback((regionLabel: string) => {
    setFocusedRegion((current) => (current === regionLabel ? null : regionLabel));
  }, []);

  const emitSuggestionEvent = useCallback(
    (builder: typeof buildSuggestionViewEvent, suggestion: WeatherFocusSuggestion) => {
      const viewportBreakpoint =
        typeof window === "undefined"
          ? undefined
          : resolveViewportBreakpoint(window.innerWidth);
      const metadata = computeSuggestionMetadata(suggestion, viewportBreakpoint);
      suggestionMetadataRef.current = metadata;
      const { event, payload } = builder(suggestion, { viewportBreakpoint, metadata });
      trackDashboardEvent(event, payload);
      void recordDashboardSuggestionEvent({
        tenantId: TENANT_ID,
        event,
        payload,
        occurredAt: new Date().toISOString(),
      });
      return { event, payload };
    },
    [computeSuggestionMetadata],
  );

  const handleSuggestionFocus = useCallback(
    (suggestion: WeatherFocusSuggestion) => {
      emitSuggestionEvent(buildSuggestionFocusEvent, suggestion);
      suggestionFocusRef.current = suggestion;
      setFocusedRegion(suggestion.region);
    },
    [emitSuggestionEvent, setFocusedRegion],
  );

  const handleRegionClear = useCallback(() => {
    setFocusedRegion(null);
  }, []);

  const { calloutText: weatherCalloutText, regionFocus } = useMemo(
    () =>
      buildWeatherFocusInsights({
        focusedRegion,
        isRegionFiltering,
        weatherSummary,
        timelineLength: weatherTimelineItems.length,
        nextEventStart,
        regionSummary: activeRegionSummary ?? undefined,
      }),
    [
      focusedRegion,
      isRegionFiltering,
      weatherSummary,
      weatherTimelineItems.length,
      nextEventStart,
      activeRegionSummary,
    ],
  );

  const modeMeta = useMemo(() => {
    const weatherSnippet =
      nextEventStart !== null
        ? `Next weather event begins ${formatRelativeTime(nextEventStart)}.`
        : weatherSummary.highRiskCount > 0
        ? `${weatherSummary.highRiskCount} high-risk weather alerts in queue.`
        : "No high-risk weather events in queue.";

    switch (dashboardMode) {
      case "incident":
        return {
          title: "Incident mode",
          description:
            "Guardrail breach detected. Coordinate a fix in Plan before re-enabling Autopilot.",
          analyticsId: "dashboard.incident_mode",
          toneClass: styles.modeBannerIncident,
          cta: (
            <button
              type="button"
              className="ds-button-tertiary"
              onClick={handleGuardrailNavigate}
              data-analytics-id="dashboard.incident_mode.guardrail_cta"
            >
              Jump to guardrails
            </button>
          ),
        };
      case "watch":
        return {
          title: "Watchlist active",
          description: `Guardrails trending towards breach. Review spend deltas and connector lag. ${weatherSnippet}`,
          analyticsId: "dashboard.watch_mode",
          toneClass: styles.modeBannerWatch,
          cta: null,
        };
      case "offline":
        return {
          title: "Telemetry paused",
          description:
            "Data is older than 30 minutes. Confirm ingestion health or refresh telemetry to resume live monitoring.",
          analyticsId: "dashboard.offline_mode",
          toneClass: styles.modeBannerOffline,
          cta: null,
        };
      default:
        return {
          title: "Morning brief",
          description: `All guardrails stable. ${weatherSnippet}`,
          analyticsId: "dashboard.morning_brief",
          toneClass: styles.modeBannerBrief,
          cta: null,
        };
    }
  }, [dashboardMode, nextEventStart, weatherSummary.highRiskCount, handleGuardrailNavigate]);

  const pageClassName =
    dashboardMode === "offline" ? `${styles.page} ${styles.pageOffline}` : styles.page;

  const latestSuggestionTelemetryAt = useMemo(
    () =>
      suggestionTelemetrySummaries.length > 0
        ? suggestionTelemetrySummaries[0].lastOccurredAt
        : null,
    [suggestionTelemetrySummaries],
  );

  const handleAcknowledge = useCallback(
    async (alertId: string) => {
      setAlertError(null);
      if (isDemoMode) {
        setSnapshot((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            alerts: prev.alerts.map((alert) =>
              alert.id === alertId ? { ...alert, acknowledged: true } : alert,
            ),
          };
        });
        return;
      }
      setAckPendingId(alertId);
      try {
        await acknowledgeDashboardAlert(TENANT_ID, alertId);
        setSnapshot((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            alerts: prev.alerts.map((alert) =>
              alert.id === alertId ? { ...alert, acknowledged: true } : alert,
            ),
          };
        });
      } catch (ackErr) {
        const message =
          ackErr instanceof Error
            ? ackErr.message
            : "Failed to acknowledge alert. Please try again.";
        setAlertError(message);
      } finally {
        setAckPendingId(null);
      }
    },
    [isDemoMode, setAlertError, setSnapshot, setAckPendingId],
  );

  const handleEscalate = useCallback(
    async (alertId: string) => {
      setAlertError(null);
      const target = DEFAULT_ESCALATION_TARGET;
      if (isDemoMode) {
        setSnapshot((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            alerts: prev.alerts.map((alert) =>
              alert.id === alertId ? { ...alert, escalated_to: target } : alert,
            ),
          };
        });
        return;
      }
      setEscalatePendingId(alertId);
      try {
        await escalateDashboardAlert(TENANT_ID, alertId, { channel: "slack", target });
        setSnapshot((prev) => {
          if (!prev) {
            return prev;
          }
          return {
            ...prev,
            alerts: prev.alerts.map((alert) =>
              alert.id === alertId ? { ...alert, escalated_to: target } : alert,
            ),
          };
        });
      } catch (escErr) {
        const message =
          escErr instanceof Error
            ? escErr.message
            : "Failed to escalate alert. Please try again.";
        setAlertError(message);
      } finally {
        setEscalatePendingId(null);
      }
    },
    [isDemoMode, setAlertError, setEscalatePendingId, setSnapshot],
  );

  return (
    <Layout>
      <Head>
        <title>WeatherOps Dashboard · WeatherVane</title>
      </Head>
      <div className={pageClassName} data-testid="dashboard">
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
              data-analytics-id="dashboard.guardrail_queue"
            >
              Review guardrail queue
            </Link>
          </div>
        </header>

        {modeMeta ? (
          <section
            className={`${styles.modeBanner} ${modeMeta.toneClass}`}
            role="status"
            aria-live="polite"
            data-analytics-id={modeMeta.analyticsId}
          >
            <div>
              <p className="ds-eyebrow">{modeMeta.title}</p>
              <p className="ds-body">{modeMeta.description}</p>
            </div>
            {modeMeta.cta}
          </section>
        ) : null}

        {telemetryError && (
          <div className={`${styles.banner} ds-surface-glass`} role="alert">
            <strong className="ds-label-strong">Using demo telemetry.</strong>
            <span>{telemetryError}</span>
          </div>
        )}

        <section className={styles.hero}>
          <div className={`${styles.heroCard} ds-surface`}>
            <h2 className="ds-title">Guardrail health</h2>
            <p className="ds-body">
              {describeGuardrailHero(guardrailSummary, { guardrailCount })}
            </p>
            <GuardrailStackedBar
              stack={guardrailStack}
              onNavigate={handleGuardrailNavigate}
              summary={guardrailSummary}
            />
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
              Avg delta {averageGuardrailDeltaLabel}
            </p>
          </div>
          <div className={styles.guardrailGrid}>
            {guardrailCount === 0 ? (
              <article
                className={`${styles.emptyStateCard} ds-surface`}
                data-analytics-id="dashboard.guardrail.empty_state"
              >
                <h3 className="ds-label-strong">Publish your first guardrail</h3>
                <p className="ds-body">
                  Set guardrail thresholds in Plan to unlock live drift monitoring and incident
                  automation here.
                </p>
                <div className={styles.emptyStateActions}>
                  <Link
                    href="/plan?focus=guardrails"
                    className="ds-button-tertiary"
                    data-analytics-id="dashboard.guardrail.empty_state.plan_cta"
                  >
                    Launch Plan
                  </Link>
                </div>
              </article>
            ) : guardrails.map((segment) => {
              const statusMeta = guardrailBadge(segment.status);
              return (
                <article
                  key={segment.name}
                  className={`${styles.guardrailCard} ds-surface-glass`}
                  data-analytics-id={`dashboard.guardrail.${segment.name
                    .toLowerCase()
                    .replace(/\s+/g, "-")}`}
                >
                  <header>
                    <span className={`ds-badge ${styles.badgeUpper}`} data-tone={statusMeta.tone}>
                      {statusMeta.label}
                    </span>
                    <h3 className="ds-label-strong">{segment.name}</h3>
                  </header>
                  <p className={styles.guardrailValue}>{guardrailLabel(segment)}</p>
                  {segment.notes ? <p className="ds-caption">{segment.notes}</p> : null}
                  <p className={`${styles.guardrailDelta} ds-caption`}>
                    {formatDelta(segment.delta_pct)} vs yesterday
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        {allocatorSummary ? (
          <section className={styles.allocatorSection}>
            <header className={styles.sectionHeader}>
              <h2 className="ds-title">Allocator outlook</h2>
              <p className="ds-body">
                Surface guardrail-aware reallocations before they escalate into incidents.
              </p>
            </header>
            <div className={styles.allocatorGrid}>
              <article className={`${styles.allocatorSummaryCard} ds-surface`}>
                <header className={styles.allocatorSummaryHeader}>
                  <span
                    className={`ds-badge ${styles.badgeUpper}`}
                    data-tone={allocatorPressure.tone}
                  >
                    {allocatorSummary.mode.charAt(0).toUpperCase() +
                      allocatorSummary.mode.slice(1)}
                  </span>
                  <p className="ds-body">{allocatorPressure.message}</p>
                </header>
                <dl className={styles.allocatorMetrics}>
                  <div>
                    <dt>Spend after</dt>
                    <dd>{formatCurrency(allocatorSummary.total_spend)}</dd>
                  </div>
                  <div>
                    <dt>Change vs baseline</dt>
                    <dd>
                      {formatCurrency(allocatorSummary.total_spend_delta)}
                      <span className={styles.allocatorDelta}>
                        {formatDelta(allocatorSummary.total_spend_delta_pct)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Guardrail breaches</dt>
                    <dd>{allocatorSummary.guardrail_breaches}</dd>
                  </div>
                </dl>
                {allocatorSummary.notes.length ? (
                  <p className={`${styles.allocatorNote} ds-caption`}>
                    {allocatorSummary.notes[0]}
                  </p>
                ) : null}
              </article>
              <div className={styles.allocatorRecommendations}>
                <h3 className="ds-label-strong">Priority adjustments</h3>
                {allocatorRecommendations.length ? (
                  <ul>
                    {allocatorRecommendations.map((recommendation) => {
                      const tone =
                        recommendation.severity === "critical"
                          ? "critical"
                          : recommendation.severity === "warning"
                          ? "caution"
                          : "info";
                      return (
                        <li
                          key={`${recommendation.platform}-${tone}`}
                          className={`${styles.allocatorRecommendationCard} ds-surface-glass`}
                          data-analytics-id={`dashboard.allocator.recommendation.${recommendation.platform
                            .toLowerCase()
                            .replace(/\\s+/g, "-")}`}
                        >
                          <header>
                            <span className={`ds-badge ${styles.badgeUpper}`} data-tone={tone}>
                              {recommendation.severity === "critical"
                                ? "Critical"
                                : recommendation.severity === "warning"
                                ? "Watch"
                                : "Info"}
                            </span>
                            <h4 className="ds-label-strong">{recommendation.platform}</h4>
                          </header>
                          <p className={styles.allocatorRecommendationValue}>
                            {formatCurrency(recommendation.spend_delta)}
                            <span className={styles.allocatorDelta}>
                              {formatDelta(recommendation.spend_delta_pct)}
                            </span>
                          </p>
                          <p className="ds-caption">
                            {recommendation.top_guardrail ?? "Allocator adjustment"}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="ds-caption">
                    No allocator adjustments are queued for review.
                  </p>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {contextWarnings.length > 0 || contextTags.length > 0 ? (
          <section className={styles.contextSection}>
            <header className={styles.sectionHeader}>
              <h2 className="ds-title">Telemetry context</h2>
              <p className="ds-body">
                Autopilot tags highlight active guardrails and ingestion caveats for this tenant.
              </p>
            </header>
            {contextTags.length ? (
              <div className={styles.tagList} data-analytics-id="dashboard.context_tags">
                {contextTags.map((tag) => (
                  <span key={tag} className={styles.tagChip}>
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {contextWarnings.length ? (
              <ul className={styles.contextList} data-analytics-id="dashboard.context_warnings">
                {contextWarnings.map((warning) => {
                  const severityRaw =
                    typeof warning.severity === "string" ? warning.severity : "info";
                  const severityMeta = contextSeverityBadge(severityRaw);
                  const codeLabel =
                    typeof warning.code === "string"
                      ? warning.code.replace(/_/g, " ")
                      : "Context warning";
                  return (
                    <li key={`${warning.code}-${warning.message}`} className={`${styles.contextCard} ds-surface-glass`}>
                      <header>
                        <span
                          className={`ds-badge ${styles.badgeUpper}`}
                          data-tone={severityMeta.tone}
                        >
                          {severityMeta.label}
                        </span>
                        <h3 className="ds-label-strong">{codeLabel}</h3>
                      </header>
                      <p className="ds-body">{warning.message}</p>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section className={styles.trackers}>
          <header className={styles.sectionHeader}>
            <h2 className="ds-title">Spend &amp; revenue trackers</h2>
            <p className="ds-body">
              Monitor multi-channel pacing and share anomalies with Finance before they escalate.
            </p>
          </header>
          <div className={styles.trackerGrid}>
            {!hasSpendTrackers ? (
              <article
                className={`${styles.emptyStateCard} ds-surface`}
                data-analytics-id="dashboard.trackers.empty_state"
                data-size="compact"
              >
                <h3 className="ds-label-strong">Connect pacing trackers</h3>
                <p className="ds-body">
                  Hook up revenue and spend data sources to spotlight anomalies before they
                  hit Finance.
                </p>
              </article>
            ) : (
              spendTrackers.map((tracker) => {
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
              })
            )}
          </div>
        </section>

        {weatherKpis.length ? (
          <section className={styles.weatherKpiSection}>
            <header className={styles.sectionHeader}>
              <h2 className="ds-title">Weather KPIs</h2>
              <p className="ds-body">
                Track weather-driven impact on demand and lead time before it hits guardrails.
              </p>
            </header>
            <div className={styles.weatherKpiGrid}>
              {weatherKpis.map((kpi) => {
                const sparklineTone =
                  kpi.delta_pct && kpi.delta_pct > 0
                    ? "positive"
                    : kpi.delta_pct && kpi.delta_pct < 0
                    ? "negative"
                    : "default";
                return (
                  <article
                    key={kpi.id}
                    className={`${styles.weatherKpiCard} ds-surface-glass`}
                    data-analytics-id={`dashboard.weather_kpi.${kpi.id}`}
                  >
                    <header>
                      <h3 className="ds-label-strong">{kpi.label}</h3>
                    </header>
                    <p className={styles.weatherKpiValue}>{formatWeatherKpiValue(kpi)}</p>
                    <p className={`${styles.weatherKpiDelta} ds-caption`}>
                      {kpi.delta_pct !== null && kpi.delta_pct !== undefined
                        ? formatDelta(kpi.delta_pct)
                        : "—"}
                    </p>
                    <Sparkline
                      values={kpi.sparkline}
                      ariaLabel={`${kpi.label} trend`}
                      tone={sparklineTone}
                    />
                    <p className="ds-caption">{kpi.description}</p>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className={styles.weatherSection}>
          <header className={styles.sectionHeader}>
            <h2 className="ds-title">Weather risks &amp; timeline</h2>
            <p className="ds-body">
              Coordinate proactive moves with Priya and Leo — highlight risk windows before guardrails drift.
            </p>
          </header>
          <div
            className={styles.regionFilters}
            role="toolbar"
            aria-label="Filter weather events by region"
            data-filtering={isRegionFiltering ? "true" : "false"}
            data-selected-region={focusedRegion ?? ""}
          >
            <button
              type="button"
              className={`${styles.regionFilterButton} ${
                !isRegionFiltering ? styles.regionFilterButtonActive : ""
              }`}
              onClick={handleRegionClear}
              aria-pressed={!isRegionFiltering}
              aria-label={`All regions. ${allRegionsSummary}`}
              title={allRegionsSummary}
              data-analytics-id="dashboard.weather_focus.region.all"
              data-severity="all"
              data-active={!isRegionFiltering ? "true" : "false"}
            >
              <span className={styles.regionFilterLabel}>All regions</span>
              <span className={styles.regionFilterMeta}>
                {totalWeatherEvents} {totalWeatherEvents === 1 ? "event" : "events"}
              </span>
            </button>
            {weatherRegions.map((region) => {
              const isActive = focusedRegion === region.region;
              const slug = weatherRegionSlug(region.region);
              const summary = regionSummaries[region.region];
              const accessibleLabel = summary
                ? `${region.region}. ${summary}`
                : region.region;
              return (
                <button
                  type="button"
                  key={region.region}
                  className={`${styles.regionFilterButton} ${
                    isActive ? styles.regionFilterButtonActive : ""
                  }`}
                  onClick={() => handleRegionToggle(region.region)}
                  aria-pressed={isActive}
                  aria-label={accessibleLabel}
                  title={summary ?? region.region}
                  data-analytics-id={`dashboard.weather_focus.region.${slug}`}
                  data-severity={region.highestSeverity ?? "low"}
                  data-active={isActive ? "true" : "false"}
                >
                  <span className={styles.regionFilterLabel}>{region.region}</span>
                  <span className={styles.regionFilterMeta}>
                    {region.eventCount} {region.eventCount === 1 ? "event" : "events"}
                  </span>
                  {region.highRiskCount > 0 ? (
                    <span className={styles.regionFilterPriority}>
                      {region.highRiskCount} high-risk
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {!isRegionFiltering && suggestedRegion ? (
            <div
              className={styles.regionSuggestionBanner}
              role="status"
              aria-live="polite"
              data-analytics-id="dashboard.weather_focus.suggestion"
              data-severity={suggestedRegion.severity ?? "low"}
            >
              <div className={styles.regionSuggestionText}>
                <span className={styles.regionSuggestionRegion}>
                  {suggestedRegion.region}
                </span>
                <span className={styles.regionSuggestionMeta}>
                  {suggestedRegion.summary}
                </span>
                <span className={styles.regionSuggestionReason}>
                  {suggestedRegion.reason}
                </span>
              </div>
              <button
                type="button"
                className={`${styles.regionSuggestionAction} ds-button-tertiary`}
                onClick={() => handleSuggestionFocus(suggestedRegion)}
                data-analytics-id="dashboard.weather_focus.suggestion.focus"
                aria-label={`Focus on ${suggestedRegion.region}. ${suggestedRegion.reason}`}
              >
                Focus this region
              </button>
            </div>
          ) : null}
          {!isRegionFiltering && !suggestedRegion ? (
            <div
              className={styles.regionSuggestionBanner}
              role="status"
              aria-live="polite"
              data-analytics-id="dashboard.weather_focus.suggestion.idle"
              data-variant="idle"
            >
              <div className={styles.regionSuggestionText}>
                <span className={styles.regionSuggestionRegion}>
                  {suggestionIdleStory.heading}
                </span>
                <span className={styles.regionSuggestionMeta}>
                  {suggestionIdleStory.detail}
                </span>
                <span className={styles.regionSuggestionReason}>
                  {suggestionIdleStory.caption}
                </span>
              </div>
            </div>
          ) : null}
          <section
            className={styles.suggestionTelemetrySection}
            aria-labelledby="suggestion-telemetry-heading"
            data-analytics-id="dashboard.weather_focus.telemetry"
          >
            <div className={styles.suggestionTelemetryHeader}>
              <p id="suggestion-telemetry-heading" className="ds-eyebrow">
                Suggestion engagement
              </p>
              <span className="ds-caption">
                {latestSuggestionTelemetryAt
                  ? `Last seen ${formatRelativeTime(latestSuggestionTelemetryAt, { now: generatedAtDate })}`
                  : "No recent telemetry"}
              </span>
            </div>
            {showSuggestionTelemetryOverview && suggestionTelemetryOverview ? (
              <dl className={styles.suggestionTelemetryOverview}>
                {suggestionTelemetryTopSignal ? (
                  <div
                    className={styles.suggestionTelemetryTopSignal}
                    data-confidence-level={
                      suggestionTelemetryTopSignal.confidenceLevel ?? undefined
                    }
                  >
                    <dt className="ds-caption">Top signal</dt>
                    <dd>
                      <div className={styles.suggestionTelemetryTopSignalHeader}>
                        <span className={styles.suggestionTelemetryTopSignalLabel}>
                          {suggestionTelemetryTopSignal.region}
                        </span>
                        {suggestionTelemetryTopSignal.highRiskBadge ? (
                          <span
                            className={styles.suggestionTelemetryRiskBadge}
                            data-level={suggestionTelemetryTopSignal.highRiskSeverity}
                            title={suggestionTelemetryTopSignal.highRiskDetail}
                          >
                            {suggestionTelemetryTopSignal.highRiskBadge}
                          </span>
                        ) : null}
                      </div>
                      {suggestionTelemetryTopSignal.summary ? (
                        <p className={styles.suggestionTelemetryTopSignalSummary}>
                          {suggestionTelemetryTopSignal.summary}
                        </p>
                      ) : null}
                      {suggestionTelemetryTopSignal.meta ? (
                        <span className={styles.suggestionTelemetryTopSignalMeta}>
                          {suggestionTelemetryTopSignal.meta}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt className="ds-caption">Signals tracked</dt>
                  <dd className={styles.suggestionTelemetryValue}>
                    {formatDashboardCount(suggestionTelemetryOverview.totalSuggestions)}
                  </dd>
                </div>
                <div>
                  <dt className="ds-caption">Views</dt>
                  <dd className={styles.suggestionTelemetryValue}>
                    {formatDashboardCount(suggestionTelemetryOverview.totalViewCount)}
                  </dd>
                </div>
                <div>
                  <dt className="ds-caption">Interactions</dt>
                  <dd className={styles.suggestionTelemetryValue}>
                    {formatDashboardCount(suggestionTelemetryOverview.totalInteractions)}
                  </dd>
                </div>
                <div>
                  <dt className="ds-caption">Top high-risk alerts</dt>
                  <dd className={styles.suggestionTelemetryValue}>
                    {suggestionTelemetryOverview.topHighRiskCount !== null
                      ? formatDashboardCount(suggestionTelemetryOverview.topHighRiskCount)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="ds-caption">Top events tracked</dt>
                  <dd className={styles.suggestionTelemetryValue}>
                    {suggestionTelemetryOverview.topEventCount !== null
                      ? formatDashboardCount(suggestionTelemetryOverview.topEventCount)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="ds-caption">Avg focus</dt>
                  <dd className={styles.suggestionTelemetryValue}>
                    {suggestionTelemetryOverview.averageFocusRate !== null
                      ? formatPercentage(suggestionTelemetryOverview.averageFocusRate)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="ds-caption">Avg dismiss</dt>
                  <dd className={styles.suggestionTelemetryValue}>
                    {suggestionTelemetryOverview.averageDismissRate !== null
                      ? formatPercentage(suggestionTelemetryOverview.averageDismissRate)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="ds-caption">Avg engagement</dt>
                  <dd className={styles.suggestionTelemetryValue}>
                    {suggestionTelemetryOverview.averageEngagementRate !== null
                      ? formatPercentage(suggestionTelemetryOverview.averageEngagementRate)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="ds-caption">Top signal confidence</dt>
                  <dd
                    className={`${styles.suggestionTelemetryValue} ${styles.suggestionTelemetryConfidence}`}
                    data-confidence-level={suggestionTelemetryOverview.topConfidenceLevel ?? undefined}
                  >
                    {suggestionTelemetryOverview.topConfidenceLabel}
                  </dd>
                </div>
              </dl>
            ) : null}
            {suggestionTelemetrySummaries.length === 0 ? (
              <p className={`${styles.suggestionTelemetryEmpty} ds-caption`}>
                No suggestion telemetry recorded yet. WeatherOps will capture engagement once operators interact with focus banners.
              </p>
            ) : (
              <ol className={styles.suggestionTelemetryList}>
                {suggestionTelemetrySummaries.map((summary) => {
                  const guardrailLabel =
                    summary.guardrailStatus === "unknown"
                      ? "Guardrail posture unknown"
                      : `Guardrail ${summary.guardrailStatus}`;
                  const tenantModeLabel =
                    summary.tenantMode === "demo"
                      ? "Demo mode"
                      : summary.tenantMode === "live"
                      ? "Live mode"
                      : null;
                  const layoutLabel =
                    summary.layoutVariant === "dense"
                      ? "Dense layout"
                      : summary.layoutVariant === "stacked"
                      ? "Stacked layout"
                      : null;
                  const ctaLabel = summary.ctaShown ? "CTA surfaced" : "CTA hidden";
                  const metaParts = [guardrailLabel, tenantModeLabel, ctaLabel, layoutLabel].filter(Boolean);
                  const relativeLastSeen = formatRelativeTime(summary.lastOccurredAt, {
                    now: generatedAtDate,
                  });
                  const focusRateLabel = formatPercentage(summary.focusRate);
                  const dismissRateLabel = formatPercentage(summary.dismissRate);
                  const engagementRateLabel = formatPercentage(summary.engagementRate);
                  const highRiskCopy = describeHighRiskAlerts(
                    summary.highRiskSeverity,
                    summary.highRiskCount,
                  );
                  if (highRiskCopy.countLabel && !highRiskCopy.badge) {
                    metaParts.push(highRiskCopy.countLabel);
                  }

                  return (
                    <li key={summary.signature} className={`${styles.suggestionTelemetryItem} ds-surface-glass`}>
                      <div className={styles.suggestionTelemetryCopy}>
                        <div className={styles.suggestionTelemetryRegionRow}>
                          <span className={styles.suggestionTelemetryRegion}>{summary.region}</span>
                          {highRiskCopy.badge ? (
                            <span
                              className={styles.suggestionTelemetryRiskBadge}
                              data-level={highRiskCopy.severity}
                              title={highRiskCopy.detail}
                            >
                              {highRiskCopy.badge}
                            </span>
                          ) : null}
                        </div>
                        <p className={styles.suggestionTelemetrySummary}>{summary.summary}</p>
                        <p className={styles.suggestionTelemetryMeta}>
                          {metaParts.length > 0 ? metaParts.join(" · ") : "Telemetry metadata unavailable"}
                        </p>
                        <p className={styles.suggestionTelemetryMeta}>
                          {highRiskCopy.detail} · Events tracked: {formatDashboardCount(summary.eventCount)} · Last seen {relativeLastSeen}
                        </p>
                      </div>
                      <dl className={styles.suggestionTelemetryStats}>
                        <div>
                          <dt className="ds-caption">Views</dt>
                          <dd className={styles.suggestionTelemetryValue}>{summary.viewCount}</dd>
                        </div>
                        <div>
                          <dt className="ds-caption">Focuses</dt>
                          <dd className={styles.suggestionTelemetryValue}>{summary.focusCount}</dd>
                        </div>
                        <div>
                          <dt className="ds-caption">Dismisses</dt>
                          <dd className={styles.suggestionTelemetryValue}>{summary.dismissCount}</dd>
                        </div>
                        <div>
                          <dt className="ds-caption">Focus rate</dt>
                          <dd className={styles.suggestionTelemetryValue}>{focusRateLabel}</dd>
                        </div>
                        <div>
                          <dt className="ds-caption">Dismiss rate</dt>
                          <dd className={styles.suggestionTelemetryValue}>{dismissRateLabel}</dd>
                        </div>
                        <div>
                          <dt className="ds-caption">Engagement</dt>
                          <dd className={styles.suggestionTelemetryValue}>{engagementRateLabel}</dd>
                        </div>
                        <div>
                          <dt className="ds-caption">Signal confidence</dt>
                          <dd
                            className={`${styles.suggestionTelemetryValue} ${styles.suggestionTelemetryConfidence}`}
                            data-confidence-level={summary.engagementConfidenceLevel}
                          >
                            {summary.engagementConfidenceLabel}
                          </dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
          {regionFocus ? (
            <div
              className={styles.regionSummaryBanner}
              role="status"
              aria-live="polite"
              data-analytics-id="dashboard.weather_focus.selection_summary"
            >
              <div className={styles.regionSummaryText}>
                <span className={styles.regionSummaryRegion}>{regionFocus.label}</span>
                <span className={styles.regionSummaryMeta}>{regionFocus.summary}</span>
              </div>
              <button
                type="button"
                className={`${styles.regionSummaryClear} ds-button-tertiary`}
                onClick={handleRegionClear}
                data-analytics-id="dashboard.weather_focus.clear_summary"
              >
                Clear
              </button>
            </div>
          ) : null}
          <div className={styles.weatherGrid}>
            <RiskMap
              events={weatherEvents}
              selectedRegion={focusedRegion}
              onRegionSelect={handleRegionToggle}
              regionSummaries={regionSummaries}
            />
            <ol
              className={styles.timeline}
              data-analytics-id="dashboard.weather_timeline"
              data-filtering={isRegionFiltering ? "true" : "false"}
              data-selected-region={focusedRegion ?? ""}
            >
              {weatherTimelineItems.length === 0 ? (
                <li className={`${styles.timelineEmpty} ds-surface-glass`}>
                  <p className="ds-body">
                    {isRegionFiltering && focusedRegion
                      ? `No forecasted weather events are pressuring ${focusedRegion} right now. We will flag new risk windows the moment forecasts shift.`
                      : "All clear — no upcoming weather events are threatening spend. Autopilot will surface the next risk window automatically."}
                  </p>
                  <p className="ds-caption">
                    Weather telemetry refreshes every 15 minutes or sooner during incidents.
                  </p>
                  {isRegionFiltering ? (
                    <button
                      type="button"
                      className="ds-button-tertiary"
                      onClick={handleRegionClear}
                      data-analytics-id="dashboard.weather_focus.clear"
                      data-active={isRegionFiltering ? "true" : "false"}
                    >
                      Show all regions
                    </button>
                  ) : null}
                </li>
              ) : (
                weatherTimelineItems.map((item) => {
                  const { event, regionLabel, regionSlug, isActive } = item;
                  const startsIn = formatRelativeTime(event.starts_at);
                  const severityMeta = weatherSeverityBadge(event.severity);
                  const eventSlug = toAnalyticsSlug(event.id);
                  const summaryLabel = regionSummaries[regionLabel];
                  const timelineAriaLabel = [
                    event.title,
                    regionLabel,
                    summaryLabel,
                    `Severity ${severityMeta.label}`,
                    `Starts ${startsIn}`,
                  ]
                    .filter(Boolean)
                    .join(". ");
                  return (
                    <li
                      key={event.id}
                      className={[
                        styles.timelineItem,
                        "ds-surface-glass",
                        isActive ? styles.timelineItemActive : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      data-active={isActive ? "true" : "false"}
                      data-region={eventSlug}
                      data-severity={event.severity}
                      data-analytics-id={`dashboard.weather_timeline.${eventSlug}`}
                    >
                      <button
                        type="button"
                        className={styles.timelineItemButton}
                        onClick={() => handleRegionToggle(regionLabel)}
                        aria-pressed={isActive}
                        aria-label={timelineAriaLabel}
                        title={summaryLabel ?? regionLabel}
                        data-active={isActive ? "true" : "false"}
                        data-analytics-id={`dashboard.weather_timeline.${eventSlug}`}
                        data-region={eventSlug}
                        data-region-label={regionSlug}
                      >
                        <header>
                          <span
                            className={`ds-badge ${styles.badgeUpper}`}
                            data-tone={severityMeta.tone}
                          >
                            {severityMeta.label}
                          </span>
                          <h3 className="ds-label-strong">{event.title}</h3>
                        </header>
                        <p className="ds-body">{event.description}</p>
                        <p className="ds-caption">
                          {regionLabel} · starts {startsIn}
                        </p>
                      </button>
                    </li>
                  );
                })
              )}
            </ol>
          </div>
          {weatherCalloutText ? (
            <p className={`${styles.weatherCallout} ds-caption`}>{weatherCalloutText}</p>
          ) : null}
        </section>

        <section
          className={styles.automationSection}
          data-analytics-id="dashboard.autopilot_status_view"
        >
          <header className={styles.sectionHeader}>
            <h2 className="ds-title">Automation uptime</h2>
            <p className="ds-body">
              Confirm Autopilot handoffs remain safe. Incident history rolls up to guardrail callouts above.
            </p>
          </header>
          <div className={styles.automationGrid}>
            {!hasAutomation ? (
              <article
                className={`${styles.emptyStateCard} ds-surface`}
                data-analytics-id="dashboard.autopilot_status.empty_state"
                data-size="compact"
              >
                <h3 className="ds-label-strong">No automation lanes configured</h3>
                <p className="ds-body">
                  Wire Autopilot lanes in the worker config to track uptime and incident history
                  here.
                </p>
              </article>
            ) : (
              automationLanes.map((lane) => {
                const statusMeta = automationBadge(lane.status);
                return (
                  <article
                    key={lane.name}
                    className={`${styles.automationCard} ds-surface-glass`}
                    data-analytics-id={`dashboard.autopilot_status.${lane.name
                      .toLowerCase()
                      .replace(/\\s+/g, "-")}`}
                  >
                    <header>
                      <h3 className="ds-label-strong">{lane.name}</h3>
                      <span className={`ds-badge ${styles.badgeUpper}`} data-tone={statusMeta.tone}>
                        {statusMeta.label}
                      </span>
                    </header>
                    <p className={styles.automationValue}>{lane.uptime_pct.toFixed(1)}%</p>
                    <p className="ds-caption">
                      {lane.incidents_7d} incidents last 7d · last at {formatRelativeTime(lane.last_incident_at)}
                    </p>
                    {lane.notes ? <p className="ds-body">{lane.notes}</p> : null}
                  </article>
                );
              })
            )}
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
            {hasIngestionConnectors ? (
              <>
                <p className="ds-body">
                  Average lag {Math.round(ingestionSummary.averageLagMinutes)} min ·{" "}
                  {ingestionSummary.outOfSlaCount} out of SLA
                </p>
                {ingestionSummary.slowestConnector ? (
                  <p className="ds-caption">
                    Worst offender: {ingestionSummary.slowestConnector.name} ({connectorLagDescription(ingestionSummary.slowestConnector)})
                  </p>
                ) : (
                  <p className="ds-caption">
                    All connectors are within SLA. Keep an eye on sync freshness during peak weather events.
                  </p>
                )}
              </>
            ) : (
              <p className="ds-body">
                No connectors reporting yet. Connect ingestion pipelines to monitor SLA drift in real time.
              </p>
            )}
          </div>
          {hasIngestionConnectors ? (
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
                {ingestionConnectors.map((connector) => {
                  const statusMeta = connectorBadge(connector.status);
                  return (
                    <tr
                      key={connector.name}
                      data-analytics-id={`dashboard.ingestion.${connector.name.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <th scope="row">{connector.name}</th>
                      <td>{connector.source}</td>
                      <td>{connectorLagDescription(connector)}</td>
                      <td>
                        <span className={`ds-badge ${styles.badgeUpper}`} data-tone={statusMeta.tone}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td>{formatRelativeTime(connector.last_synced_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div
              className={`${styles.emptyStateCard} ds-surface`}
              data-analytics-id="dashboard.ingestion.empty_state"
              data-size="compact"
            >
              <h3 className="ds-label-strong">Awaiting first ingestion sync</h3>
              <p className="ds-body">
                Kick off connector onboarding or refresh telemetry to populate ingestion health.
              </p>
            </div>
          )}
        </section>

        <section className={styles.alertSection}>
          <header className={styles.sectionHeader}>
            <h2 className="ds-title">Alert inbox</h2>
            <p className="ds-body">
              Triage and escalate incidents. Critical alerts pause Autopilot until acknowledged.
            </p>
          </header>
          {alertError ? (
            <div className={`${styles.banner} ds-surface-glass`} role="alert">
              <strong className="ds-label-strong">Alert action failed.</strong>
              <span>{alertError}</span>
            </div>
          ) : null}
          <div className={styles.alertSummary} role="status">
            <p className="ds-body">
              {alertSummary.critical} critical · {alertSummary.warning} warnings · {alertSummary.info} briefs
            </p>
            <p className="ds-caption">{alertSummary.acknowledged} acknowledged in the last cycle.</p>
          </div>
          <div className={styles.alertEscalationSummary}>
            <p className="ds-body">
              {escalationSummary.totalEscalated} escalations · {escalationSummary.activeCount} active
            </p>
            <p className="ds-caption">{lastEscalationDescription}</p>
          </div>
          <ul className={styles.alertList}>
            {(snapshot?.alerts ?? []).map((alert) => {
              const severityMeta = alertBadge(alert.severity);
              const channelLabel =
                alert.escalation_channel && alert.escalation_channel.length
                  ? alert.escalation_channel.charAt(0).toUpperCase() +
                    alert.escalation_channel.slice(1)
                  : null;
              return (
                <li
                  key={alert.id}
                  className={`${styles.alertCard} ds-surface-glass`}
                  data-analytics-id={`dashboard.alert.${alert.id}`}
                >
                  <header>
                    <span className={`ds-badge ${styles.badgeUpper}`} data-tone={severityMeta.tone}>
                      {severityMeta.label}
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
                      onClick={() => handleAcknowledge(alert.id)}
                      disabled={alert.acknowledged || ackPendingId === alert.id}
                      aria-busy={ackPendingId === alert.id}
                    >
                      {ackPendingId === alert.id
                        ? "Acknowledging…"
                        : alert.acknowledged
                        ? "Acknowledged"
                        : "Acknowledge"}
                    </button>
                    <button
                      type="button"
                      className="ds-button"
                      data-analytics-id="dashboard.alert_escalate"
                      onClick={() => handleEscalate(alert.id)}
                      disabled={Boolean(alert.escalated_to) || escalatePendingId === alert.id}
                      aria-busy={escalatePendingId === alert.id}
                    >
                      {escalatePendingId === alert.id
                        ? "Escalating…"
                        : alert.escalated_to
                        ? "Escalated"
                        : "Escalate via Slack"}
                    </button>
                  </div>
                  {alert.escalated_to ? (
                    <p className={`${styles.alertMetaNote} ds-caption`}>
                      Escalated to {alert.escalated_to}
                      {channelLabel ? ` via ${channelLabel}` : ""}
                      {alert.escalated_at ? ` · ${formatRelativeTime(alert.escalated_at)}` : ""}
                    </p>
                  ) : null}
                  {alert.acknowledged && alert.acknowledged_at ? (
                    <p className={`${styles.alertMetaNote} ds-caption`}>
                      Acknowledged {formatRelativeTime(alert.acknowledged_at)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        {dashboardMode === "offline" ? (
          <div
            className={styles.offlineScrim}
            aria-hidden="true"
            data-analytics-id="dashboard.offline_overlay"
          />
        ) : null}
      </div>
    </Layout>
  );
}
