# IMP-FUND-09: Pre-Feature Monitoring Period Setup - PLAN

## Implementation Steps

### Step 1: Create Monitoring Script (20 min)
**File**: `scripts/create_process_snapshot.sh`

**Tasks**:
1. Create bash script with shebang and error handling
2. Define workspace root, output directory, timestamp
3. Create output directory if missing
4. Collect metrics from phase_ledger.jsonl:
   - grep -c for phase_skips, backtracks, violations, drift
5. Count completed tasks: find evidence/ -name monitor.md
6. Generate JSON output with metrics
7. Make script executable (chmod +x)

**Dependencies**: grep, find, date, cat (all standard)

### Step 2: Test Script Manually (10 min)
1. Run script: `bash scripts/create_process_snapshot.sh`
2. Verify output directory created
3. Verify JSON is valid (jq .)
4. Verify metrics match reality
5. Run second time to ensure idempotent

### Step 3: Capture Initial Snapshot (5 min)
1. Run script to generate snapshot_TIMESTAMP.json
2. Review metrics (expect 0 violations, 8 tasks)
3. Commit snapshot as baseline

### Step 4: Verify CI Integration (5 min)
1. Check workflow file calls correct script
2. Verify workflow has correct schedule
3. Test workflow dispatch manually (optional)

### Step 5: Document Completion (10 min)
1. Update improvement plan with actual completion
2. Create evidence chain artifacts
3. Document how to verify baseline

## Files Changed

### New Files
- `scripts/create_process_snapshot.sh` (~60 lines)
- `state/analytics/process_monitoring/snapshot_*.json` (generated)
- `state/evidence/IMP-FUND-09/strategize/strategy.md`
- `state/evidence/IMP-FUND-09/spec/spec.md`
- `state/evidence/IMP-FUND-09/plan/plan.md` (this file)
- `state/evidence/IMP-FUND-09/think/edge_cases.md`
- `state/evidence/IMP-FUND-09/implement/notes.md`
- `state/evidence/IMP-FUND-09/verify/verification.md`
- `state/evidence/IMP-FUND-09/review/review.md`
- `state/evidence/IMP-FUND-09/pr/summary.md`
- `state/evidence/IMP-FUND-09/monitor/completion.md`

### Modified Files
- `.github/workflows/process-monitoring.yml` (already exists, no changes needed)

### Total Changes
- Lines added: ~400 (script + evidence)
- Lines removed: 0
- Net change: +400

## Rollback Plan

### Soft Rollback (if monitoring problematic)
1. Disable CI workflow: comment out schedule in .github/workflows/process-monitoring.yml
2. Time: < 2 minutes
3. Impact: Monitoring stops, but existing snapshots remain

### Hard Rollback (if script causes issues)
1. Delete script: `rm scripts/create_process_snapshot.sh`
2. Delete snapshots: `rm -rf state/analytics/process_monitoring/`
3. Revert workflow change (if modified)
4. Time: < 5 minutes
5. Impact: Complete removal, back to pre-IMP-FUND-09 state

### Rollback Decision Tree
- Script fails in CI? → Check logs, fix script, redeploy
- Metrics inaccurate? → Fix metric collection logic, regenerate
- Blocking other work? → Soft rollback, debug offline
- Fundamentally broken? → Hard rollback, redesign

## Dependencies

**Blocks**:
- IMP-FUND-09 completion certification
- Phase 1 start (1-2 weeks after this completes)

**Depends On**:
- Phase ledger exists (IMP-FUND-01) ✅
- Evidence directories exist (IMP-FUND-02) ✅
- Git repository accessible ✅
- GitHub Actions enabled ✅

## Time Estimates

- STRATEGIZE: 15 min (DONE)
- SPEC: 10 min (DONE)
- PLAN: 10 min (IN PROGRESS)
- THINK: 10 min
- IMPLEMENT: 20 min (script already exists, need to verify)
- VERIFY: 15 min
- REVIEW: 10 min
- PR: 10 min
- MONITOR: Ongoing (1-2 weeks baseline collection)

**Total Work**: ~2 hours
**Baseline Period**: 1-2 weeks

## Risk Mitigation

From STRATEGIZE risks:
1. Metrics inaccurate → Step 2 includes cross-validation
2. Monitoring fails silently → CI fails on error, manual verify
3. Baseline never starts → This task ensures it starts TODAY
4. Script becomes stale → Version field, clear error messages

