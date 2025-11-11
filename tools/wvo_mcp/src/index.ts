import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { WorkerManager } from "./worker/worker_manager.js";
import {
  WorkerClient,
  isWorkerErrorPayload,
  type WorkerErrorPayload,
} from "./worker/worker_client.js";
import { logError, logInfo, logWarning } from "./telemetry/logger.js";
import { initTracing } from "./telemetry/tracing.js";
import { resolveWorkspaceRoot } from "./utils/config.js";
import { SERVER_NAME, SERVER_VERSION } from "./utils/version.js";
import { toJsonSchema } from "./utils/schema.js";
import { planNextInputSchema } from "./utils/schemas.js";
import { LiveFlags } from "./state/live_flags.js";
import {
  orchestratorStatusInput,
  authStatusInput,
  planUpdateInput,
  contextWriteInput,
  contextSnapshotInput,
  fsReadInput,
  fsWriteInput,
  cmdRunInput,
  criticsRunInput,
  autopilotAuditInput,
  heavyQueueEnqueueInput,
  heavyQueueUpdateInput,
  artifactRecordInput,
  lspDefinitionInput,
  lspReferencesInput,
  lspHoverInput,
  lspServerStatusInput,
  lspInitializeInput,
  adminFlagsInput,
  settingsUpdateInput,
  upgradeApplyPatchInput,
  routeSwitchInput,
} from "./tools/input_schemas.js";

type JsonSchema = ReturnType<typeof toJsonSchema>;
type McpToolResponse = CallToolResult;

interface ProxyToolDefinition {
  name: string;
  description: string;
  schema?: JsonSchema;
}

const jsonResponse = (payload: unknown): McpToolResponse => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(payload),
    },
  ],
});

function unwrapWorkerResult(tool: string, result: unknown): McpToolResponse {
  if (isWorkerErrorPayload(result)) {
    const payload = result as WorkerErrorPayload;
    logError("Worker tool execution failed", {
      tool,
      error: payload.error,
      code: payload.code,
      details: payload.details,
    });
    const error = new Error(`[worker:${tool}] ${payload.error}`);
    (error as Error & { code?: string }).code = payload.code;
    (error as Error & { details?: unknown }).details = payload.details;
    throw error;
  }
  return result as McpToolResponse;
}

