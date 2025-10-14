import fs from "node:fs";
import path from "node:path";

import type { ResearchManager } from "../intelligence/research_manager.js";
import { runCommand } from "../executor/command_runner.js";
import { writeFile } from "../executor/file_ops.js";
import { logInfo } from "../telemetry/logger.js";
import { getCurrentGitSha } from "../utils/git.js";
import type { CommandResult } from "../utils/types.js";
import type { StateMachine } from "../orchestrator/state_machine.js";
import { CriticIntelligenceEngine, type CriticAnalysis } from "./intelligence_engine.js";

export interface CriticResult extends CommandResult {
  critic: string;
  passed: boolean;
  git_sha?: string | null;
  timestamp?: string;
  analysis?: CriticAnalysis | null;
}

export interface CriticOptions {
  intelligenceEnabled?: boolean;
  intelligenceLevel?: number;
  researchManager?: ResearchManager;
  stateMachine?: StateMachine;
  escalationConfigPath?: string;
  escalationLogPath?: string;
}

export abstract class Critic {
  private readonly intelligence?: CriticIntelligenceEngine;
  private readonly escalationConfig: Record<string, CriticEscalationConfig>;
  private readonly escalationLogPath?: string;

  constructor(
    protected readonly workspaceRoot: string,
    protected readonly options: CriticOptions = {},
  ) {
    if (options.intelligenceEnabled) {
      this.intelligence = new CriticIntelligenceEngine({
        workspaceRoot,
        critic: this.constructor.name.replace("Critic", "").toLowerCase(),
        intelligenceLevel: options.intelligenceLevel,
        researchManager: options.researchManager,
        stateMachine: options.stateMachine,
      });
    }
    this.escalationConfig = this.loadEscalationConfig(options.escalationConfigPath);
    this.escalationLogPath = options.escalationLogPath;
  }

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
        passed: false,
        analysis: null,
      };
      await this.handleEscalation(noopResult);
      return this.finalizeResult(noopResult);
    }

    logInfo(`Running critic command`, { critic: this.constructor.name, cmd });
    const result = await runCommand(cmd, { cwd: this.workspaceRoot });
    const criticResult: CriticResult = {
      critic: this.constructor.name.replace("Critic", "").toLowerCase(),
      ...result,
      passed: result.code === 0,
      analysis: null,
    };

    if (this.intelligence) {
      if (criticResult.passed) {
        await this.intelligence.recordSuccess();
      } else {
        const analysis = await this.intelligence.analyzeFailure(result.stderr ?? "");
        criticResult.analysis = analysis;
      }
    }

    await this.handleEscalation(criticResult);
    return this.finalizeResult(criticResult);
  }

  private loadEscalationConfig(configPath?: string): Record<string, CriticEscalationConfig> {
    if (!configPath) {
      return {};
    }
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, CriticEscalationConfig>;
      return parsed ?? {};
    } catch (error) {
      logInfo("Failed to load critic escalation config", {
        path: configPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private appendEscalationLog(record: CriticEscalationLogRecord): void {
    if (!this.escalationLogPath) return;
    try {
      fs.mkdirSync(path.dirname(this.escalationLogPath), { recursive: true });
      fs.appendFileSync(this.escalationLogPath, `${JSON.stringify(record)}\\n`, "utf-8");
    } catch (error) {
      logInfo("Failed to record critic escalation log", {
        path: this.escalationLogPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleEscalation(result: CriticResult): Promise<void> {
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    const skip =
      stdout.toLowerCase().includes("skipped due to capability profile") ||
      stderr.toLowerCase().includes("skipped due to capability profile");
    const needsEscalation = !result.passed || skip;
    const info = this.escalationConfig[result.critic];

    if (!needsEscalation) {
      if (info) {
        this.appendEscalationLog({
          timestamp: new Date().toISOString(),
          critic: result.critic,
          reviewer: info.reviewer,
          status: "cleared",
          message: `Critic ${result.critic} cleared.`,
        });
      }
      return;
    }

    const message =
      info?.note ??
      `Critic ${result.critic} requires manual review${info?.reviewer ? ` by ${info.reviewer}` : ""}.`;

    this.appendEscalationLog({
      timestamp: new Date().toISOString(),
      critic: result.critic,
      reviewer: info?.reviewer,
      status: "escalate",
      message,
    });

    if (this.options.stateMachine) {
      try {
        this.options.stateMachine.addContextEntry({
          entry_type: "decision",
          topic: `Critic escalation: ${result.critic}`,
          content: message,
          related_tasks: [],
          metadata: {
            reviewer: info?.reviewer,
            stdout,
            stderr,
          },
        });
      } catch (error) {
        logInfo("Failed to record critic escalation context", {
          critic: result.critic,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }


}


interface CriticEscalationConfig {
  reviewer?: string;
  note?: string;
  next?: string;
}

interface CriticEscalationLogRecord {
  timestamp: string;
  critic: string;
  reviewer?: string;
  status: "escalate" | "cleared";
  message: string;
}
