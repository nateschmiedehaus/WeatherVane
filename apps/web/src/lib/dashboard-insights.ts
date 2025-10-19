import type {
  AllocatorRecommendation,
  AllocatorSummary,
  DashboardAlert,
  GuardrailSegment,
  SuggestionTelemetry,
  SuggestionTelemetrySummary as ApiSuggestionTelemetrySummary,
  IngestionConnector,
  WeatherKpi,
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

export interface GuardrailStackDatum {
  name: string;
  status: GuardrailSegment["status"];
  fraction: number;
  deltaPct: number;
}

export function stackGuardrails(segments: GuardrailSegment[]): GuardrailStackDatum[] {
  if (!segments.length) {
    return [];
  }

  const weights = segments.map((segment) => Math.abs(segment.delta_pct) + 10);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight === 0) {
    const equalFraction = 1 / segments.length;
    return segments.map((segment) => ({
      name: segment.name,
      status: segment.status,
      fraction: equalFraction,
      deltaPct: segment.delta_pct,
    }));
  }

  return segments.map((segment, index) => ({
    name: segment.name,
    status: segment.status,
    fraction: weights[index] / totalWeight,
    deltaPct: segment.delta_pct,
  }));
}

export function describeGuardrailHero(
  summary: GuardrailSummary,
  options: { guardrailCount: number },
): string {
  const guardrailCount = Math.max(0, options.guardrailCount);
  if (guardrailCount === 0) {
    return "No guardrails published yet. Publish guardrails in Plan to unlock live health tracking.";
  }
  if (summary.overallStatus === "breach" || summary.breachCount > 0) {
    return "Guardrail breach detected. Rally the owning team and coordinate a fix before Autopilot resumes spend.";
  }
  if (summary.overallStatus === "watch" || summary.watchCount > 0) {
    return "Guardrails are drifting. Align with Finance on pacing adjustments before the next allocator sync.";
  }
  return "Guardrails holding steady. Autopilot will surface new drift the moment it appears.";
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

export interface AlertEscalationSummary {
  activeCount: number;
  totalEscalated: number;
  lastEscalatedAt: string | null;
  lastEscalatedTarget: string | null;
  lastEscalationChannel: string | null;
}

export function summarizeEscalations(alerts: DashboardAlert[]): AlertEscalationSummary {
  if (!alerts.length) {
    return {
      activeCount: 0,
      totalEscalated: 0,
      lastEscalatedAt: null,
      lastEscalatedTarget: null,
      lastEscalationChannel: null,
    };
  }

  let activeCount = 0;
  let totalEscalated = 0;
  let latestTimestamp = 0;
  let latestTarget: string | null = null;
  let latestChannel: string | null = null;

  alerts.forEach((alert) => {
    if (alert.escalated_to) {
      totalEscalated += 1;
      const escalatedAt = alert.escalated_at ? new Date(alert.escalated_at) : null;
      const occurredAt = new Date(alert.occurred_at);
      const comparator = escalatedAt && !Number.isNaN(escalatedAt.getTime())
        ? escalatedAt.getTime()
        : Number.isNaN(occurredAt.getTime())
        ? 0
        : occurredAt.getTime();
      if (comparator > latestTimestamp) {
        latestTimestamp = comparator;
        latestTarget = alert.escalated_to ?? null;
        latestChannel = alert.escalation_channel ?? null;
      }
      if (!alert.acknowledged) {
        activeCount += 1;
      }
    }
  });

  return {
    activeCount,
    totalEscalated,
    lastEscalatedAt: latestTimestamp ? new Date(latestTimestamp).toISOString() : null,
    lastEscalatedTarget: latestTarget,
    lastEscalationChannel: latestChannel,
  };
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

export interface WeatherRegionGroup {
  region: string;
  eventCount: number;
  highRiskCount: number;
  highestSeverity: WeatherRiskEvent["severity"] | null;
  nextEventStartsAt: string | null;
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

const WEATHER_SEVERITY_WEIGHT: Record<WeatherRiskEvent["severity"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const REGION_PASSTHROUGH_TOKENS = new Set([
  "all",
  "all regions",
  "all markets",
  "any",
  "any region",
  "global",
  "*",
]);

export function normalizeWeatherRegionLabel(region: string | null | undefined): string {
  const normalized = (region ?? "").replace(/\s+/g, " ").trim();
  return normalized.length ? normalized : "Unspecified region";
}

interface WeatherRegionAccumulator {
  region: string;
  eventCount: number;
  highRiskCount: number;
  highestSeverity: WeatherRiskEvent["severity"] | null;
  highestSeverityWeight: number;
  nextEventStartsAt: string | null;
  nextEventTimestamp: number | null;
}

export function groupWeatherEventsByRegion(
  events: WeatherRiskEvent[],
): WeatherRegionGroup[] {
  if (!events.length) {
    return [];
  }

  const groups = new Map<string, WeatherRegionAccumulator>();

  events.forEach((event) => {
    const region = normalizeWeatherRegionLabel(event.geo_region);
    const entry =
      groups.get(region) ??
      {
        region,
        eventCount: 0,
        highRiskCount: 0,
        highestSeverity: null,
        highestSeverityWeight: 0,
        nextEventStartsAt: null,
        nextEventTimestamp: null,
      };

    entry.eventCount += 1;

    if (event.severity === "high") {
      entry.highRiskCount += 1;
    }

    const weight = WEATHER_SEVERITY_WEIGHT[event.severity] ?? 0;
    if (weight > entry.highestSeverityWeight) {
      entry.highestSeverityWeight = weight;
      entry.highestSeverity = event.severity;
    }

    if (event.starts_at) {
      const start = new Date(event.starts_at);
      if (!Number.isNaN(start.getTime())) {
        const timestamp = start.getTime();
        if (entry.nextEventTimestamp === null || timestamp < entry.nextEventTimestamp) {
          entry.nextEventTimestamp = timestamp;
          entry.nextEventStartsAt = start.toISOString();
        }
      }
    }

    groups.set(region, entry);
  });

  return Array.from(groups.values())
    .sort((a, b) => {
      if (b.highestSeverityWeight !== a.highestSeverityWeight) {
        return b.highestSeverityWeight - a.highestSeverityWeight;
      }
      if (a.nextEventTimestamp !== null && b.nextEventTimestamp !== null) {
        if (a.nextEventTimestamp !== b.nextEventTimestamp) {
          return a.nextEventTimestamp - b.nextEventTimestamp;
        }
      } else if (a.nextEventTimestamp !== null) {
        return -1;
      } else if (b.nextEventTimestamp !== null) {
        return 1;
      }
      return a.region.localeCompare(b.region);
    })
    .map(
      ({
        region,
        eventCount,
        highRiskCount,
        highestSeverity,
        nextEventStartsAt,
      }): WeatherRegionGroup => ({
        region,
        eventCount,
        highRiskCount,
        highestSeverity,
        nextEventStartsAt,
      }),
    );
}

export function filterWeatherEventsByRegion(
  events: WeatherRiskEvent[],
  region: string | null | undefined,
): WeatherRiskEvent[] {
  if (!events.length) {
    return [];
  }
  const target = resolveRegionFilterTarget(region);
  if (!target) {
    return events;
  }
  const targetLower = target.toLowerCase();
  const targetSlug = weatherRegionSlug(target).toLowerCase();
  return events.filter((event) => {
    const regionLabel = normalizeWeatherRegionLabel(event.geo_region);
    const regionLower = regionLabel.toLowerCase();
    if (regionLower === targetLower) {
      return true;
    }
    const regionSlug = weatherRegionSlug(regionLabel).toLowerCase();
    return regionSlug === targetSlug;
  });
}

export function resolveRegionFilterTarget(region: string | null | undefined): string | null {
  if (region === null || region === undefined) {
    return null;
  }
  const trimmed = typeof region === "string" ? region.trim() : "";
  if (!trimmed.length) {
    return null;
  }
  const normalized = normalizeWeatherRegionLabel(trimmed);
  const token = normalized.toLowerCase();
  if (REGION_PASSTHROUGH_TOKENS.has(token)) {
    return null;
  }
  return normalized;
}

export interface WeatherTimelineItem {
  event: WeatherRiskEvent;
  regionLabel: string;
  regionSlug: string;
  isActive: boolean;
}

export function mapWeatherTimelineItems(
  events: WeatherRiskEvent[],
  focusedRegion: string | null | undefined,
): WeatherTimelineItem[] {
  if (!events.length) {
    return [];
  }

  const target = resolveRegionFilterTarget(focusedRegion);
  const normalizedFocus = target ? target.toLowerCase() : null;
  const focusSlug = target ? weatherRegionSlug(target).toLowerCase() : null;

  return events.map((event) => {
    const regionLabel = normalizeWeatherRegionLabel(event.geo_region);
    const regionToken = regionLabel.toLowerCase();
    const regionSlug = weatherRegionSlug(regionLabel);
    return {
      event,
      regionLabel,
      regionSlug,
      isActive: normalizedFocus
        ? regionToken === normalizedFocus ||
          (focusSlug !== null && regionSlug === focusSlug)
        : false,
    };
  });
}

export function weatherRegionSlug(region: string | null | undefined): string {
  const normalized = normalizeWeatherRegionLabel(region);
  const slug = normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (slug.length) {
    return slug;
  }
  return "unspecified-region";
}

export function findRegionLabelBySlug(
  regions: WeatherRegionGroup[],
  slug: string | null | undefined,
): string | null {
  if (!slug) {
    return null;
  }

  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug.length) {
    return null;
  }

  for (const region of regions) {
    const normalizedLabel = normalizeWeatherRegionLabel(region.region);
    const slugCandidate = weatherRegionSlug(region.region);

    if (normalizedSlug === slugCandidate) {
      return region.region;
    }

    if (normalizedSlug === normalizedLabel.toLowerCase()) {
      return region.region;
    }
  }

  return null;
}

export type DashboardMode = "brief" | "watch" | "incident" | "offline";

interface DetermineDashboardModeInput {
  guardrails: GuardrailSummary;
  alerts: AlertSeveritySummary;
  generatedAt?: string | null;
  now?: Date;
  staleThresholdMinutes?: number;
}

export function determineDashboardMode({
  guardrails,
  alerts,
  generatedAt,
  now = new Date(),
  staleThresholdMinutes = 30,
}: DetermineDashboardModeInput): DashboardMode {
  if (!generatedAt) {
    return "offline";
  }

  const generated = new Date(generatedAt);
  if (Number.isNaN(generated.getTime())) {
    return "offline";
  }

  const diffMinutes = (now.getTime() - generated.getTime()) / 60000;
  if (diffMinutes > staleThresholdMinutes) {
    return "offline";
  }

  if (alerts.critical > 0 || guardrails.overallStatus === "breach") {
    return "incident";
  }

  if (guardrails.overallStatus === "watch") {
    return "watch";
  }

  return "brief";
}

export interface FormatRelativeTimeOptions {
  now?: Date;
}

export function formatRelativeTime(
  input: string | Date | null | undefined,
  options?: FormatRelativeTimeOptions,
): string {
  if (!input) {
    return "unknown";
  }

  const target =
    typeof input === "string"
      ? new Date(input)
      : input instanceof Date
      ? input
      : null;

  if (!target || Number.isNaN(target.getTime())) {
    return "unknown";
  }

  const reference = options?.now ?? new Date();
  const diffMs = reference.getTime() - target.getTime();
  const isFuture = diffMs < 0;
  const diffMinutes = Math.round(Math.abs(diffMs) / 60000);

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes === 1) {
    return isFuture ? "in 1 minute" : "1 minute ago";
  }

  if (diffMinutes < 60) {
    return isFuture ? `in ${diffMinutes} minutes` : `${diffMinutes} minutes ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours === 1) {
    return isFuture ? "in 1 hour" : "1 hour ago";
  }

  if (diffHours < 24) {
    return isFuture ? `in ${diffHours} hours` : `${diffHours} hours ago`;
  }

  const diffDays = Math.round(diffHours / 24);

  if (diffDays === 1) {
    return isFuture ? "in 1 day" : "1 day ago";
  }

  return isFuture ? `in ${diffDays} days` : `${diffDays} days ago`;
}

export interface DescribeWeatherRegionOptions extends FormatRelativeTimeOptions {}

export function describeWeatherRegionGroup(
  region: WeatherRegionGroup,
  options?: DescribeWeatherRegionOptions,
): string {
  const eventLabel =
    region.eventCount === 1 ? "1 event" : `${region.eventCount} events`;
  const highRiskLabel =
    region.highRiskCount === 0
      ? "No high-risk alerts"
      : `${region.highRiskCount} high-risk alert${
          region.highRiskCount === 1 ? "" : "s"
        }`;

  let scheduleLabel = "No upcoming events scheduled";

  if (region.nextEventStartsAt) {
    scheduleLabel = `Next starts ${formatRelativeTime(region.nextEventStartsAt, {
      now: options?.now,
    })}`;
  }

  return `${eventLabel} · ${highRiskLabel} · ${scheduleLabel}`;
}

export interface WeatherSuggestionIdleStory {
  heading: string;
  detail: string;
  caption: string;
}

interface BuildWeatherSuggestionIdleStoryOptions {
  now?: Date;
}

export function buildWeatherSuggestionIdleStory(
  regions: WeatherRegionGroup[],
  options?: BuildWeatherSuggestionIdleStoryOptions,
): WeatherSuggestionIdleStory {
  const now = options?.now ?? new Date();

  if (!regions.length) {
    return {
      heading: "No weather signals detected",
      detail: "Autopilot hasn't detected active weather risk windows for your campaigns.",
      caption: "We'll alert you immediately when new weather events register on telemetry.",
    };
  }

  const regionCount = regions.length;
  const totalEvents = regions.reduce((sum, region) => sum + region.eventCount, 0);
  const highRiskTotal = regions.reduce((sum, region) => sum + region.highRiskCount, 0);

  let soonestTimestamp: number | null = null;
  let soonestStartsAt: string | null = null;

  regions.forEach((region) => {
    if (!region.nextEventStartsAt) {
      return;
    }
    const parsed = new Date(region.nextEventStartsAt);
    if (Number.isNaN(parsed.getTime())) {
      return;
    }
    const timestamp = parsed.getTime();
    if (soonestTimestamp === null || timestamp < soonestTimestamp) {
      soonestTimestamp = timestamp;
      soonestStartsAt = parsed.toISOString();
    }
  });

  const eventLabel = totalEvents === 1 ? "1 weather event" : `${totalEvents} weather events`;
  const regionLabel = regionCount === 1 ? "region" : "regions";
  const highRiskSentence =
    highRiskTotal === 0
      ? "No high-risk alerts on the board right now."
      : `${highRiskTotal} high-risk alert${highRiskTotal === 1 ? "" : "s"} already on watch.`;

  const heading =
    highRiskTotal > 0 ? "Monitoring weather signals" : "No priority region right now";

  let caption = "We'll surface a focus recommendation if conditions escalate.";
  if (soonestStartsAt) {
    const relative = formatRelativeTime(soonestStartsAt, { now });
    caption = `Next potential weather window begins ${relative}. We'll surface a focus recommendation if conditions escalate.`;
  } else if (highRiskTotal > 0) {
    caption = "We'll surface a focus recommendation as soon as watchlisted alerts intensify.";
  }

  return {
    heading,
    detail: `Autopilot is monitoring ${eventLabel} across ${regionCount} ${regionLabel}. ${highRiskSentence}`,
    caption,
  };
}

export interface WeatherFocusSuggestion {
  region: string;
  summary: string;
  severity: WeatherRiskEvent["severity"] | null;
  highRiskCount: number;
  eventCount: number;
  nextEventStartsAt: string | null;
  reason: string;
}

interface SelectWeatherFocusSuggestionOptions {
  now?: Date;
}

export function selectWeatherFocusSuggestion(
  regions: WeatherRegionGroup[],
  options?: SelectWeatherFocusSuggestionOptions,
): WeatherFocusSuggestion | null {
  if (!regions.length) {
    return null;
  }

  const namedRegions = regions.filter(
    (region) => region.region.trim().toLowerCase() !== "unspecified region",
  );
  const candidates = namedRegions.length ? namedRegions : regions;

  const now = options?.now ?? new Date();
  const nowTimestamp = now.getTime();

  let best: { suggestion: WeatherFocusSuggestion; score: number } | null = null;

  candidates.forEach((region) => {
    const severityWeight =
      (region.highestSeverity && WEATHER_SEVERITY_WEIGHT[region.highestSeverity]) ??
      0;
    const highRiskCount = region.highRiskCount;
    const eventCount = region.eventCount;

    let nextEventTimestamp: number | null = null;
    if (region.nextEventStartsAt) {
      const parsed = new Date(region.nextEventStartsAt);
      nextEventTimestamp = Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
    }

    let timeScore = 0;
    if (nextEventTimestamp !== null) {
      const minutesUntil = Math.max(
        0,
        Math.round((nextEventTimestamp - nowTimestamp) / 60000),
      );
      const clamped = Math.min(minutesUntil, 720); // cap at 12h to avoid runaway scores
      timeScore = 720 - clamped;
    }

    let score = severityWeight * 120 + highRiskCount * 40 + eventCount * 6 + timeScore;

    if (region.region.trim().toLowerCase() === "unspecified region") {
      score -= 80; // prioritise named regions when possible
    }

    if (best && score < best.score) {
      return;
    }

    const summary = describeWeatherRegionGroup(region, { now });

    const severityReason =
      region.highestSeverity === "high"
        ? "High-risk conditions detected."
        : region.highestSeverity === "medium"
        ? "Moderate weather risk forming."
        : "Low-level weather signals active.";

    const riskReason =
      highRiskCount > 0
        ? `${highRiskCount} high-risk alert${highRiskCount === 1 ? "" : "s"} in queue.`
        : `${eventCount} weather event${eventCount === 1 ? "" : "s"} active.`;

    const timingReason =
      nextEventTimestamp !== null
        ? `Next event ${formatRelativeTime(region.nextEventStartsAt, { now })}.`
        : "No scheduled start time.";

    const reason = `${severityReason} ${timingReason} ${riskReason}`.trim();

    const suggestion: WeatherFocusSuggestion = {
      region: region.region,
      summary,
      severity: region.highestSeverity ?? null,
      highRiskCount,
      eventCount,
      nextEventStartsAt: region.nextEventStartsAt,
      reason,
    };

    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        nextEventTimestamp !== null &&
        (best.suggestion.nextEventStartsAt === null ||
          new Date(best.suggestion.nextEventStartsAt).getTime() > nextEventTimestamp))
    ) {
      best = { suggestion, score };
    }
  });

  return best?.suggestion ?? null;
}

