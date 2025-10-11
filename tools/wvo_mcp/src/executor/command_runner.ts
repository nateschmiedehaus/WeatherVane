import { execa } from "execa";

import type { CommandResult } from "../utils/types.js";

import { ensureCommandSafe } from "./guardrails.js";

export async function runCommand(
  cmd: string,
  options: { cwd: string; env?: Record<string, string>; timeoutMs?: number },
): Promise<CommandResult> {
  ensureCommandSafe(cmd, options.cwd);

  const subprocess = execa("bash", ["-lc", cmd], {
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeoutMs,
    reject: false,
    stdout: "pipe",
    stderr: "pipe",
  });

  const result = await subprocess;
  return {
    code: result.exitCode ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}
