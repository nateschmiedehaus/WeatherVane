import type {
  AutomationLane,
  DashboardAlert,
  DashboardResponse,
  GuardrailSegment,
  IngestionConnector,
  WeatherKpi,
  WeatherRiskEvent,
} from "../types/dashboard";

export type RunbookStatus = "steady" | "caution" | "critical";

export type RunbookTone = "muted" | "info" | "success" | "caution" | "critical";

export interface RunbookMetric {
  label: string;
  value: string;
  helper?: string;
  tone: RunbookTone;
}

export interface RunbookSection {
  id: string;
  title: string;
  owner: string;
  status: RunbookStatus;
  statusLabel: string;
  summary: string;
  metrics: RunbookMetric[];
  actions: string[];
  escalation: string;
}

export interface MonitoringDashboardCard {
  id: string;
  title: string;
  summary: string;
  statLabel: string;
  statValue: string;
  tone: RunbookTone;
  helper?: string;
  link?: string;
}

export interface WeatherRunbookPayload {
  sections: RunbookSection[];
  dashboards: MonitoringDashboardCard[];
  generatedAtLabel: string;
  generatedAgo: string | null;
  stalenessMinutes: number | null;
}

const GUARDRAIL_ESCALATION = "#weather-ops";
const INGESTION_ESCALATION = "#data-ingestion";
const AUTOMATION_ESCALATION = "#automation-crew";
const WEATHER_ESCALATION = "#field-marketing";
const ALERT_ESCALATION = "#weather-ops";

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const absolute = Math.abs(value);
  const digits = absolute >= 10 ? 1 : absolute >= 1 ? 1 : 2;
  const formatted = absolute.toFixed(digits);
  return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
}

function formatLagMinutes(lag: number): string {
  if (!Number.isFinite(lag) || lag <= 0) {
    return "0 min";
  }
  if (lag >= 120) {
    return `${Math.round(lag / 60)} hr`;
  }
  return `${Math.round(lag)} min`;
}

function formatHours(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0h";
  }
  return `${Math.round(value)}h`;
}

function describeTopGuardrail(segments: GuardrailSegment[]): string | null {
  if (segments.length === 0) {
    return null;
  }
  const [top] = [...segments].sort(
    (a, b) => Math.abs(b.delta_pct ?? 0) - Math.abs(a.delta_pct ?? 0),
  );
  const movement = formatPercent(top.delta_pct ?? 0);
  return `${top.name} (${movement} vs target)`;
}

function humanizeCount(label: string, count: number): string {
  return `${count} ${label}${count === 1 ? "" : "s"}`;
}

function describeEventWindow(event: WeatherRiskEvent, now: Date): string {
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  if (Number.isNaN(start.getTime())) {
    return "timing unknown";
  }
  if (end && !Number.isNaN(end.getTime())) {
    if (now >= start && now <= end) {
      return "active now";
    }
    if (start > now) {
      return `starts ${start.toLocaleString()}`;
    }
    if (end < now) {
      return `ended ${end.toLocaleString()}`;
    }
  }
  if (start > now) {
    return `starts ${start.toLocaleString()}`;
  }
  return "active now";
}

function computeGeneratedAgo(
  generatedAt: string | null,
  now: Date,
): { label: string | null; minutes: number | null } {
  if (!generatedAt) {
    return { label: null, minutes: null };
  }
  const generatedDate = new Date(generatedAt);
  if (Number.isNaN(generatedDate.getTime())) {
    return { label: null, minutes: null };
  }
  const deltaMs = now.getTime() - generatedDate.getTime();
  if (deltaMs < 0) {
    return { label: null, minutes: 0 };
  }
  const minutes = Math.round(deltaMs / 60000);
  if (minutes < 1) {
    return { label: "just now", minutes };
  }
  if (minutes < 60) {
    return { label: `${minutes} min ago`, minutes };
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rem = minutes - hours * 60;
    return { label: rem > 0 ? `${hours}h ${rem}m ago` : `${hours}h ago`, minutes };
  }
  const days = Math.floor(hours / 24);
  return { label: `${days}d ago`, minutes };
}

