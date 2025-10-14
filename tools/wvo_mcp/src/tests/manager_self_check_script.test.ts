import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { execa } from "execa";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(moduleDir, "..", "..", "scripts", "check_manager_state.mjs");

const workspaces: string[] = [];

async function createWorkspace(): Promise<string> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "manager-self-check-"));
  workspaces.push(workspaceRoot);

  await fs.mkdir(path.join(workspaceRoot, "state"));
  await fs.mkdir(path.join(workspaceRoot, "experiments", "allocator"), { recursive: true });

  await fs.writeFile(
    path.join(workspaceRoot, "state", "context.md"),
    "# Context\nNext actions:\n- hydrate rollback\n",
    "utf8",
  );

  await fs.writeFile(
    path.join(workspaceRoot, "state", "roadmap.yaml"),
    "epics:\n  - milestones:\n      - tasks:\n          - id: T1\n            status: pending\n",
    "utf8",
  );

  return workspaceRoot;
}

afterEach(async () => {
  for (const workspace of workspaces.splice(0)) {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

describe("manager self-check script", () => {
  it("fails when critical alert lacks rollback simulation", async () => {
    const workspace = await createWorkspace();
    const alertsPath = path.join(workspace, "state", "ad_push_alerts.json");
    await fs.writeFile(
      alertsPath,
      JSON.stringify(
        [
          {
            run_id: "run-1",
            tenant_id: "tenant-1",
            generated_at: new Date().toISOString(),
            severity: "critical",
            codes: ["spend_below_minimum"],
            message: "Budget fell below minimum",
          },
        ],
        null,
        2,
      ),
      "utf8",
    );

    let error: unknown;
    try {
      await execa("node", [SCRIPT_PATH, workspace]);
    } catch (err) {
      error = err;
    }

    expect(error).toBeTruthy();
    if (error && typeof error === "object" && "stderr" in error) {
      expect((error as { stderr: string }).stderr).toContain("rollback_sim artifact");
    }
  });

  it("passes when rollback simulation matches critical alert", async () => {
    const workspace = await createWorkspace();
    const now = new Date();
    const alertsPath = path.join(workspace, "state", "ad_push_alerts.json");
    await fs.writeFile(
      alertsPath,
      JSON.stringify(
        [
          {
            run_id: "run-2",
            tenant_id: "tenant-9",
            generated_at: now.toISOString(),
            severity: "critical",
            codes: ["spend_below_minimum"],
            message: "Budget fell below minimum",
          },
        ],
        null,
        2,
      ),
      "utf8",
    );

    const simulationPath = path.join(
      workspace,
      "experiments",
      "allocator",
      "rollback_sim.json",
    );
    await fs.writeFile(
      simulationPath,
      JSON.stringify(
        {
          run_id: "run-2",
          tenant_id: "tenant-9",
          simulated_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
          rollback_ready: true,
          actions: [
            {
              entity_type: "ad_set",
              entity_id: "123",
              field_path: "ad_set.daily_budget",
              baseline_value: 90,
              proposed_value: 110,
            },
          ],
          critical_guardrail_codes: ["spend_below_minimum"],
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await execa("node", [SCRIPT_PATH, workspace]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Manager self-check passed");
  });
});
