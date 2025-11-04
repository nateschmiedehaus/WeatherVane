# Autopilot Crash Fix - 2025-10-23

**Issue**: Tasks are failing/blocking systematically due to two root causes:
1. Stale in-progress tasks (tasks stuck with no assigned agent)
2. Dependencies not synced from YAML to database

---

## Root Cause Analysis

### Issue 1: Stale Task Recovery

**Symptoms**:
- Tasks show `status='in_progress'` but `assigned_to=NULL` or empty
- WIP limit incorrectly counts these as active, blocking new task prefetch
- Autopilot says "no tasks available" despite ready tasks existing

**Root Cause**:
- Stale task recovery exists (`recoverStaleInProgressTasks()`) but only runs during `prefetchTasks()`
- If prefetch doesn't run (due to WIP limit or other issues), stale tasks never recover
- Recovery threshold is 10 minutes (too long for fast iteration)

**Evidence**:
```sql
-- Found stale tasks
SELECT id, status, assigned_to, started_at
FROM tasks
WHERE status = 'in_progress'
  AND (assigned_to IS NULL OR assigned_to = '');

-- Results: T12.PoC.3, T13.2.2 (both stale)
```

---

### Issue 2: Dependency Sync Failure

**Symptoms**:
- Tasks have dependencies in JSON metadata but not in `task_dependencies` table
- Dependency sync ratio: 6/46 = 0.13 (should be ~1.0)
- Tasks that should be blocked execute out of order

**Root Cause**:
- `syncRoadmapDocument()` calls `addDependencies()` which calls `stateMachine.addDependency()`
- `addDependency()` uses `INSERT OR IGNORE` which silently fails if:
  - Dependency already exists (expected)
  - Would create cycle (throws error, logged as warning)
  - Referenced task doesn't exist (foreign key constraint fails)
- The 6 dependencies that DID sync are all T-MLR tasks (manually created, not from YAML)
- Main roadmap dependencies aren't syncing

**Evidence**:
```bash
# Health check showed:
3. Dependency sync... ⚠ WARNING
   Sync ratio low: 6/46 = .13 (expected ~1.0)
   Some dependencies may not be synced

# Only 7 dependencies in table (all T-MLR)
sqlite3 state/orchestrator.db "SELECT * FROM task_dependencies;"
T-MLR-2.3|T-MLR-2.2|blocks
T-MLR-3.3|T-MLR-3.2|blocks
T-MLR-4.1|T-MLR-0.1|blocks
T-MLR-4.1|T-MLR-3.3|blocks
T-MLR-4.2|T-MLR-4.1|blocks
T-MLR-4.3|T-MLR-4.2|blocks
T-MLR-4.4|T-MLR-4.3|blocks
```

**Investigation Needed**:
1. Check if `syncRoadmapFile()` is being called at all
2. Check if Epic 12/13 dependencies are in YAML
3. Check for foreign key constraint failures in logs
4. Check if database is in readonly mode during sync

---

## Implemented Fixes

### Fix 1: Automatic Stale Task Recovery

**Changes**:
1. Run stale recovery on startup (before any task assignment)
2. Run stale recovery on a 5-minute timer (independent of prefetch)
3. Reduce threshold from 10 minutes to 5 minutes (configurable)
4. Add telemetry tracking stale recoveries

**Implementation**:
```typescript
// In UnifiedOrchestrator.start()
await this.recoverStaleInProgressTasks(); // On startup

// Add periodic timer
this.staleRecoveryTimer = setInterval(async () => {
  const recovered = await this.recoverStaleInProgressTasks();
  if (recovered > 0) {
    logInfo('Periodic stale task recovery', { recovered });
    // Trigger prefetch to fill queue with newly available tasks
    await this.prefetchTasks();
  }
}, 5 * 60 * 1000); // Every 5 minutes
```

---

### Fix 2: Forced Dependency Sync on Startup

**Changes**:
1. Run full roadmap sync on orchestrator startup
2. Log dependency sync statistics
3. Add telemetry for sync success/failure
4. Create diagnostic to compare metadata vs table

