import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { ConsensusTelemetryRecorder } from "../telemetry/consensus_metrics.js";
import type { ConsensusDecision } from "../orchestrator/consensus/consensus_engine.js";

const buildDecision = (overrides: Partial<ConsensusDecision> = {}): ConsensusDecision => ({
  id: "CONS-TEST-1",
  taskId: "T-x",
  type: "strategic",
  quorumSatisfied: true,
  proposals: [],
  selectedProposalIndex: 0,
  metadata: {},
  agenda: {
    decisionType: "strategic",
    rationale: ["test"],
    participants: ["atlas", "claude_council"],
  },
  createdAt: Date.now(),
  ...overrides,
});

describe("ConsensusTelemetryRecorder", () => {
  let workspace: string;
  let recorder: ConsensusTelemetryRecorder;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "consensus-telemetry-"));
    recorder = new ConsensusTelemetryRecorder(workspace);
  });

  it("writes metrics file and aggregates counts", async () => {
    await recorder.recordDecision(buildDecision());
    await recorder.recordDecision(buildDecision({ id: "CONS-TEST-2", type: "critical" }));

    const metricsPath = path.join(workspace, "state", "analytics", "orchestration_metrics.json");
    const serialized = await fs.readFile(metricsPath, "utf8");
    const parsed = JSON.parse(serialized);

    expect(parsed.totalDecisions).toBe(2);
    expect(parsed.byType.critical).toBe(1);
    expect(parsed.history.length).toBeGreaterThan(0);
  });
});
