# Phase -1 Monitoring Plan

## Purpose

Track WorkProcessEnforcer effectiveness to ensure Phase -1 foundation remains solid and inform Phase 2 improvements.

## Metrics to Track

### 1. Enforcement Effectiveness

**Primary Metrics:**
```yaml
phase_skip_attempts_blocked:
  type: counter
  labels: [task_id, required_phase, violation_type]
  description: "Number of times enforcer blocked a phase-skipping task"
  target: "100% of violations detected and blocked"

phase_validations_passed:
  type: counter
  labels: [task_id, task_status]
  description: "Number of legitimate tasks allowed through"
  target: "100% of legitimate tasks pass"

false_positive_rate:
  type: gauge
  calculation: "legitimate_tasks_blocked / total_tasks_attempted"
  target: "0%"
  escalation_threshold: "> 1%"
```

**Collection Method:**
- Logged in `state/logs/work_process.jsonl` by WorkProcessEnforcer
- Context entries with `entry_type: 'constraint'` in state machine
- Aggregated weekly in `state/analytics/enforcement_metrics.json`

### 2. Integrity Suite Health

**Metrics:**
```yaml
integrity_suite_pass_rate:
  type: gauge
  calculation: "passed_tests / total_tests"
  current: 99.7% (1164/1167)
  target: "≥ 99%"
  escalation_threshold: "< 95%"

integrity_suite_runtime:
  type: histogram
  unit: seconds
  current: ~36 seconds
  target: "< 60 seconds"
  escalation_threshold: "> 120 seconds"

flaky_test_count:
  type: counter
  labels: [test_name, failure_type]
  current: 3 MCP startup failures (tracked)
  target: "< 5 consistently flaky tests"
```

**Collection Method:**
- Parse output of `run_integrity_tests.sh`
- Log to `state/analytics/integrity_health.jsonl`
- Weekly trend analysis

### 3. System Stability

**Metrics:**
```yaml
test_pass_rate_overall:
  type: gauge
  calculation: "passing_tests / total_tests"
  current:
    python: 99.7% (1164/1167)
    typescript: 100% (1419/1419)
  target: "≥ 99%"

build_success_rate:
  type: gauge
  calculation: "successful_builds / total_builds"
  current: 100%
  target: "100%"

enforcement_errors:
  type: counter
  labels: [error_type, task_id]
  description: "Times WorkProcessEnforcer threw errors"
  target: "0 per week"
  escalation_threshold: "> 10 per week"
```

### 4. Performance Impact

**Metrics:**
```yaml
enforcement_overhead_ms:
  type: histogram
  buckets: [0.1, 0.5, 1, 5, 10, 50]
  current: "< 1ms per task"
  target: "< 5ms per task"
  escalation_threshold: "> 50ms p95"

task_execution_time:
  type: histogram
  labels: [task_type, with_enforcement]
  description: "Total task execution time"
  baseline: "recorded without enforcement"
  target: "< 5% increase from baseline"
  escalation_threshold: "> 20% increase"
```

## Success Criteria

### Week 1 (Days 1-7)

**Must Achieve:**
- ✅ Enforcement blocks 100% of invalid phase transitions
- ✅ Zero false positives (no legitimate work blocked)
- ✅ Performance regression < 5%
- ✅ Integrity suite continues passing (≥ 99%)
- ✅ Build success rate = 100%

**Acceptable:**
- Some flaky tests remain (as long as not enforcement-related)
- Enforcement errors if they fail-open (not blocking work)

**Not Acceptable:**
- False positives blocking legitimate work
- Enforcement crashes blocking all work
- Performance regression > 10%

### Month 1 (Days 1-30)

**Must Achieve:**
- Consistent enforcement effectiveness (no violations slipping through)
- No increase in flaky test count
- Performance overhead remains < 5%
- Zero enforcement-related production incidents

**Should Achieve:**
- Reduction in phase-skipping attempts (agents learn the process)
- Pattern identification of common violations
- Data collected for Phase 0 instrumentation

## Escalation Triggers

### Critical (Immediate Action)

1. **False Positive Blocking Work**
   - Symptom: Legitimate task blocked by enforcer
   - Impact: Blocks all autopilot progress
   - Action: Disable enforcement via emergency flag (see Rollback Plan)
   - Timeline: < 5 minutes

2. **Enforcement Crashes System**
   - Symptom: WorkProcessEnforcer throws, orchestrator crashes
   - Impact: Complete autopilot failure
   - Action: Revert enforcement changes
   - Timeline: < 15 minutes

3. **Build Fails**
   - Symptom: `npm run build` exits with errors
   - Impact: Cannot deploy
   - Action: Revert last changes, investigate
   - Timeline: < 30 minutes

### High (Same Day)

4. **Enforcement Fails to Block Obvious Violation**
   - Symptom: Task skips phases, not caught by enforcer
   - Impact: Process not being enforced
   - Action: Debug validatePhaseSequence logic, add test case
   - Timeline: < 4 hours

5. **Performance Regression > 10%**
   - Symptom: Task execution significantly slower
   - Impact: Reduced throughput
   - Action: Profile enforcement code, optimize
   - Timeline: < 8 hours

### Medium (This Week)

6. **Flaky Tests Increase**
   - Symptom: Previously passing tests now intermittent
   - Impact: Reduced confidence in test suite
   - Action: Investigate root cause, skip if necessary
   - Timeline: < 3 days

7. **False Positive Rate > 1%**
   - Symptom: 1 in 100 legitimate tasks blocked
   - Impact: Reduced autopilot reliability
   - Action: Adjust validation logic, add allowlist
   - Timeline: < 5 days

## Rollback Plan

