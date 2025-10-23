# OpenTelemetry Spans for All Operations

## Overview

Task **T9.3.1** implements comprehensive OpenTelemetry-compatible tracing across WeatherVane's orchestrator. This provides visibility into all critical operations through distributed tracing spans, enabling detailed performance analysis and debugging.

## Status: ✅ COMPLETE

- **Date Completed**: 2025-10-22
- **Complexity**: 5/10 (simple wrapper layer)
- **Domain**: infrastructure
- **Tests**: 23 comprehensive tests (100% passing)

## Architecture

### Tracing Infrastructure

The tracing system is built on a lightweight, self-contained OpenTelemetry-compatible implementation located in `tools/wvo_mcp/src/telemetry/tracing.ts`:

```typescript
export interface SpanHandle {
  traceId: string;
  spanId: string;
  setAttribute(key: string, value: unknown): void;
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  setStatus(status: SpanStatus, message?: string): void;
  recordException(error: unknown): void;
}
```

### Core Functions

#### `initTracing(options: InitTracingOptions)`

Initializes the tracing system with optional sampling and output configuration:

```typescript
initTracing({
  workspaceRoot: '/path/to/workspace',
  enabled: process.env.WVO_OTEL_ENABLED === '1',
  sampleRatio: 1.0, // Always sample
  fileName: 'traces.jsonl' // Output file
});
```

#### `withSpan<T>(name: string, fn: (span?: SpanHandle) => T | Promise<T>, options?: WithSpanOptions): T | Promise<T>`

Wraps synchronous or asynchronous operations in a named span:

```typescript
const result = await withSpan('operation.name', async (span) => {
  span?.setAttribute('key', 'value');
  span?.addEvent('event_name');
  return doWork();
}, {
  attributes: { 'operation': 'type' }
});
```

#### `startSpan(name: string, attributes?: Record<string, unknown>): SpanHandle | null`

Manually starts a span for explicit control:

```typescript
const span = startSpan('manual_operation', { 'context': 'value' });
// ... do work ...
endSpan(span);
```

## Instrumented Operations

### 1. Command Execution (`command.run`)

All bash command execution is traced with:
- `command.text`: The command being executed
- `command.cwd`: Working directory
- `command.timeoutMs`: Timeout (if set)
- `command.exitCode`: Exit code
- `command.succeeded`: Boolean success flag

**Location**: `tools/wvo_mcp/src/executor/command_runner.ts`

### 2. File Operations

#### File Read (`file.read`)
- `file.path`: Relative path
- `file.encoding`: Text encoding used
- `file.bytesRead`: Bytes read

#### File Write (`file.write`)
- `file.path`: Relative path
- `file.bytesWritten`: Bytes written
- `file.protected`: Is this a protected file?

**Location**: `tools/wvo_mcp/src/executor/file_ops.ts`

### 3. Model Selection (`model.select`)

Tracks intelligent model routing decisions:
- `model.provider`: 'claude' or 'codex'
- `model.complexity`: Task complexity score (0-10)
- `model.name`: Selected model tier name
- `model.model`: Actual model ID
- `model.costPer1K`: Cost per 1000 tokens
- `model.reasoningEffort`: Reasoning tier (if applicable)

**Location**: `tools/wvo_mcp/src/orchestrator/model_router.ts`

### 4. Cost Estimation (`model.estimateCost`)

Estimates computational cost before execution:
- `model.estimatedTokens`: Predicted token usage
- `model.estimatedCost`: Estimated cost in dollars
- `model.baseTokens`: Base token estimate
- `model.complexityMultiplier`: Complexity scaling factor

### 5. Critic Execution (`critic.run`)

Comprehensive quality control execution tracing:
- `critic.name`: Critic identifier
- `critic.profile`: Capability profile
- `critic.exitCode`: Command exit code
- `critic.passed`: Boolean pass/fail

**Events**:
- `critic.skipped`: Skipped due to profile
- `critic.intelligence.success_recorded`: Intelligence system acknowledged success
- `critic.intelligence.failure_analyzed`: Failure analysis completed

