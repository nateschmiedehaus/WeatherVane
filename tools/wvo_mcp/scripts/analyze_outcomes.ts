#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

interface OutcomeRecord {
  task_id?: string;
  success?: boolean;
}

interface CliOptions {
  file: string;
  showSuccessRate: boolean;
  showByTaskType: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const defaults: CliOptions = {
    file: "state/analytics/task_outcomes.jsonl",
    showSuccessRate: true,
    showByTaskType: true,
  };

  const result = { ...defaults };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--file" && index + 1 < argv.length) {
      result.file = argv[index + 1];
      index++;
    } else if (arg === "--success-rate") {
      result.showSuccessRate = true;
    } else if (arg === "--no-success-rate") {
      result.showSuccessRate = false;
    } else if (arg === "--by-task-type") {
      result.showByTaskType = true;
    } else if (arg === "--no-by-task-type") {
      result.showByTaskType = false;
    }
  }

  return result;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const absolutePath = path.isAbsolute(options.file)
    ? options.file
    : path.join(process.cwd(), options.file);

  if (!existsSync(absolutePath)) {
    console.error(`No outcomes file found at ${absolutePath}`);
    process.exit(1);
  }

  const stats = {
    total: 0,
    success: 0,
    byType: new Map<string, { total: number; success: number }>(),
  };

  const stream = createReadStream(absolutePath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as OutcomeRecord;
      stats.total += 1;
      if (record.success) {
        stats.success += 1;
      }
      if (record.task_id) {
        const taskType = extractTaskType(record.task_id);
        const bucket = stats.byType.get(taskType) ?? { total: 0, success: 0 };
        bucket.total += 1;
        if (record.success) bucket.success += 1;
        stats.byType.set(taskType, bucket);
      }
    } catch (error) {
      console.warn("Skipping malformed JSON line:", line);
    }
  }

  if (stats.total === 0) {
    console.log("No task outcomes recorded yet.");
    return;
  }

  if (options.showSuccessRate) {
    const successRate = (stats.success / stats.total) * 100;
    console.log(`Success rate: ${successRate.toFixed(1)}% (${stats.success}/${stats.total})`);
  }

  if (options.showByTaskType) {
    console.log("\nBy task type:");
    const rows = Array.from(stats.byType.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    for (const [taskType, bucket] of rows) {
      const rate = bucket.total > 0 ? (bucket.success / bucket.total) * 100 : 0;
      console.log(`  ${taskType}: ${bucket.success}/${bucket.total} (${rate.toFixed(1)}%)`);
    }
  }
}

function extractTaskType(taskId: string): string {
  const segments = taskId.split("-");
  if (segments.length >= 2) {
    return segments.slice(0, 2).join("-");
  }
  return taskId;
}

main().catch((error) => {
  console.error("Failed to analyze task outcomes:", error);
  process.exit(1);
});

