# Autopilot Guaranteed Safety - SPECIFICATION

**Date**: 2025-10-27
**Goal**: Guarantee autopilot will never crash the computer or have processes escape control
**Phases**: Phases 2-3 (Supervision + Resource Limits)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ Supervisor Script (Shell)                              │
│ - Monitors autopilot process                           │
│ - Auto-restarts on crash (exponential backoff)         │
│ - Health monitoring (heartbeat + stuck detection)      │
│ - Resource limit enforcement                           │
└────────────────┬────────────────────────────────────────┘
                 │ spawns with limits
                 ↓
┌─────────────────────────────────────────────────────────┐
│ Autopilot Process (Node.js)                            │
│ - Memory limit: 2GB (--max-old-space-size)             │
│ - Process group: setpgid(0, 0)                         │
│ - Disk monitoring: Check every 60s                     │
│ - CPU priority: nice +5                                │
│ - FD limit: ulimit -n 1024                             │
└────────────────┬────────────────────────────────────────┘
                 │ spawns children in same process group
                 ↓
┌─────────────────────────────────────────────────────────┐
│ Child Processes (Tools, Scripts)                       │
│ - Inherit resource limits                              │
│ - All in same process group                            │
│ - Killed with parent on shutdown                       │
└─────────────────────────────────────────────────────────┘
```

## Resource Limits (Strong Guarantees)

### Memory Limit
**Limit**: 2GB (2048MB) max RSS
**Enforcement**:
- Node.js: `--max-old-space-size=2048`
- OS: `ulimit -v 2097152` (2GB in KB, virtual memory limit)
**Behavior on exceed**: Process killed by OS (SIGKILL), supervisor restarts
**Guarantee**: Autopilot cannot consume >2GB RAM, system won't freeze

### Disk Space Limit
**Minimum free space**: 10% of total disk or 5GB (whichever is larger)
**Monitoring interval**: 60 seconds
**Enforcement**:
- Pre-flight check: Refuse to start if disk <10% free
- Runtime monitoring: Pause autopilot if disk >90% full
- Shutdown trigger: Stop gracefully if disk >95% full
**Behavior on exceed**: Clean shutdown with error message, manual intervention required
**Guarantee**: Autopilot won't fill disk and crash system

### CPU Limit
**Priority**: nice +5 (lower than default 0)
**Optional hard limit**: cgroup CPU quota (if available)
**Enforcement**:
- Shell: `nice -n 5 node ...`
- Optional: cgroup cpu.cfs_quota_us (80% of one core)
**Behavior on exceed**: Process slowed down, system remains responsive
**Guarantee**: Autopilot won't freeze system by consuming all CPU

### File Descriptor Limit
**Limit**: 1024 open files (soft), 2048 (hard)
**Enforcement**: `ulimit -n 1024`
**Behavior on exceed**: EMFILE error, autopilot handles gracefully or crashes and restarts
**Guarantee**: Autopilot won't exhaust system file descriptors

### Process Count Limit
**Limit**: 100 child processes max (arbitrary but safe)
**Enforcement**: Count children periodically, warn if >50, kill if >100
**Behavior on exceed**: Kill excess children, log error
**Guarantee**: Fork bomb protection

## Supervision & Auto-Restart (Strong Guarantees)

### Supervisor Script (`tools/wvo_mcp/scripts/supervise_autopilot.sh`)

**Responsibilities**:
1. Start autopilot with resource limits
2. Monitor process health (heartbeat)
3. Detect crashes and restart
4. Enforce exponential backoff on repeated crashes
5. Clean up on supervisor exit

**Restart Logic**:
```
Crash #1 → wait 1s  → restart
Crash #2 → wait 2s  → restart
Crash #3 → wait 4s  → restart
Crash #4 → wait 8s  → restart
Crash #5 → wait 16s → restart
Crash #6 → STOP (too many crashes, manual intervention required)
```

**Reset backoff**: If autopilot runs successfully for >5 minutes, reset counter to 0

**Exit codes**:
- 0: Clean shutdown (don't restart)
- 1-99: Error (restart with backoff)
- 100: Fatal error (don't restart, manual intervention required)
- 143: SIGTERM (clean shutdown, don't restart)

### Health Monitoring

**Heartbeat**:
- Autopilot writes timestamp to `state/heartbeat` every 30s
- Supervisor checks heartbeat every 60s
- If heartbeat age >90s, autopilot is considered stuck

**Stuck detection**:
- If stuck detected, supervisor sends SIGTERM
- Wait 10s for graceful shutdown
- If still alive, send SIGKILL
- Restart with backoff

### Startup Health Checks

Before starting autopilot, supervisor checks:
1. **Disk space**: ≥10% free or ≥5GB
2. **Memory**: ≥500MB free
3. **No other autopilot running**: PID file check
4. **Required directories exist**: state/, resources/, tools/

If any check fails, supervisor exits with error (no retry).

## Process Containment (Hard Guarantees)

### Process Group Enforcement

**Implementation**:
```typescript
// In UnifiedOrchestrator constructor (after PID lock)
try {
  process.setpgid(0, 0);  // Set this process as process group leader
  logInfo('Set process group', { pid: process.pid, pgid: process.getpgid(0) });
} catch (error) {
  logWarning('Failed to set process group', { error });
  // Continue anyway - fallback to individual child killing
}
```

**Benefit**: Single `kill -- -PID` kills entire tree (already implemented in Phase 1)

### Orphan Detection & Cleanup

**Periodic check** (every 5 minutes):
```bash
# Find processes with parent PID = 1 (orphaned) matching autopilot pattern
pgrep -P 1 -f "wvo_mcp|autopilot" || true
```

If orphans found:
- Log warning
- Attempt to kill orphans
- Report to user

### Child Process Tracking

**Implementation**:
```typescript
// Track all spawned children in UnifiedOrchestrator
private childProcesses: Set<ChildProcess> = new Set();

