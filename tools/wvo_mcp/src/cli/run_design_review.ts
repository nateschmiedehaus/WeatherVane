#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { CriticResult } from "../critics/base.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
const mcpRoot = path.join(repoRoot, "tools", "wvo_mcp");
const evidenceRoot = path.join(repoRoot, "state", "evidence");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

interface ReviewSummary {
  taskId: string;
  passed: boolean;
  message: string;
}

type DesignReviewerConstructor = new (
  workspaceRoot: string,
) => {
  reviewDesign: (
    taskId: string,
    agentContext?: {
      recent_quality?: number;
      bug_rate?: number;
      track_record?: string;
    },
  ) => Promise<CriticResult>;
};

async function main(): Promise<void> {
  const taskArg = process.argv[2];
  const targets = taskArg ? [taskArg] : await discoverTasks();

  if (targets.length === 0) {
    console.log("No design.md files found to review.");
    return;
  }

  const DesignReviewerCritic = await loadDesignReviewer();
  const reviewer = new DesignReviewerCritic(repoRoot);
  const results: ReviewSummary[] = [];

  for (const taskId of targets) {
    const designPath = path.join(evidenceRoot, taskId, "design.md");

    if (!(await fileExists(designPath))) {
      results.push({
        taskId,
        passed: false,
        message: `No design.md found at ${designPath}`,
      });
      continue;
    }

    try {
      const critique = (await reviewer.reviewDesign(taskId)) as CriticResult;
      if (critique.passed) {
        results.push({
          taskId,
          passed: true,
          message: critique.stdout || "Design approved",
        });
      } else {
        const detail = critique.stderr || critique.stdout || "Design needs revision (no details provided).";
        results.push({
          taskId,
          passed: false,
          message: detail,
        });
      }
    } catch (error) {
      results.push({
        taskId,
        passed: false,
        message: `Design review failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const failed = results.filter((summary) => !summary.passed);

  if (failed.length > 0) {
    console.error(`${RED}${BOLD}❌ Design review failed for ${failed.length} task(s):${RESET}\n`);
    for (const summary of failed) {
      console.error(`${BLUE}${BOLD}${summary.taskId}:${RESET}`);
      console.error(summary.message);
      console.error("");
    }
    process.exit(1);
  }

  console.log(`${GREEN}${BOLD}✅ Design review passed for ${results.length} task(s).${RESET}`);
}

async function discoverTasks(): Promise<string[]> {
  const entries = await fs.readdir(evidenceRoot, { withFileTypes: true });
  const tasks: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const designPath = path.join(evidenceRoot, entry.name, "design.md");
    if (await fileExists(designPath)) {
      tasks.push(entry.name);
    }
  }
  return tasks.sort();
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadDesignReviewer(): Promise<DesignReviewerConstructor> {
  const candidates = [
    path.join(mcpRoot, "dist", "critics", "design_reviewer.js"),
    path.join(mcpRoot, "src", "critics", "design_reviewer.ts"),
  ];

  for (const candidate of candidates) {
    try {
      const moduleUrl = pathToFileURL(candidate).href;
      const mod = (await import(moduleUrl)) as { DesignReviewerCritic?: DesignReviewerConstructor };
      if (mod?.DesignReviewerCritic) {
        return mod.DesignReviewerCritic;
      }
    } catch {
      // try next candidate
    }
  }

  throw new Error("Unable to resolve DesignReviewerCritic implementation");
}

main().catch((error) => {
  console.error("Design review runner failed:", error);
  process.exit(1);
});
