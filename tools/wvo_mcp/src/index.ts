import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { describeCodexCommands } from "./executor/codex_commands.js";
import { OrchestratorRuntime } from "./orchestrator/orchestrator_runtime.js";
import { SessionContext } from "./session.js";
import { logError, logInfo } from "./telemetry/logger.js";
import { AuthChecker } from "./utils/auth_checker.js";
import { resolveWorkspaceRoot } from "./utils/config.js";

async function main() {
  const workspaceRoot = resolveWorkspaceRoot();
  const runtime = new OrchestratorRuntime(workspaceRoot, {
    targetCodexRatio: 5,
  });
  runtime.start();

  const session = new SessionContext(runtime);
  logInfo("WVO MCP server booting", {
    workspace: session.workspaceRoot,
    profile: session.profile,
  });

  const shutdown = () => {
    runtime.stop();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    const server = new McpServer(
      {
        name: "weathervane-orchestrator",
        version: "0.1.0",
      },
      {
        capabilities: {},
      },
    );

    const planNextInput = z.object({
      limit: z.number().int().positive().max(20).optional(),
      filters: z
        .object({
          status: z.array(z.enum(["pending", "in_progress", "blocked", "done"])).optional(),
          epic_id: z.string().optional(),
          milestone_id: z.string().optional(),
        })
        .optional(),
    });

    const jsonResponse = (payload: unknown) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(payload),
        },
      ],
    });

    const orchestratorStatusInput = z.object({});
    const authStatusInput = z.object({});

    server.registerTool(
      "orchestrator_status",
      {
        description: "Inspect live orchestration metrics (queue length, quality trend, agent usage).",
        inputSchema: orchestratorStatusInput?.shape,
      },
      async (input: unknown) => {
        orchestratorStatusInput.parse(input ?? {});
        const snapshot = runtime.getOperationsManager().getSnapshot();
        return jsonResponse({
          snapshot: snapshot ?? null,
        });
      },
    );

    const authChecker = new AuthChecker();

    server.registerTool(
      "auth_status",
      {
        description: "Check Codex and Claude Code authentication state with actionable guidance.",
        inputSchema: authStatusInput.shape,
      },
      async (input: unknown) => {
        authStatusInput.parse(input ?? {});
        const status = await authChecker.checkAll();
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
      },
    );

    server.registerTool(
      "plan_next",
      {
        description: "Return the highest priority WeatherVane roadmap tasks.",
        inputSchema: planNextInput.shape,
      },
      async (input: unknown) => {
        const parsed = planNextInput.parse(input);
        return jsonResponse({
          tasks: await session.planNext(parsed),
          profile: session.profile,
        });
      },
    );

    const planUpdateInput = z.object({
      task_id: z.string(),
      status: z.enum(["pending", "in_progress", "blocked", "done"]),
    });

    server.registerTool(
      "plan_update",
      {
        description: "Update a task status in the WeatherVane roadmap.",
        inputSchema: planUpdateInput.shape,
      },
      async (input: unknown) => {
        const parsed = planUpdateInput.parse(input);
        await session.updatePlanStatus(parsed.task_id, parsed.status);
        return jsonResponse({ ok: true });
      },
    );

    const contextWriteInput = z.object({
      section: z.string().min(1),
      content: z.string().min(1),
      append: z.boolean().optional(),
    });

    server.registerTool(
      "context_write",
      {
        description: "Write or append updates to state/context.md.",
        inputSchema: contextWriteInput.shape,
      },
      async (input: unknown) => {
        const parsed = contextWriteInput.parse(input);
        await session.writeContext(parsed.section, parsed.content, parsed.append);
        return jsonResponse({ ok: true });
      },
    );

    const contextSnapshotInput = z.object({
      notes: z.string().optional(),
    });

    server.registerTool(
      "context_snapshot",
      {
        description: "Persist a checkpoint for session recovery.",
        inputSchema: contextSnapshotInput.shape,
      },
      async (input: unknown) => {
        const parsed = contextSnapshotInput.parse(input);
        await session.snapshot(parsed.notes);
        return jsonResponse({ ok: true });
      },
    );

    const fsReadInput = z.object({
      path: z.string().min(1),
    });

    server.registerTool(
      "fs_read",
      {
        description: "Read a file relative to the WeatherVane workspace.",
        inputSchema: fsReadInput.shape,
      },
      async (input: unknown) => {
        const parsed = fsReadInput.parse(input);
        const content = await session.readFile(parsed.path);
        return jsonResponse({ path: parsed.path, content });
      },
    );

    const fsWriteInput = z.object({
      path: z.string().min(1),
      content: z.string(),
    });

    server.registerTool(
      "fs_write",
      {
        description: "Write a file relative to the WeatherVane workspace.",
        inputSchema: fsWriteInput.shape,
      },
      async (input: unknown) => {
        const parsed = fsWriteInput.parse(input);
        await session.writeFile(parsed.path, parsed.content);
        return jsonResponse({ ok: true });
      },
    );

    const cmdRunInput = z.object({
      cmd: z.string().min(1),
    });

    server.registerTool(
      "cmd_run",
      {
        description: "Execute a shell command inside the WeatherVane workspace.",
        inputSchema: cmdRunInput.shape,
      },
      async (input: unknown) => {
        const parsed = cmdRunInput.parse(input);
        const result = await session.runShellCommand(parsed.cmd);
        return jsonResponse(result);
      },
    );

    const criticsRunInput = z.object({
      critics: z.array(z.string()).optional(),
    });

    server.registerTool(
      "critics_run",
      {
        description: "Run one or more WeatherVane critic suites.",
        inputSchema: criticsRunInput.shape,
      },
      async (input: unknown) => {
        const parsed = criticsRunInput.parse(input);
        return jsonResponse({
          profile: session.profile,
          results: await session.runCritics(parsed.critics ?? undefined),
        });
      },
    );

    const autopilotAuditInput = z.object({
      task_id: z.string().min(1).optional(),
      focus: z.string().min(1).optional(),
      notes: z.string().optional(),
    });

    server.registerTool(
      "autopilot_record_audit",
      {
        description:
          "Record a surprise QA audit against a completed roadmap item, including task id, focus area, and notes.",
        inputSchema: autopilotAuditInput.shape,
      },
      async (input: unknown) => {
        const parsed = autopilotAuditInput.parse(input);
        const state = await session.recordAutopilotAudit({
          task_id: parsed.task_id,
          focus: parsed.focus,
          notes: parsed.notes,
        });
        return jsonResponse({ ok: true, state });
      },
    );

    server.registerTool(
      "autopilot_status",
      {
        description: "Return the persisted autopilot audit cadence state.",
        inputSchema: z.object({}).shape,
      },
      async (_input: unknown) => {
        const state = await session.getAutopilotState();
        return jsonResponse({ state });
      },
    );

    const heavyQueueEnqueueInput = z.object({
      summary: z.string().min(1),
      command: z.string().optional(),
      notes: z.string().optional(),
      id: z.string().optional(),
    });

    server.registerTool(
      "heavy_queue_enqueue",
      {
        description: "Enqueue a heavy/background task so it can run asynchronously.",
        inputSchema: heavyQueueEnqueueInput.shape,
      },
      async (input: unknown) => {
        const parsed = heavyQueueEnqueueInput.parse(input);
        const item = await session.enqueueHeavyTask(parsed);
        return jsonResponse({ item });
      },
    );

    const heavyQueueUpdateInput = z.object({
      id: z.string().min(1),
      status: z.enum(["queued", "running", "completed", "cancelled"]).optional(),
      notes: z.string().optional(),
      command: z.string().optional(),
    });

    server.registerTool(
      "heavy_queue_update",
      {
        description: "Update the status of a heavy/background task.",
        inputSchema: heavyQueueUpdateInput.shape,
      },
      async (input: unknown) => {
        const parsed = heavyQueueUpdateInput.parse(input);
        const item = await session.updateHeavyTask(parsed);
        return jsonResponse({ item });
      },
    );

    server.registerTool(
      "heavy_queue_list",
      {
        description: "List queued heavy/background tasks and their status.",
        inputSchema: z.object({}).shape,
      },
      async (_input: unknown) => {
        const items = await session.listHeavyTasks();
        return jsonResponse({ items });
      },
    );

    const artifactRecordInput = z.object({
      type: z.string(),
      path: z.string(),
      metadata: z.record(z.any()).optional(),
    });

    server.registerTool(
      "artifact_record",
      {
        description: "Register an artifact path for later reference.",
        inputSchema: artifactRecordInput.shape,
      },
      async (input: unknown) => {
        const parsed = artifactRecordInput.parse(input);
        await session.recordArtifact(parsed.type, parsed.path, parsed.metadata);
        return jsonResponse({ ok: true });
      },
    );

    server.registerTool(
      "codex_commands",
      {
        description: "List known Codex CLI commands and recommended usage.",
        inputSchema: z.object({}).shape,
      },
      async (_input: unknown) => {
        return jsonResponse({
          profile: session.profile,
          commands: describeCodexCommands(),
        });
      },
    );

    const transport = new StdioServerTransport();
    await server.connect(transport as unknown as { start: () => Promise<void>; close: () => Promise<void>; send: (message: unknown) => Promise<void> });
    logInfo("WVO MCP server ready", {
      workspace: session.workspaceRoot,
      profile: session.profile,
    });
  } catch (error) {
    runtime.stop();
    throw error;
  }
}

main().catch((error) => {
  logError("Fatal MCP server error", {
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  });
  process.exit(1);
});
