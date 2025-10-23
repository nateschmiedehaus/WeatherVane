/**
 * Worker Entry Point with DRY_RUN Safeguards
 *
 * This module implements a dedicated worker that:
 * 1. Routes RPCs through proper tool dispatchers (WorkerToolRouter or ExecutorToolRouter)
 * 2. Enforces DRY_RUN=1 mode by:
 *    - Opening state DB read-only via StateMachine({ readonly: true })
 *    - Rejecting all mutating tools that aren't in the DRY_RUN_SAFE_TOOLS allowlist
 *    - Throwing DryRunViolation errors with helpful upgrade guidance
 * 3. Confirms legacy behaviour when DRY_RUN=0 (all tools allowed)
 *
 * When DRY_RUN=1:
 * - Orchestrator workers: 7 safe tools (status, planning, reading)
 * - Executor workers: 1 safe tool (fs_read only)
 * - All mutations rejected with clear error message
 *
 * State Database Integration:
 * - StateMachine is initialized with readonly: true when DRY_RUN=1
 * - All writes are guarded by assertWritable() in StateMachine
 * - Tool router handlers also check tool allowlist before execution
 * - Double-protection ensures no accidental mutations
 */

import process from "node:process";

import { OrchestratorRuntime } from "../orchestrator/orchestrator_runtime.js";
import { SessionContext } from "../session.js";
import { AuthChecker } from "../utils/auth_checker.js";
import { resolveWorkspaceRoot } from "../utils/config.js";
import { createDryRunError, isDryRunEnabled } from "../utils/dry_run.js";
import { SERVER_VERSION } from "../utils/version.js";
import type { WorkerOutgoingMessage, WorkerRpcErrorPayload } from "./protocol.js";
import { WorkerToolRouter } from "./tool_router.js";
import { ExecutorToolRouter, type RunToolPayload } from "./executor_router.js";

type WorkerRole = "orchestrator" | "executor";
type RunToolMessage = {
  name: string;
  input?: unknown;
  idempotencyKey?: string;
};

process.on("uncaughtException", (error) => {
  console.error("Worker uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Worker unhandled rejection", reason);
  process.exit(1);
});

const workerRole = (process.env.WVO_WORKER_ROLE as WorkerRole | undefined) ?? "orchestrator";

if (workerRole === "executor") {
  startExecutorWorker();
} else {
  startOrchestratorWorker();
}

