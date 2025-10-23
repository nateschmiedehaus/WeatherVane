# Resource Management Architecture

## Problem Statement

Long-running autopilot sessions crash due to unbounded resource growth:
- **667MB log files** with full error dumps (50KB per entry)
- **Event listener leaks** from EventEmitter usage without cleanup
- **Child process accumulation** from 285+ spawn calls
- **Database bloat** with no effective pruning (27MB, 224 tasks)
- **Memory fragmentation** from continuous JSON parsing over 100+ iterations
- **Temp file accumulation** with incomplete cleanup

## Design Principles

1. **Bounded by Default**: All data structures have explicit size limits
2. **Fail Gracefully**: Throttle before crashing, degrade performance instead of dying
3. **Observable**: Track resource usage trends, predict issues before they occur
4. **Zero Regression**: New systems are opt-in with feature flags, gradual rollout
5. **Performance First**: Async operations, batching, compression offloaded to workers

## Architecture Components

### 1. TelemetryManager: Intelligent Logging System

**Purpose**: Replace naive JSONL appending with smart, bounded logging.

**Features**:
- **Log Levels**: DEBUG, INFO, WARN, ERROR with filtering
- **Smart Truncation**: Errors summarized to 500 chars + hash for deduplication
- **Ring Buffers**: In-memory circular buffer (1000 entries) with periodic flush
- **Async Rotation**: Non-blocking rotation at 10MB threshold
- **Background Compression**: gzip in worker thread, doesn't block main loop
- **Retention Policy**: Auto-delete archives > 30 days

**Implementation**:
```typescript
class TelemetryManager {
  private ringBuffer: RingBuffer<LogEntry>;
  private rotationThreshold = 10_000_000; // 10MB
  private compressionQueue: CompressionWorker;

  async log(level: LogLevel, data: object): Promise<void> {
    const entry = this.sanitize(data); // Truncate, dedupe
    this.ringBuffer.push(entry);

    if (this.ringBuffer.shouldFlush()) {
      await this.flushBatch();
    }

    if (this.needsRotation()) {
      this.rotateAsync(); // Fire and forget
    }
  }

  private sanitize(data: object): LogEntry {
    // Truncate error messages to 500 chars
    // Hash long values for deduplication
    // Remove redundant fields
  }
}
```

**Benefits**:
- 95% reduction in log file growth rate
- Non-blocking writes (batched async)
- Deduplication prevents repeated error bloat

---

### 2. ResourceLifecycleManager: Prevent Leaks

**Purpose**: Track and cleanup all acquired resources automatically.

**Features**:
- **Event Listener Registry**: Track all `.on()` calls, auto-cleanup on scope exit
- **Process Pool**: Reuse Codex CLI processes instead of spawning fresh
- **Connection Pool**: Database connection pooling with max limits
- **Temp File Registry**: Track all temp files, cleanup on exit/crash
- **Scoped Resources**: RAII-style pattern for guaranteed cleanup

**Implementation**:
```typescript
class ResourceLifecycleManager {
  private listeners = new Map<EventEmitter, Set<Listener>>();
  private processPool: ProcessPool;
  private tempFiles = new Set<string>();

  // Scope-based resource management
  async withScope<T>(fn: (scope: ResourceScope) => Promise<T>): Promise<T> {
    const scope = new ResourceScope(this);
    try {
      return await fn(scope);
    } finally {
      await scope.cleanup(); // Guaranteed cleanup
    }
  }

  // Event listener tracking
  trackListener(emitter: EventEmitter, event: string, handler: Function) {
    this.listeners.get(emitter)?.add({ event, handler });
    emitter.on(event, handler);
  }

  // Process pool for CLI calls
  async execCodex(args: string[]): Promise<ExecResult> {
    const process = await this.processPool.acquire();
    try {
      return await process.exec(args);
    } finally {
      this.processPool.release(process);
    }
  }
}
```

**Benefits**:
- Zero event listener leaks
- 80% reduction in process spawning overhead
- Guaranteed temp file cleanup even on crash

---

### 3. MemoryBudgetManager: Bounded Growth

