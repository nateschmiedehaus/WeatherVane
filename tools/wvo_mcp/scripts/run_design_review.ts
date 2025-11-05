#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DesignReviewerCritic } from "../src/critics/design_reviewer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(path.join(__dirname, "..", "..", ".."));
const evidenceRoot = path.join(repoRoot, "state", "evidence");

// ANSI color codes
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
  const targets = taskArg ? [taskArg] : await discoverTasks();

  if (targets.length === 0) {
    console.log("No design.md files found to review.");
    return;
  }

  const reviewer = new DesignReviewerCritic(repoRoot);
  const results: ReviewSummary[] = [];

  for (const taskId of targets) {
    const designPath = path.join(evidenceRoot, taskId, "design.md");

    try {
      // Check if design.md exists
      await fs.access(designPath);
    } catch (error) {
      results.push({
        taskId,
        passed: false,
        message: `No design.md found at ${designPath}`,
      });
      continue;
    }

    try {
      // Invoke intelligent DesignReviewer critic
      const result = await reviewer.reviewDesign(taskId);

      if (result.passed) {
        results.push({
          taskId,
          passed: true,
          message: "Design approved",
        });
      } else {
        // Format concerns for display
        const concerns = result.metadata?.concerns || [];
        const concernsList = concerns
          .map((c: any) => {
            const severity = c.severity === "high" ? `${RED}HIGH${RESET}` : `${YELLOW}MEDIUM${RESET}`;
            return `  ${severity} - ${c.type}: ${c.guidance}`;
          })
          .join("\n");

        results.push({
          taskId,
          passed: false,
          message: `Design needs revision:\n${concernsList}\n\n${result.metadata?.remediation_instructions || ""}`,
        });
      }
    } catch (error) {
      results.push({
        taskId,
        passed: false,
        message: `Design review failed: ${String(error)}`,
      });
    }
  }

  // Print results
  const failed = results.filter((r) => !r.passed);

  if (failed.length > 0) {
    console.error(`${RED}${BOLD}❌ Design review failed for ${failed.length} task(s):${RESET}\n`);
    for (const result of failed) {
      console.error(`${BLUE}${BOLD}${result.taskId}:${RESET}`);
      console.error(result.message);
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

main().catch((error) => {
  console.error("Design review runner failed:", error);
  process.exit(1);
});