function startOrchestratorWorker(): void {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const workspaceRoot = resolveWorkspaceRoot();

  // Initialize OrchestratorRuntime which internally manages StateMachine
  // If DRY_RUN=1, StateMachine will open DB in read-only mode
  const runtime = new OrchestratorRuntime(workspaceRoot, {
    targetCodexRatio: 5,
  });

  const session = new SessionContext(runtime);
  const authChecker = new AuthChecker();
  const router = new WorkerToolRouter(session, runtime, authChecker);
  const dryRunEnabled = isDryRunEnabled();
  const workerFlags = {
    dryRun: dryRunEnabled,
  };

  /**
   * DRY_RUN Safe Tools for Orchestrator Workers
   *
   * When DRY_RUN=1, only these tools are allowed because they don't mutate state:
   * - orchestrator_status: Read operations manager snapshot
   * - auth_status: Check provider authentication
   * - plan_next: Read and filter roadmap tasks
   * - fs_read: Read files from workspace
   * - autopilot_status: Get autopilot state and consensus metrics
   * - heavy_queue_list: List queued background tasks
   * - codex_commands: Describe available Codex CLI commands
   *
   * All other tools (plan_update, fs_write, cmd_run, etc.) are rejected with DryRunViolation.
   */
  const DRY_RUN_SAFE_TOOLS = new Set<string>([
    "orchestrator_status",
    "auth_status",
    "plan_next",
    "fs_read",
    "autopilot_status",
    "heavy_queue_list",
    "codex_commands",
  ]);

  /**
   * Validate tool is in safe allowlist when DRY_RUN=1.
   * Throws DryRunViolation with helpful message if tool tries to mutate state.
   */
  function assertDryRunToolAllowed(name: string): void {
    if (!DRY_RUN_SAFE_TOOLS.has(name)) {
      throw createDryRunError(`tool:${name}`);
    }
  }

  function sendReady(): void {
    process.send?.({
      type: "ready",
      startedAt,
      version: SERVER_VERSION,
      flags: workerFlags,
    });
  }

  function formatErrorPayload(error: unknown): WorkerRpcErrorPayload {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
      };
    }
    if (typeof error === "string") {
      return { message: error };
    }
    return { message: "Unknown worker error" };
  }

  function sendSuccess(id: string, result: unknown, startedMs: number): void {
    process.send?.({
      id,
      ok: true,
      result,
      tookMs: Date.now() - startedMs,
    });
  }

  function sendFailure(id: string, error: unknown, startedMs: number): void {
    process.send?.({
      id,
      ok: false,
      error: formatErrorPayload(error),
      tookMs: Date.now() - startedMs,
    });
  }

  async function handleHealthRequest(message: WorkerOutgoingMessage, startedMs: number) {
    const uptimeMs = Math.max(0, Date.now() - startedAtMs);
    const uptimeSeconds = Number((uptimeMs / 1000).toFixed(3));
    sendSuccess(
      message.id,
      {
        ok: true,
        role: workerRole,
        pid: process.pid,
        startedAt,
        version: SERVER_VERSION,
        dryRun: workerFlags.dryRun,
        workspaceRoot,
        uptimeMs,
        uptimeSeconds,
        flags: workerFlags,
      },
      startedMs,
    );
  }

  async function handlePlanRequest(message: WorkerOutgoingMessage, startedMs: number) {
    const result = await router.plan(message.params);
    sendSuccess(message.id, result, startedMs);
  }

  async function handleDispatchRequest(message: WorkerOutgoingMessage, startedMs: number) {
    const result = await router.dispatch(message.params);
    sendSuccess(message.id, result, startedMs);
  }

  async function handleVerifyRequest(message: WorkerOutgoingMessage, startedMs: number) {
    const result = await router.verify(message.params);
    sendSuccess(message.id, result, startedMs);
  }

  async function handleReportMoRequest(message: WorkerOutgoingMessage, startedMs: number) {
    const result = await router.reportMo(message.params);
    sendSuccess(message.id, result, startedMs);
  }

  /**
   * Handle runTool RPC for orchestrator workers.
   *
   * Enforcement:
   * 1. Validate payload structure
   * 2. If DRY_RUN=1, check tool is in DRY_RUN_SAFE_TOOLS allowlist
   * 3. Route to WorkerToolRouter which also enforces DRY_RUN via idempotency middleware
   * 4. State mutations are additionally guarded by StateMachine.assertWritable()
   *
   * Double-protection: Both worker and tool router enforce DRY_RUN.
   */
  async function handleRunToolRequest(message: WorkerOutgoingMessage, startedMs: number) {
    const payload = message.params;
    if (!payload || typeof payload !== "object") {
      throw new Error("runTool payload must be an object");
    }
    const { name, input, idempotencyKey } = payload as RunToolMessage;
    if (typeof name !== "string" || !name.length) {
      throw new Error("runTool payload requires a tool name");
    }
    // First guard: Reject unsupported tools when DRY_RUN=1
    if (dryRunEnabled) {
      assertDryRunToolAllowed(name);
    }
    // Tool router handles execution; state mutations are guarded by StateMachine
    const result = await router.runTool({ name, input, idempotencyKey });
    sendSuccess(message.id, result, startedMs);
  }

  async function handleRequest(message: WorkerOutgoingMessage): Promise<void> {
    const startedMs = Date.now();
    try {
      switch (message.method) {
        case "health":
          await handleHealthRequest(message, startedMs);
          break;
        case "plan":
          await handlePlanRequest(message, startedMs);
          break;
        case "dispatch":
          await handleDispatchRequest(message, startedMs);
          break;
        case "runTool":
          await handleRunToolRequest(message, startedMs);
          break;
        case "verify":
          await handleVerifyRequest(message, startedMs);
          break;
        case "report.mo":
          await handleReportMoRequest(message, startedMs);
          break;
        default:
          throw new Error(`Unknown worker method ${message.method}`);
      }
    } catch (error) {
      sendFailure(message.id, error, startedMs);
    }
  }

  process.on("message", (raw) => {
    if (!raw || typeof raw !== "object") {
      return;
    }
    const message = raw as WorkerOutgoingMessage;
    if (typeof message.id !== "string" || typeof message.method !== "string") {
      return;
    }
    void handleRequest(message);
  });

  process.on("disconnect", () => {
    runtime.stop();
    process.exit(0);
  });

  process.once("SIGINT", () => {
    runtime.stop();
    process.exit(0);
  });

  process.once("SIGTERM", () => {
    runtime.stop();
    process.exit(0);
  });

  sendReady();
}