async function main() {
  const workspaceRoot = resolveWorkspaceRoot();

  // PID lock file to prevent duplicate servers
  const pidLockPath = `${workspaceRoot}/state/.mcp.pid`;
  const currentPid = process.pid;

  // Check for existing lock
  try {
    const fs = await import('node:fs/promises');
    const existingPid = await fs.readFile(pidLockPath, 'utf-8').then(pid => parseInt(pid.trim(), 10)).catch(() => null);

    if (existingPid) {
      // Check if process is still running
      try {
        process.kill(existingPid, 0); // Signal 0 just checks if process exists
        console.error(`ERROR: Another MCP server is already running (PID ${existingPid})`);
        console.error(`If this is a stale lock, remove ${pidLockPath} and try again.`);
        process.exit(1);
      } catch {
        // Process doesn't exist - remove stale lock
        console.log(`Removing stale PID lock file (PID ${existingPid} not running)`);
        await fs.unlink(pidLockPath).catch(() => {});
      }
    }

    // Write our PID
    await fs.writeFile(pidLockPath, `${currentPid}\n`, 'utf-8');

    // Clean up PID file on exit
    const cleanupPidFile = async () => {
      try {
        const currentLock = await fs.readFile(pidLockPath, 'utf-8').then(pid => parseInt(pid.trim(), 10)).catch(() => null);
        if (currentLock === currentPid) {
          await fs.unlink(pidLockPath);
        }
      } catch {}
    };

    // Register PID cleanup on normal exit only
    // SIGINT/SIGTERM handled by proper shutdown sequence later
    process.on('exit', () => void cleanupPidFile());
  } catch (error) {
    console.error('Failed to manage PID lock file:', error);
    // Continue anyway - this is not critical
  }

  const liveFlags = new LiveFlags({ workspaceRoot });
  const otelFlag = liveFlags.getValue("OTEL_ENABLED");

  const explicitOtel = process.env.WVO_OTEL_ENABLED === "1";
  const tracingEnabled = explicitOtel || (otelFlag === "1" && process.env.WVO_DRY_RUN !== "1");
  const sampleRatioEnv = process.env.WVO_OTEL_SAMPLE_RATIO;
  const sampleRatio = sampleRatioEnv && Number.isFinite(Number.parseFloat(sampleRatioEnv))
    ? Number.parseFloat(sampleRatioEnv)
    : undefined;

  initTracing({
    workspaceRoot,
    enabled: tracingEnabled,
    sampleRatio,
  });

  const workerManager = new WorkerManager({ workspaceRoot });
  const workerClient = new WorkerClient(workerManager);

  const orchestratorStatusSchema = toJsonSchema(orchestratorStatusInput, "OrchestratorStatusInput");
  const authStatusSchema = toJsonSchema(authStatusInput, "AuthStatusInput");
  const planNextSchema = toJsonSchema(planNextInputSchema, "PlanNextInput");
  const planUpdateSchema = toJsonSchema(planUpdateInput, "PlanUpdateInput");
  const contextWriteSchema = toJsonSchema(contextWriteInput, "ContextWriteInput");
  const contextSnapshotSchema = toJsonSchema(contextSnapshotInput, "ContextSnapshotInput");
  const fsReadSchema = toJsonSchema(fsReadInput, "FsReadInput");
  const fsWriteSchema = toJsonSchema(fsWriteInput, "FsWriteInput");
  const cmdRunSchema = toJsonSchema(cmdRunInput, "CmdRunInput");
  const criticsRunSchema = toJsonSchema(criticsRunInput, "CriticsRunInput");
  const autopilotAuditSchema = toJsonSchema(autopilotAuditInput, "AutopilotAuditInput");
  const heavyQueueEnqueueSchema = toJsonSchema(heavyQueueEnqueueInput, "HeavyQueueEnqueueInput");
  const heavyQueueUpdateSchema = toJsonSchema(heavyQueueUpdateInput, "HeavyQueueUpdateInput");
  const artifactRecordSchema = toJsonSchema(artifactRecordInput, "ArtifactRecordInput");
  const lspDefinitionSchema = toJsonSchema(lspDefinitionInput, "LspDefinitionInput");
  const lspReferencesSchema = toJsonSchema(lspReferencesInput, "LspReferencesInput");
  const lspHoverSchema = toJsonSchema(lspHoverInput, "LspHoverInput");
  const lspServerStatusSchema = toJsonSchema(lspServerStatusInput, "LspServerStatusInput");
  const lspInitializeSchema = toJsonSchema(lspInitializeInput, "LspInitializeInput");
  const adminFlagsSchema = toJsonSchema(adminFlagsInput, "AdminFlagsInput");
  const settingsUpdateSchema = toJsonSchema(settingsUpdateInput, "SettingsUpdateInput");
  const upgradeApplyPatchSchema = toJsonSchema(upgradeApplyPatchInput, "UpgradeApplyPatchInput");
  const routeSwitchSchema = toJsonSchema(routeSwitchInput, "RouteSwitchInput");

  const proxyTools: ProxyToolDefinition[] = [
    {
      name: "orchestrator_status",
      description: "Inspect live orchestration metrics (queue length, quality trend, agent usage).",
      schema: orchestratorStatusSchema,
    },
    {
      name: "auth_status",
      description: "Check Codex and Claude Code authentication state with actionable guidance.",
      schema: authStatusSchema,
    },
    {
      name: "plan_next",
      description: "Return the highest priority WeatherVane roadmap tasks.",
      schema: planNextSchema,
    },
    {
      name: "plan_update",
      description: "Update a task status in the WeatherVane roadmap.",
      schema: planUpdateSchema,
    },
    {
      name: "context_write",
      description: "Write or append updates to state/context.md.",
      schema: contextWriteSchema,
    },
    {
      name: "context_snapshot",
      description: "Persist a checkpoint for session recovery.",
      schema: contextSnapshotSchema,
    },
    {
      name: "fs_read",
      description: "Read a file relative to the WeatherVane workspace.",
      schema: fsReadSchema,
    },
    {
      name: "fs_write",
      description: "Write a file relative to the WeatherVane workspace.",
      schema: fsWriteSchema,
    },
    {
      name: "cmd_run",
      description: "Execute a shell command inside the WeatherVane workspace.",
      schema: cmdRunSchema,
    },
    {
      name: "critics_run",
      description: "Run one or more WeatherVane critic suites.",
      schema: criticsRunSchema,
    },
    {
      name: "autopilot_record_audit",
      description:
        "Record a surprise QA audit against a completed roadmap item, including task id, focus area, and notes.",
      schema: autopilotAuditSchema,
    },
    {
      name: "autopilot_status",
      description: "Return the persisted autopilot audit cadence state.",
    },
    {
      name: "heavy_queue_enqueue",
      description: "Enqueue a heavy/background task so it can run asynchronously.",
      schema: heavyQueueEnqueueSchema,
    },
    {
      name: "heavy_queue_update",
      description: "Update the status of a heavy/background task.",
      schema: heavyQueueUpdateSchema,
    },
    {
      name: "heavy_queue_list",
      description: "List queued heavy/background tasks and their status.",
    },
    {
      name: "artifact_record",
      description: "Register an artifact path for later reference.",
      schema: artifactRecordSchema,
    },
    {
      name: "lsp_initialize",
      description: "Start TypeScript and Python LSP servers for symbol-aware code navigation.",
      schema: lspInitializeSchema,
    },
    {
      name: "lsp_server_status",
      description: "Report the running state and initialization status of LSP servers.",
      schema: lspServerStatusSchema,
    },
    {
      name: "lsp_definition",
      description: "Locate symbol definitions with contextual code slices via LSP.",
      schema: lspDefinitionSchema,
    },
    {
      name: "lsp_references",
      description: "Find symbol references across the workspace using LSP.",
      schema: lspReferencesSchema,
    },
    {
      name: "lsp_hover",
      description: "Retrieve hover details (types, docs) for a symbol from the LSP server.",
      schema: lspHoverSchema,
    },
    {
      name: "codex_commands",
      description: "List known Codex CLI commands and recommended usage.",
    },
    {
      name: "tool_manifest",
      description: "Describe available MCP tools with schemas, costs, and prerequisites.",
    },
    {
      name: "mcp_admin_flags",
      description:
        "Manage runtime flags for tool routing, feature toggles, and behavior control without restart.",
      schema: adminFlagsSchema,
    },
    {
      name: "settings_update",
      description: "Update live flag settings atomically without restarting the MCP server.",
      schema: settingsUpdateSchema,
    },
    {
      name: "upgrade_apply_patch",
      description: "Apply or dry-run git patches during controlled upgrade rollouts.",
      schema: upgradeApplyPatchSchema,
    },
  ];

  const shutdown = async () => {
    logInfo("Shutting down WVO MCP server...");

    try {
      // Stop all workers first
      await workerManager.stopAll();
      logInfo("All workers stopped");
    } catch (error: unknown) {
      logWarning("Failed to stop workers cleanly", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Exit cleanly (PID file cleanup happens in 'exit' handler)
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  workerManager.on("active:ready", ({ pid }) => {
    logInfo("Active worker ready", { pid });
  });
  workerManager.on("canary:ready", ({ pid }) => {
    logInfo("Canary worker ready", { pid });
  });
  workerManager.on("switch", ({ promotedPid, previousPid }) => {
    logInfo("Promoted canary worker", { promotedPid, previousPid });
  });
  workerManager.on("active:exit", (payload) => {
    logWarning("Active worker exited", {
      code: payload.code ?? null,
      signal: payload.signal ?? null,
      reason: (payload as { reason?: string }).reason ?? null,
    });
  });
  workerManager.on("log", ({ worker, level, message, details }) => {
    const logger = level === "error" ? logError : level === "warn" ? logWarning : logInfo;
    logger(`Worker[${worker}] ${message ?? "log event"}`, { details });
  });

  logInfo("WVO MCP server booting", {
    workspace: workspaceRoot,
    entry: "worker_manager",
  });

  try {
    const dryRunEnv = process.env.WVO_DRY_RUN;
    const activeOptions =
      dryRunEnv !== undefined
        ? {
            env: { WVO_DRY_RUN: dryRunEnv },
            allowDryRunActive: dryRunEnv === "1",
          }
        : {};
    await workerManager.startActive(activeOptions);

    const server = new McpServer(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {},
      },
    );

    const forwardTool = (toolName: string) => async (input: unknown) => {
      const result = await workerClient.callTool<McpToolResponse>(toolName, input);
      return unwrapWorkerResult(toolName, result);
    };

    for (const definition of proxyTools) {
      server.registerTool(
        definition.name,
        {
          description: definition.description,
          inputSchema: definition.schema,
        },
        forwardTool(definition.name),
      );
    }

    server.registerTool(
      "worker_health",
      {
        description: "Return the latest operations snapshot and persist worker health analytics.",
        inputSchema: undefined,
      },
      async () => {
        const snapshot = await workerManager.getSnapshot();
        return jsonResponse({
          ok: snapshot.status === "healthy",
          snapshot,
          analytics_path: snapshot.persisted_path,
        });
      },
    );

    server.registerTool(
      "route_switch",
      {
        description: "Promote the canary worker or request rollback via structured routing controls.",
        inputSchema: routeSwitchSchema,
      },
      async (input) => {
        let parsed;
        try {
          parsed = routeSwitchInput.parse(input ?? {});
        } catch (error) {
          return jsonResponse({
            ok: false,
            error: {
              code: "invalid_input",
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }

        if (liveFlags.getValue("ROUTING_TOOLS") !== "1") {
          return jsonResponse({
            ok: false,
            error: {
              code: "flag_disabled",
              message: "route_switch is disabled until ROUTING_TOOLS flag is enabled",
              flag: "ROUTING_TOOLS",
            },
          });
        }

        if (parsed.action === "promote_canary") {
          const canary = workerManager.getCanary();
          if (!canary) {
            return jsonResponse({
              ok: false,
              error: {
                code: "no_canary",
                message: "No canary worker is currently running; start one before switching.",
              },
            });
          }
          try {
            const summary = await workerManager.switchToCanary();
            return jsonResponse({ ok: true, summary });
          } catch (error) {
            return jsonResponse({
              ok: false,
              error: {
                code: "switch_failed",
                message: error instanceof Error ? error.message : String(error),
              },
            });
          }
        }

        return jsonResponse({
          ok: false,
          error: {
            code: "not_supported",
            message: "Rollback routing is not yet implemented; use promote_canary action only.",
          },
        });
      },
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);

    logInfo("WVO MCP server ready", {
      workspace: workspaceRoot,
      active_worker_pid: workerManager.getActive().pid ?? null,
    });
  } catch (error) {
    await workerManager.stopAll();
    throw error;
  }
}

main().catch((error) => {
  logError("Unhandled MCP server error", {
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  });
  process.exitCode = 1;
});
