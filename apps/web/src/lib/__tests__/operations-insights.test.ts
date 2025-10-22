import { describe, expect, it } from "vitest";

import {
  buildConsensusTierSummaries,
  buildEscalationSummaries,
  formatConsensusDuration,
  formatConsensusParticipant,
  formatTokenBudgetUsd,
  summarizeDecisionMix,
} from "../operations-insights";
import type { ConsensusWorkloadResponse } from "../../types/operations";

describe("operations insights helpers", () => {
  it("formats participant handles with friendly labels", () => {
    expect(formatConsensusParticipant("director_dana")).toBe("Director Dana");
    expect(formatConsensusParticipant("research_orchestrator")).toBe("Research Orchestrator");
    expect(formatConsensusParticipant("security-audit")).toBe("Security Audit");
  });

  it("formats duration thresholds with readable units", () => {
    expect(formatConsensusDuration(45)).toBe("45s");
    expect(formatConsensusDuration(360)).toBe("6.0 min");
    expect(formatConsensusDuration(9600)).toBe("2.7h");
    expect(formatConsensusDuration(null)).toBe("—");
  });

  it("formats token budgets with adaptive precision", () => {
    expect(formatTokenBudgetUsd(0.013965)).toBe("$0.01397");
    expect(formatTokenBudgetUsd(0.45)).toBe("$0.450");
    expect(formatTokenBudgetUsd(12.25)).toBe("$12.25");
    expect(formatTokenBudgetUsd(undefined)).toBe("—");
  });

  it("builds tier summaries in hierarchy order with friendly participant names", () => {
    const workload: ConsensusWorkloadResponse = {
      generated_at: "2025-10-20T07:20:00Z",
      sample_window: null,
      decision_mix: { strategic: 2, specialist: 1 },
      token_cost_per_run_usd: 0.0059,
      token_budget_per_run: {},
      quorum_profiles: [
        {
          name: "strategic",
          display_name: "Strategic",
          hierarchy_rank: 1,
          default_participants: ["atlas", "research_orchestrator", "claude_council"],
          median_duration_seconds: 509.1,
          p90_duration_seconds: 890.5,
          expected_iterations: 1,
          token_cost_usd: 0.0071,
          notes: "Adds research orchestrator.",
        },
        {
          name: "critical",
          display_name: "Critical",
          hierarchy_rank: 0,
          default_participants: ["director_dana", "atlas", "security_critic"],
          median_duration_seconds: 1204,
          p90_duration_seconds: 3263.9,
          expected_iterations: 2,
          token_cost_usd: 0.01396,
        },
      ],
      escalation_signals: [],
      execution_health: {},
    };

    const tiers = buildConsensusTierSummaries(workload);
    expect(tiers).toHaveLength(2);
    expect(tiers[0].name).toBe("critical");
    expect(tiers[0].participants).toEqual(["Director Dana", "Atlas", "Security Critic"]);
    expect(tiers[0].medianDuration).toBe("20 min");
    expect(tiers[0].tokenBudget).toBe("$0.01396");
    expect(tiers[1].displayName).toBe("Strategic");
    expect(tiers[1].participants[1]).toBe("Research Orchestrator");
  });

  it("summarises decision mix across hierarchy tiers", () => {
    const summary = summarizeDecisionMix({ strategic: 3, critical: 2 });
    expect(summary).toEqual([
      { name: "critical", displayName: "Critical", count: 2 },
      { name: "strategic", displayName: "Strategic", count: 3 },
      { name: "specialist", displayName: "Specialist", count: 0 },
    ]);
  });

  it("builds escalation summaries with readable thresholds", () => {
    const signals = buildEscalationSummaries([
      {
        signal: "duration_p90_gt_900s",
        threshold_seconds: 1200,
        recommended_action: "Promote to critical quorum.",
      },
      {
        signal: "repeat_retries_gt_1",
        threshold: 1,
        recommended_action: "Add Research Orchestrator context.",
      },
    ]);

    expect(signals[0].threshold).toBe("20 min p90");
    expect(signals[0].recommendedAction).toMatch(/critical/);
    expect(signals[1].threshold).toBe(">1");
  });
});
