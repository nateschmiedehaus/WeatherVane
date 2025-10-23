import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { ResearchManager } from "../intelligence/research_manager.js";
import { runCommand } from "../executor/command_runner.js";
import { writeFile } from "../executor/file_ops.js";
import { logInfo, logWarning } from "../telemetry/logger.js";
import { getCurrentGitSha } from "../utils/git.js";
import { withSpan } from "../telemetry/tracing.js";
import type { CommandResult } from "../utils/types.js";
import type { StateMachine, Task, TaskStatus } from "../orchestrator/state_machine.js";
import { resolveStateRoot } from "../utils/config.js";
import { CriticIntelligenceEngine, type CriticAnalysis } from "./intelligence_engine.js";

export interface CriticIdentityProfile {
  title: string;
  mission: string;
  powers: string[];
  authority: string;
  domain: string;
  autonomy_guidance?: string;
  preferred_delegates?: string[];
}

export interface CriticResult extends CommandResult {
  critic: string;
  passed: boolean;
  git_sha?: string | null;
  timestamp?: string;
  analysis?: CriticAnalysis | null;
  identity?: CriticIdentityProfile | null;
}

export interface CriticOptions {
  intelligenceEnabled?: boolean;
  intelligenceLevel?: number;
  researchManager?: ResearchManager;
  stateMachine?: StateMachine;
  escalationConfigPath?: string;
  escalationLogPath?: string;
  identityConfigPath?: string;
  defaultIdentity?: CriticIdentityProfile;
}

const OUTPUT_SNIPPET_LENGTH = 800;
const ACTIVE_FOLLOW_UP_STATUSES: TaskStatus[] = [
  "pending",
  "in_progress",
  "needs_review",
  "needs_improvement",
  "blocked",
];

export abstract class Critic {
  private readonly intelligence?: CriticIntelligenceEngine;
  private readonly escalationConfig: Record<string, CriticEscalationConfig>;
  private readonly escalationLogPath?: string;
  private readonly identityProfile?: CriticIdentityProfile;
  protected readonly stateRoot: string;

  constructor(
    protected readonly workspaceRoot: string,
    protected readonly options: CriticOptions = {},
  ) {
    this.stateRoot = resolveStateRoot(workspaceRoot);
    if (options.intelligenceEnabled) {
      this.intelligence = new CriticIntelligenceEngine({
        workspaceRoot,
        critic: this.getCriticKey(),
        intelligenceLevel: options.intelligenceLevel,
        researchManager: options.researchManager,
        stateMachine: options.stateMachine,
      });
    }
    this.escalationConfig = this.loadEscalationConfig(options.escalationConfigPath);
    this.escalationLogPath = options.escalationLogPath;
    this.identityProfile = this.loadIdentityProfile(
      this.getCriticKey(),
      options.identityConfigPath,
      options.defaultIdentity,
    );
  }

  protected getCriticKey(): string {
    return this.constructor.name.replace("Critic", "").toLowerCase();
  }

  protected abstract command(profile: string): string | null;

  protected async pass(message: string, details?: unknown): Promise<CriticResult> {
    const stdout = this.composeDetailOutput(message, details);
    const result: CriticResult = {
      critic: this.getCriticKey(),
      code: 0,
      stdout,
      stderr: "",
      passed: true,
      analysis: null,
    };
    const finalResult = await this.finalizeResult(result);
    await this.handleEscalation(finalResult);
    return finalResult;
  }

  protected async fail(message: string, details?: unknown): Promise<CriticResult> {
    const stderr = this.composeDetailOutput(message, details);
    const result: CriticResult = {
      critic: this.getCriticKey(),
      code: 1,
      stdout: "",
      stderr,
      passed: false,
      analysis: null,
    };
    const finalResult = await this.finalizeResult(result);
    await this.handleEscalation(finalResult);
    return finalResult;
  }

  private composeDetailOutput(message: string, details?: unknown): string {
    const detail = this.stringifyDetails(details);
    if (detail) {
      return `${message}\n${detail}`.trim();
    }
    return message.trim();
  }