**Implementation**:
```typescript
// In UnifiedOrchestrator.start()
logInfo('Forcing roadmap sync to ensure dependencies are loaded');
const beforeCount = this.stateMachine.db.prepare('SELECT COUNT(*) as count FROM task_dependencies').get().count;

await syncRoadmapFile(this.stateMachine, this.workspaceRoot);

const afterCount = this.stateMachine.db.prepare('SELECT COUNT(*) as count FROM task_dependencies').get().count;
const added = afterCount - beforeCount;

logInfo('Roadmap sync complete', {
  dependenciesBefore: beforeCount,
  dependenciesAfter: afterCount,
  dependenciesAdded: added
});

if (added === 0 && /* tasks with deps in metadata > 0 */) {
  logWarning('Dependency sync may have failed - no dependencies added');
}
```

---

### Fix 3: Health Check Integration

**Changes**:
1. Run health check before every autopilot run
2. Fail fast if critical issues detected
3. Auto-remediate fixable issues (stale tasks)
4. Alert on unfixable issues (dependency sync)

**Implementation**:
```bash
# In scripts/autopilot_unified.sh (or make target)
echo "Running pre-flight health check..."
./scripts/autopilot_health_check.sh quick

if [ $? -eq 2 ]; then
  echo "CRITICAL: Health check failed. Aborting autopilot run."
  echo "Run './scripts/autopilot_health_check.sh full' for details."
  exit 1
fi
```

---

### Fix 4: Dependency Sync Diagnostic

**Changes**:
1. Create script to diagnose dependency sync issues
2. Compare metadata vs table
3. Identify missing dependencies
4. Suggest remediation

**Implementation**:
```javascript
// scripts/diagnose_dependency_sync.mjs
import Database from 'better-sqlite3';
import yaml from 'js-yaml';
import fs from 'fs';

const db = new Database('state/orchestrator.db');
const roadmapYaml = yaml.load(fs.readFileSync('state/roadmap.yaml', 'utf8'));

// Extract dependencies from YAML
const yamlDeps = new Map();
for (const epic of roadmapYaml.epics || []) {
  for (const milestone of epic.milestones || []) {
    for (const task of milestone.tasks || []) {
      if (task.dependencies?.length) {
        yamlDeps.set(task.id, task.dependencies);
      }
    }
  }
}

// Extract dependencies from database table
const tableDeps = new Map();
const rows = db.prepare('SELECT task_id, depends_on_task_id FROM task_dependencies').all();
for (const row of rows) {
  if (!tableDeps.has(row.task_id)) {
    tableDeps.set(row.task_id, []);
  }
  tableDeps.get(row.task_id).push(row.depends_on_task_id);
}

// Compare
console.log('Dependency Sync Diagnostic');
console.log('==========================\n');
console.log(`YAML dependencies: ${yamlDeps.size} tasks`);
console.log(`Table dependencies: ${tableDeps.size} tasks`);
console.log('');

const missing = [];
for (const [taskId, deps] of yamlDeps) {
  const tableDepsForTask = tableDeps.get(taskId) || [];
  const missingDeps = deps.filter(d => !tableDepsForTask.includes(d));
  if (missingDeps.length) {
    missing.push({ taskId, missing: missingDeps });
  }
}

if (missing.length) {
  console.log(`⚠️  ${missing.length} tasks have missing dependencies:\n`);
  for (const { taskId, missing: missingDeps } of missing) {
    console.log(`  ${taskId}:`);
    for (const dep of missingDeps) {
      const depExists = db.prepare('SELECT id FROM tasks WHERE id = ?').get(dep);
      console.log(`    - ${dep} ${depExists ? '✓ exists' : '✗ NOT FOUND'}`);
    }
  }
  console.log('\nRecommendation: Run force_roadmap_sync.mjs');
} else {
  console.log('✓ All YAML dependencies are synced to table');
}
```

---

## Testing Plan

### Test 1: Stale Task Recovery

```bash
# 1. Create stale task
sqlite3 state/orchestrator.db "
  UPDATE tasks SET status='in_progress', assigned_to=NULL, started_at=$(( ($(date +%s) - 600) * 1000 ))
  WHERE id='TEST-1';
"

# 2. Start autopilot
make autopilot=3

# 3. Verify recovery
# Expected: Task TEST-1 recovered to pending within 5 minutes
# Log should show: "Recovered stale in-progress task"
```

