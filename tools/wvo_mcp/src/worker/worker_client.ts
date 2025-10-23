import type { WorkerManager } from "./worker_manager.js";
import type { WorkerCallOptions } from "./protocol.js";
import { logError } from "../telemetry/logger.js";
import { withSpan } from "../telemetry/tracing.js";

const EXECUTOR_ROUTED_TOOLS = new Set([
  "cmd_run",
  "fs_read",
  "fs_write",
]);

export interface WorkerErrorPayload {
  error: string;
  method: string;
  code?: string;
  details?: unknown;
}

const UNKNOWN_ERROR_MESSAGE = "Worker call failed with unknown error";

function normaliseErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  return UNKNOWN_ERROR_MESSAGE;
}

function extractErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) {
      return code;
    }
  }
  return undefined;
}

function extractErrorDetails(error: unknown): unknown {
  if (error && typeof error === "object" && "details" in error) {
    return (error as { details?: unknown }).details;
  }
  if (error instanceof Error && error.stack) {
    return { stack: error.stack };
  }
  return undefined;
}

export function isWorkerErrorPayload(value: unknown): value is WorkerErrorPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.error === "string" && typeof candidate.method === "string";
}

export interface WorkerToolCallOptions extends WorkerCallOptions {
  idempotencyKey?: string;
}

export class WorkerClient {
  constructor(private readonly manager: WorkerManager) {}

  async call<T>(
    method: string,
    params?: unknown,
    options?: WorkerCallOptions,
  ): Promise<T | WorkerErrorPayload> {
    return withSpan<T | WorkerErrorPayload>(
      "worker.client.call",
      async (span) => {
        try {
          const worker = this.manager.getActive();
          span?.setAttribute("worker.method", method);
          if (typeof worker.pid === "number") {
            span?.setAttribute("worker.pid", worker.pid);
          }
          return await worker.call<T>(method, params, options);
        } catch (error: unknown) {
          return this.handleError(method, error);
        }
      },
      {
        attributes: {
          "worker.client.method": method,
        },
      },
    );
  }

  async callTool<T>(
    name: string,
    input?: unknown,
    options?: WorkerToolCallOptions,
  ): Promise<T | WorkerErrorPayload> {
    const method = `runTool:${name}`;
    const idempotencyKey = options?.idempotencyKey;
    return withSpan<T | WorkerErrorPayload>(
      "worker.client.callTool",
      async (span) => {
        span?.setAttribute("worker.tool", name);

        const executor = this.selectWorkerForTool(name);
        if (executor) {
          span?.setAttribute("worker.role", "executor");
          try {
            if (typeof executor.pid === "number") {
              span?.setAttribute("worker.pid", executor.pid);
            }
            return await executor.call<T>(
              "runTool",
              { name, input, idempotencyKey },
              options,
            );
          } catch (error) {
            if (this.shouldFallbackToActive(error)) {
              const active = this.manager.getActive();
              span?.setAttribute("worker.role", "active");
              if (typeof active.pid === "number") {
                span?.setAttribute("worker.pid", active.pid);
              }
              return await active.call<T>(
                "runTool",
                { name, input, idempotencyKey },
                options,
              );
            }
            return this.handleError(method, error);
          }
        }

        try {
          const active = this.manager.getActive();
          span?.setAttribute("worker.role", "active");
          if (typeof active.pid === "number") {
            span?.setAttribute("worker.pid", active.pid);
          }
          return await active.call<T>(
            "runTool",
            { name, input, idempotencyKey },
            options,
          );
        } catch (error: unknown) {
          return this.handleError(method, error);
        }
      },
      {
        attributes: {
          "worker.tool": name,
        },
      },
    );
  }

  private selectWorkerForTool(name: string) {
    if (EXECUTOR_ROUTED_TOOLS.has(name)) {
      const executor = this.manager.getExecutor();
      if (executor) {
        return executor;
      }
    }
    return null;
  }

  private shouldFallbackToActive(error: unknown): boolean {
    if (!error) {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error);
    if (!message) {
      return false;
    }
    return (
      message.includes('executor_unsupported') ||
      message.includes('unknown method') ||
      message.includes('unknown tool')
    );
  }

  private handleError(method: string, error: unknown): WorkerErrorPayload {
    const message = normaliseErrorMessage(error);
    const payload: WorkerErrorPayload = {
      error: message,
      method,
    };

    const code = extractErrorCode(error);
    if (code) {
      payload.code = code;
    }

    const details = extractErrorDetails(error);
    if (details !== undefined) {
      payload.details = details;
    }

    logError("Worker RPC failed", {
      method,
      message,
      code: payload.code,
      details: payload.details,
    });

    return payload;
  }
}