  private stringifyDetails(details?: unknown): string {
    if (!details) return "";
    if (typeof details === "string") return details;
    if (Array.isArray(details)) {
      return details
        .map((entry) => (typeof entry === "string" ? entry : JSON.stringify(entry, null, 2)))
        .join("\n");
    }
    try {
      return JSON.stringify(details, null, 2);
    } catch (error) {
      return String(details);
    }
  }

  protected async persistResult(result: CriticResult): Promise<void> {
    const target = path.join(
      this.stateRoot,
      "critics",
      `${result.critic}.json`,
    );
    const payload = JSON.stringify(result, null, 2);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, payload, "utf8");
  }

  protected async finalizeResult(result: CriticResult): Promise<CriticResult> {
    const enriched: CriticResult = {
      ...result,
      git_sha: result.git_sha ?? (await getCurrentGitSha(this.workspaceRoot)),
      timestamp: result.timestamp ?? new Date().toISOString(),
      identity: this.identityProfile ?? null,
    };

    if (this.options.stateMachine) {
      try {
        const failureOutput =
          typeof enriched.stderr === "string" && enriched.stderr.trim().length > 0
            ? enriched.stderr
            : typeof enriched.stdout === "string"
              ? enriched.stdout
              : "";
        this.options.stateMachine.recordCriticHistory({
          critic: enriched.critic,
          category: enriched.passed ? "runtime_success" : "runtime_failure",
          passed: enriched.passed,
          stderr_sample: enriched.passed ? undefined : this.safeSnippet(failureOutput),
          created_at: Date.now(),
          metadata: {
            origin: "critic_runtime",
            git_sha: enriched.git_sha ?? null,
            identity: this.identityProfile ? { ...this.identityProfile } : undefined,
          },
        });
      } catch (error) {
        logInfo("Failed to record critic runtime history", {
          critic: enriched.critic,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.persistResult(enriched);
    return enriched;
  }

  async run(profile: string): Promise<CriticResult> {
    return withSpan("critic.run", async (span) => {
      const criticKey = this.getCriticKey();
      span?.setAttribute("critic.name", criticKey);
      span?.setAttribute("critic.profile", profile);

      const cmd = this.command(profile);
      if (!cmd) {
        span?.addEvent("critic.skipped", { reason: "no_command_for_profile" });
        const noopResult: CriticResult = {
          critic: criticKey,
          code: 0,
          stdout: "skipped due to capability profile",
          stderr: "",
          passed: false,
          analysis: null,
        };
        const finalResult = await this.finalizeResult(noopResult);
        await this.handleEscalation(finalResult);
        return finalResult;
      }

      logInfo(`Running critic command`, { critic: this.constructor.name, cmd });
      let criticResult: CriticResult;
      try {
        const result = await runCommand(cmd, { cwd: this.workspaceRoot });
        criticResult = {
          critic: criticKey,
          ...result,
          passed: result.code === 0,
          analysis: null,
        };
        span?.setAttribute("critic.exitCode", result.code);
        span?.setAttribute("critic.passed", result.code === 0);
      } catch (error: any) {
        criticResult = {
          critic: criticKey,
          code: error.exitCode ?? -1,
          stdout: error.stdout ?? "",
          stderr: error.stderr ?? error.message,
          passed: false,
          analysis: null,
        };
        span?.recordException(error);
        span?.setAttribute("critic.exitCode", error.exitCode ?? -1);
        span?.setAttribute("critic.passed", false);
      }

      if (this.intelligence) {
        if (criticResult.passed) {
          await this.intelligence.recordSuccess();
          span?.addEvent("critic.intelligence.success_recorded");
        } else {
          const analysis = await this.intelligence.analyzeFailure(criticResult.stderr ?? "");
          criticResult.analysis = analysis;
          span?.addEvent("critic.intelligence.failure_analyzed", {
            analysisAvailable: !!analysis,
          });
        }
      }

      const finalResult = await this.finalizeResult(criticResult);
      await this.handleEscalation(finalResult);
      return finalResult;
    }, {
      attributes: {
        "critic.operation": "execution",
      },
    });
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

  private static identityCache = new Map<string, Record<string, CriticIdentityProfile>>();

  private loadIdentityProfile(
    criticKey: string,
    configPath?: string,
    fallback?: CriticIdentityProfile,
  ): CriticIdentityProfile | undefined {
    if (!configPath) {
      return fallback;
    }

    try {
      let cache = Critic.identityCache.get(configPath);
      if (!cache) {
        const raw = fs.readFileSync(configPath, "utf-8");
        cache = JSON.parse(raw) as Record<string, CriticIdentityProfile>;
        Critic.identityCache.set(configPath, cache);
      }
      const profile = cache?.[criticKey];
      if (profile) {
        return profile;
      }
    } catch (error) {
      logInfo("Failed to load critic identity profile", {
        critic: criticKey,
        path: configPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return fallback;
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
    const delegateAgents = info?.delegates?.map((delegate) => delegate.agent) ?? [];
    const identity = this.identityProfile;

    if (!needsEscalation) {
      if (info) {
        const resolvedTasks =
          info.delegates && info.delegates.length > 0
            ? await this.resolveDelegatedTasks(result, info.delegates)
            : [];
        this.appendEscalationLog({
          timestamp: new Date().toISOString(),
          critic: result.critic,
          reviewer: info.reviewer,
          status: "cleared",
          message: identity
            ? `${identity.title} (${result.critic}) cleared all findings.`
            : `Critic ${result.critic} cleared.`,
          delegates: delegateAgents.length ? delegateAgents : undefined,
          tasks: resolvedTasks.length ? resolvedTasks : undefined,
          identity: identity ? { ...identity } : undefined,
        });
      }
      return;
    }

    const message =
      info?.note ??
      (identity
        ? `${identity.title} (${result.critic}) requests manual review${info?.reviewer ? ` by ${info.reviewer}` : ""}.`
        : `Critic ${result.critic} requires manual review${info?.reviewer ? ` by ${info.reviewer}` : ""}.`);
    const narrative = this.composeEscalationContent(message, info?.next);

    const delegatedTaskIds =
      info?.delegates?.length && this.options.stateMachine
        ? await this.coordinateDelegates(result, info, narrative, stdout, stderr)
        : [];

    this.appendEscalationLog({
      timestamp: new Date().toISOString(),
      critic: result.critic,
      reviewer: info?.reviewer,
          status: "escalate",
          message,
          delegates: delegateAgents.length ? delegateAgents : undefined,
          tasks: delegatedTaskIds.length ? delegatedTaskIds : undefined,
          identity: identity ? { ...identity } : undefined,
        });

    if (this.options.stateMachine) {
      try {
        this.options.stateMachine.addContextEntry({
          entry_type: "decision",
          topic: `Critic escalation: ${result.critic}`,
          content: narrative,
          related_tasks: delegatedTaskIds,
          metadata: {
            reviewer: info?.reviewer,
            stdout: this.safeSnippet(stdout),
            stderr: this.safeSnippet(stderr),
            critic: result.critic,
            git_sha: result.git_sha ?? null,
            delegate_tasks: delegatedTaskIds,
            delegate_agents: delegateAgents,
            skip_reason: skip ? "capability_profile" : undefined,
            identity: identity ? { ...identity } : undefined,
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

  private composeEscalationContent(message: string, next?: string): string {
    const sections = [message];
    if (next && next.trim().length > 0) {
      sections.push(`Next: ${next.trim()}`);
    }
    return sections.join("\n\n");
  }

  private async coordinateDelegates(
    result: CriticResult,
    info: CriticEscalationConfig,
    narrative: string,
    stdout: string,
    stderr: string,
  ): Promise<string[]> {
    const stateMachine = this.options.stateMachine;
    if (!stateMachine || !info.delegates || info.delegates.length === 0) {
      return [];
    }

    const taskIds: string[] = [];
    for (const delegate of info.delegates) {
      const delegateKey = this.buildDelegateKey(result.critic, delegate);
      const existing = this.findCriticTasks(result.critic, delegateKey);

      if (existing.length > 0) {
        const task = existing[0];
        taskIds.push(task.id);
        await this.recordDelegateObservation({
          action: "update",
          task,
          result,
          delegate,
          narrative,
          stdout,
          stderr,
        });
        continue;
      }

      if (delegate.createTask === false) {
        await this.recordDelegateObservation({
          action: "signal",
          task: undefined,
          result,
          delegate,
          narrative,
          stdout,
          stderr,
        });
        continue;
      }

      const createdId = await this.createDelegateTask({
        result,
        delegate,
        narrative,
        stdout,
        stderr,
      });
      if (createdId) {
        taskIds.push(createdId);
      }
    }

    return taskIds;
  }

  private async resolveDelegatedTasks(
    result: CriticResult,
    delegates: CriticDelegateConfig[],
  ): Promise<string[]> {
    const stateMachine = this.options.stateMachine;
    if (!stateMachine) return [];

    const resolved: string[] = [];
    for (const delegate of delegates) {
      const delegateKey = this.buildDelegateKey(result.critic, delegate);
      const tasks = this.findCriticTasks(result.critic, delegateKey);
      for (const task of tasks) {
        if (task.status === "done") {
          continue;
        }
        try {
          await stateMachine.transition(
            task.id,
            "done",
            {
              resolved_by: result.critic,
              resolved_at: new Date().toISOString(),
              resolution_git_sha: result.git_sha ?? null,
            },
            `critic:${result.critic}:resolved`,
          );
          resolved.push(task.id);
          await this.recordDelegateObservation({
            action: "resolve",
            task,
            result,
            delegate,
            narrative: `Critic ${result.critic} cleared.`,
            stdout: "",
            stderr: "",
          });
        } catch (error) {
          logWarning("Failed to resolve critic follow-up task", {
            critic: result.critic,
            taskId: task.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    return resolved;
  }

  private findCriticTasks(criticKey: string, delegateKey?: string): Task[] {
    if (!this.options.stateMachine) return [];
    const candidates = this.options.stateMachine.getTasks({
      status: ACTIVE_FOLLOW_UP_STATUSES,
    });
    return candidates.filter((task) => {
      const metadata = (task.metadata ?? {}) as Record<string, unknown>;
      if (metadata.source !== "critic") return false;
      if (metadata.critic !== criticKey) return false;
      if (delegateKey && metadata.delegate_key !== delegateKey) return false;
      return true;
    });
  }

  private async createDelegateTask(params: {
    result: CriticResult;
    delegate: CriticDelegateConfig;
    narrative: string;
    stdout: string;
    stderr: string;
  }): Promise<string | null> {
    const stateMachine = this.options.stateMachine;
    if (!stateMachine) return null;

    const { result, delegate, narrative, stdout, stderr } = params;
    const delegateKey = this.buildDelegateKey(result.critic, delegate);
    const description = this.buildTaskDescription({
      narrative,
      delegate,
      stdout,
      stderr,
    });

    const taskId = this.generateTaskId(result.critic);
    try {
      const task = stateMachine.createTask(
        {
          id: taskId,
          title: delegate.taskTitle ?? this.defaultTaskTitle(result.critic, delegate.agent),
          description,
          type: delegate.taskType ?? "task",
          status: "pending",
          assigned_to: delegate.agent,
          metadata: {
            source: "critic",
            critic: result.critic,
            delegate_key: delegateKey,
            delegate_agent: delegate.agent,
            delegate_scope: delegate.scope ?? "local",
            call_agents: delegate.callAgents ?? [],
            escalate_to: delegate.escalateTo,
            git_sha: result.git_sha ?? null,
            task_message: delegate.taskDescription ?? null,
            stdout_digest: this.safeSnippet(stdout),
            stderr_digest: this.safeSnippet(stderr),
            created_at: new Date().toISOString(),
            identity: this.identityProfile ? { ...this.identityProfile } : undefined,
          },
        },
        `critic:${result.critic}:delegate`,
      );

      await this.recordDelegateObservation({
        action: "create",
        task,
        result,
        delegate,
        narrative,
        stdout,
        stderr,
      });

      return task.id;
    } catch (error) {
      logWarning("Failed to create critic follow-up task", {
        critic: result.critic,
        delegate: delegate.agent,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async recordDelegateObservation(params: {
    action: "create" | "update" | "signal" | "resolve";
    task: Task | undefined;
    result: CriticResult;
    delegate: CriticDelegateConfig;
    narrative: string;
    stdout: string;
    stderr: string;
  }): Promise<void> {
    const stateMachine = this.options.stateMachine;
    if (!stateMachine) return;

    try {
      const { action, task, result, delegate, narrative, stdout, stderr } = params;
      const segments = [narrative];
      if (delegate.taskDescription) {
        segments.push(delegate.taskDescription);
      }
      if (task) {
        segments.push(`Follow-up task: ${task.id}`);
      }

      stateMachine.addContextEntry({
        entry_type: "decision",
        topic: `Critic ${result.critic} escalation (${delegate.agent})`,
        content: segments.join("\n\n"),
        related_tasks: task ? [task.id] : [],
        metadata: {
          critic: result.critic,
          delegate_agent: delegate.agent,
          delegate_scope: delegate.scope ?? "local",
          action,
          git_sha: result.git_sha ?? null,
          call_agents: delegate.callAgents ?? [],
          escalate_to: delegate.escalateTo,
          stdout: this.safeSnippet(stdout),
          stderr: this.safeSnippet(stderr),
          identity: this.identityProfile ? { ...this.identityProfile } : undefined,
        },
      });
    } catch (error) {
      logWarning("Failed to record critic delegation context", {
        critic: params.result.critic,
        delegate: params.delegate.agent,
        action: params.action,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private generateTaskId(criticKey: string): string {
    return `CRIT-${criticKey.toUpperCase()}-${randomUUID().slice(0, 8)}`;
  }

  private buildDelegateKey(criticKey: string, delegate: CriticDelegateConfig): string {
    const normalizedAgent = delegate.agent.trim().toLowerCase().replace(/\s+/g, "_");
    const scope = (delegate.scope ?? "local").toLowerCase();
    return `${criticKey}:${normalizedAgent}:${scope}`;
  }

  private defaultTaskTitle(criticKey: string, agent: string): string {
    return `[Critic:${criticKey}] Follow-up for ${agent}`;
  }

  private buildTaskDescription(params: {
    narrative: string;
    delegate: CriticDelegateConfig;
    stdout: string;
    stderr: string;
  }): string {
    const sections = [params.narrative];
    if (params.delegate.taskDescription) {
      sections.push(params.delegate.taskDescription);
    }
    if (this.identityProfile) {
      const identity = this.identityProfile;
      const summaryParts = [
        `${identity.title} – ${identity.mission}`,
        `Authority: ${identity.authority}`,
        `Domain: ${identity.domain}`,
      ];
      if (identity.preferred_delegates?.length) {
        summaryParts.push(`Preferred delegates: ${identity.preferred_delegates.join(", ")}`);
      }
      if (identity.autonomy_guidance) {
        summaryParts.push(`Autonomy guidance: ${identity.autonomy_guidance}`);
      }
      sections.unshift(summaryParts.join("\n"));
      if (identity.powers?.length) {
        sections.push(`Signature powers:\n- ${identity.powers.join("\n- ")}`);
      }
    }
    const stdoutSnippet = this.safeSnippet(params.stdout);
    if (stdoutSnippet) {
      sections.push(`stdout snippet:\n${stdoutSnippet}`);
    }
    const stderrSnippet = this.safeSnippet(params.stderr);
    if (stderrSnippet) {
      sections.push(`stderr snippet:\n${stderrSnippet}`);
    }
    return sections.join("\n\n");
  }

  private safeSnippet(text: string | undefined, limit = OUTPUT_SNIPPET_LENGTH): string | undefined {
    if (!text) return undefined;
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    if (trimmed.length <= limit) return trimmed;
    return `${trimmed.slice(0, limit - 3)}...`;
  }
}


interface CriticEscalationConfig {
  reviewer?: string;
  note?: string;
  next?: string;
  delegates?: CriticDelegateConfig[];
}

interface CriticEscalationLogRecord {
  timestamp: string;
  critic: string;
  reviewer?: string;
  status: "escalate" | "cleared";
  message: string;
  delegates?: string[];
  tasks?: string[];
  identity?: CriticIdentityProfile;
}

interface CriticDelegateConfig {
  agent: string;
  scope?: "local" | "global" | "systemic";
  createTask?: boolean;
  callAgents?: string[];
  escalateTo?: string;
  taskTitle?: string;
  taskDescription?: string;
  taskType?: Task["type"];
}
