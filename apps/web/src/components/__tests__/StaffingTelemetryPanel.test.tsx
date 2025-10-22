import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { StaffingTelemetryPanel } from "../StaffingTelemetryPanel";
import type { OrchestrationMetricsResponse } from "../../types/operations";

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderPanel(metrics: OrchestrationMetricsResponse) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<StaffingTelemetryPanel metrics={metrics} data-testid="staffing-panel" />);
  });

  const cleanup = () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };

  return { container, cleanup };
}

describe("StaffingTelemetryPanel", () => {
  it("renders staffing guidance, decision history, and signals", () => {
    const metrics: OrchestrationMetricsResponse = {
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
            passed: false,
            exit_code: 1,
            timestamp: "2025-10-20T07:30:00Z",
            summary: "IntegrationFury failed: missing webhook secret in env.",
          },
          {
            critic: "allocator",
            title: "Allocator Sentinel",
            passed: true,
            exit_code: 0,
            timestamp: "2025-10-20T07:22:00Z",
            summary: "Allocator critic executed in 3.2s (cached hot path).",
          },
        ],
      },
    };

    const { container, cleanup } = renderPanel(metrics);

    const panel = container.querySelector('[data-testid="staffing-panel"]');
    expect(panel).toBeTruthy();
    expect(panel?.textContent).toContain("Consensus execution history");
    expect(panel?.textContent).toContain("Total decisions");
    expect(panel?.textContent).toContain("critical");
    expect(panel?.textContent).toContain("Med 20 min");
    expect(panel?.textContent).toContain("Atlas · Director Dana");
    expect(panel?.textContent).toContain("duration_p90_gt_900s");
    expect(panel?.textContent).toContain("Promote to critical quorum.");
    expect(panel?.textContent).toContain("$0.01396");
    expect(panel?.textContent).toContain("Critic performance");
    expect(panel?.textContent).toContain("Failing (exit 1)");
    expect(panel?.textContent).toContain("Integration Fury");

    cleanup();
  });
});
