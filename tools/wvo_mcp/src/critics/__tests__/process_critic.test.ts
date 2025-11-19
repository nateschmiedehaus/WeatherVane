import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

import { ProcessCritic } from "../process.js";

function expectPass(result: Awaited<ReturnType<ProcessCritic["run"]>>) {
  if (!result.passed) {
    console.error("ProcessCritic failure", result);
  }
  expect(result.passed).toBe(true);
}

const DRQC_BLOCK = `## DRQC Evidence

**DRQC Citation:** Page 5, "Quality Rails" > Always link tests to artifacts
**Interpretation:** Reinforces explicit evidence mapping between DRQC guidance and our test plan.

### Concordance (PLAN)
| Action | DRQC Citation | Artifact |
|---|---|---|
| Map DRQC guidance to tests | Page 5, "Quality Rails" | Evidence bundle |
`;

const PLAN_TEMPLATE = `# PLAN: TEST-TASK

## Architecture / Approach
- Outline changes

## Files to Change
- state/context.md

## Implementation Plan

**Scope:**
- PLAN-authored tests: REPLACE_ME
- Estimated LOC: +10 -0 = net +10 LOC

${DRQC_BLOCK}
`;

const AUTOPLAN_TEMPLATE = `# PLAN: AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION

## Architecture / Approach
- Wire supervisor components into Wave 0 runner

## Implementation Plan

**Scope:**
- PLAN-authored tests: REPLACE_AUTOPILOT
- Estimated LOC: +50 -10 = net +40 LOC

${DRQC_BLOCK}
`;

function initGitRepository(root: string) {
  execSync("git init", { cwd: root, stdio: "ignore" });
  execSync('git config user.name "ProcessCritic Test"', { cwd: root });
  execSync('git config user.email "process-critic@test.local"', { cwd: root });
  execSync('git commit --allow-empty -m "initial"', { cwd: root, stdio: "ignore" });
}

async function writeFileAndStage(root: string, relativePath: string, content: string) {
  const absolute = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content, "utf8");
  execSync(`git add ${relativePath}`, { cwd: root });
}

function sanitizeArchiveName(date: Date): string {
  return date.toISOString().replace(/:/g, "-").replace(/\.\d{3}Z$/, "Z");
}

async function seedOverrideLedger(
  root: string,
  entries: Array<Record<string, unknown>>,
): Promise<void> {
  const content = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  await writeFileAndStage(root, "state/overrides.jsonl", content);
}

async function seedOverrideArchive(root: string, date: Date): Promise<void> {
  const archiveName = `${sanitizeArchiveName(date)}-overrides.jsonl.gz`;
  await writeFileAndStage(
    root,
    path.join("state", "analytics", "override_history", archiveName),
    "",
  );
}

async function seedDailyAudit(root: string, date: Date, summary = "Daily audit OK"): Promise<void> {
  const dirName = `AFP-ARTIFACT-AUDIT-${date.getUTCFullYear().toString().padStart(4, "0")}${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}${date.getUTCDate().toString().padStart(2, "0")}`;
  await writeFileAndStage(
    root,
    path.join("state", "evidence", dirName, "summary.md"),
    summary,
  );
}

async function seedHealthyDailyState(root: string): Promise<void> {
  const now = new Date();
  await seedOverrideLedger(root, [
    { timestamp: now.toISOString(), commit: "baseline", reason: "tests" },
  ]);
  await seedDailyAudit(root, now);
}

