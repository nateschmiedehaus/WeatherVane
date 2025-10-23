# Idempotency Keys for Mutating Tools

## Overview

Idempotency keys provide **request deduplication for mutating tools**, preventing duplicate operations when requests are retried due to network failures or client-side retries.

**Key Principle**: Given an idempotency key and tool name, the system returns the same response, **never** executing the mutation twice.

## Design

### Architecture

The idempotency system consists of three components:

1. **IdempotencyStore** (`src/state/idempotency_cache.ts`)
   - In-memory cache with TTL-based expiration
   - Tracks request states: `processing`, `completed`, `failed`
   - Stores request metadata and responses

2. **IdempotencyMiddleware** (`src/state/idempotency_middleware.ts`)
   - Wraps mutating tool handlers
   - Intercepts requests before processing
   - Records outcomes automatically

3. **Integration Points**
   - Wrapped into tool handlers in `WorkerToolRouter`
   - Applied to mutating tools only:
     - `plan_update`
     - `context_write`
     - `context_snapshot`
     - `fs_write`
     - `cmd_run`
     - `heavy_queue_enqueue`
     - `heavy_queue_update`

### Request Lifecycle

```
Client Request
    ↓
Idempotency Check
    ↓
    ├─ [New Request] → Execute Handler
    │                      ↓
    │                   [Success] → Cache Response
    │                      ↓
    │                   Return Response
    │
    └─ [Duplicate Request] → Return Cached Response
```

## Key Features

### 1. Content-Hash Keys

By default, idempotency keys are generated from request content:

```typescript
const key = store.generateKey(toolName, input);
// Example: "fs_write:content:a7c9e4f2b..."
```

This means:
- Same input → Same key → Deduplicated
- Different input → Different key → Executed separately
- **No client-side coordination needed**

### 2. Explicit Keys

Clients can provide explicit idempotency keys for more control:

```typescript
const result = await tool("fs_write", input, "my-key-123");
```

Use cases:
- Correlating requests across systems
- Idempotency keys as request IDs
- Cross-domain deduplication

### 3. TTL-Based Expiration

Cache entries expire after 1 hour (configurable):

```typescript
const store = new IdempotencyStore({ ttlMs: 3600000 });
```

Benefits:
- Bounded memory usage
- Garbage collection of old requests
- Automatic cleanup every 5 minutes

### 4. Capacity Limits

Maximum 10,000 entries (configurable):

```typescript
const store = new IdempotencyStore({ maxEntries: 10000 });
```

When capacity exceeded:
- Oldest entries are evicted (FIFO)
- Maintains stable memory footprint

## Usage Patterns

### Pattern 1: Basic Deduplication

```typescript
// First call
const result1 = await fsWrite({ path: "/test.txt", content: "hello" });

// Retry with same input → Returns cached result, no write
const result2 = await fsWrite({ path: "/test.txt", content: "hello" });

// result1 === result2 (same cached response)
```

### Pattern 2: Explicit Keys

```typescript
const key = "user-123-write-request";

// Store with key
await fsWrite({ path: "/data.json", content: "{}" }, key);

// Retry with same key → Returns cached response
await fsWrite({ path: "/data.json", content: "{}" }, key);
```

### Pattern 3: Error Deduplication

```typescript
// First call fails
try {
  await fsWrite({ path: "/readonly/data.txt", content: "..." });
} catch (e) {
  // Permission denied
}

// Retry → Returns cached error, doesn't re-attempt
try {
  await fsWrite({ path: "/readonly/data.txt", content: "..." });
} catch (e) {
  // Same error, from cache
}
```

### Pattern 4: Integration with Tool Router

```typescript
// In WorkerToolRouter initialization
const idempotencyStore = new IdempotencyStore();
const middleware = new IdempotencyMiddleware(idempotencyStore);

// Wrap handlers
const handlers = new Map([
  ["fs_write", this.handleFsWrite.bind(this)],
  ["plan_update", this.handlePlanUpdate.bind(this)],
  ["context_write", this.handleContextWrite.bind(this)],
]);

const wrappedHandlers = middleware.wrapHandlers(handlers);

// Use wrapped handlers
const result = await wrappedHandlers.get("fs_write")(input, key);
```

## Implementation Details

### Request State Tracking

```typescript
interface IdempotencyEntry {
  key: string;
  toolName: string;
  request: unknown;
  response?: unknown;      // Set on success
  error?: string;          // Set on failure
  state: "processing" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
  expiresAt: number;
}
```

### Hash Generation

Uses SHA-256 hash of JSON-stringified input:

