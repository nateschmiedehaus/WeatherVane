#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const HOURS_12_MS = 12 * 60 * 60 * 1000;
const ALERT_FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

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
    const [{ content, stats }, { parsed }, alerts, simulation] = await Promise.all([
      readContext(workspaceRoot),
      readRoadmap(workspaceRoot),
      readAlerts(workspaceRoot),
      readRollbackSimulation(workspaceRoot),
    ]);

    ensureRecentContext(stats);
    ensureNextActions(content);
    ensureActiveTasks(parsed);
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
