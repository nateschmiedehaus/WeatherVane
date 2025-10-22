#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

import { WorkerManager } from "../dist/worker/worker_manager.js";
import { runUpgradePreflight } from "../dist/upgrade/preflight.js";

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const IGNORE_KEYS = new Set([
  "correlation_id",
  "generated_at",
  "pid",
  "startedAt",
  "started_at",
  "completed_at",
  "timestamp",
  "tookMs",
  "duration",
  "notes",
]);

function parseArgs(argv) {
  let workspaceRoot = "";
  let skipInstall = false;
  let skipTests = false;
  let skipBuild = false;
  let keepStaging = false;
  let promote = false;
  let allowDirty = false;
  let id;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    switch (arg) {
      case "--workspace":
      case "-w": {
        const value = argv[i + 1];
        if (!value) throw new Error("Missing value for --workspace");
        workspaceRoot = path.resolve(value);
        i += 1;
        break;
      }
      case "--skip-install":
        skipInstall = true;
        break;
      case "--skip-tests":
        skipTests = true;
        break;
      case "--skip-build":
        skipBuild = true;
        break;
      case "--keep-staging":
        keepStaging = true;
        break;
      case "--promote":
        promote = true;
        break;
      case "--allow-dirty":
        allowDirty = true;
        break;
      case "--id": {
        const value = argv[i + 1];
        if (!value) throw new Error("Missing value for --id");
        id = value;
        i += 1;
        break;
      }
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const defaultWorkspace = path.resolve(scriptDir, "../../..");

  return {
    workspaceRoot: workspaceRoot || defaultWorkspace,
    skipInstall,
    skipTests,
    skipBuild,
    keepStaging,
    promote,
    allowDirty,
    id,
  };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function runCommand(cmd, args, options = {}) {
  await execa(cmd, args, {
    cwd: options.cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
  });
}

async function writeJson(target, payload) {
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function scrub(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "string" && ISO_PATTERN.test(value)) {
      return "__ISO__";
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(scrub);
  }
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (IGNORE_KEYS.has(key)) continue;
    result[key] = scrub(raw);
  }
  return result;
}

function compareOutputs(active, canary) {
  const lhs = JSON.stringify(scrub(active));
  const rhs = JSON.stringify(scrub(canary));
  if (lhs === rhs) {
    return { ok: true };
  }
  return {
    ok: false,
    diff: {
      active: JSON.parse(lhs),
      canary: JSON.parse(rhs),
    },
  };
}

async function copySourcePackage(sourceDir, destinationDir) {
  await ensureDir(destinationDir);
  const separator = `${path.sep}node_modules${path.sep}`;
  await fs.cp(sourceDir, destinationDir, {
    recursive: true,
    force: true,
    filter: (src) => !src.includes(separator),
  });
}

async function copyNodeModules(baseRoot, stageRoot) {
  const source = path.join(baseRoot, "tools", "wvo_mcp", "node_modules");
  const dest = path.join(stageRoot, "tools", "wvo_mcp", "node_modules");
  try {
    await fs.access(source);
  } catch {
    return;
  }
  await fs.cp(source, dest, { recursive: true, force: true });
}

async function copyStateSnapshot(baseRoot, stageRoot) {
  const source = path.join(baseRoot, "state");
  const dest = path.join(stageRoot, "state");
  try {
    await fs.access(source);
  } catch {
    return;
  }
  await fs.cp(source, dest, { recursive: true, force: true });
}

async function runShadowChecks(
  workspaceRoot,
  stageRoot,
  canaryEntry,
  stateSnapshotRoot,
) {
  const manager = new WorkerManager({ workspaceRoot });
  const results = [];
  let active;
  let canary;
  try {
    await manager.startActive({
      env: {
        WVO_DRY_RUN: "1",
        WVO_WORKSPACE_ROOT: workspaceRoot,
      },
      allowDryRunActive: true,
    });
    active = manager.getActive();
    await manager.startCanary({
      entryPath: canaryEntry,
      env: {
        WVO_DRY_RUN: "1",
        WVO_STATE_ROOT: stateSnapshotRoot,
        WVO_WORKSPACE_ROOT: stageRoot,
      },
      label: "canary-dry-run",
    });
    canary = manager.getCanary();
    if (!canary) throw new Error("Failed to start canary worker");

    const checks = [
      {
        name: "dispatch",
        exec: (worker) =>
          worker.call("dispatch", {
            limit: 3,
          }),
      },
      {
        name: "verify",
        exec: (worker) => worker.call("verify", {}),
      },
      {
        name: "plan_next",
        exec: (worker) =>
          worker.call("runTool", {
            name: "plan_next",
            input: { limit: 3, minimal: true },
          }),
      },
      {
        name: "orchestrator_status",
        exec: (worker) =>
          worker.call("runTool", {
            name: "orchestrator_status",
            input: {},
          }),
      },
      {
        name: "autopilot_status",
        exec: (worker) =>
          worker.call("runTool", {
            name: "autopilot_status",
            input: {},
          }),
      },
    ];

    for (const check of checks) {
      const [activeOut, canaryOut] = await Promise.all([check.exec(active), check.exec(canary)]);
      const comparison = compareOutputs(activeOut, canaryOut);
      results.push({ name: check.name, ok: comparison.ok, diff: comparison.diff });
      if (!comparison.ok) break;
    }
  } finally {
    await manager.stopAll();
  }
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { workspaceRoot } = options;

  const upgradeId =
    options.id ??
    new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

  const artifactDir = path.join(
    workspaceRoot,
    "experiments",
    "mcp",
    "upgrade",
    upgradeId,
  );
  const lockPath = path.join(workspaceRoot, "state", "upgrade.lock");
  const stageRoot = path.join(workspaceRoot, "tmp", `wv-upgrade-${upgradeId}`);
  const stagePackageDir = path.join(stageRoot, "tools", "wvo_mcp");
  const canaryEntry = path.join(stagePackageDir, "dist", "worker", "worker_entry.js");
  const stateSnapshotRoot = path.join(stageRoot, "state");

  const steps = [];
  const recordStep = async (entry) => {
    steps.push(entry);
  };

  const startStep = (name) => ({
    name,
    status: "ok",
    started_at: new Date().toISOString(),
    completed_at: "",
    details: undefined,
  });

  let lockAcquired = false;
  let stageCreated = false;

  try {
    if (options.allowDirty) {
      await recordStep({
        name: "preflight",
        status: "skipped",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        details: { reason: "allow-dirty flag specified" },
      });
    } else {
      const entry = startStep("preflight");
      try {
        const preflight = await runUpgradePreflight({
          rootDir: workspaceRoot,
          stateDir: path.join(workspaceRoot, "state"),
          sqlitePath: path.join(workspaceRoot, "state", "orchestrator.db"),
          diskCheckPath: workspaceRoot,
        });
        entry.details = { ok: preflight.ok, failedCheck: preflight.failedCheck };
        await writeJson(path.join(artifactDir, "preflight.json"), preflight);
        if (!preflight.ok) {
          entry.status = "failed";
          entry.completed_at = new Date().toISOString();
          await recordStep(entry);
          throw new Error(`Preflight failed at ${preflight.failedCheck ?? "unknown gate"}`);
        }
      } catch (error) {
        entry.status = "failed";
        entry.details = { error: error instanceof Error ? error.message : String(error) };
        entry.completed_at = new Date().toISOString();
        await recordStep(entry);
        throw error;
      }
      entry.completed_at = new Date().toISOString();
      await recordStep(entry);
    }

    await ensureDir(path.dirname(lockPath));
    await fs.writeFile(
      lockPath,
      JSON.stringify(
        {
          upgrade_id: upgradeId,
          created_at: new Date().toISOString(),
          hostname: process.env.HOSTNAME ?? "unknown",
          pid: process.pid,
        },
        null,
        2,
      ),
      "utf8",
    );
    lockAcquired = true;

    if (!options.skipBuild) {
      const entry = startStep("build-current");
      try {
        await runCommand("npm", ["run", "build", "--prefix", "tools/wvo_mcp"], {
          cwd: workspaceRoot,
        });
      } catch (error) {
        entry.status = "failed";
        entry.details = { error: error instanceof Error ? error.message : String(error) };
        entry.completed_at = new Date().toISOString();
        await recordStep(entry);
        throw error;
      }
      entry.completed_at = new Date().toISOString();
      await recordStep(entry);
    } else {
      await recordStep({
        name: "build-current",
        status: "skipped",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    }

    const stageStep = startStep("stage-copy");
    try {
      await fs.rm(stageRoot, { recursive: true, force: true });
      await copySourcePackage(path.join(workspaceRoot, "tools", "wvo_mcp"), stagePackageDir);
      await copyStateSnapshot(workspaceRoot, stageRoot);
      stageCreated = true;
    } catch (error) {
      stageStep.status = "failed";
      stageStep.details = { error: error instanceof Error ? error.message : String(error) };
      stageStep.completed_at = new Date().toISOString();
      await recordStep(stageStep);
      throw error;
    }
    stageStep.completed_at = new Date().toISOString();
    await recordStep(stageStep);

    if (!options.skipInstall) {
      const entry = startStep("sync-node-modules");
      try {
        await copyNodeModules(workspaceRoot, stageRoot);
      } catch (error) {
        entry.status = "failed";
        entry.details = { error: error instanceof Error ? error.message : String(error) };
        entry.completed_at = new Date().toISOString();
        await recordStep(entry);
        throw error;
      }
      entry.completed_at = new Date().toISOString();
      await recordStep(entry);
    } else {
      await recordStep({
        name: "sync-node-modules",
        status: "skipped",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    }

    if (!options.skipBuild) {
      const entry = startStep("build-canary");
      try {
        await runCommand("npm", ["run", "build"], {
          cwd: stagePackageDir,
        });
      } catch (error) {
        entry.status = "failed";
        entry.details = { error: error instanceof Error ? error.message : String(error) };
        entry.completed_at = new Date().toISOString();
        await recordStep(entry);
        throw error;
      }
      entry.completed_at = new Date().toISOString();
      await recordStep(entry);
    } else {
      await recordStep({
        name: "build-canary",
        status: "skipped",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    }

    if (!options.skipTests) {
      const entry = startStep("test-canary");
      try {
        await runCommand("npm", ["test", "--", "--runInBand"], {
          cwd: stagePackageDir,
        });
      } catch (error) {
        entry.status = "failed";
        entry.details = { error: error instanceof Error ? error.message : String(error) };
        entry.completed_at = new Date().toISOString();
        await recordStep(entry);
        throw error;
      }
      entry.completed_at = new Date().toISOString();
      await recordStep(entry);
    } else {
      await recordStep({
        name: "test-canary",
        status: "skipped",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });
    }

    const shadowEntry = startStep("shadow-validation");
    const shadowResults = await runShadowChecks(
      workspaceRoot,
      stageRoot,
      canaryEntry,
      stateSnapshotRoot,
    );
    shadowEntry.completed_at = new Date().toISOString();
    const shadowFailures = shadowResults.filter((check) => !check.ok);
    shadowEntry.status = shadowFailures.length > 0 ? "warning" : "ok";
    shadowEntry.details = { checks: shadowResults };
    await recordStep(shadowEntry);
    await writeJson(path.join(artifactDir, "shadow.json"), shadowResults);

    const summaryDir = path.join(workspaceRoot, "state", "analytics");
    await ensureDir(summaryDir);
    await writeJson(path.join(summaryDir, "upgrade_shadow.json"), {
      upgrade_id: upgradeId,
      recorded_at: new Date().toISOString(),
      diff_count: shadowFailures.length,
      diff_path:
        shadowFailures.length > 0
          ? path.relative(workspaceRoot, path.join(artifactDir, "shadow.json"))
          : null,
    });
    if (shadowFailures.length > 0) {
      console.warn(
        `[upgrade] shadow validation recorded ${shadowFailures.length} difference(s); review ${path.relative(
          workspaceRoot,
          path.join(artifactDir, "shadow.json"),
        )}`,
      );
    }

    const promotionPlan = {
      upgrade_id: upgradeId,
      generated_at: new Date().toISOString(),
      promote_performed: false,
      steps: [
        "1. Restart canary with WVO_DRY_RUN=0 after pausing automation.",
        "2. Switch routing via WorkerManager.switchToCanary().",
        "3. Observe health/token metrics ≥10 minutes before enabling flags.",
        "4. Flip flags sequentially (PROMPT_MODE, SANDBOX_MODE, SELECTIVE_TESTS, ...).",
        "5. Capture post-promotion metrics snapshot in experiments/mcp/upgrade/<id>/promotion.json.",
      ],
    };

    if (options.promote) {
      const manager = new WorkerManager({ workspaceRoot });
      try {
        await manager.startActive({
          env: {
            WVO_WORKSPACE_ROOT: workspaceRoot,
          },
        });
        await manager.startCanary({
          entryPath: canaryEntry,
          env: {
            WVO_DRY_RUN: "0",
            WVO_STATE_ROOT: stateSnapshotRoot,
            WVO_WORKSPACE_ROOT: stageRoot,
          },
          label: "canary-live",
        });
        const summary = await manager.switchToCanary();
        promotionPlan.promote_performed = true;
        promotionPlan.steps.unshift("⚠️ Promotion executed during rehearsal (switch only).");
        promotionPlan.steps.push(`Promotion summary: ${JSON.stringify(summary)}`);
      } finally {
        await manager.stopAll();
      }
    }

    await writeJson(path.join(artifactDir, "promotion_plan.json"), promotionPlan);
    await writeJson(path.join(artifactDir, "steps.json"), steps);

    // Generate consolidated report.json
    const report = {
      upgrade_id: upgradeId,
      generated_at: new Date().toISOString(),
      status: shadowFailures.length > 0 ? "warning" : "passed",
      summary: {
        total_steps: steps.length,
        passed_steps: steps.filter((s) => s.status === "ok").length,
        failed_steps: steps.filter((s) => s.status === "failed").length,
        skipped_steps: steps.filter((s) => s.status === "skipped").length,
        warning_steps: steps.filter((s) => s.status === "warning").length,
      },
      shadow_validation: {
        total_checks: shadowResults.length,
        passed_checks: shadowResults.filter((c) => c.ok).length,
        failed_checks: shadowFailures.length,
        details: shadowResults,
      },
      gates: {
        preflight: steps.find((s) => s.name === "preflight")?.status ?? "pending",
        build_current: steps.find((s) => s.name === "build-current")?.status ?? "pending",
        build_canary: steps.find((s) => s.name === "build-canary")?.status ?? "pending",
        test_canary: steps.find((s) => s.name === "test-canary")?.status ?? "pending",
        shadow_validation: shadowFailures.length > 0 ? "warning" : "passed",
      },
      promotion: {
        ready: shadowFailures.length === 0,
        plan: promotionPlan,
      },
      artifacts: {
        preflight_path: "preflight.json",
        shadow_path: "shadow.json",
        promotion_plan_path: "promotion_plan.json",
        steps_path: "steps.json",
      },
    };

    await writeJson(path.join(artifactDir, "report.json"), report);

    const hasWarnings = steps.some((step) => step.status === "warning");

    console.log(`[upgrade] artifacts recorded in ${path.relative(workspaceRoot, artifactDir)}`);
    if (hasWarnings) {
      console.log("[upgrade] Completed with warnings (review noted shadow differences).");
    } else {
      console.log("[upgrade] All checks passed.");
    }
  } finally {
    if (lockAcquired) {
      await fs.rm(lockPath, { force: true }).catch(() => {});
    }
    if (stageCreated && !options.keepStaging) {
      await fs.rm(stageRoot, { recursive: true, force: true }).catch(() => {});
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(
    "[upgrade] failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
}
