# THINK - Wave0 Supervisor Integration Edge Cases

**Task:** AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION
**Date:** 2025-11-06
**Author:** Claude Council
**Phase:** 4 of 10 (THINK)

---

## Edge Cases Analysis

### Edge Case 1: Concurrent Wave0 Instances

**Scenario:** User accidentally starts two Wave0 instances simultaneously.

**What happens?**
1. First instance acquires lock file (.wave0.lock)
2. Second instance checks lock, exits with error
3. Only first instance runs

**Supervisor behavior:**
- First instance acquires leases, executes tasks normally
- Second instance never gets past startup (lock file prevents it)

**Risk:** Lock file is application-level, not task-level. LeaseManager provides task-level coordination.

**Mitigation already in place:**
- Wave0Runner checks .wave0.lock on startup
- LeaseManager provides additional task-level lease checking

**Additional risk:** If lock file gets stale (Wave0 crashes without cleanup):
- Next Wave0 start will fail with "already running" error
- User must manually remove .wave0.lock

**Mitigation:** Document lock file cleanup in error messages.

**Result:** ✅ Safe - lock file prevents concurrent Wave0 instances.

---

### Edge Case 2: Lease Already Held

**Scenario:** Task lease is already held (shouldn't happen with lock file, but LeaseManager provides defense-in-depth).

**What happens?**
1. Wave0 calls `leaseManager.acquireLease(taskId)`
2. Returns `false` (lease already held)
3. Wave0 logs warning, skips task, continues to next

**Code:**
```typescript
if (!leaseAcquired) {
  logWarning(`Lease already held for ${task.id}, skipping`);
  continue;
}
```

**Risk:** Task may never execute if lease never released.

**Mitigation:**
- LeaseManager has 30-minute TTL (lease expires automatically)
- Expired leases can be reacquired
- Finally block ensures lease release

**Result:** ✅ Safe - task will be retried after lease expiration.

---

### Edge Case 3: Task Execution Throws Exception

**Scenario:** `executor.execute(task)` throws exception.

**What happens?**
```typescript
try {
  // ... lifecycle events ...
  const result = await this.executor.execute(task);
  // ... completion event ...
} finally {
  await this.leaseManager.releaseLease(task.id);
}
```

**Flow:**
1. Exception thrown in executor.execute()
2. Finally block runs → lease released
3. Exception bubbles to outer catch
4. Outer catch logs error, continues to next task

**Lifecycle events:**
- ✅ task.selected emitted
- ✅ task.assigned emitted
- ✅ task.started emitted
- ❌ task.completed NOT emitted (exception before emit)

**Risk:** Incomplete lifecycle trace (no completion event).

**Is this acceptable?**
- ✅ Yes - exception means task did NOT complete successfully
- ✅ Missing completion event indicates failure
- ✅ Outer catch logs error with context

**Mitigation options:**
1. Emit task.failed event in catch block
2. Emit task.completed with status="error" in catch block
3. Accept incomplete trace as failure indicator (current approach)

**Selected:** Option 3 (accept incomplete trace).

**Rationale:**
- Keep error handling simple (don't add new event types)
- Missing completion event is clear failure signal
- Outer catch logs full error details

**Result:** ✅ Acceptable - incomplete trace indicates failure.

---

### Edge Case 4: Telemetry Emission Fails

**Scenario:** `telemetry.emit()` throws exception (disk full, permissions, etc.).

**What happens?**
```typescript
try {
  await this.telemetry.emit('task.selected', {...});
  // ... rest of execution ...
} finally {
  await this.leaseManager.releaseLease(task.id);
}
```

**Flow:**
1. telemetry.emit() throws exception
2. Finally block runs → lease released
3. Exception bubbles to outer catch
4. Outer catch logs error, continues to next task

**Risk:** Task execution aborted due to telemetry failure.

**Is this acceptable?**
- ❌ No - telemetry should not block task execution
- Telemetry is observability layer, not critical path

**Mitigation options:**
1. Wrap each telemetry.emit() in try/catch (6 LOC overhead)
2. Make LifecycleTelemetry swallow errors internally
3. Accept telemetry failure aborts task (current approach)

**Trade-offs:**
- **Option 1**: Most robust, but adds ~6 LOC per emit (24 LOC total)
- **Option 2**: Best UX, but requires changing LifecycleTelemetry (Batch 1 code)
- **Option 3**: Simplest, but telemetry failure blocks execution

**Selected:** Option 1 (wrap emit calls in try/catch).

**Rationale:**
- Telemetry failure should not abort task
- 24 LOC overhead is acceptable (still under 150 limit)
- No need to modify Batch 1 code

**Updated code:**
```typescript
try {
  await this.telemetry.emit('task.selected', {...});
} catch (error) {
  logWarning('Telemetry emit failed', { error });
}
```

**Result:** ⚠️ Needs mitigation - add try/catch around emit calls.

---

### Edge Case 5: Lease Release Fails

**Scenario:** `leaseManager.releaseLease()` throws exception.

**What happens?**
```typescript
finally {
  await this.leaseManager.releaseLease(task.id);
}
```

**Flow:**
1. Finally block runs
2. releaseLease() throws exception
3. Exception bubbles to outer catch
4. Outer catch logs error, continues to next task

**Risk:** Lease not released, task stuck.

**Is this acceptable?**
- ⚠️ Partial - lease will expire after 30 minutes (TTL)
- But task blocked for 30 minutes

**Mitigation options:**
1. Wrap releaseLease() in try/catch
2. Accept exception, rely on TTL expiration
3. Add retry logic for releaseLease()

**Selected:** Option 1 (wrap releaseLease in try/catch).

**Rationale:**
- releaseLease() should never fail (in-memory operation)
- If it does fail, log error but don't crash
- Lease will expire after TTL anyway

**Updated code:**
```typescript
finally {
  try {
    await this.leaseManager.releaseLease(task.id);
  } catch (error) {
    logError('Lease release failed', { taskId: task.id, error });
  }
}
```

**Result:** ⚠️ Needs mitigation - add try/catch around releaseLease.

---

### Edge Case 6: Empty Roadmap (No Tasks)

**Scenario:** roadmap.yaml has no pending tasks.

**What happens?**
1. Wave0 calls `getNextTask()`
2. Returns `null`
3. Wave0 increments emptyCheckCount
4. After 3 empty checks, exits gracefully

**Supervisor behavior:**
- No leases acquired (no tasks to lease)
- No lifecycle events emitted (no tasks to orchestrate)
- Wave0 exits cleanly after 15 minutes

**Risk:** None - expected behavior.

**Result:** ✅ Safe - Wave0 exits gracefully when no work.

---

### Edge Case 7: Roadmap Update During Execution

**Scenario:** User updates roadmap.yaml while Wave0 is executing task.

**What happens?**
1. Wave0 reads roadmap, finds task T1
2. Wave0 acquires lease for T1, starts execution
3. User edits roadmap.yaml (adds task T2, changes T1 status)
4. Wave0 finishes T1, updates status with `updateTaskStatus()`

**Risk:** Race condition - Wave0's status update may overwrite user's changes.

**Is this acceptable?**
- ⚠️ Partial - Wave0 uses simple string replacement (fragile)
- Future waves should use proper YAML parser with locking

**Mitigation options:**
1. Add file locking to roadmap.yaml
2. Use proper YAML parser with merge logic
3. Accept race condition (Wave 0 limitation)

**Selected:** Option 3 (accept race condition).

**Rationale:**
- Wave 0 is MVP with simple parsing
- File locking adds complexity
- Future waves will use proper YAML library
- Document as known limitation

**Result:** ⚠️ Known limitation - document in README.

---

### Edge Case 8: Wave0 Killed Mid-Execution (SIGKILL)

**Scenario:** User sends SIGKILL to Wave0 process during task execution.

**What happens?**
1. Wave0 killed immediately (no cleanup)
2. Lock file (.wave0.lock) left behind
3. Lease not released (task held)
4. Telemetry may have incomplete events

**Cleanup on next start:**
- Lock file must be manually removed
- Lease will expire after 30 minutes (TTL)
- Incomplete telemetry trace remains

**Risk:** Task blocked for 30 minutes, lock file prevents restart.

**Is this acceptable?**
- ✅ Yes - SIGKILL is non-graceful shutdown (can't handle)
- User should use SIGTERM/SIGINT for graceful shutdown

**Mitigation:**
- Document graceful shutdown (SIGTERM/SIGINT)
- Document manual cleanup (rm .wave0.lock)

**Result:** ✅ Acceptable - SIGKILL is non-graceful, can't handle.

---

### Edge Case 9: Wave0 Shutdown During Task Execution (SIGTERM)

**Scenario:** User sends SIGTERM to Wave0 during task execution.

**What happens?**
```typescript
process.on("SIGTERM", () => {
  logInfo("Wave0Runner: Received SIGTERM, shutting down gracefully...");
  this.shutdownRequested = true;
});
```

**Flow:**
1. SIGTERM received → shutdownRequested = true
2. Current task continues executing (not interrupted)
3. After task finishes, lease released, loop exits
4. Wave0 cleans up lock file

**Risk:** Current task may take long time to finish (blocks shutdown).

**Is this acceptable?**
- ✅ Yes - graceful shutdown completes current task
- Better than aborting mid-task (leaves incomplete state)

**Mitigation:**
- Document shutdown behavior (waits for current task)
- Future enhancement: timeout for shutdown (force exit after N seconds)

**Result:** ✅ Acceptable - graceful shutdown completes current task.

---

### Edge Case 10: Telemetry Directory Missing

**Scenario:** state/analytics/ directory doesn't exist.

**What happens?**
1. LifecycleTelemetry tries to write to state/analytics/supervisor_lifecycle.jsonl
2. Directory creation should be handled by LifecycleTelemetry

**Assumption:** LifecycleTelemetry creates directory automatically.

**Validation needed:** Check LifecycleTelemetry implementation.

**Risk:** If directory not created, telemetry writes fail.

**Mitigation:** Verify LifecycleTelemetry handles directory creation (in IMPLEMENT phase).

**Result:** ⚠️ Needs validation - check LifecycleTelemetry handles mkdir.

---

## Complexity Analysis

### Cyclomatic Complexity

**mainLoop() method:**
- Base: 1
- while loop: +1
- if (!task): +1
- if (emptyCheckCount >= limit): +1
- if (!leaseAcquired): +1
- try/catch (outer): +1
- try/finally (inner): +1
- if (!shutdownRequested): +1

**Total:** 8

**Assessment:** Moderate complexity (acceptable for integration point).

**Mitigation:** mainLoop() is well-structured with clear sections.

---

### State Management Complexity

**Wave0Runner state:**
- workspaceRoot, stateRoot, lockFile: static (set once)
- shutdownRequested: boolean flag
- emptyCheckCount: counter (reset on task found)
- executor, leaseManager, telemetry: dependencies

**Total state variables:** 8

**Assessment:** Low complexity (minimal state).

---

### Integration Complexity

**Dependencies:**
- LeaseManager (Batch 1)
- LifecycleTelemetry (Batch 1)
- TaskExecutor (existing)
- Logger (existing)

**Interactions:**
- Wave0 → LeaseManager: acquireLease, releaseLease
- Wave0 → LifecycleTelemetry: emit (4 event types)
- Wave0 → TaskExecutor: execute

**Assessment:** Low coupling - clear interfaces, minimal dependencies.

---

## Failure Modes

### Failure Mode 1: Import Path Resolution Failure

**Symptom:** TypeScript build fails with "Cannot find module" error.

**Cause:** autopilot_mvp/ not in tsconfig paths.

**Detection:** Build fails immediately.

**Recovery:**
1. Check tsconfig.json includes autopilot_mvp/
2. Update paths if needed
3. Rebuild

**Impact:** High (blocks implementation).

**Likelihood:** Low (paths should be correct).

---

### Failure Mode 2: Runtime Lease Acquisition Failure

**Symptom:** Wave0 skips all tasks with "lease already held" warnings.

**Cause:** Leases not released from previous run (crash without cleanup).

**Detection:** Wave0 logs show repeated "lease already held" for same tasks.

**Recovery:**
1. Wait 30 minutes (lease TTL expiration)
2. Or restart Wave0 (LeaseManager resets in-memory leases)

**Impact:** Medium (tasks blocked for 30 minutes).

**Likelihood:** Low (only if Wave0 crashed without cleanup).

---

### Failure Mode 3: Telemetry Write Failure

**Symptom:** No lifecycle events in supervisor_lifecycle.jsonl.

**Cause:** Disk full, permissions, or directory missing.

**Detection:** Telemetry emit throws exception.

**Recovery:**
1. Check disk space
2. Check file permissions on state/analytics/
3. Check directory exists

**Impact:** Low (telemetry is observability, not critical).

**Likelihood:** Low (directory should exist, permissions should be OK).

---

### Failure Mode 4: Task Executor Crash

**Symptom:** Wave0 logs show "Error in main loop" repeatedly.

**Cause:** TaskExecutor.execute() throws exception for every task.

**Detection:** All tasks fail, Wave0 continues running.

**Recovery:**
1. Check TaskExecutor implementation
2. Check task format in roadmap.yaml
3. Fix root cause

**Impact:** High (no tasks execute).

**Likelihood:** Low (TaskExecutor tested separately).

---

## Mitigation Summary

**Mitigations needed from edge case analysis:**

1. ✅ Wrap telemetry.emit() calls in try/catch (Edge Case 4)
   - +24 LOC overhead (4 emit calls × 6 LOC each)
   - Prevents telemetry failure from aborting task

2. ✅ Wrap leaseManager.releaseLease() in try/catch (Edge Case 5)
   - +4 LOC overhead
   - Prevents release failure from crashing Wave0

3. ✅ Validate LifecycleTelemetry handles directory creation (Edge Case 10)
   - Check implementation in IMPLEMENT phase
   - Add mkdir if needed

4. ✅ Document race condition with roadmap.yaml updates (Edge Case 7)
   - Add to README/docs
   - Known limitation for Wave 0

5. ✅ Document graceful shutdown behavior (Edge Case 9)
   - Add to README/docs
   - Explain SIGTERM waits for current task

**Total mitigation LOC:** ~28 LOC (try/catch overhead)

**Updated total:** 50 + 28 = 78 LOC (still under 150 limit ✅)

---

## Final Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Import path failure | Low | High | Verify paths before implementation |
| Lease acquisition failure | Low | Medium | TTL expiration (30 min) |
| Telemetry failure aborts task | Medium | High | ✅ Wrap emit in try/catch |
| Lease release failure | Low | Medium | ✅ Wrap release in try/catch |
| Task executor crash | Low | High | Existing error handling sufficient |
| Roadmap race condition | Medium | Low | Document as known limitation |
| Stale lock file | Low | Low | Document manual cleanup |

**Overall risk:** ✅ Low - most risks mitigated with try/catch wrappers.

---

**Date:** 2025-11-06
**Author:** Claude Council
**Status:** THINK phase complete, ready for GATE phase
**Next:** Document design thinking in design.md
**Key insight:** Need try/catch wrappers around telemetry emits and lease release (adds ~28 LOC)
