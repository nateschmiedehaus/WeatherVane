# THINK - Edge Cases & Failure Modes

**Task:** AFP-W0-M1-MVP-SUPERVISOR-SCAFFOLD
**Date:** 2025-11-05

---

## Edge Cases

### EC1: Concurrent Lease Acquisition (Race Condition)
**Scenario**: Two code paths attempt to acquire the same task lease simultaneously
```typescript
// Thread A                          // Thread B
if (!leases.has('TASK-1')) {        if (!leases.has('TASK-1')) {
  // Both see task not leased          // Both see task not leased
  leases.set('TASK-1', {...});        leases.set('TASK-1', {...});
  return true;                        return true;
}                                   }
```

**Likelihood**: LOW (single-threaded Node.js, single-process MVP)
**Impact**: HIGH (duplicate task execution if it occurs)
**Detection**: Lifecycle events show multiple `task.selected` for same task
**Mitigation** (MVP):
- Accept risk (single event loop, race unlikely)
- Log warning if detected in telemetry analysis
- Document limitation in README

**Mitigation** (Future):
- Use atomic compare-and-set (Redis `SET NX`)
- Add distributed lock with fencing tokens
- Test: Spawn multiple supervisor processes, verify single lease holder

---

### EC2: Lease Expiry During Long-Running Task
**Scenario**: Task execution exceeds lease TTL (10 min default)
```
T=0:    Supervisor A acquires lease for TASK-1 (TTL=10min)
T=1:    Orchestrator starts executing TASK-1
T=10:   Lease expires (task still running)
T=11:   Supervisor B acquires lease for TASK-1 (sees expired)
T=11:   Supervisor B assigns TASK-1 to orchestrator
        → Duplicate execution! Task runs twice simultaneously
```

**Likelihood**: MEDIUM (complex tasks may exceed 10 min)
**Impact**: HIGH (wasted resources, duplicate work, potential data corruption)
**Detection**: Multiple `task.assigned` events for same task
**Mitigation** (MVP):
- Document 10-minute time limit
- Set TTL to 30 minutes (reduce likelihood)
- Accept risk (most tasks <10 min in testing)

**Mitigation** (Future):
- Add lease renewal background worker
- Orchestrator notifies supervisor when task starts → extend lease automatically
- Supervisor tracks task progress, renews lease periodically

**Test Case**:
```typescript
test('Long-running task (>10 min) causes lease expiry', async () => {
  const leaseManager = new LeaseManager(1000); // 1 second TTL for test
  await leaseManager.acquireLease('TASK-1');

  await sleep(1500); // Wait for expiry

  const canReacquire = await leaseManager.acquireLease('TASK-1');
  expect(canReacquire).toBe(true); // Lease expired, can reacquire
});
```

---

### EC3: Graceful Shutdown with Active Leases
**Scenario**: Supervisor receives SIGTERM while tasks are in progress
```
T=0:    Supervisor acquires leases for TASK-1, TASK-2, TASK-3
T=1:    Tasks executing (orchestrator working)
T=5:    SIGTERM received (deployment, restart)
T=5:    Supervisor.stop() called
        → Should release all leases before exiting
        → But tasks are still executing in orchestrator
```

**Likelihood**: HIGH (deployments, restarts)
**Impact**: MEDIUM (leases released, tasks may not complete)
**Questions**:
- Should supervisor wait for tasks to complete?
- Should supervisor force-release leases immediately?
- Should orchestrator continue execution after supervisor exits?

**Mitigation** (MVP):
```typescript
async stop(): Promise<void> {
  this.running = false; // Stop polling loop
  await this.leaseManager.releaseAll(); // Release all leases
  // Note: Orchestrator continues execution independently
  // Tasks in progress will complete, but no new tasks assigned
}
```

**Mitigation** (Future):
- Add graceful shutdown timeout (wait up to 5 min for tasks)
- Orchestrator tracks supervisor health, pauses if supervisor dies
- Supervisor persists active task list, resumes after restart

