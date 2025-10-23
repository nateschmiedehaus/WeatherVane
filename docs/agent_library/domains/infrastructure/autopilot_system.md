# Autopilot System

**Autonomous task execution with health monitoring and auto-remediation.**

---

## Quick Reference

**Primary Documentation**: `/docs/AUTOPILOT_META_MONITORING_IMPLEMENTATION.md`

**Purpose**: Continuous autonomous execution with self-healing capabilities

---

## System Components

### 1. Unified Orchestrator

**Location**: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`

**Responsibilities**:
- Task scheduling (WSJF: Weighted Shortest Job First)
- WIP management (work-in-progress limits)
- Agent pool coordination
- Prefetch queue management

**Configuration**:
```bash
export WVO_AUTOPILOT_AGENTS=3        # Agent pool size
export WVO_AUTOPILOT_WIP_LIMIT=3     # Max concurrent tasks
export WVO_AUTOPILOT_MAX_ITERATIONS=100  # Safety limit
```

---

### 2. Health Monitor (OODA Loop)

**Location**: `tools/wvo_mcp/src/orchestrator/autopilot_health_monitor.ts`

**OODA Loop**:
```
OBSERVE (every 60s)
├─ Task states
├─ Queue depth
├─ Throughput
├─ Stale tasks
└─ Dependency sync

ORIENT (analyze)
├─ Detect stale tasks
├─ Detect dependency desync
├─ Detect throughput degradation
└─ Detect WIP starvation

DECIDE (plan remediation)
├─ Stale tasks → Recover
├─ Dependency desync → Alert
├─ Throughput drop → Investigate
└─ Safety check

ACT (execute)
├─ Auto-recover stale tasks
├─ Log warnings
└─ Export health report
```

**Configuration**:
```bash
export WVO_AUTOPILOT_HEALTH_AUTO_REMEDIATE=1  # Enable auto-fix
export WVO_AUTOPILOT_HEALTH_INTERVAL_MS=60000 # Check every 60s
export WVO_AUTOPILOT_STALE_TASK_MINUTES=10    # Stale threshold
```

---

### 3. Task Scheduler

**Algorithm**: WSJF (Weighted Shortest Job First)

**Formula**:
```
Score = (Business Value + Time Criticality) / Complexity

Where:
- Business Value: Based on priority (high=10, medium=5, low=1)
- Time Criticality: Based on milestone proximity
- Complexity: Task complexity (1-10)
```

**Example**:
```
Task A: priority=high (10), milestone=M1 (near, 5), complexity=3
Score = (10 + 5) / 3 = 5.0

Task B: priority=medium (5), milestone=M2 (far, 1), complexity=2
Score = (5 + 1) / 2 = 3.0

Result: Schedule Task A first (higher score)
```

---

### 4. Stale Task Recovery

**Problem**: Tasks stuck in `in_progress` (agent crashed, network issue)

**Detection**: Task in `in_progress` for >10 minutes (configurable)

**Auto-remediation**:
```typescript
// Runs every 5 minutes
async recoverStaleInProgressTasks(): Promise<number> {
  const threshold = 10 * 60 * 1000; // 10 minutes

  const staleTasks = await this.stateMachine.getTasks({
    status: ['in_progress'],
    stale_threshold_ms: threshold
  });

  for (const task of staleTasks) {
    await this.stateMachine.updateTask(task.id, { status: 'pending' });
    logInfo('Recovered stale task', { task_id: task.id });
  }

  return staleTasks.length;
}
```

**Trigger**: Automatically triggers prefetch to fill queue

---

## Autopilot Workflow

### Startup

```
1. Initialize orchestrator
   ├─ Load configuration
   ├─ Connect to database
   └─ Sync roadmap from YAML

2. Start health monitor
   └─ Begin OODA loop (every 60s)

3. Start stale recovery timer
   └─ Check for stale tasks (every 5 min)

4. Prefetch tasks
   ├─ Find ready tasks (dependencies met)
   ├─ Score with WSJF
   └─ Fill queue (target: 10-20 tasks)

5. Start agent pool
   ├─ Spawn N agents (configured count)
   └─ Assign tasks from queue
```

---

### Execution Loop

```
While (iterations < max AND pending tasks exist):

  1. Prefetch tasks (if queue low)
     └─ Keep queue depth at 10-20

  2. Assign tasks to idle agents
     ├─ Check WIP limit (default: 3)
     ├─ Match agent capability to task complexity
     └─ Update task status to in_progress

  3. Monitor task execution
     ├─ Check for completion
     ├─ Check for blockers
     └─ Check for stale tasks

  4. Handle task completion
     ├─ Update status to done
     ├─ Trigger dependent tasks
     └─ Run critics (if configured)

  5. Health check (every 60s)
     └─ OODA loop runs in background
