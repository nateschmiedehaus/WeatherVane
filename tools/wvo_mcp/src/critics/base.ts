import path from "node:path";

import { runCommand } from "../executor/command_runner.js";
import { writeFile } from "../executor/file_ops.js";
import { logInfo } from "../telemetry/logger.js";
import { getCurrentGitSha } from "../utils/git.js";
import type { CommandResult } from "../utils/types.js";

export interface CriticResult extends CommandResult {
  critic: string;
  passed: boolean;
  git_sha?: string | null;
  timestamp?: string;
}

export abstract class Critic {
  constructor(protected readonly workspaceRoot: string) {}

  protected abstract command(profile: string): string | null;

  protected async persistResult(result: CriticResult): Promise<void> {
    const target = path.join(
      this.workspaceRoot,
      "state",
      "critics",
      `${result.critic}.json`,
    );
    const payload = JSON.stringify(result, null, 2);
    await writeFile(this.workspaceRoot, path.relative(this.workspaceRoot, target), payload);
  }

  protected async finalizeResult(result: CriticResult): Promise<CriticResult> {
    const enriched: CriticResult = {
      ...result,
      git_sha: result.git_sha ?? (await getCurrentGitSha(this.workspaceRoot)),
      timestamp: result.timestamp ?? new Date().toISOString(),
    };
    await this.persistResult(enriched);
    return enriched;
  }

  async run(profile: string): Promise<CriticResult> {
    const cmd = this.command(profile);
    if (!cmd) {
      const noopResult: CriticResult = {
        critic: this.constructor.name.replace("Critic", "").toLowerCase(),
        code: 0,
        stdout: "skipped due to capability profile",
        stderr: "",
        passed: true,
      };
      return this.finalizeResult(noopResult);
    }

    logInfo(`Running critic command`, { critic: this.constructor.name, cmd });
    const result = await runCommand(cmd, { cwd: this.workspaceRoot });
    const criticResult: CriticResult = {
      critic: this.constructor.name.replace("Critic", "").toLowerCase(),
      ...result,
      passed: result.code === 0,
    };
    return this.finalizeResult(criticResult);
  }
}
