import { randomUUID } from "node:crypto";

import { describeCodexCommands } from "../executor/codex_commands.js";
import { SessionContext } from "../session.js";
import type { OrchestratorRuntime } from "../orchestrator/orchestrator_runtime.js";
import type { OperationsSnapshot } from "../orchestrator/operations_manager.js";
import type { StateMachine } from "../orchestrator/state_machine.js";
import {
  artifactRecordInput,
  authStatusInput,
  autopilotAuditInput,
  cmdRunInput,
  contextSnapshotInput,
  contextWriteInput,
  criticsRunInput,
  fsReadInput,
  fsWriteInput,
  heavyQueueEnqueueInput,
  heavyQueueUpdateInput,
  orchestratorStatusInput,
  planUpdateInput,
} from "../tools/input_schemas.js";
import { buildClusterSummaries } from "../utils/cluster.js";
import {
  dispatchInputSchema,
  moReportInputSchema,
  planNextInputSchema,
  verifyInputSchema,
} from "../utils/schemas.js";
import { AuthChecker } from "../utils/auth_checker.js";
import { logWarning } from "../telemetry/logger.js";
import type { PlanTaskSummary } from "../utils/types.js";

interface RunToolParams {
  name: string;
  input: unknown;
}

const jsonResponse = (payload: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(payload),
    },
  ],
});

async function readConsensusSummary(session: SessionContext) {
  try {
    const content = await session.readFile("state/analytics/orchestration_metrics.json");
    const parsed = JSON.parse(content) as {
      totalDecisions?: number;
      byType?: Record<string, number>;
      history?: Array<{
        id: string;
        taskId: string;
        type: string;
        timestamp: string;
        quorumSatisfied: boolean;
      }>;
    };

    const total = parsed.totalDecisions ?? 0;
    const byType = parsed.byType ?? {};
    const latest = parsed.history && parsed.history.length > 0 ? parsed.history[0] : undefined;

    let recommendation = "Consensus load stable.";
    if (total === 0) {
      recommendation = "No consensus activity recorded yet.";
    } else if ((byType.critical ?? 0) >= 2) {
      recommendation = "High critical decision volume — keep Director Dana and Claude council staffed.";
    } else if (latest && !latest.quorumSatisfied) {
      recommendation = "Recent decision lacked quorum — schedule follow-up before shipping.";
    }

    return {
      totalDecisions: total,
      byType,
      latest,
      recommendation,
    };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        totalDecisions: 0,
        byType: {},
        latest: undefined,
        recommendation: "Consensus telemetry not generated yet.",
      };
    }
    throw error;
  }
}

export class WorkerToolRouter {
  private readonly stateMachine?: StateMachine;

  constructor(
    private readonly session: SessionContext,
    private readonly runtime: OrchestratorRuntime,
    private readonly authChecker: AuthChecker,
  ) {
    this.stateMachine = runtime.getStateMachine();
  }

