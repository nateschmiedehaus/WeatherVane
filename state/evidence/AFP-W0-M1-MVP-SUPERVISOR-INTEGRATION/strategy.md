# STRATEGIZE - Supervisor Integration with Wave0 Autopilot (Batch 2)

**Task:** AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION
**Date:** 2025-11-06
**Author:** Claude Council
**Batch:** 2 of 2 (integrate supervisor into Wave0Runner)
**Approach:** Wire supervisor into Wave0Runner + test with live autopilot

---

## Problem Analysis - WHY

### What Batch 1 Achieved

**Batch 1** (completed 2025-11-05) implemented supervisor scaffold components:
- ✅ LeaseManager: In-memory lease management (acquire, release, renew, expiry)
- ✅ LifecycleTelemetry: JSONL logging of lifecycle events
- ✅ Types: Core interfaces (Lease, LifecycleEvent, SupervisorConfig)
- ✅ **123 LOC total** (under 150 limit)

**Exit criteria achieved:**
- Lease management stubs implemented
- Telemetry hooks implemented

**Exit criteria deferred to Batch 2:**
- ⏸️ Supervisor integrated with Wave0 autopilot
- ⏸️ Tested with live autopilot running real tasks

### Gap: Supervisor NOT Integrated with Wave0

**CRITICAL ISSUE**: Batch 1 components exist but are **NOT INTEGRATED** with Wave0Runner.

**Current state of Wave0Runner** (tools/wvo_mcp/src/wave0/runner.ts):
- ❌ No LeaseManager - tasks run without lease coordination
- ❌ No LifecycleTelemetry - no lifecycle events emitted
- ❌ No supervisor orchestration - direct task execution only
- ❌ No lifecycle stages - no task.selected, task.assigned, task.started, task.completed

**What Wave0Runner currently does:**
```typescript
// Simplified flow (no supervisor):
1. getNextTask() - read roadmap.yaml
2. executor.execute(task) - run task directly
3. updateTaskStatus() - update roadmap.yaml
4. checkpoint() - no-op for Wave 0
```

**What's missing - supervisor orchestration:**
```typescript
// MISSING supervisor flow:
1. LeaseManager.acquireLease(taskId) - prevent concurrent execution
2. LifecycleTelemetry.emit('task.selected') - log selection
3. LifecycleTelemetry.emit('task.assigned') - log assignment
4. executor.execute(task) - run task
5. LifecycleTelemetry.emit('task.completed') - log completion
6. LeaseManager.releaseLease(taskId) - release coordination lock
```

**Why this is a problem:**
- No lease coordination → multiple Wave0 instances could run same task
- No lifecycle telemetry → no visibility into supervisor behavior
- No supervisor orchestration → can't validate supervisor works with real autopilot
- Task title says "COMPLETE" but integration doesn't exist yet

---

## Current State Analysis

### Batch 1 Implementation (autopilot_mvp/supervisor/)

**Files**:
1. `types.ts` (60 lines) - Type definitions
2. `lease_manager.ts` (112 lines) - Lease management
3. `lifecycle_telemetry.ts` (52 lines) - Event logging

**Total**: 123 LOC (components exist but NOT used anywhere)

### Wave0Runner Current State (tools/wvo_mcp/src/wave0/runner.ts)

**Current flow** (237 lines):
1. `getNextTask()` - Parse roadmap.yaml for pending tasks
2. `updateTaskStatus(taskId, 'in_progress')` - Update roadmap
3. `executor.execute(task)` - Execute task (TaskExecutor)
4. `updateTaskStatus(taskId, 'done')` - Update roadmap
5. `checkpoint()` - No-op for Wave 0

**Missing supervisor integration:**
- No LeaseManager imported or used
- No LifecycleTelemetry imported or used
- No lifecycle events emitted
- No lease coordination

### Gaps

1. ❌ **No Wave0 integration** - Supervisor components not wired into Wave0Runner
2. ❌ **No lifecycle events** - Wave0 doesn't emit task.selected, task.assigned, etc.
3. ❌ **No lease management** - Wave0 doesn't acquire/release leases
4. ❌ **No live testing** - Supervisor never tested with real autopilot running real tasks

---

## Desired State (Exit Criteria)

### Exit Criteria for Batch 2

1. ✅ **Wave0Runner integrated** - LeaseManager + LifecycleTelemetry wired into Wave0Runner
2. ✅ **Lifecycle events emitted** - Wave0 emits task.selected, task.assigned, task.started, task.completed
3. ✅ **Lease coordination works** - Wave0 acquires/releases leases properly
4. ✅ **Live autopilot test** - Wave0 runs with supervisor orchestrating real tasks
5. ✅ **Telemetry validated** - JSONL log written with proper lifecycle events
6. ✅ **Under 150 LOC** - Wave0Runner changes ≤ 150 net LOC

