/**
 * OpenTelemetry Spans Wrapper
 *
 * Provides a safe, decorator-based approach to adding OpenTelemetry-style
 * distributed tracing spans to all WVO operations without modifying core logic.
 *
 * Features:
 * - Automatic trace ID propagation via AsyncLocalStorage
 * - Span context attributes (operation name, service, version, environment)
 * - Exception recording with stack traces
 * - Event tracking for milestone operations
 * - Configurable sampling and export behavior
 * - Graceful degradation when tracing is disabled
 */

import { withSpan, startSpan, endSpan, type SpanHandle, initTracing } from "./tracing.js";
import { logInfo, logWarning } from "./logger.js";

// Re-export SpanHandle for external consumers
export type { SpanHandle };

/**
 * Standard attributes added to all spans for context
 */
export interface SpanContextAttributes {
  service?: string;
  version?: string;
  environment?: string;
  userId?: string;
  tenantId?: string;
  correlationId?: string;
  [key: string]: unknown;
}

/**
 * Configuration for OtelSpans behavior
 */
export interface OtelSpansConfig {
  enabled: boolean;
  serviceName: string;
  version: string;
  environment: "development" | "staging" | "production";
  sampleRatio: number;
  exportInterval: number; // milliseconds
  workspaceRoot?: string;
  tracingFileName?: string;
}

let globalConfig: OtelSpansConfig = {
  enabled: true,
  serviceName: "weathervane-orchestrator",
  version: "1.0.0",
  environment: "production",
  sampleRatio: 1.0,
  exportInterval: 5000,
  workspaceRoot: process.cwd(),
  tracingFileName: "traces.jsonl",
};

let tracingInitialized = false;

/**
 * Initialize global OpenTelemetry spans configuration
 */
export function initOtelSpans(config: Partial<OtelSpansConfig>): void {
  globalConfig = {
    ...globalConfig,
    ...config,
  };

  // Initialize underlying tracing system if needed
  if (!tracingInitialized) {
    const workspaceRoot = globalConfig.workspaceRoot || process.cwd();
    initTracing({
      enabled: globalConfig.enabled,
      workspaceRoot,
      sampleRatio: globalConfig.sampleRatio,
      fileName: globalConfig.tracingFileName,
    });
    tracingInitialized = true;
  }

  logInfo("OtelSpans initialized", {
    enabled: globalConfig.enabled,
    serviceName: globalConfig.serviceName,
    sampleRatio: globalConfig.sampleRatio,
  });
}

/**
 * Get current global configuration
 */
export function getOtelConfig(): OtelSpansConfig {
  return { ...globalConfig };
}

/**
 * Decorator for automatically wrapping async functions with spans
 * Usage: @withOtelSpan("operation_name")
 */
export function withOtelSpan(spanName: string, attributes?: SpanContextAttributes) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: unknown[]): Promise<unknown> {
      return withSpan(spanName, () => originalMethod.apply(this, args), {
        attributes: {
          service: globalConfig.serviceName,
          version: globalConfig.version,
          environment: globalConfig.environment,
          ...attributes,
        },
      });
    };

    return descriptor;
  };
}

/**
 * Safely wrap a function with span tracing
 * Handles both sync and async functions
 *
 * @param spanName Name of the operation for the span
 * @param fn The function to trace
 * @param attributes Additional span attributes
 * @returns Result of the function
 *
 * @example
 * // Async function
 * const result = await traceOperation("fetch_weather", async () => {
 *   return await weatherService.fetch(location);
 * }, { location: "NYC" });
 *
 * // Sync function
 * const parsed = traceOperation("parse_json", () => {
 *   return JSON.parse(jsonString);
 * }, { jsonSize: jsonString.length });
 */
export function traceOperation<T>(
  spanName: string,
  fn: () => T | Promise<T>,
  attributes?: SpanContextAttributes,
): T | Promise<T> {
  if (!globalConfig.enabled) {
    return fn();
  }

  return withSpan(spanName, fn, {
    attributes: {
      service: globalConfig.serviceName,
      version: globalConfig.version,
      environment: globalConfig.environment,
      ...attributes,
    },
  });
}

/**
 * Start a span for manual lifecycle management
 * Must be paired with endSpan() in a finally block
 *
 * @param spanName Name of the operation
 * @param attributes Span attributes
 * @returns SpanHandle for recording events and setting status, or null if sampling filtered
 *
 * @example
 * const span = startOtelSpan("long_operation", { requestId: "123" });
 * try {
 *   span?.addEvent("phase_1_complete");
 *   // ... do work ...
 *   span?.setAttribute("result_count", 42);
 * } catch (error) {
 *   span?.recordException(error);
 *   throw error;
 * } finally {
 *   endOtelSpan(span);
 * }
 */
export function startOtelSpan(
  spanName: string,
  attributes?: SpanContextAttributes,
): SpanHandle | null {
  if (!globalConfig.enabled) {
    return null;
  }

  const span = startSpan(spanName, {
    service: globalConfig.serviceName,
    version: globalConfig.version,
    environment: globalConfig.environment,
    ...attributes,
  });

  if (span) {
    logInfo("Span started", {
      spanName,
      spanId: span.spanId,
      traceId: span.traceId,
    });
  }

  return span;
}