**Purpose**: Enforce memory limits on all data structures.

**Features**:
- **LRU Caches**: Historical context, decisions, learnings with max size
- **Ring Buffers**: Fixed-size circular buffers for hot paths
- **Heap Monitoring**: Track V8 heap usage, trigger GC proactively
- **Budget Enforcement**: Reject operations when near memory limit
- **Graceful Degradation**: Drop low-priority data instead of crashing

**Implementation**:
```typescript
class MemoryBudgetManager {
  private heapBudget = 1_500_000_000; // 1.5GB soft limit
  private caches = new Map<string, LRUCache<any, any>>();

  createCache<K, V>(name: string, maxSize: number): LRUCache<K, V> {
    const cache = new LRUCache<K, V>({ max: maxSize });
    this.caches.set(name, cache);
    return cache;
  }

  checkBudget(): MemoryStatus {
    const used = process.memoryUsage().heapUsed;
    const ratio = used / this.heapBudget;

    if (ratio > 0.9) return 'critical'; // Start dropping data
    if (ratio > 0.7) return 'warning';  // Trigger GC
    return 'ok';
  }

  async enforceLimit(): Promise<void> {
    const status = this.checkBudget();

    if (status === 'critical') {
      // Aggressively drop low-priority data
      this.caches.forEach(cache => cache.prune());
      global.gc?.(); // Manual GC if available
    } else if (status === 'warning') {
      // Gentle cleanup
      this.caches.forEach(cache => cache.evict(0.2)); // Drop 20%
    }
  }
}
```

**Benefits**:
- Predictable memory usage (bounded at 1.5GB)
- No OOM crashes, degrades gracefully
- Proactive GC prevents fragmentation

---

### 4. DatabaseOptimizer: Efficient Persistence

**Purpose**: Fix database bloat and performance issues.

**Features**:
- **WAL Mode**: Write-Ahead Logging for better concurrency
- **Connection Pooling**: Reuse connections, max 5 concurrent
- **Auto-Pruning**: Delete tasks > 7 days old automatically
- **Incremental VACUUM**: Run VACUUM in background thread
- **Prepared Statements**: Cache common queries

**Implementation**:
```typescript
class DatabaseOptimizer {
  private pool: Pool<Database>;
  private pruningInterval = 6 * 60 * 60 * 1000; // 6 hours

  async initialize(dbPath: string): Promise<void> {
    this.pool = new Pool({
      create: () => this.createConnection(dbPath),
      max: 5,
      idleTimeout: 30000,
    });

    // Enable WAL mode
    const db = await this.pool.acquire();
    await db.exec('PRAGMA journal_mode = WAL');
    await db.exec('PRAGMA synchronous = NORMAL');
    this.pool.release(db);

    // Start background pruning
    this.startPruningLoop();
  }

  private async pruneOldTasks(): Promise<void> {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const db = await this.pool.acquire();
    try {
      await db.run(
        'DELETE FROM tasks WHERE status = ? AND updated_at < ?',
        ['completed', cutoff]
      );
      await db.run('VACUUM');
    } finally {
      this.pool.release(db);
    }
  }
}
```

**Benefits**:
- 50% faster database operations (WAL mode)
- Bounded database size (auto-pruning)
- No connection leaks (pooling)

---

### 5. ErrorAnalysisWorker: Intelligent Error Processing

**Purpose**: Route errors to a dedicated worker for analysis instead of dumping raw logs.

**Problem**: Currently, preflight failures dump 50KB of raw ruff output into JSONL logs. This bloats files and provides no value - the raw output is just noise.

**Solution**: Route all errors to a specialized worker that:
- **Summarizes** errors (e.g., "53 linting errors: 40 unused imports, 10 unused vars, 3 f-string issues")
- **Deduplicates** identical errors across files
- **Groups** by error type and suggests bulk fixes
- **Extracts actionable items** (e.g., "Run: ruff --fix apps/")
- **Logs summary only** (500 chars max)

