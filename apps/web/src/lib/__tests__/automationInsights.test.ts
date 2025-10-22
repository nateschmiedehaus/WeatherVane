import {
  buildGuardrailPostureSegments,
  describeGuardrailPosture,
  mapAutomationAuditLogs,
  summarizeGuardrailRisks,
} from "../automationInsights";
import type { AuditLogEntry } from "../../types/audit";
import type { GuardrailSegment } from "../../types/dashboard";

describe("mapAutomationAuditLogs", () => {
  it("converts automation setting updates into timeline items with tone", () => {
    const logs: AuditLogEntry[] = [
      {
        id: 1,
        tenant_id: "tenant-123",
        actor_type: "user",
        actor_id: "ops@weathervane",
        action: "automation.settings.updated",
        payload: {
          changes: {
            mode: { before: "assist", after: "automation" },
            consent_status: { before: "pending", after: "granted" },
          },
        },
        created_at: "2024-01-01T10:45:00Z",
      },
    ];

    const timeline = mapAutomationAuditLogs(logs, new Date("2024-01-01T12:00:00Z"));
    expect(timeline).toHaveLength(1);
    const [item] = timeline;
    expect(item.headline).toContain("Mode assist → automation");
    expect(item.detail).toContain("Consent pending → granted");
    expect(item.tone).toBe("success");
    expect(item.timeAgo).toBe("1h ago");
  });

  it("handles privacy data requests with fallback actor and detail", () => {
    const logs: AuditLogEntry[] = [
      {
        id: 2,
        tenant_id: "tenant-123",
        actor_type: "system",
        actor_id: null,
        action: "privacy.request.export",
        payload: { requested_by: "legal@tenant", request_type: "export" },
        created_at: "2024-01-01T11:59:00Z",
      },
    ];

    const timeline = mapAutomationAuditLogs(logs, new Date("2024-01-01T12:00:00Z"));
    expect(timeline).toHaveLength(1);
    const [item] = timeline;
    expect(item.headline).toBe("Data export requested");
    expect(item.detail).toBe("Requested by legal@tenant");
    expect(item.actor).toBe("WeatherVane");
    expect(item.tone).toBe("info");
    expect(item.timeAgo).toBe("1m ago");
  });

  it("highlights guardrail breach events with critical tone and descriptive detail", () => {
    const logs: AuditLogEntry[] = [
      {
        id: 3,
        tenant_id: "tenant-123",
        actor_type: "system",
        actor_id: null,
        action: "automation.guardrail.breach.logged",
        payload: {
          guardrail: "CPA ceiling",
          message: "CPA exceeded tenant ceiling by 12%",
        },
        created_at: "2024-01-01T10:40:00Z",
      },
    ];

    const timeline = mapAutomationAuditLogs(logs, new Date("2024-01-01T12:00:00Z"));
    expect(timeline).toHaveLength(1);
    const [item] = timeline;
    expect(item.headline).toBe("CPA ceiling breach logged");
    expect(item.detail).toBe("CPA exceeded tenant ceiling by 12%");
    expect(item.tone).toBe("critical");
  });
});

describe("summarizeGuardrailRisks", () => {
  it("sorts guardrails by severity and delta while counting statuses", () => {
    const guardrails: GuardrailSegment[] = [
      {
        name: "ROAS floor",
        status: "watch",
        value: 1.2,
        target: 1.5,
        unit: "x",
        delta_pct: -20,
        notes: null,
      },
      {
        name: "Daily spend",
        status: "breach",
        value: 24000,
        target: 20000,
        unit: "usd",
        delta_pct: 20,
        notes: "Budget exceeded",
      },
      {
        name: "Change windows",
        status: "healthy",
        value: 1,
        target: 1,
        unit: "count",
        delta_pct: 0,
        notes: null,
      },
    ];

    const summary = summarizeGuardrailRisks(guardrails);
    expect(summary.breachCount).toBe(1);
    expect(summary.watchCount).toBe(1);
    expect(summary.healthyCount).toBe(1);
    expect(summary.risks[0].name).toBe("Daily spend");
    expect(summary.risks[1].name).toBe("ROAS floor");
  });

  it("returns zeroed summary when guardrails missing", () => {
    const summary = summarizeGuardrailRisks([]);
    expect(summary).toEqual({
      healthyCount: 0,
      watchCount: 0,
      breachCount: 0,
      risks: [],
    });
  });
});

describe("buildGuardrailPostureSegments", () => {
  it("returns ordered distribution with percentages", () => {
    const summary = {
      healthyCount: 3,
      watchCount: 1,
      breachCount: 2,
      risks: [],
    };

    const distribution = buildGuardrailPostureSegments(summary);
    expect(distribution).toEqual([
      expect.objectContaining({ status: "breach", count: 2 }),
      expect.objectContaining({ status: "watch", count: 1 }),
      expect.objectContaining({ status: "healthy", count: 3 }),
    ]);
    const totalPercentage = distribution.reduce((acc, segment) => acc + segment.percentage, 0);
    expect(totalPercentage).toBeCloseTo(100, 5);
  });

  it("handles empty telemetry", () => {
    const distribution = buildGuardrailPostureSegments({
      healthyCount: 0,
      watchCount: 0,
      breachCount: 0,
      risks: [],
    });
    expect(distribution.every((segment) => segment.percentage === 0)).toBe(true);
  });
});

describe("describeGuardrailPosture", () => {
  it("highlights top breach with watch note", () => {
    const summary = summarizeGuardrailRisks([
      {
        name: "CPA ceiling",
        status: "breach",
        value: 120,
        target: 100,
        unit: "usd",
        delta_pct: 20,
        notes: null,
      },
      {
        name: "Daily spend",
        status: "watch",
        value: 9500,
        target: 9000,
        unit: "usd",
        delta_pct: 6,
        notes: null,
      },
    ]);

    const message = describeGuardrailPosture(summary);
    expect(message).toContain("CPA ceiling");
    expect(message).toContain("watch item");
  });

  it("provides steady-state message when guardrails healthy", () => {
    const summary = summarizeGuardrailRisks([
      {
        name: "Daily spend",
        status: "healthy",
        value: 8500,
        target: 9000,
        unit: "usd",
        delta_pct: -6,
        notes: null,
      },
    ]);

    const message = describeGuardrailPosture(summary);
    expect(message).toContain("holding steady");
  });

  it("handles missing telemetry gracefully", () => {
    const message = describeGuardrailPosture({
      healthyCount: 0,
      watchCount: 0,
      breachCount: 0,
      risks: [],
    });
    expect(message).toContain("No guardrail telemetry");
  });
});