### Integration Scope - Wave0Runner Changes

**Add supervisor orchestration to Wave0Runner mainLoop():**
```typescript
// NEW supervisor flow (to be added):
async mainLoop() {
  while (!shutdownRequested) {
    // 1. Get next task
    const task = await this.getNextTask();

    // 2. ACQUIRE LEASE (NEW)
    const leaseAcquired = await this.leaseManager.acquireLease(task.id);
    if (!leaseAcquired) {
      logWarning(`Lease already held for ${task.id}, skipping`);
      continue;
    }

    // 3. EMIT task.selected (NEW)
    await this.telemetry.emit('task.selected', {
      taskId: task.id,
      reason: 'highest priority pending task'
    });

    // 4. Update status + emit task.assigned (NEW)
    await this.updateTaskStatus(task.id, 'in_progress');
    await this.telemetry.emit('task.assigned', { taskId: task.id });

    // 5. EMIT task.started (NEW)
    await this.telemetry.emit('task.started', { taskId: task.id });

    // 6. Execute task (existing)
    const result = await this.executor.execute(task);

    // 7. EMIT task.completed (NEW)
    await this.telemetry.emit('task.completed', {
      taskId: task.id,
      status: result.status
    });

    // 8. Update final status (existing)
    await this.updateTaskStatus(task.id, result.status === 'completed' ? 'done' : 'blocked');

    // 9. RELEASE LEASE (NEW)
    await this.leaseManager.releaseLease(task.id);

    // 10. Rate limit (existing)
    await this.sleep(RATE_LIMIT_MS);
  }
}
```

**Files to change:**
- `tools/wvo_mcp/src/wave0/runner.ts` - Add LeaseManager + LifecycleTelemetry
- Estimate: ~50 LOC additions (import statements + lifecycle events + lease management)

---

## Alternatives Considered

### Alternative 1: Unit Test File Only - REJECTED

**What**: Create standalone test file that imports and tests supervisor components

**Pros**:
- ✅ Fast (no real autopilot execution)
- ✅ Easy to mock
- ✅ Test edge cases in isolation

**Cons**:
- ❌ Doesn't integrate with Wave0Runner
- ❌ Supervisor components never used in production code
- ❌ Doesn't test with real autopilot
- ❌ Doesn't validate supervisor orchestrates real tasks
- ❌ **Completely misses the point of "integration"**

**Why Rejected**: Task title says "COMPLETE AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION" - this requires ACTUAL integration with Wave0, not just a test file.

---

### Alternative 2: Mock Wave0 Runner - REJECTED

**What**: Create mock/fake Wave0 runner for testing supervisor components

**Pros**:
- ✅ Fast execution
- ✅ Controlled test environment
- ✅ Easy to test edge cases

**Cons**:
- ❌ Doesn't test real Wave0Runner
- ❌ Doesn't validate with live autopilot
- ❌ Mock may not match real behavior
- ❌ **User explicitly requested testing with "real live autopilot and supervisor"**

**Why Rejected**: User requirement: "also this needs to be tested with the 'wave 0' autopilot with real live autopilot and supervisor doing what a supervisor should do"

---

### Alternative 3: Integrate Supervisor into Wave0Runner + Live Testing - ✅ SELECTED

**What**: Wire LeaseManager + LifecycleTelemetry into Wave0Runner, test with live autopilot

**Pros**:
- ✅ Actual integration (not just test file)
- ✅ Supervisor orchestrates real tasks
- ✅ Tests with live Wave 0 autopilot
- ✅ Validates lifecycle events in production scenario
- ✅ Verifies lease coordination works
- ✅ Low LOC (~50 lines added to Wave0Runner)
- ✅ **Meets user requirement for live autopilot testing**

**Cons**:
- Takes longer to test (real task execution)
- Requires running Wave 0 autopilot

**Why Selected**:
- ✅ Task title: "COMPLETE AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION" = actual integration
- ✅ User requirement: "real live autopilot and supervisor"
- ✅ Exit criterion: Supervisor working with Wave0 autopilot
- ✅ MVP philosophy: minimum viable INTEGRATION, not minimum viable TEST FILE

