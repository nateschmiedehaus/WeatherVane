import { describe, expect, it } from "vitest";

import {
  mapAutomationAuditLogs,
  buildGuardrailExecutiveSummary,
  summarizeGuardrailRisks,
} from "../../apps/web/src/lib/automationInsights";
import {
  buildAutomationTrustSummary,
  filterAutomationAudits,
  evaluateAutomationAuditSignals,
  selectDefaultAutomationAuditFilter,
} from "../../apps/web/src/lib/automationTrust";
import {
  buildAutomationReadinessSnapshot,
  TELEMETRY_CRITICAL_MINUTES,
  TELEMETRY_WARNING_MINUTES,
} from "../../apps/web/src/lib/automationReadiness";
import {
  buildAutomationAuditPreview,
  type AutomationAuditPreview,
} from "../../apps/web/src/demo/onboarding";
import type { DemoPreferences } from "../../apps/web/src/lib/demo";
import type { AuditLogEntry } from "../../apps/web/src/types/audit";
import type { GuardrailSegment } from "../../apps/web/src/types/dashboard";

describe("automation trust insights", () => {
  it("maps guardrail breach logs to critical audit entries with detail", () => {
    const logs: AuditLogEntry[] = [
      {
        id: 101,
        tenant_id: "tenant-123",
        actor_type: "system",
        actor_id: null,
        action: "automation.guardrail.breach.detected",
        payload: {
          guardrail: "Budget delta",
          message: "Daily delta exceeded 15% limit",
        },
        created_at: "2025-01-02T11:00:00Z",
      },
    ];

    const [entry] = mapAutomationAuditLogs(logs, new Date("2025-01-02T12:00:00Z"));

    expect(entry.headline).toBe("Budget delta breach logged");
    expect(entry.detail).toBe("Daily delta exceeded 15% limit");
    expect(entry.tone).toBe("critical");
  });

  it("elevates the riskiest guardrails while preserving total state counts", () => {
    const guardrails: GuardrailSegment[] = [
      {
        name: "CPA ceiling",
        status: "breach",
        value: 148,
        target: 110,
        unit: "usd",
        delta_pct: 34,
        notes: "Paid search overspend",
      },
      {
        name: "ROAS floor",
        status: "watch",
        value: 1.6,
        target: 2,
        unit: "x",
        delta_pct: -20,
        notes: null,
      },
      {
        name: "Spend floor",
        status: "watch",
        value: 4800,
        target: 5000,
        unit: "usd",
        delta_pct: -4,
        notes: null,
      },
      {
        name: "Creative rotation",
        status: "healthy",
        value: 95,
        target: 90,
        unit: "percent",
        delta_pct: 5,
        notes: null,
      },
      {
        name: "Budget pacing",
        status: "breach",
        value: 1.35,
        target: 1,
        unit: "ratio",
        delta_pct: 35,
        notes: "Exceeded pacing guardrail",
      },
      {
        name: "Geo spend",
        status: "healthy",
        value: 1,
        target: 1,
        unit: "ratio",
        delta_pct: 0,
        notes: null,
      },
    ];

    const summary = summarizeGuardrailRisks(guardrails);

    expect(summary.breachCount).toBe(2);
    expect(summary.watchCount).toBe(2);
    expect(summary.healthyCount).toBe(2);
    expect(summary.risks).toHaveLength(5);
    expect(summary.risks[0].name).toBe("Budget pacing");
    expect(summary.risks[1].name).toBe("CPA ceiling");
    expect(summary.risks[2].status).toBe("watch");
  });

  it("produces an exec summary that spotlights breaches and watch items", () => {
    const guardrails: GuardrailSegment[] = [
      {
        name: "Budget pacing",
        status: "breach",
        value: 1.4,
        target: 1,
        unit: "ratio",
        delta_pct: 40,
        notes: "Exceeded weekly pacing threshold",
      },
      {
        name: "ROAS floor",
        status: "watch",
        value: 1.8,
        target: 2,
        unit: "x",
        delta_pct: -10,
        notes: null,
      },
      {
        name: "Creative rotation",
        status: "healthy",
        value: 96,
        target: 90,
        unit: "percent",
        delta_pct: 6,
        notes: null,
      },
    ];

    const summary = summarizeGuardrailRisks(guardrails);
    const executive = buildGuardrailExecutiveSummary(summary);

    expect(executive.status).toBe("critical");
    expect(executive.headline).toContain("breach");
    expect(executive.guidance).toContain("Budget pacing");
    expect(executive.recommendation).toContain("watch item");
  });

  it("flags watch-only posture with a cautionary headline", () => {
    const guardrails: GuardrailSegment[] = [
      {
        name: "ROAS floor",
        status: "watch",
        value: 1.9,
        target: 2,
        unit: "x",
        delta_pct: -5,
        notes: null,
      },
      {
        name: "Budget pacing",
        status: "healthy",
        value: 1.02,
        target: 1,
        unit: "ratio",
        delta_pct: 2,
        notes: null,
      },
    ];

    const summary = summarizeGuardrailRisks(guardrails);
    const executive = buildGuardrailExecutiveSummary(summary);

    expect(executive.status).toBe("caution");
    expect(executive.headline).toContain("watch");
    expect(executive.guidance).toContain("ROAS floor");
    expect(executive.recommendation).toContain("owner sign-off");
  });

  it("warns when telemetry is unavailable", () => {
    const summary = summarizeGuardrailRisks([]);
    const executive = buildGuardrailExecutiveSummary(summary);

    expect(executive.status).toBe("caution");
    expect(executive.headline).toContain("Awaiting guardrail telemetry");
    expect(executive.guidance).toContain("No guardrail signals captured yet");
  });

  it("highlights pending approvals with caution tone and next action", () => {
    const preferences: DemoPreferences = {
      primaryChannel: "meta",
      automationComfort: "manual",
    };
    const audits = buildAutomationAuditPreview(preferences);
    const summary = buildAutomationTrustSummary(audits);

    expect(summary.tone).toBe("caution");
    expect(summary.headline).toContain("needs your approval");
    expect(summary.metrics.find((metric) => metric.id === "pending")?.value).toBe("1");
    expect(summary.nextAction).toMatch(/Approve/i);
  });

  it("celebrates automation shipments when no reviews are pending", () => {
    const preferences: DemoPreferences = {
      primaryChannel: "meta",
      automationComfort: "automation",
    };
    const audits = buildAutomationAuditPreview(preferences);
    const summary = buildAutomationTrustSummary(audits);

    expect(summary.tone).toBe("success");
    expect(summary.headline).toContain("Automation engine shipped");
    expect(summary.metrics.find((metric) => metric.id === "approved")?.value).toBe("1");
    expect(summary.subline).toMatch(/Last shipped/i);
  });

  it("falls back to trust primer when no audit data exists yet", () => {
    const summary = buildAutomationTrustSummary([]);
    expect(summary.tone).toBe("info");
    expect(summary.headline).toContain("Awaiting first");
    expect(summary.metrics.every((metric) => metric.value === "0")).toBe(true);
  });

  it("defaults the change log filter to pending when reviews are waiting", () => {
    const audits: AutomationAuditPreview[] = [
      {
        id: "pending",
        actor: "Ops approver",
        headline: "Meta ramp waiting approval",
        detail: "WeatherVane held the ramp until Ops signs off.",
        status: "pending",
        timeAgo: "12m ago",
        minutesAgo: 12,
      },
      {
        id: "approved",
        actor: "Automation engine",
        headline: "Budget ramp executed safely",
        detail: "Automation engine shipped inside the guardrail band.",
        status: "approved",
        timeAgo: "5m ago",
        minutesAgo: 5,
      },
    ];

    const filter = selectDefaultAutomationAuditFilter(audits);
    expect(filter).toBe("pending");
  });

  it("falls back to an all-changes filter when nothing needs review", () => {
    const audits: AutomationAuditPreview[] = [
      {
        id: "approved",
        actor: "Automation engine",
        headline: "Budget ramp executed safely",
        detail: "Automation engine shipped inside the guardrail band.",
        status: "approved",
        timeAgo: "5m ago",
        minutesAgo: 5,
      },
      {
        id: "shadow",
        actor: "Safety rehearsal",
        headline: "Shadow rehearsal completed",
        detail: "Rollback rehearsed successfully.",
        status: "shadow",
        timeAgo: "12m ago",
        minutesAgo: 12,
      },
    ];

    const filter = selectDefaultAutomationAuditFilter(audits);
    expect(filter).toBe("all");
  });

  it("filters audits by status while preserving chronological order", () => {
    const audits: AutomationAuditPreview[] = [
      {
        id: "approved-1",
        actor: "Automation engine",
        headline: "Launched the Meta ramp",
        detail: "Executed safely inside guardrails.",
        status: "approved",
        timeAgo: "5m ago",
        minutesAgo: 5,
      },
      {
        id: "pending-1",
        actor: "Ops approver",
        headline: "Ops review needed",
        detail: "Finance needs to sign off.",
        status: "pending",
        timeAgo: "12m ago",
        minutesAgo: 12,
      },
      {
        id: "shadow-1",
        actor: "Safety rehearsal",
        headline: "Shadow rehearsal passed",
        detail: "Rollback rehearsed successfully.",
        status: "shadow",
        timeAgo: "36m ago",
        minutesAgo: 36,
      },
    ];

    const pendingOnly = filterAutomationAudits(audits, "pending");
    expect(pendingOnly).toHaveLength(1);
    expect(pendingOnly[0].id).toBe("pending-1");

    const shipped = filterAutomationAudits(audits, "approved");
    expect(shipped).toHaveLength(1);
    expect(shipped[0].id).toBe("approved-1");

    const rehearse = filterAutomationAudits(audits, "shadow");
    expect(rehearse).toHaveLength(1);
    expect(rehearse[0].id).toBe("shadow-1");

    const all = filterAutomationAudits(audits, "all");
    expect(all).toStrictEqual(audits);
  });

  it("escalates overdue pending approvals with urgency copy", () => {
    const audits: AutomationAuditPreview[] = [
      {
        id: "pending-old",
        actor: "Ops approver",
        headline: "Meta ramp waiting on approver",
        detail: "Budget ramp paused until Ops signs off.",
        status: "pending",
        timeAgo: "49h ago",
        minutesAgo: 49 * 60,
        narrative: {
          why: "Budget ramp paused until Ops signs off.",
          nextStep: "Ops can approve the change from the safety queue.",
        },
      },
      {
        id: "shadow-check",
        actor: "Safety rehearsal engine",
        headline: "Shadow rehearsal cleared",
        detail: "Rollback rehearsal still healthy.",
        status: "shadow",
        timeAgo: "12m ago",
        minutesAgo: 12,
      },
    ];

    const summary = buildAutomationTrustSummary(audits);

    expect(summary.headline).toContain("overdue");
    expect(summary.subline).toMatch(/past the 24h review window/i);
    expect(summary.nextAction).toMatch(/Director Dana/i);
    expect(summary.metrics.find((metric) => metric.id === "pending")?.value).toBe("1");
  });

  it("parses relative pending ages when minutesAgo is unavailable", () => {
    const audits: AutomationAuditPreview[] = [
      {
        id: "pending-string",
        actor: "Ops approver",
        headline: "Google ramp waiting approval",
        detail: "WeatherVane paused the ramp until marketing signs off.",
        status: "pending",
        timeAgo: "2 days ago",
      },
    ];

    const summary = buildAutomationTrustSummary(audits);

    expect(summary.headline).toContain("overdue");
    expect(summary.nextAction).toMatch(/Assign an approver/i);
  });

  it("summarises audit signals including overdue counts", () => {
    const audits: AutomationAuditPreview[] = [
      {
        id: "pending-overdue",
        actor: "Ops approver",
        headline: "Budget ramp pending",
        detail: "Waiting on finance review.",
        status: "pending",
        timeAgo: "30h ago",
        minutesAgo: 30 * 60,
      },
      {
        id: "approved-fresh",
        actor: "Automation engine engine",
        headline: "Automation engine shipped Meta ramp",
        detail: "Executed safely inside band.",
        status: "approved",
        timeAgo: "10m ago",
        minutesAgo: 10,
      },
    ];

    const signals = evaluateAutomationAuditSignals(audits);

    expect(signals.pendingCount).toBe(1);
    expect(signals.overdueCount).toBe(1);
    expect(signals.approvedCount).toBe(1);
    expect(signals.latestApprovedMinutes).toBe(10);
  });

  it("flags readiness as blocked when breaches and overdue approvals exist", () => {
    const audits: AutomationAuditPreview[] = [
      {
        id: "overdue",
        actor: "Ops approver",
        headline: "Meta ramp waiting approval",
        detail: "Finance still reviewing spend swing.",
        status: "pending",
        timeAgo: "48h ago",
        minutesAgo: 48 * 60,
      },
      {
        id: "shadow",
        actor: "Safety rehearsal",
        headline: "Rollback rehearsal passed",
        detail: "Shadow run clear.",
        status: "shadow",
        timeAgo: "1h ago",
        minutesAgo: 60,
      },
    ];
    const guardrails: GuardrailSegment[] = [
      {
        name: "Budget pacing",
        status: "breach",
        value: 1.4,
        target: 1,
        unit: "ratio",
        delta_pct: 40,
        notes: "Exceeded pacing threshold",
      },
    ];

    const snapshot = buildAutomationReadinessSnapshot(audits, guardrails, {
      guardrailGeneratedAt: "2025-03-01T11:30:00Z",
      now: new Date("2025-03-01T12:00:00Z"),
    });

    expect(snapshot.tone).toBe("critical");
    expect(snapshot.headline.toLowerCase()).toContain("blocked");
    expect(snapshot.signals.overdueApprovals).toBe(1);
    expect(snapshot.signals.guardrailBreaches).toBe(1);
    expect(snapshot.score).toBeLessThan(50);
    expect(snapshot.nextAction).toMatch(/Director Dana/i);
  });

  it("celebrates readiness when guardrails are healthy and approvals clear", () => {
    const audits: AutomationAuditPreview[] = [
      {
        id: "approved",
        actor: "Automation engine engine",
        headline: "Automation engine shipped Meta ramp",
        detail: "Budget shift executed safely.",
        status: "approved",
        timeAgo: "12m ago",
        minutesAgo: 12,
      },
    ];
    const guardrails: GuardrailSegment[] = [
      {
        name: "Budget pacing",
        status: "healthy",
        value: 1.02,
        target: 1,
        unit: "ratio",
        delta_pct: 2,
        notes: null,
      },
      {
        name: "ROAS floor",
        status: "healthy",
        value: 2.3,
        target: 2,
        unit: "x",
        delta_pct: 15,
        notes: null,
      },
    ];

    const snapshot = buildAutomationReadinessSnapshot(audits, guardrails, {
      guardrailGeneratedAt: "2025-03-01T11:50:00Z",
      now: new Date("2025-03-01T12:00:00Z"),
    });

    expect(snapshot.tone).toBe("success");
    expect(snapshot.score).toBeGreaterThanOrEqual(80);
    expect(snapshot.headline).toMatch(/ready/i);
    expect(snapshot.nextAction).toMatch(/exec sign-off/i);
  });

  it("returns informative readiness when telemetry is missing", () => {
    const snapshot = buildAutomationReadinessSnapshot([], [], {
      guardrailGeneratedAt: null,
      now: new Date("2025-03-01T12:00:00Z"),
    });
    expect(snapshot.tone).toBe("info");
    expect(snapshot.headline).toMatch(/awaiting telemetry/i);
    expect(snapshot.nextAction).toMatch(/rehearsal/i);
  });

  it("downgrades readiness when guardrail telemetry is stale", () => {
    const guardrails: GuardrailSegment[] = [
      {
        name: "Budget pacing",
        status: "healthy",
        value: 1,
        target: 1,
        unit: "ratio",
        delta_pct: 0,
        notes: null,
      },
    ];
    const now = new Date("2025-03-01T12:00:00Z");
    const generatedAt = new Date(now.getTime() - (TELEMETRY_WARNING_MINUTES + 30) * 60000);

    const snapshot = buildAutomationReadinessSnapshot(
      [],
      guardrails,
      {
        guardrailGeneratedAt: generatedAt.toISOString(),
        now,
      },
    );

    expect(snapshot.tone).toBe("caution");
    expect(snapshot.headline.toLowerCase()).toContain("telemetry");
    expect(snapshot.nextAction).toMatch(/telemetry/i);
  });

  it("treats very stale telemetry as a critical blocker even without breaches", () => {
    const guardrails: GuardrailSegment[] = [
      {
        name: "Budget pacing",
        status: "healthy",
        value: 1,
        target: 1,
        unit: "ratio",
        delta_pct: 0,
        notes: null,
      },
    ];
    const now = new Date("2025-03-01T12:00:00Z");
    const generatedAt = new Date(now.getTime() - (TELEMETRY_CRITICAL_MINUTES + 60) * 60000);

    const snapshot = buildAutomationReadinessSnapshot(
      [],
      guardrails,
      {
        guardrailGeneratedAt: generatedAt.toISOString(),
        now,
      },
    );

    expect(snapshot.tone).toBe("critical");
    expect(snapshot.headline.toLowerCase()).toContain("telemetry");
    expect(snapshot.nextAction.toLowerCase()).toContain("refresh guardrail telemetry");
  });

  it("downgrades readiness and messaging when onboarding falls back to demo proof", () => {
    const audits: AutomationAuditPreview[] = [
      {
        id: "approved",
        actor: "Automation engine engine",
        headline: "Automation engine shipped Meta ramp",
        detail: "Budget shift executed safely.",
        status: "approved",
        timeAgo: "12m ago",
        minutesAgo: 12,
      },
    ];
    const guardrails: GuardrailSegment[] = [
      {
        name: "Budget pacing",
        status: "healthy",
        value: 1.02,
        target: 1,
        unit: "ratio",
        delta_pct: 2,
        notes: null,
      },
    ];

    const snapshot = buildAutomationReadinessSnapshot(audits, guardrails, {
      guardrailGeneratedAt: "2025-03-01T11:50:00Z",
      now: new Date("2025-03-01T12:00:00Z"),
      isFallback: true,
      fallbackReason: "live_progress_unavailable",
    });

    expect(snapshot.tone).toBe("caution");
    expect(snapshot.headline).toMatch(/live telemetry/i);
    expect(snapshot.subline).toMatch(/demo proof/i);
    expect(snapshot.nextAction).toMatch(/onboarding ingestion/i);
    expect(snapshot.score).toBeLessThanOrEqual(65);
  });
});
