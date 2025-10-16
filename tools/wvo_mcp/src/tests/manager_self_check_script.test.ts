import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { runCommand } from "./helpers/autopilot";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.resolve(moduleDir, "..", "..", "scripts", "check_manager_state.mjs");
const GATE_SEQUENCE = ["build", "unit", "selfchecks", "canary_ready"];

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

async function seedWorkerSnapshot(
  workspaceRoot: string,
  overrides: {
    recorded_at?: string;
    status?: "healthy" | "degraded";
    active?: Partial<Record<string, unknown>>;
    events?: Array<Record<string, unknown>>;
  } = {},
): Promise<void> {
  const analyticsDir = path.join(workspaceRoot, "state", "analytics");
  await fs.mkdir(analyticsDir, { recursive: true });

  const recordedAt = overrides.recorded_at ?? new Date().toISOString();
  const snapshotPath = path.join(analyticsDir, "worker_manager.json");
  const recordedAtMs = Date.parse(recordedAt);
  const defaultActive = {
    role: "active",
    label: "active",
    status: "ready",
    pid: 4242,
    spawned_at: recordedAt,
    ready_at: recordedAt,
    started_at: recordedAt,
    uptime_ms: 1500,
    uptime_seconds: 1.5,
    version: "vTest",
    flags: { dryRun: false },
    last_health: { ok: true, version: "vTest" },
    last_health_at: recordedAt,
    last_exit: null,
  } satisfies Record<string, unknown>;
  const snapshot = {
    recorded_at: recordedAt,
    recorded_at_ms: Number.isFinite(recordedAtMs) ? recordedAtMs : Date.now(),
    status: overrides.status ?? "healthy",
    notes: [],
    active: { ...defaultActive, ...(overrides.active ?? {}) },
    canary: null,
    events: overrides.events ?? [],
    event_limit: 50,
    persisted_path: snapshotPath,
  };

  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");
}

async function seedUpgradeGates(
  workspaceRoot: string,
  options: {
    recordedAtIso?: string;
    ok?: boolean;
    failedCheck?: string;
    gates?: Array<Record<string, unknown>>;
    versions?: Array<Record<string, unknown>>;
  } = {},
): Promise<void> {
  const qualityDir = path.join(workspaceRoot, "state", "quality");
  await fs.mkdir(qualityDir, { recursive: true });

  const artifactRel = "experiments/mcp/upgrade/latest/preflight.json";
  const artifactPath = path.join(workspaceRoot, artifactRel);
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, JSON.stringify({ ok: true }, null, 2), "utf8");

  const recordedAt = options.recordedAtIso ?? new Date().toISOString();

  const gates =
    options.gates ??
    GATE_SEQUENCE.map((gate) => ({
      gate,
      status: "pending",
      timestamp: recordedAt,
    }));

  const versions =
    options.versions ??
    [
      {
        tool: "node",
        detected: "v18.19.0",
        constraint: ">=18",
        constraintSource: ".nvmrc",
        satisfies: true,
      },
      {
        tool: "npm",
        detected: "9.8.0",
        constraint: ">=9",
        constraintSource: "package.json",
        satisfies: true,
      },
    ];

  const evidence = {
    recorded_at: recordedAt,
    ok: options.ok ?? true,
    failedCheck: options.failedCheck,
    artifact: artifactRel,
    gates,
    versions,
  };

  await fs.writeFile(
    path.join(qualityDir, "upgrade_gates.json"),
    JSON.stringify(evidence, null, 2),
    "utf8",
  );
}

afterEach(async () => {
  for (const workspace of workspaces.splice(0)) {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

describe("manager self-check script", () => {
  it("fails when worker manager snapshot is missing", async () => {
    const workspace = await createWorkspace();
    await seedUpgradeGates(workspace);

    const result = await runCommand("node", [SCRIPT_PATH, workspace], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      timeoutMs: 10_000,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Worker manager snapshot missing");
  });

  it("fails when worker manager snapshot is stale", async () => {
    const workspace = await createWorkspace();
    const staleIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await seedWorkerSnapshot(workspace, {
      recorded_at: staleIso,
      active: {
        last_health_at: staleIso,
      },
    });
    await seedUpgradeGates(workspace);

    const result = await runCommand("node", [SCRIPT_PATH, workspace], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      timeoutMs: 10_000,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("snapshot stale");
  });

  it("fails when recent worker exit is recorded", async () => {
    const workspace = await createWorkspace();
    const recentExitIso = new Date(Date.now() - 60_000).toISOString();
    await seedWorkerSnapshot(workspace, {
      events: [
        {
          timestamp: recentExitIso,
          type: "exit",
          worker: "active",
          message: "Active worker exited unexpectedly",
        },
      ],
    });
    await seedUpgradeGates(workspace);

    const result = await runCommand("node", [SCRIPT_PATH, workspace], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      timeoutMs: 10_000,
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Recent worker exit");
  });

  it("fails when critical alert lacks rollback simulation", async () => {
    const workspace = await createWorkspace();
    await seedWorkerSnapshot(workspace);
    await seedUpgradeGates(workspace);
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

    const result = await runCommand("node", [SCRIPT_PATH, workspace], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      timeoutMs: 10_000,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("rollback_sim artifact");
  });

  it("passes when rollback simulation matches critical alert", async () => {
    const workspace = await createWorkspace();
    const now = new Date();
    await seedWorkerSnapshot(workspace);
    await seedUpgradeGates(workspace);
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

    const result = await runCommand("node", [SCRIPT_PATH, workspace], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      timeoutMs: 10_000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Manager self-check passed");
  });

  it("fails when upgrade gate evidence is missing", async () => {
    const workspace = await createWorkspace();
    await seedWorkerSnapshot(workspace);

    const result = await runCommand("node", [SCRIPT_PATH, workspace], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      timeoutMs: 10_000,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("Upgrade gate evidence missing");
  });

  it("fails when upgrade gate evidence is stale", async () => {
    const workspace = await createWorkspace();
    const staleTimestamp = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await seedWorkerSnapshot(workspace, { recorded_at: new Date().toISOString() });
    await seedUpgradeGates(workspace, { recordedAtIso: staleTimestamp });

    const result = await runCommand("node", [SCRIPT_PATH, workspace], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      timeoutMs: 10_000,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("stale");
  });

  it("fails when upgrade preflight guardrail reports failure", async () => {
    const workspace = await createWorkspace();
    await seedWorkerSnapshot(workspace);
    await seedUpgradeGates(workspace, { ok: false, failedCheck: "node_version" });

    const result = await runCommand("node", [SCRIPT_PATH, workspace], {
      cwd: process.cwd(),
      env: process.env as NodeJS.ProcessEnv,
      timeoutMs: 10_000,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("node_version");
  });
});
