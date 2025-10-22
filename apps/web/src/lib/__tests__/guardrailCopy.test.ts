import { describe, expect, it } from "vitest";

import { buildGuardrailNarratives } from "../guardrailCopy";
import type { GuardrailSettings } from "../../types/automation";

const baseGuardrails: GuardrailSettings = {
  max_daily_budget_delta_pct: 15,
  min_daily_spend: 750,
  roas_floor: 2.5,
  cpa_ceiling: 160,
  change_windows: ["weekdays", "quarter_close"],
};

describe("buildGuardrailNarratives", () => {
  it("translates configured guardrails into plain-language narratives with examples", () => {
    const narratives = buildGuardrailNarratives(baseGuardrails, { sampleDailySpend: 6000 });

    const delta = narratives.find((item) => item.id === "max-daily-delta");
    const minSpend = narratives.find((item) => item.id === "min-daily-spend");
    const roas = narratives.find((item) => item.id === "roas-floor");
    const cpa = narratives.find((item) => item.id === "cpa-ceiling");
    const windows = narratives.find((item) => item.id === "change-windows");

    expect(delta).toBeDefined();
    expect(delta?.summary).toContain("±15%");
    expect(delta?.example).toContain("$6,900");
    expect(delta?.example).toContain("$5,100");

    expect(minSpend).toBeDefined();
    expect(minSpend?.summary).toContain("$750.00");
    expect(minSpend?.example).toContain("$750.00");

    expect(roas).toBeDefined();
    expect(roas?.summary).toContain("2.50×");
    expect(roas?.example).toContain("$15,000");

    expect(cpa).toBeDefined();
    expect(cpa?.summary).toContain("$160");
    expect(cpa?.example).toContain("$160");

    expect(windows).toBeDefined();
    expect(windows?.summary).toContain("weekdays and quarter_close");
  });

  it("highlights missing guardrails as cautions when thresholds are unset", () => {
    const guardrails: GuardrailSettings = {
      max_daily_budget_delta_pct: 0,
      min_daily_spend: 0,
      roas_floor: null,
      cpa_ceiling: null,
      change_windows: [],
    };

    const narratives = buildGuardrailNarratives(guardrails);

    for (const item of narratives) {
      if (item.id === "max-daily-delta") {
        expect(item.summary).toMatch(/Automation engine changes are paused/i);
        expect(item.tone).toBe("caution");
      }
      if (item.id === "min-daily-spend") {
        expect(item.summary).toMatch(/No minimum spend set/i);
        expect(item.tone).toBe("caution");
      }
      if (item.id === "roas-floor") {
        expect(item.summary).toMatch(/No ROAS floor set/i);
        expect(item.tone).toBe("caution");
      }
      if (item.id === "cpa-ceiling") {
        expect(item.summary).toMatch(/No CPA ceiling set/i);
        expect(item.tone).toBe("caution");
      }
      if (item.id === "change-windows") {
        expect(item.summary).toMatch(/Automation engine can push at any hour/i);
        expect(item.tone).toBe("caution");
      }
    }
  });

  it("derives sample spend from nested metadata when no override is provided", () => {
    const metadata = {
      finance: {
        avg_daily_spend: 4200,
        pacing_budget: 5200,
      },
      notes: [
        { topic: "spend_guardrail", value: 3200 },
        { topic: "budget_ceiling", amount: 4800 },
      ],
    };

    const narratives = buildGuardrailNarratives(baseGuardrails, { metadata });
    const delta = narratives.find((item) => item.id === "max-daily-delta");
    expect(delta?.example).toContain("$5,980");
  });
});
