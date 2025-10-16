import process from "node:process";

import { OrchestratorRuntime } from "../orchestrator/orchestrator_runtime.js";
import { SessionContext } from "../session.js";
import { AuthChecker } from "../utils/auth_checker.js";
import { resolveWorkspaceRoot } from "../utils/config.js";
import { createDryRunError, isDryRunEnabled } from "../utils/dry_run.js";
import { SERVER_VERSION } from "../utils/version.js";
import type { WorkerOutgoingMessage, WorkerRpcErrorPayload } from "./protocol.js";
import { WorkerToolRouter } from "./tool_router.js";

type RunToolMessage = {
  name: string;
  input?: unknown;
};

process.on("uncaughtException", (error) => {
  console.error("Worker uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Worker unhandled rejection", reason);
  process.exit(1);
});

const startedAtMs = Date.now();
const startedAt = new Date(startedAtMs).toISOString();
const workspaceRoot = resolveWorkspaceRoot();
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

const DRY_RUN_SAFE_TOOLS = new Set<string>([
  "orchestrator_status",
  "auth_status",
  "plan_next",
  "fs_read",
  "autopilot_status",
  "heavy_queue_list",
  "codex_commands",
]);

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
  sendSuccess(message.id, {
    ok: true,
    role: process.env.WVO_WORKER_ROLE ?? "unknown",
    pid: process.pid,
    startedAt,
    version: SERVER_VERSION,
    dryRun: workerFlags.dryRun,
    workspaceRoot,
    uptimeMs,
    uptimeSeconds,
    flags: workerFlags,
  }, startedMs);
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

async function handleRunToolRequest(message: WorkerOutgoingMessage, startedMs: number) {
  const payload = message.params;
  if (!payload || typeof payload !== "object") {
    throw new Error("runTool payload must be an object");
  }
  const { name, input } = payload as RunToolMessage;
  if (typeof name !== "string" || !name.length) {
    throw new Error("runTool payload requires a tool name");
  }
  if (dryRunEnabled) {
    assertDryRunToolAllowed(name);
  }
  const result = await router.runTool({ name, input });
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