function buildGuardrailRunbookSection(guardrails: GuardrailSegment[]): RunbookSection {
  const total = guardrails.length;
  const breaches = guardrails.filter((segment) => segment.status === "breach");
  const watch = guardrails.filter((segment) => segment.status === "watch");

  let status: RunbookStatus = "steady";
  if (breaches.length > 0) {
    status = "critical";
  } else if (watch.length > 0 || total === 0) {
    status = "caution";
  }

  const topFocus = breaches.length > 0 ? describeTopGuardrail(breaches) : describeTopGuardrail(watch);
  const summary =
    total === 0
      ? "No guardrails published. Stand up baseline guardrails with finance before next spend cycle."
      : status === "critical"
        ? `Guardrail breach active: ${topFocus ?? "review WeatherOps dashboard"}`
        : status === "caution"
          ? `Drift detected on ${topFocus ?? "watchlist guardrails"}. Audit thresholds before tomorrow's campaigns.`
          : "Guardrails holding steady. Continue daily monitoring cadence.";

  const metrics: RunbookMetric[] = [
    {
      label: "Total guardrails",
      value: String(total),
      helper: breaches.length > 0 ? `${breaches.length} breach${breaches.length === 1 ? "" : "es"}` : undefined,
      tone: total > 0 ? "info" : "caution",
    },
    {
      label: "Breaches",
      value: String(breaches.length),
      helper: breaches.length > 0 ? topFocus ?? undefined : undefined,
      tone: breaches.length > 0 ? "critical" : "muted",
    },
    {
      label: "Watchlist",
      value: String(watch.length),
      tone: watch.length > 0 ? "caution" : "muted",
    },
  ];

  const actions: string[] = [
    "Review WeatherOps guardrail table and confirm breach narratives in dashboard.",
  ];
  if (status === "critical") {
    actions.push("Escalate breach owner and confirm spend pullback plan within 30 minutes.");
  } else if (status === "caution") {
    actions.push("Recalibrate thresholds or annotate expected variance before daily standup.");
  } else {
    actions.push("Log review in guardrail journal after daily check-in.");
  }

  return {
    id: "guardrails",
    title: "Guardrail posture",
    owner: "Finance partner",
    status,
    statusLabel:
      status === "critical" ? "Critical breach" : status === "caution" ? "Needs attention" : "Healthy",
    summary,
    metrics,
    actions,
    escalation: GUARDRAIL_ESCALATION,
  };
}

function buildIngestionRunbookSection(connectors: IngestionConnector[]): RunbookSection {
  const total = connectors.length;
  const failing = connectors.filter((connector) => connector.status === "failed");
  const delayed = connectors.filter((connector) => connector.status === "delayed");
  const status: RunbookStatus =
    failing.length > 0 ? "critical" : delayed.length > 0 || total === 0 ? "caution" : "steady";

  const worstLagConnector = [...connectors]
    .filter((connector) => Number.isFinite(connector.lag_minutes))
    .sort((a, b) => b.lag_minutes - a.lag_minutes)[0];
  const worstLag = worstLagConnector ? formatLagMinutes(worstLagConnector.lag_minutes) : null;
  const summary =
    total === 0
      ? "No ingestion connectors registered. Configure campaign sources to unlock weather impact telemetry."
      : status === "critical"
        ? `Connector failure: ${failing[0]?.name ?? "unknown source"}. Fix before next allocation run.`
        : status === "caution"
          ? `Lagging connectors detected${worstLag ? ` (worst ${worstLag})` : ""}. Clear backlog within SLA.`
          : `All connectors within SLA${worstLag ? ` (max lag ${worstLag})` : ""}.`;

  const metrics: RunbookMetric[] = [
    {
      label: "Connectors",
      value: String(total),
      tone: total > 0 ? "info" : "caution",
    },
    {
      label: "Delayed",
      value: String(delayed.length),
      helper: delayed[0]?.name,
      tone: delayed.length > 0 ? "caution" : "muted",
    },
    {
      label: "Failed",
      value: String(failing.length),
      helper: failing[0]?.name,
      tone: failing.length > 0 ? "critical" : "muted",
    },
  ];

  const actions: string[] = [
    "Check connector run history in WeatherOps dashboard ingestion tab.",
  ];
  if (status === "critical") {
    actions.push("Coordinate with data engineering to rerun failed extractor and backfill ads data.");
  } else if (status === "caution") {
    actions.push("Validate API quotas and schedule catch-up sync before allocator refresh.");
  } else {
    actions.push("Confirm daily extractor windows remain aligned with promo calendar.");
  }

  return {
    id: "ingestion",
    title: "Ingestion health",
    owner: "Data engineering",
    status,
    statusLabel:
      status === "critical" ? "Connector outage" : status === "caution" ? "Lagging ingest" : "Healthy",
    summary,
    metrics,
    actions,
    escalation: INGESTION_ESCALATION,
  };
}

