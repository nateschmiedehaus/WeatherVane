import { describe, expect, it } from "vitest";

import type { OrchestrationMetricsResponse } from "../../types/operations";
import {
  buildDecisionHistoryRows,
  buildDecisionTypeSummary,
  deriveTelemetrySnapshot,
  formatTelemetryTimestamp,
} from "../staffing-telemetry";

const METRICS_FIXTURE: OrchestrationMetricsResponse = {
  updated_at: "2025-10-20T07:20:00Z",
  total_decisions: 4,
  by_type: { critical: 2, strategic: 1, specialist: 1 },
  history: [
    {
      id: "decision-2",
      task_id: "T2",
      type: "strategic",
      timestamp: "2025-10-20T07:18:00Z",
      quorum_satisfied: true,
      participants: ["atlas", "claude_council"],
      duration_seconds: 509.1,
      token_cost_usd: 0.00709,
    },
    {
      id: "decision-1",
      task_id: "T1",
      type: "critical",
      timestamp: "2025-10-20T07:15:00Z",
      quorum_satisfied: false,
      participants: ["atlas", "director_dana", "security_critic"],
      duration_seconds: 1204,
      token_cost_usd: 0.01396,
    },
  ],
  staffing_guidance: {
    source: "state/analytics/consensus_workload.json",
    sample_window: { start: "2025-10-10T00:00:00Z", end: "2025-10-20T07:15:16Z" },
    profiles: {
      critical: {
        default_participants: ["atlas", "director_dana", "security_critic"],
        median_duration_seconds: 1204,
        p90_duration_seconds: 3263.9,
        token_cost_usd: 0.01396,
        notes: "Promotes security pairing.",
      },
    },
    escalation_triggers: {
      duration_p90_seconds: 900,
      retry_threshold: 1,
      signals: [
        {
          signal: "duration_p90_gt_900s",
          threshold_seconds: 900,
          recommended_action: "Promote to critical quorum.",
          observed_value: 1204,
        },
      ],
    },
    token_budget_usd: { baseline: 0.0059, critical: 0.01396 },
  },
  critic_performance: {
    summary: {
      total: 2,
      passing: 1,
      failing: 1,
      last_updated: "2025-10-20T07:30:00Z",
    },
    critics: [
      {
        critic: "integrationfury",
        title: "Integration Fury",
        domain: "integrations",
        passed: false,
        exit_code: 1,
        timestamp: "2025-10-20T07:30:00Z",
        summary: "Missing webhook secret env variable.",
      },
      {
        critic: "allocator",
        title: "Allocator Sentinel",
        domain: "operations",
        passed: true,
        exit_code: 0,
        timestamp: "2025-10-20T07:22:00Z",
        summary: "Allocator critic executed in 3.2s (cached hot path).",
      },
    ],
  },
};

describe("staffing-telemetry helpers", () => {
  it("formats snapshot summaries with guidance", () => {
    const snapshot = deriveTelemetrySnapshot(METRICS_FIXTURE, 5);

    expect(snapshot.totalDecisions).toBe(4);
    expect(snapshot.decisionTypes[0]).toEqual({ type: "critical", count: 2 });
    expect(snapshot.tokenBudgets).toContainEqual({ name: "baseline", label: "$0.00590" });
    expect(snapshot.profiles[0].participantsLabel).toContain("Atlas");
    expect(snapshot.signals[0].recommendedAction).toContain("critical quorum");
    expect(snapshot.history[0].id).toBe("decision-2");
    expect(snapshot.criticPerformance?.failing).toBe(1);
    expect(snapshot.criticPerformance?.critics[0].statusLabel).toContain("Failing");
    expect(snapshot.criticPerformance?.updatedLabel).toContain("Oct");
  });

  it("builds decision history rows with ordering and formatting", () => {
    const rows = buildDecisionHistoryRows(METRICS_FIXTURE.history, { limit: 2 });
    expect(rows).toHaveLength(2);
    expect(rows[0].timestampLabel).toContain("Oct");
    expect(rows[0].participantsLabel).toContain("Atlas");
    expect(rows[1].quorumSatisfied).toBe(false);
  });

  it("formats timestamps and decision type summaries defensively", () => {
    expect(formatTelemetryTimestamp("invalid")).toBe("—");
    expect(formatTelemetryTimestamp(METRICS_FIXTURE.updated_at)).toContain("Oct");

    const summary = buildDecisionTypeSummary({ critical: 3, strategic: 1 });
    expect(summary[0]).toEqual({ type: "critical", count: 3 });
  });
});