  async runTool(params: RunToolParams): Promise<unknown> {
    try {
      switch (params.name) {
        case "orchestrator_status":
          return this.handleOrchestratorStatus(params.input);
        case "auth_status":
          return this.handleAuthStatus(params.input);
        case "plan_next":
          return this.handlePlanNext(params.input);
        case "plan_update":
          return this.handlePlanUpdate(params.input);
        case "context_write":
          return this.handleContextWrite(params.input);
        case "context_snapshot":
          return this.handleContextSnapshot(params.input);
        case "fs_read":
          return this.handleFsRead(params.input);
        case "fs_write":
          return this.handleFsWrite(params.input);
        case "cmd_run":
          return this.handleCmdRun(params.input);
        case "critics_run":
          return this.handleCriticsRun(params.input);
        case "autopilot_record_audit":
          return this.handleAutopilotRecordAudit(params.input);
        case "autopilot_status":
          return this.handleAutopilotStatus();
        case "heavy_queue_enqueue":
          return this.handleHeavyQueueEnqueue(params.input);
        case "heavy_queue_update":
          return this.handleHeavyQueueUpdate(params.input);
        case "heavy_queue_list":
          return this.handleHeavyQueueList();
        case "artifact_record":
          return this.handleArtifactRecord(params.input);
        case "codex_commands":
          return this.handleCodexCommands();
        default:
          throw new Error(`Unknown tool: ${params.name}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "DryRunViolation") {
        return this.formatDryRunViolation(error, params.name);
      }
      throw error;
    }
  }

  async plan(params: unknown): Promise<unknown> {
    const parsed = planNextInputSchema.parse(params ?? {});
    const normalizedInput = {
      limit: parsed.limit ?? parsed.max_tasks,
      filters: parsed.filters,
    };
    const correlationBase = `worker:plan:${randomUUID()}`;
    const tasks = await this.session.planNext(normalizedInput, { correlationId: correlationBase });
    const clusters = buildClusterSummaries(tasks);
    return {
      ok: true,
      correlation_id: correlationBase,
      tasks,
      clusters,
    };
  }

  async dispatch(params: unknown): Promise<unknown> {
    const parsed = dispatchInputSchema.parse(params ?? {});
    const normalizedInput = {
      limit: parsed.limit ?? parsed.max_tasks,
      filters: parsed.filters,
    };
    const correlationBase = `worker:dispatch:${randomUUID()}`;
    const tasks = await this.session.planNext(normalizedInput, { correlationId: correlationBase });
    const operationsSnapshot = this.runtime.getOperationsManager().getSnapshot();

    return {
      ok: true,
      correlation_id: correlationBase,
      queue: {
        total: tasks.length,
        tasks,
      },
      operations: operationsSnapshot ?? null,
    };
  }

  async verify(params: unknown): Promise<unknown> {
    const parsed = verifyInputSchema.parse(params ?? {});
    const include = new Set(parsed.include ?? ["operations", "resilience", "self_improvement"]);
    const payload: Record<string, unknown> = {
      ok: true,
      generated_at: new Date().toISOString(),
      components: Array.from(include),
    };

    if (include.has("operations")) {
      payload.operations = this.runtime.getOperationsManager().getSnapshot() ?? null;
    }

    if (include.has("resilience")) {
      payload.resilience = this.runtime.getResilienceManager().getMetrics();
    }

    if (include.has("self_improvement")) {
      payload.self_improvement = this.runtime.getSelfImprovementManager().getStatus();
    }

    if (include.has("autopilot")) {
      payload.autopilot = await this.session.getAutopilotState();
    }

    return payload;
  }

  async reportMo(params: unknown): Promise<unknown> {
    const parsed = moReportInputSchema.parse(params ?? {});
    const includeTasks = parsed.include_tasks !== false;
    const includeOperations = parsed.include_operations !== false;
    const limit = parsed.limit ?? 5;
    const correlationBase = `worker:report.mo:${randomUUID()}`;

    const tasks: PlanTaskSummary[] = includeTasks
      ? await this.session.planNext(
          { limit, filters: parsed.filters },
          { correlationId: `${correlationBase}:tasks` },
        )
      : [];

    const operationsSnapshot = includeOperations
      ? this.runtime.getOperationsManager().getSnapshot()
      : undefined;

    const insights = this.buildMoInsights(operationsSnapshot, tasks);

    const response: Record<string, unknown> = {
      ok: true,
      correlation_id: correlationBase,
      generated_at: new Date().toISOString(),
      insights,
    };

    if (includeOperations) {
      response.operations = operationsSnapshot ?? null;
    }

    if (includeTasks) {
      response.tasks = tasks;
    }

    return response;
  }

  private async handleOrchestratorStatus(input: unknown) {
    orchestratorStatusInput.parse(input ?? {});
    const snapshot = this.runtime.getOperationsManager().getSnapshot();
    return jsonResponse({
      snapshot: snapshot ?? null,
    });
  }

  private async handleAuthStatus(input: unknown) {
    authStatusInput.parse(input ?? {});
    const status = await this.authChecker.checkAll();
    const guidance: string[] = [];
    if (!status.codex.authenticated) {
      guidance.push(
        "Codex: run `codex login` (workspace profile) or update state/accounts.yaml and rerun autopilot login.",
      );
    }
    if (!status.claude_code.authenticated) {
      guidance.push(
        "Claude: run `claude login` with the configured account or verify CLAUDE_CONFIG_DIR permissions.",
      );
    }
    return jsonResponse({
      status,
      guidance,
    });
  }

  private async handlePlanNext(input: unknown) {
    const parsed = planNextInputSchema.parse(input);
    const normalizedInput = {
      limit: parsed.limit ?? parsed.max_tasks,
      filters: parsed.filters,
    };
    const correlationBase = `mcp:plan_next:${randomUUID()}`;
    const tasks = await this.session.planNext(normalizedInput, { correlationId: correlationBase });
    const clusters = buildClusterSummaries(tasks);
    const minimalTasks = parsed.minimal
      ? tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, domain: t.domain }))
      : tasks;

    return jsonResponse({
      tasks: minimalTasks,
      clusters,
      profile: this.session.profile,
      correlation_id: correlationBase,
    });
  }

  private async handlePlanUpdate(input: unknown) {
    const parsed = planUpdateInput.parse(input);
    const correlationBase = `mcp:plan_update:${randomUUID()}`;
    const transitionCorrelation = `${correlationBase}:transition`;
    const decisionCorrelation = `${correlationBase}:decision`;
    await this.session.updatePlanStatus(parsed.task_id, parsed.status, transitionCorrelation);
    try {
      this.stateMachine?.logEvent({
        timestamp: Date.now(),
        event_type: "agent_decision",
        task_id: parsed.task_id,
        data: {
          tool: "plan_update",
          requested_status: parsed.status,
          profile: this.session.profile,
        },
        correlation_id: decisionCorrelation,
      });
    } catch (error) {
      logWarning("Failed to record plan_update event", {
        taskId: parsed.task_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return jsonResponse({
      ok: true,
      correlation_id: correlationBase,
      transition_correlation_id: transitionCorrelation,
      decision_correlation_id: decisionCorrelation,
    });
  }

  private async handleContextWrite(input: unknown) {
    const parsed = contextWriteInput.parse(input);
    await this.session.writeContext(parsed.section, parsed.content, parsed.append);
    return jsonResponse({ ok: true });
  }

  private async handleContextSnapshot(input: unknown) {
    const parsed = contextSnapshotInput.parse(input);
    await this.session.snapshot(parsed.notes);
    return jsonResponse({ ok: true });
  }

  private async handleFsRead(input: unknown) {
    const parsed = fsReadInput.parse(input);
    const content = await this.session.readFile(parsed.path);
    return jsonResponse({ path: parsed.path, content });
  }

  private async handleFsWrite(input: unknown) {
    const parsed = fsWriteInput.parse(input);
    await this.session.writeFile(parsed.path, parsed.content);
    return jsonResponse({ ok: true });
  }

  private async handleCmdRun(input: unknown) {
    const parsed = cmdRunInput.parse(input);
    const result = await this.session.runShellCommand(parsed.cmd);
    return jsonResponse(result);
  }

  private async handleCriticsRun(input: unknown) {
    const parsed = criticsRunInput.parse(input ?? {});
    return jsonResponse({
      profile: this.session.profile,
      results: await this.session.runCritics(parsed.critics ?? undefined),
    });
  }

  private async handleAutopilotRecordAudit(input: unknown) {
    const parsed = autopilotAuditInput.parse(input ?? {});
    const state = await this.session.recordAutopilotAudit({
      task_id: parsed.task_id,
      focus: parsed.focus,
      notes: parsed.notes,
    });
    return jsonResponse({ ok: true, state });
  }

  private async handleAutopilotStatus() {
    const [state, consensus] = await Promise.all([
      this.session.getAutopilotState(),
      readConsensusSummary(this.session),
    ]);
    return jsonResponse({ state, consensus });
  }

  private async handleHeavyQueueEnqueue(input: unknown) {
    const parsed = heavyQueueEnqueueInput.parse(input);
    const item = await this.session.enqueueHeavyTask(parsed);
    return jsonResponse({ item });
  }

  private async handleHeavyQueueUpdate(input: unknown) {
    const parsed = heavyQueueUpdateInput.parse(input);
    const item = await this.session.updateHeavyTask(parsed);
    return jsonResponse({ item });
  }

  private async handleHeavyQueueList() {
    const items = await this.session.listHeavyTasks();
    return jsonResponse({ items });
  }

  private async handleArtifactRecord(input: unknown) {
    const parsed = artifactRecordInput.parse(input);
    await this.session.recordArtifact(parsed.type, parsed.path, parsed.metadata);
    return jsonResponse({ ok: true });
  }

  private async handleCodexCommands() {
    return jsonResponse({
      profile: this.session.profile,
      commands: describeCodexCommands(),
    });
  }

  private formatDryRunViolation(error: Error, toolName: string) {
    const message = error.message || "Dry-run mode forbids this operation.";
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: message,
        },
        {
          type: "text" as const,
          text: JSON.stringify({
            ok: false,
            error: "dry_run_violation",
            tool: toolName,
            message,
          }),
        },
      ],
    };
  }

  private buildMoInsights(
    operations: OperationsSnapshot | undefined,
    tasks: PlanTaskSummary[],
  ): string[] {
    const insights: string[] = [];

    if (!operations) {
      insights.push(
        "Operations snapshot unavailable; run worker_health to capture up-to-date dispatcher telemetry.",
      );
    } else {
      if (operations.blockedTasks > 0) {
        insights.push(
          `Detected ${operations.blockedTasks} blocked tasks across the roadmap — pivot focus or escalate to unblock.`,
        );
      }
      if (operations.failureRate > 0.2) {
        insights.push(
          `Failure rate is ${Math.round(operations.failureRate * 100)}% — reinforce test coverage before promoting changes.`,
        );
      }
      const availableAgents =
        (operations.agent_pool?.idle_agents ?? 0) + (operations.agent_pool?.busy_agents ?? 0);
      if (availableAgents > 0 && operations.queueLength > availableAgents) {
        insights.push(
          `Queue length (${operations.queueLength}) exceeds active capacity (${availableAgents}); consider spinning up additional agents or reducing WIP.`,
        );
      }
      if (operations.mode === "stabilize") {
        insights.push("Operations manager is in “stabilize” mode — prioritise quality and remediation work.");
      }
    }

    const blocked = tasks.filter((task) => String(task.status ?? "").toLowerCase() === "blocked");
    if (blocked.length > 0) {
      const sample = blocked.slice(0, 5).map((task) => String(task.id ?? task.title ?? "unknown"));
      insights.push(`Blocked tasks in scope: ${sample.join(", ")}`);
    }

    const pending = tasks.filter((task) => String(task.status ?? "").toLowerCase() === "pending");
    if (pending.length > 0) {
      insights.push(`Pending tasks ready for allocation: ${pending.length}.`);
    }

    if (insights.length === 0) {
      insights.push("No immediate missed opportunities detected; continue monitoring queue health.");
    }

    return Array.from(new Set(insights));
  }
}
