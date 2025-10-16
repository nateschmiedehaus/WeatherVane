#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";

function normalizeWorkspace(input) {
  return path.resolve(input ?? process.cwd());
}

async function ensureCharterExists(workspaceRoot) {
  const charterPath = path.join(
    workspaceRoot,
    "docs",
    "orchestration",
    "multi_agent_charter.md",
  );

  const content = await fs.readFile(charterPath, "utf8").catch((error) => {
    if (error && error.code === "ENOENT") {
      throw new Error("Multi-agent charter missing (docs/orchestration/multi_agent_charter.md).");
    }
    throw error;
  });

  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("Multi-agent charter is empty. Add personas, delegation mesh, and metrics.");
  }

  const requiredPhrases = [
    "Multi-Agent Charter",
    "Delegation Mesh",
  ];

  for (const phrase of requiredPhrases) {
    if (!trimmed.includes(phrase)) {
      throw new Error(`Charter missing required section: "${phrase}".`);
    }
  }

  const guardrailAliases = [
    "Guardrails & System Decisions",
    "Guardrails & Non-Negotiables",
  ];
  if (!guardrailAliases.some((phrase) => trimmed.includes(phrase))) {
    throw new Error('Charter missing guardrails section (expected "Guardrails & System Decisions" or "Guardrails & Non-Negotiables").');
  }

  const stats = await fs.stat(charterPath);
  const ageHours = (Date.now() - stats.mtimeMs) / (60 * 60 * 1000);
  if (ageHours > 48) {
    throw new Error(
      `Multi-agent charter appears stale (last modified ${(ageHours).toFixed(1)}h ago). Refresh the document.`,
    );
  }
}

async function ensureContextReflectsCharter(workspaceRoot) {
  const contextPath = path.join(workspaceRoot, "state", "context.md");
  const content = await fs.readFile(contextPath, "utf8");
  const stats = await fs.stat(contextPath);

  const ageHours = (Date.now() - stats.mtimeMs) / (60 * 60 * 1000);
  if (ageHours > 12) {
    throw new Error(
      `Context memo stale (updated ${(ageHours).toFixed(1)}h ago). Refresh manager context with latest charter + consensus plans.`,
    );
  }

  const expectedMentions = [
    "autonomous orchestration blueprints",
    "consensus engine",
    "multi-agent charter",
  ];

  const normalized = content.toLowerCase();
  const missing = expectedMentions.filter((phrase) => !normalized.includes(phrase));
  if (missing.length > 0) {
    throw new Error(
      `Context memo missing references to charter initiatives: ${missing.join(", ")}.`,
    );
  }
}

async function ensureRoadmapAlignment(workspaceRoot) {
  const roadmapPath = path.join(workspaceRoot, "state", "roadmap.yaml");
  const content = await fs.readFile(roadmapPath, "utf8");
  const roadmap = YAML.parse(content);

  const epics = roadmap?.epics ?? [];
  const tasks = epics.flatMap((epic) =>
    epic.milestones?.flatMap((milestone) => milestone.tasks ?? []) ?? [],
  );

  const charterTask = tasks.find((task) => task.id === "T3.3.1");
  if (!charterTask) {
    throw new Error("Roadmap missing T3.3.1 (multi-agent charter).");
  }
  if (!["in_progress", "done"].includes(charterTask.status)) {
    throw new Error(
      `T3.3.1 status must be in_progress or done (current=${charterTask.status ?? "unknown"}).`,
    );
  }

  const consensusTask = tasks.find((task) => task.id === "T3.3.2");
  if (!consensusTask) {
    throw new Error("Roadmap missing T3.3.2 (consensus engine).");
  }
}

async function main() {
  const workspaceRoot = normalizeWorkspace(process.argv[2]);

  await ensureCharterExists(workspaceRoot);
  await ensureContextReflectsCharter(workspaceRoot);
  await ensureRoadmapAlignment(workspaceRoot);

  console.log("Org PM charter/state checks passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