**How it aligns with AFP/SCAS**:
- **ECONOMY**: Minimal changes (~50 LOC), reuses existing components
- **COHERENCE**: Natural fit with Wave0Runner's task execution loop
- **LOCALITY**: Integration code contained in Wave0Runner
- **VISIBILITY**: Lifecycle events provide clear telemetry
- **EVOLUTION**: Foundation for multi-supervisor coordination later

---

## Implementation Approach

### Phase 1: Wire Supervisor into Wave0Runner (~50 LOC)

**File**: `tools/wvo_mcp/src/wave0/runner.ts`

**Changes needed:**

1. **Import supervisor components** (3 lines):
```typescript
import { LeaseManager } from '../autopilot_mvp/supervisor/lease_manager.js';
import { LifecycleTelemetry } from '../autopilot_mvp/supervisor/lifecycle_telemetry.js';
```

2. **Add to constructor** (2 lines):
```typescript
private leaseManager: LeaseManager;
private telemetry: LifecycleTelemetry;

constructor(workspaceRoot: string) {
  // ... existing code ...
  this.leaseManager = new LeaseManager(30 * 60 * 1000); // 30 min TTL
  this.telemetry = new LifecycleTelemetry(workspaceRoot);
}
```

3. **Update mainLoop() with supervisor orchestration** (~40 lines):
```typescript
private async mainLoop(): Promise<void> {
  logInfo("Wave0Runner: Entering main loop");

  while (!this.shutdownRequested) {
    try {
      // 1. Get next task (existing)
      const task = await this.getNextTask();

      if (!task) {
        // ... existing empty task handling ...
        continue;
      }

      // 2. ACQUIRE LEASE (NEW)
      const leaseAcquired = await this.leaseManager.acquireLease(task.id);
      if (!leaseAcquired) {
        logWarning(`Wave0Runner: Lease already held for ${task.id}, skipping`);
        continue;
      }

      // 3. EMIT task.selected (NEW)
      await this.telemetry.emit('task.selected', {
        taskId: task.id,
        title: task.title,
        reason: 'highest priority pending task'
      });

      // Reset empty counter (existing)
      this.emptyCheckCount = 0;

      // 4. Update status + EMIT task.assigned (NEW)
      await this.updateTaskStatus(task.id, "in_progress");
      await this.telemetry.emit('task.assigned', { taskId: task.id });

      // 5. EMIT task.started (NEW)
      await this.telemetry.emit('task.started', { taskId: task.id });

      // 6. Execute task (existing)
      const result = await this.executor.execute(task);

      // 7. EMIT task.completed (NEW)
      await this.telemetry.emit('task.completed', {
        taskId: task.id,
        status: result.status,
        duration_ms: result.duration_ms
      });

      // 8. Update final status (existing)
      const finalStatus = result.status === "completed" ? "done" : "blocked";
      await this.updateTaskStatus(task.id, finalStatus);

      // 9. RELEASE LEASE (NEW)
      await this.leaseManager.releaseLease(task.id);

      // 10. Checkpoint (existing)
      await this.checkpoint();

      // 11. Rate limit (existing)
      if (!this.shutdownRequested) {
        logInfo(`Wave0Runner: Rate limiting (${RATE_LIMIT_MS / 1000}s)...`);
        await this.sleep(RATE_LIMIT_MS);
      }
    } catch (error) {
      logError("Wave0Runner: Error in main loop", { error });
      // Continue to next iteration (don't crash)
    }
  }

  logInfo("Wave0Runner: Exiting main loop");
}
```

**LOC Estimate**: ~50 LOC additions (under 150 limit)

---

### Phase 2: Live Autopilot Testing

**Test plan** (NOT a test file - actual live testing):

1. **Start Wave 0 autopilot:**
   ```bash
   cd tools/wvo_mcp
   npm run wave0
   ```

2. **Add test task to roadmap.yaml:**
   ```yaml
   - id: TEST-SUPERVISOR-001
     title: Test supervisor orchestration
     status: pending
     description: Verify supervisor emits lifecycle events
   ```

3. **Monitor supervisor telemetry:**
   ```bash
   tail -f state/analytics/supervisor_lifecycle.jsonl
   ```

4. **Verify lifecycle events:**
   - ✅ task.selected event appears
   - ✅ task.assigned event appears
   - ✅ task.started event appears
   - ✅ Wave0 executes task
   - ✅ task.completed event appears
   - ✅ Task status updated to done

5. **Validate lease coordination:**
   - ✅ Lease acquired before task execution
   - ✅ Lease released after task completion
   - ✅ No duplicate task execution

