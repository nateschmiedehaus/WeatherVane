import { describe, expect, it, vi } from "vitest";

vi.mock("next/head", () => ({ default: () => null }));
vi.mock("next/link", () => ({ default: () => null }));
vi.mock("next/router", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), query: {} }) }));
vi.mock(
  "../../apps/web/src/components/Layout",
  () => ({
    Layout: () => null,
  }),
);
vi.mock(
  "../../apps/web/src/lib/api",
  () => ({
    acknowledgeDashboardAlert: vi.fn(),
    escalateDashboardAlert: vi.fn(),
    fetchDashboard: vi.fn(),
    recordDashboardSuggestionEvent: vi.fn(),
  }),
);
vi.mock("../../apps/web/src/lib/analytics", () => ({ trackDashboardEvent: vi.fn() }));
vi.mock("../../apps/web/src/lib/demo", () => ({ useDemo: () => ({ isDemoMode: false }) }));
vi.mock("../../apps/web/src/demo/dashboard", () => ({ buildDemoDashboard: vi.fn() }));
vi.mock("../../apps/web/src/styles/dashboard.module.css", () => ({}), { virtual: true });

describe("buildSuggestionTelemetryTopSignal", () => {
  it("includes high-risk count meta when the top signal lacks a badge", async () => {
    const { buildSuggestionTelemetryTopSignal } = await import(
      "../../apps/web/src/pages/dashboard"
    );

    const overview = {
      totalSuggestions: 3,
      totalViewCount: 48,
      totalInteractions: 18,
      averageFocusRate: 0.35,
      averageDismissRate: 0.02,
      averageEngagementRate: 0.37,
      topRegion: "Harbor District",
      topSummary: "Localized Harbor outlook",
      topReason: "Weather within watch parameters",
      topFocusRate: 0.25,
      topDismissRate: 0.1,
      topEngagementRate: 0.35,
      topHasScheduledStart: false,
      topGuardrailStatus: "watch" as const,
      topLayoutVariant: "dense" as const,
      topViewCount: 48,
      topFocusCount: 12,
      topDismissCount: 6,
      topHighRiskCount: 3,
      topHighRiskSeverity: "none" as const,
      topEventCount: 2,
      topConfidenceLevel: "medium" as const,
      topConfidenceLabel: "Stable engagement",
      hasSignals: true,
    };

    const topSignal = buildSuggestionTelemetryTopSignal(overview);

    expect(topSignal).not.toBeNull();
    expect(topSignal?.summary).toBe("Localized Harbor outlook");
    expect(topSignal?.meta).toContain("3 high-risk alerts");
    expect(topSignal?.highRiskBadge).toBeNull();
    expect(topSignal?.highRiskDetail).toBe("3 high-risk alerts logged");
  });

  it("prioritises badge detail when the top signal carries critical risk", async () => {
    const { buildSuggestionTelemetryTopSignal } = await import(
      "../../apps/web/src/pages/dashboard"
    );

    const overview = {
      totalSuggestions: 4,
      totalViewCount: 72,
      totalInteractions: 28,
      averageFocusRate: 0.4,
      averageDismissRate: 0.05,
      averageEngagementRate: 0.45,
      topRegion: "Storm Coast",
      topSummary: "Storm Coast under direct impact",
      topReason: "Critical front approaching",
      topFocusRate: 0.3,
      topDismissRate: 0.1,
      topEngagementRate: 0.4,
      topHasScheduledStart: true,
      topGuardrailStatus: "breach" as const,
      topLayoutVariant: "stacked" as const,
      topViewCount: 60,
      topFocusCount: 18,
      topDismissCount: 6,
      topHighRiskCount: 4,
      topHighRiskSeverity: "critical" as const,
      topEventCount: 5,
      topConfidenceLevel: "high" as const,
      topConfidenceLabel: "Strong engagement",
      hasSignals: true,
    };

    const topSignal = buildSuggestionTelemetryTopSignal(overview);

    expect(topSignal).not.toBeNull();
    expect(topSignal?.summary).toBe("Storm Coast under direct impact");
    expect(topSignal?.meta).toContain("Critical risk · 4 alerts");
    expect(topSignal?.meta).not.toContain("4 high-risk alerts · Critical risk · 4 alerts");
    expect(topSignal?.highRiskBadge).toBe("Critical risk");
    expect(topSignal?.meta).toContain("events tracked");
    expect(topSignal?.meta).toContain("Engagement");
  });
});
