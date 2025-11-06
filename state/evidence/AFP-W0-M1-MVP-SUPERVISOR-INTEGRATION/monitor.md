# MONITOR - AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION

**Task:** AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION
**Date:** 2025-11-06
**Author:** Claude Council
**Phase:** 10 of 10 (MONITOR)

---

## Overview

Monitoring plan for supervisor integration with Wave0 autopilot. This document defines observability, metrics, and success criteria for production monitoring.

---

## Monitoring Strategy

### 1. Telemetry Files

**Primary observability:** `state/analytics/supervisor_lifecycle.jsonl`

**Events monitored:**
- `task.selected` - Task selection with reason and metadata
- `task.assigned` - Task status updated to in_progress
- `task.started` - Execution begins
- `task.completed` - Execution finishes with status and duration

**Health indicators:**
- All 4 events present for each task (complete lifecycle trace)
- Events in chronological order
- No missing task IDs (no incomplete traces)
- Execution times reasonable (<5 min for typical tasks)

**Alert conditions:**
- Missing completion events (task stuck or crashed)
- Execution time >10 min (potential hang)
- Repeated task.selected without completion (retry loop)

---

### 2. Lease Management

**Observability:** Wave0 logs + in-memory lease state

**Metrics to monitor:**
- Lease acquisition success rate (should be ~100%)
- Lease release success rate (should be ~100%)
- Lease TTL expirations (should be rare)
- Lease contention warnings (should be 0 with single Wave0 instance)

**Health indicators:**
- No "lease already held" warnings
- All leases released after task completion
- No orphaned leases (held >30 min)

**Alert conditions:**
- Lease acquisition fails repeatedly (indicates concurrency issue)
- Lease not released (memory leak or crash)
- Lease TTL expiration (task took >30 min)

---

### 3. Build Health

**Continuous monitoring:** TypeScript compilation

**Command:** `cd tools/wvo_mcp && npm run build`

**Health indicators:**
- 0 compilation errors
- Build completes in <30 seconds
- No new warnings introduced

**Alert conditions:**
- Build fails (supervisor integration broken)
- Build time increases significantly (complexity creep)

---

### 4. Runtime Health

**Wave0 autopilot monitoring:**

**Metrics:**
- Uptime (should run continuously)
- Task throughput (tasks completed per hour)
- Error rate (should be <5%)
- Crash rate (should be 0)

**Health indicators:**
- Wave0 enters main loop successfully
- Lock file exists and current
- Tasks execute without exceptions
- Supervisor errors don't crash Wave0

**Alert conditions:**
- Wave0 crashes (supervisor integration issue)
- Task execution rate drops to 0 (deadlock)
- Error rate >10% (systematic failure)

---

## Success Criteria (Production)

### Week 1 (Burn-in)

**Goals:**
- ✅ Wave0 runs for 7 days without crashes
- ✅ 100 tasks executed successfully
- ✅ All lifecycle events emitted correctly
- ✅ No lease contention issues

**Monitoring frequency:** Daily checks

**Escalation:** Any crash or data loss triggers immediate investigation

---

### Month 1 (Stability)

**Goals:**
- ✅ 1000 tasks executed successfully
- ✅ <1% error rate
- ✅ No supervisor-related crashes
- ✅ Telemetry log size manageable (<100 MB)

**Monitoring frequency:** Weekly checks

**Escalation:** Trend analysis for increasing error rates

---

### Long-term (Operational)

**Goals:**
- ✅ Supervisor integration becomes invisible (no manual intervention)
- ✅ Telemetry provides sufficient debugging information
- ✅ Lease coordination prevents duplicate task execution
- ✅ Lifecycle events enable performance optimization

**Monitoring frequency:** Monthly reviews

**Escalation:** Quarterly review of supervisor effectiveness

---

## Observability Tools

### Manual Monitoring

**Daily checks:**
```bash
# Check Wave0 is running
ps aux | grep wave0

# Check recent lifecycle events
tail -20 state/analytics/supervisor_lifecycle.jsonl | jq '.'

# Check for errors
grep -i error state/analytics/supervisor_lifecycle.jsonl

# Verify JSONL structure
cat state/analytics/supervisor_lifecycle.jsonl | jq '.' > /dev/null
```

**Weekly checks:**
```bash
# Count tasks completed
grep "task.completed" state/analytics/supervisor_lifecycle.jsonl | wc -l

# Calculate average execution time
grep "task.completed" state/analytics/supervisor_lifecycle.jsonl | \
  jq '.metadata.executionTimeMs' | \
  awk '{sum+=$1; count++} END {print "Avg:", sum/count, "ms"}'

# Check for incomplete traces (missing completion events)
diff <(grep "task.selected" state/analytics/supervisor_lifecycle.jsonl | jq -r '.taskId' | sort) \
     <(grep "task.completed" state/analytics/supervisor_lifecycle.jsonl | jq -r '.taskId' | sort)
```

---

### Automated Monitoring (Future)

**Recommendations for future work:**

