import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

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
  lspDefinitionInput,
  lspReferencesInput,
  lspHoverInput,
  lspServerStatusInput,
  lspInitializeInput,
  adminFlagsInput,
  settingsUpdateInput,
  upgradeApplyPatchInput,
} from "../tools/input_schemas.js";
import {
  DEFAULT_LIVE_FLAGS,
  SettingsStore,
  isLiveFlagKey,
  type LiveFlagKey,
  type LiveFlagSnapshot,
} from "../state/live_flags.js";
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
import type { ConsensusMetricsSnapshot } from "../telemetry/consensus_metrics.js";
import { withSpan } from "../telemetry/tracing.js";
import { withWorkerCallObservability } from "../observability/worker_call_wrapper.js";
import { IdempotencyStore } from "../state/idempotency_cache.js";
import {
  IdempotencyMiddleware,
  type WrappedHandler,
} from "../state/idempotency_middleware.js";

interface RunToolParams {
  name: string;
  input?: unknown;
  idempotencyKey?: string;
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
    const parsed = JSON.parse(content) as Partial<ConsensusMetricsSnapshot>;

    const total = parsed.totalDecisions ?? 0;
    const byType = parsed.byType ?? {};
    const latest = parsed.history && parsed.history.length > 0 ? parsed.history[0] : undefined;
    const staffingGuidance = parsed.staffingGuidance;

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
      staffingGuidance,
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
  private readonly idempotencyStore: IdempotencyStore;
  private readonly idempotencyMiddleware: IdempotencyMiddleware;
  private readonly planUpdateHandler: WrappedHandler;
  private readonly contextWriteHandler: WrappedHandler;
  private readonly contextSnapshotHandler: WrappedHandler;
  private readonly fsWriteHandler: WrappedHandler;
  private readonly cmdRunHandler: WrappedHandler;
  private readonly heavyQueueEnqueueHandler: WrappedHandler;
  private readonly heavyQueueUpdateHandler: WrappedHandler;
  private toolManifestCache:
    | {
        mtimeMs: number;
        payload: unknown;
      }
    | undefined;
  private readonly liveFlags: ReturnType<OrchestratorRuntime["getLiveFlags"]>;

  constructor(
    private readonly session: SessionContext,
    private readonly runtime: OrchestratorRuntime,
    private readonly authChecker: AuthChecker,
  ) {
    this.stateMachine = runtime.getStateMachine();
    this.idempotencyStore = new IdempotencyStore();
    this.idempotencyMiddleware = new IdempotencyMiddleware(this.idempotencyStore, true);
    this.planUpdateHandler = this.createPlanUpdateHandler();
    this.contextWriteHandler = this.createContextWriteHandler();
    this.contextSnapshotHandler = this.createContextSnapshotHandler();
    this.fsWriteHandler = this.createFsWriteHandler();
    this.cmdRunHandler = this.createCmdRunHandler();
    this.heavyQueueEnqueueHandler = this.createHeavyQueueEnqueueHandler();
    this.heavyQueueUpdateHandler = this.createHeavyQueueUpdateHandler();
    this.liveFlags = runtime.getLiveFlags();
  }

