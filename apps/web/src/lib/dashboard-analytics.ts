import { weatherRegionSlug } from "./dashboard-insights";
import type { GuardrailSummary, WeatherFocusSuggestion } from "./dashboard-insights";

export type ViewportBreakpoint = "mobile" | "tablet" | "desktop" | "unknown";

export interface WeatherSuggestionAnalyticsMetadata {
  layoutVariant: "dense" | "stacked";
  ctaShown: boolean;
  regionSlug: string;
  signature: string;
  suggestionSummary?: string;
  regionSummary?: string | null;
  tenantMode?: "demo" | "live";
  guardrailStatus?: "breach" | "watch" | "healthy";
  criticalAlertCount?: number;
}

export interface WeatherFocusSuggestionAnalyticsPayload {
  region: string;
  severity: WeatherFocusSuggestion["severity"] | "unknown";
  highRiskCount: number;
  eventCount: number;
  nextEventStartsAt: string | null;
  hasScheduledStart: boolean;
  reason: string;
  viewportBreakpoint: ViewportBreakpoint;
  metadata: WeatherSuggestionAnalyticsMetadata;
}

export interface DashboardAnalyticsEvent {
  event: string;
  payload: WeatherFocusSuggestionAnalyticsPayload;
}

export interface SuggestionAnalyticsOptions {
  viewportBreakpoint?: ViewportBreakpoint | null;
  metadata?: WeatherSuggestionAnalyticsMetadata | null;
}

export interface SuggestionMetadataInputs {
  suggestion: WeatherFocusSuggestion;
  viewportBreakpoint?: ViewportBreakpoint | null;
  isRegionFiltering: boolean;
  regionSummaries: Record<string, string>;
  isDemoMode: boolean;
  guardrailStatus: GuardrailSummary["overallStatus"];
  criticalAlertCount: number;
  previousMetadata?: WeatherSuggestionAnalyticsMetadata | null;
}

export function buildSuggestionSignature(
  suggestion: WeatherFocusSuggestion,
): string {
  const schedule = deriveScheduleMetadata(suggestion.nextEventStartsAt);
  return [
    suggestion.region,
    suggestion.reason,
    schedule.nextEventStartsAt ?? "",
    suggestion.highRiskCount,
    suggestion.eventCount,
  ].join("|");
}

function deriveScheduleMetadata(
  nextEventStartsAt: WeatherFocusSuggestion["nextEventStartsAt"],
): Pick<WeatherFocusSuggestionAnalyticsPayload, "nextEventStartsAt" | "hasScheduledStart"> {
  if (!nextEventStartsAt) {
    return { nextEventStartsAt: null, hasScheduledStart: false };
  }

  const trimmed = nextEventStartsAt.trim();
  if (!trimmed) {
    return { nextEventStartsAt: null, hasScheduledStart: false };
  }

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    return { nextEventStartsAt: null, hasScheduledStart: false };
  }

  return { nextEventStartsAt: trimmed, hasScheduledStart: true };
}

function normalizeViewportBreakpoint(
  viewportBreakpoint: SuggestionAnalyticsOptions["viewportBreakpoint"],
): ViewportBreakpoint {
  if (viewportBreakpoint === "mobile") return "mobile";
  if (viewportBreakpoint === "tablet") return "tablet";
  if (viewportBreakpoint === "desktop") return "desktop";
  return "unknown";
}

function normalizeSuggestionMetadata(
  suggestion: WeatherFocusSuggestion,
  viewportBreakpoint: ViewportBreakpoint,
  metadata?: WeatherSuggestionAnalyticsMetadata | null,
): WeatherSuggestionAnalyticsMetadata {
  const layoutVariant = viewportBreakpoint === "mobile" ? "stacked" : "dense";

  if (!metadata) {
    return {
      layoutVariant,
      ctaShown: false,
      regionSlug: weatherRegionSlug(suggestion.region),
      signature: buildSuggestionSignature(suggestion),
      suggestionSummary: suggestion.summary,
      regionSummary: suggestion.summary ?? null,
    };
  }

  const normalized: WeatherSuggestionAnalyticsMetadata = { ...metadata };

  normalized.layoutVariant =
    metadata.layoutVariant === "dense" || metadata.layoutVariant === "stacked"
      ? metadata.layoutVariant
      : layoutVariant;

  normalized.ctaShown = Boolean(metadata.ctaShown);

  normalized.regionSlug =
    typeof metadata.regionSlug === "string" && metadata.regionSlug.trim()
      ? metadata.regionSlug
      : weatherRegionSlug(suggestion.region);

  const signature =
    typeof metadata.signature === "string" ? metadata.signature.trim() : "";
  normalized.signature = signature || buildSuggestionSignature(suggestion);

  if (normalized.suggestionSummary === undefined) {
    normalized.suggestionSummary = suggestion.summary;
  }

  if (normalized.regionSummary == null) {
    normalized.regionSummary =
      normalized.suggestionSummary ?? suggestion.summary ?? null;
  }

  return normalized;
}

