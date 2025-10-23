# Resource Management & Dynamic Throttling

## Problem

When running multiple Claude agents with MCP servers, the system can become overwhelmed:
- Multiple Claude CLI processes (100%+ CPU each)
- Multiple Node.js MCP servers
- SQLite database contention
- Memory pressure
- WindowServer starvation → kernel panics

Your system: 8 cores, 16 GB RAM → can handle 3-5 agents comfortably, but 10+ causes crashes.

## Solution: Dynamic Throttling

The system now **automatically adjusts** based on real-time resource pressure.

### Throttle Levels

| Level | Name   | Max Agents | Batch Size | Delay | When                    |
|-------|--------|------------|------------|-------|-------------------------|
| 0     | Normal | 5          | 100        | 0ms   | < 70% memory, < 60% CPU |
| 1     | Light  | 3          | 50         | 500ms | < 80% memory, < 75% CPU |
| 2     | Medium | 2          | 25         | 1s    | < 90% memory, < 90% CPU |
| 3     | Heavy  | 1          | 10         | 2s    | Critical pressure       |

### How It Works

**1. Automatic Detection**

Every 30 seconds, the system checks:
- Memory usage (free memory %)
- CPU load (% busy)
- Claude process count
- Node.js process count

**2. Dynamic Adjustment**

If resources are constrained:
- Reduces active agents
- Increases delays between operations
- Lowers batch sizes
- Uses lighter reasoning models

**3. Graceful Recovery**

When resources free up:
- Gradually increases agents
- Removes delays
- Returns to full capacity

## Usage

### Autopilot (automatic)

```bash
# Autopilot automatically throttles
make autopilot AGENTS=5

# System detects pressure and may reduce to 2-3 agents
# Logs show: "⚡ Resource pressure detected: medium throttle (level 2)"
```

### Manual Override

```bash
# Disable throttling (not recommended)
WVO_DISABLE_THROTTLE=1 make autopilot AGENTS=5

# Check current resource status
bash tools/wvo_mcp/scripts/dynamic_throttle.sh
```

### TypeScript API

```typescript
import { ResourceMonitor } from "./utils/resource_monitor";

const monitor = new ResourceMonitor(workspaceRoot);

// Get current metrics
const metrics = await monitor.getMetrics();
console.log(`Throttle level: ${metrics.throttle_level}`);

// Check if under pressure
if (await monitor.isUnderPressure()) {
  // System is struggling
  const recommended = await monitor.getRecommendedAgentCount();
  console.log(`Reduce to ${recommended} agents`);
}

// Apply throttle delay
await monitor.applyThrottle(); // Waits 0-2s based on pressure

// Wait for resources to free up
const ok = await monitor.waitForResources(60000, 1); // Wait up to 60s for level ≤ 1
if (ok) {
  // Can proceed with heavy operation
}
```

## Monitoring

### Check Current Status

```bash
# View resource metrics
cat state/analytics/resource_metrics.json
```

Example output:
```json
{
  "timestamp": "2025-10-23T16:30:00Z",
  "memory_used_pct": 85,
  "cpu_used_pct": 72,
  "claude_processes": 3,
  "node_processes": 3,
  "throttle_level": 2,
  "throttle_params": {
    "level": 2,
    "name": "medium",
    "max_agents": 2,
    "batch_size": 25,
    "delay_ms": 1000,
    "max_concurrent": 1,
    "reasoning_effort": "medium"
  }
}
```

### Dashboard (future)

A real-time dashboard showing:
- Current throttle level
- Resource trends (memory/CPU over time)
- Active agents
- Recommendations

## Best Practices

### Do:
- ✅ Let the system auto-throttle
- ✅ Start with AGENTS=5, let it adjust down
- ✅ Monitor `state/analytics/resource_metrics.json`
- ✅ Run multiple Claude agents (that's the point!)

### Don't:
- ❌ Disable throttling on resource-constrained systems
- ❌ Force high agent counts (>10) without monitoring
- ❌ Run multiple autopilot sessions simultaneously (use one with more agents)
- ❌ Ignore warnings about resource pressure

## Troubleshooting

### System still crashes

If crashes persist despite throttling:

1. **Lower the base agent count:**
   ```bash
   make autopilot AGENTS=3  # Start conservative
   ```

2. **Check for other heavy processes:**
   ```bash
   ps aux | sort -nrk 3,3 | head -10  # Top CPU
   ps aux | sort -nrk 4,4 | head -10  # Top memory
   ```

3. **Increase swap space** (macOS):
   - Close other applications
   - Restart to clear memory

4. **Adjust thresholds** (advanced):
   Edit `tools/wvo_mcp/scripts/dynamic_throttle.sh`:
   ```bash
   MEMORY_HIGH_PCT=70     # Lower from 80
   CPU_HIGH_PCT=60        # Lower from 75
   ```

### Throttling too aggressive

If the system throttles too much:

```bash
# Check what's triggering it
bash tools/wvo_mcp/scripts/dynamic_throttle.sh

# If false positives, adjust thresholds
```

## Architecture

### Components

1. **dynamic_throttle.sh** - Bash script that samples resources
2. **ResourceMonitor** (TS) - TypeScript wrapper with caching
3. **autopilot_unified.sh** - Integrated check before starting
4. **UnifiedOrchestrator** - Uses ResourceMonitor during operation

### Integration Points

- **Startup**: Autopilot checks resources before launching
- **Runtime**: Orchestrator periodically checks (every 30s)
- **Task Assignment**: Applies throttle delays between tasks
- **Agent Spawn**: Respects max_agents limit

## Future Enhancements

1. **Predictive Throttling** - Learn patterns, throttle preemptively
2. **Per-task Resource Estimation** - Know which tasks are heavy
3. **Smart Scheduling** - Run heavy tasks during low-load periods
4. **Cloud Overflow** - Offload to remote agents when local resources exhausted
5. **Resource Reservations** - Guarantee resources for critical operations

## Related

- `docs/orchestration/ORCHESTRATOR_EVOLUTION_SPEC.md` - Orchestrator design
- `tools/wvo_mcp/scripts/resource_guard.sh` - Pre-flight resource check
- `state/analytics/resource_metrics.json` - Current metrics