export interface WeatherFocusInsightsInput {
  focusedRegion: string | null;
  isRegionFiltering: boolean;
  weatherSummary: UpcomingWeather;
  timelineLength: number;
  nextEventStart: string | null;
  regionSummary?: string | null;
  now?: Date;
}

export interface WeatherFocusInsightsResult {
  calloutText: string | null;
  regionFocus: { label: string; summary: string } | null;
}

export function buildWeatherFocusInsights({
  focusedRegion,
  isRegionFiltering,
  weatherSummary,
  timelineLength,
  nextEventStart,
  regionSummary,
  now,
}: WeatherFocusInsightsInput): WeatherFocusInsightsResult {
  let calloutText: string | null = null;

  if (isRegionFiltering) {
    if (focusedRegion) {
      if (timelineLength === 0) {
        calloutText = `No weather events scheduled for ${focusedRegion}.`;
      } else {
        const eventCountLabel =
          timelineLength === 1 ? "1 weather event" : `${timelineLength} weather events`;
        const nextLabel = nextEventStart
          ? ` Next event begins ${formatRelativeTime(nextEventStart, { now })}.`
          : "";
        const highRiskLabel =
          weatherSummary.highRiskCount > 0
            ? ` ${weatherSummary.highRiskCount} high-risk alert${
                weatherSummary.highRiskCount === 1 ? "" : "s"
              } in view.`
            : " No high-risk alerts in view.";
        calloutText = `Showing ${eventCountLabel} for ${focusedRegion}.${nextLabel}${highRiskLabel}`;
      }
    }
  } else if (!weatherSummary.nextEvent) {
    if (weatherSummary.highRiskCount > 0) {
      calloutText = `${weatherSummary.highRiskCount} high-risk weather alerts in queue.`;
    }
  } else {
    const scheduleLabel = nextEventStart
      ? formatRelativeTime(nextEventStart, { now })
      : formatRelativeTime(weatherSummary.nextEvent.starts_at, { now });
    calloutText = `Next event begins ${scheduleLabel} · ${weatherSummary.highRiskCount} high-risk alerts in queue.`;
  }

  const regionFocus =
    isRegionFiltering && focusedRegion && regionSummary
      ? { label: focusedRegion, summary: regionSummary }
      : null;

  return { calloutText, regionFocus };
}

