# Anti-Drift Mechanisms - Production Remediation Tracker

**Status:** Shipped with fail-safe mechanisms ✅
**Priority Fixes:** In progress (see below)

## Executive Summary

All 4 anti-drift mechanisms are implemented, tested (66/66 tests passing), and production-ready with fail-safe design (errors don't block progress). This document tracks operational concerns and hardening tasks for production deployment.

---

## 10 Critical Questions & Remediation Plan

### 1. SQLite Corruption & WAL Mode ⚠️ HIGH PRIORITY
**Question:** What happens if orchestrator.db gets corrupted during phase lease operation?

**Current Status:**
- Phase leases use better-sqlite3 with default journaling
- Leases auto-expire (5 min default) preventing permanent deadlock
- No explicit WAL (Write-Ahead Logging) mode enabled

**Risk:**
- Database corruption could strand workflow if lease write is torn
- Default DELETE journaling is less crash-resistant than WAL
- Recovery depends on lease expiration (5 min worst-case delay)

**Remediation:**
```typescript
// phase_lease.ts:86 - Add after Database initialization
this.db = new Database(dbPath);
this.db.pragma('journal_mode = WAL');  // Enable Write-Ahead Logging
this.db.pragma('synchronous = NORMAL'); // Balance safety/performance
```

**Estimated Effort:** 5 minutes
**Target:** Before first production deployment
**Owner:** TBD
**Verification:** Check `PRAGMA journal_mode` returns 'wal'

---

### 2. Hash Collision Risk ✅ NO ACTION NEEDED
**Question:** SHA-256 collision probability in phase ledger?

**Analysis:**
- SHA-256 collision probability: ~2^-256 (astronomically low)
- With 10 billion transitions: probability ~10^-60
- No practical risk for operational use

**Decision:** No action needed. SHA-256 is cryptographically sufficient.

---

### 3. JSONL Race Condition in Attestation ⚠️ HIGH PRIORITY
**Question:** What happens if two processes append to prompt_attestations.jsonl simultaneously?

**Current Status:**
- `fs.appendFile()` used without explicit locking
- Atomic for small writes (<4KB) on POSIX systems
- Multi-process scenario could cause interleaved JSON lines

**Risk:**
- Concurrent attestation writes from multiple agents
- Corrupted JSONL if lines interleave mid-write
- Rare but possible in high-concurrency deployment

**Remediation Options:**

**Option A: File Locking (Recommended)**
```typescript
// Add file_lock_manager.ts utility (adapt from pid_file_manager.ts)
// Use exclusive lock during append operation
async recordAttestation(attestation: PromptAttestation): Promise<void> {
  const lockPath = this.attestationPath + '.lock';
  await acquireLock(lockPath);
  try {
    await fs.appendFile(this.attestationPath, JSON.stringify(attestation) + '\n');
  } finally {
    await releaseLock(lockPath);
  }
}
```

**Option B: Move to SQLite (More Robust)**
```sql
CREATE TABLE prompt_attestations (
  attestation_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  -- ... other fields
);
```

**Estimated Effort:**
- Option A: 30 minutes (file locking)
- Option B: 2 hours (SQLite migration + tests)

**Target:** Week 1 post-deployment
**Owner:** TBD
**Verification:** Stress test with 10 concurrent agents

---

### 4. Evidence Collector Memory Leaks ⚠️ MEDIUM PRIORITY
**Question:** Does evidence collector properly clean up when tasks fail mid-phase?

**Current Status:**
- Evidence buffers in memory during phase execution
- `completeCycle()` clears state for completed tasks
- Need to verify cleanup on task abort/failure

**Risk:**
- 1000 failed tasks could accumulate evidence in memory
- Memory leak if failure paths don't clear buffers
- Gradual degradation over long runs

**Remediation:**
1. Audit `evidence_collector.ts` cleanup paths
2. Add explicit `clearEvidence(taskId)` on task failure
3. Add memory leak test: fail 1000 tasks, check heap size

**Code Audit Checklist:**
```typescript
// evidence_collector.ts - Check these paths:
- [ ] completeCycle() - clears buffers
- [ ] startCollection() - overwrites old buffer (potential leak if no clear)
- [ ] Task failure handler - calls clearEvidence()?
- [ ] orchestrator_loop.ts error paths - cleanup evidence?
```

**Estimated Effort:** 1 hour (audit + fix)
**Target:** Week 1 post-deployment
**Owner:** TBD
**Verification:** Memory leak test (1000 failed tasks)

---

### 5. Lease Renewal Race at Expiration ⚠️ MEDIUM PRIORITY
**Question:** What if lease renewal happens exactly at expiration boundary?

**Current Status:**
- `cleanupExpiredLeases()` runs before `acquireLease()`
- `renewLease()` extends expiration if current lease exists
- Tight timing window between cleanup and renewal

**Risk:**
- Agent renews lease at T=299s
- Cleanup runs at T=300s (expires), deletes lease
- Renewal succeeds but lease already cleaned up
- Result: spurious renewal failure

**Remediation:**
```typescript
// phase_lease.ts:285 - Add retry logic
async renewLease(taskId: string, phase: WorkPhase): Promise<LeaseRenewalResult> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 100;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await this._tryRenewLease(taskId, phase);
    if (result.renewed || !result.reason?.includes('not held')) {
      return result;
    }
    // Retry if lease disappeared (cleanup race)
    await sleep(RETRY_DELAY_MS);
  }
  return { renewed: false, reason: 'Max retries exceeded' };
}
```

**Estimated Effort:** 30 minutes
**Target:** Week 2 post-deployment
**Owner:** TBD
**Verification:** Concurrent renewal stress test

---

### 6. Attestation Severity Calibration ✅ NO IMMEDIATE ACTION
**Question:** Are severity levels (low/medium/high) correctly calibrated?

**Current Status:**
- High severity for VERIFY/REVIEW/MONITOR drift
- Low severity for STRATEGIZE/SPEC/PLAN drift
- Medium severity for IMPLEMENT/PR drift
- All severities are informational (fail-open)

**Decision:**
- Current calibration is reasonable
- Monitor severity distribution in production
- Consider promoting "high" to blocking once validated
- Defer to post-deployment tuning

**Target:** Month 1 post-deployment (after data collection)

---

### 7. Test Coverage Gaps 📝 TECHNICAL DEBT
**Question:** Do our 66 tests cover all error paths and edge cases?

**Current Coverage:**
- ✅ Happy path scenarios
- ✅ Basic error handling
- ❌ Concurrent access (10+ agents)
- ❌ Large artifact sets (100+ missing)
- ❌ Corrupted baseline files
- ❌ Lease expiration edge cases

**Remediation:**
Create stress test suite:
```typescript
// phase_lease.stress.test.ts
- [ ] 100 concurrent agents acquire same lease
- [ ] Lease renewal during cleanup window
- [ ] Database corruption mid-transaction

// prompt_attestation.stress.test.ts
- [ ] 1000 concurrent attestation writes
- [ ] Baseline file corruption scenarios
- [ ] 10,000 attestations (performance)

// evidence_gates.stress.test.ts
- [ ] 500 missing artifacts
- [ ] Evidence collection during OOM
```

**Estimated Effort:** 4 hours
**Target:** Week 2-3 post-deployment
**Owner:** TBD

---

### 8. Monitoring & Alerting 🚨 HIGH PRIORITY
**Question:** How do anti-drift mechanisms integrate with monitoring?

**Current Status:**
- Metrics emitted via MetricsCollector:
  - `evidence_gate_failed` - Phase transitions blocked
  - `prompt_drift_detected` - Specification drift
  - `phase_lease_contention` - Multi-agent conflicts
- Metrics written to `state/telemetry/counters.jsonl`
- No dashboards or alerts configured

**Required Setup:**

**1. Metrics Collection:**
```bash
# Stream counters to monitoring system
tail -f state/telemetry/counters.jsonl | \
  jq -r '{metric:.name, value:.value, tags:.tags}' | \
  # Send to DataDog/Prometheus/CloudWatch
```

**2. Dashboard Panels:**
- Evidence gate failure rate (target: <1%)
- Prompt drift by severity (high severity: 0)
- Lease contention rate (target: <5%)
- Phase transition latency (p50/p95/p99)

**3. Alerts:**
```yaml
- alert: HighEvidenceGateFailureRate
  condition: evidence_gate_failed > 5% over 1h
  severity: warning

- alert: HighSeverityPromptDrift
  condition: prompt_drift_detected{severity=high} > 0
  severity: critical

- alert: LeaseContentionStorm
  condition: phase_lease_contention > 10/min
  severity: warning
```

**Estimated Effort:** 2 hours (dashboard + alerts)
**Target:** Day 1 post-deployment
**Owner:** TBD
**Verification:** Trigger each alert manually

---

### 9. Performance Impact 📊 HIGH PRIORITY
**Question:** What's the latency overhead of running all 4 mechanisms per phase transition?

**Current Estimates (Unverified):**
- Phase ledger append: ~1-2ms (file I/O + hash)
- Evidence finalization: ~5-20ms (depends on artifact count)
- Lease acquire/release: ~2-5ms (2 DB roundtrips)
- Prompt attestation: ~2-3ms (SHA-256 + file I/O)
- **Total overhead: 10-30ms per phase transition**

**Acceptance Criteria:**
- p50 latency: <20ms
- p95 latency: <50ms
- p99 latency: <100ms

**Load Test Plan:**
```typescript
// benchmark_phase_transitions.ts
async function benchmarkPhaseTransition() {
  const taskId = 'BENCH-001';
  const iterations = 1000;
  const timings: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await enforcer.advancePhase(taskId, 'IMPLEMENT', 'VERIFY');
    const elapsed = performance.now() - start;
    timings.push(elapsed);
  }

  return {
    p50: percentile(timings, 0.5),
    p95: percentile(timings, 0.95),
    p99: percentile(timings, 0.99),
    max: Math.max(...timings)
  };
}
```

**Estimated Effort:** 1 hour (benchmark + report)
**Target:** Week 1 post-deployment
**Owner:** TBD
**Verification:** Compare against baseline (no enforcement)

---

### 10. Deployment & Migration Strategy 📋 MEDIUM PRIORITY
**Question:** What happens to tasks in progress when we deploy this code?

**Current Status:**
- First deploy creates `state/process/` directory structure
- No migration script for existing state
- Tasks mid-phase when deployment happens: unknown behavior

**Deployment Plan:**

**Phase 1: Fresh Install (New Deployments)**
```bash
# state/process/ directory structure created on first run
mkdir -p state/process
# Files created automatically:
# - ledger.jsonl (phase ledger)
# - prompt_baselines.json (attestation baselines)
# - prompt_attestations.jsonl (attestation log)
```

**Phase 2: Rolling Update (Existing Deployments)**
```bash
# Option A: Pause queue during rollout
1. Stop accepting new tasks
2. Wait for in-flight tasks to complete
3. Deploy new code
4. Resume task queue

# Option B: Graceful cutover
1. Deploy new code (enforcement disabled via flag)
2. Let in-flight tasks complete
3. Enable enforcement
4. Monitor for issues
```

**Phase 3: State Migration (If Needed)**
```bash
# If state format changes in future:
tools/wvo_mcp/scripts/migrate_enforcement_state.sh
```

**Rollback Plan:**
```bash
# If issues occur:
1. Disable enforcement via env var: DISABLE_PHASE_ENFORCEMENT=1
2. Roll back to previous version
3. Clear state/process/ if corrupted
4. Tasks resume with no enforcement
```

**Estimated Effort:** 1 hour (documentation)
**Target:** Before first production deployment
**Owner:** TBD

---

## Implementation Priority Matrix

### CRITICAL (Do Before Production Deploy)
1. ✅ Enable SQLite WAL mode (5 min)
2. 🚨 Set up monitoring dashboards (2 hours)

### HIGH (Do Week 1 Post-Deploy)
3. ⚠️ Fix JSONL race condition with file locking (30 min)
4. 📊 Run performance benchmark (1 hour)
5. 🔍 Audit evidence collector cleanup (1 hour)

### MEDIUM (Do Week 2-3 Post-Deploy)
6. 🔄 Add lease renewal retry logic (30 min)
7. 📋 Document deployment/migration strategy (1 hour)
8. 🧪 Add stress test suite (4 hours)

### LOW (Do Month 1+ Post-Deploy)
9. 📈 Calibrate severity thresholds (ongoing)
10. 🎯 Expand test coverage (ongoing)

---

## Success Metrics

**Week 1:**
- ✅ Zero production incidents caused by anti-drift mechanisms
- ✅ Evidence gate failure rate <2%
- ✅ Prompt drift detection functioning (any severity OK)
- ✅ No lease contention deadlocks

**Month 1:**
- ✅ Phase transition p95 latency <50ms
- ✅ Monitoring dashboards operational
- ✅ All HIGH priority fixes deployed
- ✅ Zero memory leaks detected

**Month 3:**
- ✅ All MEDIUM priority fixes deployed
- ✅ Severity calibration based on production data
- ✅ Stress tests passing
- ✅ Production confidence: can promote to blocking mode

---

## Contact & Ownership

**Document Owner:** TBD
**Last Updated:** 2025-10-28
**Next Review:** Post-deployment +1 week

**Escalation Path:**
- Immediate issues (crashes, data loss): Page on-call
- Performance degradation: File incident, implement fixes
- Enhancement requests: Add to backlog

---

## Appendix: Quick Fix Scripts

### Enable WAL Mode
```bash
# Check current journal mode
sqlite3 state/orchestrator.db "PRAGMA journal_mode;"

# Enable WAL
sqlite3 state/orchestrator.db "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;"

# Verify
sqlite3 state/orchestrator.db "PRAGMA journal_mode;"  # Should return: wal
```

### Verify Metrics Collection
```bash
# Check that metrics are being written
tail -f state/telemetry/counters.jsonl | grep -E 'evidence_gate|prompt_drift|lease_contention'
```

### Emergency Disable
```bash
# If enforcement causes issues, disable via env var
export DISABLE_PHASE_ENFORCEMENT=1
npm start
```
