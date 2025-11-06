# SPEC - Wave0 Supervisor Integration

**Task:** AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION
**Date:** 2025-11-06
**Author:** Claude Council
**Phase:** 2 of 10 (SPEC)

---

## Overview

Integrate supervisor components (LeaseManager + LifecycleTelemetry) into Wave0Runner and validate with live autopilot testing.

---

## Functional Requirements

### FR1: Wave0Runner Supervisor Integration

**Requirement:** Wave0Runner MUST integrate LeaseManager and LifecycleTelemetry.

**Details:**
- Import LeaseManager from `../autopilot_mvp/supervisor/lease_manager.js`
- Import LifecycleTelemetry from `../autopilot_mvp/supervisor/lifecycle_telemetry.js`
- Instantiate both in Wave0Runner constructor
- Wire supervisor orchestration into mainLoop()

**Rationale:** Supervisor components exist but are not integrated with Wave0 autopilot.

---

### FR2: Lease Coordination

**Requirement:** Wave0Runner MUST acquire lease before task execution and release after completion.

**Details:**
- Call `leaseManager.acquireLease(taskId)` before executing task
- Skip task if lease already held (log warning)
- Call `leaseManager.releaseLease(taskId)` after task completion
- Release lease even if task execution fails (try/finally or error handling)

**Rationale:** Prevent multiple Wave0 instances from executing same task concurrently.