function startExecutorWorker(): void {
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const workspaceRoot = resolveWorkspaceRoot();
  const dryRunEnabled = isDryRunEnabled();
  const workerFlags = {
    dryRun: dryRunEnabled,
  };

  /**
   * DRY_RUN Safe Tools for Executor Workers
   *
   * Executor workers have minimal capability when DRY_RUN=1:
   * - fs_read: Read files from workspace (inspection only)
   *
   * All other tools (cmd_run, fs_write) are rejected with DryRunViolation.
   * Executor workers don't have access to orchestration tools like plan_next.
   */
  const DRY_RUN_SAFE_TOOLS = new Set<string>([
    "fs_read",
  ]);

  // Lightweight session without orchestrator runtime (executors don't manage state)
  const session = new SessionContext();
  const router = new ExecutorToolRouter(session);

  /**
   * Validate tool is in safe allowlist when DRY_RUN=1.
   * Throws DryRunViolation with helpful message if tool tries to execute commands or write files.
   */
  function assertDryRunToolAllowed(name: string): void {
    if (!DRY_RUN_SAFE_TOOLS.has(name)) {
      throw createDryRunError(`tool:${name}`);
    }
  }

  function formatErrorPayload(error: unknown): WorkerRpcErrorPayload {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
      };
    }
    if (typeof error === "string") {
      return { message: error };
    }
    return { message: "Unknown worker error" };
  }

  function sendSuccess(id: string, result: unknown, startedMs: number): void {
    process.send?.({
      id,
      ok: true,
      result,
      tookMs: Date.now() - startedMs,
    });
  }

  function sendFailure(id: string, error: unknown, startedMs: number): void {
    process.send?.({
      id,
      ok: false,
      error: formatErrorPayload(error),
      tookMs: Date.now() - startedMs,
    });
  }

  function sendReady(): void {
    process.send?.({
      type: "ready",
      startedAt,
      version: SERVER_VERSION,
      flags: workerFlags,
    });
  }

  /**
   * Handle runTool RPC for executor workers.
   *
   * Enforcement:
   * 1. Validate payload structure
   * 2. If DRY_RUN=1, only allow fs_read (inspection only)
   * 3. Reject cmd_run and fs_write which would execute commands or mutate files
   *
   * Executor workers have minimal scope: they only read files when in dry-run mode.
   */
  async function handleRunToolRequest(message: WorkerOutgoingMessage, startedMs: number) {
    const payload = message.params;
    if (!payload || typeof payload !== "object") {
      throw new Error("runTool payload must be an object");
    }
    const cast = payload as RunToolPayload;
    if (typeof cast.name !== "string" || cast.name.length === 0) {
      throw new Error("runTool payload requires a tool name");
    }
    // Guard: Reject mutating tools when DRY_RUN=1
    if (dryRunEnabled) {
      assertDryRunToolAllowed(cast.name);
    }
    const result = await router.runTool(cast);
    sendSuccess(message.id, result, startedMs);
  }

  async function handleHealthRequest(message: WorkerOutgoingMessage, startedMs: number) {
    const uptimeMs = Math.max(0, Date.now() - startedAtMs);
    const uptimeSeconds = Number((uptimeMs / 1000).toFixed(3));
    sendSuccess(
      message.id,
      {
        ok: true,
        role: workerRole,
        pid: process.pid,
        startedAt,
        version: SERVER_VERSION,
        dryRun: workerFlags.dryRun,
        workspaceRoot,
        uptimeMs,
        uptimeSeconds,
        flags: workerFlags,
      },
      startedMs,
    );
  }

  async function handleRequest(message: WorkerOutgoingMessage): Promise<void> {
    const startedMs = Date.now();
    try {
      switch (message.method) {
        case "runTool":
          await handleRunToolRequest(message, startedMs);
          break;
        case "health":
          await handleHealthRequest(message, startedMs);
          break;
        default:
          throw new Error(`executor_unsupported_method:${message.method}`);
      }
    } catch (error) {
      sendFailure(message.id, error, startedMs);
    }
  }

  process.on("message", (raw) => {
    if (!raw || typeof raw !== "object") {
      return;
    }
    const message = raw as WorkerOutgoingMessage;
    if (typeof message.id !== "string" || typeof message.method !== "string") {
      return;
    }
    void handleRequest(message);
  });

  process.on("disconnect", () => {
    process.exit(0);
  });

  process.once("SIGINT", () => {
    process.exit(0);
  });

  process.once("SIGTERM", () => {
    process.exit(0);
  });

  sendReady();
}
