#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

const HOURS_12_MS = 12 * 60 * 60 * 1000;

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

async function main() {
  const workspaceRoot = path.resolve(process.argv[2] ?? path.join(process.cwd(), "..", ".."));

  try {
    const [{ content, stats }, { parsed }] = await Promise.all([
      readContext(workspaceRoot),
      readRoadmap(workspaceRoot),
    ]);

    ensureRecentContext(stats);
    ensureNextActions(content);
    ensureActiveTasks(parsed);

    console.log("Manager self-check passed: context fresh, roadmap actionable.");
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
