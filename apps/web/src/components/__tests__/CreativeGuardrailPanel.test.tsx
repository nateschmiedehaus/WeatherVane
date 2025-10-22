import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { CreativeGuardrailPanel } from "../CreativeGuardrailPanel";
import type { CreativeResponseReport } from "../../types/creative";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderPanel(report: CreativeResponseReport) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<CreativeGuardrailPanel report={report} />);
  });

  const cleanup = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return { container, cleanup };
}

function buildReport(): CreativeResponseReport {
  return {
    generated_at: "2025-01-01T00:00:00Z",
    policy: {
      roas_floor: 1.25,
      warn_threshold: 0.65,
      block_threshold: 0.35,
      min_impressions: 200,
    },
    summary: {
      creative_count: 3,
      active_creatives: 2,
      blocked_creatives: 1,
      watchlist_creatives: 0,
      average_roas: 2.05,
      median_roas: 1.9,
      active_spend_share: 0.58,
      watchlist_spend_share: 0.0,
      blocked_spend_share: 0.42,
      guardrail_counts: { brand_safety_block: 1 },
    },
    top_creatives: [
      {
        creative_id: "cr_meta_safe",
        channel: "meta",
        roas_adjusted: 2.75,
        brand_safety_score: 0.9,
        status: "active",
      },
      {
        creative_id: "cr_search_safe",
        channel: "search",
        roas_adjusted: 1.82,
        brand_safety_score: 0.88,
        status: "active",
      },
      {
        creative_id: "cr_display_flag",
        channel: "display",
        roas_adjusted: 0.45,
        brand_safety_score: 0.21,
        status: "blocked",
      },
    ],
    creatives: [
      {
        creative_id: "cr_meta_safe",
        channel: "meta",
        impressions: 5200,
        clicks: 320,
        conversions: 63,
        spend: 720.0,
        revenue: 1980.0,
        brand_safety_score: 0.9,
        brand_safety_tier: "safe",
        brand_safety_factor: 1.0,
        sample_size_factor: 1.0,
        ctr: 0.0615,
        cvr: 0.1968,
        aov: 31.43,
        roas_smoothed: 2.75,
        roas_adjusted: 2.75,
        guardrail_factor: 1.0,
        status: "active",
        guardrail: null,
        spend_share: 0.33,
        profit_expectation: 1.5,
      },
      {
        creative_id: "cr_display_flag",
        channel: "display",
        impressions: 2100,
        clicks: 68,
        conversions: 5,
        spend: 440.0,
        revenue: 180.0,
        brand_safety_score: 0.21,
        brand_safety_tier: "watchlist",
        brand_safety_factor: 0.0,
        sample_size_factor: 0.72,
        ctr: 0.0324,
        cvr: 0.0735,
        aov: 36.0,
        roas_smoothed: 0.45,
        roas_adjusted: 0.0,
        guardrail_factor: 0.0,
        status: "blocked",
        guardrail: "brand_safety_block",
        spend_share: 0.42,
        profit_expectation: -0.8,
      },
      {
        creative_id: "cr_search_safe",
        channel: "search",
        impressions: 1800,
        clicks: 120,
        conversions: 18,
        spend: 520.0,
        revenue: 950.0,
        brand_safety_score: 0.88,
        brand_safety_tier: "safe",
        brand_safety_factor: 1.0,
        sample_size_factor: 1.0,
        ctr: 0.0667,
        cvr: 0.15,
        aov: 52.78,
        roas_smoothed: 1.82,
        roas_adjusted: 1.82,
        guardrail_factor: 1.0,
        status: "active",
        guardrail: null,
        spend_share: 0.25,
        profit_expectation: 0.57,
      },
    ],
    channel_guardrails: [
      {
        channel: "display",
        creative_count: 1,
        active_creatives: 0,
        watchlist_creatives: 0,
        blocked_creatives: 1,
        flagged_creatives: 1,
        active_spend_share: 0.0,
        watchlist_spend_share: 0.0,
        blocked_spend_share: 0.42,
        flagged_spend_share: 0.42,
        average_roas: 0.45,
        average_brand_safety: 0.21,
        top_guardrail: "brand_safety_block",
        top_guardrail_count: 1,
        representative_creative: "cr_display_flag",
        representative_status: "blocked",
      },
      {
        channel: "meta",
        creative_count: 1,
        active_creatives: 1,
        watchlist_creatives: 0,
        blocked_creatives: 0,
        flagged_creatives: 0,
        active_spend_share: 0.33,
        watchlist_spend_share: 0.0,
        blocked_spend_share: 0.0,
        flagged_spend_share: 0.0,
        average_roas: 2.75,
        average_brand_safety: 0.9,
        top_guardrail: null,
        top_guardrail_count: 0,
        representative_creative: null,
        representative_status: null,
      },
      {
        channel: "search",
        creative_count: 1,
        active_creatives: 1,
        watchlist_creatives: 0,
        blocked_creatives: 0,
        flagged_creatives: 0,
        active_spend_share: 0.25,
        watchlist_spend_share: 0.0,
        blocked_spend_share: 0.0,
        flagged_spend_share: 0.0,
        average_roas: 1.82,
        average_brand_safety: 0.88,
        top_guardrail: null,
        top_guardrail_count: 0,
        representative_creative: null,
        representative_status: null,
      },
    ],
  };
}

describe("CreativeGuardrailPanel", () => {
  it("renders channel guardrail posture with dominant risks", () => {
    const report = buildReport();
    const { container, cleanup } = renderPanel(report);

    try {
      const tables = Array.from(container.querySelectorAll("table"));
      const channelTable = tables.find((table) =>
        Array.from(table.querySelectorAll("th")).some((th) => th.textContent === "Flagged spend"),
      );
      expect(channelTable).toBeDefined();
      const rows = Array.from(channelTable!.querySelectorAll("tbody tr"));
      expect(rows).toHaveLength(3);

      const displayRowCells = Array.from(rows[0].querySelectorAll("td")).map((cell) => cell.textContent?.trim());
      expect(displayRowCells[0]).toBe("display");
      expect(displayRowCells[2]).toContain("1");
      expect(displayRowCells[3]).toContain("42.0%");
      expect(displayRowCells[6]).toContain("Brand Safety Block");
      expect(displayRowCells[7]).toContain("cr_display_flag");
    } finally {
      cleanup();
    }
  });
});

