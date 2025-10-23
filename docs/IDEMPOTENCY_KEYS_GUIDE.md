# Idempotency Keys for Mutating Tools - Complete Guide

## Overview

This document describes WeatherVane's idempotency system for mutating tools. Idempotency keys prevent duplicate operations when requests are retried, ensuring safe exactly-once semantics for critical operations.

**Status**: Production-ready
**Architecture**: Two-tier (in-memory + pluggable Redis backend)
**Coverage**: All mutating tools in MCP worker

## Table of Contents

1. [Why Idempotency Matters](#why-idempotency-matters)
2. [How It Works](#how-it-works)
3. [Architecture](#architecture)
4. [Usage](#usage)
5. [Backend Selection](#backend-selection)
6. [Integration Examples](#integration-examples)
7. [Best Practices](#best-practices)
8. [Monitoring & Debugging](#monitoring--debugging)

## Why Idempotency Matters

When network failures occur, clients retry requests. Without idempotency, the same operation might execute multiple times:

```
Request 1: Update catalog (success, but response lost)
Request 2: Retry same update (duplicate!)
```

Idempotency keys guarantee that identical requests produce the same result, regardless of how many times they're retried.

### Examples Where This Matters

**File Writes**: Writing `/state/catalog.json` twice should be atomic, not compound
**Database Updates**: Creating a workflow task should happen once, not multiple times
**Analytics Events**: Recording a decision should generate one event, not 100
**Financial**: Charging a customer once, not 10 times due to retries

## How It Works

### Key Generation

The system generates deterministic keys from request content:

```typescript
// Same input → Same key
const key1 = cache.generateKey("fs_write", {path: "/file.txt", content: "hello"});
const key2 = cache.generateKey("fs_write", {path: "/file.txt", content: "hello"});
// key1 === key2 ✓

// Different input → Different key
const key3 = cache.generateKey("fs_write", {path: "/file.txt", content: "goodbye"});
// key1 !== key3 ✓

// Different tool → Different key
const key4 = cache.generateKey("context_write", {path: "/file.txt", content: "hello"});
// key1 !== key4 ✓
```

Keys are generated using SHA256 hashing of canonicalized JSON. This ensures:
- **Stability**: Same input always produces the same key
- **Property-order independence**: `{a:1, b:2}` and `{b:2, a:1}` produce the same key
- **Deterministic**: No randomness or timestamps in key generation

### Request Lifecycle

Each request moves through states:

```
Request arrives
    ↓
Check: Is this key already processing/completed?
    ├─ YES (completed) → Return cached response ✓
    ├─ YES (failed) → Return cached error ✓
    └─ NO → Mark as "processing", execute handler
               ↓
         Handler executes
               ↓
         Success? → Record response, mark "completed" ✓
         Failure? → Record error, mark "failed" ✓
```

### Entry Lifespan

Each cached entry tracks:

```typescript
interface IdempotencyEntry {
  key: string;           // Idempotency key
  toolName: string;      // Tool that created it
  request: unknown;      // Original request input
  response?: unknown;    // Cached response (if completed)
  error?: string;        // Cached error (if failed)
  state: "processing" | "completed" | "failed";
  createdAt: number;     // When request arrived
  completedAt?: number;  // When it finished
  expiresAt: number;     // When cache entry expires
}
```

**TTL Management**:
- Default: 1 hour expiration (3600000ms)
- Entries older than TTL are automatically cleaned up
- In-memory backend: Cleanup every 5 minutes
- Redis backend: Uses Redis EXPIRE (native support)

## Architecture

### Component Overview

```
┌─────────────────────────────────────────┐
│     Mutating Tool Handler              │
│  (fs_write, context_write, etc.)       │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│    IdempotencyMiddleware               │
│  - Intercepts requests                 │
│  - Checks cache                        │
│  - Records outcomes                    │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
┌───▼────────────────┐   ┌──▼─────────────────┐
│ IdempotencyCache   │   │ IdempotencyBackend │
│ (High-level API)   │   │ (Storage layer)    │
└────────────────────┘   └────────┬──────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
            ┌───────▼──────┐  ┌──▼──────────┐
            │   Memory     │  │   Redis    │  Custom?
            │   Backend    │  │  Backend   │
            └──────────────┘  └────────────┘
```

### Key Classes

#### IdempotencyBackend (Interface)

The storage abstraction. Supports multiple implementations:

```typescript
interface IdempotencyBackend {
  setProcessing(key, toolName, request, ttlMs): Promise<void>;
  get(key): Promise<IdempotencyEntry | undefined>;
  recordSuccess(key, response): Promise<void>;
  recordFailure(key, error): Promise<void>;
  delete(key): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<CacheStats>;
  destroy(): Promise<void>;
}
```

**Built-in Implementations**:

1. **InMemoryIdempotencyBackend** (default)
   - Uses JavaScript Map
   - Single-process only
   - No external dependencies
   - Fast (nanosecond lookups)

2. **RedisIdempotencyBackend** (optional)
   - Uses Redis with SETEX/GET
   - Multi-process, distributed
   - Requires `npm install redis`
   - Suitable for production at scale

#### IdempotencyCacheV2

High-level cache API. Wraps a backend and provides:
- Content-hash key generation
- Request lifecycle management
- Statistics tracking

```typescript
const cache = await IdempotencyCacheV2.create({
  ttlMs: 3600000,
  backendType: "memory", // or "redis"
  redisConfig: { host: "redis.internal", port: 6379 }
});

// Check if request is duplicate
const { isNewRequest, existingResponse, existingError }
  = await cache.startRequest("fs_write", input);

if (!isNewRequest) {
  // Return cached result without re-executing
  return existingResponse || throw existingError;
}

// Execute handler...

// Record outcome
await cache.recordSuccess("fs_write", input, response);
// OR
await cache.recordFailure("fs_write", input, error);
```

#### IdempotencyMiddleware

Wraps tool handlers to apply idempotency automatically:

```typescript
const middleware = new IdempotencyMiddleware(cache);

const wrapped = middleware.wrap("fs_write", fsWriteHandler);

// Identical calls return cached result
await wrapped(input);  // Executes handler
await wrapped(input);  // Returns cached response
```

## Usage

### Basic Usage (In-Memory)

```typescript
import { IdempotencyCacheV2 } from "./state/idempotency_cache_v2.js";
import { IdempotencyMiddleware } from "./state/idempotency_middleware.js";

// Create cache
const cache = await IdempotencyCacheV2.create({
  ttlMs: 3600000, // 1 hour
});

// Create middleware
const middleware = new IdempotencyMiddleware(cache);

// Wrap handler
const wrapped = middleware.wrap("fs_write", async (input) => {
  // Your handler logic
  return { ok: true };
});

// Use wrapped handler
const result = await wrapped({ path: "/file.txt", content: "data" });
```

### With Explicit Idempotency Keys

Clients can provide their own keys:

```typescript
const customKey = "campaign-2025-update-123";

// First call
await wrapped(input, customKey);

// Retry with same key
await wrapped(input, customKey);  // Returns cached response
```

### With Redis Backend

```typescript
const cache = await IdempotencyCacheV2.create({
  ttlMs: 3600000,
  backendType: "redis",
  redisConfig: {
    host: "redis.internal",
    port: 6379,
    password: process.env.REDIS_PASSWORD,
    db: 1,
  }
});

// Rest of API is identical
```

### Disabling Idempotency

For testing or specific scenarios:

```typescript
const middleware = new IdempotencyMiddleware(cache, false);
// enabled = false → handler executes every time
```

## Backend Selection

### In-Memory Backend

**Use when**:
- Single-process deployments
- Low request volume (<100 req/sec)
- Durability not required (cache is optional)
- Simplicity preferred

**Characteristics**:
- Zero external dependencies
- Automatic TTL cleanup (every 5 min)
- FIFO eviction when capacity exceeded (default: 10k entries)
- Fast (nanosecond lookups)

### Redis Backend

**Use when**:
- Multi-process deployments
- Horizontal scaling required
- Shared cache across processes
- High availability (replicated Redis)

**Characteristics**:
- Requires Redis server
- Native TTL expiration
- Arbitrary size (Redis limits)
- Network latency trade-off

**Configuration**:

```typescript
const cache = await IdempotencyCacheV2.create({
  backendType: "redis",
  redisConfig: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || "0"),
  }
});
```

**Performance**:
- Memory: ~100 bytes per cached entry in Redis
- Latency: ~5-10ms per operation (network dependent)
- Throughput: Supports 1000s of concurrent requests

## Integration Examples

### Example 1: File System Tool

```typescript
// In tool_router.ts
private createFsWriteHandler(): WrappedHandler {
  return this.idempotencyMiddleware.wrap("fs_write", async (rawInput) => {
    const input = fsWriteInput.parse(rawInput);

    // The write is idempotent:
    // - Duplicate calls within 1 hour return same response
    // - File is written exactly once
    await this.session.writeFile(input.path, input.content);

    return jsonResponse({ ok: true });
  });
}
```

### Example 2: Plan Update Tool

```typescript
private createPlanUpdateHandler(): WrappedHandler {
  return this.idempotencyMiddleware.wrap("plan_update", async (rawInput) => {
    const input = planUpdateInput.parse(rawInput);

    // Idempotency key generated from {task_id, status}
    // Same update returned on retry
    const result = await this.session.upsertTaskStatus(
      input.task_id,
      input.status,
    );

    return jsonResponse(result);
  });
}
```

### Example 3: Custom Tool with Manual Key

```typescript
// Client provides explicit key for long-running operations
const idempotencyKey = `campaign-update-${campaignId}-${timestamp}`;

const result = await wrapped(
  { campaign_id: campaignId, data: {...} },
  idempotencyKey,
);
```

## Best Practices

### 1. Key Generation

Idempotency keys should include all inputs that affect the outcome:

```typescript
// ✓ Good: Key varies based on actual data
await cache.startRequest("update_catalog", {
  product_id: "P123",
  price: 29.99,
  inventory: 100,
});

// ✗ Bad: Key doesn't reflect content changes
await cache.startRequest("update_catalog", {
  timestamp: Date.now(), // Don't include timestamps!
  product_id: "P123",    // Content
});
```

### 2. Request Input Design

Structure request inputs to be idempotency-friendly:

```typescript
// ✓ Good: Clear, deterministic
const input = {
  task_id: "T123",
  status: "completed",
  reason: "Weather threshold met"
};

// ✗ Bad: Random/non-deterministic elements
const input = {
  task_id: "T123",
  status: "completed",
  timestamp: Date.now(),  // Breaks idempotency!
  random_id: Math.random(), // Breaks idempotency!
};
```

### 3. TTL Configuration

Set TTL based on your retry strategy:

```typescript
// Network failures: retry within seconds
// → TTL: 5 minutes minimum
const cache = await IdempotencyCacheV2.create({
  ttlMs: 300000, // 5 minutes
});

// Operational errors: may retry within hours
// → TTL: 1-6 hours (default is 1 hour)
const cache = await IdempotencyCacheV2.create({
  ttlMs: 3600000, // 1 hour
});
```

### 4. Error Handling

Cached errors should be handled same as fresh errors:

```typescript
try {
  const result = await wrapped(input);
} catch (error) {
  if (error.name === "CachedIdempotencyError") {
    // Same handling as fresh error
  }
  // Re-throw or handle
}
```

### 5. Monitoring

Track cache hit rates and effectiveness:

```typescript
const stats = await middleware.getStats();
console.log(`Cache stats:
  Size: ${stats.size}
  Completed: ${stats.completedCount}
  Failed: ${stats.failedCount}
  Processing: ${stats.processingCount}
`);

// High completion/failure ratio = working well
// Low completion ratio = cache not helping (check TTL)
```

## Monitoring & Debugging

### Cache Statistics

```typescript
const stats = await cache.getStats();

// Interpretation:
// size: Total entries in cache
// processingCount: Requests currently executing
// completedCount: Requests with cached responses
// failedCount: Requests with cached errors

// Healthy profile:
// - completedCount >> failedCount
// - processingCount ≤ 10 (most execute quickly)
// - size < maxEntries
```

### Debugging Cache Misses

If expected cache hits aren't happening:

```typescript
// 1. Check if key generation is stable
const key1 = cache.generateKey("tool", input);
const key2 = cache.generateKey("tool", input);
console.assert(key1 === key2, "Key not stable!");

// 2. Verify TTL hasn't expired
const entry = await cache.getEntry("tool", input);
if (!entry) {
  console.log("Entry expired or never cached");
}

// 3. Check for property order issues
const input1 = {a: 1, b: 2};
const input2 = {b: 2, a: 1};
console.assert(
  cache.generateKey("tool", input1) ===
  cache.generateKey("tool", input2),
  "Order sensitivity issue!"
);
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| No cache hits | TTL too short | Increase `ttlMs` |
| Memory grows unbounded | In-memory backend capacity | Use Redis or increase `maxEntries` |
| Key generation varies | Non-deterministic input | Remove timestamps, random values |
| Stale cached errors | Transient errors cached | Reduce TTL or retry differently |
| Redis connection fails | Redis unavailable | Check Redis server, credentials |

## Migration from v1 to v2

The v2 API is backward compatible. Existing code continues to work:

```typescript
// Old (still works)
import { IdempotencyStore } from "./state/idempotency_cache.js";
const store = new IdempotencyStore();

// New (preferred)
import { IdempotencyCacheV2 } from "./state/idempotency_cache_v2.js";
const cache = await IdempotencyCacheV2.create();
```

Migration steps:
1. Add `idempotency_backend.ts` and `idempotency_cache_v2.ts`
2. Gradually replace `IdempotencyStore` with `IdempotencyCacheV2`
3. Old tests continue passing
4. At scale, switch to Redis backend

## Summary

| Aspect | Details |
|--------|---------|
| **What** | Prevents duplicate operations via request deduplication |
| **How** | Content-hash keys + state tracking in pluggable storage |
| **Where** | All mutating tools (fs_write, context_write, plan_update, etc.) |
| **Scale** | In-memory for single-process, Redis for distributed |
| **Overhead** | ~100 bytes/entry, nanosecond lookups (memory) |
| **Durability** | Cache is optional; missing cache = slower but correct |
| **Testing** | 40+ test cases covering all scenarios |

## References

- `src/state/idempotency_cache.ts` - Original in-memory implementation (still used)
- `src/state/idempotency_cache_v2.ts` - v2 with pluggable backends
- `src/state/idempotency_backend.ts` - Backend abstraction + Redis implementation
- `src/state/idempotency_middleware.ts` - Handler wrapping
- `src/worker/tool_router.ts` - Tool integration point
