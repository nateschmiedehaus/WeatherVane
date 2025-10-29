# Phase -1 Monitoring Setup

**Purpose**: Comprehensive observability for Phase -1 work process enforcement and anti-drift mechanisms.

---

## Quick Start

```bash
# View enforcement metrics in real-time
tail -f tools/wvo_mcp/state/telemetry/counters.jsonl

# Check phase transition history
sqlite3 tools/wvo_mcp/state/process/phase_ledger.db "SELECT * FROM phase_transitions ORDER BY timestamp DESC LIMIT 10;"

# View drift detections
tail -f tools/wvo_mcp/state/process/prompt_attestations.jsonl | jq 'select(.drift_detected == true)'

# Check phase lease contention
sqlite3 tools/wvo_mcp/state/process/phase_leases.db "SELECT * FROM leases WHERE released_at IS NULL;"
```

---

## Metrics Architecture

### 1. Lightweight Counters (JSONL)

**File**: `tools/wvo_mcp/state/telemetry/counters.jsonl`

**Purpose**: High-frequency events that don't need aggregation

**Schema**:
```json
{
  "counter_name": "phase_skips_attempted",
  "value": 1,
  "labels": {
    "task_id": "TASK-001",
    "phase": "STRATEGIZE",
    "reason": "task_started_with_in_progress"
  },
  "timestamp": "2025-10-28T12:34:56.789Z"
}
```

**Key Metrics**:
- `phase_skips_attempted`: Tasks attempting to skip STRATEGIZE phase
- `phase_validations_failed`: Phase sequence validations that failed
- `evidence_gate_failed`: Evidence gates that blocked transitions
- `phase_lease_timeout`: Phase lease acquisitions that timed out
- `prompt_drift_detected`: SHA-256 prompt hash mismatches

**Query Examples**:
```bash
# Count phase skip attempts by reason
jq -r 'select(.counter_name == "phase_skips_attempted") | .labels.reason' counters.jsonl | sort | uniq -c

# Find all evidence gate failures
jq 'select(.counter_name == "evidence_gate_failed")' counters.jsonl

# Drift detection rate (last 100 events)
tail -100 counters.jsonl | jq 'select(.counter_name == "prompt_drift_detected")' | wc -l
```

### 2. Phase Ledger (Immutable SQLite)

**File**: `tools/wvo_mcp/state/process/phase_ledger.db`

**Purpose**: Cryptographic audit trail of all phase transitions

**Schema**:
```sql
CREATE TABLE phase_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  from_phase TEXT NOT NULL,
  to_phase TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  artifacts TEXT,  -- JSON array
  evidence_validated BOOLEAN,
  validation_passed BOOLEAN,
  metadata TEXT,   -- JSON
  previous_hash TEXT,
  current_hash TEXT  -- SHA-256 chain
);
```

**Query Examples**:
```sql
-- Phase sequence for a task
SELECT from_phase || ' → ' || to_phase as transition, timestamp, evidence_validated
FROM phase_transitions
WHERE task_id = 'TASK-001'
ORDER BY id;

-- Evidence gate rejection rate
SELECT
  CAST(SUM(CASE WHEN evidence_validated = 0 THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*) * 100 as rejection_rate_percent
FROM phase_transitions;

-- Verify hash chain integrity
WITH ordered AS (
  SELECT id, task_id, previous_hash, current_hash,
         LAG(current_hash) OVER (PARTITION BY task_id ORDER BY id) as expected_previous
  FROM phase_transitions
)
SELECT * FROM ordered
WHERE previous_hash != expected_previous AND previous_hash IS NOT NULL;
```

### 3. Prompt Attestations (JSONL)

**File**: `tools/wvo_mcp/state/process/prompt_attestations.jsonl`

**Purpose**: Detect prompt drift between task cycles

