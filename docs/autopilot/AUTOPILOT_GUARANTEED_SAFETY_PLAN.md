# Autopilot Guaranteed Safety - PLAN

**Date**: 2025-10-27
**Phases**: 2-3 (Supervision + Resource Limits)
**Estimated Time**: 3-4 hours
**Priority**: CRITICAL (required before live testing)

## Implementation Order

**Order matters**: We implement in dependency order, test incrementally.

1. Resource monitoring utilities (foundation)
2. Heartbeat writer (needed by supervisor)
3. Resource limits in orchestrator (enforcement)
4. Supervisor script (orchestration)
5. Integration testing (chaos tests)

## Phase 2: Supervision & Auto-Restart (1.5-2 hours)

### Task 2.1: Heartbeat Writer (30 min)

**File**: `tools/wvo_mcp/src/utils/heartbeat.ts`

**Purpose**: Autopilot writes timestamp every 30s so supervisor can detect hangs

**Implementation**:
```typescript
export class HeartbeatWriter {
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private heartbeatPath: string,
    private intervalMs: number = 30000
  ) {}

  start(): void {
    this.interval = setInterval(() => {
      const timestamp = new Date().toISOString();
      fs.writeFileSync(this.heartbeatPath, timestamp, 'utf8');
    }, this.intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}
```

**Tests**: `tools/wvo_mcp/src/utils/heartbeat.test.ts`
- Writes timestamp on interval
- Stops cleanly
- Handles write errors gracefully

**Integration**: In `UnifiedOrchestrator.start()`, start heartbeat writer

### Task 2.2: Supervisor Script (1-1.5 hours)

**File**: `tools/wvo_mcp/scripts/supervise_autopilot.sh`

**Purpose**: Monitor autopilot, restart on crash, enforce limits

