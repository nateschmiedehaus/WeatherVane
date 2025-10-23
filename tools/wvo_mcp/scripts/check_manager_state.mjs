#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const HOURS_12_MS = 12 * 60 * 60 * 1000;
const ALERT_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const GATE_SEQUENCE = ["build", "unit", "selfchecks", "canary_ready"];
const GATE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const WORKER_SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;
const ACTIVE_HEALTH_MAX_AGE_MS = 5 * 60 * 1000;
const WORKER_EXIT_WINDOW_MS = 10 * 60 * 1000;
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(SCRIPT_DIR, "..", "..", "..");
const PREFLIGHT_OVERRIDE_ENV = "WVO_MANAGER_SELF_CHECK_PREFLIGHT";
const DIRTY_SAMPLE_LIMIT = 8;
const CLEAN_WORKTREE_NAME = ".clean_worktree";

async function runCommandCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }

    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    const settle = (exitCode, error) => {
      resolve({
        exitCode,
        stdout,
        stderr,
        error,
      });
    };

    child.on("error", (error) => {
      settle(null, error instanceof Error ? error : new Error(String(error)));
    });

    child.on("exit", (code) => {
      settle(typeof code === "number" ? code : null, null);
    });
  });
}

async function collectGitStatusEntries(workspaceRoot) {
  const result = await runCommandCapture("git", ["status", "--porcelain"], {
    cwd: workspaceRoot,
  });

  if (result.exitCode !== 0 || result.error) {
    return null;
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

async function readContext(workspaceRoot) {
  const contextPath = path.join(workspaceRoot, "state", "context.md");
  const content = await fs.readFile(contextPath, "utf8");
  const stats = await fs.stat(contextPath);
  return { content, stats };
}

async function readRoadmap(workspaceRoot) {
  const roadmapPath = path.join(workspaceRoot, "state", "roadmap.yaml");
  const content = await fs.readFile(roadmapPath, "utf8");
  const parsed = YAML.parse(content);
  return { parsed };
}

function ensureRecentContext(stats) {
  const age = Date.now() - stats.mtimeMs;
  if (age > HOURS_12_MS) {
    throw new Error(
      `Context stale: last update ${(age / (60 * 60 * 1000)).toFixed(
        1,
      )} hours ago (expected <= 12 hours).`,
    );
  }
}

function ensureNextActions(content) {
  const lines = content.split(/\r?\n/);
  const headerPattern = /^#{0,3}\s*Next actions\b[:]?/i;

  const headerIndex = lines.findIndex((rawLine) => headerPattern.test(rawLine.trim()));
  if (headerIndex === -1) {
    throw new Error("Context missing 'Next actions' section.");
  }

  const actionableBulletPattern = /^([-*+]|•|\d+[.)])\s+(.*)$/;
  const placeholderPattern = /^(?:tbd|none|n\/a|null|pending)$/i;
  let hasActionable = false;

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i];
    if (typeof raw !== "string") {
      continue;
    }

    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      break;
    }

    const bulletMatch = actionableBulletPattern.exec(trimmed);
    if (!bulletMatch) {
      continue;
    }

    const text = bulletMatch[2].trim();
    if (text.length === 0) {
      continue;
    }

    if (placeholderPattern.test(text)) {
      continue;
    }

    hasActionable = true;
    break;
  }

  if (!hasActionable) {
    throw new Error(
      "Next actions section missing actionable items; update state/context.md with current priorities.",
    );
  }
}

function ensureActiveTasks(roadmap) {
  const epics = roadmap?.epics ?? [];
  const tasks = epics.flatMap((epic) =>
    epic.milestones?.flatMap((milestone) => milestone.tasks ?? []) ?? [],
  );
  if (!tasks.length) {
    throw new Error("Roadmap has no tasks; unable to manage progress.");
  }
  const actionable = tasks.filter((task) => task.status !== "done");
  if (!actionable.length) {
    throw new Error("All tasks marked done; add new roadmap items or archive epic.");
  }
}