function buildAutomationRunbookSection(lanes: AutomationLane[]): RunbookSection {
  const total = lanes.length;
  const paused = lanes.filter((lane) => lane.status === "paused");
  const degraded = lanes.filter((lane) => lane.status === "degraded");
  const recentIncidents = lanes.filter((lane) => lane.incidents_7d > 0);

  const status: RunbookStatus =
    paused.length > 0 ? "critical" : degraded.length > 0 || recentIncidents.length > 0 ? "caution" : "steady";

  const topLane = [...lanes].sort((a, b) => b.incidents_7d - a.incidents_7d)[0];

  const summary =
    total === 0
      ? "Automations not enabled. Complete validation checklist before next campaign push."
      : status === "critical"
        ? `Automation paused: ${paused[0]?.name ?? "lane"}. Investigate executor logs immediately.`
        : status === "caution"
          ? `Instability detected${topLane ? ` (${topLane.name} ${topLane.incidents_7d} incident${topLane.incidents_7d === 1 ? "" : "s"} in 7d)` : ""}.`
          : "Automation lanes stable with no incidents in the last week.";

  const metrics: RunbookMetric[] = [
    {
      label: "Lanes",
      value: String(total),
      tone: total > 0 ? "info" : "caution",
    },
    {
      label: "Paused",
      value: String(paused.length),
      tone: paused.length > 0 ? "critical" : "muted",
      helper: paused[0]?.name,
    },
    {
      label: "Incidents (7d)",
      value: String(recentIncidents.reduce((sum, lane) => sum + lane.incidents_7d, 0)),
      tone: recentIncidents.length > 0 ? "caution" : "success",
    },
  ];

  const actions: string[] = [
    "Validate automation health checks and ensure retry budget is within policy.",
  ];
  if (status === "critical") {
    actions.push("Escalate to engineering lead and place impacted campaigns into assist mode.");
  } else if (status === "caution") {
    actions.push("Review recent incidents and confirm mitigations with on-call automation engineer.");
  } else {
    actions.push("Log daily automation review and confirm alerting channels remain responsive.");
  }

  return {
    id: "automations",
    title: "Automation readiness",
    owner: "Automation engineering",
    status,
    statusLabel: status === "critical" ? "Automation paused" : status === "caution" ? "Monitor closely" : "Healthy",
    summary,
    metrics,
    actions,
    escalation: AUTOMATION_ESCALATION,
  };
}