**Structure**:
```bash
#!/usr/bin/env bash
set -euo pipefail

# Configuration
MAX_CRASHES=6
BACKOFF_SECONDS=(1 2 4 8 16)
BACKOFF_RESET_RUNTIME=300  # 5 minutes
HEARTBEAT_TIMEOUT=90
MEMORY_LIMIT_MB=2048
NICE_LEVEL=5
FD_LIMIT=1024

# State
CRASH_COUNT=0
LAST_START_TIME=0

# Pre-flight checks
check_disk_space() {
  # Get disk usage percentage
  DISK_USAGE=$(df -h "$WORKSPACE" | tail -1 | awk '{print $5}' | sed 's/%//')

  if [ "$DISK_USAGE" -gt 90 ]; then
    echo "❌ Disk usage ${DISK_USAGE}% exceeds 90% threshold"
    exit 1
  fi
}

check_memory_available() {
  # Platform-specific memory check
  if [[ "$OSTYPE" == "darwin"* ]]; then
    FREE_MB=$(vm_stat | grep "Pages free" | awk '{print $3}' | sed 's/\.//')
    FREE_MB=$((FREE_MB * 4096 / 1024 / 1024))
  else
    FREE_MB=$(free -m | grep Mem | awk '{print $4}')
  fi

  if [ "$FREE_MB" -lt 500 ]; then
    echo "❌ Only ${FREE_MB}MB free memory (need 500MB minimum)"
    exit 1
  fi
}

# Health monitoring
check_heartbeat() {
  if [ ! -f "$HEARTBEAT_FILE" ]; then
    echo "⚠️  No heartbeat file (process starting up?)"
    return 0
  fi

  HEARTBEAT=$(cat "$HEARTBEAT_FILE")
  HEARTBEAT_AGE=$(($(date +%s) - $(date -j -f "%Y-%m-%dT%H:%M:%S" "${HEARTBEAT%.*}" +%s)))

  if [ "$HEARTBEAT_AGE" -gt "$HEARTBEAT_TIMEOUT" ]; then
    echo "❌ Heartbeat stale (${HEARTBEAT_AGE}s old, limit ${HEARTBEAT_TIMEOUT}s)"
    return 1
  fi

  return 0
}

# Restart logic
restart_with_backoff() {
  local exit_code=$1

  # Don't restart on clean shutdown (0, 143=SIGTERM)
  if [ "$exit_code" -eq 0 ] || [ "$exit_code" -eq 143 ]; then
    echo "✓ Clean shutdown, not restarting"
    return 1
  fi

  # Don't restart on fatal error (exit 100)
  if [ "$exit_code" -eq 100 ]; then
    echo "❌ Fatal error (exit 100), manual intervention required"
    return 1
  fi

  # Check if too many crashes
  if [ "$CRASH_COUNT" -ge "$MAX_CRASHES" ]; then
    echo "❌ Too many crashes ($CRASH_COUNT), giving up"
    return 1
  fi

  # Calculate backoff
  local backoff_index=$((CRASH_COUNT < ${#BACKOFF_SECONDS[@]} ? CRASH_COUNT : ${#BACKOFF_SECONDS[@]} - 1))
  local backoff=${BACKOFF_SECONDS[$backoff_index]}

  echo "⏳ Crash #$((CRASH_COUNT + 1)), waiting ${backoff}s before restart..."
  sleep "$backoff"

  CRASH_COUNT=$((CRASH_COUNT + 1))
  return 0
}

# Main loop
while true; do
  # Pre-flight checks
  check_disk_space
  check_memory_available

  # Reset crash counter if last run was successful (>5 min)
  CURRENT_TIME=$(date +%s)
  if [ "$LAST_START_TIME" -gt 0 ]; then
    RUNTIME=$((CURRENT_TIME - LAST_START_TIME))
    if [ "$RUNTIME" -gt "$BACKOFF_RESET_RUNTIME" ]; then
      echo "✓ Successful run (${RUNTIME}s), resetting crash counter"
      CRASH_COUNT=0
    fi
  fi

  LAST_START_TIME=$CURRENT_TIME

  # Start autopilot with resource limits
  echo "Starting autopilot..."

  ulimit -n "$FD_LIMIT"
  ulimit -v $((MEMORY_LIMIT_MB * 1024))  # Virtual memory in KB

  nice -n "$NICE_LEVEL" node \
    --max-old-space-size="$MEMORY_LIMIT_MB" \
    dist/src/orchestrator/autopilot_unified.js \
    "$@" &

  AUTOPILOT_PID=$!

  # Monitor heartbeat
  while kill -0 "$AUTOPILOT_PID" 2>/dev/null; do
    if ! check_heartbeat; then
      echo "❌ Heartbeat check failed, killing stuck process"
      kill -TERM "$AUTOPILOT_PID" 2>/dev/null || true
      sleep 10
      kill -KILL "$AUTOPILOT_PID" 2>/dev/null || true
      break
    fi
    sleep 60
  done

  # Wait for exit and capture code
  wait "$AUTOPILOT_PID" || EXIT_CODE=$?

  echo "Autopilot exited with code $EXIT_CODE"

  # Decide whether to restart
  if ! restart_with_backoff "$EXIT_CODE"; then
    break
  fi
done

echo "Supervisor exiting"
```

**Tests**: Manual smoke tests (chaos tests will verify)

**Integration**: Replace direct node execution in launch scripts

### Task 2.3: Update Launch Scripts (15 min)

**File**: `tools/wvo_mcp/scripts/autopilot_unified.sh`

**Change**: Call supervisor instead of node directly

```bash
# OLD:
# node dist/src/orchestrator/autopilot_unified.js

# NEW:
bash tools/wvo_mcp/scripts/supervise_autopilot.sh
```

## Phase 3: Resource Limits (1.5-2 hours)

### Task 3.1: Resource Monitor Utility (45 min)

**File**: `tools/wvo_mcp/src/utils/resource_monitor.ts`

**Purpose**: Monitor disk space, memory, CPU, process count

