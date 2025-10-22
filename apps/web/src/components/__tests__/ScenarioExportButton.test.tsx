import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { ScenarioExportButton } from "../ScenarioExportButton";
import type { ScenarioOutcome } from "../../lib/scenario-builder";
import type { ScenarioRecommendation } from "../../types/scenario";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockOutcome: ScenarioOutcome = {
  summary: {
    totalBaseSpend: 10000,
    totalScenarioSpend: 12000,
    deltaSpend: 2000,
    totalBaseRevenue: 30000,
    totalScenarioRevenue: 36000,
    deltaRevenue: 6000,
    baseRoi: 3.0,
    scenarioRoi: 3.0,
    weightedConfidence: "HIGH",
  },
  channels: [
    {
      channel: "Google Ads",
      confidence: "HIGH",
      baseSpend: 5000,
      baseRevenue: 15000,
      scenarioSpend: 6000,
      scenarioRevenue: 18000,
      deltaSpend: 1000,
      deltaRevenue: 3000,
      baseRoi: 3.0,
      scenarioRoi: 3.0,
    },
  ],
};

const mockRecommendations: ScenarioRecommendation[] = [
  {
    id: "rec1",
    label: "Test Rec",
    description: "Test",
    tags: ["growth"],
    adjustments: [
      {
        channel: "Google Ads",
        multiplier: 1.15,
        rationale: "Test",
        confidence: "HIGH",
      },
    ],
  },
];

const mockAdjustments = { "Google Ads": 1.2 };

describe("ScenarioExportButton", () => {
  it("renders without crashing", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioExportButton
          outcome={mockOutcome}
          recommendations={mockRecommendations}
          adjustments={mockAdjustments}
          tenantId="demo-tenant"
          horizonDays={7}
        />
      );
    });

    expect(container.innerHTML).toContain("Export scenario");
  });

  it("renders disabled when outcome is null", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioExportButton
          outcome={null}
          recommendations={[]}
          adjustments={{}}
          tenantId="demo-tenant"
          horizonDays={7}
        />
      );
    });

    const button = container.querySelector("button");
    expect(button?.disabled).toBe(true);
  });

  it("calls onExport with CSV when callback provided", () => {
    const onExport = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioExportButton
          outcome={mockOutcome}
          recommendations={mockRecommendations}
          adjustments={mockAdjustments}
          tenantId="demo-tenant"
          horizonDays={7}
          onExport={onExport}
        />
      );
    });

    const button = container.querySelector("button");
    expect(button).not.toBeNull();

    // Click to open menu
    act(() => {
      button!.click();
    });

    // Find CSV button
    const csvButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Export CSV")
    );

    expect(csvButton).not.toBeUndefined();

    // Click CSV export
    act(() => {
      csvButton!.click();
    });

    expect(onExport).toHaveBeenCalledTimes(1);
    const [data, filename, format] = onExport.mock.calls[0];
    expect(data).toContain("[SCENARIO SUMMARY]");
    expect(filename).toMatch(/weathervane-scenario-demo-tenant-.+\.csv/);
    expect(format).toBe("csv");
  });

  it("calls onExport with PowerPoint data when callback provided", () => {
    const onExport = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioExportButton
          outcome={mockOutcome}
          recommendations={mockRecommendations}
          adjustments={mockAdjustments}
          tenantId="demo-tenant"
          horizonDays={7}
          onExport={onExport}
        />
      );
    });

    const button = container.querySelector("button");

    // Click to open menu
    act(() => {
      button!.click();
    });

    // Find PowerPoint button
    const pptButton = Array.from(container.querySelectorAll("button")).find((btn) =>
      btn.textContent?.includes("Export PowerPoint")
    );

    expect(pptButton).not.toBeUndefined();

    // Click PowerPoint export
    act(() => {
      pptButton!.click();
    });

    expect(onExport).toHaveBeenCalledTimes(1);
    const [data, filename, format] = onExport.mock.calls[0];
    expect(data).toContain('"version": "1.0"');
    expect(filename).toMatch(/weathervane-scenario-demo-tenant-.+\.pptx\.json/);
    expect(format).toBe("pptx");
  });

  it("applies custom className", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioExportButton
          outcome={mockOutcome}
          recommendations={mockRecommendations}
          adjustments={mockAdjustments}
          tenantId="demo-tenant"
          horizonDays={7}
          className="custom-class"
        />
      );
    });

    const button = container.querySelector("button");
    expect(button?.className).toContain("custom-class");
  });

  it("sets analytics ID", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <ScenarioExportButton
          outcome={mockOutcome}
          recommendations={mockRecommendations}
          adjustments={mockAdjustments}
          tenantId="demo-tenant"
          horizonDays={7}
          analyticsId="test.analytics.id"
        />
      );
    });

    const button = container.querySelector("button");
    expect(button?.getAttribute("data-analytics-id")).toBe("test.analytics.id");
  });
});
