import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { PlanDownloadButton } from "../PlanDownloadButton";
import type { PlanResponse } from "../../types/plan";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const samplePlan: PlanResponse = {
  tenant_id: "demo-tenant",
  generated_at: "2025-10-21T05:15:00Z",
  horizon_days: 7,
  slices: [
    {
      plan_date: "2025-10-22",
      geo_group_id: "metro-nyc",
      category: "Outerwear",
      channel: "Meta",
      recommended_spend: 12500,
      expected_revenue: { p10: 18000, p50: 24000, p90: 32000 },
      expected_roas: { p10: 1.2, p50: 1.9, p90: 2.6 },
      confidence: "HIGH",
      assumptions: [],
      rationale: {
        primary_driver: "Warm surge increasing jacket demand",
        supporting_factors: ["Geo clusters show +14% CTR"],
        confidence_level: "HIGH",
        data_quality: "GOOD",
        assumptions: [],
        risks: [],
      },
      status: "primary",
    },
  ],
  context_tags: [],
};

function renderButton(plan: PlanResponse | null, onDownload = vi.fn()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <PlanDownloadButton
        plan={plan}
        tenantId="demo-tenant"
        className="test-class"
        analyticsId="plan.download"
        onDownload={onDownload}
      />,
    );
  });

  const button = container.querySelector("button") as HTMLButtonElement | null;

  const cleanup = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return { button, cleanup };
}

describe("PlanDownloadButton", () => {
  it("emits CSV content and filename when clicked", () => {
    const onDownload = vi.fn();
    const { button, cleanup } = renderButton(samplePlan, onDownload);
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(false);

    act(() => {
      button?.click();
    });

    expect(onDownload).toHaveBeenCalledTimes(1);
    const [csv, filename] = onDownload.mock.calls[0];
    expect(csv).toContain("plan_date,geo_group_id,category");
    expect(csv).toContain("2025-10-22,metro-nyc,Outerwear,Meta");
    expect(filename).toBe("weathervane-plan-demo-tenant-2025-10-21T05-15-00Z.csv");

    cleanup();
  });

  it("disables the button when no plan is available", () => {
    const { button, cleanup } = renderButton(null);
    expect(button).toBeTruthy();
    expect(button?.disabled).toBe(true);
    cleanup();
  });
});