  async runTool(params: RunToolParams): Promise<unknown> {
    const taskId = `tool:${params.name}:${randomUUID()}`;
    const lane = this.getConcurrencyLaneForTool(params.name);

    return withWorkerCallObservability(
      taskId,
      () =>
        withSpan(
          `worker.tool.${params.name}`,
          async (span) => {
            try {
              if (params.idempotencyKey) {
                span?.setAttribute("tool.idempotency.key", params.idempotencyKey);
              }
              switch (params.name) {
                case "orchestrator_status":
                  return this.handleOrchestratorStatus(params.input);
                case "auth_status":
                  return this.handleAuthStatus(params.input);
                case "plan_next":
                  return this.handlePlanNext(params.input);
                case "plan_update":
                  return this.handlePlanUpdate(params.input, params.idempotencyKey);
                case "context_write":
                  return this.handleContextWrite(params.input, params.idempotencyKey);
                case "context_snapshot":
                  return this.handleContextSnapshot(params.input, params.idempotencyKey);
                case "fs_read":
                  return this.handleFsRead(params.input);
                case "fs_write":
                  return this.handleFsWrite(params.input, params.idempotencyKey);
                case "cmd_run":
                  return this.handleCmdRun(params.input, params.idempotencyKey);
                case "critics_run":
                  return this.handleCriticsRun(params.input);
                case "autopilot_record_audit":
                  return this.handleAutopilotRecordAudit(params.input);
                case "autopilot_status":
                  return this.handleAutopilotStatus();
                case "mcp_admin_flags":
                  return this.handleAdminFlags(params.input);
                case "settings_update":
                  return this.handleSettingsUpdate(params.input);
                case "upgrade_apply_patch":
                  return this.handleUpgradeApplyPatch(params.input);
                case "heavy_queue_enqueue":
                  return this.handleHeavyQueueEnqueue(params.input, params.idempotencyKey);
                case "heavy_queue_update":
                  return this.handleHeavyQueueUpdate(params.input, params.idempotencyKey);
                case "heavy_queue_list":
                  return this.handleHeavyQueueList();
                case "artifact_record":
                  return this.handleArtifactRecord(params.input);
                case "codex_commands":
                  return this.handleCodexCommands();
                case "tool_manifest":
                  return this.handleToolManifest();
                case "lsp_definition":
                  return this.handleLspDefinition(params.input);
                case "lsp_references":
                  return this.handleLspReferences(params.input);
                case "lsp_hover":
                  return this.handleLspHover(params.input);
                case "lsp_server_status":
                  return this.handleLspServerStatus(params.input);
                case "lsp_initialize":
                  return this.handleLspInitialize(params.input);
                default:
                  throw new Error(`Unknown tool: ${params.name}`);
              }
            } catch (error) {
              if (error instanceof Error && error.name === "DryRunViolation") {
                span?.setStatus("error", "dry_run_violation");
                return this.formatDryRunViolation(error, params.name);
              }
              span?.recordException(error);
              throw error;
            }
          },
          {
            attributes: {
              "tool.name": params.name,
            },
          },
        ),
      {
        lane,
        metadata: {
          toolName: params.name,
          idempotencyKey: params.idempotencyKey,
        },
      },
    );
  }

  async plan(params: unknown): Promise<unknown> {
    return withSpan(
      "worker.plan",
      async (span) => {
        const parsed = planNextInputSchema.parse(params ?? {});
        const normalizedInput = {
          limit: parsed.limit ?? parsed.max_tasks,
          filters: parsed.filters,
        };
        const correlationBase = `worker:plan:${randomUUID()}`;
        span?.setAttribute("correlation.id", correlationBase);
        const tasks = await this.session.planNext(normalizedInput, { correlationId: correlationBase });
        const clusters = buildClusterSummaries(tasks);
        return {
          ok: true,
          correlation_id: correlationBase,
          tasks,
          clusters,
        };
      },
    );
  }

  async dispatch(params: unknown): Promise<unknown> {
    return withSpan(
      "worker.dispatch",
      async (span) => {
        const parsed = dispatchInputSchema.parse(params ?? {});
        const normalizedInput = {
          limit: parsed.limit ?? parsed.max_tasks,
          filters: parsed.filters,
        };
        const correlationBase = `worker:dispatch:${randomUUID()}`;
        span?.setAttribute("correlation.id", correlationBase);
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
      },
    );
  }

  async verify(params: unknown): Promise<unknown> {
    return withSpan(
      "worker.verify",
      async (span) => {
        const parsed = verifyInputSchema.parse(params ?? {});
        const include = new Set(
          parsed.include ?? ["operations", "resilience", "self_improvement", "holistic_review"],
        );
        span?.setAttribute("verify.components", Array.from(include).join(","));

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

        if (include.has("holistic_review")) {
          payload.holistic_review = this.runtime.getHolisticReviewStatus();
        }

        return payload;
      },
    );
  }