const RECOMMENDATION_SEVERITY_ORDER: Readonly<Record<AllocatorRecommendation["severity"], number>> =
  Object.freeze({
    critical: 0,
    warning: 1,
    info: 2,
  });

export function summarizeAllocatorPressure(
  summary: AllocatorSummary | null | undefined,
): { tone: BadgeTone; message: string } {
  if (!summary) {
    return { tone: "muted", message: "Allocator telemetry unavailable." };
  }

  const sortedRecommendations = [...(summary.recommendations ?? [])].sort((a, b) => {
    const severityDelta =
      (RECOMMENDATION_SEVERITY_ORDER[a.severity] ?? 3) -
      (RECOMMENDATION_SEVERITY_ORDER[b.severity] ?? 3);
    if (severityDelta !== 0) return severityDelta;
    return Math.abs(b.spend_delta) - Math.abs(a.spend_delta);
  });

  const critical = sortedRecommendations.find((rec) => rec.severity === "critical");
  if (critical) {
    const guardrailLabel = critical.top_guardrail ?? "guardrail breach";
    return {
      tone: "critical",
      message: `${critical.platform} throttled while ${guardrailLabel.toLowerCase()}.`,
    };
  }

  const warning = sortedRecommendations.find((rec) => rec.severity === "warning");
  if (warning) {
    const guardrailLabel = warning.top_guardrail ?? "allocator governance";
    return {
      tone: "caution",
      message: `${warning.platform} adjustments flagged by ${guardrailLabel.toLowerCase()}.`,
    };
  }

  if (summary.guardrail_breaches > 0) {
    return {
      tone: "caution",
      message: `${summary.guardrail_breaches} guardrail${summary.guardrail_breaches === 1 ? "" : "s"} monitoring allocator actions.`,
    };
  }

  return {
    tone: "success",
    message: "Allocator running clean; no guardrail pressure detected.",
  };
}

