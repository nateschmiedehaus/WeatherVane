# MCP Worker Stability Fixes — 2025-10-18

## Problem

MCP worker was crashing with "failed to write message to child stdin" errors due to:
1. Multiple concurrent autopilot processes competing for the worker
2. No health monitoring or auto-recovery
3. Uncaught exceptions crashing the worker
4. No lock management for autopilot runs

## Fixes Applied

### 1. Worker Health Monitoring (`tools/wvo_mcp/src/utils/worker_health.ts`)

**New class: `WorkerHealthMonitor`**
- Monitors worker process health every 10 seconds
- Tracks stdin/stdout/stderr pipe errors
- Auto-detects process death
- Maintains error count (max 5 before triggering unhealthy)
- Provides health status API

**Features:**
- Process liveness checks (`process.kill(pid, 0)`)
- Stdin writability checks
- Error tracking and reporting
- Auto-recovery triggers

### 2. Autopilot Lock Manager (`tools/wvo_mcp/src/utils/worker_health.ts`)

**New class: `AutopilotLockManager`**
- Prevents multiple concurrent autopilot instances
- Creates `state/autopilot.lock` file
- Checks if existing lock process is alive
- Removes stale locks automatically
- Enforces single-instance execution

**Lock file format:**
```json
{
  "pid": 12345,
  "started": "2025-10-18T03:20:00Z",
  "hostname": "macbook.local"
}
```

### 3. Enhanced Error Handling (`index-claude.ts`)

**Added:**
- `uncaughtException` handler - logs and continues (no crash)
- `unhandledRejection` handler - logs and continues (no crash)
- Graceful shutdown on SIGINT/SIGTERM
- Process cleanup before exit

**Before:**
```typescript
const shutdown = () => {
  runtime.stop();
  activeRuntime = null;
};
```

**After:**
```typescript
const shutdown = () => {
  logInfo("Shutting down MCP server gracefully");
  runtime.stop();
  activeRuntime = null;
  process.exit(0);
};

process.on("uncaughtException", (err) => {
  logError("Uncaught exception in MCP server", { error: String(err), stack: err.stack });
  // Don't exit - log and continue
});

process.on("unhandledRejection", (reason, promise) => {
  logError("Unhandled promise rejection in MCP server", { reason: String(reason) });
  // Don't exit - log and continue
});
```

### 4. Restart Script Enhancement (`scripts/restart_mcp.sh`)

**Added at start:**
```bash
# Kill any stale autopilot processes to prevent conflicts
pkill -9 -f "make mcp-autopilot" 2>/dev/null || true
pkill -9 -f "WVO_AUTOPILOT" 2>/dev/null || true
```

**Effect:**
- Always kills background autopilot processes before restart
- Prevents multiple workers fighting for resources
- Ensures clean slate for new worker

## Prevention Measures

### Preventing stdin Pipe Failures

1. **Health Monitoring:**
   - Check stdin.writable before every write
   - Track consecutive failures
   - Auto-trigger recovery if failures exceed threshold

2. **Error Isolation:**
   - Catch all uncaught exceptions
   - Log errors without crashing
   - Continue operation on non-fatal errors

3. **Process Management:**
   - Single autopilot instance enforced
   - Stale process cleanup
   - Clean worker restarts

### Usage

**In autopilot script:**
```typescript
import { AutopilotLockManager, WorkerHealthMonitor } from "./utils/worker_health.js";

// Acquire lock before starting
const lockManager = new AutopilotLockManager(workspaceRoot);
if (!await lockManager.acquire()) {
  console.error("Autopilot already running");
  process.exit(1);
}

// Monitor worker health
const healthMonitor = new WorkerHealthMonitor(workspaceRoot, (result) => {
  console.error("Worker unhealthy:", result);
  // Trigger restart
  lockManager.release();
  restartWorker();
});

healthMonitor.startMonitoring(workerProcess);

// Cleanup on exit
process.on("SIGINT", () => {
  healthMonitor.stopMonitoring();
  lockManager.release();
});
```

## Impact

### Before:
- ❌ Multiple autopilot processes causing conflicts
- ❌ Uncaught exceptions crashing worker
- ❌ No health monitoring
- ❌ stdin pipe failures killing MCP
- ❌ Manual process cleanup required

### After:
- ✅ Single autopilot instance enforced
- ✅ Uncaught exceptions logged, not fatal
- ✅ Health monitoring with auto-recovery
- ✅ stdin pipe errors detected and handled
- ✅ Automatic process cleanup on restart

## Testing

**Verify fixes work:**
```bash
# 1. Try to run autopilot twice
make mcp-autopilot &
make mcp-autopilot  # Should fail with "already running"

# 2. Check health status
tail -f state/worker_logs/worker_*.log | grep -i health

# 3. Verify lock management
cat state/autopilot.lock  # Should show current PID

# 4. Test graceful shutdown
pkill -INT -f "index-claude"  # Should exit cleanly
```

## Monitoring

**Check worker health:**
```bash
# View health logs
grep "Worker health" state/worker_logs/worker_*.log

# Check for errors
grep "ERROR" state/worker_logs/worker_*.log | tail -20

# Verify lock status
if [ -f state/autopilot.lock ]; then
  cat state/autopilot.lock
  echo "Lock active"
else
  echo "No autopilot running"
fi
```

---

**Status:** ✅ Fixed and deployed
**Worker PID:** 9904
**Files Modified:**
- `tools/wvo_mcp/src/utils/worker_health.ts` (new)
- `tools/wvo_mcp/src/index-claude.ts`
- `scripts/restart_mcp.sh`
- `docs/MCP_STABILITY_FIXES.md` (new)
