import type { WorkerManager } from "./worker_manager.js";
import type { WorkerCallOptions } from "./protocol.js";
import { logError } from "../telemetry/logger.js";
import { withSpan } from "../telemetry/tracing.js";

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
    options?: WorkerCallOptions,
  ): Promise<T | WorkerErrorPayload> {
    const method = `runTool:${name}`;
    return withSpan<T | WorkerErrorPayload>(
      "worker.client.callTool",
      async (span) => {
        try {
          const worker = this.manager.getActive();
          span?.setAttribute("worker.tool", name);
          if (typeof worker.pid === "number") {
            span?.setAttribute("worker.pid", worker.pid);
          }
          return await worker.call<T>("runTool", { name, input }, options);
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
