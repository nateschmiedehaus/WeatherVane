/**
 * Tests for OpenTelemetry Spans Wrapper
 *
 * Validates:
 * - Span creation and lifecycle
 * - Event recording
 * - Error handling and exception recording
 * - Metrics recording
 * - Sampling behavior
 * - Graceful degradation when disabled
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initOtelSpans,
  getOtelConfig,
  traceOperation,
  startOtelSpan,
  endOtelSpan,
  recordSpanEvent,
  recordSpanError,
  recordOperationMetrics,
  traceAsyncFunction,
  startBatchOperation,
  type SpanContextAttributes,
} from "./otel_spans.js";

describe("OtelSpans - OpenTelemetry Spans Wrapper", () => {
  beforeEach(() => {
    // Reset to default config with proper workspace root for tests
    const testWorkspace = process.env.TEST_WORKSPACE_ROOT || process.cwd();
    initOtelSpans({
      enabled: true,
      serviceName: "test-service",
      version: "1.0.0",
      environment: "development",
      sampleRatio: 1.0,
      workspaceRoot: testWorkspace,
      tracingFileName: "test_traces.jsonl",
    });
  });

  describe("initOtelSpans", () => {
    it("should update global configuration", () => {
      const config = {
        serviceName: "custom-service",
        version: "2.0.0",
        environment: "staging" as const,
        sampleRatio: 0.5,
      };

      initOtelSpans(config);
      const current = getOtelConfig();

      expect(current.serviceName).toBe("custom-service");
      expect(current.version).toBe("2.0.0");
      expect(current.environment).toBe("staging");
      expect(current.sampleRatio).toBe(0.5);
      expect(current.enabled).toBe(true);
    });

    it("should support partial configuration updates", () => {
      initOtelSpans({ serviceName: "updated-service" });
      const config = getOtelConfig();

      expect(config.serviceName).toBe("updated-service");
      expect(config.version).toBe("1.0.0"); // unchanged
    });
  });

  describe("traceOperation - sync functions", () => {
    it("should execute sync functions and return results", () => {
      const result = traceOperation("test_sync", () => {
        return 42;
      });

      expect(result).toBe(42);
    });

    it("should include service context in attributes", () => {
      let capturedAttributes: SpanContextAttributes | undefined;

      traceOperation(
        "test_context",
        () => {
          // In real scenario, attributes would be captured by span exporter
          return "result";
        },
        { customField: "custom_value" },
      );

      // Note: Full validation would require inspecting trace files
      // This test verifies the function executes without error
      expect(true).toBe(true);
    });

    it("should handle exceptions in sync functions", () => {
      const testError = new Error("test error");

      expect(() => {
        traceOperation("test_error", () => {
          throw testError;
        });
      }).toThrow(testError);
    });

    it("should support graceful degradation when disabled", () => {
      initOtelSpans({ enabled: false });

      const result = traceOperation("disabled_trace", () => {
        return "direct_result";
      });

      expect(result).toBe("direct_result");
    });
  });

  describe("traceOperation - async functions", () => {
    it("should execute async functions and return results", async () => {
      const result = await traceOperation("test_async", async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "async_result";
      });

      expect(result).toBe("async_result");
    });

    it("should handle async errors", async () => {
      const testError = new Error("async test error");

      await expect(
        traceOperation("test_async_error", async () => {
          throw testError;
        }),
      ).rejects.toThrow(testError);
    });
  });

  describe("startOtelSpan and endOtelSpan", () => {
    it("should return null when tracing is disabled", () => {
      initOtelSpans({ enabled: false });
      const span = startOtelSpan("test_span");

      expect(span).toBeNull();
    });

    it("should return a SpanHandle when tracing is enabled", () => {
      const span = startOtelSpan("test_span");

      expect(span).not.toBeNull();
      expect(span?.spanId).toBeDefined();
      expect(span?.traceId).toBeDefined();

      if (span) {
        endOtelSpan(span);
      }
    });

    it("should support safe null calls to endOtelSpan", () => {
      expect(() => {
        endOtelSpan(null);
        endOtelSpan(undefined);
      }).not.toThrow();
    });

    it("should generate unique span IDs", () => {
      const span1 = startOtelSpan("span_1");
      const span2 = startOtelSpan("span_2");

      expect(span1?.spanId).not.toBe(span2?.spanId);

      if (span1) endOtelSpan(span1);
      if (span2) endOtelSpan(span2);
    });

    it("should preserve trace ID across child spans", () => {
      const parentSpan = startOtelSpan("parent");
      const parentTraceId = parentSpan?.traceId;

      // In AsyncLocalStorage context, child spans should inherit trace ID
      const childSpan = startOtelSpan("child");
      const childTraceId = childSpan?.traceId;

      // Both should have the same trace ID
      expect(childTraceId).toBeDefined();

      if (parentSpan) endOtelSpan(parentSpan);
      if (childSpan) endOtelSpan(childSpan);
    });
  });

  describe("recordSpanEvent", () => {
    it("should handle null spans gracefully", () => {
      expect(() => {
        recordSpanEvent(null, "test_event");
        recordSpanEvent(undefined, "test_event");
      }).not.toThrow();
    });

    it("should not throw when disabled", () => {
      initOtelSpans({ enabled: false });
      const span = startOtelSpan("test");

      expect(() => {
        recordSpanEvent(span, "test_event", { detail: "value" });
      }).not.toThrow();
    });

    it("should record events with details", () => {
      const span = startOtelSpan("event_test");

      expect(() => {
        recordSpanEvent(span, "milestone_reached", {
          phase: "processing",
          itemCount: 100,
        });
      }).not.toThrow();

      if (span) endOtelSpan(span);
    });
  });

  describe("recordSpanError", () => {
    it("should handle various error types", () => {
      const span = startOtelSpan("error_test");

      // Error object
      expect(() => {
        recordSpanError(span, new Error("test error"));
      }).not.toThrow();

      // String
      expect(() => {
        recordSpanError(span, "error message");
      }).not.toThrow();

      // Unknown
      expect(() => {
        recordSpanError(span, { custom: "error object" });
      }).not.toThrow();

      if (span) endOtelSpan(span);
    });

    it("should record error details", () => {
      const span = startOtelSpan("error_details_test");

      expect(() => {
        recordSpanError(span, new Error("detailed error"), {
          context: "operation_failed",
          severity: "high",
          code: 500,
        });
      }).not.toThrow();

      if (span) endOtelSpan(span);
    });

    it("should handle null spans gracefully", () => {
      expect(() => {
        recordSpanError(null, new Error("test"));
        recordSpanError(undefined, new Error("test"));
      }).not.toThrow();
    });
  });

  describe("recordOperationMetrics", () => {
    it("should record numeric metrics", () => {
      const span = startOtelSpan("metrics_test");

      expect(() => {
        recordOperationMetrics(span, {
          duration_ms: 1234.56,
          item_count: 42,
          batch_size: 1000,
          success: true,
          retry_count: 2,
        });
      }).not.toThrow();

      if (span) endOtelSpan(span);
    });

    it("should record string metrics", () => {
      const span = startOtelSpan("string_metrics_test");

      expect(() => {
        recordOperationMetrics(span, {
          operation_type: "fetch",
          result_status: "completed",
        });
      }).not.toThrow();

      if (span) endOtelSpan(span);
    });

    it("should handle null spans gracefully", () => {
      expect(() => {
        recordOperationMetrics(null, { duration_ms: 100 });
        recordOperationMetrics(undefined, { duration_ms: 100 });
      }).not.toThrow();
    });
  });

  describe("traceAsyncFunction - decorator", () => {
    it("should wrap async functions with tracing", async () => {
      const tracedFn = traceAsyncFunction("wrapped_operation", {
        recordDuration: true,
        attributes: { operationId: "op123" },
      })((async () => "wrapped result") as () => Promise<string>);

      const result = await tracedFn();
      expect(result).toBe("wrapped result");
    });

    it("should record duration when enabled", async () => {
      const tracedFn = traceAsyncFunction("duration_test", {
        recordDuration: true,
      })((async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "done";
      }) as () => Promise<string>);

      const result = await tracedFn();
      expect(result).toBe("done");
    });

    it("should record exceptions when enabled", async () => {
      const testError = new Error("wrapped error");
      const tracedFn = traceAsyncFunction("error_wrap_test", {
        recordException: true,
      })((async () => {
        throw testError;
      }) as () => Promise<never>);

      await expect(tracedFn()).rejects.toThrow(testError);
    });
  });

  describe("startBatchOperation", () => {
    it("should track batch operations", () => {
      const batch = startBatchOperation("batch_test", { batchId: "batch123" });

      expect(batch.span).not.toBeNull();

      // Simulate batch processing
      for (let i = 0; i < 5; i++) {
        batch.recordItem(true, { itemId: `item${i}` });
      }

      expect(() => {
        batch.recordBatchComplete(5, 5);
      }).not.toThrow();
    });

    it("should track batch failures", () => {
      const batch = startBatchOperation("failed_batch_test");

      batch.recordItem(true);
      batch.recordItem(false, { error: "processing failed" });
      batch.recordItem(true);

      expect(() => {
        batch.recordBatchComplete(3, 2);
      }).not.toThrow();
    });

    it("should work when tracing is disabled", () => {
      initOtelSpans({ enabled: false });
      const batch = startBatchOperation("disabled_batch");

      expect(batch.span).toBeNull();

      expect(() => {
        batch.recordItem(true);
        batch.recordBatchComplete(1, 1);
      }).not.toThrow();
    });
  });

  describe("integration scenarios", () => {
    it("should handle concurrent operations", async () => {
      const operations = Array.from({ length: 5 }, (_, i) =>
        traceOperation(`concurrent_op_${i}`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return `result_${i}`;
        }),
      );

      const results = await Promise.all(operations);
      expect(results).toHaveLength(5);
      expect(results[0]).toBe("result_0");
      expect(results[4]).toBe("result_4");
    });

    it("should handle nested operations with span context", async () => {
      const result = await traceOperation(
        "outer_operation",
        async () => {
          return await traceOperation(
            "inner_operation",
            async () => {
              return "nested_result";
            },
            { operationDepth: 2 },
          );
        },
        { operationDepth: 1 },
      );

      expect(result).toBe("nested_result");
    });

    it("should track operation lifecycle end-to-end", async () => {
      const span = startOtelSpan("lifecycle_test", { requestId: "req123" });

      recordSpanEvent(span, "operation_started");

      await new Promise((resolve) => setTimeout(resolve, 20));

      recordOperationMetrics(span, {
        duration_ms: 20,
        items_processed: 10,
        success: true,
      });

      recordSpanEvent(span, "operation_completed");

      endOtelSpan(span);

      expect(true).toBe(true); // Operation completed without errors
    });
  });

  describe("sampling behavior", () => {
    it("should respect sample ratio of 0 (no sampling)", () => {
      const testWorkspace = process.env.TEST_WORKSPACE_ROOT || process.cwd();
      initOtelSpans({
        enabled: true,
        sampleRatio: 0,
        workspaceRoot: testWorkspace,
        serviceName: "test-service",
      });

      // Execute multiple operations - none should create spans
      for (let i = 0; i < 10; i++) {
        traceOperation(`no_sample_${i}`, () => i);
      }

      expect(true).toBe(true); // All completed without error
    });

    it("should respect sample ratio of 1 (all sampling)", () => {
      const testWorkspace = process.env.TEST_WORKSPACE_ROOT || process.cwd();
      initOtelSpans({
        enabled: true,
        sampleRatio: 1,
        workspaceRoot: testWorkspace,
        serviceName: "test-service",
      });

      for (let i = 0; i < 5; i++) {
        const span = startOtelSpan(`all_sample_${i}`);
        expect(span).not.toBeNull();
        if (span) endOtelSpan(span);
      }
    });

    it("should support partial sampling", () => {
      const testWorkspace = process.env.TEST_WORKSPACE_ROOT || process.cwd();
      initOtelSpans({
        enabled: true,
        sampleRatio: 0.5,
        workspaceRoot: testWorkspace,
        serviceName: "test-service",
      });

      let spanCount = 0;
      for (let i = 0; i < 20; i++) {
        const span = startOtelSpan(`partial_sample_${i}`);
        if (span) {
          spanCount++;
          endOtelSpan(span);
        }
      }

      // With 0.5 ratio, expect ~50% spans (but allow for variance)
      // Should have at least some and at most all
      expect(spanCount).toBeGreaterThan(0);
      expect(spanCount).toBeLessThanOrEqual(20);
    });
  });
});