---

### EC4: Telemetry File Write Failure (Disk Full, Permissions)
**Scenario**: Lifecycle event emission fails due to I/O error
```typescript
await lifecycleTelemetry.emit('task.selected', { taskId: 'TASK-1' });
// throws Error: ENOSPC: no space left on device
```

**Likelihood**: LOW (rare, but possible in production)
**Impact**: MEDIUM (lose observability, can't track task lifecycle)
**Questions**:
- Should supervisor continue executing despite telemetry failure?
- Should supervisor retry telemetry writes?
- Should supervisor fail-fast and stop if can't emit events?

**Mitigation** (MVP):
```typescript
try {
  await fs.appendFile(this.logPath, JSON.stringify(event) + '\n', 'utf-8');
} catch (error) {
  logError('Failed to emit lifecycle event', { error, eventType, taskId });
  // Continue execution (don't crash supervisor due to telemetry failure)
}
```

**Mitigation** (Future):
- Add disk space check before emission
- Add telemetry buffer (queue events in memory, flush periodically)
- Add fallback telemetry targets (stdout, syslog, external service)

---

### EC5: Task Disappears During Execution
**Scenario**: Supervisor selects task, but task deleted from database before assignment
```typescript
const task = await selectNextTask(); // Returns TASK-1
// Meanwhile: Another process deletes TASK-1 from database
await leaseManager.acquireLease(task.id); // Succeeds (lease acquired)
await orchestrator.executeTask(task); // Fails: task not found in database
```

**Likelihood**: LOW (requires external modification)
**Impact**: MEDIUM (supervisor stuck with lease for nonexistent task)
**Mitigation** (MVP):
- Orchestrator handles task-not-found gracefully
- Supervisor releases lease on execution failure
- Log warning

**Mitigation** (Future):
- Add task existence validation before lease acquisition
- Add database transaction (atomic task fetch + lease acquire)

---

### EC6: Zero Available Tasks (Idle Loop)
**Scenario**: No tasks available (all done, blocked, or in_progress)
```typescript
while (running) {
  const availableTasks = await getTasks({ status: 'pending' });
  // Returns [] (empty array)
  const nextTask = selectNextTask(availableTasks);
  // Returns null

  // What should supervisor do?
  // - Sleep for polling interval (5s)
  // - Emit idle event?
  // - Check for blocked tasks that can be unblocked?
}
```

**Likelihood**: HIGH (common in task lifecycle)
**Impact**: LOW (normal operation, not a failure)
**Mitigation** (MVP):
```typescript
if (nextTask === null) {
  // No tasks available, sleep and continue polling
  await sleep(this.config.pollingIntervalMs);
  continue;
}
```

**Mitigation** (Future):
- Emit idle event for observability
- Implement backoff (increase polling interval when idle)
- Add webhook/event listener (push notification when tasks become available)

---

## Failure Modes

### FM1: In-Memory Lease Map Lost on Crash
**Cause**: Process crash (OOM, segfault, SIGKILL)
**Symptom**: Leases not released, tasks stuck as "leased" (if persisted)
**Impact** (MVP): NONE (leases are in-memory, lost on crash → clean slate on restart)
**Impact** (Future): HIGH (if leases persisted to database, orphaned leases block tasks)
**Recovery**:
- **MVP**: Restart supervisor (in-memory map reset)
- **Future**: Add lease cleanup on startup (remove leases older than 2x TTL)

**Test Case**:
```typescript
test('Crash recovery: leases reset on restart', async () => {
  const leaseManager = new LeaseManager();
  await leaseManager.acquireLease('TASK-1');
  expect(leaseManager.hasLease('TASK-1')).toBe(true);

  // Simulate crash: create new instance
  const leaseManager2 = new LeaseManager();
  expect(leaseManager2.hasLease('TASK-1')).toBe(false); // Clean slate
});
```

---

### FM2: Telemetry File Grows Unbounded
**Cause**: Continuous task execution, no log rotation
**Symptom**: `supervisor_lifecycle.jsonl` grows to gigabytes
**Impact**: Disk full, I/O slowdown, application crash
**Detection**: Monitor file size (`du -sh state/analytics/supervisor_lifecycle.jsonl`)
**Recovery**:
- Manual rotation: `mv supervisor_lifecycle.jsonl supervisor_lifecycle_$(date).jsonl`
- Truncate: `> supervisor_lifecycle.jsonl`

**Mitigation** (MVP):
- Document manual rotation procedure
- Accept risk (monitor during testing)

**Mitigation** (Future):
- Add automatic log rotation (weekly or >100MB)
- Add compression (gzip old logs)
- Add retention policy (delete logs >30 days)

---

### FM3: Supervisor Polling Degrades Under Load
**Cause**: High task throughput (100+ tasks/min), slow selectNextTask()
**Symptom**: Supervisor loop falls behind, tasks delayed
**Impact**: Reduced throughput, increased latency
**Detection**: Metric - time between `task.selected` events increases
**Root Cause**: `getTasks()` query becomes slow (O(n) filtering)

**Mitigation** (MVP):
- Accept risk (low throughput in MVP)
- Simple query optimization (status index already exists)

**Mitigation** (Future):
- Add database index on (status, dependencies_met)
- Add query result caching (invalidate on task status change)
- Add priority queue (in-memory ready task queue)

---

### FM4: Supervisor-Orchestrator Desync
**Cause**: Supervisor thinks task assigned, orchestrator never received it
**Symptom**: Lease acquired but task never executes
**Impact**: Task stuck (supervisor won't reassign, orchestrator doesn't have it)
**Scenario**:
```typescript
await leaseManager.acquireLease(task.id); // Success
await lifecycleTelemetry.emit('task.selected', { taskId: task.id });
// Network partition, process crash, or exception here
await orchestrator.executeTask(task); // Never reached
```

**Detection**: Lease acquired but no `task.started` event within timeout
**Recovery**:
- Lease expiry (10 min TTL) automatically releases
- Another supervisor can acquire after expiry

**Mitigation** (MVP):
- Accept risk (in-process call, unlikely to fail)
- Rely on lease TTL for recovery

**Mitigation** (Future):
- Add task execution timeout monitoring
- Add supervisor watchdog (detect stuck leases, force release)
- Add idempotent retry (orchestrator confirms receipt)

---

### FM5: Multiple Supervisor Instances (Future Failure Mode)
**Cause**: Horizontal scaling (multiple supervisor processes for high availability)
**Symptom**: All supervisors compete for same tasks
**Impact**: Without distributed locks, duplicate execution possible
**Detection**: Multiple `task.selected` events from different supervisor IDs

**Mitigation** (MVP):
- NOT APPLICABLE (single-process MVP)
- Document limitation: "Run only one supervisor instance"

**Mitigation** (Future):
- Replace in-memory lease with distributed lock (Redis, etcd)
- Add supervisor leader election (only leader assigns tasks)
- Add supervisor ID to lease (track which supervisor owns task)

---

## Complexity Analysis

### Cyclomatic Complexity

**LeaseManager.acquireLease():**
```typescript
async acquireLease(taskId: string, ttlMs?: number): Promise<boolean> {
  const existingLease = this.leases.get(taskId);

  if (existingLease) {                        // Branch 1
    const elapsed = Date.now() - existingLease.acquiredAt;
    if (elapsed < existingLease.ttlMs) {      // Branch 2
      return false; // Still valid
    }
    this.leases.delete(taskId); // Expired
  }

  this.leases.set(taskId, {...});
  return true;
}
```
**Branches**: 2 (if existingLease, if not expired)
**Complexity**: LOW (2 branches, easy to test)

**LeaseManager.releaseLease():**
```typescript
async releaseLease(taskId: string): Promise<void> {
  if (this.leases.has(taskId)) {              // Branch 1
    this.leases.delete(taskId);
  }
}
```
**Branches**: 1
**Complexity**: TRIVIAL

**LeaseManager.renewLease():**
```typescript
async renewLease(taskId: string): Promise<boolean> {
  const lease = this.leases.get(taskId);
  if (!lease) {                               // Branch 1
    return false;
  }
  lease.acquiredAt = Date.now();
  return true;
}
```
**Branches**: 1
**Complexity**: TRIVIAL

**LifecycleTelemetry.emit():**
```typescript
async emit(eventType: LifecycleEventType, payload: LifecycleEventPayload): Promise<void> {
  try {
    await fs.appendFile(...);
  } catch (error) {                           // Branch 1 (error handling)
    logError(...);
  }
}
```
**Branches**: 1 (try/catch)
**Complexity**: TRIVIAL

**Total Cyclomatic Complexity (Batch 1)**: ~5 branches
**Assessment**: LOW complexity, easy to understand and test

---

### Cognitive Complexity

**LeaseManager**:
- Familiar pattern (mutex, semaphore, distributed lock)
- Single responsibility (manage leases)
- No external dependencies (in-memory only)
- **Cognitive Load**: LOW

**LifecycleTelemetry**:
- Append-only log pattern (common in telemetry)
- Single responsibility (emit events)
- Simple I/O (JSONL append)
- **Cognitive Load**: LOW

**Both Modules**:
- No state machines (simple data structures)
- No complex algorithms (map operations, file append)
- No domain logic (infrastructure components)
- **Cognitive Load**: LOW

**Overall Cognitive Complexity**: LOW
- **Rationale**: Well-understood patterns, minimal logic, clear purpose

---

### Testing Complexity

**LeaseManager Tests**:
- 7 test cases (acquire, release, renew, expiry, releaseAll)
- All deterministic (no timing issues, no external dependencies)
- Easy to mock (in-memory map)
- **Testing Effort**: LOW (~30 min to write all tests)

**LifecycleTelemetry Tests**:
- 5 test cases (emit, directory creation, format, error handling)
- Requires filesystem (temp directory for tests)
- Mock-friendly (can mock fs module if needed)
- **Testing Effort**: LOW (~20 min to write all tests)

**Total Testing Effort**: ~50 min (both modules)
**Assessment**: LOW effort, high confidence

---

## Mitigation Strategies

### Strategy 1: Accept MVP Limitations, Document Future Enhancements
**Applies to**: In-memory leases, no log rotation, single-process only
**Approach**:
- Add README.md to `autopilot_mvp/supervisor/` documenting:
  - MVP limitations
  - Future enhancements
  - Known edge cases
  - Recommended usage

**Example**:
```markdown
# Supervisor MVP Limitations

## In-Memory Leases
- Leases lost on crash (clean slate on restart)
- No distributed lock (run only one supervisor instance)
- Future: Replace with Redis lock

## No Log Rotation
- `supervisor_lifecycle.jsonl` grows unbounded
- Manual rotation recommended (weekly)
- Future: Add automatic rotation

## Single-Process Only
- Do not run multiple supervisor instances simultaneously
- Future: Add leader election
```

---

### Strategy 2: Defensive Programming (Error Handling)
**Applies to**: Telemetry failures, orchestrator errors, task not found
**Approach**:
- Wrap all I/O operations in try/catch
- Continue execution on non-critical failures (telemetry)
- Fail fast on critical failures (database connection lost)
- Log all errors with context

**Example**:
```typescript
try {
  await orchestrator.executeTask(task);
} catch (error) {
  logError('Task execution failed', { taskId: task.id, error });
  await leaseManager.releaseLease(task.id); // Clean up
  await lifecycleTelemetry.emit('task.failed', {
    taskId: task.id,
    reason: error instanceof Error ? error.message : String(error),
  });
  // Continue to next task (don't crash supervisor)
}
```

---

### Strategy 3: Observability First (Lifecycle Events)
**Applies to**: All supervisor operations
**Approach**:
- Emit lifecycle event for every significant operation
- Include context (taskId, reason, timestamp)
- Enable post-incident analysis via telemetry

**Events to Emit**:
- `task.selected` - Supervisor decides to work on task
- `task.lease_acquired` - Lease acquisition succeeds
- `task.lease_failed` - Lease acquisition fails (already leased)
- `task.assigned` - Task assigned to orchestrator
- `task.failed` - Task execution fails
- `supervisor.idle` - No tasks available (future)
- `supervisor.stopped` - Graceful shutdown

---

### Strategy 4: Unit Test All Edge Cases
**Applies to**: Lease expiry, concurrent acquisition, telemetry failures
**Approach**:
- Write tests for every edge case identified in THINK phase
- Use time mocking for lease expiry tests (`jest.useFakeTimers()`)
- Use temp filesystem for telemetry tests
- Test error paths (permission denied, disk full)

**Example**:
```typescript
test('Lease acquisition fails when already leased', async () => {
  const leaseManager = new LeaseManager();

  const first = await leaseManager.acquireLease('TASK-1');
  expect(first).toBe(true);

  const second = await leaseManager.acquireLease('TASK-1');
  expect(second).toBe(false); // Already leased
});

test('Lease expiry allows reacquisition', async () => {
  const leaseManager = new LeaseManager(1000); // 1 sec TTL
  await leaseManager.acquireLease('TASK-1');

  await sleep(1500); // Wait for expiry

  const canReacquire = await leaseManager.acquireLease('TASK-1');
  expect(canReacquire).toBe(true);
});
```

---

## Assumptions Validation

### Assumption 1: Single-Process MVP Sufficient
**Assumption**: Supervisor runs in single Node.js process (no multi-process)
**Validation**: Check deployment architecture, confirm single instance
**Risk if wrong**: Race conditions in lease acquisition (duplicate execution)
**Contingency**: If multi-process needed, add process ID to lease, detect conflicts

---

### Assumption 2: Most Tasks Complete in <10 Minutes
**Assumption**: Lease TTL (10 min) sufficient for most tasks
**Validation**: Analyze task completion times in test runs
**Risk if wrong**: Lease expiry during execution (duplicate execution)
**Contingency**: Increase TTL to 30 minutes, or add lease renewal

---

### Assumption 3: Disk Space Sufficient for Telemetry
**Assumption**: `supervisor_lifecycle.jsonl` won't fill disk
**Validation**: Monitor file growth during testing
**Risk if wrong**: Disk full, application crash
**Contingency**: Add manual rotation procedure, implement log rotation

---

### Assumption 4: TypeScript Async/Await Sufficient for Concurrency
**Assumption**: Single event loop (async/await) prevents race conditions
**Validation**: Review Node.js concurrency model, confirm single-threaded
**Risk if wrong**: Race conditions possible if assumptions violated
**Contingency**: Add mutex library (e.g., `async-mutex`) for critical sections

---

## Next Phase: GATE (design.md)

**Deliverables**:
- Via Negativa analysis (can we DELETE instead of add?)
- Refactor vs Repair analysis (patching or refactoring root cause?)
- Alternatives considered (2-3 approaches)
- Complexity justification (is this increase worth it?)
- Implementation plan (files, LOC, risks, testing)

---

**Think Phase Validation**:
- ✅ **Edge Cases**: 6 edge cases identified with likelihood, impact, mitigation
- ✅ **Failure Modes**: 5 failure modes analyzed with detection and recovery
- ✅ **Complexity Analysis**: Cyclomatic (LOW - 5 branches), Cognitive (LOW), Testing (LOW)
- ✅ **Mitigation Strategies**: 4 strategies (document limitations, defensive programming, observability, unit tests)
- ✅ **Assumptions Validation**: 4 assumptions validated with contingency plans

---

**Date**: 2025-11-05
**Author**: Claude Council
