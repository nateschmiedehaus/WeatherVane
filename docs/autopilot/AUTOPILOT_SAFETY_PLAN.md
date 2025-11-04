# Autopilot Safety & Autonomous Operation - Implementation Plan

**References**:
- Spec: `docs/autopilot/AUTOPILOT_SAFETY_SPEC.md`
- Verification Methodology: Chaos/Fault Injection + State Space Exploration

## Implementation Steps

### Phase 1: Process Lifecycle Management (Critical - Do First)

**Step 1.1**: Create PID File Manager Module
- **File**: `tools/wvo_mcp/src/utils/pid_file_manager.ts`
- **Functions**:
  - `writePidFile(path, metadata)`: Write PID atomically with metadata
  - `readPidFile(path)`: Read PID file, parse metadata
  - `isProcessAlive(pid)`: Check if process exists (via `process.kill(pid, 0)`)
  - `cleanupPidFile(path)`: Delete PID file if process is dead
  - `acquireLock(path)`: Try to acquire lock (write PID, check no other running)
  - `releaseLock(path)`: Delete PID file
- **Dependencies**: None
- **Tests**: `tools/wvo_mcp/src/utils/pid_file_manager.test.ts`

**Step 1.2**: Create Process Cleanup Utility
- **File**: `tools/wvo_mcp/src/utils/process_cleanup.ts`
- **Functions**:
  - `killProcessTree(pid, signal)`: Kill process and all children
  - `waitForProcessDeath(pid, timeoutMs)`: Poll until process dies
  - `ensureProcessDead(pid)`: Send SIGTERM, wait, send SIGKILL if needed
  - `cleanupChildProcesses()`: Find and kill all child processes
- **Dependencies**: `pid_file_manager.ts`
- **Tests**: `tools/wvo_mcp/src/utils/process_cleanup.test.ts`

**Step 1.3**: Integrate PID File into UnifiedOrchestrator
- **File**: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`
- **Changes**:
  - In `start()`: Call `acquireLock('state/worker_pid')` before starting
  - In `stop()`: Call `cleanupChildProcesses()` then `releaseLock('state/worker_pid')`
  - Add `finally` block to ensure lock is released even on crash
- **Dependencies**: `pid_file_manager.ts`, `process_cleanup.ts`

**Step 1.4**: Update Autopilot Script with Signal Handlers
- **File**: `tools/wvo_mcp/scripts/autopilot_unified.sh`
- **Changes**:
  - Add trap for SIGINT, SIGTERM, SIGHUP
  - In trap: Run cleanup (kill process group, delete PID file)
  - Test with `kill -SIGTERM $PID` and `kill -SIGKILL $PID`
- **Dependencies**: None

**Step 1.5**: Create Cleanup Script
- **File**: `tools/wvo_mcp/scripts/kill_autopilot.sh`
- **Contents**:
  ```bash
  #!/usr/bin/env bash
  # Kill autopilot and clean up all resources

  PID_FILE="state/worker_pid"
  if [ ! -f "$PID_FILE" ]; then
    echo "No autopilot running (PID file not found)"
    exit 0
  fi

  PID=$(jq -r '.pid' "$PID_FILE" 2>/dev/null || cat "$PID_FILE")

  # Send SIGTERM to process group
  kill -- -$PID 2>/dev/null || true

  # Wait 5 seconds
  for i in {1..5}; do
    if ! kill -0 $PID 2>/dev/null; then
      echo "✓ Autopilot stopped (PID $PID)"
      rm -f "$PID_FILE"
      exit 0
    fi
    sleep 1
  done

  # Force kill if still alive
  kill -9 -- -$PID 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "✓ Autopilot force-killed (PID $PID)"
  ```
- **Dependencies**: None

### Phase 2: Continuous & Restart-on-Crash (Autonomous Operation)

**Step 2.1**: Update UnifiedOrchestrator to Run Indefinitely
- **File**: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`
- **Changes**:
  - In `runContinuous()`: Wrap in infinite loop
  - Add `this.shouldStop` flag (set by stop())
  - Loop: `while (!this.shouldStop) { ... fetch tasks ... assign ... sleep ... }`
  - Add sleep between iterations (default 30s, configurable)