**Location**: `tools/wvo_mcp/src/critics/base.ts`

## Span Attributes Standard

All spans follow OpenTelemetry semantic conventions with custom attributes:

### Common Attributes
```typescript
{
  // Standard OTel fields (automatically set)
  traceId: string;      // Unique trace identifier
  spanId: string;       // Unique span identifier within trace
  parentSpanId?: string; // Parent span (for nesting)
  name: string;         // Span operation name

  // Timing (nanosecond precision)
  startTimeUnixNano: number;
  endTimeUnixNano: number;
  durationMs: number;   // Calculated duration

  // Status
  status: 'ok' | 'error';
  statusMessage?: string;

  // Custom attributes (operation-specific)
  attributes: Record<string, unknown>;

  // Events (structured logs within span)
  events: SpanEvent[];
}
```

## Output Format

Spans are exported to **JSONL** (JSON Lines) format at `state/telemetry/traces.jsonl`:

```json
{
  "traceId": "a4fb4a1d1a96d312",
  "spanId": "5b494e76d7c8f5f1",
  "parentSpanId": null,
  "name": "command.run",
  "startTimeUnixNano": 1729610123456789000,
  "endTimeUnixNano": 1729610123789456000,
  "status": "ok",
  "statusMessage": null,
  "attributes": {
    "command.text": "npm run build",
    "command.cwd": "/workspace",
    "command.exitCode": 0,
    "command.succeeded": true,
    "command.operation": "bash_execution"
  },
  "events": [],
  "durationMs": 332.667
}
```

## Configuration

### Environment Variables

```bash
# Enable OpenTelemetry tracing
WVO_OTEL_ENABLED=1

# Set sampling ratio (0.0 to 1.0, default 1.0)
WVO_OTEL_SAMPLE_RATIO=0.5

# Disable during dry runs (automatically handled)
# WVO_DRY_RUN=1 (tracing disabled in dry-run mode)
```

### Live Flags

The `LiveFlags` system can also control tracing:

```typescript
// Flag: OTEL_ENABLED (default: "0")
// Set to "1" to enable tracing
```

## Testing

Comprehensive test suite in `tools/wvo_mcp/src/telemetry/tracing.test.ts` covers:

- ✅ Initialization with various configurations
- ✅ Async and sync span creation
- ✅ Attribute assignment
- ✅ Event recording
- ✅ Exception handling
- ✅ Nested span relationships
- ✅ Manual span control
- ✅ JSONL serialization
- ✅ Sampling behavior
- ✅ Integration with all operation types
- ✅ Error recording and status

**Run tests**:
```bash
cd tools/wvo_mcp
npm run test -- src/telemetry/tracing.test.ts
```

**Results**: 23/23 tests passing ✅

## Usage Examples

### Basic Operation Tracing

```typescript
import { withSpan } from '../telemetry/tracing.js';

export async function processData(input: DataInput) {
  return withSpan('data.process', async (span) => {
    span?.setAttribute('input.size', input.data.length);
    span?.addEvent('processing.started');

    try {
      const result = await heavyComputation(input);
      span?.setAttribute('output.size', result.length);
      return result;
    } catch (error) {
      span?.recordException(error);
      throw error;
    }
  });
}
```

### Nested Operations

```typescript
export async function orchestrate() {
  return withSpan('orchestration', async (parentSpan) => {
    parentSpan?.setAttribute('phase', 'setup');

    // Inner span inherits trace ID
    const result1 = await withSpan('phase.validation', async (childSpan) => {
      childSpan?.setAttribute('validations', 5);
      return validate();
    });

    parentSpan?.setAttribute('validations.passed', result1);

    const result2 = await withSpan('phase.execution', async (childSpan) => {
      childSpan?.setAttribute('tasks', 10);
      return execute();
    });

    return [result1, result2];
  });
}
```

### Manual Span Management

