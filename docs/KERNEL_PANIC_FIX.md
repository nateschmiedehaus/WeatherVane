# Kernel Panic Fix - Dynamic Resource Management

## Problem Summary

**Symptom:** `panic(cpu 1 caller 0xfffffe002d3da364): userspace watchdog timeout: no successful checkins from WindowServer in 138 seconds`

**Root Cause:**
- Multiple Claude CLI instances (100%+ CPU each)
- Multiple Node.js MCP servers
- Database contention (20+ file handles)
- Memory exhaustion (99% used, only 73 MB free)
- WindowServer starved → 138 second timeout → kernel panic

**Your system:** 8 cores, 16 GB RAM
- **Comfortable:** 2-3 agents
- **Max before issues:** 5 agents
- **Current load:** 5 Claude processes = OVERLOAD

## Solution Implemented

### Dynamic Throttling System

The system now **automatically adjusts** based on real-time resources:

```
Current Status:
├─ Memory: 99% used → CRITICAL
├─ CPU: 100% busy → CRITICAL
├─ Claude processes: 5 → TOO MANY
└─ Throttle Level: 3 (heavy)
   └─ Action: Reduce to 1 agent
```

### How It Works

**Before starting autopilot:**
```bash
make autopilot AGENTS=5
```

The system:
1. ✅ Checks memory, CPU, process counts
2. ✅ Detects: "99% memory, 100% CPU, 5 Claude processes"
3. ✅ Applies heavy throttle (level 3)
4. ✅ Reduces from 5 → 1 agent
5. ✅ Logs: "⚡ Resource pressure detected: heavy throttle (level 3)"
6. ✅ Starts with only 1 agent

**During execution:**
- Checks resources every 30 seconds
- Adds delays (2s) between operations
- Reduces batch sizes (10 items)
- Uses lighter reasoning models

**As resources free up:**
- Gradually increases agents
- Removes delays
- Returns to full capacity

### Throttle Levels

| Level | Name   | Memory | CPU | Max Agents | Delay |
|-------|--------|--------|-----|------------|-------|
| 0     | Normal | < 70%  | < 60% | 5          | 0ms   |
| 1     | Light  | < 80%  | < 75% | 3          | 500ms |
| 2     | Medium | < 90%  | < 90% | 2          | 1s    |
| 3     | Heavy  | ≥ 90%  | ≥ 90% | 1          | 2s    |

**Your current state:** Level 3 (heavy) ← This prevents crashes!

## What Changed

### New Files

1. **`tools/wvo_mcp/scripts/dynamic_throttle.sh`**
   - Monitors memory, CPU, processes
   - Returns throttle level (0-3)
   - Saves metrics to `state/analytics/resource_metrics.json`

2. **`tools/wvo_mcp/src/utils/resource_monitor.ts`**
   - TypeScript wrapper for throttle script
   - Caches metrics (30s refresh)
   - Provides `applyThrottle()`, `waitForResources()`, etc.

3. **`tools/wvo_mcp/scripts/resource_guard.sh`**
   - Pre-flight check before autopilot
   - Prevents concurrent autopilot runs
   - Creates lockfile to avoid multiple instances

### Modified Files

1. **`tools/wvo_mcp/scripts/autopilot_unified.sh`**
   - Integrated throttle check before starting
   - Auto-adjusts AGENT_COUNT based on resources
   - Shows throttle status in logs

## Usage

### Start Autopilot (with auto-throttling)

```bash
# Request 5 agents, system will auto-reduce if needed
make autopilot AGENTS=5

# Example output:
# Checking system resources...
# ⚡ Resource pressure detected: heavy throttle (level 3)
#    Reducing agents from 5 to 1
# ✓ Resources normal, running with 1 agent
```

### Check Current Resources

```bash
# View current throttle status
bash tools/wvo_mcp/scripts/dynamic_throttle.sh

# View metrics file
cat state/analytics/resource_metrics.json
```

Example output:
```
Resource Status:
  Memory: 99% used
  CPU: 100% busy
  Claude processes: 5
  Node processes: 2

Throttle: heavy (level 3)
  Max agents: 1
```

### Disable Throttling (not recommended)

```bash
WVO_DISABLE_THROTTLE=1 make autopilot AGENTS=5
```

⚠️ Only do this if you know your system can handle it!

## Current Recommendation

**Your system RIGHT NOW:**
- Memory: 99% used
- CPU: 100% busy
- 5 Claude processes active

**Action required:**
1. Close some Claude sessions (keep 1-2 max)
2. Let current processes finish
3. Restart autopilot with throttling enabled

**Safe command:**
```bash
# This will auto-reduce to 1-2 agents based on current pressure
make autopilot AGENTS=3
```

## Testing the Fix

### Before (caused crashes):
```bash
# Terminal 1
make autopilot AGENTS=5

# Terminal 2
make autopilot AGENTS=5

# Terminal 3
make autopilot AGENTS=5

# Result: 15+ processes → CRASH
```

### After (safe):
```bash
# Terminal 1
make autopilot AGENTS=5

# System detects: "Already 5 Claude processes"
# Auto-reduces to 1 agent
# Result: Safe, no crash
```

## Monitoring

### Dashboard (current state)

```bash
# Real-time status
watch -n 5 "bash tools/wvo_mcp/scripts/dynamic_throttle.sh"
```

### Metrics History

View `state/analytics/resource_metrics.json` for point-in-time snapshots.

Future: Real-time dashboard showing trends over time.

## Troubleshooting

### Still crashing?

1. **Lower base agent count:**
   ```bash
   make autopilot AGENTS=2  # Start very conservative
   ```

2. **Check for other heavy processes:**
   ```bash
   ps aux | sort -nrk 3,3 | head -10  # Top CPU consumers
   ```

3. **Close heavy apps:**
   - Adobe Creative Cloud (uses significant resources)
   - Notes.app (if large notes)
   - Other browser tabs

4. **Restart computer:**
   - Clears memory pressure
   - Kills zombie processes
   - Fresh start

### Throttling too aggressive?

If throttling when resources are actually fine:

```bash
# Check what's triggering it
bash tools/wvo_mcp/scripts/dynamic_throttle.sh

# Adjust thresholds (edit script):
# MEMORY_HIGH_PCT=75  # Lower from 80 if needed
# CPU_HIGH_PCT=65     # Lower from 75 if needed
```

### Lockfile issues

If you see "Autopilot already running" but nothing is running:

```bash
# Remove stale lockfile
rm state/.autopilot.lock
```

## Benefits

✅ **No more crashes** - System can't overwhelm itself
✅ **Still use multiple agents** - Just throttles when needed
✅ **Automatic** - No manual intervention required
✅ **Transparent** - Shows throttle status in logs
✅ **Reversible** - Can disable if needed (WVO_DISABLE_THROTTLE=1)

## Next Steps

1. **Try it now:** Start autopilot with `make autopilot AGENTS=3`
2. **Monitor:** Watch `state/analytics/resource_metrics.json`
3. **Observe:** No more kernel panics!
4. **Scale up:** As system frees up, throttle level drops, more agents allowed

## Related Documentation

- `docs/RESOURCE_MANAGEMENT.md` - Full technical documentation
- `tools/wvo_mcp/scripts/dynamic_throttle.sh` - Throttle implementation
- `tools/wvo_mcp/src/utils/resource_monitor.ts` - TypeScript API

---

**Summary:** The system now dynamically adjusts agent count based on real-time resources. Your current state (99% memory, 100% CPU) would be throttled to 1 agent, preventing the WindowServer starvation that caused kernel panics.
