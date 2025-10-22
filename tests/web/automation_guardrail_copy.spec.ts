import { describe, expect, it } from "vitest";

import { buildGuardrailNarratives } from "@web/lib/guardrailCopy";
import type { GuardrailSettings } from "@web/types/automation";

describe("automation guardrail copy integration", () => {
  it("orders narrative cards and injects contextual examples for the UI rail", () => {
    const guardrails: GuardrailSettings = {
      max_daily_budget_delta_pct: 18,
      min_daily_spend: 1200,
      roas_floor: 2.1,
      cpa_ceiling: 95,
      change_windows: ["weekday mornings", "month_end"],
    };

    const narratives = buildGuardrailNarratives(guardrails, {
      metadata: {
        finance: {
          avg_daily_spend: 6800,
          pacing_budget: 7000,
        },
        alerts: [{ code: "spend_warning", spend: 5200 }],
      },
    });

    expect(narratives).toHaveLength(5);
    expect(narratives.map((item) => item.id)).toEqual([
      "max-daily-delta",
      "min-daily-spend",
      "roas-floor",
      "cpa-ceiling",
      "change-windows",
    ]);

    expect(narratives[0].example).toContain("$8,260");
    expect(narratives[1].summary).toContain("$1,200");
    expect(narratives[2].tone).toBe("info");
    expect(narratives[3].summary).toContain("$95");
    expect(narratives[4].summary).toContain("weekday mornings and month_end");
    expect(narratives[4].tone).toBe("success");
  });
});