**Success criteria:**
- Supervisor orchestrates real task with live autopilot
- All lifecycle events emitted in correct order
- JSONL log is valid and parseable
- Lease coordination prevents duplicate execution

---

## LOC Estimates

| Component | LOC |
|-----------|-----|
| Wave0Runner changes (imports + mainLoop updates) | ~50 |
| **Total Batch 2** | **~50 LOC** |

✅ **Under 150 LOC limit**

---

## Success Metrics

**How we know Batch 2 succeeds:**

1. ✅ **Wave0Runner integrated** - LeaseManager + LifecycleTelemetry wired in
2. ✅ **Build passes** - `npm run build` succeeds with no errors
3. ✅ **Wave0 starts** - `npm run wave0` runs without crashes
4. ✅ **Live task execution** - Wave0 picks up and executes real task
5. ✅ **Lifecycle events emitted** - All 4 events appear in supervisor_lifecycle.jsonl
6. ✅ **JSONL validated** - Log is parseable and well-formed
7. ✅ **Lease coordination works** - Lease acquired before execution, released after
8. ✅ **No runtime errors** - Supervisor loop completes task successfully

**Before vs After**:
- **Before Batch 2**: Supervisor scaffold exists, NOT integrated with Wave0
- **After Batch 2**: Supervisor integrated with Wave0, tested with live autopilot

---

## CRITICAL NOTE: End-to-End Testing Philosophy

**⚠️ TESTING STANDARD FOR ALL FUTURE AUTOPILOT WORK:**

From this task forward, **ALL autopilot-related tasks must dramatically prefer:**

1. **End-to-end integration testing** over unit tests
2. **Live autopilot testing** over mocked components
3. **Real task execution** over synthetic test scenarios
4. **Production-like validation** over isolated verification

**Rationale:**
- Autopilot is a **system** - components must work together in production
- Unit tests miss integration issues, race conditions, real-world edge cases
- Live testing validates actual behavior, not theoretical correctness
- User explicitly requires: "real live autopilot and supervisor doing what a supervisor should do"

**Testing hierarchy (prefer top over bottom):**
1. **🥇 BEST**: Live Wave 0 autopilot running real tasks
2. **🥈 GOOD**: Integration test with real Wave0Runner (no mocks)
3. **🥉 ACCEPTABLE**: Unit tests for leaf functions only
4. **❌ AVOID**: Mocked Wave0Runner, synthetic test harnesses

**Application to future tasks:**
- Any new supervisor features → test with live Wave 0
- Any Wave0Runner changes → test with real autopilot
- Any task executor changes → test with actual task execution
- Any lifecycle changes → validate with real lifecycle events

**This testing philosophy applies to ALL future autopilot development.**

---

## Assumptions

1. **Assumption**: Supervisor components are importable from Wave0Runner
   - **Validation**: Check import paths (../autopilot_mvp/supervisor/)
   - **Risk**: Import paths may be incorrect or components may not be built
   - **Contingency**: Fix import paths, ensure TypeScript build includes supervisor

2. **Assumption**: Wave0Runner build pipeline includes supervisor components
   - **Validation**: `npm run build` should compile supervisor + Wave0Runner
   - **Risk**: Build may fail if supervisor not in tsconfig paths
   - **Contingency**: Update tsconfig.json to include autopilot_mvp/

3. **Assumption**: Wave0 autopilot can be started with `npm run wave0`
   - **Validation**: Check package.json scripts
   - **Risk**: Script may not exist or may have different name
   - **Contingency**: Use `npx tsx scripts/run_wave0.ts` directly

4. **Assumption**: supervisor_lifecycle.jsonl telemetry directory exists
   - **Validation**: LifecycleTelemetry creates state/analytics/ automatically
   - **Risk**: Directory creation may fail due to permissions
   - **Contingency**: Pre-create directory in Wave0Runner setup

5. **Assumption**: Integration with live autopilot is sufficient for Batch 1 exit criterion
   - **Validation**: Exit criterion: "passing integration smoke exercising supervisor loop"
   - **Risk**: May need additional validation
   - **Contingency**: Add telemetry validation script if needed

---

## Next Phase: SPEC

**Deliverables**:
- Functional requirements for Wave0Runner integration (FR1-FR5)
- Acceptance criteria for live autopilot testing (AC1-AC5)
- Lifecycle event schema specification
- Live testing validation criteria

---

**Date:** 2025-11-06
**Author:** Claude Council
**Status:** STRATEGIZE phase complete, ready for SPEC phase
**Approach:** Integrate supervisor into Wave0Runner (~50 LOC), test with live autopilot, establish end-to-end testing standard