**Error handling:**
- If lease acquisition fails → skip task, continue to next
- If lease release fails → log error, continue (don't crash)

---

### FR3: Lifecycle Event Emission

**Requirement:** Wave0Runner MUST emit lifecycle events at each orchestration stage.

**Events to emit** (in order):
1. **task.selected** - After task selected from roadmap, before lease acquisition
   - Payload: `{ taskId, title, reason: "highest priority pending task" }`
2. **task.assigned** - After status updated to in_progress
   - Payload: `{ taskId }`
3. **task.started** - Before executor.execute() called
   - Payload: `{ taskId }`
4. **task.completed** - After executor.execute() returns
   - Payload: `{ taskId, status, duration_ms }`

**Rationale:** Provides visibility into supervisor behavior and task lifecycle.

**Error handling:**
- If telemetry.emit() fails → log error, continue (don't crash supervisor)

---

### FR4: Build Integration

**Requirement:** TypeScript build MUST compile supervisor components with Wave0Runner.

**Details:**
- Supervisor components (autopilot_mvp/supervisor/) must be in TypeScript build paths
- `npm run build` must compile without errors
- Import paths must resolve correctly

**Rationale:** Integration won't work if supervisor components aren't built.

**Validation:**
```bash
cd tools/wvo_mcp
npm run build  # Must succeed with 0 errors
```

---

### FR5: Live Autopilot Testing

**Requirement:** Integration MUST be validated with live Wave0 autopilot running real task.

**Details:**
- Start Wave0 autopilot with `npm run wave0`
- Add test task to state/roadmap.yaml
- Verify Wave0 picks up and executes task
- Verify lifecycle events emitted to state/analytics/supervisor_lifecycle.jsonl
- Verify lease acquired and released

**Rationale:** Unit tests are insufficient - integration must work with real autopilot.

**Success criteria:**
- Wave0 starts without crashes
- Task executed successfully
- All 4 lifecycle events present in JSONL log
- JSONL log is parseable
- Lease coordination prevents duplicate execution

---

## Non-Functional Requirements

### NFR1: Performance

**Requirement:** Supervisor overhead MUST NOT significantly impact task execution time.

**Target:** Supervisor operations (lease + telemetry) add <100ms per task.

**Measurement:** Compare task execution time with/without supervisor.

---

### NFR2: Reliability

**Requirement:** Supervisor failures MUST NOT crash Wave0 autopilot.

**Error handling:**
- Lease acquisition failure → skip task, continue
- Telemetry emission failure → log error, continue
- Supervisor errors → log error, continue to next task

**Rationale:** Autopilot resilience is critical - supervisor is monitoring layer.

---

### NFR3: Observability

**Requirement:** Supervisor behavior MUST be observable via telemetry logs.

**Details:**
- Lifecycle events written to state/analytics/supervisor_lifecycle.jsonl
- JSONL format: one event per line, parseable JSON
- Each event has: timestamp, type, taskId, payload
- Log rotation handled by LifecycleTelemetry

**Rationale:** Need visibility into supervisor orchestration for debugging.

---

### NFR4: LOC Constraint

**Requirement:** Wave0Runner changes MUST be ≤150 net LOC.

**Estimate:** ~50 LOC additions (imports + mainLoop changes)

**Rationale:** AFP constraint for Batch 2 work.

---

## Acceptance Criteria

### AC1: Build Success

**Criteria:** TypeScript build completes with 0 errors.

**Validation:**
```bash
cd tools/wvo_mcp
npm run build
# Exit code: 0
```

**Pass condition:** Build succeeds, no TypeScript errors.

---

### AC2: Wave0 Startup

**Criteria:** Wave0 autopilot starts and enters main loop.

**Validation:**
```bash
cd tools/wvo_mcp
npm run wave0 &
# Check logs for "Wave0Runner: Entering main loop"
tail -f state/analytics/wave0_startup.log
```

**Pass condition:** Wave0 starts without crashes, enters main loop.

---

### AC3: Live Task Execution

**Criteria:** Wave0 autopilot picks up and executes real task from roadmap.

**Validation:**
```bash
# Add test task to roadmap.yaml:
# - id: TEST-SUPERVISOR-001
#   title: Supervisor integration test
#   status: pending

# Wait for Wave0 to execute
# Check task status changes to in_progress → done
grep TEST-SUPERVISOR-001 state/roadmap.yaml
```

**Pass condition:** Task status changes from pending → in_progress → done.

---

### AC4: Lifecycle Events Emitted

**Criteria:** All 4 lifecycle events appear in supervisor_lifecycle.jsonl in correct order.

**Validation:**
```bash
tail -f state/analytics/supervisor_lifecycle.jsonl
# Should see 4 events for TEST-SUPERVISOR-001:
# 1. task.selected
# 2. task.assigned
# 3. task.started
# 4. task.completed
```

**Pass condition:**
- All 4 events present
- Events in correct order
- Each event has valid JSON structure
- Each event has correct taskId

---

### AC5: Lease Coordination

**Criteria:** Lease acquired before execution, released after completion.

**Validation:**
- Check Wave0 logs for "Lease acquired for TEST-SUPERVISOR-001"
- Check Wave0 logs for "Lease released for TEST-SUPERVISOR-001"
- No duplicate execution (single task run once)

**Pass condition:**
- Lease acquired/released logs present
- Task executes exactly once
- No "lease already held" warnings for same task

---

## Out of Scope

**The following are explicitly OUT OF SCOPE for this task:**

1. ❌ Unit tests for LeaseManager (deferred to future work)
2. ❌ Unit tests for LifecycleTelemetry (deferred to future work)
3. ❌ Multi-supervisor coordination (future enhancement)
4. ❌ Lease renewal/expiration handling (handled by LeaseManager already)
5. ❌ Telemetry log rotation (handled by LifecycleTelemetry already)
6. ❌ Advanced error recovery (beyond skip-and-continue)
7. ❌ Performance optimization (supervisor overhead acceptable at <100ms)
8. ❌ Wave0 UI/dashboard (monitoring future work)

---

## Dependencies

**This task depends on:**
1. ✅ Batch 1: Supervisor scaffold (LeaseManager + LifecycleTelemetry) - COMPLETE
2. ✅ Wave0Runner exists and works - COMPLETE
3. ✅ TaskExecutor exists and works - COMPLETE

**This task does NOT depend on:**
- Unit test framework (not using unit tests)
- Test harness (using live autopilot)
- Mock components (using real components)

---

## Risks and Mitigations

### Risk 1: Import Path Issues

**Risk:** Supervisor components may not be importable from Wave0Runner.

**Likelihood:** Medium
**Impact:** High (blocks integration)

**Mitigation:**
- Verify import paths before implementation
- Check tsconfig.json includes autopilot_mvp/ in paths
- Test build with imports before full implementation

---

### Risk 2: Build Failures

**Risk:** TypeScript build may fail with supervisor imports.

**Likelihood:** Low
**Impact:** High (blocks integration)

**Mitigation:**
- Run build early in implementation
- Fix any tsconfig issues immediately
- Ensure supervisor components are in build paths

---

### Risk 3: Telemetry Directory Missing

**Risk:** state/analytics/ directory may not exist, telemetry write fails.

**Likelihood:** Low (LifecycleTelemetry should create directory)
**Impact:** Medium (telemetry fails, but doesn't crash)

**Mitigation:**
- LifecycleTelemetry creates directory automatically
- Add fallback in Wave0Runner constructor if needed
- Validate directory exists in live testing

---

### Risk 4: Lease Doesn't Release on Error

**Risk:** If task execution fails, lease may not be released.

**Likelihood:** Medium
**Impact:** High (task stuck, can't be retried)

**Mitigation:**
- Use try/finally block to ensure lease release
- Test error path manually (kill task mid-execution)
- Verify lease released even on crash

---

## Test Plan Summary

**Testing approach:** Live Wave0 autopilot with real task execution

**Test steps:**
1. Build TypeScript (verify build succeeds)
2. Start Wave0 autopilot (verify startup)
3. Add test task to roadmap.yaml
4. Monitor Wave0 execution (verify task executed)
5. Check supervisor_lifecycle.jsonl (verify events)
6. Validate JSONL structure (verify parseable)
7. Check lease logs (verify acquire/release)

**Pass criteria:** All 5 acceptance criteria met (AC1-AC5)

---

**Date:** 2025-11-06
**Author:** Claude Council
**Status:** SPEC phase complete, ready for PLAN phase
**Next:** Define implementation plan in plan.md