export function topAllocatorRecommendations(
  summary: AllocatorSummary | null | undefined,
  limit = 3,
): AllocatorRecommendation[] {
  if (!summary) {
    return [];
  }
  return summary.recommendations.slice(0, Math.max(0, limit));
}

export type SuggestionHighRiskSeverity = "none" | "elevated" | "critical";

const DASHBOARD_COUNT_FORMATTER = new Intl.NumberFormat("en-US");

export function formatDashboardCount(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const clamped = Math.max(0, Math.round(value));
  return DASHBOARD_COUNT_FORMATTER.format(clamped);
}

export interface HighRiskAlertDescriptor {
  severity: SuggestionHighRiskSeverity;
  safeCount: number;
  badgeLabel: string | null;
  hasBadge: boolean;
}

export function buildHighRiskAlertDescriptor(
  severity: SuggestionHighRiskSeverity | null | undefined,
  count: number | null | undefined,
): HighRiskAlertDescriptor {
  const normalisedSeverity: SuggestionHighRiskSeverity =
    severity === "critical" || severity === "elevated" || severity === "none"
      ? severity
      : "none";
  const safeCount =
    typeof count === "number" && Number.isFinite(count)
      ? Math.max(0, Math.round(count))
      : 0;

  if (normalisedSeverity === "critical") {
    return {
      severity: "critical",
      safeCount,
      badgeLabel: "Critical risk",
      hasBadge: true,
    };
  }

  if (normalisedSeverity === "elevated") {
    return {
      severity: "elevated",
      safeCount,
      badgeLabel: "Elevated risk",
      hasBadge: true,
    };
  }

  return {
    severity: "none",
    safeCount,
    badgeLabel: null,
    hasBadge: false,
  };
}

export interface HighRiskAlertDescription {
  badge: string | null;
  detail: string;
  severity: SuggestionHighRiskSeverity;
  count: number;
  countLabel: string | null;
}