**Implementation**:
```typescript
class ErrorAnalysisWorker {
  async analyzeError(error: Error, context: ErrorContext): Promise<ErrorSummary> {
    // Detect error type
    const errorType = this.classifyError(error);

    switch (errorType) {
      case 'linter':
        return this.analyzeLinterError(error);
      case 'typecheck':
        return this.analyzeTypeError(error);
      case 'test_failure':
        return this.analyzeTestFailure(error);
      default:
        return this.genericSummary(error);
    }
  }

  private analyzeLinterError(error: Error): ErrorSummary {
    const lines = error.message.split('\n');
    const errors = this.parseLinterOutput(lines);

    // Group by type
    const byType = groupBy(errors, e => e.code);

    // Generate summary
    const summary = Object.entries(byType)
      .map(([code, items]) => `${items.length}x ${code}`)
      .join(', ');

    // Suggest fix
    const fixable = errors.filter(e => e.fixable).length;
    const suggestion = fixable > 0
      ? `Run: ruff --fix (${fixable} auto-fixable)`
      : 'Manual fixes required';

    return {
      type: 'linter',
      summary: `${errors.length} linting errors: ${summary}`,
      suggestion,
      actionable: true,
      rawSize: error.message.length,
      compressedSize: summary.length,
    };
  }
}

// Integrate into orchestrator
class UnifiedOrchestrator {
  async handleTaskFailure(task: Task, error: Error): Promise<void> {
    // Route to error analysis worker
    const summary = await this.errorWorker.analyzeError(error, {
      taskId: task.id,
      agent: task.agent,
      phase: 'preflight',
    });

    // Log ONLY the summary
    await this.telemetry.log('error', {
      taskId: task.id,
      errorType: summary.type,
      summary: summary.summary,
      suggestion: summary.suggestion,
      compressionRatio: summary.rawSize / summary.compressedSize,
    });

    // If actionable, create fix task
    if (summary.actionable) {
      await this.createFixTask(task, summary);
    }
  }
}
```

**Example Transformation**:

Before (50KB log entry):
```json
{
  "error": "F841 Local variable `roas_floor_active` is assigned to but never used\n   --> apps/allocator/optimizer.py:305:21\n    |\n303 |                             hi = mid\n304 |                     effective_max = max(effective_min, lo)\n305 |                     roas_floor_active = True\n    |                     ^^^^^^^^^^^^^^^^^\n306 |\n307 |         if effective_max < effective_min - 1e-6:\n    |\nhelp: Remove assignment to unused variable `roas_floor_active`\n\nF401 [*] `dataclasses.field` imported but unused\n  --> apps/allocator/train_weather_allocation.py:18:36\n   |\n[... 20KB more ...]"
}
```

After (500 byte summary):
```json
{
  "errorType": "linter",
  "summary": "53 linting errors: 40x F401 (unused imports), 10x F841 (unused vars), 3x F541 (f-string)",
  "suggestion": "Run: ruff --fix (40 auto-fixable)",
  "compressionRatio": 100,
  "actionable": true,
  "fixTaskId": "T2.3.1-fix-linting"
}
```

