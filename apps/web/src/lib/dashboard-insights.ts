import type {
  DashboardAlert,
  GuardrailSegment,
  IngestionConnector,
  WeatherRiskEvent,
} from "../types/dashboard";

export interface GuardrailSummary {
  healthyCount: number;
  watchCount: number;
  breachCount: number;
  averageDelta: number;
  overallStatus: "healthy" | "watch" | "breach";
}

export function summarizeGuardrails(segments: GuardrailSegment[]): GuardrailSummary {
  if (!segments.length) {
    return {
      healthyCount: 0,
      watchCount: 0,
      breachCount: 0,
      averageDelta: 0,
      overallStatus: "healthy",
    };
  }

  let healthyCount = 0;
  let watchCount = 0;
  let breachCount = 0;
  let deltaTotal = 0;

  segments.forEach((segment) => {
    deltaTotal += segment.delta_pct;
    if (segment.status === "breach") {
      breachCount += 1;
    } else if (segment.status === "watch") {
      watchCount += 1;
    } else {
      healthyCount += 1;
    }
  });

  const averageDelta = deltaTotal / segments.length;
  const overallStatus =
    breachCount > 0 ? "breach" : watchCount > 0 ? "watch" : "healthy";

  return { healthyCount, watchCount, breachCount, averageDelta, overallStatus };
}

export interface AlertSeveritySummary {
  critical: number;
  warning: number;
  info: number;
  acknowledged: number;
}

export function summarizeAlerts(alerts: DashboardAlert[]): AlertSeveritySummary {
  return alerts.reduce<AlertSeveritySummary>(
    (acc, alert) => {
      if (alert.severity === "critical") acc.critical += 1;
      if (alert.severity === "warning") acc.warning += 1;
      if (alert.severity === "info") acc.info += 1;
      if (alert.acknowledged) acc.acknowledged += 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0, acknowledged: 0 },
  );
}

export interface IngestionLagSummary {
  slowestConnector: IngestionConnector | null;
  averageLagMinutes: number;
  outOfSlaCount: number;
}

export function summarizeIngestionLag(
  connectors: IngestionConnector[],
): IngestionLagSummary {
  if (!connectors.length) {
    return { slowestConnector: null, averageLagMinutes: 0, outOfSlaCount: 0 };
  }

  let totalLag = 0;
  let outOfSlaCount = 0;
  let slowestConnector: IngestionConnector | null = null;

  connectors.forEach((connector) => {
    totalLag += connector.lag_minutes;
    if (connector.lag_minutes > connector.sla_minutes) {
      outOfSlaCount += 1;
    }
    if (
      !slowestConnector ||
      connector.lag_minutes - connector.sla_minutes >
        slowestConnector.lag_minutes - slowestConnector.sla_minutes
    ) {
      slowestConnector = connector;
    }
  });

  return {
    slowestConnector,
    averageLagMinutes: totalLag / connectors.length,
    outOfSlaCount,
  };
}

export interface UpcomingWeather {
  nextEvent: WeatherRiskEvent | null;
  highRiskCount: number;
}

export function summarizeWeatherEvents(
  events: WeatherRiskEvent[],
  now: Date = new Date(),
): UpcomingWeather {
  if (!events.length) {
    return { nextEvent: null, highRiskCount: 0 };
  }

  const parsed = events
    .map((event) => ({
      original: event,
      start: new Date(event.starts_at),
    }))
    .filter(({ start }) => !Number.isNaN(start.getTime()))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const nowTime = now.getTime();
  const nextEntry =
    parsed.find(({ start }) => start.getTime() >= nowTime) ?? parsed[parsed.length - 1];

  const highRiskCount = events.filter((event) => event.severity === "high").length;

  return { nextEvent: nextEntry.original, highRiskCount };
}