**Implementation**:
```typescript
export interface ResourceLimits {
  memory: {
    max_old_space_size_mb: number;
    ulimit_virtual_memory_kb: number;
  };
  disk: {
    min_free_percent: number;
    min_free_gb: number;
    check_interval_seconds: number;
    pause_threshold_percent: number;
    shutdown_threshold_percent: number;
  };
  processes: {
    max_children: number;
    check_interval_seconds: number;
  };
}

export class ResourceMonitor {
  private diskCheckInterval: NodeJS.Timeout | null = null;
  private processCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    private limits: ResourceLimits,
    private workspaceRoot: string
  ) {}

  start(): void {
    // Start disk space monitoring
    this.diskCheckInterval = setInterval(
      () => this.checkDiskSpace(),
      this.limits.disk.check_interval_seconds * 1000
    );

    // Start process count monitoring
    this.processCheckInterval = setInterval(
      () => this.checkProcessCount(),
      this.limits.processes.check_interval_seconds * 1000
    );
  }

  async checkDiskSpace(): Promise<void> {
    const { stdout } = await execAsync(`df -h "${this.workspaceRoot}"`);
    const lines = stdout.trim().split('\n');
    const dataLine = lines[1];
    const usagePercent = parseInt(dataLine.match(/(\d+)%/)?.[1] || '0');

    if (usagePercent >= this.limits.disk.shutdown_threshold_percent) {
      logError('Disk usage critical, shutting down', { usagePercent });
      process.exit(100);  // Fatal error, don't restart
    } else if (usagePercent >= this.limits.disk.pause_threshold_percent) {
      logWarning('Disk usage high, pausing operations', { usagePercent });
      // TODO: Pause task execution
    }
  }

  async checkProcessCount(): Promise<void> {
    const children = await getChildProcesses(process.pid);

    if (children.length > this.limits.processes.max_children) {
      logError('Too many child processes, killing excess', {
        count: children.length,
        limit: this.limits.processes.max_children
      });

      // Kill excess children (oldest first)
      const excess = children.slice(this.limits.processes.max_children);
      for (const child of excess) {
        killProcess(child.pid);
      }
    }
  }

  stop(): void {
    if (this.diskCheckInterval) {
      clearInterval(this.diskCheckInterval);
      this.diskCheckInterval = null;
    }

    if (this.processCheckInterval) {
      clearInterval(this.processCheckInterval);
      this.processCheckInterval = null;
    }
  }
}
```

**Tests**: `tools/wvo_mcp/src/utils/resource_monitor.test.ts`
- Detects high disk usage
- Counts child processes correctly
- Kills excess children

**Integration**: In `UnifiedOrchestrator.start()`, start resource monitor

### Task 3.2: Config File (15 min)

**File**: `tools/wvo_mcp/config/resource_limits.json`

**Content**: (from spec document)

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

### Task 3.3: Integrate into UnifiedOrchestrator (30 min)

**File**: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`

**Changes**:

```typescript
import { HeartbeatWriter } from '../utils/heartbeat.js';
import { ResourceMonitor } from '../utils/resource_monitor.js';
import resourceLimits from '../../config/resource_limits.json' assert { type: 'json' };

export class UnifiedOrchestrator {
  private heartbeat: HeartbeatWriter | null = null;
  private resourceMonitor: ResourceMonitor | null = null;

  async start(): Promise<void> {
    // ... existing PID lock code ...

    // Set process group (already implemented in Phase 1)
    try {
      process.setpgid(0, 0);
      logInfo('Set process group', { pid: process.pid, pgid: process.getpgid(0) });
    } catch (error) {
      logWarning('Failed to set process group', { error });
    }

    // Start heartbeat writer
    const heartbeatPath = path.join(this.config.workspaceRoot, 'state', 'heartbeat');
    this.heartbeat = new HeartbeatWriter(
      heartbeatPath,
      resourceLimits.supervisor.heartbeat_interval_seconds * 1000
    );
    this.heartbeat.start();
    logInfo('Started heartbeat writer', { path: heartbeatPath });

    // Start resource monitor
    this.resourceMonitor = new ResourceMonitor(resourceLimits, this.config.workspaceRoot);
    this.resourceMonitor.start();
    logInfo('Started resource monitor', { limits: resourceLimits });

    // ... rest of start() ...
  }