**Schema**:
```json
{
  "attestation_id": "uuid",
  "task_id": "TASK-001",
  "phase": "IMPLEMENT",
  "prompt_hash": "sha256...",
  "baseline_hash": "sha256...",
  "drift_detected": true,
  "drift_details": "Prompt specification changed...",
  "timestamp": "2025-10-28T12:34:56.789Z",
  "agent_type": "planner_agent",
  "prompt_version": "claude-sonnet-4"
}
```

**Query Examples**:
```bash
# Drift detection by phase
jq -r 'select(.drift_detected == true) | .phase' prompt_attestations.jsonl | sort | uniq -c

# High-severity drift (critical phases)
jq 'select(.drift_detected == true and (.phase == "VERIFY" or .phase == "REVIEW" or .phase == "MONITOR"))' prompt_attestations.jsonl

# Drift rate by agent type
jq -r '.agent_type' prompt_attestations.jsonl | sort | uniq -c
```

### 4. Phase Leases (SQLite)

**File**: `tools/wvo_mcp/state/process/phase_leases.db`

**Purpose**: Prevent concurrent phase access in multi-agent scenarios

**Schema**:
```sql
CREATE TABLE leases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  released_at TEXT,
  duration_ms INTEGER,
  UNIQUE(task_id, phase)
);
```

**Query Examples**:
```sql
-- Active leases (not yet released)
SELECT task_id, phase, agent_id, acquired_at
FROM leases
WHERE released_at IS NULL;

-- Lease contention (multiple agents attempting same task/phase)
SELECT task_id, phase, COUNT(*) as attempts
FROM leases
GROUP BY task_id, phase
HAVING attempts > 1;

-- Average lease duration by phase
SELECT phase, AVG(duration_ms) as avg_duration_ms
FROM leases
WHERE released_at IS NOT NULL
GROUP BY phase;
```

---

## Dashboards

### 1. Enforcement Health Dashboard

**Metrics**:
- Phase skip attempts per hour
- Evidence gate rejection rate
- Drift detection rate
- Validation failure rate

**Alert Thresholds**:
- Phase skips > 5/hour → CRITICAL
- Evidence gate rejection > 30% → WARNING
- Drift detection > 10% → WARNING
- Validation failures > 5% → WARNING

**Implementation**:
```bash
#!/bin/bash
# tools/wvo_mcp/scripts/enforcement_health_check.sh

echo "=== Phase -1 Enforcement Health ==="

# 1. Phase skip attempts (last hour)
phase_skips=$(jq -r "select(.counter_name == \"phase_skips_attempted\" and (.timestamp | fromdateiso8601) > (now - 3600))" state/telemetry/counters.jsonl | wc -l)
echo "Phase skips (last hour): $phase_skips"
[ "$phase_skips" -gt 5 ] && echo "⚠️  ALERT: High phase skip rate!"

# 2. Evidence gate rejection rate
total_transitions=$(sqlite3 state/process/phase_ledger.db "SELECT COUNT(*) FROM phase_transitions;")
rejected=$(sqlite3 state/process/phase_ledger.db "SELECT COUNT(*) FROM phase_transitions WHERE evidence_validated = 0;")
rejection_rate=$(echo "scale=2; $rejected * 100 / $total_transitions" | bc)
echo "Evidence gate rejection rate: ${rejection_rate}%"
[ $(echo "$rejection_rate > 30" | bc) -eq 1 ] && echo "⚠️  WARNING: High rejection rate!"

# 3. Drift detection rate
drift_detections=$(jq -r 'select(.drift_detected == true)' state/process/prompt_attestations.jsonl | wc -l)
total_attestations=$(wc -l < state/process/prompt_attestations.jsonl)
drift_rate=$(echo "scale=2; $drift_detections * 100 / $total_attestations" | bc)
echo "Drift detection rate: ${drift_rate}%"
[ $(echo "$drift_rate > 10" | bc) -eq 1 ] && echo "⚠️  WARNING: High drift rate!"
```

### 2. Performance Dashboard

**Metrics**:
- Phase transition latency (p50, p95, p99)
- Phase lease acquisition latency
- Evidence collection duration
- Prompt attestation latency

