import { IdempotencyStore } from "./idempotency_cache.js";
import type { IdempotencyCacheV2 } from "./idempotency_cache_v2.js";

export type ToolHandler = (input: unknown) => Promise<unknown>;

export type WrappedHandler = (
  input: unknown,
  idempotencyKey?: string,
) => Promise<unknown>;

type MaybePromise<T> = T | Promise<T>;

export interface IdempotencyLayer {
  startRequest(
    toolName: string,
    input: unknown,
    idempotencyKey?: string,
  ): MaybePromise<{
    isNewRequest: boolean;
    existingResponse?: unknown;
    existingError?: string;
  }>;
  recordSuccess(
    toolName: string,
    input: unknown,
    response: unknown,
    idempotencyKey?: string,
  ): MaybePromise<void>;
  recordFailure(
    toolName: string,
    input: unknown,
    error: string | Error,
    idempotencyKey?: string,
  ): MaybePromise<void>;
  clear(): MaybePromise<void>;
  destroy(): MaybePromise<void>;
  getStats(): MaybePromise<{
    size: number;
    processingCount: number;
    completedCount: number;
    failedCount: number;
    maxEntries?: number;
  }>;
}

function isDryRunMode(): boolean {
  return process.env.WVO_DRY_RUN === "1";
}

function normalizeError(error: string | Error): string {
  if (error instanceof Error) {
    return error.message;
  }
  return error;
}

function isLayerCandidate(store: unknown): store is IdempotencyLayer {
  return (
    !!store &&
    typeof (store as IdempotencyLayer).startRequest === "function" &&
    typeof (store as IdempotencyLayer).recordSuccess === "function" &&
    typeof (store as IdempotencyLayer).recordFailure === "function"
  );
}

export type IdempotencyStoreLike =
  | IdempotencyStore
  | IdempotencyCacheV2
  | IdempotencyLayer;

export function createIdempotencyLayer(
  store: IdempotencyStoreLike,
): IdempotencyLayer {
  if (store instanceof IdempotencyStore) {
    return {
      startRequest: (toolName, input, idempotencyKey) =>
        store.startRequest(toolName, input, idempotencyKey),
      recordSuccess: (toolName, input, response, idempotencyKey) =>
        store.recordSuccess(toolName, input, response, idempotencyKey),
      recordFailure: (toolName, input, error, idempotencyKey) =>
        store.recordFailure(toolName, input, error, idempotencyKey),
      clear: () => store.clear(),
      destroy: () => store.destroy(),
      getStats: () => store.getStats(),
    };
  }

  if (isLayerCandidate(store)) {
    return store;
  }

  throw new Error("Unsupported idempotency store provided");
}

export function withIdempotency(
  toolName: string,
  handler: ToolHandler,
  store: IdempotencyStoreLike,
  enabled = true,
): WrappedHandler {
  const layer = createIdempotencyLayer(store);

  return async (input: unknown, idempotencyKey?: string) => {
    if (!enabled || isDryRunMode()) {
      return handler(input);
    }

    const { isNewRequest, existingResponse, existingError } =
      await layer.startRequest(toolName, input, idempotencyKey);

    if (!isNewRequest) {
      if (existingError) {
        const error = new Error(existingError);
        error.name = "CachedIdempotencyError";
        throw error;
      }
      return existingResponse;
    }

    try {
      const result = await handler(input);
      await layer.recordSuccess(toolName, input, result, idempotencyKey);
      return result;
    } catch (error) {
      await layer.recordFailure(
        toolName,
        input,
        normalizeError(
          error instanceof Error ? error : new Error(String(error)),
        ),
        idempotencyKey,
      );
      throw error;
    }
  };
}

export class IdempotencyMiddleware {
  private readonly layer: IdempotencyLayer;

  constructor(
    store: IdempotencyStoreLike = new IdempotencyStore(),
    private enabled = true,
  ) {
    this.layer = createIdempotencyLayer(store);
  }

  wrap(toolName: string, handler: ToolHandler): WrappedHandler {
    return withIdempotency(toolName, handler, this.layer, this.enabled);
  }

  wrapHandlers(
    toolHandlers: Map<string, ToolHandler>,
  ): Map<string, WrappedHandler> {
    const wrapped = new Map<string, WrappedHandler>();
    const entries = Array.from(toolHandlers.entries());
    for (let i = 0; i < entries.length; i++) {
      const [toolName, handler] = entries[i];
      wrapped.set(toolName, this.wrap(toolName, handler));
    }
    return wrapped;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  async getStats() {
    return this.layer.getStats();
  }

  async clear(): Promise<void> {
    await this.layer.clear();
  }

  async destroy(): Promise<void> {
    await this.layer.destroy();
  }
}