function buildSuggestionPayload(
  suggestion: WeatherFocusSuggestion,
  options?: SuggestionAnalyticsOptions,
): WeatherFocusSuggestionAnalyticsPayload {
  const schedule = deriveScheduleMetadata(suggestion.nextEventStartsAt);
  const viewportBreakpoint = normalizeViewportBreakpoint(
    options?.viewportBreakpoint,
  );
  const metadata = normalizeSuggestionMetadata(
    suggestion,
    viewportBreakpoint,
    options?.metadata ?? null,
  );

  return {
    region: suggestion.region,
    severity: suggestion.severity ?? "unknown",
    highRiskCount: suggestion.highRiskCount,
    eventCount: suggestion.eventCount,
    nextEventStartsAt: schedule.nextEventStartsAt,
    hasScheduledStart: schedule.hasScheduledStart,
    reason: suggestion.reason,
    viewportBreakpoint,
    metadata,
  };
}

export function buildSuggestionMetadata(
  inputs: SuggestionMetadataInputs,
): WeatherSuggestionAnalyticsMetadata {
  const normalizedBreakpoint = normalizeViewportBreakpoint(
    inputs.viewportBreakpoint,
  );
  const layoutVariant =
    normalizedBreakpoint === "mobile" ? "stacked" : "dense";
  const signature = buildSuggestionSignature(inputs.suggestion);
  const baseMetadata: WeatherSuggestionAnalyticsMetadata = {
    layoutVariant,
    ctaShown: !inputs.isRegionFiltering,
    regionSlug: weatherRegionSlug(inputs.suggestion.region),
    signature,
    suggestionSummary: inputs.suggestion.summary,
    regionSummary:
      inputs.regionSummaries[inputs.suggestion.region] ??
      inputs.suggestion.summary ??
      null,
    tenantMode: inputs.isDemoMode ? "demo" : "live",
    guardrailStatus: inputs.guardrailStatus,
    criticalAlertCount: inputs.criticalAlertCount,
  };
  const previous = inputs.previousMetadata ?? null;
  if (previous && previous.signature === signature) {
    return {
      ...previous,
      ...baseMetadata,
      ctaShown: previous.ctaShown || baseMetadata.ctaShown,
    };
  }
  return baseMetadata;
}

export function buildSuggestionViewEvent(
  suggestion: WeatherFocusSuggestion,
  options?: SuggestionAnalyticsOptions,
): DashboardAnalyticsEvent {
  return {
    event: "dashboard.weather_focus.suggestion.view",
    payload: buildSuggestionPayload(suggestion, options),
  };
}

export function buildSuggestionFocusEvent(
  suggestion: WeatherFocusSuggestion,
  options?: SuggestionAnalyticsOptions,
): DashboardAnalyticsEvent {
  return {
    event: "dashboard.weather_focus.suggestion.focus",
    payload: buildSuggestionPayload(suggestion, options),
  };
}

export function buildSuggestionDismissEvent(
  suggestion: WeatherFocusSuggestion,
  options?: SuggestionAnalyticsOptions,
): DashboardAnalyticsEvent {
  return {
    event: "dashboard.weather_focus.suggestion.dismiss",
    payload: buildSuggestionPayload(suggestion, options),
  };
}

export function resolveViewportBreakpoint(
  width: number | null | undefined,
): ViewportBreakpoint {
  if (!Number.isFinite(width ?? NaN) || (width ?? 0) <= 0) {
    return "unknown";
  }

  const numericWidth = width as number;

  if (numericWidth < 640) {
    return "mobile";
  }

  if (numericWidth < 1024) {
    return "tablet";
  }

  return "desktop";
}
