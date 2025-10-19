import { promises as fs } from "node:fs";
import path from "node:path";

import { Critic } from "./base.js";
import type { CriticResult } from "./base.js";

export class CostPerfCritic extends Critic {
  protected command(_profile: string): string | null {
    return null;
  }

  async run(profile: string): Promise<CriticResult> {
    // Call base for profile (unused) to keep parity; avoid eslint unused var
    void profile;

    const telemetryPath = path.join(this.stateRoot, "telemetry", "executions.jsonl");

    let stdoutLines: string[] = [];
    let stderrMessage = "";
    let passed = true;

    try {
      const raw = await fs.readFile(telemetryPath, "utf8");
      const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const recentLines = lines.slice(-200); // Keep analysis window bounded

      let eligible = 0;
      let hits = 0;
      let stores = 0;

      for (const line of recentLines) {
        try {
          const record = JSON.parse(line) as Record<string, unknown>;
          if (record["type"] !== "execution_summary") {
            continue;
          }

          const statusRaw = typeof record["prompt_cache_status"] === "string"
            ? record["prompt_cache_status"].toLowerCase()
            : null;
          const hitFlag = record["prompt_cache_hit"] === true || statusRaw === "hit";
          const storeFlag = record["prompt_cache_store"] === true || statusRaw === "store";
          const eligibleFlag = record["prompt_cache_eligible"] === true
            || (!!statusRaw && statusRaw !== "bypass" && statusRaw !== "error");

          if (hitFlag) {
            hits += 1;
            eligible += 1;
          } else if (storeFlag) {
            stores += 1;
            eligible += 1;
          } else if (eligibleFlag) {
            eligible += 1;
          }
        } catch {
          // Ignore malformed telemetry line
        }
      }

      const windowSize = recentLines.length;
      const hitRate = eligible > 0 ? hits / eligible : 0;

      stdoutLines = [
        `window_observed: ${windowSize}`,
        `prompt_cache_eligible: ${eligible}`,
        `prompt_cache_hits: ${hits}`,
        `prompt_cache_stores: ${stores}`,
        `prompt_cache_hit_rate: ${(hitRate * 100).toFixed(1)}%`,
      ];
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err && err.code === "ENOENT") {
        passed = true;
        stderrMessage = "executions telemetry not found; prompt cache stats unavailable";
      } else {
        passed = false;
        stderrMessage =
          error instanceof Error ? error.message : "Failed to read executions telemetry";
      }
      stdoutLines = [
        "window_observed: 0",
        "prompt_cache_eligible: 0",
        "prompt_cache_hits: 0",
        "prompt_cache_stores: 0",
        "prompt_cache_hit_rate: 0.0%",
      ];
    }

    const result: CriticResult = {
      critic: this.constructor.name.replace("Critic", "").toLowerCase(),
      code: passed ? 0 : 1,
      stdout: stdoutLines.join("\n"),
      stderr: stderrMessage,
      passed,
    };

    return this.finalizeResult(result);
  }
}