### Emergency Disable (if false positives occur)

**Option 1: Environment Variable**
```bash
export WVO_DISABLE_WORK_PROCESS_ENFORCEMENT=1
```

**Current Status**: ❌ Not implemented (Phase 2 work)

**Workaround**: Comment out enforcement code in orchestrator_loop.ts:
```typescript
// if (this.workProcessEnforcer) {
//   const validation = await this.workProcessEnforcer.validatePhaseSequence(task);
//   ...
// }
```

### Full Revert (if enforcement causes crashes)

```bash
git revert <enforcement-commit-hash>
npm run build
npm test
```

**Commits to revert:**
1. orchestrator_loop.ts enforcement changes
2. work_process_enforcer.ts validatePhaseSequence method
3. System prompt updates (CLAUDE.md, AGENTS.md)

**Recovery Time Objective (RTO)**: < 30 minutes

## Monitoring Implementation

### Week 1: Manual Monitoring

**Daily Checks:**
- [ ] Run integrity suite: `./scripts/run_integrity_tests.sh`
- [ ] Check enforcement logs: `tail -f state/logs/work_process.jsonl`
- [ ] Review context entries: Query for `entry_type='constraint'`
- [ ] Monitor performance: Compare test runtime to baseline

**Weekly Review:**
- [ ] Aggregate metrics in `state/analytics/enforcement_weekly_YYYY-MM-DD.json`
- [ ] Identify patterns in violations
- [ ] Document learnings

### Phase 0: Automated Monitoring (Next Week)

Once Phase 0 (Instrumentation) is complete:

**Automated Collection:**
- OTel spans for each enforcement decision
- Metrics exported to Prometheus/metrics.jsonl
- Traces logged to traces.jsonl

**Dashboards:**
- Grafana dashboard for enforcement metrics
- Alert rules for escalation triggers
- Historical trend visualization

### Phase 2: Enhanced Monitoring

**Additional Metrics:**
- StateGraph enforcement coverage
- Tool-level enforcement
- Multi-layer enforcement effectiveness

## Data Collection

### Log Files

**work_process.jsonl** (already implemented):
```json
{
  "timestamp": "2025-10-28T18:00:00Z",
  "taskId": "TASK-001",
  "phase": "IMPLEMENT",
  "validation": {
    "valid": false,
    "violations": ["Must start with STRATEGIZE phase"],
    "requiredPhase": "STRATEGIZE",
    "actualPhase": null
  },
  "action": "blocked"
}
```

**Context Entries** (already implemented):
```typescript
{
  entry_type: 'constraint',
  topic: 'work_process_violation',
  content: 'Task TASK-001 attempted to skip phases: Must start with STRATEGIZE phase',
  confidence: 1.0,
  metadata: {
    taskId: 'TASK-001',
    violations: ['Must start with STRATEGIZE phase'],
    enforcement: 'blocked'
  }
}
```

### Aggregated Metrics

**enforcement_weekly_YYYY-MM-DD.json**:
```json
{
  "week": "2025-10-28",
  "enforcement": {
    "violations_blocked": 12,
    "validations_passed": 145,
    "false_positives": 0,
    "false_positive_rate": 0.0,
    "enforcement_errors": 0
  },
  "integrity": {
    "pass_rate": 0.997,
    "total_tests": 1167,
    "passed": 1164,
    "failed": 3,
    "runtime_seconds": 36.2
  },
  "performance": {
    "enforcement_overhead_ms_p50": 0.3,
    "enforcement_overhead_ms_p95": 0.8,
    "enforcement_overhead_ms_p99": 1.2
  }
}
```

## Reporting

### Weekly Report Template

```markdown
# Phase -1 Enforcement: Week of YYYY-MM-DD

## Summary
- Violations blocked: X
- False positives: X
- Performance: X% overhead
- Status: ✅ On track / ⚠️ Issues / ❌ Critical

## Metrics
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Violations blocked | 100% | X% | ✅/❌ |
| False positives | 0% | X% | ✅/❌ |
| Performance overhead | < 5% | X% | ✅/❌ |
| Test pass rate | ≥ 99% | X% | ✅/❌ |

## Issues
- [List any issues encountered]

## Actions Taken
- [List any corrective actions]

## Recommendations
- [List any recommendations for Phase 2]
```

## Next Steps

### Immediate (This Session)
- [x] Define metrics and success criteria (this document)
- [ ] Baseline current metrics (capture starting point)
- [ ] Set up manual monitoring schedule

### Week 1
- [ ] Daily integrity suite runs
- [ ] Monitor enforcement logs
- [ ] Collect Week 1 data

### Phase 0 (Next Week)
- [ ] Implement OTel spans
- [ ] Automate metric collection
- [ ] Create enforcement dashboard

## Success Indicators

**Phase -1 is successful if:**

1. **Enforcement Works**: 100% of violations blocked, 0% false positives
2. **System Stable**: Tests pass, builds succeed, no crashes
3. **Performance Acceptable**: < 5% overhead
4. **Data Collected**: Patterns identified, ready for Phase 0
5. **Process Followed**: This validation task itself followed STRATEGIZE→MONITOR

**Phase -1 is ready for Phase 0 when:**
- All success indicators met for Week 1
- No critical or high escalations triggered
- Monitoring data shows consistent enforcement
- Team confident in foundation

## Conclusion

Phase -1 monitoring ensures the enforcement foundation remains solid while informing Phase 0 (Instrumentation) and Phase 2 (Multi-layer Enforcement) improvements.

**Current Status:** MONITOR phase defined, ready for data collection.

**Next Phase:** Phase 0 - Instrumentation (OTel spans for automated monitoring)
