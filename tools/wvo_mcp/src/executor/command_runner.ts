import { execa } from "execa";

import type { CommandResult } from "../utils/types.js";

import { ensureAllowedCommand, ensureCommandSafe } from "./guardrails.js";
import { withSpan } from "../telemetry/tracing.js";

export async function runCommand(
  cmd: string,
  options: { cwd: string; env?: Record<string, string>; timeoutMs?: number },
): Promise<CommandResult> {
  return withSpan("command.run", async (span) => {
    ensureAllowedCommand(cmd);
    ensureCommandSafe(cmd, options.cwd);

    span?.setAttribute("command.text", cmd);
    span?.setAttribute("command.cwd", options.cwd);
    if (options.timeoutMs) {
      span?.setAttribute("command.timeoutMs", options.timeoutMs);
    }

    try {
      const subprocess = execa("bash", ["-lc", cmd], {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs,
        stdout: "pipe",
        stderr: "pipe",
      });

      const result = await subprocess;
      span?.setAttribute("command.exitCode", result.exitCode ?? -1);
      span?.setAttribute("command.succeeded", (result.exitCode ?? 0) === 0);

      return {
        code: result.exitCode ?? -1,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      };
    } catch (error: unknown) {
      span?.recordException(error);
      throw error;
    }
  }, {
    attributes: {
      "command.operation": "bash_execution",
    },
  });
}