**Benchmark Targets**:
- Phase transition p50: <20ms
- Phase transition p95: <50ms
- Phase transition p99: <100ms
- Lease acquisition p95: <10ms
- Prompt attestation p95: <5ms

**Script**: `tools/wvo_mcp/scripts/benchmark_phase_transitions.ts`

### 3. Audit Trail Dashboard

**Purpose**: Verify enforcement integrity

**Checks**:
- Hash chain continuity (no broken links)
- Phase sequence validity (no skips)
- Evidence completeness (all gates passed)
- Lease release (no abandoned locks)

**Implementation**:
```bash
#!/bin/bash
# tools/wvo_mcp/scripts/audit_trail_check.sh

echo "=== Phase -1 Audit Trail Check ==="

# 1. Hash chain integrity
broken_chains=$(sqlite3 state/process/phase_ledger.db "
  WITH ordered AS (
    SELECT id, previous_hash, current_hash,
           LAG(current_hash) OVER (ORDER BY id) as expected_previous
    FROM phase_transitions
  )
  SELECT COUNT(*) FROM ordered
  WHERE previous_hash != expected_previous AND previous_hash IS NOT NULL;
")
echo "Broken hash chains: $broken_chains"
[ "$broken_chains" -gt 0 ] && echo "❌ CRITICAL: Hash chain compromised!"

# 2. Phase sequence violations
violations=$(sqlite3 state/process/phase_ledger.db "
  SELECT COUNT(*) FROM phase_transitions
  WHERE from_phase != 'STRATEGIZE' AND
        NOT EXISTS (SELECT 1 FROM phase_transitions pt2
                    WHERE pt2.task_id = phase_transitions.task_id
                    AND pt2.id < phase_transitions.id);
")
echo "Phase sequence violations: $violations"
[ "$violations" -gt 0 ] && echo "❌ CRITICAL: Phase skips detected!"

# 3. Abandoned leases
abandoned=$(sqlite3 state/process/phase_leases.db "
  SELECT COUNT(*) FROM leases
  WHERE released_at IS NULL
  AND (julianday('now') - julianday(acquired_at)) * 86400 > 300;
")
echo "Abandoned leases (>5min): $abandoned"
[ "$abandoned" -gt 0 ] && echo "⚠️  WARNING: Stale leases detected!"
```

---

## Alerting Rules

### Critical Alerts (Page Immediately)

1. **Hash Chain Compromise**
   - Trigger: Broken previous_hash/current_hash link
   - Action: Stop all work, investigate tampering

2. **Phase Sequence Violation**
   - Trigger: Task bypassed STRATEGIZE phase
   - Action: Block task, audit enforcement code

3. **High Phase Skip Rate**
   - Trigger: >5 skip attempts per hour
   - Action: Check for enforcement bypass attempts

### Warning Alerts (Review Within 1 Hour)

1. **High Evidence Rejection**
   - Trigger: >30% evidence gate rejections
   - Action: Review evidence collection completeness

2. **Prompt Drift in Critical Phases**
   - Trigger: Drift detected in VERIFY/REVIEW/MONITOR
   - Action: Verify prompt changes were intentional

3. **Lease Contention**
   - Trigger: >3 agents competing for same task/phase
   - Action: Review scheduler logic

---

## Integration with OpenTelemetry

### Exporting Metrics

Convert lightweight counters to OTel metrics:

```typescript
// tools/wvo_mcp/src/telemetry/otel_exporter.ts
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('wvo-phase-enforcement');

// Counter for phase skips
const phaseSkipsCounter = meter.createCounter('phase.skips.total', {
  description: 'Total phase skip attempts',
  unit: '1'
});

// Export from JSONL
async function exportMetrics() {
  const counters = await readCounters();
  for (const counter of counters) {
    if (counter.counter_name === 'phase_skips_attempted') {
      phaseSkipsCounter.add(counter.value, counter.labels);
    }
  }
}
```

### Tracing Phase Transitions

Add GenAI spans for phase transitions:

```typescript
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('wvo-phase-enforcement');

async function advancePhase(taskId: string, toPhase: WorkPhase) {
  return tracer.startActiveSpan('phase.advance', {
    attributes: {
      'task.id': taskId,
      'phase.to': toPhase,
      'gen_ai.operation.name': 'phase_transition',
      'gen_ai.system': 'wvo'
    }
  }, async (span) => {
    const startTime = performance.now();

    // ... phase transition logic ...

    const duration = performance.now() - startTime;
    span.setAttribute('phase.transition.duration_ms', duration);
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  });
}
```

---

## Monitoring Checklist

### Daily Checks

- [ ] Review enforcement health dashboard
- [ ] Check for critical alerts
- [ ] Verify hash chain integrity
- [ ] Review drift detections

### Weekly Checks

- [ ] Analyze phase transition performance trends
- [ ] Review evidence gate rejection patterns
- [ ] Check for lease contention
- [ ] Audit phase sequence compliance

### Monthly Checks

- [ ] Review and tune alert thresholds
- [ ] Analyze long-term drift patterns
- [ ] Optimize slow phase transitions
- [ ] Update monitoring documentation

---

## Troubleshooting

### High Phase Skip Rate

**Symptoms**: Many `phase_skips_attempted` counters

**Diagnosis**:
```bash
# Find tasks attempting skips
jq -r 'select(.counter_name == "phase_skips_attempted") | .labels.task_id' counters.jsonl | sort | uniq -c | sort -rn

# Check skip reasons
jq -r 'select(.counter_name == "phase_skips_attempted") | .labels.reason' counters.jsonl | sort | uniq -c
```

**Solutions**:
- Audit task creation code for proper initial status
- Check orchestrator_loop for enforcement bypass
- Verify WorkProcessEnforcer is wired correctly

### Evidence Gate Rejections

**Symptoms**: High evidence_validated=0 rate

**Diagnosis**:
```sql
-- Find rejected phases
SELECT to_phase, COUNT(*) as rejections
FROM phase_transitions
WHERE evidence_validated = 0
GROUP BY to_phase
ORDER BY rejections DESC;
```

**Solutions**:
- Review evidence completion criteria
- Check artifact path extraction logic
- Verify build/test evidence collection

### Prompt Drift

**Symptoms**: Many `drift_detected: true` attestations

**Diagnosis**:
```bash
# Find drifting tasks
jq -r 'select(.drift_detected == true) | .task_id' prompt_attestations.jsonl | sort | uniq -c

# Check drift severity
jq -r 'select(.drift_detected == true) | .phase' prompt_attestations.jsonl | sort | uniq -c
```

**Solutions**:
- Verify prompt changes were intentional
- Reset baselines if prompts legitimately changed
- Check context truncation logic

---

## Performance Benchmarks

**Baseline** (from benchmark_phase_transitions.ts):

| Operation | Iterations | p50 | p95 | p99 | Status |
|-----------|-----------|-----|-----|-----|--------|
| Phase Ledger Append | 1000 | 2.3ms | 8.1ms | 15.2ms | ✅ PASS |
| Phase Lease Acquire | 1000 | 1.8ms | 5.4ms | 12.1ms | ✅ PASS |
| Phase Lease Release | 1000 | 0.9ms | 3.2ms | 7.8ms | ✅ PASS |
| Prompt Attestation | 1000 | 3.1ms | 9.7ms | 18.3ms | ✅ PASS |

**Acceptance Criteria**: p50 <20ms, p95 <50ms, p99 <100ms

---

## Related Documentation

- [Phase -1 Implementation Status](PHASE_-1_REAL_STATUS.md) - Current status
- [Work Process Examples](WORK_PROCESS_EXAMPLES.md) - Enforcement examples
- [Observability-OTel-GenAI.md](autopilot/Observability-OTel-GenAI.md) - OTel integration
- [Anti-Drift Architecture](autopilot/IMPOSSIBLE_TO_FAKE_ENFORCEMENT.md) - Design principles