### Test 2: Dependency Sync

```bash
# 1. Clear dependencies
sqlite3 state/orchestrator.db "DELETE FROM task_dependencies WHERE task_id LIKE 'T12%';"

# 2. Start autopilot (triggers sync on startup)
make autopilot=3

# 3. Verify sync
./scripts/diagnose_dependency_sync.mjs

# Expected: All T12/T13 dependencies synced from YAML
```

### Test 3: Health Check Integration

```bash
# 1. Create stale task
sqlite3 state/orchestrator.db "
  UPDATE tasks SET status='in_progress', assigned_to=''
  WHERE id='T9.2.2';
"

# 2. Run health check
./scripts/autopilot_health_check.sh quick

# Expected: WARNING about stale task
# Exit code: 1

# 3. Auto-remediate
sqlite3 state/orchestrator.db "
  UPDATE tasks SET status='pending', assigned_to=NULL, started_at=NULL
  WHERE status='in_progress' AND (assigned_to IS NULL OR assigned_to='');
"

# 4. Run health check again
./scripts/autopilot_health_check.sh quick

# Expected: PASS
# Exit code: 0
```

---

## Monitoring & Alerts

### Metrics to Track

1. **Stale Task Recovery Rate**
   - Metric: `autopilot_stale_tasks_recovered_total`
   - Alert if > 10 recoveries/hour (indicates systemic issue)

2. **Dependency Sync Ratio**
   - Metric: `autopilot_dependency_sync_ratio`
   - Alert if < 0.5 (critical) or < 0.8 (warning)

3. **Health Check Failures**
   - Metric: `autopilot_health_check_failures_total`
   - Alert on any failure

4. **Ready Task Count**
   - Metric: `autopilot_ready_tasks_count`
   - Alert if 0 ready tasks but > 10 pending tasks

### Dashboard

```
┌─────────────────────────────────────────┐
│ Autopilot Health Dashboard             │
├─────────────────────────────────────────┤
│ Stale Recoveries (1h):    0            │
│ Dependency Sync Ratio:    1.00 ✓       │
│ Ready Tasks:              33           │
│ In Progress:              1            │
│ Last Health Check:        PASS ✓       │
│ Last Sync:                2min ago     │
└─────────────────────────────────────────┘
```

---

## Rollout Plan

### Phase 1: Immediate (Today)
- [x] Implement stale task recovery timer
- [x] Force dependency sync on startup
- [x] Add health check to autopilot startup
- [ ] Deploy to production

### Phase 2: Short-term (This Week)
- [ ] Add telemetry for all fixes
- [ ] Create Grafana dashboard
- [ ] Set up alerts for anomalies
- [ ] Run extended stability test (24h continuous)

### Phase 3: Long-term (This Month)
- [ ] Implement predictive stale task detection
- [ ] Add automatic dependency repair
- [ ] Create self-healing mechanisms
- [ ] Document lessons learned

---

## Success Criteria

✅ **Phase 1 Complete When**:
- No stale tasks persist for > 5 minutes
- Dependency sync ratio stays > 0.95
- Health check passes before every run
- Zero "no tasks available" errors when tasks are ready

✅ **Full Fix Validated When**:
- 72 hours of continuous autopilot operation
- Zero stale task recoveries (no new stale tasks created)
- Dependency sync ratio = 1.00 continuously
- Throughput returns to baseline (12+ tasks/hour)

---

## References

- Stale Recovery Code: `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts:2720-2795`
- Dependency Sync: `tools/wvo_mcp/src/orchestrator/roadmap_adapter.ts:327-341`
- Health Check: `scripts/autopilot_health_check.sh`
- Meta Testing Guide: `docs/AUTOPILOT_META_TESTING_GUIDE.md`

---

**Status**: Implementation in progress
**Assignee**: Claude (Orchestrator Agent)
**Priority**: Critical
**ETA**: 2025-10-23 02:00 UTC
