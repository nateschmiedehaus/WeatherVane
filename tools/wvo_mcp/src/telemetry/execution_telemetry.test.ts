import { describe, expect, it } from "vitest";

import type { ExecutionSummary } from "../orchestrator/claude_code_coordinator.js";
import { buildExecutionTelemetryRecord } from "./execution_telemetry.js";

describe("buildExecutionTelemetryRecord", () => {
  it("captures core execution metrics with sanitised values", () => {
    const summary: ExecutionSummary = {
      taskId: "T1.2.3",
      agentId: "codex-01",
      agentType: "codex",
      coordinatorType: "codex",
      coordinatorReason: "failover:claude_rate_limit",
      coordinatorAvailable: true,
      success: true,
      finalStatus: "done",
      durationSeconds: 12.3456,
      qualityScore: 0.92345,
      issues: ["minor nit", "follow-up"],
      timestamp: Date.UTC(2025, 0, 1, 12, 0, 0),
      projectPhase: "PHASE-1-HARDENING",
      codexPreset: "gpt-5-codex-medium",
      codexModel: "gpt-5-codex",
      codexReasoning: "medium",
      promptTokens: 480,
      completionTokens: 120,
      totalTokens: 600,
      tokenCostUSD: 0.0184321,
      tokenEstimateStrategy: "reported",
      criticsRequired: ["manager_self_check", "build"],
      criticsFailed: [],
      correlationId: "exec_T12",
    };

    const record = buildExecutionTelemetryRecord(summary);

    expect(record).toMatchObject({
      type: "execution_summary",
      task_id: "T1.2.3",
      agent_id: "codex-01",
      agent_type: "codex",
      coordinator_type: "codex",
      coordinator_available: true,
      coordinator_reason: "failover:claude_rate_limit",
      success: true,
      failure_type: null,
      final_status: "done",
      duration_seconds: 12.346,
      quality_score: 0.923,
      issues: ["minor nit", "follow-up"],
      timestamp_ms: summary.timestamp,
      timestamp_iso: "2025-01-01T12:00:00.000Z",
      project_phase: "PHASE-1-HARDENING",
      prompt_tokens: 480,
      completion_tokens: 120,
      total_tokens: 600,
      token_cost_usd: 0.018432,
      token_estimate_strategy: "reported",
      codex_preset: "gpt-5-codex-medium",
      codex_model: "gpt-5-codex",
      codex_reasoning: "medium",
      critics_required: ["manager_self_check", "build"],
      critics_failed: [],
      correlation_id: "exec_T12",
    });
  });

  it("coerces optional fields and trims issue lists", () => {
    const summary: ExecutionSummary = {
      taskId: "T-blocked",
      agentId: "claude",
      agentType: "claude_code",
      coordinatorType: undefined,
      coordinatorReason: undefined,
      coordinatorAvailable: undefined,
      success: false,
      failureType: "network",
      finalStatus: "needs_review",
      durationSeconds: 0,
      qualityScore: 0,
      issues: Array.from({ length: 20 }, (_, idx) => `issue-${idx}`),
      timestamp: Number.NaN,
      projectPhase: "PHASE-X",
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      tokenEstimateStrategy: "estimated",
      criticsRequired: undefined,
      criticsFailed: undefined,
      correlationId: undefined,
    };

    const record = buildExecutionTelemetryRecord(summary);

    expect(record.issues.length).toBe(10);
    expect(record.token_cost_usd).toBeNull();
    expect(record.codex_model).toBeNull();
    expect(record.timestamp_iso).toBeNull();
    expect(record.critics_required).toEqual([]);
    expect(record.critics_failed).toEqual([]);
    expect(record.correlation_id).toBeNull();
    expect(record.coordinator_type).toBeNull();
    expect(record.coordinator_available).toBeNull();
    expect(record.coordinator_reason).toBeNull();
    expect(record.failure_type).toBe("network");
  });
});
