# IMP-FUND-09: Pre-Feature Monitoring Period Setup - SPEC

## Acceptance Criteria

### AC1: Monitoring Script Exists
- Script at `scripts/create_process_snapshot.sh` exists and is executable
- Script runs without errors on first invocation
- Script creates `state/analytics/process_monitoring/` directory if missing

### AC2: Snapshot Format Correct
- Snapshot is valid JSON with required fields:
  - timestamp (ISO 8601 format)
  - version (semantic versioning)
  - metrics object with:
    - phase_skips (integer)
    - backtracks (integer)
    - process_violations (integer)
    - tasks_completed (integer)
    - drift_detections (integer)
  - sources object documenting data sources

### AC3: Metrics Accurate
- phase_skips count matches phase_ledger.jsonl actual skips
- backtracks count matches phase_ledger.jsonl actual backtracks
- tasks_completed matches number of monitor.md files in evidence/
- drift_detections matches phase_ledger.jsonl drift entries
- Verified against known state (8 tasks completed matches reality)

### AC4: Initial Snapshot Captured
- At least one snapshot exists in state/analytics/process_monitoring/
- Snapshot shows clean baseline (0 violations expected)
- Snapshot timestamp is current

### AC5: CI Integration Works
- GitHub Actions workflow exists
- Workflow calls correct script path
- Script succeeds when run manually
- No Python dependency required (shell script only)

### AC6: Documentation Updated
- Improvement plan updated with actual completion date
- Evidence chain complete (STRATEGIZE → MONITOR)
- Snapshot location documented
- How to verify baseline documented

## Non-Functional Requirements

### Performance
- Script executes in < 10 seconds
- Handles up to 10,000 ledger entries
- Minimal disk space (< 1MB per snapshot)

### Reliability
- Script fails fast with clear error messages
- Non-blocking on missing files (returns 0 for missing data)
- Idempotent (can run multiple times safely)

### Maintainability
- Clear comments explaining each metric
- Version field enables future schema changes
- Sources documented for troubleshooting

## Success Metrics

- ✅ Initial snapshot captured with 0 violations
- ✅ Script runs successfully in CI
- ✅ 1-2 week baseline period can begin immediately
- ✅ Phase 1 unblocked once baseline complete

## Out of Scope

- ❌ Real-time monitoring (daily snapshots sufficient)
- ❌ Alerting (manual review of snapshots)
- ❌ Trend analysis (Phase 2 feature)
- ❌ Integration with external systems
- ❌ Historical data migration

## Verification Mapping

| Criterion | Verification Method |
|-----------|-------------------|
| AC1 | File exists check, chmod check, execution test |
| AC2 | jq validation, schema check |
| AC3 | Cross-validation against known state |
| AC4 | Directory listing, timestamp check |
| AC5 | Manual workflow dispatch, CI logs |
| AC6 | Evidence directory complete, docs updated |

