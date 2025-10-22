import { describe, expect, it } from "vitest";

import {
  buildGuardrailExecutiveSummary,
  mapAutomationAuditLogs,
  summarizeGuardrailRisks,
} from "@web/lib/automationInsights";
import type { AuditLogEntry } from "@web/types/audit";
import type { GuardrailSegment } from "@web/types/dashboard";

describe("executive review guardrail readiness", () => {
  it("confirms Automation engine readiness when all guardrails are healthy", () => {
    const segments: GuardrailSegment[] = [
      {
        name: "Budget pacing",
        status: "healthy",
        value: 1,
        target: 1,
        unit: "ratio",
        delta_pct: 0,
        notes: null,
      },
      {
        name: "ROAS floor",
        status: "healthy",
        value: 2.4,
        target: 2,
        unit: "x",
        delta_pct: 20,
        notes: null,
      },
      {
        name: "Creative rotation",
        status: "healthy",
        value: 94,
        target: 90,
        unit: "percent",
        delta_pct: 4,
        notes: null,
      },
    ];

    const summary = summarizeGuardrailRisks(segments);
    const executive = buildGuardrailExecutiveSummary(summary);

    expect(executive.status).toBe("ready");
    expect(executive.headline).toContain("Guardrails ready");
    expect(executive.guidance).toContain("3 guardrails healthy");
    expect(executive.recommendation).toContain("exec sign-off");
  });

  it("surfaces guardrail watch items alongside audit evidence for exec review", () => {
    const guardrails: GuardrailSegment[] = [
      {
        name: "Budget pacing",
        status: "watch",
        value: 1.18,
        target: 1,
        unit: "ratio",
        delta_pct: 18,
        notes: "Trending hot because of seasonal spend spike",
      },
      {
        name: "Consent coverage",
        status: "watch",
        value: 94,
        target: 98,
        unit: "percent",
        delta_pct: -4,
        notes: null,
      },
      {
        name: "Creative rotation",
        status: "healthy",
        value: 93,
        target: 90,
        unit: "percent",
        delta_pct: 3,
        notes: null,
      },
    ];

    const logs: AuditLogEntry[] = [
      {
        id: 401,
        tenant_id: "tenant-456",
        actor_type: "user",
        actor_id: "julia@weathervane.ai",
        action: "automation.settings.updated",
        payload: {
          changes: {
            mode: { before: "assist", after: "autopilot" },
            consent_status: { before: "pending", after: "granted" },
          },
        },
        created_at: "2025-01-02T11:30:00Z",
      },
      {
        id: 402,
        tenant_id: "tenant-456",
        actor_type: "system",
        actor_id: null,
        action: "automation.guardrail.breach.detected",
        payload: {
          guardrail: "Budget pacing",
          message: "Exceeded pace threshold during surge campaign",
        },
        created_at: "2025-01-02T11:40:00Z",
      },
    ];

    const now = new Date("2025-01-02T12:00:00Z");
    const summary = summarizeGuardrailRisks(guardrails);
    const executive = buildGuardrailExecutiveSummary(summary);
    const timeline = mapAutomationAuditLogs(logs, now);

    expect(executive.status).toBe("caution");
    expect(executive.guidance).toContain("Budget pacing");
    expect(executive.recommendation).toContain("owner sign-off");

    expect(timeline).toHaveLength(2);
    expect(timeline[0].headline.toLowerCase()).toContain("mode assist → autopilot");
    expect(timeline[0].detail?.toLowerCase()).toContain("consent pending → granted");
    expect(timeline[0].timeAgo).toBe("30m ago");
    expect(timeline[1].tone).toBe("critical");
    expect(timeline[1].detail).toContain("Exceeded pace threshold");
  });
});