  async stop(): Promise<void> {
    // Stop heartbeat and resource monitor first
    this.heartbeat?.stop();
    this.resourceMonitor?.stop();

    // ... existing stop() code ...
  }
}
```

## Verification Tasks (1 hour)

### Task 4.1: Unit Tests (30 min)

Run existing test suite to ensure nothing broke:
```bash
npm test
```

Expected: All tests pass (including Phase 1 tests)

### Task 4.2: Build Verification (5 min)

```bash
npm run build
npm audit
```

Expected: 0 errors, 0 vulnerabilities

### Task 4.3: Manual Smoke Test (25 min)

**Test 1: Clean start/stop**
```bash
bash tools/wvo_mcp/scripts/supervise_autopilot.sh &
sleep 30
bash tools/wvo_mcp/scripts/kill_autopilot.sh
```

Expected: Starts cleanly, heartbeat written, clean shutdown, no restart

**Test 2: Crash recovery**
```bash
# Modify autopilot to crash after 10 seconds (throw exception)
bash tools/wvo_mcp/scripts/supervise_autopilot.sh &
# Wait 15 seconds, should see restart with 1s backoff
```

Expected: Supervisor detects crash, waits 1s, restarts

**Test 3: Stuck detection**
```bash
# Modify autopilot to enter infinite loop (stop heartbeat)
bash tools/wvo_mcp/scripts/supervise_autopilot.sh &
# Wait 90s, should see supervisor kill stuck process
```

Expected: Supervisor detects stale heartbeat, kills process, restarts

## Files to Create

**New files**:
1. `tools/wvo_mcp/src/utils/heartbeat.ts` (50 lines)
2. `tools/wvo_mcp/src/utils/heartbeat.test.ts` (100 lines)
3. `tools/wvo_mcp/src/utils/resource_monitor.ts` (150 lines)
4. `tools/wvo_mcp/src/utils/resource_monitor.test.ts` (200 lines)
5. `tools/wvo_mcp/scripts/supervise_autopilot.sh` (250 lines)
6. `tools/wvo_mcp/config/resource_limits.json` (50 lines)

**Total**: ~800 lines of new code

## Files to Modify

1. `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts` (+30 lines)
2. `tools/wvo_mcp/scripts/autopilot_unified.sh` (change node → supervisor call)

## Dependencies

**Phase 2 depends on**:
- Phase 1 (PID locking, process cleanup) ✅ DONE

**Phase 3 depends on**:
- Phase 2 (supervisor to enforce limits)

**Testing depends on**:
- Phases 2-3 complete

## Risk Mitigation

**Risk**: Supervisor script has bugs and crashes
- **Mitigation**: Keep supervisor as simple as possible (shell only)
- **Fallback**: Can still use direct node execution for debugging

**Risk**: Resource monitoring adds too much overhead
- **Mitigation**: Check intervals are conservative (60s, 300s)
- **Verification**: Monitor CPU/RAM during smoke test

**Risk**: Heartbeat file I/O fails and crashes autopilot
- **Mitigation**: Heartbeat writer catches all errors and logs warnings

**Risk**: Disk space check has race condition
- **Mitigation**: Check interval is 60s, gives time to react
- **Acceptance**: Can't prevent disk from filling externally

## Success Criteria

Implementation complete when:
1. All unit tests pass
2. Build succeeds with 0 errors
3. Manual smoke tests (3) all pass
4. Supervisor successfully restarts after crash
5. Supervisor successfully kills stuck process
6. Resource limits enforced (disk, memory, processes)
7. Heartbeat written every 30s
8. Clean shutdown doesn't trigger restart

## Timeline

**Phase 2**: 1.5-2 hours
- Heartbeat writer: 30 min
- Supervisor script: 1-1.5 hours

**Phase 3**: 1.5-2 hours
- Resource monitor: 45 min
- Config file: 15 min
- Integration: 30 min

**Verification**: 1 hour
- Unit tests: 30 min
- Build: 5 min
- Smoke tests: 25 min

**Total**: 3-4 hours

## Next Phase

After Phases 2-3 complete and verified:
- **Phase 4**: Chaos testing (memory leak, disk full, fork bomb, CPU spin)
- **Phase 5**: 24-hour stress test
- **Phase 6**: Documentation and PR

But for user's immediate need ("guarantee won't crash computer"), Phases 2-3 are sufficient.