function buildWeatherRunbookSection(
  events: WeatherRiskEvent[],
  kpis: WeatherKpi[],
  now: Date,
): RunbookSection {
  const high = events.filter((event) => event.severity === "high");
  const medium = events.filter((event) => event.severity === "medium");
  const status: RunbookStatus = high.length > 0 ? "critical" : medium.length > 0 ? "caution" : "steady";
  const primaryEvent = high[0] ?? medium[0] ?? events[0] ?? null;
  const window = primaryEvent ? describeEventWindow(primaryEvent, now) : null;
  const summary =
    events.length === 0
      ? "No weather risks flagged. Continue monitoring high-priority regions daily."
      : status === "critical"
        ? `High-severity weather event: ${primaryEvent?.title ?? "unnamed"} (${window ?? "timing unknown"}).`
        : status === "caution"
          ? `Upcoming weather watch: ${primaryEvent?.title ?? "highlighted region"} (${window ?? "timing unknown"}).`
          : `Low-severity weather pattern: ${primaryEvent?.title ?? "general"} (${window ?? "timing unknown"}).`;

  const kpiImpact = kpis.slice(0, 2).map((kpi) => ({
    label: kpi.label,
    value: formatPercent(kpi.delta_pct ?? 0),
    helper: `Value ${kpi.value.toFixed(1)} ${kpi.unit}`,
    tone: (kpi.delta_pct ?? 0) >= 0 ? "info" : "caution",
  }));

  const metrics: RunbookMetric[] = [
    {
      label: "High risk",
      value: String(high.length),
      tone: high.length > 0 ? "critical" : "muted",
    },
    {
      label: "Medium risk",
      value: String(medium.length),
      tone: medium.length > 0 ? "caution" : "muted",
    },
    {
      label: "Total events",
      value: String(events.length),
      tone: events.length > 0 ? "info" : "muted",
    },
    ...kpiImpact,
  ];

  const actions: string[] = [
    "Review affected campaigns and confirm response plan with regional marketing.",
  ];
  if (status === "critical") {
    actions.push("Trigger weather escalation protocol and update exec briefing within 15 minutes.");
  } else if (status === "caution") {
    actions.push("Coordinate with channel owners on contingency messaging before the event window.");
  } else {
    actions.push("Document monitoring outcome and refresh regional briefing for tomorrow.");
  }

  return {
    id: "weather",
    title: "Weather impact",
    owner: "Weather strategist",
    status,
    statusLabel: status === "critical" ? "Severe weather" : status === "caution" ? "Watch active" : "Calm",
    summary,
    metrics,
    actions,
    escalation: WEATHER_ESCALATION,
  };
}

function buildAlertRunbookSection(alerts: DashboardAlert[]): RunbookSection {
  const unresolved = alerts.filter((alert) => !alert.acknowledged);
  const critical = unresolved.filter((alert) => alert.severity === "critical");
  const warning = unresolved.filter((alert) => alert.severity === "warning");

  const status: RunbookStatus =
    critical.length > 0 ? "critical" : warning.length > 0 || unresolved.length > 0 ? "caution" : "steady";

  const summary =
    unresolved.length === 0
      ? "No active alerts. Continue hourly check-ins during peak trading hours."
      : status === "critical"
        ? `Critical alerts pending acknowledgement (${humanizeCount("item", critical.length)}).`
        : `Alerts require review (${humanizeCount("item", unresolved.length)} outstanding).`;

  const metrics: RunbookMetric[] = [
    {
      label: "Active alerts",
      value: String(unresolved.length),
      tone: unresolved.length > 0 ? "info" : "success",
    },
    {
      label: "Critical",
      value: String(critical.length),
      tone: critical.length > 0 ? "critical" : "muted",
      helper: critical[0]?.title,
    },
    {
      label: "Warnings",
      value: String(warning.length),
      tone: warning.length > 0 ? "caution" : "muted",
    },
  ];

  const actions: string[] = [
    "Acknowledge or escalate outstanding alerts in WeatherOps dashboard.",
  ];
  if (status === "critical") {
    actions.push("Initiate incident bridge with stakeholders and document timeline.");
  } else if (status === "caution") {
    actions.push("Assign alert owners and log follow-up tasks in runbook.");
  } else {
    actions.push("Log daily alert sweep completion.");
  }

  return {
    id: "alerts",
    title: "Alert queue",
    owner: "WeatherOps on-call",
    status,
    statusLabel:
      status === "critical" ? "Red queue" : status === "caution" ? "Queue pending" : "Clear",
    summary,
    metrics,
    actions,
    escalation: ALERT_ESCALATION,
  };
}