async function readAlerts(workspaceRoot) {
  const alertsPath = path.join(workspaceRoot, "state", "ad_push_alerts.json");
  try {
    const content = await fs.readFile(alertsPath, "utf8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => item && typeof item === "object");
    }
    if (parsed && typeof parsed === "object") {
      return [parsed];
    }
    return [];
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function readRollbackSimulation(workspaceRoot) {
  const simulationPath = path.join(
    workspaceRoot,
    "experiments",
    "allocator",
    "rollback_sim.json",
  );
  try {
    const content = await fs.readFile(simulationPath, "utf8");
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Rollback simulation artifact malformed (expected JSON object).");
    }
    return parsed;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readWorkerManagerSnapshot(workspaceRoot) {
  const snapshotPath = path.join(
    workspaceRoot,
    "state",
    "analytics",
    "worker_manager.json",
  );

  let raw;
  try {
    raw = await fs.readFile(snapshotPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new Error(
        "Worker manager snapshot missing (state/analytics/worker_manager.json). Run worker_health before attempting canary promotion.",
      );
    }
    throw new Error(
      `Unable to read worker manager snapshot: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("Worker manager snapshot malformed JSON; rerun worker_health to refresh telemetry.");
  }
}

function mergePythonPath(existing, ...paths) {
  const segments = [];
  if (existing && typeof existing === "string" && existing.length > 0) {
    segments.push(...existing.split(path.delimiter).filter((item) => item.length > 0));
  }
  for (const candidate of paths) {
    if (candidate && typeof candidate === "string" && candidate.length > 0) {
      segments.push(candidate);
    }
  }
  const unique = [];
  for (const segment of segments) {
    if (!unique.includes(segment)) {
      unique.push(segment);
    }
  }
  return unique.join(path.delimiter);
}

async function collectDirtyGitSample(workspaceRoot, { limit = DIRTY_SAMPLE_LIMIT } = {}) {
  const entries = await collectGitStatusEntries(workspaceRoot);
  if (!entries || entries.length === 0) {
    return null;
  }

  const sample = entries.slice(0, limit);
  const remainder = entries.length - sample.length;
  const suffix = remainder > 0 ? ` … (+${remainder} more)` : "";
  return `${sample.join(", ")}${suffix}`;
}

async function appendDirtyWorkspaceSample(baseMessage, workspaceRoot, failedCheck = "") {
  if (failedCheck !== "git_clean") {
    return baseMessage;
  }

  try {
    const sample = await collectDirtyGitSample(workspaceRoot);
    if (sample) {
      return `${baseMessage} Dirty workspace sample: ${sample}`;
    }
  } catch {
    // Ignore diagnostic failures and fall back to the base message.
  }

  return baseMessage;
}

async function refreshCleanWorktree(workspaceRoot) {
  const cleanRoot = path.join(workspaceRoot, CLEAN_WORKTREE_NAME);

  await runCommandCapture("git", ["worktree", "remove", "--force", cleanRoot], {
    cwd: workspaceRoot,
  });
  try {
    await fs.rm(cleanRoot, { recursive: true, force: true });
  } catch {
    // Ignore removal failures; git will recreate if needed.
  }

  await runCommandCapture("git", ["worktree", "prune"], {
    cwd: workspaceRoot,
  });

  const addResult = await runCommandCapture(
    "git",
    ["worktree", "add", "--force", "--detach", cleanRoot, "HEAD"],
    { cwd: workspaceRoot },
  );
  if (addResult.exitCode !== 0 || addResult.error) {
    const detail = addResult.error
      ? addResult.error.message
      : addResult.stderr?.trim() || addResult.stdout.trim() || "unknown error";
    throw new Error(`Unable to create clean worktree: ${detail}`);
  }

  const resetResult = await runCommandCapture("git", ["reset", "--hard", "HEAD"], {
    cwd: cleanRoot,
  });
  if (resetResult.exitCode !== 0 || resetResult.error) {
    const detail = resetResult.error
      ? resetResult.error.message
      : resetResult.stderr?.trim() || resetResult.stdout.trim() || "unknown error";
    throw new Error(`Unable to reset clean worktree: ${detail}`);
  }

  const cleanResult = await runCommandCapture("git", ["clean", "-fdx"], {
    cwd: cleanRoot,
  });
  if (cleanResult.exitCode !== 0 || cleanResult.error) {
    const detail = cleanResult.error
      ? cleanResult.error.message
      : cleanResult.stderr?.trim() || cleanResult.stdout.trim() || "unknown error";
    throw new Error(`Unable to scrub clean worktree: ${detail}`);
  }

  return cleanRoot;
}

async function resolvePreflightRoot(workspaceRoot) {
  const entries = await collectGitStatusEntries(workspaceRoot);
  const dirtyEntries = Array.isArray(entries) ? entries : [];
  if (dirtyEntries.length === 0) {
    return { rootDir: workspaceRoot, usedCleanWorktree: false, dirtyEntries };
  }

  try {
    const cleanRoot = await refreshCleanWorktree(workspaceRoot);
    const relative = path.relative(workspaceRoot, cleanRoot) || CLEAN_WORKTREE_NAME;
    console.log(
      `[manager-self-check] workspace dirty (${entries.length} entr${
        entries.length === 1 ? "y" : "ies"
      }); running upgrade preflight in ${relative}.`,
    );
    return { rootDir: cleanRoot, usedCleanWorktree: true, dirtyEntries };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[manager-self-check] failed to refresh clean worktree (${message}); continuing in primary workspace.`,
    );
    return { rootDir: workspaceRoot, usedCleanWorktree: false, dirtyEntries };
  }
}

async function loadUpgradePreflight(workspaceRoot) {
  const override = process.env[PREFLIGHT_OVERRIDE_ENV];
  const candidates = [];

  if (override && override.trim().length > 0) {
    const resolvedOverride = path.isAbsolute(override)
      ? override
      : path.join(workspaceRoot, override);
    candidates.push(resolvedOverride);
  }

  candidates.push(
    path.join(SOURCE_ROOT, "tools", "wvo_mcp", "dist", "upgrade", "preflight.js"),
    path.join(SOURCE_ROOT, "tools", "wvo_mcp", "src", "upgrade", "preflight.js"),
    path.join(SOURCE_ROOT, "tools", "wvo_mcp", "src", "upgrade", "preflight.ts"),
  );

  let lastError;
  for (const candidate of candidates) {
    try {
      const moduleUrl = pathToFileURL(candidate).href;
      const mod = await import(moduleUrl);
      if (typeof mod?.runUpgradePreflight === "function") {
        return mod.runUpgradePreflight;
      }
    } catch (error) {
      lastError = error;
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code !== "ERR_MODULE_NOT_FOUND" &&
        error.code !== "MODULE_NOT_FOUND"
      ) {
        console.warn(
          `[manager-self-check] unable to load ${path.relative(workspaceRoot, candidate)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  const hint =
    lastError instanceof Error && lastError.message
      ? ` (${lastError.message})`
      : "";
  throw new Error(
    `Unable to resolve upgrade preflight helper. Set ${PREFLIGHT_OVERRIDE_ENV} or run ` +
      "`npm --prefix tools/wvo_mcp run build` to generate dist artifacts." +
      hint,
  );
}

async function refreshUpgradeGateEvidence(workspaceRoot) {
  const runUpgradePreflight = await loadUpgradePreflight(workspaceRoot);
  const { rootDir: preflightRoot, usedCleanWorktree, dirtyEntries } =
    await resolvePreflightRoot(workspaceRoot);
  const outcome = await runUpgradePreflight({
    rootDir: preflightRoot,
    stateDir: path.join(workspaceRoot, "state"),
    diskCheckPath: workspaceRoot,
  });

  if (!outcome || typeof outcome !== "object") {
    throw new Error("Upgrade preflight returned unexpected payload while attempting refresh.");
  }

  const timestamp = new Date().toISOString();
  const artifactDir = path.join(
    workspaceRoot,
    "experiments",
    "mcp",
    "upgrade",
    timestamp.replace(/[:.]/g, "-"),
  );
  await fs.mkdir(artifactDir, { recursive: true });
  const artifactRel = path.relative(
    workspaceRoot,
    path.join(artifactDir, "preflight.json"),
  );
  const auditPayload = {
    recorded_at: timestamp,
    workspace_root: workspaceRoot,
    command_root: preflightRoot,
    used_clean_worktree: usedCleanWorktree,
    outcome,
    workspace_dirty:
      dirtyEntries.length > 0
        ? {
            count: dirtyEntries.length,
            entries: dirtyEntries.slice(0, DIRTY_SAMPLE_LIMIT),
          }
        : undefined,
  };
  await fs.writeFile(
    path.join(workspaceRoot, artifactRel),
    JSON.stringify(auditPayload, null, 2),
    "utf8",
  );

  const gateEvidenceDir = path.join(workspaceRoot, "state", "quality");
  await fs.mkdir(gateEvidenceDir, { recursive: true });
  const gateEvidence = {
    recorded_at: timestamp,
    ok: outcome.ok === true,
    failedCheck: outcome.ok === true ? undefined : outcome.failedCheck,
    artifact: artifactRel,
    gates: Array.isArray(outcome.gates) ? outcome.gates : [],
    versions: Array.isArray(outcome.versions) ? outcome.versions : [],
    workspace_dirty:
      dirtyEntries.length > 0
        ? {
            count: dirtyEntries.length,
            sample: dirtyEntries.slice(0, DIRTY_SAMPLE_LIMIT),
          }
        : undefined,
  };
  await fs.writeFile(
    path.join(gateEvidenceDir, "upgrade_gates.json"),
    JSON.stringify(gateEvidence, null, 2),
    "utf8",
  );

  if (outcome.ok !== true) {
    const failureDetail =
      typeof outcome.failedCheck === "string" && outcome.failedCheck.length > 0
        ? ` (failedCheck=${outcome.failedCheck})`
        : "";
    const baseMessage = `Automatic upgrade preflight failed${failureDetail}; address issues and retry.`;
    const message = await appendDirtyWorkspaceSample(
      baseMessage,
      workspaceRoot,
      typeof outcome.failedCheck === "string" ? outcome.failedCheck : "",
    );
    throw new Error(message);
  }
}

function createPythonEnv(workspaceRoot) {
  const env = { ...process.env };
  env.PYTHONPATH = mergePythonPath(
    env.PYTHONPATH,
    path.join(workspaceRoot, ".deps"),
    workspaceRoot,
    path.join(process.cwd(), ".deps"),
    process.cwd(),
    path.join(SOURCE_ROOT, ".deps"),
    SOURCE_ROOT,
  );
  return env;
}

function runPythonModule(workspaceRoot, args) {
  return new Promise((resolve) => {
    const pythonExecutable = process.env.PYTHON ?? "python";
    const child = spawn(pythonExecutable, args, {
      cwd: workspaceRoot,
      env: createPythonEnv(workspaceRoot),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
    }

    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
    }

    child.on("error", (error) => {
      resolve({
        success: false,
        stdout,
        stderr: error instanceof Error ? error.message : String(error),
      });
    });

    child.on("exit", (code) => {
      resolve({ success: code === 0, stdout, stderr });
    });
  });
}

async function tryRefreshRollbackSimulation(workspaceRoot, alert) {
  if (!alert || typeof alert !== "object") {
    return false;
  }
  const runId = alert.run_id ?? alert.runId;
  const tenantId = alert.tenant_id ?? alert.tenantId;
  if (typeof runId !== "string" || runId.length === 0) {
    return false;
  }
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return false;
  }

  const outputPath = path.join(workspaceRoot, "experiments", "allocator", "rollback_sim.json");
  const result = await runPythonModule(workspaceRoot, [
    "-m",
    "apps.allocator.rollback_cli",
    "refresh-simulation",
    "--tenant-id",
    tenantId,
    "--run-id",
    runId,
    "--output",
    outputPath,
  ]);

  if (!result.success) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || "unknown error";
    console.warn(`Failed to refresh rollback simulation: ${detail}`);
  }

  return result.success;
}

function findLatestCriticalAlert(alerts) {
  return alerts.find((alert) =>
    alert && typeof alert === "object" && alert.severity === "critical",
  );
}

function isAlertAcknowledged(alert) {
  if (!alert || typeof alert !== "object") {
    return false;
  }
  if (alert.status && typeof alert.status === "string") {
    const normalised = alert.status.toLowerCase();
    if (["resolved", "closed", "dismissed", "acknowledged"].includes(normalised)) {
      return true;
    }
  }
  return Boolean(alert.acknowledged_at || alert.resolved_at || alert.dismissed_at);
}

function parseTimestamp(text) {
  if (!text || typeof text !== "string") {
    return Number.NaN;
  }
  return Date.parse(text);
}

function extractActive(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }
  const candidate = snapshot.active ?? snapshot.active_worker ?? null;
  if (!candidate || typeof candidate !== "object") {
    return null;
  }
  return candidate;
}

function ensureWorkerSnapshotFresh(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    throw new Error("Worker manager snapshot missing payload.");
  }

  const recordedAt = parseTimestamp(snapshot.recorded_at ?? snapshot.recordedAt);
  if (Number.isNaN(recordedAt)) {
    throw new Error("Worker manager snapshot missing recorded_at timestamp.");
  }
  if (recordedAt + WORKER_SNAPSHOT_MAX_AGE_MS < Date.now()) {
    const iso = snapshot.recorded_at ?? snapshot.recordedAt;
    throw new Error(
      `Worker manager snapshot stale (recorded_at=${iso}); rerun worker_health before promotion.`,
    );
  }

  const active = extractActive(snapshot);
  if (!active) {
    throw new Error("Worker manager snapshot missing active worker details.");
  }

  const status = typeof active.status === "string" ? active.status : "unknown";
  if (status !== "ready") {
    throw new Error(`Active worker not ready (status=${status}). Investigate worker_manager telemetry.`);
  }

  const health = active.last_health ?? active.lastHealth ?? null;
  if (!health || typeof health !== "object" || health.ok !== true) {
    throw new Error("Active worker health signal missing or failing; run worker_health and inspect logs.");
  }

  const lastHealthAt = parseTimestamp(active.last_health_at ?? active.lastHealthAt);
  if (Number.isNaN(lastHealthAt)) {
    throw new Error("Active worker health timestamp missing; rerun worker_health.");
  }
  if (lastHealthAt + ACTIVE_HEALTH_MAX_AGE_MS < Date.now()) {
    throw new Error(
      `Active worker health signal stale (last_health_at=${active.last_health_at ?? active.lastHealthAt}); rerun worker_health before promotion.`,
    );
  }

  const events = Array.isArray(snapshot.events) ? snapshot.events : [];
  const recentExit = events.find((event) => {
    if (!event || typeof event !== "object") {
      return false;
    }
    if (event.type !== "exit" && event.type !== "error") {
      return false;
    }
    const ts = parseTimestamp(event.timestamp);
    return Number.isFinite(ts) && ts + WORKER_EXIT_WINDOW_MS >= Date.now();
  });

  if (recentExit) {
    throw new Error(
      "Recent worker exit/error detected in worker_manager telemetry; stabilise the worker before proceeding with canary promotion.",
    );
  }
}

async function ensureUpgradeGateEvidence(workspaceRoot, { refreshed = false } = {}) {
  const evidencePath = path.join(workspaceRoot, "state", "quality", "upgrade_gates.json");

  let raw;
  try {
    raw = await fs.readFile(evidencePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      if (!refreshed) {
        await refreshUpgradeGateEvidence(workspaceRoot);
        return ensureUpgradeGateEvidence(workspaceRoot, { refreshed: true });
      }
      throw new Error(
        "Upgrade gate evidence missing (state/quality/upgrade_gates.json) even after automatic preflight refresh.",
      );
    }
    throw new Error(
      `Unable to read upgrade gate evidence: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    if (!refreshed) {
      await refreshUpgradeGateEvidence(workspaceRoot);
      return ensureUpgradeGateEvidence(workspaceRoot, { refreshed: true });
    }
    throw new Error(
      "Upgrade gate evidence malformed JSON even after automatic preflight refresh; rerun tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts.",
    );
  }

  if (!parsed || typeof parsed !== "object") {
    if (!refreshed) {
      await refreshUpgradeGateEvidence(workspaceRoot);
      return ensureUpgradeGateEvidence(workspaceRoot, { refreshed: true });
    }
    throw new Error(
      "Upgrade gate evidence missing expected payload even after automatic preflight refresh; rerun tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts.",
    );
  }

  const recordedAt = parseTimestamp(parsed.recorded_at ?? parsed.recordedAt);
  if (Number.isNaN(recordedAt)) {
    if (!refreshed) {
      await refreshUpgradeGateEvidence(workspaceRoot);
      return ensureUpgradeGateEvidence(workspaceRoot, { refreshed: true });
    }
    throw new Error(
      "Upgrade gate evidence missing recorded_at timestamp even after automatic preflight refresh; rerun tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts.",
    );
  }
  if (recordedAt + GATE_EVIDENCE_MAX_AGE_MS < Date.now()) {
    const timestampText = parsed.recorded_at ?? parsed.recordedAt;
    if (!refreshed) {
      await refreshUpgradeGateEvidence(workspaceRoot);
      return ensureUpgradeGateEvidence(workspaceRoot, { refreshed: true });
    }
    throw new Error(
      `Upgrade gate evidence stale (recorded_at=${timestampText}) even after automatic preflight refresh.`,
    );
  }

  if (parsed.ok !== true) {
    if (!refreshed) {
      await refreshUpgradeGateEvidence(workspaceRoot);
      return ensureUpgradeGateEvidence(workspaceRoot, { refreshed: true });
    }
    const failureDetail =
      typeof parsed.failedCheck === "string" && parsed.failedCheck.length > 0
        ? ` (failedCheck=${parsed.failedCheck})`
        : "";
    const baseMessage = `Upgrade preflight guardrail failing${failureDetail}; resolve issues and rerun preflight before promotion.`;
    const message = await appendDirtyWorkspaceSample(
      baseMessage,
      workspaceRoot,
      typeof parsed.failedCheck === "string" ? parsed.failedCheck : "",
    );
    if (refreshed && parsed.failedCheck === "git_clean") {
      console.warn(`[manager-self-check] git cleanliness guardrail still failing after refresh; continuing with advisory. ${message}`);
      return;
    }
    throw new Error(message);
  }

  if (!Array.isArray(parsed.gates) || parsed.gates.length === 0) {
    throw new Error(
      "Upgrade gate evidence missing gate sequence; rerun tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts.",
    );
  }

  const gateIndex = new Map();
  parsed.gates.forEach((gate, index) => {
    if (gate && typeof gate === "object" && typeof gate.gate === "string") {
      gateIndex.set(gate.gate, { ...gate, index });
    }
  });

  let lastIndex = -1;
  for (const gateName of GATE_SEQUENCE) {
    const entry = gateIndex.get(gateName);
    if (!entry) {
      throw new Error(
        `Upgrade gate evidence missing "${gateName}" gate; rerun tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts.`,
      );
    }
    if (Number.isNaN(parseTimestamp(entry.timestamp))) {
      throw new Error(
        `Upgrade gate "${gateName}" missing timestamp; rerun tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts.`,
      );
    }
    if (!["pending", "passed", "failed"].includes(entry.status)) {
      throw new Error(
        `Upgrade gate "${gateName}" has invalid status "${entry.status}".`,
      );
    }
    if (entry.status === "failed") {
      throw new Error(`Upgrade gate "${gateName}" recorded failure; abort promotion.`);
    }
    if (entry.index <= lastIndex) {
      throw new Error(
        "Upgrade gate evidence out of sequence; rerun tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts.",
      );
    }
    lastIndex = entry.index;
  }

  if (!Array.isArray(parsed.versions)) {
    throw new Error(
      "Upgrade gate evidence missing version checks; rerun tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts.",
    );
  }

  const versionIndex = new Map();
  for (const version of parsed.versions) {
    if (version && typeof version === "object" && typeof version.tool === "string") {
      versionIndex.set(version.tool, version);
    }
  }

  for (const tool of ["node", "npm"]) {
    const info = versionIndex.get(tool);
    if (!info) {
      throw new Error(
        `Upgrade gate evidence missing ${tool} version evidence; rerun preflight.`,
      );
    }
    if (!info.satisfies) {
      const constraint =
        typeof info.constraint === "string" && info.constraint.length > 0
          ? ` (constraint ${info.constraint})`
          : "";
      throw new Error(
        `${tool} version fails upgrade guardrail${constraint}; align tooling before promotion.`,
      );
    }
  }

  if (typeof parsed.artifact === "string" && parsed.artifact.trim().length > 0) {
    const artifactPath = path.join(workspaceRoot, parsed.artifact);
    try {
      await fs.access(artifactPath);
    } catch {
      throw new Error(
        `Upgrade gate artifact missing at ${parsed.artifact}; rerun tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts.`,
      );
    }
  }
}

function validateRollbackSimulation(alert, simulation) {
  const alertRunId = alert?.run_id ?? alert?.runId ?? null;
  const alertTenantId = alert?.tenant_id ?? alert?.tenantId ?? null;

  if (!simulation) {
    return `Critical automation alert (${alertRunId ?? "unknown"}) requires rollback_sim artifact.`;
  }

  const simulationRunId = simulation.run_id ?? simulation.runId ?? null;
  if (simulationRunId !== alertRunId) {
    return `Rollback simulation run_id mismatch (alert=${alert.run_id ?? alert.runId ?? "unknown"}, simulation=${simulation.run_id ?? simulation.runId ?? "unknown"}).`;
  }

  const simulationTenantId = simulation.tenant_id ?? simulation.tenantId ?? null;
  if (simulationTenantId !== alertTenantId) {
    return `Rollback simulation tenant mismatch (alert=${alert.tenant_id ?? alert.tenantId ?? "unknown"}, simulation=${simulation.tenant_id ?? simulation.tenantId ?? "unknown"}).`;
  }

  const rollbackReady = simulation.rollback_ready ?? simulation.rollbackReady ?? false;
  if (!rollbackReady) {
    return `Rollback simulation for run ${alertRunId ?? "unknown"} not ready (rollback_ready flag is false).`;
  }

  const actions = Array.isArray(simulation.actions) ? simulation.actions : [];
  if (!actions.length) {
    return `Rollback simulation missing actions for run ${alertRunId ?? "unknown"}; rerun executor to capture rollback steps.`;
  }

  const simulationTimestampText = simulation.simulated_at ?? simulation.simulatedAt ?? null;
  const simulationTimestamp = parseTimestamp(simulationTimestampText);
  if (Number.isNaN(simulationTimestamp)) {
    return "Rollback simulation missing simulated_at timestamp.";
  }

  const alertTimestamp = parseTimestamp(alert.generated_at ?? alert.generatedAt);
  if (!Number.isNaN(alertTimestamp) && simulationTimestamp < alertTimestamp) {
    return `Rollback simulation predates critical alert (simulation=${simulation.simulated_at ?? simulation.simulatedAt}, alert=${alert.generated_at ?? alert.generatedAt}).`;
  }

  if (simulationTimestamp + ALERT_FRESH_WINDOW_MS < Date.now()) {
    const simText = simulation.simulated_at ?? simulation.simulatedAt;
    return `Rollback simulation stale (simulated_at=${simText}); rerun executor to refresh promotion gate.`;
  }

  const alertCodes = Array.isArray(alert.codes) ? alert.codes : [];
  const simulationCodesRaw =
    Array.isArray(simulation.critical_guardrail_codes) && simulation.critical_guardrail_codes.length > 0
      ? simulation.critical_guardrail_codes
      : simulation.criticalGuardrailCodes;
  const simulationCodes = Array.isArray(simulationCodesRaw) ? simulationCodesRaw : [];
  const missingCodes = alertCodes.filter((code) => !simulationCodes.includes(code));
  if (missingCodes.length) {
    return `Rollback simulation missing guardrail codes ${missingCodes.join(", ")}; regenerate artifact from latest manifest.`;
  }

  return null;
}

async function ensureRollbackPromotionGate(workspaceRoot, alert, simulation) {
  if (!alert) {
    return;
  }

  if (isAlertAcknowledged(alert)) {
    return;
  }

  let current = simulation;
  let attemptedRefresh = false;

  while (true) {
    const validationError = validateRollbackSimulation(alert, current);
    if (!validationError) {
      return;
    }

    if (attemptedRefresh) {
      throw new Error(validationError);
    }

    const refreshed = await tryRefreshRollbackSimulation(workspaceRoot, alert);
    if (!refreshed) {
      throw new Error(validationError);
    }

    current = await readRollbackSimulation(workspaceRoot);
    attemptedRefresh = true;
  }
}

async function main() {
  const workspaceRoot = path.resolve(process.argv[2] ?? path.join(process.cwd(), "..", ".."));

  try {
    const [{ content, stats }, { parsed }, alerts, simulation, workerSnapshot] = await Promise.all([
      readContext(workspaceRoot),
      readRoadmap(workspaceRoot),
      readAlerts(workspaceRoot),
      readRollbackSimulation(workspaceRoot),
      readWorkerManagerSnapshot(workspaceRoot),
    ]);

    ensureRecentContext(stats);
    ensureNextActions(content);
    ensureActiveTasks(parsed);
    await ensureUpgradeGateEvidence(workspaceRoot);
    ensureWorkerSnapshotFresh(workerSnapshot);
    const criticalAlert = findLatestCriticalAlert(alerts);
    await ensureRollbackPromotionGate(workspaceRoot, criticalAlert, simulation);

    console.log("Manager self-check passed: context fresh, roadmap actionable.");
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
