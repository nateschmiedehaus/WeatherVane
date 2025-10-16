#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const HOURS_12_MS = 12 * 60 * 60 * 1000;
const ALERT_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const GATE_SEQUENCE = ["build", "unit", "selfchecks", "canary_ready"];
const GATE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const WORKER_SNAPSHOT_MAX_AGE_MS = 10 * 60 * 1000;
const ACTIVE_HEALTH_MAX_AGE_MS = 5 * 60 * 1000;
const WORKER_EXIT_WINDOW_MS = 10 * 60 * 1000;

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
  if (!content.includes("Next actions")) {
    throw new Error("Context missing 'Next actions' section.");
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

async function ensureUpgradeGateEvidence(workspaceRoot) {
  const evidencePath = path.join(workspaceRoot, "state", "quality", "upgrade_gates.json");

  let raw;
  try {
    raw = await fs.readFile(evidencePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(
        "Upgrade gate evidence missing (state/quality/upgrade_gates.json). Run the MCP upgrade preflight before canary promotion.",
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
    throw new Error(
      "Upgrade gate evidence malformed JSON; rerun tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts.",
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(
      "Upgrade gate evidence missing expected payload; rerun tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts.",
    );
  }

  const recordedAt = parseTimestamp(parsed.recorded_at ?? parsed.recordedAt);
  if (Number.isNaN(recordedAt)) {
    throw new Error(
      "Upgrade gate evidence missing recorded_at timestamp; rerun tools/wvo_mcp/scripts/mcp_upgrade_preflight.ts.",
    );
  }
  if (recordedAt + GATE_EVIDENCE_MAX_AGE_MS < Date.now()) {
    const timestampText = parsed.recorded_at ?? parsed.recordedAt;
    throw new Error(
      `Upgrade gate evidence stale (recorded_at=${timestampText}); rerun preflight before canary promotion.`,
    );
  }

  if (parsed.ok !== true) {
    const failureDetail =
      typeof parsed.failedCheck === "string" && parsed.failedCheck.length > 0
        ? ` (failedCheck=${parsed.failedCheck})`
        : "";
    throw new Error(
      `Upgrade preflight guardrail failing${failureDetail}; resolve issues and rerun preflight before promotion.`,
    );
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

function ensureRollbackPromotionGate(alert, simulation) {
  if (!alert) {
    return;
  }

  if (isAlertAcknowledged(alert)) {
    return;
  }

  if (!simulation) {
    throw new Error(
      `Critical automation alert (${alert.run_id ?? "unknown"}) requires rollback_sim artifact.`,
    );
  }

  if (simulation.run_id !== alert.run_id) {
    throw new Error(
      `Rollback simulation run_id mismatch (alert=${alert.run_id}, simulation=${simulation.run_id ?? "unknown"}).`,
    );
  }

  if (simulation.tenant_id !== alert.tenant_id) {
    throw new Error(
      `Rollback simulation tenant mismatch (alert=${alert.tenant_id}, simulation=${simulation.tenant_id ?? "unknown"}).`,
    );
  }

  if (!simulation.rollback_ready) {
    throw new Error(
      `Rollback simulation for run ${alert.run_id} not ready (rollback_ready flag is false).`,
    );
  }

  if (!Array.isArray(simulation.actions) || simulation.actions.length === 0) {
    throw new Error(
      `Rollback simulation missing actions for run ${alert.run_id}; rerun executor to capture rollback steps.`,
    );
  }

  const alertTimestamp = parseTimestamp(alert.generated_at);
  const simulationTimestamp = parseTimestamp(simulation.simulated_at);
  if (Number.isNaN(simulationTimestamp)) {
    throw new Error("Rollback simulation missing simulated_at timestamp.");
  }
  if (!Number.isNaN(alertTimestamp) && simulationTimestamp < alertTimestamp) {
    throw new Error(
      `Rollback simulation predates critical alert (simulation=${simulation.simulated_at}, alert=${alert.generated_at}).`,
    );
  }

  if (simulationTimestamp + ALERT_FRESH_WINDOW_MS < Date.now()) {
    throw new Error(
      `Rollback simulation stale (simulated_at=${simulation.simulated_at}); rerun executor to refresh promotion gate.`,
    );
  }

  const alertCodes = Array.isArray(alert.codes) ? alert.codes : [];
  const simulationCodes = Array.isArray(simulation.critical_guardrail_codes)
    ? simulation.critical_guardrail_codes
    : [];
  const missingCodes = alertCodes.filter((code) => !simulationCodes.includes(code));
  if (missingCodes.length) {
    throw new Error(
      `Rollback simulation missing guardrail codes ${missingCodes.join(", ")}; regenerate artifact from latest manifest.`,
    );
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
    ensureRollbackPromotionGate(criticalAlert, simulation);

    console.log("Manager self-check passed: context fresh, roadmap actionable.");
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
