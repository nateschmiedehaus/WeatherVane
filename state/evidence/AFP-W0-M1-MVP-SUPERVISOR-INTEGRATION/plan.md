# PLAN - Wave0 Supervisor Integration

**Task:** AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION
**Date:** 2025-11-06
**Author:** Claude Council
**Phase:** 3 of 10 (PLAN)

---

## Implementation Plan

### Files to Modify

**1 file to change:**
- `tools/wvo_mcp/src/wave0/runner.ts` - Add supervisor integration

**0 files to create** (all components exist)

**Estimated LOC:** ~50 net additions (under 150 limit)

---

## Via Negativa Analysis

**Can we DELETE instead of add?**

❌ **No** - We need to ADD supervisor integration (doesn't exist yet).

**What can we simplify or remove?**
- Wave0Runner is already minimal (237 LOC)
- No dead code to remove
- Supervisor components are minimal (123 LOC total)
- Cannot delete any existing functionality

**Result:** Must ADD ~50 LOC for integration. No deletions possible.

---

## Refactor vs. Repair Analysis

**Are we patching or refactoring root cause?**

**Root cause:** Supervisor components exist but are not integrated with Wave0Runner.

**This is neither patch nor refactor - this is INTEGRATION:**
- Not fixing a bug (patch)
- Not restructuring existing code (refactor)
- **Adding new capability:** Supervisor orchestration to existing Wave0 loop

**Approach:** Integration via minimal additions to Wave0Runner mainLoop().

**Why this is clean:**
- Supervisor components are well-designed (Batch 1)
- Wave0Runner has clear hook points (mainLoop)
- Integration is additive, not disruptive
- No need to refactor existing code

**Result:** Clean integration, not repair.

---

## Detailed Implementation Plan

### Step 1: Add Imports (3 LOC)

**File:** `tools/wvo_mcp/src/wave0/runner.ts`

**Add at top of file:**
```typescript
import { LeaseManager } from '../autopilot_mvp/supervisor/lease_manager.js';
import { LifecycleTelemetry } from '../autopilot_mvp/supervisor/lifecycle_telemetry.js';
```

**Validation:** TypeScript build should compile imports without errors.

**Risk:** Import paths may need adjustment if autopilot_mvp/ not in paths.

---

### Step 2: Add Properties to Wave0Runner (2 LOC)

**File:** `tools/wvo_mcp/src/wave0/runner.ts`

**Add to class properties:**
```typescript
export class Wave0Runner {
  private workspaceRoot: string;
  private stateRoot: string;
  private lockFile: string;
  private shutdownRequested = false;
  private executor: TaskExecutor;
  private emptyCheckCount = 0;
  private leaseManager: LeaseManager;     // NEW
  private telemetry: LifecycleTelemetry;   // NEW
```

**Validation:** TypeScript should recognize new properties.

---

### Step 3: Initialize in Constructor (2 LOC)

**File:** `tools/wvo_mcp/src/wave0/runner.ts`

**Add to constructor:**
```typescript
constructor(workspaceRoot: string) {
  this.workspaceRoot = workspaceRoot;
  this.stateRoot = resolveStateRoot(workspaceRoot);
  this.lockFile = path.join(this.stateRoot, ".wave0.lock");
  this.executor = new TaskExecutor(workspaceRoot);
  this.leaseManager = new LeaseManager(30 * 60 * 1000); // 30 min TTL  // NEW
  this.telemetry = new LifecycleTelemetry(workspaceRoot);              // NEW
}
```

**Validation:** Constructor should instantiate without errors.

---

### Step 4: Update mainLoop() with Supervisor Orchestration (~43 LOC)

**File:** `tools/wvo_mcp/src/wave0/runner.ts`

**Current mainLoop() structure:**
```typescript
private async mainLoop(): Promise<void> {
  while (!this.shutdownRequested) {
    try {
      const task = await this.getNextTask();
      if (!task) { /* empty handling */ }
      this.emptyCheckCount = 0;
      await this.updateTaskStatus(task.id, "in_progress");
      const result = await this.executor.execute(task);
      const finalStatus = result.status === "completed" ? "done" : "blocked";
      await this.updateTaskStatus(task.id, finalStatus);
      await this.checkpoint();
      await this.sleep(RATE_LIMIT_MS);
    } catch (error) { /* error handling */ }
  }
}
```

**NEW mainLoop() with supervisor integration:**
```typescript
private async mainLoop(): Promise<void> {
  logInfo("Wave0Runner: Entering main loop");

  while (!this.shutdownRequested) {
    try {
      // 1. Get next task (EXISTING)
      const task = await this.getNextTask();

      if (!task) {
        // No tasks available (EXISTING)
        this.emptyCheckCount++;
        logWarning(`Wave0Runner: No pending tasks found (${this.emptyCheckCount}/${EMPTY_RETRY_LIMIT})`);

        if (this.emptyCheckCount >= EMPTY_RETRY_LIMIT) {
          logInfo("Wave0Runner: No tasks for 15 minutes, exiting gracefully");
          break;
        }

        await this.sleep(RATE_LIMIT_MS);
        continue;
      }

      // 2. ACQUIRE LEASE (NEW - 6 lines)
      const leaseAcquired = await this.leaseManager.acquireLease(task.id);
      if (!leaseAcquired) {
        logWarning(`Wave0Runner: Lease already held for ${task.id}, skipping`);
        continue;
      }

      try {
        // 3. EMIT task.selected (NEW - 5 lines)
        await this.telemetry.emit('task.selected', {
          taskId: task.id,
          title: task.title,
          reason: 'highest priority pending task'
        });

        // Reset empty counter (EXISTING)
        this.emptyCheckCount = 0;

        // 4. Update status + EMIT task.assigned (NEW - 2 lines)
        await this.updateTaskStatus(task.id, "in_progress");
        await this.telemetry.emit('task.assigned', { taskId: task.id });

        // 5. EMIT task.started (NEW - 1 line)
        await this.telemetry.emit('task.started', { taskId: task.id });

        // 6. Execute task (EXISTING)
        const result = await this.executor.execute(task);

        // 7. EMIT task.completed (NEW - 4 lines)
        await this.telemetry.emit('task.completed', {
          taskId: task.id,
          status: result.status,
          duration_ms: result.duration_ms
        });

        // 8. Update final status (EXISTING)
        const finalStatus = result.status === "completed" ? "done" : "blocked";
        await this.updateTaskStatus(task.id, finalStatus);
      } finally {
        // 9. RELEASE LEASE (NEW - 2 lines)
        // Always release lease, even if execution fails
        await this.leaseManager.releaseLease(task.id);
      }

      // 10. Checkpoint (EXISTING)
      await this.checkpoint();

      // 11. Rate limit (EXISTING)
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

**Key changes:**
- **+6 lines**: Lease acquisition with skip-if-held logic
- **+5 lines**: task.selected event emission
- **+2 lines**: task.assigned event emission
- **+1 line**: task.started event emission
- **+4 lines**: task.completed event emission
- **+2 lines**: Lease release in finally block
- **+3 lines**: try/finally wrapper for lease guarantee

**Total:** ~23 new lines of supervisor logic + existing code = ~43 LOC net change

---

## Error Handling Strategy

### 1. Lease Acquisition Failure

**Scenario:** Task lease already held by another Wave0 instance.

**Handling:**
```typescript
if (!leaseAcquired) {
  logWarning(`Lease already held for ${task.id}, skipping`);
  continue; // Skip to next task
}
```

**Result:** Wave0 skips task, continues to next.

---

### 2. Telemetry Emission Failure

**Scenario:** LifecycleTelemetry.emit() fails (disk full, permissions, etc.).

**Handling:** Let exception bubble to outer try/catch, log error, continue.

```typescript
catch (error) {
  logError("Wave0Runner: Error in main loop", { error });
  // Continue to next iteration (don't crash)
}
```

**Result:** Wave0 logs error, continues to next task. Autopilot doesn't crash.

---

### 3. Lease Release Failure

**Scenario:** leaseManager.releaseLease() fails (should be rare).

**Handling:** Finally block guarantees release attempt.

```typescript
finally {
  await this.leaseManager.releaseLease(task.id);
  // If this throws, exception bubbles to outer catch
}
```

**Result:** Release always attempted. If fails, logged and Wave0 continues.

---

### 4. Task Execution Failure

**Scenario:** executor.execute() throws exception.

**Handling:** Finally block ensures lease released even if execution fails.

```typescript
try {
  // ... emit events ...
  const result = await this.executor.execute(task);
  // ... emit completion ...
} finally {
  await this.leaseManager.releaseLease(task.id);
}
```

**Result:** Lease released, Wave0 continues to next task.

---

## Testing Plan (Authored in PLAN phase)

### Automated Tests

**Test 1: Build Verification**
```bash
cd tools/wvo_mcp
npm run build
# Expected: Exit code 0, no TypeScript errors
```

**Test 2: Wave0 Startup**
```bash
cd tools/wvo_mcp
npm run wave0 &
tail -f state/analytics/wave0_startup.log
# Expected: "Wave0Runner: Entering main loop" appears
```

### Manual Tests (to be run in VERIFY phase)

**Test 3: Live Task Execution**
```bash
# 1. Add test task to roadmap.yaml:
cat >> state/roadmap.yaml << 'EOF'
  - id: TEST-SUPERVISOR-001
    title: Supervisor integration test
    status: pending
    description: Verify supervisor orchestrates task
EOF

# 2. Start Wave0
cd tools/wvo_mcp
npm run wave0 &

# 3. Monitor execution
tail -f state/analytics/supervisor_lifecycle.jsonl

# Expected:
# - 4 events for TEST-SUPERVISOR-001
# - Events in order: selected → assigned → started → completed
# - Task status changes: pending → in_progress → done
```

**Test 4: JSONL Validation**
```bash
# Validate JSONL structure
cat state/analytics/supervisor_lifecycle.jsonl | jq '.'
# Expected: Valid JSON, no parse errors
```

**Test 5: Lease Coordination**
```bash
# Start two Wave0 instances (stress test)
cd tools/wvo_mcp
npm run wave0 &
sleep 2
npm run wave0 &  # Should fail with "already running" error

# Expected:
# - Second instance exits with lock file error
# - Only one instance runs task
# - No duplicate execution
```

---

## LOC Breakdown

| Section | LOC |
|---------|-----|
| Imports | 3 |
| Class properties | 2 |
| Constructor | 2 |
| mainLoop() updates | 43 |
| **Total** | **50 LOC** |

✅ **Under 150 LOC limit**

---

## Dependencies

**Import dependencies:**
```typescript
import { LeaseManager } from '../autopilot_mvp/supervisor/lease_manager.js';
import { LifecycleTelemetry } from '../autopilot_mvp/supervisor/lifecycle_telemetry.js';
```

**Runtime dependencies:**
- LeaseManager (Batch 1 component)
- LifecycleTelemetry (Batch 1 component)
- TaskExecutor (existing)

**Build dependencies:**
- TypeScript must compile autopilot_mvp/ directory
- tsconfig.json must include paths to supervisor components

---

## Risks

### Risk 1: Import Path Issues (Medium)

**Risk:** Import paths may not resolve if autopilot_mvp/ not in build paths.

**Mitigation:**
- Verify import paths in Step 1
- Check tsconfig.json before implementation
- Test build immediately after adding imports

**Contingency:** Update tsconfig.json to include autopilot_mvp/ if needed.

---

### Risk 2: Lease Not Released on Exception (High)

**Risk:** If exception thrown during execution, lease may not be released.

**Mitigation:**
- Use try/finally block to guarantee lease release
- Test error path manually (kill task mid-execution)

**Contingency:** Add additional error handling if needed.

---

### Risk 3: Telemetry Overhead (Low)

**Risk:** Telemetry emissions may slow down task execution.

**Mitigation:**
- LifecycleTelemetry uses async file writes (non-blocking)
- Measure overhead in live testing (target: <100ms)

**Contingency:** If overhead high, make telemetry optional (config flag).

---

## Success Criteria

**Implementation successful if:**
1. ✅ Build completes with 0 TypeScript errors
2. ✅ Wave0 starts and enters main loop
3. ✅ Live task execution completes successfully
4. ✅ All 4 lifecycle events emitted to JSONL
5. ✅ JSONL log is parseable
6. ✅ Lease acquired before execution, released after
7. ✅ No crashes or exceptions during normal operation
8. ✅ Net LOC ≤ 150 (target: 50)

---

### Verification Plan

**PLAN-authored tests:**
- Manual Wave 0 live loop: start `npm run wave0 &`, verify `ps aux | grep wave0` lists the runner, exercise one roadmap task end-to-end, then stop via `pkill -f wave0`.
- TaskFlow Wave 0 smoke: `node tools/taskflow/run.js wave0-smoke --live` with production credentials; ensure supervisor orchestrates planner → builder → reviewer → SRE chain and records lifecycle events.
- Telemetry validation: Tail `state/telemetry/wave0/lifecycle.log` to confirm `task.selected`, `task.assigned`, `task.started`, `task.completed` entries for the executed task IDs.

---

**Date:** 2025-11-06
**Author:** Claude Council
**Status:** PLAN phase complete, ready for THINK phase
**Next:** Analyze edge cases and failure modes in think.md
