# Health Monitoring

Real-time monitoring and auto-remediation for autopilot system health.

---

## Overview

**System**: `AutopilotHealthMonitor` (OODA loop)
**Frequency**: Every 60 seconds (configurable)
**Auto-remediation**: Enabled by default
**Location**: `tools/wvo_mcp/src/orchestrator/autopilot_health_monitor.ts`

See [Autopilot Meta-Monitoring Implementation](/docs/AUTOPILOT_META_MONITORING_IMPLEMENTATION.md) for full details.

---

## OODA Loop

```
┌─────────────────────────────────────────┐
│   AutopilotHealthMonitor (OODA Loop)   │
├─────────────────────────────────────────┤
│                                         │
│  OBSERVE (every 1 min)                  │
│  ├─ Task states (pending/ready/done)    │
│  ├─ Queue depth & WIP utilization       │
│  ├─ Throughput (tasks/hour)             │
│  ├─ Stale task detection                │
│  └─ Dependency sync ratio               │
│                                         │
│  ORIENT (analyze metrics)               │
│  ├─ Detect stale tasks (>5 min)         │
│  ├─ Detect dependency desync (<80%)     │
│  ├─ Detect throughput degradation       │
│  └─ Detect WIP starvation               │
│                                         │
│  DECIDE (plan remediation)              │
│  ├─ Stale tasks → Recover               │
│  ├─ Dependency desync → Resync          │
│  ├─ Throughput drop → Alert only        │
│  └─ Safety check (all actions)          │
│                                         │
│  ACT (execute safe fixes)               │
│  ├─ Auto-recover stale tasks            │
│  ├─ Trigger dependency resync           │
│  ├─ Log warnings/alerts                 │
│  └─ Export health report                │
│                                         │
└─────────────────────────────────────────┘
```

---

## Monitored Metrics

### Task Metrics

- **Pending count**: Tasks waiting to start
- **Ready count**: Tasks ready (dependencies met)
- **In-progress count**: Tasks actively being worked on
- **Done count**: Completed tasks
- **Blocked count**: Tasks with external blockers

### System Metrics

- **Queue depth**: Tasks in execution queue
- **WIP utilization**: `in_progress / max_WIP`
- **Throughput**: Tasks completed per hour
- **Stale task count**: Tasks in `in_progress` >threshold
- **Dependency sync ratio**: `table_deps / yaml_deps`

### Agent Metrics

- **Busy agents**: Agents working on tasks
- **Idle agents**: Agents available for work
- **Total agents**: Agent pool size

---

## Anomaly Detection

### 1. Stale Tasks

**Definition**: Tasks in `in_progress` for >5 minutes (configurable)

**Severity**: Warning (>5 min) → Critical (>10 min)

**Cause**:
- Agent crashed
- Network interruption
- Process killed

**Auto-remediation**: ✅ Enabled
- Recover to `pending` status
- Trigger prefetch to fill queue

**Configuration**:
```bash
export WVO_AUTOPILOT_STALE_TASK_MINUTES=10
```

---

### 2. Dependency Desync

**Definition**: Sync ratio < 0.8 (or <0.5 for critical)

**Severity**: Warning (<80%) → Critical (<50%)

**Cause**:
- Roadmap YAML edited but not synced
- Database corruption
- Sync script failure

**Auto-remediation**: ❌ Disabled (alert only)
- Log warning
- Recommend manual `force_roadmap_sync.mjs`

**Check**:
```bash
node scripts/diagnose_dependency_sync.mjs
```

---

### 3. Throughput Degradation

**Definition**: Throughput < 50% of baseline

**Severity**: Warning (<75%) → Critical (<50%)

**Cause**: (Symptom, not root cause)
- Too many blocked tasks
- Complex tasks taking longer
- Agent pool undersized

**Auto-remediation**: ❌ Disabled (alert only)
- Log warning
- Investigate root cause

---

### 4. WIP Starvation

**Definition**: Idle agents + 0 ready tasks + pending tasks exist

**Severity**: Warning

**Cause**:
- All pending tasks dependency-blocked
- Dependency graph issue

**Auto-remediation**: ❌ Disabled (alert only)
- Alert to investigate dependencies
- May indicate circular dependencies or missing completions

---

### 5. Queue Empty

**Definition**: Queue empty but pending tasks exist

**Severity**: Info (expected when dependency-blocked)

**Auto-remediation**: ❌ Disabled (informational only)

---

## Health Report

**Location**: `state/analytics/autopilot_health_report.json`

**Exported**: On orchestrator shutdown + every hour