- **Dependencies**: None

**Step 2.2**: Create Supervisor Script
- **File**: `tools/wvo_mcp/scripts/autopilot_supervisor.sh`
- **Contents**:
  ```bash
  #!/usr/bin/env bash
  # Supervisor that restarts autopilot on crash

  CRASH_COUNT=0
  CRASH_WINDOW_START=$(date +%s)
  MAX_CRASHES=10
  WINDOW_SECONDS=300  # 5 minutes

  while true; do
    bash tools/wvo_mcp/scripts/autopilot_unified.sh "$@"
    EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
      echo "Autopilot exited cleanly"
      exit 0
    fi

    # Track crashes
    NOW=$(date +%s)
    if [ $((NOW - CRASH_WINDOW_START)) -gt $WINDOW_SECONDS ]; then
      # Reset window
      CRASH_COUNT=0
      CRASH_WINDOW_START=$NOW
    fi

    CRASH_COUNT=$((CRASH_COUNT + 1))
    echo "⚠️  Autopilot crashed (exit code $EXIT_CODE), crash $CRASH_COUNT/$MAX_CRASHES"

    if [ $CRASH_COUNT -gt $MAX_CRASHES ]; then
      echo "❌ Too many crashes ($CRASH_COUNT in 5 min), giving up"
      exit 1
    fi

    # Exponential backoff
    BACKOFF=$((2 ** (CRASH_COUNT - 1)))
    BACKOFF=$((BACKOFF > 60 ? 60 : BACKOFF))
    echo "Restarting in ${BACKOFF}s..."
    sleep $BACKOFF
  done
  ```
- **Dependencies**: `autopilot_unified.sh`

**Step 2.3**: Add Health Checking to WorkerManager
- **File**: `tools/wvo_mcp/src/worker/worker_manager.ts`
- **Changes**:
  - Add `lastProgressTimestamp` to WorkerProcessMetadata
  - Add `checkWorkerHealth()` method: if no progress in 10 min → kill worker
  - Call `checkWorkerHealth()` every 60s (via setInterval)
- **Dependencies**: `process_cleanup.ts`

**Step 2.4**: Add Heartbeat Logging
- **File**: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`
- **Changes**:
  - Add heartbeat interval (default 5 min)
  - Log to `state/autopilot_heartbeat.log`: timestamp, tasks completed, workers active, current task IDs
  - Rotate log file when > 10MB

### Phase 3: Resource Limits & Safety Guarantees

**Step 3.1**: Add Resource Checks to Autopilot Script
- **File**: `tools/wvo_mcp/scripts/autopilot_unified.sh`
- **Changes**:
  - Before starting: Check disk space (exit if < 1GB)
  - Before starting: Check memory (warn if < 4GB available)
  - Set Node.js memory limit: `--max-old-space-size=2048` per worker
- **Dependencies**: None

**Step 3.2**: Add Process Group Management
- **File**: `tools/wvo_mcp/src/utils/process_cleanup.ts`
- **Changes**:
  - When forking child processes: Use `detached: true` and `process.setpgid(0, 0)`
  - Store process group ID in metadata
  - Kill entire process group on shutdown
- **Dependencies**: None

**Step 3.3**: Add Signal Handlers to UnifiedOrchestrator
- **File**: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`
- **Changes**:
  - Register signal handlers in `start()`:
    ```typescript
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
    process.on('SIGHUP', () => this.stop());
    ```
  - Ensure `stop()` is idempotent (safe to call multiple times)
- **Dependencies**: `process_cleanup.ts`

### Phase 4: Testing & Verification

