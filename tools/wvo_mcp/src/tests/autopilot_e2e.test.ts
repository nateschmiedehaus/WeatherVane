import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createStubCodex,
  runAutopilotScript,
  seedAutopilotWorkspace,
} from "./helpers/autopilot";

describe("autopilot end-to-end loop", () => {
  it(
    "produces a summary, updates task memos, and records telemetry using stubbed providers",
    async () => {
      const stubSummary = {
        completed_tasks: ["Atlas: autopilot e2e harness"],
        in_progress: ["T6.3.3 – Autopilot loop end-to-end validation"],
        blockers: ["Awaiting manager_self_check critic evidence"],
        next_focus: ["Run manager_self_check critic against autopilot assets"],
        notes: "Stubbed Codex run captured a single-loop autopilot cycle.",
      };

      const { workspace, scriptPath } = seedAutopilotWorkspace({ copyAccountManager: false });
      const binDir = path.join(workspace, "bin");
      createStubCodex(binDir);

      const stateFile = path.join(workspace, "state", "autopilot_summary.json");
      const logFile = path.join(workspace, "autopilot.log");
      const usageLog = path.join(workspace, "state", "telemetry", "usage.jsonl");
      const memoPath = path.join(workspace, "state", "task_memos", "T6.3.3.json");
      const execSummary = JSON.stringify(stubSummary);

      const env = {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
        ENABLE_CLAUDE_EVAL: "0",
        WVO_AUTOPILOT_SKIP_NETWORK_CHECK: "1",
        WVO_AUTOPILOT_SKIP_DNS_CHECK: "1",
        LOG_FILE: logFile,
        STATE_FILE: stateFile,
        MAX_RETRY: "1",
        STOP_ON_BLOCKER: "1",
        SLEEP_SECONDS: "0",
        WVO_CLI_STUB_EXEC_JSON: execSummary,
        WVO_AUTOPILOT_ENTRY: path.join(workspace, "tools", "wvo_mcp", "dist", "index.js"),
        WVO_AUTOPILOT_ONCE: "1",
      };

      const { exitCode, stdout } = await runAutopilotScript(scriptPath, {
        cwd: workspace,
        env,
        timeoutMs: 30_000,
      });

      // Debug logging for test failure inspection
      // eslint-disable-next-line no-console
      console.error("AUTOPILOT_STDOUT", stdout);

      expect(exitCode).toBe(0);
      const parsedStdout = JSON.parse(stdout.trim());
      expect(parsedStdout).toEqual(stubSummary);

      expect(existsSync(stateFile)).toBe(true);
      const savedSummary = JSON.parse(readFileSync(stateFile, "utf8"));
      expect(savedSummary).toEqual(stubSummary);

      expect(existsSync(memoPath)).toBe(true);
      const memo = JSON.parse(readFileSync(memoPath, "utf8"));
      expect(memo.statuses).toContain("in_progress");
      expect(Array.isArray(memo.blockers)).toBe(true);
      expect(memo.label).toBe(stubSummary.in_progress[0]);

      expect(existsSync(usageLog)).toBe(true);
      const usageEntries = readFileSync(usageLog, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      expect(usageEntries.at(-1)?.status).toBe("success");

      const logContents = readFileSync(logFile, "utf8");
      expect(logContents).toContain("Skipping DNS preflight");
      expect(logContents).toContain("Summary saved to");
    },
    40000,
  );
});
