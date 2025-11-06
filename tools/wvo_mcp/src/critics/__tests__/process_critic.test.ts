import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

import { ProcessCritic } from "../process.js";

const PLAN_TEMPLATE = `# PLAN: TEST-TASK

## Architecture / Approach
- Outline changes

## Files to Change
- state/context.md

## Implementation Plan

**Scope:**
- PLAN-authored tests: REPLACE_ME
- Estimated LOC: +10 -0 = net +10 LOC

`;

const AUTOPLAN_TEMPLATE = `# PLAN: AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION

## Architecture / Approach
- Wire supervisor components into Wave 0 runner

## Implementation Plan

**Scope:**
- PLAN-authored tests: REPLACE_AUTOPILOT
- Estimated LOC: +50 -10 = net +40 LOC
`;

function initGitRepository(root: string) {
  execSync("git init", { cwd: root, stdio: "ignore" });
  execSync('git config user.name "ProcessCritic Test"', { cwd: root });
  execSync('git config user.email "process-critic@test.local"', { cwd: root });
}

async function writeFileAndStage(root: string, relativePath: string, content: string) {
  const absolute = path.join(root, relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content, "utf8");
  execSync(`git add ${relativePath}`, { cwd: root });
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
    const planContent = PLAN_TEMPLATE.replace("**Scope:**\n- PLAN-authored tests: REPLACE_ME\n- Estimated LOC: +10 -0 = net +10 LOC\n", "**Scope:**\n- Estimated LOC: +10 -0 = net +10 LOC\n");
    await writeFileAndStage(workspace, "state/evidence/TEST/plan.md", planContent);
    const result = await critic.run("default");
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("missing");
  });

  it("fails when tests section defers work", async () => {
    const planContent = PLAN_TEMPLATE.replace("REPLACE_ME", "Deferred to future sprint");
    await writeFileAndStage(workspace, "state/evidence/TEST/plan.md", planContent);
    const result = await critic.run("default");
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("defers");
  });

  it("passes when tests section lists concrete tests", async () => {
    const planContent = PLAN_TEMPLATE.replace(
      "REPLACE_ME",
      "tests/example/test_cache.py::test_integration_happy_path",
    );
    await writeFileAndStage(workspace, "state/evidence/TEST/plan.md", planContent);
    const result = await critic.run("default");
    expect(result.passed).toBe(true);
  });

  it("allows docs-only plan when explicitly marked", async () => {
    const planContent = PLAN_TEMPLATE.replace(
      "REPLACE_ME",
      "N/A (docs-only change)",
    );
    await writeFileAndStage(workspace, "state/evidence/TEST/plan.md", planContent);
    const result = await critic.run("default");
    expect(result.passed).toBe(true);
  });

  it("blocks new test files without corresponding PLAN entry", async () => {
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
    expect(result.passed).toBe(true);
  });

  it("fails when autopilot plan lacks Wave 0 live keyword", async () => {
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
    const planContent = AUTOPLAN_TEMPLATE.replace(
      "REPLACE_AUTOPILOT",
      "Manual live Wave 0 loop: `npm run wave0 &`, verify ps aux | grep wave0, complete TaskFlow smoke",
    );
    await writeFileAndStage(workspace, "state/evidence/AFP-W0/plan.md", planContent);
    const result = await critic.run("default");
    expect(result.passed).toBe(true);
  });

  it("fails when autopilot code changes without plan update", async () => {
    await writeFileAndStage(
      workspace,
      "tools/wvo_mcp/src/wave0/runner.ts",
      "export const dummy = true;\n",
    );
    const result = await critic.run("default");
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain("Autopilot changes detected");
  });
});