**Contents**:
```json
{
  "running": true,
  "lastCycle": 12,
  "metricsHistory": [
    {
      "timestamp": 1729645200000,
      "pendingCount": 28,
      "readyCount": 5,
      "inProgressCount": 2,
      "doneCount": 119,
      "blockedCount": 0,
      "queueDepth": 5,
      "wipUtilization": 0.67,
      "throughputLastHour": 12,
      "throughputLast5Min": 14.4,
      "staleTaskCount": 0,
      "maxStaleAgeMs": 0,
      "dependencySyncRatio": 1.0,
      "busyAgents": 2,
      "idleAgents": 1,
      "totalAgents": 3
    }
  ],
  "activeAnomalies": [],
  "recentRemediations": []
}
```

---

## Configuration

### Environment Variables

```bash
# Enable/disable auto-remediation (default: 1)
export WVO_AUTOPILOT_HEALTH_AUTO_REMEDIATE=1

# Monitoring interval in milliseconds (default: 60000 = 1 minute)
export WVO_AUTOPILOT_HEALTH_INTERVAL_MS=60000

# Stale task threshold in minutes (default: 10)
export WVO_AUTOPILOT_STALE_TASK_MINUTES=10
```

### Start with Health Monitoring

```bash
# Default (auto-remediation enabled, 1-minute monitoring)
make autopilot=3

# Custom configuration
export WVO_AUTOPILOT_HEALTH_AUTO_REMEDIATE=1
export WVO_AUTOPILOT_HEALTH_INTERVAL_MS=30000  # 30 seconds
export WVO_AUTOPILOT_STALE_TASK_MINUTES=5      # 5 minutes
make autopilot=3
```

---

## Monitoring Outputs

### Real-time Logs

**Stale recovery**:
```
[INFO] Periodic stale task recovery completed { recovered: 2 }
```

**Dependency sync warning**:
```
[WARN] Dependency sync may have failed - tasks have dependency metadata but no dependencies in table
```

**Anomaly detection**:
```
[WARN] Critical anomalies detected by health monitor { count: 1, types: ['stale_tasks'] }
```

**Remediation**:
```
[INFO] Remediation executed successfully { anomaly: 'stale_tasks', action: 'recover_stale_tasks', message: 'Recovered 2 stale task(s)' }
```

---

## Health Metrics Dashboard (Future)

**Planned**: Grafana dashboard showing:
- Task flow metrics
- Anomaly trends
- Remediation success rate
- System health score

**Current**: JSON reports in `state/analytics/`

---

## Manual Health Checks

### Check Dependency Sync

```bash
node scripts/diagnose_dependency_sync.mjs
```

**Output**:
```
Data Sources:
  YAML tasks with dependencies:     46 tasks (138 dependencies)
  Table tasks with dependencies:    46 tasks (138 dependencies)

Sync Ratio: 1.00 (table / yaml)
  ✓ Excellent sync (≥95%)
```

### Check Stale Tasks

```typescript
// Query database
const staleTasks = db.prepare(`
  SELECT id, status, updated_at
  FROM tasks
  WHERE status = 'in_progress'
    AND updated_at < datetime('now', '-10 minutes')
`).all();
```

### Force Dependency Resync

```bash
node scripts/force_roadmap_sync.mjs
```

---

## Performance Impact

### Resource Usage

- **CPU**: <1% average (only runs every 60 seconds)
- **Memory**: ~10KB (circular buffer, max 100 metrics)
- **Database**: Read-only queries (no write overhead)
- **Network**: None (local SQLite only)

### Monitoring Overhead

- **OODA cycle time**: 50-100ms (SQL queries + anomaly detection)
- **Frequency**: Every 60 seconds (configurable)
- **Impact on throughput**: None (runs asynchronously)

---

## Escalation

**When health monitor detects critical issues**:

1. **Log anomaly** in telemetry
2. **Alert in console** (WARN or ERROR level)
3. **Attempt auto-remediation** (if enabled and safe)
4. **Escalate to Director Dana** if auto-remediation fails
5. **Export health report** for post-mortem

---

## References

- [Autopilot Meta-Monitoring Implementation](/docs/AUTOPILOT_META_MONITORING_IMPLEMENTATION.md) - Full implementation details
- [AutopilotHealthMonitor Source](/tools/wvo_mcp/src/orchestrator/autopilot_health_monitor.ts) - TypeScript implementation
- [Dependency Sync Diagnostic](/scripts/diagnose_dependency_sync.mjs) - Diagnostic script

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
