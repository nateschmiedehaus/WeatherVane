/**
 * Worker Call Wrapper with Observability
 *
 * Wraps all worker tool calls with:
 * - Resource budget acquisition and release
 * - Automatic OTel span emission
 * - Timeout enforcement
 * - Structured JSON logging with call metadata
 * - Error handling with graceful degradation
 *
 * Usage:
 * const result = await withWorkerCallObservability(
 *   taskId,
 *   'tool_call',
 *   () => routerInstance.runTool(name, input),
 *   { toolName: name, inputSize: JSON.stringify(input).length }
 * );
 */

import { getResourceBudgetManager, type WorkerCallContext } from "./resource_budgets.js";
import { logInfo, logError, logWarning } from "../telemetry/logger.js";
import { recordSpanEvent, recordSpanError } from "../telemetry/otel_spans.js";

/**
 * Options for worker call observability wrapper
 */
export interface WorkerCallWrapperOptions {
  /**
   * Lane categorization for concurrency control
   * Examples: 'tool_call', 'file_read', 'file_write', 'critic'
   */
  lane?: string;

  /**
   * Custom timeout in milliseconds (overrides default)
   */
  timeoutMs?: number;

  /**
   * Additional metadata to include in spans and logs
   */
  metadata?: Record<string, unknown>;

  /**
   * Whether to throw on resource limit rejection
   * If false, falls back to direct execution without resource guards
   */
  throwOnResourceLimitExceeded?: boolean;

  /**
   * Whether to emit structured JSON log at completion
   */
  emitMetricsLog?: boolean;
}

const DEFAULT_LANE = "tool_call";
const DEFAULT_OPTIONS: WorkerCallWrapperOptions = {
  lane: DEFAULT_LANE,
  throwOnResourceLimitExceeded: true,
  emitMetricsLog: true,
};

/**
 * Wraps a worker call with resource budget management and observability
 *
 * @param taskId Identifier for the task being executed
 * @param fn The async function to execute
 * @param options Configuration for observability behavior
 * @returns Result of the function, or null if resource limits rejected execution
 *
 * @example
 * const result = await withWorkerCallObservability(
 *   "task-123",
 *   async () => await router.runTool("forecast_stitch", input),
 *   {
 *     lane: "critic",
 *     timeoutMs: 600000,
 *     metadata: { toolName: "forecast_stitch", inputSize: 1024 }
 *   }
 * );
 */
export async function withWorkerCallObservability<T>(
  taskId: string,
  fn: () => Promise<T>,
  options?: Partial<WorkerCallWrapperOptions>,
): Promise<T | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const manager = getResourceBudgetManager();
  let context: WorkerCallContext | null = null;

  try {
    // Attempt to acquire resource slot
    context = await manager.acquireSlot(taskId, opts.lane ?? DEFAULT_LANE, opts.timeoutMs, {
      ...opts.metadata,
      wrapper: "worker_call_observability",
    });

    if (!context) {
      if (opts.throwOnResourceLimitExceeded) {
        const err = new Error(
          `Resource limit exceeded: unable to acquire slot for lane '${opts.lane ?? DEFAULT_LANE}'`,
        );
        logError("Resource limit rejected worker call", {
          taskId,
          lane: opts.lane,
          error: err.message,
        });
        throw err;
      } else {
        // Graceful degradation: execute without resource guards
        logWarning("Resource limit exceeded, executing without guards", {
          taskId,
          lane: opts.lane,
        });
        return await fn();
      }
    }

    // Record span event: execution started
    recordSpanEvent(context.span, "execution_started", {
      taskId,
      lane: context.lane,
      ...opts.metadata,
    });

    // Execute the function
    const result = await fn();

    // Release slot with success
    manager.releaseSlot(context, true);
    recordSpanEvent(context.span, "execution_succeeded");

    if (opts.emitMetricsLog) {
      logInfo("Worker call completed successfully", {
        taskId,
        lane: context.lane,
        durationMs: Date.now() - context.startedAtMs,
        ...opts.metadata,
      });
    }

    return result;
  } catch (error) {
    // Release slot with failure
    if (context) {
      manager.releaseSlot(context, false, error);
      recordSpanError(context.span, error, {
        taskId,
        lane: context.lane,
      });
    }

    logError("Worker call failed", {
      taskId,
      lane: opts.lane,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      ...opts.metadata,
    });

    throw error;
  }
}

/**
 * Synchronous wrapper for worker calls
 * Acquires resources but doesn't wait for timeout
 */