spawn(command: string): ChildProcess {
  const child = child_process.spawn(command);
  this.childProcesses.add(child);

  child.on('exit', () => {
    this.childProcesses.delete(child);
  });

  return child;
}

// In stop() method
for (const child of this.childProcesses) {
  killProcess(child.pid);
}
```

## Acceptance Criteria

### Phase 2: Supervision & Auto-Restart

**AC-SUP-1: Crash Recovery**
- Given: Autopilot process crashes (uncaught exception)
- When: Supervisor detects exit
- Then: Autopilot restarts within 5 seconds
- Verify: Chaos test throws exception, supervisor restarts

**AC-SUP-2: Exponential Backoff**
- Given: Autopilot crashes 3 times in 1 minute
- When: Each crash occurs
- Then: Wait time increases exponentially (1s, 2s, 4s)
- Verify: Chaos test crashes repeatedly, verify wait times

**AC-SUP-3: Backoff Reset**
- Given: Autopilot runs successfully for 5 minutes
- When: Then crashes
- Then: Backoff counter resets to 0
- Verify: Run successfully, crash, verify 1s wait (not longer)

**AC-SUP-4: Max Crashes**
- Given: Autopilot crashes 6 times in a row
- When: 6th crash occurs
- Then: Supervisor stops (no more restarts)
- Verify: Chaos test crashes 6 times, supervisor exits

**AC-SUP-5: Stuck Detection**
- Given: Autopilot stops writing heartbeat (infinite loop)
- When: Heartbeat age >90s
- Then: Supervisor kills and restarts autopilot
- Verify: Chaos test enters infinite loop, supervisor kills it

**AC-SUP-6: Clean Shutdown**
- Given: User runs kill_autopilot.sh
- When: Autopilot exits with code 0 or 143
- Then: Supervisor does NOT restart
- Verify: Manual shutdown, verify supervisor exits

**AC-SUP-7: Startup Health Checks**
- Given: Disk space <10% free
- When: User tries to start autopilot
- Then: Supervisor refuses to start, exits with error
- Verify: Fill disk to 95%, try to start, verify failure

### Phase 3: Resource Limits

**AC-RES-1: Memory Limit Enforced**
- Given: Autopilot allocates >2GB RAM (memory leak)
- When: Memory exceeds limit
- Then: OS kills process (SIGKILL), supervisor restarts
- Verify: Chaos test allocates 3GB, process dies at 2GB

**AC-RES-2: Disk Space Check**
- Given: Disk usage reaches 90%
- When: Autopilot checks disk space (every 60s)
- Then: Autopilot pauses and logs error
- Verify: Fill disk to 91%, autopilot pauses

**AC-RES-3: Disk Space Shutdown**
- Given: Disk usage reaches 95%
- When: Autopilot checks disk space
- Then: Autopilot shuts down gracefully
- Verify: Fill disk to 96%, autopilot exits cleanly

**AC-RES-4: CPU Priority**
- Given: Autopilot runs CPU-intensive task
- When: System is under load
- Then: Autopilot process has lower priority (nice +5)
- Verify: Check `ps -o ni,pid,comm | grep node`

**AC-RES-5: File Descriptor Limit**
- Given: Autopilot opens >1024 files
- When: Attempting to open more
- Then: EMFILE error, autopilot handles or crashes and restarts
- Verify: Chaos test opens 2000 files, verify failure at 1024

**AC-RES-6: Process Count Limit**
- Given: Autopilot spawns >100 child processes (fork bomb)
- When: Count exceeds 100
- Then: Excess processes killed
- Verify: Fork bomb test spawns 200 processes, verify only 100 survive

**AC-RES-7: Process Group Containment**
- Given: Autopilot spawns child processes
- When: Autopilot exits
- Then: All children in same process group are killed
- Verify: Spawn 10 children, kill parent, verify all children die

**AC-RES-8: Orphan Detection**
- Given: Child process escapes and becomes orphaned (parent PID = 1)
- When: Orphan detection runs (every 5 minutes)
- Then: Orphan is detected, logged, and killed
- Verify: Force orphan creation, wait 5 min, verify cleanup

## Configuration

**File**: `tools/wvo_mcp/config/resource_limits.json`

```json
{
  "memory": {
    "max_old_space_size_mb": 2048,
    "ulimit_virtual_memory_kb": 2097152
  },
  "disk": {
    "min_free_percent": 10,
    "min_free_gb": 5,
    "check_interval_seconds": 60,
    "pause_threshold_percent": 90,
    "shutdown_threshold_percent": 95
  },
  "cpu": {
    "nice_level": 5,
    "cgroup_quota_enabled": false,
    "cgroup_quota_percent": 80
  },
  "file_descriptors": {
    "soft_limit": 1024,
    "hard_limit": 2048
  },
  "processes": {
    "max_children": 100,
    "check_interval_seconds": 300
  },
  "supervisor": {
    "restart_backoff_seconds": [1, 2, 4, 8, 16],
    "max_crashes": 6,
    "backoff_reset_runtime_seconds": 300,
    "heartbeat_interval_seconds": 30,
    "heartbeat_timeout_seconds": 90,
    "stuck_process_kill_timeout_seconds": 10
  }
}
```

## Files to Create

**Supervisor**:
- `tools/wvo_mcp/scripts/supervise_autopilot.sh` (main supervisor)
- `tools/wvo_mcp/src/utils/resource_monitor.ts` (disk/memory/process monitoring)
- `tools/wvo_mcp/src/utils/heartbeat.ts` (heartbeat writer)

**Tests**:
- `tools/wvo_mcp/src/utils/resource_monitor.test.ts`
- `tools/wvo_mcp/src/utils/heartbeat.test.ts`
- `tools/wvo_mcp/scripts/chaos_tests/memory_leak.test.sh`
- `tools/wvo_mcp/scripts/chaos_tests/disk_full.test.sh`
- `tools/wvo_mcp/scripts/chaos_tests/fork_bomb.test.sh`
- `tools/wvo_mcp/scripts/chaos_tests/cpu_spin.test.sh`
- `tools/wvo_mcp/scripts/chaos_tests/crash_recovery.test.sh`

**Config**:
- `tools/wvo_mcp/config/resource_limits.json`

## Files to Modify

**Existing files**:
- `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts` (add resource monitoring, heartbeat, process group)
- `tools/wvo_mcp/scripts/autopilot_unified.sh` (call supervisor instead of direct node execution)

## Non-Functional Requirements

**Startup time**: <5 seconds (including health checks)
**Restart time**: <10 seconds (including cleanup and restart)
**Monitoring overhead**: <1% CPU, <50MB RAM
**Heartbeat file**: <100 bytes
**Resource check latency**: <100ms

## Out of Scope

The following are NOT guaranteed and are out of scope:
- Kernel panics or hardware failures
- Root-level interference (sudo kill -9, reboot)
- Network-based attacks or DoS
- Malicious code injection
- OS-level bugs or vulnerabilities

## Success Definition

Implementation is successful when:
1. All 15 acceptance criteria pass (8 supervision + 7 resource limits)
2. Chaos tests demonstrate survival under adversarial conditions
3. 24-hour stress test completes without system freeze or crash
4. Documentation clearly states what is/isn't guaranteed
5. User can run autopilot with confidence it won't crash their computer
