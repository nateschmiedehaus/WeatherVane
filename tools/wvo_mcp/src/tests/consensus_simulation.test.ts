import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { ConsensusEngine } from "../orchestrator/consensus/consensus_engine.js";
import { runConsensusSimulation } from "../orchestrator/consensus/simulation_runner.js";

class StubStateMachine {
  addContextEntry() {
    return {};
  }
  getContextEntries() {
    return [];
  }
}

describe("runConsensusSimulation", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "consensus-sim-"));
  });

  it("produces decisions and writes a report", async () => {
    const result = await runConsensusSimulation(
      workspace,
      [
        { id: "SIM-1", title: "critical task", estimated_complexity: 8, status: "needs_review" },
        { id: "SIM-2", title: "strategic task" },
      ],
      () => new ConsensusEngine({
        stateMachine: new StubStateMachine() as any,
        enabled: true,
      }),
    );

    expect(result.summary.total).toBe(2);
    expect(result.decisions.length).toBe(2);

    const reportPath = path.join(workspace, "experiments", "orchestration", "simulation_report.md");
    const report = await fs.readFile(reportPath, "utf8");
    expect(report).toContain("Consensus Simulation Report");
  });
});