**Step 4.1**: Create Chaos Test Suite
- **File**: `tools/wvo_mcp/src/tests/autopilot_chaos.test.ts`
- **Tests**:
  - `test_sigkill_cleanup`: Start autopilot, kill with SIGKILL, verify no orphans
  - `test_crash_cleanup`: Start autopilot, crash Node.js, verify cleanup
  - `test_double_start`: Start autopilot twice, verify second fails
  - `test_disk_full`: Fill disk, verify graceful exit
- **Dependencies**: `pid_file_manager.ts`, `process_cleanup.ts`

**Step 4.2**: Create Stress Test Suite
- **File**: `tools/wvo_mcp/src/tests/autopilot_stress.test.ts`
- **Tests**:
  - `test_1000_cycles`: 1000 start/stop cycles, check for leaks
  - `test_100_concurrent_starts`: 100 concurrent start attempts, verify only one succeeds
  - `test_24_hour_run`: Run for 24 hours (or simulate with fast clock)
- **Dependencies**: `pid_file_manager.ts`

**Step 4.3**: Create Integration Test
- **File**: `tools/wvo_mcp/src/tests/autopilot_integration.test.ts`
- **Test**:
  - Start supervisor
  - Kill autopilot with SIGKILL
  - Verify supervisor restarts it
  - Verify heartbeat logs are written
  - Verify tasks get executed
- **Dependencies**: All modules

### Phase 5: Documentation & Monitoring

**Step 5.1**: Update README
- **File**: `README.md`
- **Add section**: "Running Autopilot"
  - How to start: `bash tools/wvo_mcp/scripts/autopilot_supervisor.sh`
  - How to stop: `bash tools/wvo_mcp/scripts/kill_autopilot.sh`
  - How to monitor: `tail -f state/autopilot_heartbeat.log`
  - Troubleshooting: orphaned processes, stuck workers

**Step 5.2**: Create Monitoring Dashboard Script
- **File**: `tools/wvo_mcp/scripts/autopilot_status.sh`
- **Contents**: Show PID, uptime, tasks completed, workers active, last heartbeat

## Estimated Time & Complexity

**Phase 1** (Process Lifecycle): 4-6 hours (HIGH priority, CRITICAL)
**Phase 2** (Continuous/Restart): 3-4 hours (HIGH priority)
**Phase 3** (Resource Limits): 2-3 hours (MEDIUM priority)
**Phase 4** (Testing): 4-5 hours (HIGH priority, verification)
**Phase 5** (Docs): 1-2 hours (LOW priority, can defer)

**Total**: 14-20 hours

## Dependencies & Order

1. Phase 1 must complete before Phase 2 (PID file needed for supervisor)
2. Phase 3 can run in parallel with Phase 2
3. Phase 4 runs after Phase 1-3 complete
4. Phase 5 runs last (documentation)

## Files to Create

New files:
- `tools/wvo_mcp/src/utils/pid_file_manager.ts`
- `tools/wvo_mcp/src/utils/pid_file_manager.test.ts`
- `tools/wvo_mcp/src/utils/process_cleanup.ts`
- `tools/wvo_mcp/src/utils/process_cleanup.test.ts`
- `tools/wvo_mcp/scripts/kill_autopilot.sh`
- `tools/wvo_mcp/scripts/autopilot_supervisor.sh`
- `tools/wvo_mcp/scripts/autopilot_status.sh`
- `tools/wvo_mcp/src/tests/autopilot_chaos.test.ts`
- `tools/wvo_mcp/src/tests/autopilot_stress.test.ts`
- `tools/wvo_mcp/src/tests/autopilot_integration.test.ts`

Modified files:
- `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`
- `tools/wvo_mcp/src/worker/worker_manager.ts`
- `tools/wvo_mcp/scripts/autopilot_unified.sh`
- `README.md`

## Success Criteria

- ✅ All chaos tests pass
- ✅ All stress tests pass
- ✅ Integration test passes
- ✅ Build passes with 0 errors
- ✅ All unit tests pass
- ✅ npm audit shows 0 vulnerabilities
- ✅ Manual smoke test: start autopilot, kill with SIGKILL, verify no orphans