describe("ProcessCritic", () => {
  let workspace: string;
  let critic: ProcessCritic;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "process-critic-"));
    initGitRepository(workspace);
    critic = new ProcessCritic(workspace);
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it("fails when plan lacks PLAN-authored tests section", async () => {
    await seedHealthyDailyState(workspace);
    const planContent = PLAN_TEMPLATE.replace("- PLAN-authored tests: REPLACE_ME\n", "");
    await writeFileAndStage(workspace, "state/evidence/TEST/plan.md", planContent);
    const result = await critic.run("default");
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("missing");
  });

  it("fails when tests section defers work", async () => {
    await seedHealthyDailyState(workspace);
    const planContent = PLAN_TEMPLATE.replace("REPLACE_ME", "Deferred to future sprint");
    await writeFileAndStage(workspace, "state/evidence/TEST/plan.md", planContent);
    const result = await critic.run("default");
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("defers");
  });

  it("passes when tests section lists concrete tests", async () => {
    await seedHealthyDailyState(workspace);
    const planContent = PLAN_TEMPLATE.replace(
      "REPLACE_ME",
      "tests/example/test_cache.py::test_integration_happy_path",
    );
    await writeFileAndStage(workspace, "state/evidence/TEST/plan.md", planContent);
    const result = await critic.run("default");
    expectPass(result);
  });

  it("allows docs-only plan when explicitly marked", async () => {
    await seedHealthyDailyState(workspace);
    const planContent = PLAN_TEMPLATE.replace(
      "REPLACE_ME",
      "N/A (docs-only change)",
    );
    await writeFileAndStage(workspace, "state/evidence/TEST/plan.md", planContent);
    const result = await critic.run("default");
    expectPass(result);
  });

  it("blocks new test files without corresponding PLAN entry", async () => {
    await seedHealthyDailyState(workspace);
    await writeFileAndStage(
      workspace,
      "tests/example/test_runner.py",
      "def test_runner():\n    assert True\n",
    );
    const result = await critic.run("default");
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("PLAN update");
  });

  it("allows new test file when PLAN already references it", async () => {
    await seedHealthyDailyState(workspace);
    const planContent = PLAN_TEMPLATE.replace(
      "REPLACE_ME",
      "tests/example/test_runner.py::test_runner",
    );
    await writeFileAndStage(workspace, "state/evidence/TEST/plan.md", planContent);
    execSync("git commit -am \"Add plan\" >/dev/null 2>&1", { cwd: workspace });

    await writeFileAndStage(
      workspace,
      "tests/example/test_runner.py",
      "def test_runner():\n    assert True\n",
    );

    const result = await critic.run("default");
    expectPass(result);
  });

  it("fails when autopilot plan lacks Wave 0 live keyword", async () => {
    await seedHealthyDailyState(workspace);
    const planContent = AUTOPLAN_TEMPLATE.replace(
      "REPLACE_AUTOPILOT",
      "tests/autopilot/test_supervisor.py::test_happy_path",
    );
    await writeFileAndStage(workspace, "state/evidence/AFP-W0/plan.md", planContent);
    const result = await critic.run("default");
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("Wave 0 live test");
  });

  it("passes when autopilot plan lists Wave 0 live smoke", async () => {
    await seedHealthyDailyState(workspace);
    const planContent = AUTOPLAN_TEMPLATE.replace(
      "REPLACE_AUTOPILOT",
      "Manual live Wave 0 loop: `npm run wave0 &`, verify ps aux | grep wave0, complete TaskFlow smoke",
    );
    await writeFileAndStage(workspace, "state/evidence/AFP-W0/plan.md", planContent);
    const result = await critic.run("default");
    expectPass(result);
  });

  it("fails when autopilot code changes without plan update", async () => {
    await seedHealthyDailyState(workspace);
    await writeFileAndStage(
      workspace,
      "tools/wvo_mcp/src/wave0/runner.ts",
      "export const dummy = true;\n",
    );
    const result = await critic.run("default");
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("Autopilot changes detected");
  });

  it("fails when daily artifact audit is missing", async () => {
    const now = new Date();
    await seedOverrideLedger(workspace, [
      { timestamp: now.toISOString(), commit: "abc", reason: "test" },
    ]);
    await seedOverrideArchive(workspace, now);
    const planContent = PLAN_TEMPLATE.replace(
      "REPLACE_ME",
      "tests/example/test_cache.py::test_integration_happy_path",
    );
    await writeFileAndStage(workspace, "state/evidence/TEST/plan.md", planContent);

    const result = await critic.run("default");
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("daily artifact health");
  });

  it("fails when override ledger contains stale entries", async () => {
    const now = new Date();
    const staleDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    await seedDailyAudit(workspace, now);
    await seedOverrideArchive(workspace, now);
    await seedOverrideLedger(workspace, [
      { timestamp: staleDate.toISOString(), commit: "old", reason: "SKIP_AFP" },
      { timestamp: now.toISOString(), commit: "current", reason: "SKIP_AFP" },
    ]);
    const planContent = PLAN_TEMPLATE.replace(
      "REPLACE_ME",
      "tests/example/test_cache.py::test_integration_happy_path",
    );
    await writeFileAndStage(workspace, "state/evidence/TEST/plan.md", planContent);

    const result = await critic.run("default");
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("override_ledger_stale");
  });

  it("passes when daily audit exists and overrides are fresh", async () => {
    const now = new Date();
    await seedDailyAudit(workspace, now);
    await seedOverrideArchive(workspace, now);
    await seedOverrideLedger(workspace, [
      { timestamp: now.toISOString(), commit: "fresh", reason: "SKIP_AFP" },
    ]);
    const planContent = PLAN_TEMPLATE.replace(
      "REPLACE_ME",
      "tests/example/test_cache.py::test_integration_happy_path",
    );
    await writeFileAndStage(workspace, "state/evidence/TEST/plan.md", planContent);

    const result = await critic.run("default");
    expectPass(result);
  });
});
