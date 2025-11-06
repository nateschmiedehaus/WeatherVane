#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Wave0Runner } from "../dist/wave0/runner.js";
import { logInfo, logError } from "../dist/telemetry/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--once")) {
    process.env.WAVE0_SINGLE_RUN = "1";
  }

  const epicArg = args.find((arg) => arg.startsWith("--epic="));
  if (epicArg) {
    const value = epicArg.split("=")[1] ?? "";
    process.env.WAVE0_TARGET_EPICS = value;
  }

  const rateLimitArg = args.find((arg) => arg.startsWith("--rate-limit-ms="));
  if (rateLimitArg) {
    const value = rateLimitArg.split("=")[1] ?? "";
    process.env.WAVE0_RATE_LIMIT_MS = value;
  }

  const emptyRetryArg = args.find((arg) => arg.startsWith("--empty-retry-limit="));
  if (emptyRetryArg) {
    const value = emptyRetryArg.split("=")[1] ?? "";
    process.env.WAVE0_EMPTY_RETRY_LIMIT = value;
  }

  try {
    const workspaceRoot = path.resolve(__dirname, "..", "..", "..");
    const targetEpics = process.env.WAVE0_TARGET_EPICS
      ? process.env.WAVE0_TARGET_EPICS.split(",").map((value) => value.trim()).filter(Boolean)
      : undefined;
    const singleRun = process.env.WAVE0_SINGLE_RUN === "1";

    logInfo("=== Wave 0 Autopilot Starting (compiled runner) ===", {
      workspaceRoot,
      singleRun,
      targetEpics,
    });
    const runner = new Wave0Runner(workspaceRoot, {
      singleRun,
      targetEpics,
    });
    await runner.run();
    logInfo("=== Wave 0 Autopilot Stopped ===");
  } catch (error) {
    logError("Wave 0 runner crashed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

main();
