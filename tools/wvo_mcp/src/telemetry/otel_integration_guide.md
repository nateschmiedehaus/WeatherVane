# OpenTelemetry Spans Integration Guide

This guide demonstrates how to integrate OpenTelemetry spans into WeatherVane operations for comprehensive distributed tracing.

## Overview

The `otel_spans.ts` module provides a safe, non-invasive wrapper around the existing tracing infrastructure. It enables:

- **Automatic span creation** for operations
- **Event recording** for operational milestones
- **Exception tracking** with full context
- **Metrics recording** for performance monitoring
- **Graceful degradation** when tracing is disabled
- **Sampling control** for cost-effective production deployments

## Quick Start

### 1. Initialize OpenTelemetry Spans

```typescript
import { initOtelSpans } from "./telemetry/otel_spans.js";

// In orchestrator startup
initOtelSpans({
  enabled: true,
  serviceName: "weathervane-orchestrator",
  version: "1.0.0",
  environment: "production",
  sampleRatio: 0.1, // Sample 10% of traces in production
});
```

### 2. Trace Simple Operations

#### Synchronous Operations

```typescript
import { traceOperation } from "./telemetry/otel_spans.js";

// Simple sync function
const parsed = traceOperation("parse_config", () => {
  return JSON.parse(configString);
}, {
  configSize: configString.length,
  source: "environment",
});
```

#### Asynchronous Operations

```typescript
// Async function with automatic error handling
const result = await traceOperation(
  "fetch_weather_data",
  async () => {
    return await weatherService.fetch(location);
  },
  {
    location,
    retryCount: 3,
  }
);
```

## Integration Patterns

### Pattern 1: Manual Span Lifecycle

Use for operations with multiple phases or custom event tracking:

```typescript
import {
  startOtelSpan,
  endOtelSpan,
  recordSpanEvent,
  recordOperationMetrics,
  recordSpanError,
} from "./telemetry/otel_spans.js";

class DataProcessor {
  async processLargeDataset(data: unknown[]) {
    const span = startOtelSpan("process_dataset", {
      datasetId: "ds-123",
      totalItems: data.length,
    });

    try {
      recordSpanEvent(span, "processing_started");

      let processed = 0;
      for (const item of data) {
        try {
          await this.processItem(item);
          processed++;

          // Record progress milestone
          if (processed % 1000 === 0) {
            recordSpanEvent(span, "progress_checkpoint", {
              processed,
              remaining: data.length - processed,
            });
          }
        } catch (itemError) {
          recordSpanError(span, itemError, {
            itemId: item?.id,
            processedBefore: processed,
          });
          // Continue processing or break based on strategy
        }
      }

      recordOperationMetrics(span, {
        total_items: data.length,
        success_count: processed,
        failure_count: data.length - processed,
        duration_ms: Date.now() - startTime,
      });

      recordSpanEvent(span, "processing_complete", {
        status: "success",
      });
    } catch (error) {
      recordSpanError(span, error, {
        phase: "batch_processing",
      });
      throw error;
    } finally {
      endOtelSpan(span);
    }
  }
}
```

### Pattern 2: Batch Operations

For processing queues or collections:

```typescript
import { startBatchOperation } from "./telemetry/otel_spans.js";

class TaskQueue {
  async processBatch(tasks: Task[]) {
    const batch = startBatchOperation("process_task_queue", {
      queueName: "high_priority",
      batchSize: tasks.length,
    });

    let successCount = 0;
    for (const task of tasks) {
      try {
        await this.executeTask(task);
        batch.recordItem(true, { taskId: task.id, duration: elapsed });
        successCount++;
      } catch (error) {
        batch.recordItem(false, {
          taskId: task.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    batch.recordBatchComplete(tasks.length, successCount);
  }
}
```

### Pattern 3: Function Wrapping

For automatic tracing with minimal code changes:

