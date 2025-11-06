#!/usr/bin/env tsx

/**
 * Wave 0 Autopilot Entry Point
 *
 * Usage:
 *   npm run wave0
 *   npx tsx scripts/run_wave0.ts
 *
 * Starts Wave 0 minimal autonomous loop:
 * - Selects pending tasks from roadmap
 * - Executes tasks (minimal implementation)
 * - Logs results
 * - Repeats with rate limiting
 *
 * Graceful shutdown: CTRL+C (SIGINT) or kill (SIGTERM)
 */

import path from "node:path";
import { Wave0Runner } from "../src/wave0/runner.js";
import { logInfo, logError } from "../src/telemetry/logger.js";

async function main(): Promise<void> {
  try {
    logInfo("=== Wave 0 Autopilot Starting ===");
    logInfo("Press CTRL+C to stop gracefully");

    // Workspace root: if running from tools/wvo_mcp, go up 2 levels
    // scripts/run_wave0.ts → tools/wvo_mcp/ → WeatherVane/
    const workspaceRoot = process.cwd().includes("tools/wvo_mcp")
      ? path.join(process.cwd(), "../..")
      : process.cwd();

    logInfo(`Workspace root: ${workspaceRoot}`);

    // Create and run Wave 0
    const runner = new Wave0Runner(workspaceRoot);
    await runner.run();

    logInfo("=== Wave 0 Autopilot Stopped ===");
    process.exit(0);
  } catch (error) {
    logError("Fatal error in Wave 0 Autopilot", { error });
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
