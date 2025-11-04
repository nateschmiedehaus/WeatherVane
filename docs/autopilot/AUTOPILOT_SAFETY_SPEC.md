# Autopilot Safety & Autonomous Operation - Specification

**Date**: 2025-10-27
**Status**: SPEC Phase
**Priority**: CRITICAL (prevents computer damage)

## Goal

Transform autopilot from a fragile single-run system into a safe, autonomous agent that:
1. Cannot break the user's computer (process cleanup, resource limits)
2. Runs continuously without human intervention (restart on crash, health checking)
3. Performs tasks reliably (verification, error recovery)

## Current State (Problems)

### Process Management Failures

**Orphaned Processes**:
- `state/worker_pid` contains PID 66736 (process doesn't exist)
- UnifiedOrchestrator.stop() doesn't clean up PID file
- Child processes may survive parent death
- No cleanup-on-boot to kill stale processes

**Unsafe Shutdown**:
- SIGINT trap in shell script may not fire if:
  - Process killed with SIGKILL
  - Node.js crashes before trap fires
  - Parent process dies unexpectedly
- No verification that child processes actually died

**Resource Leaks**:
- File descriptors not closed properly
- SQLite connections not released
- Port bindings held by dead processes

### Autonomous Operation Failures

**No Continuous Mode**:
- Script exits after runContinuous() completes
- No restart-on-crash mechanism
- User must manually restart if autopilot dies

**No Health Checking**:
- Stuck workers go undetected
- Infinite loops not caught
- No progress tracking

**Silent Failures**:
- Crashes don't trigger alerts
- User doesn't know tasks aren't being completed

## Acceptance Criteria

### 1. Process Cleanup (MANDATORY)

**AC-1.1**: PID File Management
- ✅ Write PID to `state/worker_pid` atomically on start
- ✅ On start: If PID file exists, check if process is alive
  - If dead → delete PID file and proceed
  - If alive → exit with error "Autopilot already running (PID {pid})"
- ✅ On clean shutdown: Delete PID file
- ✅ PID file contains metadata: `{"pid": 12345, "started_at": "2025-10-27T10:00:00Z", "workspace": "/path/to/workspace"}`

**AC-1.2**: Child Process Cleanup
- ✅ All child processes killed on ANY shutdown (graceful, SIGINT, SIGTERM, SIGKILL, crash)
- ✅ Use process groups (`setpgid`) to kill entire tree
- ✅ Verify processes are dead (wait for exit, check /proc if needed)
- ✅ No zombie processes left behind (parent must wait/reap)

**AC-1.3**: Cleanup Script
- ✅ Create `scripts/kill_autopilot.sh` that:
  - Reads PID from state/worker_pid
  - Sends SIGTERM, waits 5s, sends SIGKILL if needed
  - Kills process group (not just parent)
  - Cleans up PID file
  - Verifies no autopilot processes remain

**AC-1.4**: Resource Cleanup
- ✅ Close all file descriptors in finally blocks
- ✅ Close SQLite connections explicitly
- ✅ Release port bindings
- ✅ Delete temp files

### 2. Autonomous Operation (MANDATORY)

**AC-2.1**: Continuous Mode
- ✅ Autopilot runs indefinitely until explicitly stopped (Ctrl+C or kill_autopilot.sh)
- ✅ Loops through: fetch tasks → assign → execute → verify → repeat
- ✅ Sleep between iterations (configurable, default 30s)
- ✅ Exit only on: SIGINT, SIGTERM, explicit stop, or fatal error

**AC-2.2**: Restart on Crash
- ✅ Wrapper script (`scripts/autopilot_supervisor.sh`) that:
  - Runs autopilot_unified.sh in loop
  - Detects crashes (non-zero exit code)
  - Waits exponential backoff (1s, 2s, 4s, 8s, max 60s)
  - Restarts autopilot
  - Logs crash to `state/autopilot_crashes.log`
  - Exits if crash count > 10 in 5 minutes (circuit breaker)

**AC-2.3**: Health Checking
- ✅ Worker health checks every 60s
- ✅ Detect stuck workers (no progress in 10 min)
- ✅ Kill and restart stuck workers
- ✅ Escalate if same task fails 3 times

**AC-2.4**: Progress Tracking
- ✅ Log heartbeat every 5 min to `state/autopilot_heartbeat.log`
- ✅ Include: tasks completed, workers active, current task IDs
- ✅ User can tail heartbeat to see progress

### 3. Safety Guarantees (MANDATORY)

**AC-3.1**: Single Instance Lock
- ✅ Cannot start second autopilot if one is running
- ✅ Use PID file + process existence check
- ✅ Error message shows PID and how to kill

**AC-3.2**: Resource Limits
- ✅ Max 10 child processes (configurable via AGENT_COUNT)
- ✅ Memory limit per worker: 2GB (via Node.js --max-old-space-size)
- ✅ CPU limit per worker: 100% (1 core) via nice/renice
- ✅ Disk space check: Exit if < 1GB free

**AC-3.3**: Graceful Degradation
- ✅ If provider rate limited → switch to other provider
- ✅ If all providers exhausted → sleep 15 min, retry
- ✅ If disk full → log error, exit gracefully (no crash)
- ✅ If SQLite locked → retry with exponential backoff (max 10 attempts)

**AC-3.4**: Cleanup on Signals
- ✅ Handle SIGINT (Ctrl+C): Graceful shutdown
- ✅ Handle SIGTERM (kill command): Graceful shutdown
- ✅ Handle SIGHUP (terminal close): Continue running in background OR exit cleanly
- ✅ DO NOT handle SIGKILL (can't be caught) - rely on PID file cleanup on next boot

### 4. Verification (MANDATORY)

**AC-4.1**: Chaos Tests
- ✅ Test: Start autopilot, kill with SIGKILL, verify no orphaned processes
- ✅ Test: Start autopilot, crash Node.js (process.exit(1)), verify cleanup
- ✅ Test: Start autopilot twice, verify second one exits with error
- ✅ Test: Fill disk to 100%, verify autopilot exits gracefully

**AC-4.2**: Stress Tests
- ✅ 1000 start/stop cycles, verify no leaked file descriptors
- ✅ 100 concurrent start attempts, verify only one succeeds
- ✅ Run for 24 hours, verify no memory leaks

**AC-4.3**: Property Invariants
- ✅ After ANY shutdown: `ps aux | grep autopilot` returns empty
- ✅ After ANY shutdown: `lsof | grep wvo_mcp` returns empty (no open files)
- ✅ PID in state/worker_pid always matches running process OR file doesn't exist

## Constraints

**Performance**:
- Startup time: < 10s
- Shutdown time: < 5s (graceful), < 1s (SIGKILL)
- Heartbeat overhead: < 1% CPU

**Compatibility**:
- macOS (primary), Linux (secondary)
- Node.js v18+
- Bash 4.0+

**Security**:
- No root privileges required
- PID file readable only by user (chmod 600)
- No network access for process management

## Out of Scope

- Windows support (macOS/Linux only)
- Multi-machine orchestration (single machine only)
- GUI interface (CLI only)
- Remote process management (local only)

## Success Metrics

**Safety** (Zero tolerance):
- 0 orphaned processes after 1000 runs
- 0 leaked file descriptors after 1000 runs
- 0 user reports of "autopilot broke my computer"

**Autonomy**:
- 99% uptime over 7 days (only downtime = user-initiated stop)
- < 5 min recovery time after crash
- < 1 manual intervention per week

**Reliability**:
- 95% task completion rate
- < 3% task failure rate due to autopilot bugs (vs user code bugs)

## References

- Current implementation: `tools/wvo_mcp/scripts/autopilot_unified.sh`
- Worker manager: `tools/wvo_mcp/src/worker/worker_manager.ts`
- Unified orchestrator: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`
- Process manager: `tools/wvo_mcp/src/orchestrator/process_manager.ts`