/**
 * End a span that was started with startOtelSpan()
 * Safe to call with null values
 */
export function endOtelSpan(span: SpanHandle | null | undefined): void {
  if (!span || !globalConfig.enabled) {
    return;
  }

  endSpan(span);
  logInfo("Span ended", {
    spanId: span.spanId,
    traceId: span.traceId,
  });
}

/**
 * Record a milestone event within a span
 * Automatically adds service context
 */
export function recordSpanEvent(
  span: SpanHandle | null | undefined,
  eventName: string,
  details?: Record<string, unknown>,
): void {
  if (!span || !globalConfig.enabled) {
    return;
  }

  span.addEvent(eventName, {
    service: globalConfig.serviceName,
    ...details,
  });
}

/**
 * Set span status to error and record the exception
 */
export function recordSpanError(
  span: SpanHandle | null | undefined,
  error: unknown,
  details?: Record<string, unknown>,
): void {
  if (!span || !globalConfig.enabled) {
    return;
  }

  span.recordException(error);
  span.setAttribute("error", true);
  if (details) {
    Object.entries(details).forEach(([key, value]) => {
      span.setAttribute(`error.${key}`, value);
    });
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  logWarning("Span recorded error", {
    spanId: span.spanId,
    error: errorMessage,
    ...details,
  });
}

/**
 * Operation metrics for span attributes
 * Standardizes how metrics are recorded across operations
 */
export interface OperationMetrics {
  duration_ms?: number;
  item_count?: number;
  batch_size?: number;
  success?: boolean;
  retry_count?: number;
  [key: string]: unknown;
}

/**
 * Record operation metrics in a span
 * Useful for performance tracking and monitoring
 */
export function recordOperationMetrics(
  span: SpanHandle | null | undefined,
  metrics: OperationMetrics,
): void {
  if (!span || !globalConfig.enabled) {
    return;
  }

  Object.entries(metrics).forEach(([key, value]) => {
    if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
      span.setAttribute(key, value);
    }
  });
}

/**
 * Higher-order function to wrap a function and automatically trace it
 * with comprehensive error handling and metrics
 *
 * @param spanName Name of the operation
 * @param options Configuration for tracing behavior
 * @returns Wrapped function
 *
 * @example
 * const tracedFetch = traceAsyncFunction(
 *   "fetch_data",
 *   { recordDuration: true, recordException: true }
 * )(fetchFunction);
 */
export function traceAsyncFunction<T extends (...args: unknown[]) => Promise<unknown>>(
  spanName: string,
  options?: {
    recordDuration?: boolean;
    recordException?: boolean;
    attributes?: SpanContextAttributes;
  },
) {
  return (fn: T): T => {
    return (async (...args: unknown[]) => {
      const span = startOtelSpan(spanName, options?.attributes);
      const startTime = performance.now();

      try {
        const result = await fn(...args);

        if (options?.recordDuration) {
          const duration = performance.now() - startTime;
          recordOperationMetrics(span, { duration_ms: duration });
        }

        recordSpanEvent(span, "operation_completed", { status: "success" });
        return result;
      } catch (error) {
        if (options?.recordException ?? true) {
          recordSpanError(span, error);
        }
        throw error;
      } finally {
        endOtelSpan(span);
      }
    }) as T;
  };
}

/**
 * Batch operation span tracking
 * Useful for operations that process multiple items
 */
export interface BatchOperationContext {
  span: SpanHandle | null;
  recordItem(success: boolean, details?: Record<string, unknown>): void;
  recordBatchComplete(totalItems: number, successCount: number): void;
}

/**
 * Start tracking a batch operation
 * Call recordItem() for each item processed
 * Call recordBatchComplete() when done
 *
 * @example
 * const batch = startBatchOperation("process_queue", { queueName: "tasks" });
 * for (const item of items) {
 *   try {
 *     await processItem(item);
 *     batch.recordItem(true);
 *   } catch {
 *     batch.recordItem(false, { error: "processing failed" });
 *   }
 * }
 * batch.recordBatchComplete(items.length, successCount);
 */
export function startBatchOperation(
  spanName: string,
  attributes?: SpanContextAttributes,
): BatchOperationContext {
  const span = startOtelSpan(spanName, attributes);
  let itemCount = 0;

  return {
    span,
    recordItem(success: boolean, details?: Record<string, unknown>): void {
      itemCount++;
      recordSpanEvent(span, success ? "item_processed" : "item_failed", {
        itemNumber: itemCount,
        ...details,
      });
    },
    recordBatchComplete(totalItems: number, successCount: number): void {
      recordOperationMetrics(span, {
        total_items: totalItems,
        success_count: successCount,
        failure_count: totalItems - successCount,
      });
      recordSpanEvent(span, "batch_complete");
      endOtelSpan(span);
    },
  };
}