function buildMonitoringDashboards(
  guardrailSection: RunbookSection,
  ingestionSection: RunbookSection,
  automationSection: RunbookSection,
  weatherSection: RunbookSection,
  generatedAgo: string | null,
): MonitoringDashboardCard[] {
  return [
    {
      id: "dash-guardrails",
      title: "Guardrail posture",
      summary: guardrailSection.summary,
      statLabel: "Breaches / total",
      statValue: `${guardrailSection.metrics[1]?.value ?? "0"} / ${guardrailSection.metrics[0]?.value ?? "0"}`,
      tone: guardrailSection.metrics[1]?.tone ?? "muted",
      helper: `Latest WeatherOps refresh ${generatedAgo ?? "unknown"}.`,
      link: "/dashboard#guardrails",
    },
    {
      id: "dash-ingestion",
      title: "Ingestion pipeline",
      summary: ingestionSection.summary,
      statLabel: "Delayed connectors",
      statValue: ingestionSection.metrics[1]?.value ?? "0",
      tone: ingestionSection.metrics[1]?.tone ?? "muted",
      helper: ingestionSection.metrics[2]?.helper
        ? `Failure: ${ingestionSection.metrics[2]?.helper}`
        : undefined,
      link: "/dashboard#ingestion",
    },
    {
      id: "dash-weather",
      title: "Weather outlook",
      summary: weatherSection.summary,
      statLabel: "High severity events",
      statValue: weatherSection.metrics[0]?.value ?? "0",
      tone: weatherSection.metrics[0]?.tone ?? "muted",
      helper: weatherSection.metrics[3]?.helper,
      link: "/dashboard#weather",
    },
    {
      id: "dash-automation",
      title: "Automation reliability",
      summary: automationSection.summary,
      statLabel: "Incidents (7d)",
      statValue: automationSection.metrics[2]?.value ?? "0",
      tone: automationSection.metrics[2]?.tone ?? "muted",
      helper: automationSection.metrics[1]?.helper
        ? `Paused lane: ${automationSection.metrics[1]?.helper}`
        : undefined,
      link: "/automations",
    },
  ];
}

export function buildWeatherRunbookPayload(
  dashboard: DashboardResponse,
  now: Date = new Date(),
): WeatherRunbookPayload {
  const generatedAtLabel = (() => {
    const generatedDate = new Date(dashboard.generated_at);
    return Number.isNaN(generatedDate.getTime()) ? "Unknown" : generatedDate.toLocaleString();
  })();
  const { label: generatedAgo, minutes: stalenessMinutes } = computeGeneratedAgo(dashboard.generated_at, now);

  const guardrails = buildGuardrailRunbookSection(dashboard.guardrails);
  const ingestion = buildIngestionRunbookSection(dashboard.ingestion);
  const automations = buildAutomationRunbookSection(dashboard.automation);
  const weather = buildWeatherRunbookSection(dashboard.weather_events, dashboard.weather_kpis, now);
  const alerts = buildAlertRunbookSection(dashboard.alerts);

  const dashboards = buildMonitoringDashboards(guardrails, ingestion, automations, weather, generatedAgo);

  return {
    sections: [guardrails, ingestion, automations, weather, alerts],
    dashboards,
    generatedAtLabel,
    generatedAgo,
    stalenessMinutes,
  };
}

export {
  buildAlertRunbookSection,
  buildAutomationRunbookSection,
  buildGuardrailRunbookSection,
  buildIngestionRunbookSection,
  buildMonitoringDashboards,
  buildWeatherRunbookSection,
};
