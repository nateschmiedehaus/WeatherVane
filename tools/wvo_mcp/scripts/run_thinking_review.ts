#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ThinkingCritic } from "../src/critics/thinking_critic.js";

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
    console.log("No think.md files found to review.");
    return;
  }

  const reviewer = new ThinkingCritic(repoRoot);
  const results: ReviewSummary[] = [];

  for (const taskId of targets) {
    const thinkPath = path.join(evidenceRoot, taskId, "think.md");

    try {
      // Check if think.md exists
      await fs.access(thinkPath);
    } catch (error) {
      results.push({
        taskId,
        passed: false,
        message: `No think.md found at ${thinkPath}`,
      });
      continue;
    }

    try {
      // Invoke intelligent ThinkingCritic
      const result = await reviewer.reviewThinking(taskId);

      if (result.passed) {
        results.push({
          taskId,
          passed: true,
          message: "Thinking approved",
        });
      } else {
        // Format concerns for display
        const concerns = result.metadata?.concerns || [];
        const concernsList = concerns
          .map((c: any) => {
            const severity = c.severity === "high" ? `${RED}HIGH${RESET}` :
                           c.severity === "medium" ? `${YELLOW}MEDIUM${RESET}` :
                           `${BLUE}LOW${RESET}`;
            return `  ${severity} - ${c.type}: ${c.guidance}`;
          })
          .join("\n");

        results.push({
          taskId,
          passed: false,
          message: `Thinking needs deeper analysis:\n${concernsList}\n\n${result.metadata?.remediation_instructions || ""}`,
        });
      }
    } catch (error) {
      results.push({
        taskId,
        passed: false,
        message: `Thinking review failed: ${String(error)}`,
      });
    }
  }

  // Print results
  const failed = results.filter((r) => !r.passed);

  if (failed.length > 0) {
    console.error(`${RED}${BOLD}❌ Thinking review failed for ${failed.length} task(s):${RESET}\n`);
    for (const result of failed) {
      console.error(`${BLUE}${BOLD}${result.taskId}:${RESET}`);
      console.error(result.message);
      console.error("");
    }
    process.exit(1);
  }

  console.log(`${GREEN}${BOLD}✅ Thinking review passed for ${results.length} task(s).${RESET}`);
}

async function discoverTasks(): Promise<string[]> {
  const entries = await fs.readdir(evidenceRoot, { withFileTypes: true });
  const tasks: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const thinkPath = path.join(evidenceRoot, entry.name, "think.md");
    if (await fileExists(thinkPath)) {
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
  console.error("Thinking review runner failed:", error);
  process.exit(1);
});
