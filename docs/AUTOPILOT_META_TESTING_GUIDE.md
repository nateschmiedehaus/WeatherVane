# Autopilot Meta-Testing Guide

**Purpose**: Comprehensive framework for testing, diagnosing, and monitoring the autopilot system. This guide enables systematic detection of anomalies, inefficiencies, and potential problems.

**Referenced in**: `claude.md` → "Testing & Validation" section

---

## Table of Contents

1. [Quick Health Check](#quick-health-check)
2. [Systematic Testing Procedures](#systematic-testing-procedures)
3. [Known Issue Patterns](#known-issue-patterns)
4. [Anomaly Detection Framework](#anomaly-detection-framework)
5. [Test Scenarios](#test-scenarios)
6. [Diagnostic Tools](#diagnostic-tools)
7. [Monitoring & Alerts](#monitoring--alerts)

---

## Quick Health Check

Before starting any autopilot run, execute this 60-second health check:

```bash
# 1. Check database integrity
./scripts/autopilot_health_check.sh quick

# 2. Verify task states
node debug_tasks.mjs

# 3. Check for stale tasks
sqlite3 state/orchestrator.db "
  SELECT id, status, assigned_to,
    (julianday('now') - julianday(started_at/1000, 'unixepoch')) * 24 * 60 as age_minutes
  FROM tasks
  WHERE status = 'in_progress' AND assigned_to IS NULL OR assigned_to = '';
"

# 4. Verify dependency sync
sqlite3 state/orchestrator.db "
  SELECT
    (SELECT COUNT(*) FROM tasks WHERE metadata LIKE '%dependencies%') as tasks_with_deps,
    (SELECT COUNT(*) FROM task_dependencies) as deps_in_table;
"
```

### Expected Results

✅ **HEALTHY:**
- No stale in-progress tasks
- Dependencies synced (ratio ~1:1)
- 20+ ready tasks available
- No recent crash logs

❌ **UNHEALTHY:**
- Stale in-progress tasks (age > 5 minutes)
- Dependency sync ratio < 0.5
- 0 ready tasks despite pending tasks
- Autopilot repeating same tasks

---

## Systematic Testing Procedures

### Level 1: Unit Testing (Components)

Test individual autopilot components in isolation:

```bash
# Test state machine
npm test -- state_machine.test.ts

# Test priority scheduler
npm test -- priority_scheduler.test.ts

# Test agent pool
npm test -- agent_pool.test.ts

# Test roadmap tracker
npm test -- roadmap_tracker.test.ts
```

### Level 2: Integration Testing (Workflows)

Test autopilot workflows end-to-end:

```bash
# Test single task execution
./scripts/test_single_task.sh T9.2.2

# Test task prefetch logic
npm test -- unified_orchestrator.test.ts -t "prefetch"

# Test dependency resolution
npm test -- state_machine.test.ts -t "isTaskReady"

# Test WIP limits
npm test -- unified_orchestrator.test.ts -t "WIP"
```

### Level 3: System Testing (Full Autopilot)

Test complete autopilot run:

```bash
# Dry run (no actual execution)
WVO_DRY_RUN=1 WVO_AUTOPILOT_ONCE=1 make autopilot=3

# Single iteration (real execution)
WVO_AUTOPILOT_ONCE=1 MAX_ITERATIONS=1 make autopilot=3

# Full run with monitoring
./scripts/monitor_autopilot.sh &
make autopilot=3
```

### Level 4: Meta Testing (Self-Reflection)

Test autopilot's ability to detect its own issues:

```bash
# Run meta-testing suite
npm test -- autopilot_meta.test.ts

# Check for circular dependencies
node scripts/detect_circular_deps.mjs

# Verify task decomposition doesn't create loops
npm test -- task_decomposer.test.ts -t "circuit_breaker"

# Test recovery from failures
npm test -- resilience_manager.test.ts
```

---

## Known Issue Patterns

### Pattern 1: Stale In-Progress Tasks

**Symptoms:**
- Tasks stuck in `in_progress` with no assigned agent
- WIP limit preventing new tasks from being fetched
- Autopilot says "no tasks available" despite pending tasks

**Root Causes:**
1. Agent crash during task execution
2. Network interruption
3. Process killed without cleanup
4. Database lock preventing status update

**Diagnosis:**
```bash
# Find stale tasks
sqlite3 state/orchestrator.db "
  SELECT id, title, assigned_to, started_at,
    (julianday('now') - julianday(started_at/1000, 'unixepoch')) * 24 * 60 as age_minutes
  FROM tasks
  WHERE status = 'in_progress'
  ORDER BY age_minutes DESC;
"
```

**Fix:**
```bash
# Automatic recovery (built into orchestrator)
# Triggered on startup and every 5 minutes

# Manual recovery
sqlite3 state/orchestrator.db "
  UPDATE tasks
  SET status = 'pending', assigned_to = NULL, started_at = NULL
  WHERE status = 'in_progress'
    AND (assigned_to IS NULL OR assigned_to = '')
    AND (julianday('now') - julianday(started_at/1000, 'unixepoch')) * 24 * 60 > 5;
"
```

**Prevention:**
- Stale task recovery runs automatically every 5 minutes
- Agent pool tracks reservations
- Graceful shutdown handlers clear assignments

---

### Pattern 2: Dependency Sync Mismatch

**Symptoms:**
- Tasks show dependencies in JSON metadata but not in `task_dependencies` table
- `isTaskReady()` returns true for tasks that should be blocked
- Tasks execute out of order

**Root Causes:**
1. Roadmap YAML not synced to database
2. Manual task creation bypasses dependency sync
3. Database migration missing

**Diagnosis:**
```bash
# Check sync ratio
sqlite3 state/orchestrator.db "
  SELECT
    COUNT(*) as tasks_with_metadata_deps
  FROM tasks
  WHERE metadata LIKE '%\"dependencies\":[%'
    AND metadata NOT LIKE '%\"dependencies\":[]%';
" && echo "vs" && sqlite3 state/orchestrator.db "
  SELECT COUNT(DISTINCT task_id) as tasks_with_table_deps
  FROM task_dependencies;
"
```

**Fix:**
```bash
# Force roadmap resync
node scripts/force_roadmap_sync.mjs

# Verify sync
node debug_tasks.mjs | grep -A 20 "DEPENDENCY"
```

**Prevention:**
- Roadmap poller syncs every 30 seconds
- Manual task creation should use `stateMachine.addDependency()`
- Database schema tests verify foreign keys

---

### Pattern 3: WIP Limit Starvation

**Symptoms:**
- Autopilot says "WIP limit reached" but few tasks are actually running
- Queue remains empty despite ready tasks
- Throughput drops to zero

**Root Causes:**
1. WIP limit calculation includes stale tasks
2. `filterAutopilotInProgressTasks()` counting wrong tasks
3. Agent pool reservation leak

**Diagnosis:**
```bash
# Check WIP calculation
sqlite3 state/orchestrator.db "
  SELECT
    (SELECT COUNT(*) FROM tasks WHERE status = 'in_progress') as total_in_progress,
    (SELECT COUNT(*) FROM tasks WHERE status = 'in_progress' AND assigned_to IS NOT NULL) as assigned_in_progress;
"

# Check agent pool state
# (Look for: queue 0 | busy X | idle Y)
# WIP limit = X + Y (total agents)
```

**Fix:**
```bash
# Reset stale tasks (Pattern 1 fix)
# Restart autopilot to clear agent pool state
pkill -f "unified_orchestrator" && make autopilot=3
```

**Prevention:**
- Stale recovery runs before each prefetch
- Agent pool tracks active reservations
- WIP limit only counts tasks with valid assignments

---

### Pattern 4: Task Ranking Anomalies

**Symptoms:**
- High-priority tasks never execute
- Low-priority tasks execute first
- Tasks execute in unexpected order

**Root Causes:**
1. Priority metadata missing or incorrect
2. `rankTasks()` scoring algorithm bug
3. Task metadata not matching schema

**Diagnosis:**
```bash
# Check task priorities
sqlite3 state/orchestrator.db "
  SELECT id, title, json_extract(metadata, '$.priority') as priority
  FROM tasks
  WHERE status = 'pending'
  ORDER BY priority DESC, id
  LIMIT 20;
"

# Run ranking simulation
node -e "
const { rankTasks } = require('./tools/wvo_mcp/dist/orchestrator/priority_scheduler.js');
const db = require('better-sqlite3')('state/orchestrator.db');
const tasks = db.prepare('SELECT * FROM tasks WHERE status = ?').all('pending');
console.log(rankTasks(tasks, null, {}).map(t => ({ id: t.id, score: t._rankScore })));
"
```

**Fix:**
```bash
# Update priority metadata
sqlite3 state/orchestrator.db "
  UPDATE tasks
  SET metadata = json_set(metadata, '$.priority', 'critical')
  WHERE id = 'T12.0.1';
"

# Force ranking recalculation (happens automatically on next prefetch)
```

**Prevention:**
- Roadmap YAML should include priority field
- Priority scheduler tests cover edge cases
- Telemetry tracks task selection order

---

### Pattern 5: Logging Blind Spots

**Symptoms:**
- `logInfo()` calls don't show data objects
- PREFETCH DEBUG shows no counts
- Can't diagnose issues from logs

**Root Causes:**
1. Log level set to ERROR or WARN only
2. Logger doesn't serialize objects
3. Log output piped through filter

**Diagnosis:**
```bash
# Check log level
echo $LOG_LEVEL

# Check logger configuration
grep "logLevel" tools/wvo_mcp/src/telemetry/logger.ts

# Test logging
node -e "
const { logInfo } = require('./tools/wvo_mcp/dist/telemetry/logger.js');
logInfo('TEST', { foo: 'bar', count: 123 });
"
```

**Fix:**
```bash
# Set log level to INFO
export LOG_LEVEL=info

# Or debug for maximum verbosity
export LOG_LEVEL=debug

# Restart autopilot
make autopilot=3
```

**Prevention:**
- Default log level should be INFO in development
- CI/CD should capture full logs
- Critical decision points should use logInfo() not logDebug()

---

## Anomaly Detection Framework

### Automated Anomaly Checks

Run after every autopilot session:

```bash
#!/bin/bash
# scripts/detect_autopilot_anomalies.sh

echo "=== AUTOPILOT ANOMALY DETECTION ==="

# 1. Check for unexpected task states
echo "1. Checking for stale tasks..."
STALE=$(sqlite3 state/orchestrator.db "
  SELECT COUNT(*) FROM tasks
  WHERE status = 'in_progress'
    AND (julianday('now') - julianday(started_at/1000, 'unixepoch')) * 24 * 60 > 10;
")
if [ "$STALE" -gt 0 ]; then
  echo "  ❌ ANOMALY: $STALE stale in-progress tasks (>10 min)"
fi

# 2. Check for circular dependencies
echo "2. Checking for circular dependencies..."
# (Use graph traversal to detect cycles)

# 3. Check for task execution anomalies
echo "3. Checking execution patterns..."
REPEATED=$(sqlite3 state/orchestrator.db "
  SELECT id, COUNT(*) as attempts
  FROM execution_history
  WHERE created_at > datetime('now', '-1 hour')
  GROUP BY id
  HAVING attempts > 3;
")
if [ -n "$REPEATED" ]; then
  echo "  ❌ ANOMALY: Tasks attempted multiple times"
  echo "$REPEATED"
fi

# 4. Check for resource leaks
echo "4. Checking for resource leaks..."
# Check database size, file handles, memory usage

# 5. Check for throughput degradation
echo "5. Checking throughput..."
COMPLETED=$(sqlite3 state/orchestrator.db "
  SELECT COUNT(*) FROM tasks
  WHERE status = 'done'
    AND completed_at > (unixepoch('now') - 3600) * 1000;
")
echo "  Tasks completed in last hour: $COMPLETED"
if [ "$COMPLETED" -eq 0 ]; then
  echo "  ⚠️  WARNING: Zero tasks completed in last hour"
fi

echo ""
```

### Statistical Process Control

Track autopilot metrics over time:

```bash
# Collect baseline metrics
./scripts/collect_autopilot_metrics.sh > state/analytics/autopilot_baseline.json

# Compare current run to baseline
./scripts/compare_to_baseline.sh
```

Key metrics to monitor:
- **Throughput**: Tasks completed per hour
- **Cycle time**: Time from pending → done
- **Error rate**: Failed tasks / total tasks
- **WIP**: In-progress tasks over time
- **Queue depth**: Pending tasks over time

**Control charts** (detect out-of-control conditions):
- Mean ± 3σ bounds
- Western Electric Rules
- Trend detection

---

## Test Scenarios

### Scenario 1: Dependency Chain

```yaml
Test: Long dependency chain executes in correct order
Given:
  - Task A depends on nothing
  - Task B depends on A
  - Task C depends on B
  - Task D depends on C
When:
  - Autopilot runs
Then:
  - Tasks execute in order: A → B → C → D
  - No task starts before dependencies complete
  - No circular dependency deadlock
```

### Scenario 2: Parallel Execution

```yaml
Test: Independent tasks execute in parallel
Given:
  - Task A depends on nothing
  - Task B depends on nothing
  - Task C depends on nothing
  - 3 workers available
When:
  - Autopilot runs
Then:
  - All 3 tasks start simultaneously
  - All 3 workers are busy
  - Tasks complete ~3x faster than sequential
```

### Scenario 3: Agent Crash Recovery

```yaml
Test: Stale task recovery after agent crash
Given:
  - Task A assigned to worker-1
  - Task A status = in_progress
  - Worker-1 crashes
When:
  - 5 minutes pass
  - Autopilot runs
Then:
  - Task A detected as stale
  - Task A status reset to pending
  - Task A reassigned to available worker
  - Task A completes successfully
```

### Scenario 4: WIP Limit Enforcement

```yaml
Test: WIP limit prevents context switching
Given:
  - 3 workers available
  - WIP limit = 3
  - 10 tasks ready
When:
  - Autopilot runs
Then:
  - Only 3 tasks start (WIP limit)
  - No new tasks start until one completes
  - Queue remains at 7 pending tasks
```

### Scenario 5: Priority Preemption

```yaml
Test: Critical tasks preempt normal tasks
Given:
  - Task A priority = normal, status = pending
  - Task B priority = critical, status = pending
  - 1 worker available
When:
  - Autopilot runs
Then:
  - Task B starts first (higher priority)
  - Task A waits in queue
```

---

## Diagnostic Tools

### Tool 1: debug_tasks.mjs

**Purpose**: Comprehensive task state analysis

**Usage**:
```bash
node debug_tasks.mjs
```

**Output**:
- Task status summary
- In-progress task assignments
- Dependency analysis
- Ready task count
- Autopilot eligibility check

---

### Tool 2: Task Execution Tracer

**Purpose**: Trace a specific task through the system

**Usage**:
```bash
./scripts/trace_task.sh T12.0.1
```

**Output**:
```
T12.0.1: Generate synthetic multi-tenant dataset
  Created: 2025-10-22 14:30:00
  Status:  pending → in_progress → done
  Agent:   worker-1
  Duration: 45.2s
  Dependencies: [] (none)
  Dependents: [T12.0.2, T12.0.3]
  Exit criteria:
    ✓ artifact:storage/seeds/synthetic/*.parquet
    ✓ artifact:state/analytics/synthetic_tenant_profiles.json
    ✓ critic:data_quality
```

---

### Tool 3: Autopilot Health Dashboard

**Purpose**: Real-time autopilot monitoring

**Usage**:
```bash
./scripts/monitor_autopilot.sh
```

**Output**:
```
┌─────────────────────────────────────────────────┐
│ WeatherVane Autopilot - Live Health Monitor    │
└─────────────────────────────────────────────────┘

Agents:  3 (2 busy, 1 idle)
Queue:   5 tasks
Pending: 28 tasks ready
In Progress: 2 tasks
Completed: 119 tasks
Failed: 0 tasks

Throughput: 12 tasks/hour
Avg cycle time: 4.5 minutes
WIP: 2 / 3 (67%)

Last 5 completions:
  ✓ T12.0.1 (45s) - worker-1
  ✓ T9.2.2 (32s) - worker-0
  ✓ T9.3.1 (28s) - orchestrator
  ✓ T12.0.2 (51s) - worker-1
  ✓ T12.0.3 (19s) - worker-0
```

---

### Tool 4: Dependency Graph Visualizer

**Purpose**: Visualize task dependencies

**Usage**:
```bash
./scripts/visualize_dependencies.sh > dependencies.dot
dot -Tpng dependencies.dot > dependencies.png
```

**Output**: Graph showing task relationships, highlighting cycles and critical paths

---

## Monitoring & Alerts

### Alert Rules

**CRITICAL** (page immediately):
1. Autopilot stuck (no progress for 10 minutes)
2. All agents crashed
3. Database corruption detected
4. Circular dependency deadlock

**WARNING** (investigate within 1 hour):
1. Throughput < 50% of baseline
2. Error rate > 10%
3. WIP limit reached for > 5 minutes
4. Stale tasks detected

**INFO** (review daily):
1. Task completion rate
2. Average cycle time
3. Resource utilization
4. Dependency chain length

### Monitoring Integration

```bash
# Prometheus metrics endpoint
curl http://localhost:9090/metrics

# Example metrics:
# autopilot_tasks_total{status="done"} 119
# autopilot_tasks_total{status="pending"} 28
# autopilot_tasks_total{status="in_progress"} 2
# autopilot_tasks_total{status="failed"} 0
# autopilot_throughput_per_hour 12.5
# autopilot_cycle_time_seconds{p50="120",p95="300"}
# autopilot_wip_utilization 0.67
```

---

## Continuous Improvement

### Weekly Review Checklist

- [ ] Review anomaly detection logs
- [ ] Check control chart for out-of-control conditions
- [ ] Update test scenarios based on new failure modes
- [ ] Review and tune priority scoring algorithm
- [ ] Analyze failed tasks for patterns
- [ ] Update this guide with new learnings

### Monthly Deep Dive

- [ ] Run full test suite including meta-tests
- [ ] Benchmark autopilot performance
- [ ] Review and optimize critical path
- [ ] Update baselines for SPC charts
- [ ] Conduct failure mode analysis
- [ ] Plan improvements for next month

---

## References

- State Machine: `tools/wvo_mcp/src/orchestrator/state_machine.ts`
- Unified Orchestrator: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`
- Priority Scheduler: `tools/wvo_mcp/src/orchestrator/priority_scheduler.ts`
- Agent Pool: `tools/wvo_mcp/src/orchestrator/agent_pool.ts`
- Roadmap Tracker: `tools/wvo_mcp/src/orchestrator/roadmap_tracker.ts`

---

**Last Updated**: 2025-10-23
**Version**: 1.0.0
**Maintainer**: Autopilot Meta-Testing Team