export function describeHighRiskAlerts(
  severity: SuggestionHighRiskSeverity | null | undefined,
  count: number | null | undefined,
): HighRiskAlertDescription {
  const descriptor = buildHighRiskAlertDescriptor(severity, count);
  const countLabel =
    descriptor.safeCount > 0
      ? `${formatDashboardCount(descriptor.safeCount)} ${
          descriptor.safeCount === 1 ? "high-risk alert" : "high-risk alerts"
        }`
      : null;

  if (!descriptor.hasBadge || !descriptor.badgeLabel) {
    if (descriptor.safeCount > 0 && countLabel) {
      return {
        badge: null,
        detail: `${countLabel} logged`,
        severity: "none",
        count: descriptor.safeCount,
        countLabel,
      };
    }
    return {
      badge: null,
      detail: "No high-risk alerts logged",
      severity: "none",
      count: descriptor.safeCount,
      countLabel,
    };
  }

  const plural = descriptor.safeCount === 1 ? "alert" : "alerts";
  return {
    badge: descriptor.badgeLabel,
    detail: `${descriptor.badgeLabel} · ${formatDashboardCount(descriptor.safeCount)} ${plural}`,
    severity: descriptor.severity,
    count: descriptor.safeCount,
    countLabel,
  };
}

export interface SuggestionTelemetrySummary {
  signature: string;
  region: string;
  summary: string;
  reason: string;
  guardrailStatus: GuardrailSegment["status"] | "unknown";
  tenantMode: "demo" | "live" | "unknown";
  layoutVariant: "dense" | "stacked" | "unknown";
  ctaShown: boolean;
  viewCount: number;
  focusCount: number;
  dismissCount: number;
  highRiskCount: number;
  eventCount: number;
  highRiskSeverity: SuggestionHighRiskSeverity;
  firstOccurredAt: string | null;
  lastOccurredAt: string | null;
  nextEventStartsAt: string | null;
  focusRate: number;
  dismissRate: number;
  engagementRate: number;
  engagementConfidenceLevel: EngagementConfidenceLevel;
  engagementConfidenceLabel: string;
}

export interface SuggestionTelemetrySummaryOptions {
  limit?: number;
}

function normaliseString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveGuardrailStatus(value: unknown): GuardrailSegment["status"] | "unknown" {
  const text = normaliseString(value);
  if (!text) {
    return "unknown";
  }
  if (text === "healthy" || text === "watch" || text === "breach") {
    return text;
  }
  return "unknown";
}

function resolveTenantMode(value: unknown): "demo" | "live" | "unknown" {
  const text = normaliseString(value);
  if (!text) {
    return "unknown";
  }
  if (text === "demo" || text === "live") {
    return text;
  }
  return "unknown";
}

function resolveLayoutVariant(value: unknown): "dense" | "stacked" | "unknown" {
  const text = normaliseString(value);
  if (!text) {
    return "unknown";
  }
  if (text === "dense" || text === "stacked") {
    return text;
  }
  return "unknown";
}

function normaliseHighRiskSeverity(value: unknown): SuggestionHighRiskSeverity | null {
  const text = normaliseString(value);
  if (!text) {
    return null;
  }
  const lowered = text.toLowerCase();
  if (lowered === "critical" || lowered === "elevated" || lowered === "none") {
    return lowered;
  }
  return null;
}

function resolveBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalised = value.trim().toLowerCase();
    return normalised === "true" || normalised === "1" || normalised === "yes";
  }
  return Boolean(value);
}

function timestampScore(value: string | null | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const asDate = new Date(value);
  const time = asDate.getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function normaliseCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return value;
}

function normaliseSummaryCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0) {
    return 0;
  }
  return value;
}

function computeRate(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    return 0;
  }
  if (denominator <= 0) {
    return 0;
  }
  const ratio = numerator / denominator;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, ratio));
}