```typescript
import { traceAsyncFunction } from "./telemetry/otel_spans.js";

// Wrap an async function
const tracedFetch = traceAsyncFunction(
  "fetch_external_api",
  {
    recordDuration: true,
    recordException: true,
    attributes: { service: "external-api" },
  }
)(fetchExternalDataFunction);

// Use it normally
const data = await tracedFetch(url);
```

### Pattern 4: Decorator Pattern

For class methods (requires TypeScript):

```typescript
import { withOtelSpan } from "./telemetry/otel_spans.js";

class OperationsManager {
  @withOtelSpan("execute_task", { component: "operations_manager" })
  async executeTask(task: Task): Promise<TaskResult> {
    // Implementation
  }
}
```

## Integration Examples

### Example 1: Operations Manager Integration

```typescript
// tools/wvo_mcp/src/orchestrator/operations_manager.ts

import {
  startOtelSpan,
  endOtelSpan,
  recordSpanEvent,
  recordOperationMetrics,
  recordSpanError,
} from "../telemetry/otel_spans.js";

export class OperationsManager {
  async recordExecution(summary: ExecutionSummary): Promise<void> {
    const span = startOtelSpan("record_execution", {
      taskId: summary.taskId,
      agentId: summary.agentId,
      agentType: summary.agentType,
    });

    try {
      recordSpanEvent(span, "validation_started");

      // Validate execution
      const validated = await this.validateExecution(summary);

      recordSpanEvent(span, "validation_complete", {
        isValid: validated,
      });

      // Record to telemetry
      const record = buildExecutionTelemetryRecord(summary);
      this.exporter.append(record);

      recordOperationMetrics(span, {
        duration_ms: summary.durationSeconds * 1000,
        quality_score: summary.qualityScore,
        token_count: summary.totalTokens,
        success: summary.success,
      });
    } catch (error) {
      recordSpanError(span, error, {
        summary_id: summary.taskId,
      });
      throw error;
    } finally {
      endOtelSpan(span);
    }
  }

  async snapshot(): Promise<OperationsSnapshot> {
    return traceOperation(
      "operations_snapshot",
      async () => {
        const tasks = await this.getTaskMetrics();
        const queue = await this.getQueueMetrics();
        const quality = await this.getQualityMetrics();

        return {
          // ... snapshot data
        };
      },
      { snapshotType: "full" }
    );
  }
}
```

### Example 2: Agent Coordinator Integration

```typescript
// tools/wvo_mcp/src/orchestrator/agent_coordinator.ts

import { startBatchOperation } from "../telemetry/otel_spans.js";

export class AgentCoordinator {
  async coordinateExecution(tasks: Task[]): Promise<ExecutionResult[]> {
    const batch = startBatchOperation("coordinate_agent_execution", {
      taskCount: tasks.length,
      priority: "normal",
    });

    const results: ExecutionResult[] = [];

    for (const task of tasks) {
      try {
        const result = await this.executeTask(task);
        batch.recordItem(true, {
          taskId: task.id,
          duration: result.duration,
        });
        results.push(result);
      } catch (error) {
        batch.recordItem(false, {
          taskId: task.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    batch.recordBatchComplete(tasks.length, successCount);

    return results;
  }
}
```

### Example 3: Task Scheduler Integration

```typescript
// tools/wvo_mcp/src/orchestrator/task_scheduler.ts

import { traceOperation, recordOperationMetrics } from "../telemetry/otel_spans.js";

export class TaskScheduler {
  dispatch(task: Task, reason: SchedulingReason): Promise<void> {
    return traceOperation(
      "dispatch_task",
      async () => {
        // Schedule the task
        await this.queue.enqueue(task);
      },
      {
        taskId: task.id,
        reason,
        priority: task.priority,
      }
    );
  }

  async rebalance(): Promise<QueueMetrics> {
    return traceOperation(
      "queue_rebalance",
      async () => {
        const metrics = await this.analyzeQueue();
        await this.redistribute(metrics);
        return metrics;
      },
      { component: "task_scheduler" }
    );
  }
}
```

