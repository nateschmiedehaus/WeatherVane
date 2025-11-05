import { execaCommand } from "execa";

import type { CommandResult } from "../utils/types.js";
import { logInfo, logWarning } from "../telemetry/logger.js";

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  input?: string | Buffer;
  logCommand?: boolean;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function normalizeResult(code: number, stdout: string, stderr: string): CommandResult {
  return {
    code,
    stdout,
    stderr,
  };
}

export async function runCommand(
  command: string,
  options: RunCommandOptions = {},
): Promise<CommandResult> {
  const {
    cwd,
    env,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    input,
    logCommand = true,
  } = options;

  if (logCommand) {
    logInfo("Executing command", { command, cwd });
  }

  try {
    const subprocess = await execaCommand(command, {
      cwd,
      env,
      input,
      timeout: timeoutMs,
      reject: false,
      stdout: "pipe",
      stderr: "pipe",
    });

    return normalizeResult(subprocess.exitCode ?? 0, subprocess.stdout ?? "", subprocess.stderr ?? "");
  } catch (error) {
    if (error instanceof Error && "exitCode" in error) {
      const exitCode = (error as any).exitCode ?? -1;
      const stdout = (error as any).stdout ?? "";
      const stderr = (error as any).stderr ?? error.message ?? "";

      logWarning("Command execution failed", {
        command,
        cwd,
        exitCode,
        stderr: typeof stderr === "string" ? stderr.slice(0, 500) : stderr,
      });

      return normalizeResult(exitCode, stdout, typeof stderr === "string" ? stderr : String(stderr));
    }

    throw error;
  }
}

export default runCommand;
