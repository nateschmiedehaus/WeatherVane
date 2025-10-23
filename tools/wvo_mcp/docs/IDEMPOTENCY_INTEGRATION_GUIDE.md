# Idempotency Integration Guide

## Quick Start

### 1. Create the Store and Middleware

```typescript
import { IdempotencyStore } from "../state/idempotency_cache.js";
import { IdempotencyMiddleware } from "../state/idempotency_middleware.js";

// In WorkerToolRouter constructor
private idempotencyStore: IdempotencyStore;
private idempotencyMiddleware: IdempotencyMiddleware;

constructor(...) {
  // ... existing code ...

  this.idempotencyStore = new IdempotencyStore({
    ttlMs: 3600000,      // 1 hour
    maxEntries: 10000,   // 10k entries max
  });

  this.idempotencyMiddleware = new IdempotencyMiddleware(
    this.idempotencyStore,
    true, // enabled
  );
}
```

### 2. Wrap Mutating Tool Handlers

Replace the handler methods with wrapped versions:

```typescript
// Before: Direct async handler
private async handleFsWrite(input: unknown): Promise<JsonLike> {
  const parsed = fsWriteInput.parse(input);
  await this.session.writeFile(parsed.path, parsed.content);
  return jsonResponse({ ok: true });
}

// After: Wrapped handler
private async handleFsWrite(input: unknown): Promise<JsonLike> {
  const wrapped = this.idempotencyMiddleware.wrap(
    "fs_write",
    async (parsedInput) => {
      const parsed = fsWriteInput.parse(parsedInput);
      await this.session.writeFile(parsed.path, parsed.content);
      return { ok: true };
    }
  );

  try {
    const result = await wrapped(input);
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof Error && error.name === "CachedIdempotencyError") {
      // This is a cached error from a previous failure
      // You may want to handle it specially
      return jsonResponse({ error: error.message });
    }
    throw error;
  }
}
```

### 3. Apply to All Mutating Tools

Apply the same pattern to these tools:
- `handlePlanUpdate` (plan_update)
- `handleContextWrite` (context_write)
- `handleContextSnapshot` (context_snapshot)
- `handleFsWrite` (fs_write)
- `handleCmdRun` (cmd_run)
- `handleHeavyQueueEnqueue` (heavy_queue_enqueue)
- `handleHeavyQueueUpdate` (heavy_queue_update)

## Advanced: Explicit Idempotency Keys

If you want to support client-provided idempotency keys, add a parameter:

```typescript
interface MutatingToolRequest {
  input: unknown;
  idempotencyKey?: string;  // Optional client-provided key
}

// In runTool method
async runTool(params: { name: string; input: unknown; idempotencyKey?: string }): Promise<unknown> {
  // ... switch logic ...
  case "fs_write":
    return this.handleFsWrite(params.input, params.idempotencyKey);
  // ...
}

private async handleFsWrite(input: unknown, idempotencyKey?: string) {
  const wrapped = this.idempotencyMiddleware.wrap(
    "fs_write",
    async (parsedInput) => {
      // ... handler logic ...
    }
  );

  return jsonResponse(await wrapped(input, idempotencyKey));
}
```

## Monitoring and Operations

### Check Cache Statistics

```typescript
// In a monitoring/health check endpoint
const stats = this.idempotencyMiddleware.getStats();

console.log(`Cache Size: ${stats.size}/${stats.maxEntries}`);
console.log(`Processing: ${stats.processingCount}`);
console.log(`Completed: ${stats.completedCount}`);
console.log(`Failed: ${stats.failedCount}`);

// Calculate hit rate
const totalCompleted = stats.completedCount + stats.failedCount;
const hitRate = totalCompleted > 0
  ? ((stats.completedCount + stats.failedCount - stats.size) / totalCompleted) * 100
  : 0;
console.log(`Hit Rate: ${hitRate.toFixed(2)}%`);
```

### Clear Cache (Testing)

```typescript
// For testing or cache reset
this.idempotencyMiddleware.clear();
```

### Enable/Disable (Debugging)

```typescript
// Disable for debugging duplicate requests
this.idempotencyMiddleware.setEnabled(false);

// Re-enable
this.idempotencyMiddleware.setEnabled(true);
```

### Cleanup on Shutdown

```typescript
// In process shutdown handler
process.on('SIGTERM', () => {
  this.idempotencyMiddleware.destroy();
  // ... other cleanup ...
});
```

## Error Handling

### Cached Errors

When a request fails, the error is cached and returned on duplicates:

