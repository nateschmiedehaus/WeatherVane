#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const MAX_SUSTAINED_FAILOVER_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CLAUDE_UNAVAILABLE_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CODEX_SHARE = 0.5; // 50% of the observed window
const MAX_DATA_STALENESS_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_LOOKBACK_LINES = 400;

/**
 * @typedef {Object} FailoverSample
 * @property {number} timestamp Timestamp in milliseconds since epoch.
 * @property {"claude_code" | "codex"} type Coordinator agent type.
 * @property {boolean} available Whether the coordinator reports available.
 * @property {string | undefined} reason Normalised reason for the coordinator state.
 */

/**
 * Convert a millisecond duration into a human readable string.
 * @param {number} ms
 * @returns {string}
 */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return "0s";
  }
  const seconds = Math.floor(ms / 1000);
  const parts = [];
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  if (remainingSeconds > 0 || parts.length === 0) {
    parts.push(`${remainingSeconds}s`);
  }
  return parts.join(" ");
}

/**
 * Parse operations telemetry lines into failover samples sorted by timestamp.
 * @param {string[]} lines
 * @returns {FailoverSample[]}
 */
export function parseOperationsLines(lines) {
  const samples = [];
  for (const line of lines) {
    if (!line || !line.trim()) {
      continue;
    }
    try {
      const record = JSON.parse(line);
      const timestampIso = typeof record.timestamp === "string" ? record.timestamp : null;
      const timestamp = timestampIso ? Date.parse(timestampIso) : Number.NaN;
      const coordinatorType = record.coordinator?.type ?? record.coordinatorType;
      const coordinatorAvailable =
        typeof record.coordinator?.available === "boolean"
          ? record.coordinator.available
          : record.coordinatorAvailable;
      const coordinatorReason = record.coordinator?.reason ?? record.coordinatorReason;

      if (
        !Number.isFinite(timestamp) ||
        (coordinatorType !== "claude_code" && coordinatorType !== "codex")
      ) {
        continue;
      }

      samples.push({
        timestamp,
        type: coordinatorType,
        available: typeof coordinatorAvailable === "boolean" ? coordinatorAvailable : true,
        reason: typeof coordinatorReason === "string" ? coordinatorReason : undefined,
      });
    } catch (error) {
      // Ignore malformed telemetry lines but continue parsing newer entries.
      console.warn(
        `Skipped invalid telemetry line (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }
  samples.sort((a, b) => a.timestamp - b.timestamp);
  return samples;
}

/**
 * Compute failover metrics from operations samples.
 * @param {FailoverSample[]} samples
 * @param {number} [now]
 */
export function analyzeFailoverSamples(samples, now = Date.now()) {
  if (!samples.length) {
    return {
      samples,
      totalMs: 0,
      codexMs: 0,
      claudeUnavailableMs: 0,
      codexShare: 0,
      longestCodexRunMs: 0,
      lastSampleAgeMs: Number.POSITIVE_INFINITY,
    };
  }

  let totalMs = 0;
  let codexMs = 0;
  let claudeUnavailableMs = 0;
  let longestCodexRunMs = 0;
  let currentCodexRunMs = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const nextTimestamp =
      index < samples.length - 1 ? samples[index + 1].timestamp : Math.max(now, current.timestamp);
    const duration = Math.max(0, nextTimestamp - current.timestamp);
    totalMs += duration;

    if (current.type === "codex") {
      codexMs += duration;
      currentCodexRunMs += duration;
    } else {
      if (currentCodexRunMs > longestCodexRunMs) {
        longestCodexRunMs = currentCodexRunMs;
      }
      currentCodexRunMs = 0;
    }

    if (!current.available) {
      claudeUnavailableMs += duration;
    }
  }

  if (currentCodexRunMs > longestCodexRunMs) {
    longestCodexRunMs = currentCodexRunMs;
  }

  const lastSampleAgeMs = Math.max(0, now - samples[samples.length - 1].timestamp);
  const codexShare = totalMs > 0 ? codexMs / totalMs : 0;

  return {
    samples,
    totalMs,
    codexMs,
    claudeUnavailableMs,
    codexShare,
    longestCodexRunMs,
    lastSampleAgeMs,
  };
}

/**
 * Evaluate failover metrics against guardrail thresholds.
 * @param {ReturnType<typeof analyzeFailoverSamples>} analysis
 */
export function evaluateFailoverGuardrail(analysis) {
  if (!analysis.samples.length) {
    return {
      ok: false,
      messages: ["No operations telemetry entries found; cannot monitor coordinator failover."],
      analysis,
    };
  }

  const messages = [];
  let ok = true;

  if (analysis.lastSampleAgeMs > MAX_DATA_STALENESS_MS) {
    ok = false;
    messages.push(
      `Operations telemetry stale (${formatDuration(analysis.lastSampleAgeMs)} since last snapshot; limit ${formatDuration(MAX_DATA_STALENESS_MS)}).`,
    );
  }

  if (analysis.codexShare > MAX_CODEX_SHARE) {
    ok = false;
    messages.push(
      `Codex handling ${(analysis.codexShare * 100).toFixed(
        1,
      )}% of work (limit ${(MAX_CODEX_SHARE * 100).toFixed(0)}%).`,
    );
  }

  if (analysis.longestCodexRunMs > MAX_SUSTAINED_FAILOVER_MS) {
    ok = false;
    messages.push(
      `Codex has been coordinator for ${formatDuration(
        analysis.longestCodexRunMs,
      )} (limit ${formatDuration(MAX_SUSTAINED_FAILOVER_MS)}).`,
    );
  }

  if (analysis.claudeUnavailableMs > MAX_CLAUDE_UNAVAILABLE_MS) {
    ok = false;
    messages.push(
      `Claude reported unavailable for ${formatDuration(
        analysis.claudeUnavailableMs,
      )} over observed window (limit ${formatDuration(MAX_CLAUDE_UNAVAILABLE_MS)}).`,
    );
  }

  return { ok, messages, analysis };
}

async function readLastLines(filePath, maxLines) {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= maxLines) {
    return lines;
  }
  return lines.slice(-maxLines);
}

/**
 * Run the guardrail check for the provided workspace.
 * @param {string} workspaceRoot
 * @param {{ now?: number, maxLines?: number } | undefined} options
 */
export async function runGuardrailCheck(workspaceRoot, options = undefined) {
  const now = options?.now ?? Date.now();
  const maxLines = options?.maxLines ?? DEFAULT_LOOKBACK_LINES;
  const operationsPath = path.join(
    workspaceRoot,
    "state",
    "telemetry",
    "operations.jsonl",
  );

  let lines;
  try {
    lines = await readLastLines(operationsPath, maxLines);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        ok: false,
        messages: [
          "Missing operations telemetry at state/telemetry/operations.jsonl; build and start the orchestrator to emit snapshots.",
        ],
        analysis: analyzeFailoverSamples([]),
      };
    }
    throw error;
  }

  const samples = parseOperationsLines(lines);
  const analysis = analyzeFailoverSamples(samples, now);
  return evaluateFailoverGuardrail(analysis);
}

async function main() {
  const workspaceRoot = path.resolve(
    process.argv[2] ?? path.join(process.cwd(), "..", ".."),
  );

  try {
    const result = await runGuardrailCheck(workspaceRoot);
    if (!result.ok) {
      console.error("❌ Coordinator failover guardrail breach detected.");
      for (const message of result.messages) {
        console.error(`- ${message}`);
      }
      const { analysis } = result;
      if (analysis.samples.length > 0) {
        console.error(
          `  Observed window: ${formatDuration(
            analysis.totalMs,
          )}, Codex share ${(analysis.codexShare * 100).toFixed(1)}%, longest Codex run ${formatDuration(
            analysis.longestCodexRunMs,
          )}, Claude unavailable ${formatDuration(analysis.claudeUnavailableMs)}.`,
        );
      }
      process.exit(1);
    }

    const { analysis } = result;
    const errorBudgetMinutes = Math.max(
      0,
      (MAX_SUSTAINED_FAILOVER_MS - analysis.longestCodexRunMs) / (60 * 1000),
    );

    console.log(
      [
        "✅ Coordinator failover guardrail within SLO.",
        `Codex share ${(analysis.codexShare * 100).toFixed(1)}%.`,
        `Longest Codex run ${formatDuration(analysis.longestCodexRunMs)}.`,
        `Claude unavailable ${formatDuration(analysis.claudeUnavailableMs)}.`,
        `Error budget remaining: ${errorBudgetMinutes.toFixed(1)} min.`,
      ].join(" "),
    );
  } catch (error) {
    console.error(
      `Failed to evaluate coordinator failover guardrail: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}

const executedDirectly = (() => {
  try {
    return process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (executedDirectly) {
  await main();
}
