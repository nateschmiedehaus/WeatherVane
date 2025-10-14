import { describe, expect, it } from "vitest";

import { buildClusterSummaries, normalizeClusterSpec } from "../utils/cluster.js";
import type { PlanTaskSummary } from "../utils/types.js";

describe("normalizeClusterSpec", () => {
  it("normalizes string cluster identifiers", () => {
    expect(normalizeClusterSpec("cluster-1")).toEqual({
      id: "cluster-1",
      strategy: "clustered",
    });
  });

  it("normalizes object cluster metadata with trimming and deduplication", () => {
    expect(
      normalizeClusterSpec({
        id: "  accelerate-phase ",
        instructions: "Bundle accelerated tasks in a single run.",
        tags: ["fast", "fast", "ship"],
        strategy: "sequential",
        max_tasks_per_run: 2,
      }),
    ).toEqual({
      id: "accelerate-phase",
      instructions: "Bundle accelerated tasks in a single run.",
      tags: ["fast", "ship"],
      strategy: "sequential",
      max_tasks_per_run: 2,
    });
  });
});

describe("buildClusterSummaries", () => {
  it("groups tasks that share a cluster id and preserves guidance", () => {
    const tasks: PlanTaskSummary[] = [
      {
        id: "T-1",
        title: "Implement hot path optimizations",
        owner: "WVO",
        status: "pending",
        epic_id: "E-accel",
        milestone_id: "M-accel-1",
        exit_criteria: [],
        cluster: {
          id: "accelerate-dev",
          instructions: "Execute the accelerate-dev cluster in one run.",
          tags: ["accelerate"],
          strategy: "clustered",
          max_tasks_per_run: 3,
        },
      },
      {
        id: "T-2",
        title: "Add regression guardrails",
        owner: "WVO",
        status: "pending",
        epic_id: "E-accel",
        milestone_id: "M-accel-1",
        exit_criteria: [],
        cluster: {
          id: "accelerate-dev",
          tags: ["guardrail", "accelerate"],
          strategy: "clustered",
        },
      },
      {
        id: "T-3",
        title: "Document the release plan",
        owner: "WVO",
        status: "pending",
        epic_id: "E-docs",
        milestone_id: "M-docs-1",
        exit_criteria: [],
      },
    ];

    const summaries = buildClusterSummaries(tasks);

    expect(summaries).toEqual([
      {
        id: "accelerate-dev",
        instructions: "Execute the accelerate-dev cluster in one run.",
        tags: ["accelerate", "guardrail"],
        strategy: "clustered",
        max_tasks_per_run: 3,
        task_ids: ["T-1", "T-2"],
        task_titles: ["Implement hot path optimizations", "Add regression guardrails"],
      },
    ]);
  });
});
