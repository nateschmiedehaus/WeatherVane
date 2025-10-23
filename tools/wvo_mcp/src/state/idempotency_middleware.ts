import { IdempotencyStore } from "./idempotency_cache.js";

/**
 * Idempotency Middleware
 *
 * Wraps mutating tool handlers to provide request deduplication.
 * - Intercepts requests before processing
 * - Returns cached response for duplicate requests
 * - Records outcomes for future deduplication
 *
 * Usage:
 *   const wrapped = withIdempotency(
 *     'fs_write',
 *     (input) => handler(input),
 *     store
 *   );
 *   const result = await wrapped(input, idempotencyKey);
 */

export interface IdempotencyOptions {
  toolName: string;
  enabled?: boolean;
}

export type ToolHandler = (input: unknown) => Promise<unknown>;

export type WrappedHandler = (
  input: unknown,
  idempotencyKey?: string,
) => Promise<unknown>;

/**
 * Wrap a tool handler with idempotency protection
 */
export function withIdempotency(
  toolName: string,
  handler: ToolHandler,
  store: IdempotencyStore,
  enabled = true,
): WrappedHandler {
  return async (input: unknown, idempotencyKey?: string) => {
    // Skip idempotency if disabled
    if (!enabled) {
      return handler(input);
    }

    // Check if we've already processed this request
    const { isNewRequest, existingResponse, existingError } = store.startRequest(
      toolName,
      input,
      idempotencyKey,
    );

    // Return cached response for duplicate requests
    if (!isNewRequest) {
      if (existingError) {
        const error = new Error(existingError);
        error.name = "CachedIdempotencyError";
        throw error;
      }
      return existingResponse;
    }

    // Process new request
    try {
      const result = await handler(input);
      store.recordSuccess(toolName, input, result, idempotencyKey);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      store.recordFailure(toolName, input, errorMsg, idempotencyKey);
      throw error;
    }
  };
}

/**
 * Create a wrapper that applies idempotency to multiple tools
 */
export class IdempotencyMiddleware {
  constructor(
    private readonly store: IdempotencyStore,
    private readonly enabled = true,
  ) {}

  /**
   * Wrap a single tool handler
   */
  wrap(toolName: string, handler: ToolHandler): WrappedHandler {
    return withIdempotency(toolName, handler, this.store, this.enabled);
  }

  /**
   * Create wrapped handlers for multiple tools
   */
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

  /**
   * Enable/disable idempotency
   */
  setEnabled(enabled: boolean): void {
    Object.defineProperty(this, "enabled", {
      value: enabled,
      writable: true,
    });
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return this.store.getStats();
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.store.destroy();
  }
}
