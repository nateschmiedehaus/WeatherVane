import { describe, expect, it } from "vitest";

import {
  buildSuggestionDismissEvent,
  buildSuggestionFocusEvent,
  buildSuggestionMetadata,
  buildSuggestionSignature,
  buildSuggestionViewEvent,
  resolveViewportBreakpoint,
} from "../dashboard-analytics";
import { weatherRegionSlug } from "../dashboard-insights";
import type { WeatherFocusSuggestion } from "../dashboard-insights";

const baseSuggestion: WeatherFocusSuggestion = {
  region: "Gulf Coast",
  summary: "High-risk weather is approaching the Gulf Coast coastline.",
  severity: null,
  highRiskCount: 2,
  eventCount: 3,
  nextEventStartsAt: "2025-05-01T14:00:00Z",
  reason: "High-risk weather events incoming.",
};

describe("dashboard analytics helpers", () => {
  it("builds a deterministic signature using trimmed schedule data", () => {
    const suggestion: WeatherFocusSuggestion = {
      ...baseSuggestion,
      nextEventStartsAt: " 2025-05-01T14:00:00Z ",
    };

    expect(buildSuggestionSignature(suggestion)).toBe(
      "Gulf Coast|High-risk weather events incoming.|2025-05-01T14:00:00Z|2|3",
    );
  });

  it("backfills metadata when none is provided", () => {
    const event = buildSuggestionViewEvent(baseSuggestion, {
      viewportBreakpoint: "mobile",
    });

    expect(event.event).toBe("dashboard.weather_focus.suggestion.view");

    const { metadata } = event.payload;
    expect(metadata.layoutVariant).toBe("stacked");
    expect(metadata.ctaShown).toBe(false);
    expect(metadata.regionSlug).toBe(weatherRegionSlug(baseSuggestion.region));
    expect(metadata.signature).toBe(buildSuggestionSignature(baseSuggestion));
    expect(metadata.regionSummary).toBe(baseSuggestion.summary);
  });

  it("normalises provided metadata and preserves the original reference", () => {
    const customMetadata = {
      layoutVariant: "dense",
      ctaShown: true,
      regionSlug: "custom-region",
      signature: "   ",
    };

    const focusEvent = buildSuggestionFocusEvent(baseSuggestion, {
      viewportBreakpoint: "desktop",
      metadata: customMetadata,
    });

    expect(focusEvent.event).toBe("dashboard.weather_focus.suggestion.focus");
    expect(focusEvent.payload.metadata).not.toBe(customMetadata);
    expect(focusEvent.payload.metadata.signature).toBe(
      buildSuggestionSignature(baseSuggestion),
    );
    expect(focusEvent.payload.metadata.regionSlug).toBe(
      "custom-region",
    );
    expect(focusEvent.payload.metadata.regionSummary).toBe(
      baseSuggestion.summary,
    );
    expect(customMetadata.signature).toBe("   ");
  });

  it("or-combines CTA visibility when metadata is reused", () => {
    const previousMetadata = {
      layoutVariant: "dense" as const,
      ctaShown: true,
      regionSlug: weatherRegionSlug(baseSuggestion.region),
      signature: buildSuggestionSignature(baseSuggestion),
      suggestionSummary: baseSuggestion.summary,
      regionSummary: baseSuggestion.summary,
      tenantMode: "demo" as const,
    };

    const metadata = buildSuggestionMetadata({
      suggestion: baseSuggestion,
      viewportBreakpoint: "tablet",
      isRegionFiltering: true,
      regionSummaries: {},
      isDemoMode: true,
      guardrailStatus: "watch",
      criticalAlertCount: 4,
      previousMetadata,
    });

    expect(metadata.ctaShown).toBe(true);
    expect(metadata.layoutVariant).toBe("dense");
    expect(metadata.tenantMode).toBe("demo");
    expect(metadata.guardrailStatus).toBe("watch");
    expect(metadata.criticalAlertCount).toBe(4);
  });

  it("generates consistent metadata for focus and dismiss events", () => {
    const focusEvent = buildSuggestionFocusEvent(baseSuggestion);
    const dismissEvent = buildSuggestionDismissEvent(baseSuggestion);

    expect(focusEvent.payload.metadata.signature).toBe(
      buildSuggestionSignature(baseSuggestion),
    );
    expect(dismissEvent.payload.metadata.signature).toBe(
      buildSuggestionSignature(baseSuggestion),
    );
    expect(focusEvent.payload.metadata.layoutVariant).toBe(
      dismissEvent.payload.metadata.layoutVariant,
    );
  });

  it("resolves viewport breakpoints across ranges", () => {
    expect(resolveViewportBreakpoint(320)).toBe("mobile");
    expect(resolveViewportBreakpoint(800)).toBe("tablet");
    expect(resolveViewportBreakpoint(1280)).toBe("desktop");
    expect(resolveViewportBreakpoint(undefined)).toBe("unknown");
    expect(resolveViewportBreakpoint(-50)).toBe("unknown");
  });
});
