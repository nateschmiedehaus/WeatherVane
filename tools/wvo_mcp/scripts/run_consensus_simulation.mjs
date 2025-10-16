#!/usr/bin/env node
import path from "node:path";
import process from "node:process";

import { ConsensusEngine, ConsensusTelemetryRecorder } from "../dist/orchestrator/consensus/index.js";
import { runConsensusSimulation } from "../dist/orchestrator/consensus/simulation_runner.js";

function createEngine(workspaceRoot) {
  // Use source modules when running from TS (npm run ts-node) else fallback to compiled dist.
  const recorder = new ConsensusTelemetryRecorder(workspaceRoot);
  const stubStateMachine = {
    addContextEntry: () => ({}),
    getContextEntries: () => [],
  };
  return new ConsensusEngine({
    stateMachine: stubStateMachine,
    enabled: true,
    telemetryRecorder: recorder,
  });
}

async function main() {
  const workspaceRoot = path.resolve(process.argv[2] ?? path.join(process.cwd(), "..", ".."));
  const tasks = [
    {
      id: "SIM-CRIT",
      title: "Resolve security regression",
      status: "needs_review",
      estimated_complexity: 8,
      metadata: { decision_type: "critical" },
      constraints: ["Security breach potential", "Requires Dana oversight"],
    },
    {
      id: "SIM-STRAT",
      title: "Reprioritise roadmap milestone",
      status: "needs_review",
      estimated_complexity: 5,
      metadata: {},
      constraints: ["Stakeholder alignment"],
    },
    {
      id: "SIM-SPEC",
      title: "Tweak allocator simulation",
      status: "pending",
      estimated_complexity: 3,
      metadata: { decision_type: "specialist" },
      constraints: [],
    },
  ];

  const result = await runConsensusSimulation(workspaceRoot, tasks, () => createEngine(workspaceRoot));
  console.log("Consensus simulation complete:");
  console.log(JSON.stringify(result.summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