1. **Log rotation** - Rotate supervisor_lifecycle.jsonl when >50 MB
2. **Prometheus metrics** - Export lifecycle event counts, execution times
3. **Grafana dashboard** - Visualize task throughput, error rates, execution times
4. **Alertmanager** - Alert on missing completion events, high error rates
5. **Retention policy** - Archive old telemetry logs after 90 days

---

## Known Limitations (Acceptable for Wave 0)

**Documented in THINK phase, monitored here:**

1. **Simple YAML parsing** (Wave 0 limitation):
   - Risk: Race conditions if roadmap edited during execution
   - Monitor: Check for status update conflicts in logs
   - Mitigation: Defer to future waves (use proper YAML library)

2. **In-memory lease management** (Batch 1 limitation):
   - Risk: Leases lost on Wave0 crash
   - Monitor: Check for orphaned leases after restart
   - Mitigation: Lease TTL expiration (30 min) + restart clears leases

3. **No retry logic for telemetry** (acceptable for MVP):
   - Risk: Missing events in telemetry log if emission fails
   - Monitor: Check for gaps in event sequences
   - Mitigation: Telemetry is observability (non-critical), failures logged

**All limitations are acceptable for Wave 0 MVP.**

---

## Escalation Protocol

### Level 1: Warning (Log and Continue)
- Single task fails execution
- Telemetry emission fails once
- Lease acquisition takes >100ms

**Action:** Log warning, continue operation, review weekly

---

### Level 2: Error (Alert Required)
- Multiple tasks fail (>10% error rate)
- Telemetry file becomes corrupted
- Lease not released (memory leak suspected)

**Action:** Alert team, investigate within 24 hours, may require fix

---

### Level 3: Critical (Immediate Action)
- Wave0 crashes due to supervisor integration
- Data loss (missing lifecycle events for completed tasks)
- Duplicate task execution (lease coordination failed)

**Action:** Stop Wave0, investigate immediately, rollback if needed

---

## Rollback Plan

**If supervisor integration causes critical issues:**

1. **Immediate:** Stop Wave0 autopilot
   ```bash
   pkill -f run_wave0_test
   ```

2. **Revert:** Roll back to commit before supervisor integration
   ```bash
   git revert HEAD~3..HEAD  # Revert last 3 commits (evidence + integration)
   cd tools/wvo_mcp && npm run build
   ```

3. **Restart:** Start Wave0 with old version
   ```bash
   npx tsx tools/wvo_mcp/scripts/run_wave0_test.ts &
   ```

4. **Investigate:** Analyze telemetry logs, reproduce issue in isolation

5. **Fix:** Create new STRATEGIZE cycle with remediation task

---

## Performance Baselines

**Established during VERIFY phase:**

- **Task execution overhead:** <100ms (Batch 2 added ~2ms)
- **Lifecycle event emission:** <10ms per event (4 events × 10ms = 40ms total)
- **Lease coordination:** <10ms (acquire + release)
- **Total supervisor overhead:** <60ms per task (negligible)

**Monitor for regressions:**
- Overhead increases >200ms (investigate)
- Event emission takes >50ms (check disk I/O)
- Lease operations take >100ms (check concurrency)

---

## Success Metrics (Actual vs Target)

### Week 1 (Target vs Actual)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Uptime | 7 days | TBD | ⏳ Monitoring |
| Tasks completed | 100 | TBD | ⏳ Monitoring |
| Crash rate | 0 | TBD | ⏳ Monitoring |
| Error rate | <5% | TBD | ⏳ Monitoring |
| Lifecycle events | 100% | TBD | ⏳ Monitoring |
| Lease issues | 0 | TBD | ⏳ Monitoring |

**Update this table weekly with actual results.**

---

## Post-Deployment Checklist

**Before marking task as "done" in roadmap:**

- ✅ Code deployed to production (commit 75360468b)
- ✅ Evidence bundle complete (7 artifacts)
- ✅ All tests passed (6/6 PASSED)
- ✅ Build verified (0 errors)
- ✅ Wave0 tested with live autopilot
- ✅ Telemetry validated (JSONL parseable)
- ✅ Monitoring plan documented (this file)
- ⏳ Week 1 burn-in (TBD - monitor for 7 days)

**Task ready for "done" status with monitoring ongoing.**

---

## Lessons Learned (Monitoring)

**What to monitor more closely in future:**

1. **End-to-end testing is CRITICAL** - Mocks and unit tests would not have caught integration issues
2. **Live autopilot testing** - Should be standard for ALL autopilot work (not just this task)
3. **JSONL telemetry** - Proven to be excellent format for debugging and analysis
4. **Lease coordination** - Simple in-memory implementation works well for Wave 0
5. **Via negativa** - Comprehensive documentation (strategy.md 497 LOC) was necessary, not bloat

**Recommendations for future monitoring:**
1. **Always test with live Wave 0** - Don't settle for unit tests
2. **Monitor telemetry file size** - Implement log rotation before 100 MB
3. **Track task execution times** - Detect performance regressions early
4. **Alert on incomplete traces** - Missing completion events indicate crashes

---

**Date:** 2025-11-06
**Author:** Claude Council
**Phase:** 10 of 10 (MONITOR) - COMPLETE
**Next:** Update roadmap status to "done", continue monitoring in production
