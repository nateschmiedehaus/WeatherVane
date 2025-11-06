#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PlanReviewerCritic } from "../critics/plan_reviewer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..", "..");
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

async function main(): Promise<void> {
  const taskArg = process.argv[2];
  const targets = taskArg ? [taskArg] : await discoverTasks("plan.md");

  if (targets.length === 0) {
    console.log("No plan.md files found to review.");
    return;
  }

  const reviewer = new PlanReviewerCritic(repoRoot);
  const results: ReviewSummary[] = [];

  for (const taskId of targets) {
    const filePath = path.join(evidenceRoot, taskId, "plan.md");
    if (!(await fileExists(filePath))) {
      results.push({
        taskId,
        passed: false,
        message: `plan.md not found at ${filePath}`,
      });
      continue;
    }

    try {
      const result = await reviewer.reviewDocument(taskId);
      if (result.passed) {
        results.push({
          taskId,
          passed: true,
          message: result.stdout || "Plan review approved",
        });
      } else {
        const detail = result.stderr || result.stdout || "Plan review failed (no details provided).";
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
        message: `Plan review failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  const failed = results.filter((summary) => !summary.passed);

  if (failed.length > 0) {
    console.error(`${RED}${BOLD}❌ Plan review failed for ${failed.length} task(s):${RESET}\n`);
    for (const summary of failed) {
      console.error(`${BLUE}${BOLD}${summary.taskId}:${RESET}`);
      console.error(summary.message);
      console.error("");
    }
    process.exit(1);
  }

  console.log(`${GREEN}${BOLD}✅ Plan review passed for ${results.length} task(s).${RESET}`);
}

async function discoverTasks(fileName: string): Promise<string[]> {
  const entries = await fs.readdir(evidenceRoot, { withFileTypes: true });
  const tasks: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(evidenceRoot, entry.name, fileName);
    if (await fileExists(candidate)) {
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

main().catch((error) => {
  console.error("Plan review runner failed:", error);
  process.exit(1);
});