```typescript
const contentHash = crypto
  .createHash("sha256")
  .update(JSON.stringify(input))
  .digest("hex");
const key = `${toolName}:content:${contentHash}`;
```

**Note**: Deterministic JSON stringification ensures consistency across retries.

### Cleanup Strategy

1. **TTL-based**: Entries expire after `ttlMs`
2. **Periodic**: Cleanup runs every 5 minutes (background)
3. **Capacity**: LRU eviction when max entries exceeded

## Performance Characteristics

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| startRequest | O(1) | Hash lookup |
| recordSuccess | O(1) | Direct update |
| recordFailure | O(1) | Direct update |
| cleanup | O(n) | Periodic, n = cache size |
| getEntry | O(1) | Cache lookup |

**Memory Usage**:
- Per entry: ~500 bytes (estimate)
- 10,000 entries: ~5 MB
- TTL: 1 hour (default)

## Testing

The implementation includes comprehensive tests covering:

### Unit Tests (44 tests total)

**IdempotencyStore** (23 tests):
- Request lifecycle transitions
- Key generation and consistency
- TTL and expiration
- Capacity enforcement
- Error handling
- Cleanup mechanisms
- Statistics tracking

**IdempotencyMiddleware** (21 tests):
- Handler wrapping
- Duplicate detection
- Error caching
- Explicit keys
- Batch operations
- Enable/disable functionality
- Real-world scenarios
- Integration patterns

Run tests:
```bash
npx vitest run tools/wvo_mcp/src/state/idempotency*.test.ts
```

## Safety Guarantees

1. **Atomicity**: Each request state transition is atomic
2. **Idempotency**: Same key+tool always returns same response
3. **Error Consistency**: Failed requests cache errors consistently
4. **Memory Bounded**: TTL and capacity limits prevent unbounded growth
5. **No Side Effects**: Duplicate requests don't trigger side effects

## Edge Cases Handled

1. **Concurrent Retries**: Multiple concurrent requests with same input
   - First wins, others get cached response
   - All receive same outcome

2. **Processing State**: Request still processing when retry arrives
   - Treated as new request
   - Handled transparently

3. **Error Message Preservation**: Error from first attempt cached
   - Same error returned to all duplicates
   - Distinguishable with `CachedIdempotencyError` name

4. **Capacity Overflow**: Cache exceeds max entries
   - Oldest entries evicted
   - No loss of active entries

## Configuration

### Runtime Options

```typescript
const store = new IdempotencyStore({
  ttlMs: 3600000,        // 1 hour (default)
  maxEntries: 10000,     // Max cached requests
});

const middleware = new IdempotencyMiddleware(store, true); // true = enabled
```

### Enable/Disable

```typescript
middleware.setEnabled(false);  // Disable for debugging
middleware.setEnabled(true);   // Re-enable
```

### Monitoring

```typescript
const stats = middleware.getStats();
// Returns:
// {
//   size: 150,           // Current cached entries
//   maxEntries: 10000,   // Configured limit
//   processingCount: 2,  // Requests being processed
//   completedCount: 140, // Successfully completed
//   failedCount: 8       // Failed requests
// }
```

## Production Deployment

### Recommendations

1. **Enable by Default**: Idempotency provides safety at minimal cost
2. **Monitor Stats**: Track cache size and hit rates
3. **Set TTL Conservatively**: 1 hour covers most retry scenarios
4. **Test Error Paths**: Verify error caching works as expected
5. **Health Checks**: Monitor for stuck "processing" entries

### Metrics to Track

- Cache hit rate: `(completedCount + failedCount) / totalRequests`
- Average response time: Should improve with caching
- Memory usage: Should stabilize at `entries × 500 bytes`

## Future Enhancements

1. **Redis Backend**: Distributed idempotency across processes
2. **Metrics Export**: OpenTelemetry integration
3. **Automatic Rollover**: Keep historical logs of idempotency decisions
4. **Adaptive TTL**: Adjust based on request patterns
5. **Client-Side Integration**: Idempotency key generation helpers

## Related Tasks

- **T9.2.1**: Strict output DSL validation (predecessor)
- **E9**: Safe caching layer epic
- **T9.2.2**: This task (idempotency keys implementation)

## References

- [RFC 9110 - HTTP Semantics (Idempotency)](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2)
- [Stripe Idempotent Requests](https://stripe.com/docs/api/idempotent_requests)
- [AWS Lambda Idempotency](https://docs.aws.amazon.com/lambda/latest/dg/API_Invoke.html)