export function withWorkerCallObservabilitySync<T>(
  taskId: string,
  fn: () => T,
  options?: Partial<WorkerCallWrapperOptions>,
): T | null {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const manager = getResourceBudgetManager();

  try {
    // For sync operations, we check memory and concurrency but don't set timeout
    const status = manager.getConcurrencyStatus();
    const lane = opts.lane ?? DEFAULT_LANE;

    // Check if lane would have capacity (approximate check)
    // This is a quick check; actual slot acquisition is async
    if (status.global.active >= status.global.limit) {
      if (opts.throwOnResourceLimitExceeded) {
        throw new Error(`Global concurrency limit exceeded: ${status.global.active}/${status.global.limit}`);
      } else {
        logWarning("Global concurrency limit, executing without guards", { taskId, lane });
        return fn();
      }
    }

    const result = fn();

    logInfo("Worker call (sync) completed", {
      taskId,
      lane,
      ...opts.metadata,
    });

    return result;
  } catch (error) {
    logError("Worker call (sync) failed", {
      taskId,
      lane: opts.lane,
      error: error instanceof Error ? error.message : String(error),
      ...opts.metadata,
    });
    throw error;
  }
}

/**
 * Batched worker calls with shared resource slot
 * Useful for processing multiple items with a single timeout
 *
 * @example
 * const wrapper = createBatchWorkerCallWrapper("task-123", "file_write", { timeoutMs: 600000 });
 * try {
 *   for (const item of items) {
 *     const result = await wrapper.execute(() => processItem(item));
 *   }
 * } finally {
 *   wrapper.release(true);
 * }
 */
export function createBatchWorkerCallWrapper(
  taskId: string,
  lane?: string,
  options?: Partial<WorkerCallWrapperOptions>,
) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const manager = getResourceBudgetManager();
  let context: WorkerCallContext | null = null;
  let itemCount = 0;
  let errorCount = 0;

  return {
    /**
     * Execute a single item within the batch
     */
    async execute<T>(fn: () => Promise<T>): Promise<T> {
      if (!context) {
        throw new Error("Batch wrapper not initialized; call release() first");
      }

      itemCount++;
      try {
        const result = await fn();
        recordSpanEvent(context.span, "batch_item_processed", { itemNumber: itemCount });
        return result;
      } catch (error) {
        errorCount++;
        recordSpanEvent(context.span, "batch_item_failed", {
          itemNumber: itemCount,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },

    /**
     * Get the current context (if initialized)
     */
    getContext(): WorkerCallContext | null {
      return context;
    },

    /**
     * Initialize the batch (acquire resource slot)
     */
    async init(): Promise<boolean> {
      if (context) {
        return true; // Already initialized
      }

      context = await manager.acquireSlot(
        taskId,
        lane ?? DEFAULT_LANE,
        opts.timeoutMs,
        {
          ...opts.metadata,
          wrapper: "batch_worker_call",
          batch: true,
        },
      );

      if (!context) {
        if (opts.throwOnResourceLimitExceeded) {
          throw new Error(`Failed to acquire batch slot for lane '${lane ?? DEFAULT_LANE}'`);
        }
        logWarning("Resource limit for batch operation", { taskId, lane });
        return false;
      }

      recordSpanEvent(context.span, "batch_started", { taskId });
      return true;
    },

    /**
     * Release the batch (release resource slot)
     */
    release(success: boolean, error?: unknown): void {
      if (!context) {
        return;
      }

      recordSpanEvent(context.span, "batch_completed", {
        itemCount,
        errorCount,
        successRate: itemCount > 0 ? ((itemCount - errorCount) / itemCount).toFixed(2) : "N/A",
      });

      manager.releaseSlot(context, success, error);

      if (opts.emitMetricsLog) {
        logInfo("Batch worker call completed", {
          taskId,
          lane: context.lane,
          itemCount,
          errorCount,
          durationMs: Date.now() - context.startedAtMs,
          ...opts.metadata,
        });
      }

      context = null;
    },
  };
}

/**
 * Request-scoped wrapper for setting up observability context
 * Useful for multi-call operations that share a single timeout/resource budget
 */
export async function withRequestScope<T>(
  taskId: string,
  fn: (scope: { taskId: string; getContext: () => WorkerCallContext | null }) => Promise<T>,
  options?: Partial<WorkerCallWrapperOptions>,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const manager = getResourceBudgetManager();

  const context = await manager.acquireSlot(
    taskId,
    opts.lane ?? DEFAULT_LANE,
    opts.timeoutMs,
    opts.metadata,
  );

  if (!context) {
    if (opts.throwOnResourceLimitExceeded) {
      throw new Error(`Failed to acquire request scope for taskId '${taskId}'`);
    }
    // Graceful fallback
    return fn({ taskId, getContext: () => null });
  }

  try {
    const result = await fn({ taskId, getContext: () => context });
    manager.releaseSlot(context, true);
    return result;
  } catch (error) {
    manager.releaseSlot(context, false, error);
    throw error;
  }
}
