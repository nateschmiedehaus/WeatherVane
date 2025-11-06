import { execa } from "execa";

import { withSpan } from "../telemetry/tracing.js";
import type { CommandResult } from "../utils/types.js";
import type { LiveFlagsReader } from "../state/live_flags.js";
import { ensureAllowedCommand, ensureCommandSafe } from "./guardrails.js";

export interface RunCommandOptions {
  cwd?: string;
  workspaceRoot?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  liveFlags?: LiveFlagsReader;
}

export async function runCommand(cmd: string, options: RunCommandOptions = {}): Promise<CommandResult> {
  return withSpan(
    "command.run",
    async (span) => {
      const cwd = options.cwd ?? process.cwd();
      const workspaceRoot = options.workspaceRoot ?? cwd;

      ensureAllowedCommand(cmd, options.liveFlags);
      ensureCommandSafe(cmd, workspaceRoot);

      span?.setAttribute("command.text", cmd);
      span?.setAttribute("command.cwd", cwd);
      if (options.timeoutMs) {
        span?.setAttribute("command.timeout_ms", options.timeoutMs);
      }

      try {
        const subprocess = execa("bash", ["-lc", cmd], {
          cwd,
          env: options.env,
          timeout: options.timeoutMs,
          stdout: "pipe",
          stderr: "pipe",
        });

        const result = await subprocess;
        const exitCode = result.exitCode ?? 0;
        span?.setAttribute("command.exit_code", exitCode);
        span?.setAttribute("command.succeeded", exitCode === 0);

        return {
          code: exitCode,
          stdout: result.stdout ?? "",
          stderr: result.stderr ?? "",
        };
      } catch (error) {
        span?.recordException(error as Error);
        const execError = error as {
          exitCode?: number;
          stdout?: string;
          stderr?: string;
        };

        if (typeof execError.exitCode === "number") {
          span?.setAttribute("command.exit_code", execError.exitCode);
        }
        span?.setAttribute("command.succeeded", false);

        throw error;
      }
    },
    {
      attributes: {
        "command.operation": "bash_execution",
      },
    },
  );
}
