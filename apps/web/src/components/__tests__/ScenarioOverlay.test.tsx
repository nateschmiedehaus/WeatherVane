import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { ScenarioOverlay } from "../ScenarioOverlay";
import type { ScenarioOutcome } from "../../lib/scenario-builder";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockOutcome: ScenarioOutcome = {
  summary: {
    totalBaseSpend: 20000,
    totalScenarioSpend: 24000,
    deltaSpend: 4000,
    totalBaseRevenue: 60000,
    totalScenarioRevenue: 72000,
    deltaRevenue: 12000,
    baseRoi: 3.0,
    scenarioRoi: 3.0,
    weightedConfidence: "HIGH",
  },
  channels: [
    {
      channel: "Google Ads",
      confidence: "HIGH",
      baseSpend: 10000,
      baseRevenue: 30000,
      scenarioSpend: 12000,
      scenarioRevenue: 36000,
      deltaSpend: 2000,
      deltaRevenue: 6000,
      baseRoi: 3.0,
      scenarioRoi: 3.0,
    },
    {
      channel: "Meta Ads",
      confidence: "MEDIUM",
      baseSpend: 8000,
      baseRevenue: 24000,
      scenarioSpend: 10000,
      scenarioRevenue: 30000,
      deltaSpend: 2000,
      deltaRevenue: 6000,
      baseRoi: 3.0,
      scenarioRoi: 3.0,
    },
    {
      channel: "TikTok Ads",
      confidence: "LOW",
      baseSpend: 2000,
      baseRevenue: 6000,
      scenarioSpend: 2000,
      scenarioRevenue: 6000,
      deltaSpend: 0,
      deltaRevenue: 0,
      baseRoi: 3.0,
      scenarioRoi: 3.0,
    },
  ],
};

const mockAdjustments = {
  "Google Ads": 1.2,
  "Meta Ads": 1.25,
  "TikTok Ads": 1.0,
};

describe("ScenarioOverlay", () => {
  it("renders without crashing", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioOverlay outcome={mockOutcome} adjustments={mockAdjustments} />
      );
    });

    expect(container.innerHTML).toContain("Scenario overlay analysis");
  });

  it("displays confidence bands when enabled", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioOverlay
          outcome={mockOutcome}
          adjustments={mockAdjustments}
          showConfidenceBands={true}
        />
      );
    });

    expect(container.innerHTML).toContain("Confidence bands");
  });

  it("hides confidence bands when disabled", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioOverlay
          outcome={mockOutcome}
          adjustments={mockAdjustments}
          showConfidenceBands={false}
        />
      );
    });

    expect(container.innerHTML).not.toContain("Confidence bands");
  });

  it("displays weather impact when enabled", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioOverlay
          outcome={mockOutcome}
          adjustments={mockAdjustments}
          showWeatherImpact={true}
        />
      );
    });

    expect(container.innerHTML).toContain("Weather sensitivity");
  });

  it("hides weather impact when disabled", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioOverlay
          outcome={mockOutcome}
          adjustments={mockAdjustments}
          showWeatherImpact={false}
        />
      );
    });

    expect(container.innerHTML).not.toContain("Weather sensitivity");
  });

  it("shows all channels in confidence bands", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioOverlay
          outcome={mockOutcome}
          adjustments={mockAdjustments}
          showConfidenceBands={true}
        />
      );
    });

    expect(container.innerHTML).toContain("Google Ads");
    expect(container.innerHTML).toContain("Meta Ads");
    expect(container.innerHTML).toContain("TikTok Ads");
  });

  it("displays confidence levels", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioOverlay
          outcome={mockOutcome}
          adjustments={mockAdjustments}
          showConfidenceBands={true}
        />
      );
    });

    expect(container.innerHTML).toContain("HIGH");
    expect(container.innerHTML).toContain("MEDIUM");
    expect(container.innerHTML).toContain("LOW");
  });

  it("displays impact magnitude chart", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioOverlay outcome={mockOutcome} adjustments={mockAdjustments} />
      );
    });

    expect(container.innerHTML).toContain("Impact magnitude");
  });

  it("handles single channel scenario", () => {
    const singleChannelOutcome: ScenarioOutcome = {
      summary: mockOutcome.summary,
      channels: [mockOutcome.channels[0]],
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioOverlay
          outcome={singleChannelOutcome}
          adjustments={{ "Google Ads": 1.1 }}
        />
      );
    });

    expect(container.innerHTML).toContain("Google Ads");
    expect(container.innerHTML).not.toContain("Meta Ads");
  });

  it("handles missing adjustments with defaults", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioOverlay
          outcome={mockOutcome}
          adjustments={{}}
          showConfidenceBands={true}
        />
      );
    });

    expect(container.innerHTML).toContain("Google Ads");
    expect(container.innerHTML).toContain("Meta Ads");
  });

  it("handles zero deltas gracefully", () => {
    const zeroDeltaOutcome: ScenarioOutcome = {
      summary: mockOutcome.summary,
      channels: mockOutcome.channels.map((ch) => ({
        ...ch,
        deltaSpend: 0,
        deltaRevenue: 0,
      })),
    };

    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioOverlay outcome={zeroDeltaOutcome} adjustments={mockAdjustments} />
      );
    });

    expect(container.querySelector('[role="region"]')).not.toBeNull();
  });
});