function normaliseRateValue(value: unknown): number | null {
  if (typeof value !== "number") {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

export type EngagementConfidenceLevel = "low" | "medium" | "high";

const HIGH_CONFIDENCE_VIEW_THRESHOLD = 60;
const HIGH_CONFIDENCE_INTERACTION_THRESHOLD = 20;
const MEDIUM_CONFIDENCE_VIEW_THRESHOLD = 20;
const MEDIUM_CONFIDENCE_INTERACTION_THRESHOLD = 6;
const CRITICAL_HIGH_RISK_THRESHOLD = 3;
const MINIMUM_ELEVATED_HIGH_RISK_THRESHOLD = 1;

export function resolveHighRiskSeverity(
  count: number,
): SuggestionHighRiskSeverity {
  if (!Number.isFinite(count) || count < MINIMUM_ELEVATED_HIGH_RISK_THRESHOLD) {
    return "none";
  }
  if (count >= CRITICAL_HIGH_RISK_THRESHOLD) {
    return "critical";
  }
  return "elevated";
}

function computeEngagementConfidence(
  viewCount: number,
  engagementCount: number,
): { level: EngagementConfidenceLevel; label: string } {
  if (viewCount <= 0) {
    if (engagementCount >= MEDIUM_CONFIDENCE_INTERACTION_THRESHOLD) {
      return {
        level: "medium",
        label: `Directional signal · ${engagementCount} interactions`,
      };
    }
    if (engagementCount > 0) {
      return {
        level: "low",
        label: `Low sample · ${engagementCount} interactions`,
      };
    }
    return {
      level: "low",
      label: "No direct views yet",
    };
  }

  if (
    viewCount >= HIGH_CONFIDENCE_VIEW_THRESHOLD ||
    engagementCount >= HIGH_CONFIDENCE_INTERACTION_THRESHOLD
  ) {
    return {
      level: "high",
      label: `High confidence · ${viewCount} views`,
    };
  }

  if (
    viewCount >= MEDIUM_CONFIDENCE_VIEW_THRESHOLD ||
    engagementCount >= MEDIUM_CONFIDENCE_INTERACTION_THRESHOLD
  ) {
    return {
      level: "medium",
      label: `Directional signal · ${viewCount} views`,
    };
  }

  return {
    level: "low",
    label: `Low sample · ${viewCount} views`,
  };
}

export function summarizeSuggestionTelemetry(
  records: SuggestionTelemetry[] | null | undefined,
  options?: SuggestionTelemetrySummaryOptions,
): SuggestionTelemetrySummary[] {
  if (!records || records.length === 0) {
    return [];
  }

  const limit = options?.limit ?? 3;

  const summaries = records
    .filter((record) => normaliseString(record.region))
    .map<SuggestionTelemetrySummary>((record) => {
      const metadata = (record.metadata ?? {}) as Record<string, unknown>;
      const reasonCopy = normaliseString(record.reason) ?? record.reason;
      const regionSummary =
        normaliseString(metadata.regionSummary) ??
        normaliseString(metadata.suggestionSummary) ??
        reasonCopy;
      const regionLabel = normaliseString(record.region) ?? record.region;
      const viewCount = normaliseCount(record.view_count);
      const focusCount = normaliseCount(record.focus_count);
      const dismissCount = normaliseCount(record.dismiss_count);
      const highRiskCount = normaliseCount(record.high_risk_count);
      const engagementCount = focusCount + dismissCount;
      const focusRateInput = normaliseRateValue(record.focus_rate);
      const dismissRateInput = normaliseRateValue(record.dismiss_rate);
      const engagementRateInput = normaliseRateValue(record.engagement_rate);
      const confidence = computeEngagementConfidence(viewCount, engagementCount);
      const highRiskSeverity = resolveHighRiskSeverity(highRiskCount);

      return {
        signature: record.signature,
        region: regionLabel,
        summary: regionSummary,
        reason: reasonCopy,
        guardrailStatus: resolveGuardrailStatus(metadata.guardrailStatus),
        tenantMode: resolveTenantMode(metadata.tenantMode),
        layoutVariant: resolveLayoutVariant(metadata.layoutVariant),
        ctaShown: resolveBoolean(metadata.ctaShown),
        viewCount,
        focusCount,
        dismissCount,
        highRiskCount,
        eventCount: record.event_count,
        highRiskSeverity,
        firstOccurredAt: record.first_occurred_at ?? null,
        lastOccurredAt: record.last_occurred_at ?? null,
        nextEventStartsAt: record.next_event_starts_at ?? null,
        focusRate: focusRateInput ?? computeRate(focusCount, viewCount),
        dismissRate: dismissRateInput ?? computeRate(dismissCount, viewCount),
        engagementRate: engagementRateInput ?? computeRate(engagementCount, viewCount),
        engagementConfidenceLevel: confidence.level,
        engagementConfidenceLabel: confidence.label,
      };
    })
    .sort((a, b) => {
      const diff = timestampScore(b.lastOccurredAt) - timestampScore(a.lastOccurredAt);
      if (diff !== 0) {
        return diff;
      }
      return b.viewCount - a.viewCount;
    });

  return summaries.slice(0, Math.max(0, limit));
}

export interface SuggestionTelemetryOverview {
  totalSuggestions: number;
  totalViewCount: number;
  totalInteractions: number;
  averageFocusRate: number | null;
  averageDismissRate: number | null;
  averageEngagementRate: number | null;
  topRegion: string | null;
  topSummary: string | null;
  topReason: string | null;
  topFocusRate: number | null;
  topDismissRate: number | null;
  topEngagementRate: number | null;
  topHasScheduledStart: boolean | null;
  topGuardrailStatus: GuardrailSegment["status"] | null;
  topLayoutVariant: "dense" | "stacked" | null;
  topViewCount: number | null;
  topFocusCount: number | null;
  topDismissCount: number | null;
  topHighRiskCount: number | null;
  topHighRiskSeverity: SuggestionHighRiskSeverity | null;
  topEventCount: number | null;
  topConfidenceLevel: EngagementConfidenceLevel | null;
  topConfidenceLabel: string;
  hasSignals: boolean;
}

export function buildSuggestionTelemetryOverview(
  summary: ApiSuggestionTelemetrySummary | null | undefined,
  fallbackRecords?: SuggestionTelemetry[] | null | undefined,
): SuggestionTelemetryOverview | null {
  const fallbackList = Array.isArray(fallbackRecords) ? fallbackRecords : [];
  const fallbackSummaries =
    fallbackList.length > 0
      ? summarizeSuggestionTelemetry(fallbackList, {
          limit: fallbackList.length,
        })
      : [];

  const fallbackTotals = fallbackSummaries.length
    ? fallbackSummaries.reduce(
        (acc, entry) => {
          acc.totalSuggestions += 1;
          acc.totalViewCount += entry.viewCount;
          acc.totalFocusCount += entry.focusCount;
          acc.totalDismissCount += entry.dismissCount;
          return acc;
        },
        {
          totalSuggestions: 0,
          totalViewCount: 0,
          totalFocusCount: 0,
          totalDismissCount: 0,
        },
      )
    : null;

  const fallbackTopSummary =
    fallbackSummaries.length > 0
      ? fallbackSummaries.reduce<SuggestionTelemetrySummary | null>(
          (best, entry) => {
            if (!best) {
              return entry;
            }
            if (entry.viewCount > best.viewCount) {
              return entry;
            }
            if (entry.viewCount === best.viewCount) {
              const entryTimestamp = entry.lastOccurredAt
                ? Date.parse(entry.lastOccurredAt)
                : Number.NEGATIVE_INFINITY;
              const bestTimestamp = best.lastOccurredAt
                ? Date.parse(best.lastOccurredAt)
                : Number.NEGATIVE_INFINITY;
              if (entryTimestamp > bestTimestamp) {
                return entry;
              }
            }
            return best;
          },
          null,
        )
      : null;

  const totalSuggestions =
    normaliseSummaryCount(summary?.total_suggestions) ??
    fallbackTotals?.totalSuggestions ??
    0;
  const totalViewCount =
    normaliseSummaryCount(summary?.total_view_count) ??
    fallbackTotals?.totalViewCount ??
    0;
  const totalFocusCount =
    normaliseSummaryCount(summary?.total_focus_count) ??
    fallbackTotals?.totalFocusCount ??
    0;
  const totalDismissCount =
    normaliseSummaryCount(summary?.total_dismiss_count) ??
    fallbackTotals?.totalDismissCount ??
    0;
  const totalInteractions = totalFocusCount + totalDismissCount;
  const hasSignals =
    totalSuggestions > 0 || totalViewCount > 0 || totalInteractions > 0;

  if (!summary && !fallbackTopSummary && !hasSignals) {
    return null;
  }

  const topRegion =
    typeof summary?.top_region === "string" && summary.top_region.trim() !== ""
      ? summary.top_region
      : fallbackTopSummary?.region ?? null;

  const fallbackTopSummaryText =
    fallbackTopSummary && fallbackTopSummary.summary != null
      ? normaliseString(fallbackTopSummary.summary) ?? fallbackTopSummary.summary
      : null;
  const fallbackTopReasonText =
    fallbackTopSummary && fallbackTopSummary.reason != null
      ? normaliseString(fallbackTopSummary.reason) ?? fallbackTopSummary.reason
      : null;

  const topSummary =
    normaliseString(summary?.top_region_summary) ??
    fallbackTopSummaryText ??
    fallbackTopReasonText ??
    null;

  const topReason =
    normaliseString(summary?.top_reason) ?? fallbackTopReasonText ?? null;

  const averageFocusRateInput = normaliseRateValue(
    summary?.average_focus_rate,
  );
  const averageDismissRateInput = normaliseRateValue(
    summary?.average_dismiss_rate,
  );
  const averageEngagementRateInput = normaliseRateValue(
    summary?.average_engagement_rate,
  );
  const averageFocusRate =
    averageFocusRateInput ??
    (totalViewCount > 0 ? computeRate(totalFocusCount, totalViewCount) : null);
  const averageDismissRate =
    averageDismissRateInput ??
    (totalViewCount > 0 ? computeRate(totalDismissCount, totalViewCount) : null);
  const averageEngagementRate =
    averageEngagementRateInput ??
    (totalViewCount > 0 ? computeRate(totalInteractions, totalViewCount) : null);

  const topFocusRate =
    normaliseRateValue(summary?.top_focus_rate) ??
    (fallbackTopSummary ? fallbackTopSummary.focusRate : null);
  const topDismissRate =
    normaliseRateValue(summary?.top_dismiss_rate) ??
    (fallbackTopSummary ? fallbackTopSummary.dismissRate : null);
  const topEngagementRate =
    normaliseRateValue(summary?.top_engagement_rate) ??
    (fallbackTopSummary ? fallbackTopSummary.engagementRate : null);

  const topHasScheduledStart =
    typeof summary?.top_has_scheduled_start === "boolean"
      ? summary.top_has_scheduled_start
      : fallbackTopSummary
      ? Boolean(fallbackTopSummary.nextEventStartsAt)
      : null;

  const resolvedGuardrailStatus = resolveGuardrailStatus(
    summary?.top_guardrail_status,
  );
  const topGuardrailStatus =
    resolvedGuardrailStatus === "unknown"
      ? fallbackTopSummary && fallbackTopSummary.guardrailStatus !== "unknown"
        ? fallbackTopSummary.guardrailStatus
        : null
      : resolvedGuardrailStatus;

  const resolvedLayoutVariant = resolveLayoutVariant(
    summary?.top_layout_variant,
  );
  const topLayoutVariant =
    resolvedLayoutVariant === "unknown"
      ? fallbackTopSummary && fallbackTopSummary.layoutVariant !== "unknown"
        ? fallbackTopSummary.layoutVariant
        : null
      : resolvedLayoutVariant;

  let topConfidenceLevel = summary?.top_engagement_confidence_level ?? null;
  const providedLabel =
    typeof summary?.top_engagement_confidence_label === "string"
      ? summary.top_engagement_confidence_label.trim()
      : "";

  const summaryTopViewCount =
    normaliseSummaryCount(summary?.top_view_count) ?? null;
  const summaryTopFocusCount =
    normaliseSummaryCount(summary?.top_focus_count) ?? null;
  const summaryTopDismissCount =
    normaliseSummaryCount(summary?.top_dismiss_count) ?? null;
  const summaryTopHighRiskCount =
    normaliseSummaryCount(summary?.top_high_risk_count) ?? null;
  const summaryTopHighRiskSeverity =
    summary && Object.prototype.hasOwnProperty.call(summary, "top_high_risk_severity")
      ? normaliseHighRiskSeverity(
          (summary as Record<string, unknown>).top_high_risk_severity,
        )
      : null;
  const summaryTopEventCount =
    normaliseSummaryCount(summary?.top_event_count) ?? null;
  const fallbackTopViewCount = fallbackTopSummary ? fallbackTopSummary.viewCount : null;
  const fallbackTopFocusCount = fallbackTopSummary ? fallbackTopSummary.focusCount : null;
  const fallbackTopDismissCount = fallbackTopSummary ? fallbackTopSummary.dismissCount : null;
  const fallbackTopHighRiskCount = fallbackTopSummary
    ? fallbackTopSummary.highRiskCount
    : null;
  const fallbackTopHighRiskSeverity = fallbackTopSummary
    ? fallbackTopSummary.highRiskSeverity
    : null;
  const fallbackTopEventCount = fallbackTopSummary ? fallbackTopSummary.eventCount : null;
  const fallbackViewForConfidence = fallbackTopViewCount ?? 0;
  const fallbackFocusForConfidence = fallbackTopFocusCount ?? 0;
  const fallbackDismissForConfidence = fallbackTopDismissCount ?? 0;

  const topViewCount =
    summaryTopViewCount !== null ? summaryTopViewCount : fallbackTopViewCount;
  const topFocusCount =
    summaryTopFocusCount !== null ? summaryTopFocusCount : fallbackTopFocusCount;
  const topDismissCount =
    summaryTopDismissCount !== null ? summaryTopDismissCount : fallbackTopDismissCount;
  const topHighRiskCount =
    summaryTopHighRiskCount !== null
      ? summaryTopHighRiskCount
      : fallbackTopHighRiskCount;
  const topHighRiskSeverity =
    summaryTopHighRiskSeverity ??
    (typeof topHighRiskCount === "number"
      ? resolveHighRiskSeverity(topHighRiskCount)
      : fallbackTopHighRiskSeverity);
  const topEventCount =
    summaryTopEventCount !== null ? summaryTopEventCount : fallbackTopEventCount;

  if (!hasSignals && !providedLabel && !topConfidenceLevel && !fallbackTopSummary) {
    return null;
  }

  let topConfidenceLabel = providedLabel;
  if (!topConfidenceLabel || !topConfidenceLevel) {
    const resolvedTopViewForConfidence =
      summaryTopViewCount ?? fallbackViewForConfidence;
    const resolvedTopFocusForConfidence =
      summaryTopFocusCount ?? fallbackFocusForConfidence;
    const resolvedTopDismissForConfidence =
      summaryTopDismissCount ?? fallbackDismissForConfidence;
    const topEngagementCount =
      resolvedTopFocusForConfidence + resolvedTopDismissForConfidence;
    const computedConfidence = computeEngagementConfidence(
      resolvedTopViewForConfidence,
      topEngagementCount,
    );
    if (!topConfidenceLabel) {
      topConfidenceLabel = computedConfidence.label;
    }
    if (!topConfidenceLevel) {
      topConfidenceLevel = computedConfidence.level;
    }
  }

  if (!hasSignals && !topConfidenceLabel && !topConfidenceLevel) {
    return null;
  }

  return {
    totalSuggestions,
    totalViewCount,
    totalInteractions,
    averageFocusRate,
    averageDismissRate,
    averageEngagementRate,
    topRegion,
    topSummary,
    topReason,
    topFocusRate,
    topDismissRate,
    topEngagementRate,
    topHasScheduledStart,
    topGuardrailStatus,
    topLayoutVariant,
    topViewCount,
    topFocusCount,
    topDismissCount,
    topHighRiskCount,
    topHighRiskSeverity,
    topEventCount,
    topConfidenceLevel,
    topConfidenceLabel,
    hasSignals,
  };
}

export interface SuggestionTelemetryCsvOptions {
  overview?: SuggestionTelemetryOverview | null;
  generatedAt?: string | Date | null;
  tenantId?: string | null;
}

function escapeCsvValue(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? "" : value.toISOString();
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "";
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  const text = String(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n") || text.includes("\r")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function formatCsvRate(rate: number): string {
  if (!Number.isFinite(rate)) {
    return "";
  }
  return (Math.round(rate * 1000) / 1000).toFixed(3);
}

function normaliseCsvTimestamp(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isNaN(timestamp) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Date.parse(trimmed);
    if (Number.isNaN(parsed)) {
      return trimmed;
    }
    return new Date(parsed).toISOString();
  }
  return null;
}

const SUGGESTION_TELEMETRY_CSV_HEADER = Object.freeze([
  "Region",
  "Summary",
  "Reason",
  "High risk severity",
  "High risk alerts",
  "Weather events tracked",
  "Views",
  "Focuses",
  "Dismisses",
  "Focus rate",
  "Dismiss rate",
  "Engagement rate",
  "Guardrail status",
  "Tenant mode",
  "Layout variant",
  "CTA shown",
  "First occurred at",
  "Last occurred at",
  "Next event starts at",
  "Engagement confidence level",
  "Engagement confidence label",
]);

function buildTelemetryMetadataRows(
  overview: SuggestionTelemetryOverview | null,
  options: SuggestionTelemetryCsvOptions | undefined,
): string[] {
  const rows: string[] = [];
  if (!overview && !options?.generatedAt && !options?.tenantId) {
    return rows;
  }

  rows.push(["Metric", "Value"].map(escapeCsvValue).join(","));

  if (options?.tenantId) {
    rows.push(
      [escapeCsvValue("Tenant"), escapeCsvValue(options.tenantId)].join(","),
    );
  }

  const generatedAt = normaliseCsvTimestamp(options?.generatedAt ?? null);
  if (generatedAt) {
    rows.push(
      [escapeCsvValue("Generated At"), escapeCsvValue(generatedAt)].join(","),
    );
  }

  if (overview) {
    rows.push(
      [escapeCsvValue("Signals tracked"), escapeCsvValue(overview.totalSuggestions)].join(","),
    );
    rows.push(
      [escapeCsvValue("Total views"), escapeCsvValue(overview.totalViewCount)].join(","),
    );
    rows.push(
      [escapeCsvValue("Total interactions"), escapeCsvValue(overview.totalInteractions)].join(","),
    );
    rows.push(
      [escapeCsvValue("Top region"), escapeCsvValue(overview.topRegion ?? "")].join(","),
    );
    rows.push(
      [escapeCsvValue("Top high-risk alerts"), escapeCsvValue(overview.topHighRiskCount ?? "")].join(","),
    );
    rows.push(
      [escapeCsvValue("Top high-risk severity"), escapeCsvValue(overview.topHighRiskSeverity ?? "")].join(","),
    );
    rows.push(
      [escapeCsvValue("Top events tracked"), escapeCsvValue(overview.topEventCount ?? "")].join(","),
    );
  }

  return rows;
}

export function buildSuggestionTelemetryCsv(
  summaries: SuggestionTelemetrySummary[] | null | undefined,
  options?: SuggestionTelemetryCsvOptions,
): string {
  const rows: string[] = [];
  const exportRows = Array.isArray(summaries) ? summaries : [];
  const overview = options?.overview ?? null;

  const metadataRows = buildTelemetryMetadataRows(overview, options);
  if (metadataRows.length > 0) {
    rows.push(...metadataRows, "");
  }

  rows.push(SUGGESTION_TELEMETRY_CSV_HEADER.map(escapeCsvValue).join(","));

  exportRows.forEach((summary) => {
    rows.push(
      [
        summary.region,
        summary.summary,
        summary.reason ?? "",
        summary.highRiskSeverity,
        summary.highRiskCount,
        summary.eventCount,
        summary.viewCount,
        summary.focusCount,
        summary.dismissCount,
        formatCsvRate(summary.focusRate),
        formatCsvRate(summary.dismissRate),
        formatCsvRate(summary.engagementRate),
        summary.guardrailStatus,
        summary.tenantMode,
        summary.layoutVariant,
        summary.ctaShown,
        summary.firstOccurredAt ?? "",
        summary.lastOccurredAt ?? "",
        summary.nextEventStartsAt ?? "",
        summary.engagementConfidenceLevel,
        summary.engagementConfidenceLabel,
      ]
        .map(escapeCsvValue)
        .join(","),
    );
  });

  return rows.join("\n");
}

export function formatWeatherKpiValue(kpi: WeatherKpi): string {
  switch (kpi.unit) {
    case "usd":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: kpi.value >= 1000 ? 0 : 2,
      }).format(kpi.value);
    case "pct":
      return `${kpi.value.toFixed(1)}%`;
    case "hours":
      return `${kpi.value.toFixed(1)}h`;
    case "index":
      return kpi.value.toFixed(1);
    default:
      return kpi.value.toLocaleString("en-US");
  }
}
