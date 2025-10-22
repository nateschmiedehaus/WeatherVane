import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { ConsensusSummaryCard } from "../ConsensusSummaryCard";
import type { ConsensusWorkloadResponse } from "../../types/operations";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderCard(workload: ConsensusWorkloadResponse) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<ConsensusSummaryCard workload={workload} data-testid="consensus-card" />);
  });

  const cleanup = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return { container, cleanup };
}

describe("ConsensusSummaryCard", () => {
  it("renders hierarchical tiers, signals, and decision mix", () => {
    const workload: ConsensusWorkloadResponse = {
      generated_at: "2025-10-20T07:20:00Z",
      sample_window: {
        start: "2025-10-10T00:00:00Z",
        end: "2025-10-20T07:15:16Z",
      },
      decision_mix: {
        critical: 2,
        strategic: 1,
      },
      token_cost_per_run_usd: 0.0059,
      token_budget_per_run: {},
      quorum_profiles: [
        {
          name: "critical",
          display_name: "Critical",
          hierarchy_rank: 0,
          default_participants: ["director_dana", "security_critic", "atlas"],
          median_duration_seconds: 1204,
          p90_duration_seconds: 3263.9,
          expected_iterations: 2,
          token_cost_usd: 0.01396,
        },
        {
          name: "strategic",
          display_name: "Strategic",
          hierarchy_rank: 1,
          default_participants: ["atlas", "research_orchestrator", "claude_council"],
          median_duration_seconds: 509.1,
          p90_duration_seconds: 890.5,
          expected_iterations: 1,
          token_cost_usd: 0.00709,
          notes: "Promotes research pairing with Atlas.",
        },
      ],
      escalation_signals: [
        {
          signal: "duration_p90_gt_900s",
          threshold_seconds: 1200,
          recommended_action: "Promote to critical quorum with Director Dana.",
        },
      ],
      execution_health: {
        success_rate: 0.315,
        error_rate: 0.511,
      },
    };

    const { container, cleanup } = renderCard(workload);

    const card = container.querySelector('[data-testid="consensus-card"]');
    expect(card).toBeTruthy();
    expect(card?.textContent).toContain("Hierarchical quorum health");
    expect(card?.textContent).toContain("Critical");
    expect(card?.textContent).toContain("Director Dana");
    expect(card?.textContent).toContain("Med 20 min");
    expect(card?.textContent).toContain("Token envelope $0.01396");
    expect(card?.textContent).toContain("duration_p90_gt_900s");
    expect(card?.textContent).toContain("Promote to critical quorum with Director Dana.");
    expect(card?.textContent).toContain("Critical");
    expect(card?.textContent).toContain("2");
    expect(card?.textContent).toContain("Success rate");
    expect(card?.textContent).toContain("31.5%");

    cleanup();
  });
});