## Span Attributes Best Practices

### Standard Attributes

Include these attributes for all spans:

```typescript
{
  // Operation context
  taskId: string,
  agentId: string,
  correlationId: string,

  // Resource context
  tenantId: string,
  userId: string,

  // Operational context
  priority: "high" | "normal" | "low",
  retryAttempt: number,
  batchSize: number,
}
```

### Dynamic Attributes

Add as operations progress:

```typescript
span?.setAttribute("processing_status", "in_progress");
span?.setAttribute("items_processed", 42);
span?.setAttribute("estimated_remaining_ms", 5000);
```

## Event Tracking

Record significant milestones as events:

```typescript
// Phase transitions
recordSpanEvent(span, "phase_complete", { phase: "validation" });

// Progress checkpoints
recordSpanEvent(span, "checkpoint", { progress: 50, unit: "percent" });

// External service calls
recordSpanEvent(span, "external_call", { service: "weather_api" });

// Cache operations
recordSpanEvent(span, "cache_hit", { cacheKey: "weather_atlanta" });
```

## Error Handling

Record exceptions with full context:

```typescript
try {
  // Operation
} catch (error) {
  recordSpanError(span, error, {
    operation: "data_fetch",
    retryAttempt: 2,
    endpoint: url,
  });
}
```

## Metrics Recording

Standardize metric names and units:

```typescript
recordOperationMetrics(span, {
  duration_ms: 1234.5,
  item_count: 100,
  batch_size: 50,
  success: true,
  retry_count: 2,
  cache_hit_ratio: 0.75,
  error_rate: 0.02,
});
```

## Sampling Strategy

Configure sampling ratios based on environment:

```typescript
// Development: Trace everything
initOtelSpans({ sampleRatio: 1.0, environment: "development" });

// Staging: Trace 50%
initOtelSpans({ sampleRatio: 0.5, environment: "staging" });

// Production: Trace 10% (cost-optimized)
initOtelSpans({ sampleRatio: 0.1, environment: "production" });
```

## Viewing Traces

Traces are written to JSONL files in `state/telemetry/`:

```bash
# View recent traces
tail -f state/telemetry/traces.jsonl | jq .

# Filter by span name
jq 'select(.name == "execute_task")' state/telemetry/traces.jsonl

# Analyze trace durations
jq '.durationMs' state/telemetry/traces.jsonl | jq -s 'add/length'
```

## Performance Considerations

1. **Sampling**: Use lower sample ratios in production to reduce overhead
2. **Batch writes**: Traces are automatically batched and flushed
3. **No blocking**: Tracing is non-blocking; errors in tracing don't affect operations
4. **Selective recording**: Only record important events and metrics

## Testing Traces

```typescript
import { initOtelSpans, traceOperation } from "./telemetry/otel_spans.js";

describe("Operations with tracing", () => {
  beforeEach(() => {
    initOtelSpans({
      enabled: true,
      sampleRatio: 1.0, // Sample everything in tests
    });
  });

  it("should trace operation successfully", async () => {
    const result = await traceOperation(
      "test_operation",
      async () => "success",
      { testId: "test123" }
    );

    expect(result).toBe("success");
  });
});
```

## Summary

This OpenTelemetry spans integration provides:

- ✅ **Safe, non-invasive** tracing via wrapper functions
- ✅ **Comprehensive context** with automatic service attributes
- ✅ **Flexible lifecycle** with both automatic and manual span management
- ✅ **Event tracking** for operational milestones
- ✅ **Metrics standardization** across the platform
- ✅ **Production-ready** with sampling and error handling
- ✅ **Full test coverage** ensuring reliability

For distributed tracing across multiple services, the JSONL trace files can be exported to external observability platforms like Jaeger, Datadog, or New Relic.
