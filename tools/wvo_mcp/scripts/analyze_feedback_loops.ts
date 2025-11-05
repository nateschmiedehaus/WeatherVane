#!/usr/bin/env node
import path from "node:path";

import { readFeedbackLoops, computeFeedbackDensity } from "../src/analytics/feedback_tracker.js";

interface CliOptions {
  file?: string;
  showOpen?: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    showOpen: true,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--file" && index + 1 < argv.length) {
      options.file = argv[index + 1];
      index++;
    } else if (arg === "--no-open") {
      options.showOpen = false;
    }
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const workspaceRoot = process.cwd();
  let records;
  if (options.file) {
    const absolute = path.isAbsolute(options.file)
      ? options.file
      : path.resolve(workspaceRoot, options.file);
    const content = await import("node:fs/promises").then((fs) => fs.readFile(absolute, "utf8"));
    records = content
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } else {
    records = await readFeedbackLoops(workspaceRoot);
  }

  if (records.length === 0) {
    console.log("No feedback loops recorded yet.");
    return;
  }

  const density = computeFeedbackDensity(records);
  console.log(`Feedback density: ${(density * 100).toFixed(1)}%`);

  if (options.showOpen) {
    const latestByLoop = new Map<string, typeof records[number]>();
    for (const record of records) {
      latestByLoop.set(record.loop_id, record);
    }
    const openLoops = Array.from(latestByLoop.values()).filter((record) => !record.loop_closed);
    console.log(`Open loops: ${openLoops.length}`);
    for (const loop of openLoops) {
      console.log(
        `  ${loop.task_id} (opened ${loop.loop_opened_timestamp}, iterations ${loop.iterations_to_close})`,
      );
    }
  }
}

main().catch((error) => {
  console.error("Failed to analyze feedback loops:", error);
  process.exit(1);
});