**Benefits**:
- 99% reduction in error log size (50KB → 500 bytes)
- Actionable insights instead of raw noise
- Automatic fix task creation
- Errors routed to appropriate specialist (don't burden orchestrator)

---

### 6. Enhanced AutopilotHealthMonitor: Predictive Throttling

**Purpose**: Detect resource pressure early and throttle automatically.

**Features**:
- **Trend Analysis**: Track growth rates of logs, memory, processes
- **Predictive Alerts**: Warn when current trend will hit limits in 10 iterations
- **Auto-Throttling**: Reduce agent count when resources constrained
- **Circuit Breaker**: Pause execution if critical resource exhausted
- **Telemetry Dashboard**: Export metrics for external monitoring

**Implementation**:
```typescript
class AutopilotHealthMonitor {
  private metrics: ResourceMetrics[] = [];
  private thresholds = {
    memoryWarning: 0.7,
    memoryCritical: 0.9,
    logFileWarning: 50_000_000,
    processWarning: 50,
  };

  async checkHealth(): Promise<HealthStatus> {
    const current = await this.collectMetrics();
    this.metrics.push(current);

    // Analyze trends
    const memoryTrend = this.calculateTrend('memory');
    const logTrend = this.calculateTrend('logFileSize');

    // Predict future state
    const iterationsUntilCrash = this.predictCrash(memoryTrend);

    if (iterationsUntilCrash < 10) {
      return {
        status: 'critical',
        recommendation: 'reduce_agents',
        reason: `Memory will exhaust in ${iterationsUntilCrash} iterations`,
      };
    }

    // Check current state
    if (current.memoryRatio > this.thresholds.memoryCritical) {
      return {
        status: 'critical',
        recommendation: 'pause_execution',
        reason: 'Memory usage critical',
      };
    }

    return { status: 'ok' };
  }

  private calculateTrend(metric: keyof ResourceMetrics): number {
    // Linear regression on last 10 samples
    const recent = this.metrics.slice(-10);
    return linearRegression(recent.map(m => m[metric]));
  }
}
```

**Benefits**:
- Prevent crashes before they happen
- Automatic adaptation to resource constraints
- Clear visibility into system health

---

## Integration Strategy

### Phase 1: Infrastructure (Week 1)
- Implement `TelemetryManager` with feature flag `SMART_TELEMETRY=1`
- Implement `ResourceLifecycleManager` with opt-in scopes
- Add tests for both components

### Phase 2: Memory Management (Week 2)
- Implement `MemoryBudgetManager`
- Integrate LRU caches into `ContextAssembler`, `HistoricalContextRegistry`
- Add heap monitoring

### Phase 3: Database & Health (Week 3)
- Implement `DatabaseOptimizer`
- Enhance `AutopilotHealthMonitor`
- Enable auto-throttling

### Phase 4: Rollout (Week 4)
- Gradual rollout with telemetry comparison
- Performance benchmarks vs baseline
- Remove feature flags, make default

## Success Metrics

- **Log File Growth**: Reduce from 667MB/day to < 50MB/day (93% reduction)
- **Memory Usage**: Bounded at 1.5GB, no OOM crashes
- **Process Count**: Stable at ~10 processes (down from 50+)
- **Database Size**: Bounded at 10MB with auto-pruning
- **Crash Rate**: Zero crashes in 48-hour runs (currently crashes ~every 6 hours)
- **Throughput**: Maintain or improve task completion rate

## Backward Compatibility

- All new systems are opt-in via feature flags
- Existing code paths unchanged until Phase 4
- Fallback to legacy behavior if new system fails
- Migration path for existing logs/data

## Testing Strategy

- **Unit Tests**: Each component tested in isolation
- **Integration Tests**: Test resource lifecycle end-to-end
- **Load Tests**: 48-hour runs with synthetic workload
- **Regression Tests**: Ensure no performance degradation
- **Chaos Tests**: Inject failures, verify graceful degradation

---

## Implementation Checklist

- [ ] TelemetryManager with ring buffers
- [ ] ResourceLifecycleManager with process pooling
- [ ] MemoryBudgetManager with LRU caches
- [ ] DatabaseOptimizer with WAL and pruning
- [ ] Enhanced AutopilotHealthMonitor
- [ ] Integration tests for all components
- [ ] Load testing (48-hour runs)
- [ ] Documentation and runbooks
- [ ] Feature flag rollout plan
- [ ] Telemetry dashboard

---

## Rollback Plan

If issues detected during rollout:
1. Set feature flag to disable new system
2. Verify fallback to legacy behavior
3. Analyze telemetry for root cause
4. Fix issue in isolated branch
5. Re-test before re-enabling

## Monitoring Alerts

- Alert if log file > 100MB (should never happen with new system)
- Alert if memory > 1.8GB (should be bounded at 1.5GB)
- Alert if process count > 20 (should be ~10 with pooling)
- Alert if database > 15MB (should be pruned at 10MB)
- Alert if crash detected (should be zero)

---

**Status**: Architecture approved, ready for implementation
**Estimated Effort**: 4 weeks (1 component per week)
**Risk Level**: Low (gradual rollout with feature flags)
**Expected Impact**: 95% reduction in crashes, 50% better performance