  async reportMo(params: unknown): Promise<unknown> {
    return withSpan(
      "worker.report_mo",
      async (span) => {
        const parsed = moReportInputSchema.parse(params ?? {});
        const includeTasks = parsed.include_tasks !== false;
        const includeOperations = parsed.include_operations !== false;
        const limit = parsed.limit ?? 5;
        const correlationBase = `worker:report.mo:${randomUUID()}`;
        span?.setAttribute("correlation.id", correlationBase);
        span?.setAttribute("report.include_tasks", includeTasks);
        span?.setAttribute("report.include_operations", includeOperations);

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
        span?.setAttribute("report.task_count", tasks.length);

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
      },
    );
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

  private handlePlanUpdate(input: unknown, idempotencyKey?: string) {
    return this.planUpdateHandler(input, idempotencyKey);
  }

  private createPlanUpdateHandler(): WrappedHandler {
    return this.idempotencyMiddleware.wrap(
      "plan_update",
      async (rawInput) => {
        const parsed = planUpdateInput.parse(rawInput);
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
      },
    );
  }

  private handleContextWrite(input: unknown, idempotencyKey?: string) {
    return this.contextWriteHandler(input, idempotencyKey);
  }

  private createContextWriteHandler(): WrappedHandler {
    return this.idempotencyMiddleware.wrap(
      "context_write",
      async (rawInput) => {
        const parsed = contextWriteInput.parse(rawInput);
        await this.session.writeContext(parsed.section, parsed.content, parsed.append);
        return jsonResponse({ ok: true });
      },
    );
  }

  private handleContextSnapshot(input: unknown, idempotencyKey?: string) {
    return this.contextSnapshotHandler(input, idempotencyKey);
  }

  private createContextSnapshotHandler(): WrappedHandler {
    return this.idempotencyMiddleware.wrap(
      "context_snapshot",
      async (rawInput) => {
        const parsed = contextSnapshotInput.parse(rawInput);
        await this.session.snapshot(parsed.notes);
        return jsonResponse({ ok: true });
      },
    );
  }

  private async handleFsRead(input: unknown) {
    const parsed = fsReadInput.parse(input);
    const content = await this.session.readFile(parsed.path);
    return jsonResponse({ path: parsed.path, content });
  }

  private handleFsWrite(input: unknown, idempotencyKey?: string) {
    return this.fsWriteHandler(input, idempotencyKey);
  }

  private createFsWriteHandler(): WrappedHandler {
    return this.idempotencyMiddleware.wrap(
      "fs_write",
      async (rawInput) => {
        const parsed = fsWriteInput.parse(rawInput);
        await this.session.writeFile(parsed.path, parsed.content);
        return jsonResponse({ ok: true });
      },
    );
  }

  private handleCmdRun(input: unknown, idempotencyKey?: string) {
    return this.cmdRunHandler(input, idempotencyKey);
  }

  private createCmdRunHandler(): WrappedHandler {
    return this.idempotencyMiddleware.wrap(
      "cmd_run",
      async (rawInput) => {
        const parsed = cmdRunInput.parse(rawInput);
        const result = await this.session.runShellCommand(parsed.cmd);
        return jsonResponse(result);
      },
    );
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

  private handleAdminFlags(input: unknown) {
    try {
      const parsed = adminFlagsInput.parse(input ?? {});
      const settingsStore = new SettingsStore({ workspaceRoot: this.session.workspaceRoot });
      try {
        switch (parsed.action) {
          case "get": {
            const snapshot = settingsStore.read();
            if (parsed.flag) {
              if (!isLiveFlagKey(parsed.flag)) {
                return jsonResponse({
                  ok: false,
                  error: `Unknown flag: ${parsed.flag}`,
                });
              }
              const flagKey = parsed.flag as LiveFlagKey;
              return jsonResponse({
                ok: true,
                flag: flagKey,
                value: snapshot[flagKey],
                default: DEFAULT_LIVE_FLAGS[flagKey],
              });
            }
            return jsonResponse({
              ok: true,
              flags: snapshot,
              defaults: DEFAULT_LIVE_FLAGS,
            });
          }
          case "set": {
            if (!parsed.flags || Object.keys(parsed.flags).length === 0) {
              return jsonResponse({
                ok: false,
                error: "set action requires a non-empty 'flags' object",
              });
            }
            const updates: Partial<Record<LiveFlagKey, string>> = {};
            for (const [rawKey, rawValue] of Object.entries(parsed.flags)) {
              if (!isLiveFlagKey(rawKey)) {
                return jsonResponse({
                  ok: false,
                  error: `Unknown flag: ${rawKey}`,
                });
              }
              const key = rawKey as LiveFlagKey;
              let value: string;
              if (typeof rawValue === "string") {
                value = rawValue;
              } else if (typeof rawValue === "number" || typeof rawValue === "boolean") {
                value = String(rawValue);
              } else {
                return jsonResponse({
                  ok: false,
                  error: `Unsupported value type for flag ${rawKey}`,
                });
              }
              updates[key] = value;
            }
            const updated: Partial<LiveFlagSnapshot> = {};
            const snapshot = settingsStore.upsertMany(updates);
            for (const key of Object.keys(updates) as LiveFlagKey[]) {
              updated[key] = snapshot[key];
            }
            return jsonResponse({
              ok: true,
              updated_flags: updated,
              note: "Changes take effect immediately via LiveFlags polling",
            });
          }
          case "reset": {
            if (!parsed.flag) {
              return jsonResponse({
                ok: false,
                error: "reset action requires a 'flag' parameter",
              });
            }
            if (!isLiveFlagKey(parsed.flag)) {
              return jsonResponse({
                ok: false,
                error: `Unknown flag: ${parsed.flag}`,
              });
            }
            const flagKey = parsed.flag as LiveFlagKey;
            const defaultValue = DEFAULT_LIVE_FLAGS[flagKey];
            const snapshot = settingsStore.upsert(flagKey, defaultValue);
            return jsonResponse({
              ok: true,
              flag: flagKey,
              default_value: snapshot[flagKey],
            });
          }
          default:
            return jsonResponse({
              ok: false,
              error: `Unknown action: ${String(parsed.action)}`,
            });
        }
      } finally {
        settingsStore.close();
      }
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private isFlagEnabled(flag: LiveFlagKey): boolean {
    return this.liveFlags.getValue(flag) === '1';
  }

  private toolDisabledResponse(tool: string, flag: LiveFlagKey) {
    return jsonResponse({
      ok: false,
      error: {
        code: 'flag_disabled',
        message: `${tool} is disabled until ${flag} is enabled`,
        flag,
      },
    });
  }

  private async handleSettingsUpdate(input: unknown) {
    if (!this.isFlagEnabled('ADMIN_TOOLS')) {
      return this.toolDisabledResponse('settings_update', 'ADMIN_TOOLS');
    }

    let parsed: ReturnType<typeof settingsUpdateInput.parse>;
    try {
      parsed = settingsUpdateInput.parse(input ?? {});
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: {
          code: 'invalid_input',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }

    if (parsed.updates.length === 0) {
      return jsonResponse({
        ok: false,
        error: {
          code: 'empty_update',
          message: 'settings_update requires at least one key/value pair',
        },
      });
    }

    const assignments: Partial<Record<LiveFlagKey, string>> = {};
    for (const entry of parsed.updates) {
      if (!isLiveFlagKey(entry.key)) {
        return jsonResponse({
          ok: false,
          error: {
            code: 'unknown_flag',
            message: `Unsupported flag: ${entry.key}`,
            flag: entry.key,
          },
        });
      }
      const key = entry.key as LiveFlagKey;
      const value = typeof entry.value === 'string' ? entry.value : String(entry.value);
      assignments[key] = value;
    }

    const store = new SettingsStore({ workspaceRoot: this.session.workspaceRoot });
    try {
      const snapshot = store.upsertMany(assignments);
      const updated: Record<string, string> = {};
      for (const key of Object.keys(assignments) as LiveFlagKey[]) {
        updated[key] = snapshot[key];
      }
      return jsonResponse({
        ok: true,
        updated_flags: updated,
        note: 'Settings updated atomically',
      });
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: {
          code: 'update_failed',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      store.close();
    }
  }

  private async handleUpgradeApplyPatch(input: unknown) {
    if (!this.isFlagEnabled('UPGRADE_TOOLS')) {
      return this.toolDisabledResponse('upgrade_apply_patch', 'UPGRADE_TOOLS');
    }

    let parsed: ReturnType<typeof upgradeApplyPatchInput.parse>;
    try {
      parsed = upgradeApplyPatchInput.parse(input ?? {});
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: {
          code: 'invalid_input',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }

    const absolutePath = path.isAbsolute(parsed.path)
      ? path.normalize(parsed.path)
      : path.normalize(path.join(this.session.workspaceRoot, parsed.path));

    if (!absolutePath.startsWith(this.session.workspaceRoot)) {
      return jsonResponse({
        ok: false,
        error: {
          code: 'invalid_path',
          message: `Patch path must reside within workspace: ${parsed.path}`,
        },
      });
    }

    try {
      await fs.access(absolutePath);
    } catch {
      return jsonResponse({
        ok: false,
        error: {
          code: 'patch_missing',
          message: `Patch file not found: ${parsed.path}`,
        },
      });
    }

    const sanitizedPath = absolutePath.replace(/'/g, `'"'"'`);
    const quotedPath = `'${sanitizedPath}'`;
    const args: string[] = ['git', 'apply'];
    const verbose = parsed.verbose !== false;
    if (parsed.mode === 'check') {
      args.push('--check');
    }
    if (parsed.reverse) {
      args.push('--reverse');
    }
    if (typeof parsed.strip === 'number') {
      args.push(`--strip=${parsed.strip}`);
    }
    if (verbose) {
      args.push('--verbose');
    }

    const command = `${args.join(' ')} ${quotedPath}`;

    try {
      const result = await this.session.runShellCommand(command);
      const ok = result.code === 0;
      return jsonResponse({
        ok,
        command,
        exit_code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: {
          code: 'command_failed',
          message: error instanceof Error ? error.message : String(error),
          command,
        },
      });
    }
  }

  private handleHeavyQueueEnqueue(input: unknown, idempotencyKey?: string) {
    return this.heavyQueueEnqueueHandler(input, idempotencyKey);
  }

  private createHeavyQueueEnqueueHandler(): WrappedHandler {
    return this.idempotencyMiddleware.wrap(
      "heavy_queue_enqueue",
      async (rawInput) => {
        const parsed = heavyQueueEnqueueInput.parse(rawInput);
        const item = await this.session.enqueueHeavyTask(parsed);
        return jsonResponse({ item });
      },
    );
  }

  private handleHeavyQueueUpdate(input: unknown, idempotencyKey?: string) {
    return this.heavyQueueUpdateHandler(input, idempotencyKey);
  }

  private createHeavyQueueUpdateHandler(): WrappedHandler {
    return this.idempotencyMiddleware.wrap(
      "heavy_queue_update",
      async (rawInput) => {
        const parsed = heavyQueueUpdateInput.parse(rawInput);
        const item = await this.session.updateHeavyTask(parsed);
        return jsonResponse({ item });
      },
    );
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

  private async handleToolManifest() {
    const manifestPath = path.join(
      this.session.workspaceRoot,
      "tools",
      "wvo_mcp",
      "config",
      "tool_manifest.json",
    );

    try {
      const stats = await fs.stat(manifestPath);
      const mtimeMs = stats.mtimeMs;
      if (!this.toolManifestCache || this.toolManifestCache.mtimeMs !== mtimeMs) {
        const raw = await fs.readFile(manifestPath, "utf8");
        const parsed = JSON.parse(raw);
        this.toolManifestCache = {
          mtimeMs,
          payload: parsed,
        };
      }
      return jsonResponse({
        manifest: this.toolManifestCache?.payload ?? [],
        generated_at: new Date().toISOString(),
      });
    } catch (error: unknown) {
      logWarning("Unable to load tool manifest", {
        error: error instanceof Error ? error.message : String(error),
      });
      return jsonResponse({
        manifest: [],
        generated_at: new Date().toISOString(),
        error: "tool_manifest file missing or invalid.",
      });
    }
  }

  private async handleLspDefinition(input: unknown) {
    try {
      const parsed = lspDefinitionInput.parse(input);
      const { getLSPManager } = await import("../lsp/lsp_manager.js");
      const lspManager = getLSPManager(this.session.workspaceRoot);

      // Ensure language server is running
      const status = lspManager.getServerStatus(parsed.language);
      if (!status.running) {
        if (parsed.language === "typescript") {
          await lspManager.startTypeScriptServer();
        } else {
          await lspManager.startPythonServer();
        }
      }

      // Get definitions based on language
      if (parsed.language === "typescript") {
        const { TypeScriptLSPProxy } = await import("../lsp/tsserver_proxy.js");
        const proxy = new TypeScriptLSPProxy(lspManager, this.session.workspaceRoot);
        const result = await proxy.getDefinitionWithContext(
          parsed.filePath,
          parsed.line,
          parsed.character,
          parsed.contextLines ?? 5
        );
        return jsonResponse({ ok: true, definitions: result });
      } else {
        const { PythonLSPProxy } = await import("../lsp/pyright_proxy.js");
        const proxy = new PythonLSPProxy(lspManager, this.session.workspaceRoot);
        const result = await proxy.getDefinitionWithContext(
          parsed.filePath,
          parsed.line,
          parsed.character,
          parsed.contextLines ?? 5
        );
        return jsonResponse({ ok: true, definitions: result });
      }
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleLspReferences(input: unknown) {
    try {
      const parsed = lspReferencesInput.parse(input);
      const { getLSPManager } = await import("../lsp/lsp_manager.js");
      const lspManager = getLSPManager(this.session.workspaceRoot);

      // Ensure language server is running
      const status = lspManager.getServerStatus(parsed.language);
      if (!status.running) {
        if (parsed.language === "typescript") {
          await lspManager.startTypeScriptServer();
        } else {
          await lspManager.startPythonServer();
        }
      }

      // Get references based on language
      if (parsed.language === "typescript") {
        const { TypeScriptLSPProxy } = await import("../lsp/tsserver_proxy.js");
        const proxy = new TypeScriptLSPProxy(lspManager, this.session.workspaceRoot);
        const result = await proxy.getReferencesWithContext(
          parsed.filePath,
          parsed.line,
          parsed.character,
          parsed.contextLines ?? 3
        );
        return jsonResponse({ ok: true, references: result });
      } else {
        const { PythonLSPProxy } = await import("../lsp/pyright_proxy.js");
        const proxy = new PythonLSPProxy(lspManager, this.session.workspaceRoot);
        const result = await proxy.getReferencesWithContext(
          parsed.filePath,
          parsed.line,
          parsed.character,
          parsed.contextLines ?? 3
        );
        return jsonResponse({ ok: true, references: result });
      }
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleLspHover(input: unknown) {
    try {
      const parsed = lspHoverInput.parse(input);
      const { getLSPManager } = await import("../lsp/lsp_manager.js");
      const lspManager = getLSPManager(this.session.workspaceRoot);

      // Ensure language server is running
      const status = lspManager.getServerStatus(parsed.language);
      if (!status.running) {
        if (parsed.language === "typescript") {
          await lspManager.startTypeScriptServer();
        } else {
          await lspManager.startPythonServer();
        }
      }

      // Get hover info based on language
      if (parsed.language === "typescript") {
        const { TypeScriptLSPProxy } = await import("../lsp/tsserver_proxy.js");
        const proxy = new TypeScriptLSPProxy(lspManager, this.session.workspaceRoot);
        const result = await proxy.getHover(
          parsed.filePath,
          parsed.line,
          parsed.character
        );
        return jsonResponse({ ok: true, ...result });
      } else {
        const { PythonLSPProxy } = await import("../lsp/pyright_proxy.js");
        const proxy = new PythonLSPProxy(lspManager, this.session.workspaceRoot);
        const result = await proxy.getHover(
          parsed.filePath,
          parsed.line,
          parsed.character
        );
        return jsonResponse({ ok: true, ...result });
      }
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleLspServerStatus(input: unknown) {
    try {
      const parsed = lspServerStatusInput.parse(input ?? {});
      const { getLSPManager } = await import("../lsp/lsp_manager.js");
      const lspManager = getLSPManager(this.session.workspaceRoot);

      if (parsed.language) {
        const status = lspManager.getServerStatus(parsed.language);
        return jsonResponse({ ok: true, server: status });
      } else {
        // Return status for both servers
        const tsStatus = lspManager.getServerStatus("typescript");
        const pyStatus = lspManager.getServerStatus("python");
        return jsonResponse({
          ok: true,
          servers: {
            typescript: tsStatus,
            python: pyStatus,
          },
        });
      }
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleLspInitialize(input: unknown) {
    try {
      const parsed = lspInitializeInput.parse(input);
      const { getLSPManager } = await import("../lsp/lsp_manager.js");
      const lspManager = getLSPManager(parsed.workspaceRoot);

      // Start both servers
      await Promise.all([
        lspManager.startTypeScriptServer().catch((e) => {
          logWarning("Failed to start TypeScript server", {
            error: e instanceof Error ? e.message : String(e),
          });
        }),
        lspManager.startPythonServer().catch((e) => {
          logWarning("Failed to start Python server", {
            error: e instanceof Error ? e.message : String(e),
          });
        }),
      ]);

      const tsStatus = lspManager.getServerStatus("typescript");
      const pyStatus = lspManager.getServerStatus("python");

      return jsonResponse({
        ok: true,
        servers: {
          typescript: tsStatus,
          python: pyStatus,
        },
      });
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
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

  /**
   * Determine the concurrency lane for a tool based on its category
   * This ensures proper resource budgeting during parallel execution
   */
  private getConcurrencyLaneForTool(toolName: string): string {
    switch (toolName) {
      // File I/O lanes
      case "fs_read":
        return "file_read";
      case "fs_write":
        return "file_write";
      // Critic lane
      case "critics_run":
        return "critic";
      // Tool call lane (default)
      default:
        return "tool_call";
    }
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
