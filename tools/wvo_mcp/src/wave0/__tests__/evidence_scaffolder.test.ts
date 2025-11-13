import { describe, it, expect, beforeEach, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs, existsSync } from "node:fs";
import { EvidenceScaffolder } from "../evidence_scaffolder.js";
import type { ProofResult, ProofCriteria } from "../../prove/types.js";

const CRITERIA: ProofCriteria = {
  build: true,
  test: true,
  runtime: [],
  integration: [],
  manual: [],
};

const makeProofResult = (): ProofResult => ({
  status: "proven",
  timestamp: new Date().toISOString(),
  criteria: CRITERIA,
  checks: [
    {
      type: "build",
      description: "Build check",
      success: true,
      message: "Build passed",
    },
    {
      type: "test",
      description: "Test check",
      success: true,
      message: "Tests passed",
    },
  ],
  discoveries: [],
  executionTimeMs: 1500,
});

describe("EvidenceScaffolder", () => {
  let workspace: string;
  let scaffolder: EvidenceScaffolder;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "wave0-evidence-"));
    await fs.mkdir(path.join(workspace, "state"), { recursive: true });
    scaffolder = new EvidenceScaffolder(workspace);
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it("seeds evidence bundle with phase files and summary", async () => {
    scaffolder.seed("TASK-1", "Test Task");
    const evidenceDir = path.join(workspace, "state", "evidence", "TASK-1");
    const expectedFiles = [
      "strategy.md",
      "spec.md",
      "plan.md",
      "think.md",
      "design.md",
      "implement.md",
      "discovery.md",
      "verify.md",
      "review.md",
      "monitor.md",
      "summary.md",
      "phases.json",
      "phases.md",
    ];

    for (const file of expectedFiles) {
      expect(existsSync(path.join(evidenceDir, file))).toBe(true);
    }

    const summary = await fs.readFile(path.join(evidenceDir, "summary.md"), "utf-8");
    expect(summary).toContain("Test Task");
    expect(summary).toContain("INITIALIZED");
  });

  it("updates summary and phases during implementation and proof", async () => {
    scaffolder.seed("TASK-2", "Proof Task");
    scaffolder.updateSummary("TASK-2", "Proof Task", {
      status: "in_progress",
      stage: "implementation",
      note: "Implementation started.",
    });
    scaffolder.updatePhase("TASK-2", "implement", "in_progress", "Implementation in progress.");
    scaffolder.updatePhase("TASK-2", "implement", "done", "Implementation done.");
    scaffolder.appendImplementLog("TASK-2", "Placeholder implementation executed.");

    scaffolder.finalizeTask("TASK-2", {
      taskTitle: "Proof Task",
      finalStatus: "done",
      proofResult: makeProofResult(),
    });

    const evidenceDir = path.join(workspace, "state", "evidence", "TASK-2");
    const summary = await fs.readFile(path.join(evidenceDir, "summary.md"), "utf-8");
    expect(summary).toContain("**Current Status:** DONE");
    expect(summary).toContain("Proof PROVEN");

    const review = await fs.readFile(path.join(evidenceDir, "review.md"), "utf-8");
    expect(review).toContain("Wave 0 Review");
    expect(review).toContain("Final Status: DONE");

    const monitor = await fs.readFile(path.join(evidenceDir, "monitor.md"), "utf-8");
    expect(monitor).toContain("Wave 0 Monitor");

    const phases = await fs.readFile(path.join(evidenceDir, "phases.md"), "utf-8");
    expect(phases).toContain("Implement");
    expect(phases).toContain("done");
    expect(phases).toContain("Verify");
  });
});