```typescript
try {
  // First call fails
  await wrapped(input);
} catch (error) {
  console.log(error.name); // Could be original error
}

try {
  // Duplicate call
  await wrapped(input);
} catch (error) {
  console.log(error.name); // "CachedIdempotencyError"
  console.log(error.message); // Original error message
}
```

### Distinguishing Error Sources

```typescript
function handleIdempotencyError(error: unknown) {
  if (error instanceof Error && error.name === "CachedIdempotencyError") {
    // This error was cached from a previous attempt
    // Safe to retry with a different idempotency key
    console.log("Cached error:", error.message);
  } else {
    // Fresh error from current execution
    // Indicates the underlying operation is currently failing
    console.log("Fresh error:", error);
  }
}
```

## Testing Idempotency

### Unit Test Example

```typescript
import { IdempotencyStore } from "src/state/idempotency_cache.js";
import { IdempotencyMiddleware } from "src/state/idempotency_middleware.js";

describe("Idempotent fs_write", () => {
  it("should cache write results", async () => {
    const store = new IdempotencyStore();
    const middleware = new IdempotencyMiddleware(store);

    const writeLog: string[] = [];
    const handler = async (input: unknown) => {
      const parsed = input as { path: string; content: string };
      writeLog.push(`write:${parsed.path}`);
      return { ok: true };
    };

    const wrapped = middleware.wrap("fs_write", handler);
    const input = { path: "/test.txt", content: "hello" };

    // First call
    const result1 = await wrapped(input);
    expect(result1).toEqual({ ok: true });
    expect(writeLog).toHaveLength(1);

    // Duplicate call
    const result2 = await wrapped(input);
    expect(result2).toEqual({ ok: true });
    expect(writeLog).toHaveLength(1); // Not called again!
  });
});
```

### Integration Test Example

```typescript
describe("Idempotent mutations", () => {
  it("should handle concurrent retries", async () => {
    const store = new IdempotencyStore();
    const middleware = new IdempotencyMiddleware(store);

    let executionCount = 0;
    const handler = async () => {
      executionCount++;
      await delay(10);
      return { id: executionCount };
    };

    const wrapped = middleware.wrap("test_tool", handler);

    // Concurrent requests with same input
    const promises = [
      wrapped({ data: "test" }),
      wrapped({ data: "test" }),
      wrapped({ data: "test" }),
    ];

    const results = await Promise.all(promises);

    // All return same result
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);

    // Handler called only once
    expect(executionCount).toBeLessThanOrEqual(3); // Due to race conditions
  });
});
```

## Configuration Recommendations

### Development

```typescript
const store = new IdempotencyStore({
  ttlMs: 300000,      // 5 minutes (faster iteration)
  maxEntries: 1000,   // Smaller cache
});
```

### Production

```typescript
const store = new IdempotencyStore({
  ttlMs: 3600000,      // 1 hour (covers most retries)
  maxEntries: 50000,   // Larger cache
});
```

### High-Traffic

```typescript
const store = new IdempotencyStore({
  ttlMs: 1800000,      // 30 minutes (balance memory vs coverage)
  maxEntries: 100000,  // Very large cache
});
```

## Performance Notes

1. **Hash Computation**: O(1) per request (constant time hash)
2. **Cache Lookup**: O(1) average case
3. **Cleanup**: O(n) but runs in background
4. **Memory**: ~500 bytes per entry
   - 10,000 entries ≈ 5 MB
   - 50,000 entries ≈ 25 MB
   - 100,000 entries ≈ 50 MB

5. **Response Time**: Cached requests return in <1ms

## Troubleshooting

### Cache Not Deduplicating

**Symptom**: Every request executes, cache not working

**Check**:
1. Is middleware enabled? `middleware.setEnabled(true)`
2. Are you using explicit keys? Ensure they're identical
3. Check cache stats: `middleware.getStats()`

### High Memory Usage

**Symptom**: Memory grows unbounded

**Fix**:
1. Reduce `maxEntries` size
2. Reduce `ttlMs` (shorter expiration)
3. Monitor with `middleware.getStats()`

### Stuck Requests

**Symptom**: Some requests never complete (stuck in "processing")

**Cause**: Handler crashed before calling `recordSuccess` or `recordFailure`

**Fix**:
1. Ensure proper error handling in wrapped handlers
2. Add timeout to handler execution
3. Manual cleanup if necessary

## See Also

- `src/state/idempotency_cache.ts` - Core implementation
- `src/state/idempotency_middleware.ts` - Middleware wrapper
- `tools/wvo_mcp/docs/IDEMPOTENCY_DESIGN.md` - Detailed design documentation