```typescript
export async function manualTracking() {
  const span = startSpan('manual.operation', { 'context': 'value' });

  try {
    // Work
    span?.setAttribute('progress', 50);
    span?.addEvent('halfway_done');

    // More work
    span?.setAttribute('progress', 100);
  } catch (error) {
    span?.recordException(error);
  } finally {
    endSpan(span);
  }
}
```

## Performance Considerations

### Sampling

The system supports configurable sampling to reduce overhead:

- **Sampling ratio 0**: No traces recorded (zero overhead)
- **Sampling ratio 0.5**: 50% of operations sampled (50% overhead)
- **Sampling ratio 1.0**: All operations traced (full overhead)

**Overhead estimate**: ~1-2ms per span creation/serialization with sampling enabled

### Async Flushing

Spans are flushed asynchronously to avoid blocking operations:

- Pending writes collected in memory
- Flush triggered via `setImmediate()`
- Batched writes to reduce I/O

### Best Practices

1. **Use `withSpan` for simplicity** - Handles all setup/cleanup automatically
2. **Set meaningful attributes** - Enables rich analysis and debugging
3. **Add events for milestones** - Track important operation phases
4. **Record exceptions properly** - Use `recordException()` for proper error tracking
5. **Name spans consistently** - Use dot-separated names (e.g., `service.operation`)

## Monitoring and Analysis

### Trace Files

Traces are available at: `state/telemetry/traces.jsonl`

### Analysis Queries

#### Find slow operations
```bash
jq 'select(.durationMs > 1000)' state/telemetry/traces.jsonl
```

#### Count operations by type
```bash
jq -s 'group_by(.name) | map({name: .[0].name, count: length})' state/telemetry/traces.jsonl
```

#### Find errors
```bash
jq 'select(.status == "error")' state/telemetry/traces.jsonl
```

#### Average duration by operation
```bash
jq -s 'group_by(.name) | map({name: .[0].name, avgDuration: (map(.durationMs) | add / length)})' state/telemetry/traces.jsonl
```

## Integration with Existing Systems

### WorkerClient Tracing
Already integrated in `tools/wvo_mcp/src/worker/worker_client.ts`:
```typescript
async call<T>(
  method: string,
  params?: unknown,
  options?: WorkerCallOptions,
): Promise<T | WorkerErrorPayload> {
  return withSpan<T | WorkerErrorPayload>(
    "worker.client.call",
    async (span) => {
      span?.setAttribute("worker.method", method);
      return await worker.call<T>(method, params, options);
    }
  );
}
```

### Tool Router Tracing
Integration points ready in `tools/wvo_mcp/src/worker/tool_router.ts` for:
- Tool invocation
- Response processing
- Error handling

## Future Enhancements

### Planned Improvements
1. **OpenTelemetry SDK Integration** - Use official OTel libraries for standardization
2. **Trace Exporters** - Support for Jaeger, Zipkin, OTEL Collector
3. **Metrics** - Export span statistics as metrics
4. **Correlation** - Link traces to logs and metrics
5. **Sampling Strategies** - Adaptive sampling based on operation type

### Extension Points
- Add custom exporters in `telemetry/`
- Implement trace correlation for distributed systems
- Create dashboards using trace data

## References

- [OpenTelemetry Specification](https://opentelemetry.io/docs/reference/specification/)
- [Semantic Conventions](https://opentelemetry.io/docs/reference/specification/protocol/)
- [JSONL Format](http://jsonlines.org/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)

## Summary

Task T9.3.1 successfully implements comprehensive OpenTelemetry-compatible tracing for all critical operations in WeatherVane's orchestrator. The implementation:

✅ **Provides visibility** into command execution, file I/O, model selection, cost estimation, and critic execution

✅ **Maintains performance** through optional sampling and async flushing

✅ **Enables debugging** with detailed attributes, events, and exception recording

✅ **Follows standards** with OpenTelemetry semantic conventions

✅ **Is thoroughly tested** with 23 comprehensive test cases

✅ **Supports future integration** with standard OTel exporters and analysis tools

This foundation enables downstream work on distributed tracing, performance monitoring, and detailed system analysis.