```

---

### Shutdown

```
1. Stop accepting new tasks

2. Wait for in-progress tasks
   └─ Timeout: 5 minutes

3. Export health report
   └─ state/analytics/autopilot_health_report.json

4. Stop health monitor

5. Stop stale recovery timer

6. Close database connections
```

---

## Metrics & Monitoring

### Key Metrics

**Throughput**: Tasks completed per hour
- Target: 5-10 tasks/hour (varies by complexity)

**WIP Utilization**: `in_progress_count / wip_limit`
- Target: 80-100%

**Queue Depth**: Tasks ready in queue
- Target: 10-20 tasks

**Stale Task Rate**: `stale_tasks / total_tasks`
- Target: <1%

**Dependency Sync Ratio**: `table_deps / yaml_deps`
- Target: 95-100%

---

### Health Report

**Location**: `state/analytics/autopilot_health_report.json`

**Exported**: On shutdown + every hour

**Contents**:
```json
{
  "running": true,
  "lastCycle": 42,
  "metricsHistory": [
    {
      "timestamp": 1729645200000,
      "pendingCount": 28,
      "readyCount": 5,
      "inProgressCount": 2,
      "doneCount": 119,
      "queueDepth": 5,
      "wipUtilization": 0.67,
      "throughputLastHour": 12,
      "staleTaskCount": 0,
      "dependencySyncRatio": 1.0
    }
  ],
  "activeAnomalies": [],
  "recentRemediations": [
    {
      "timestamp": 1729645100000,
      "anomaly": "stale_tasks",
      "action": "recover_stale_tasks",
      "result": "success",
      "message": "Recovered 2 stale task(s)"
    }
  ]
}
```

---

## Safety Guardrails

### Iteration Limit

**Purpose**: Prevent infinite loops

**Default**: 100 iterations

**Override**: `export WVO_AUTOPILOT_MAX_ITERATIONS=200`

**Trigger**: Stops autopilot after N iterations

---

### WIP Limit

**Purpose**: Prevent agent overload

**Default**: 3 concurrent tasks

**Override**: `export WVO_AUTOPILOT_WIP_LIMIT=5`

**Effect**: Max tasks in `in_progress` at once

---

### Stale Task Recovery

**Purpose**: Recover from agent crashes

**Threshold**: 10 minutes

**Override**: `export WVO_AUTOPILOT_STALE_TASK_MINUTES=5`

**Safety**: Only resets to `pending` (doesn't delete or modify)

---

## Troubleshooting

### Autopilot Stalled

**Symptoms**: No tasks completing, queue empty but pending tasks exist

**Diagnosis**:
```bash
# Check dependency sync
node scripts/diagnose_dependency_sync.mjs

# Check for circular dependencies
# (manual inspection of state/roadmap.yaml)
```

**Fix**:
```bash
# Resync dependencies
node scripts/force_roadmap_sync.mjs

# Restart autopilot
```

---

### High Stale Task Rate

**Symptoms**: Many tasks being recovered (>5% of total)

**Causes**:
- Agent pool unstable
- Network issues
- Provider API failures

**Fix**:
- Check provider status
- Review logs for errors
- Reduce agent pool size temporarily

---

### Low Throughput

**Symptoms**: <3 tasks/hour (expected: 5-10)

**Causes**:
- Complex tasks taking longer
- Too many blocked tasks
- Agent pool undersized

**Diagnosis**:
```bash
# Check task complexity distribution
sqlite3 state/state.db "SELECT AVG(complexity) FROM tasks WHERE status = 'in_progress'"

# Check blocked task count
sqlite3 state/state.db "SELECT COUNT(*) FROM tasks WHERE status = 'blocked'"
```

**Fix**:
- Increase agent pool size
- Unblock stuck tasks
- Break complex tasks into subtasks

---

## Key Documents

- [Autopilot Meta-Monitoring Implementation](/docs/AUTOPILOT_META_MONITORING_IMPLEMENTATION.md)
- [Autopilot Health Monitor Source](/tools/wvo_mcp/src/orchestrator/autopilot_health_monitor.ts)
- [Unified Orchestrator Source](/tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts)
- [Health Monitoring Process](/docs/agent_library/common/processes/health_monitoring.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
