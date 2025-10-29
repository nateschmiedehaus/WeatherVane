# IMP-FUND-09: Pre-Feature Monitoring Period Setup - THINK

## Edge Cases

### Edge Case 1: Phase Ledger Doesn't Exist
**Scenario**: Fresh workspace, no phase_ledger.jsonl yet

**Impact**: grep fails, metrics are wrong

**Mitigation**:
- Use `2>/dev/null || echo "0"` pattern
- Returns 0 for missing files
- Script doesn't fail, just reports 0 metrics

**Verification**: Test in empty directory

### Edge Case 2: Empty Phase Ledger
**Scenario**: Ledger exists but has 0 entries

**Impact**: grep -c returns 0 (correct)

**Mitigation**: Not needed, works correctly

**Verification**: Test with empty file

### Edge Case 3: Malformed Phase Ledger
**Scenario**: Ledger has invalid JSON lines

**Impact**: grep still counts lines (may be inaccurate)

**Mitigation**:
- Accept this limitation (grep is simple)
- If accuracy critical, add JSON validation
- For baseline monitoring, simple grep sufficient

**Verification**: Test with malformed entries

### Edge Case 4: Multiple Snapshots Same Timestamp
**Scenario**: Script runs twice in same second

**Impact**: Second snapshot overwrites first

**Mitigation**:
- Use UTC timestamp with seconds precision
- Low likelihood (CI runs daily)
- If critical, add milliseconds or counter

**Verification**: Run script twice rapidly

### Edge Case 5: Disk Full
**Scenario**: No space to write snapshot

**Impact**: Script fails, CI fails (good)

**Mitigation**:
- Let it fail loudly
- CI failure alerts humans
- Snapshots are small (< 1KB each)

**Verification**: Not practical to test

### Edge Case 6: Evidence Directory Missing
**Scenario**: No state/evidence/ directory

**Impact**: find returns 0 tasks (correct)

**Mitigation**: Not needed, works correctly

**Verification**: Test without evidence directory

### Edge Case 7: CI Runs Before Any Tasks Complete
**Scenario**: Day 1, no evidence yet

**Impact**: Snapshot shows 0 tasks (correct)

**Mitigation**: Not needed, accurate representation

**Verification**: First snapshot will demonstrate this

### Edge Case 8: Phase Ledger Format Changes
**Scenario**: Future work changes ledger structure

**Impact**: grep patterns may not match

**Mitigation**:
- Version field in snapshot (schema evolution)
- Script documentation explains grep patterns
- Update script when ledger changes

**Verification**: Not applicable yet

## Failure Modes

### Failure Mode 1: Script Fails Mid-Execution
**Cause**: Bash error (syntax, permissions, etc.)

**Impact**: CI fails, no snapshot generated

**Recovery**:
- CI failure is visible
- Fix script, redeploy
- Previous snapshots unaffected

**Prevention**: Test locally first

### Failure Mode 2: JSON Malformed
**Cause**: Heredoc syntax error

**Impact**: Snapshot invalid, can't parse

**Recovery**:
- jq validation in VERIFY catches this
- Fix syntax, regenerate

**Prevention**: Test with jq during VERIFY

### Failure Mode 3: Metrics Drift Over Time
**Cause**: Ledger accumulates entries, counts grow

**Impact**: Expected behavior, not a failure

**Handling**: This is the baseline data we want

### Failure Mode 4: CI Workflow Disabled
**Cause**: Someone disables scheduled workflow

**Impact**: Monitoring stops, no new snapshots

**Detection**: Evidence staleness check (IMP-FUND-08)

**Recovery**: Re-enable workflow

## Assumptions

1. **Phase ledger exists** - True after IMP-FUND-01
2. **Evidence directories exist** - True after IMP-FUND-02
3. **grep/find available** - True on all Unix systems
4. **CI has write access** - True for GitHub Actions
5. **1 snapshot/day sufficient** - True for baseline period
6. **Metrics don't need real-time updates** - True (daily is fine)

## Constraints

1. **No external dependencies** - Only standard Unix tools
2. **< 10 second execution** - Simple operations, fast
3. **< 1KB per snapshot** - JSON is compact
4. **Idempotent** - Can run multiple times safely
5. **Non-blocking on errors** - Uses || echo "0" pattern

## Alternative Approaches (Revisited)

After STRATEGIZE evaluation, reconsidering in THINK phase:

**Python Script** (rejected in STRATEGIZE):
- Pro: Richer data structures, easier JSON handling
- Con: Adds dependency, improvement plan says .sh not .py
- Decision: Still reject, bash is simpler

**Real-time Monitoring** (out of scope):
- Pro: Instant visibility into violations
- Con: Overkill for baseline period, complex
- Decision: Keep out of scope

**Manual Weekly Reviews** (rejected in STRATEGIZE):
- Pro: No automation needed
- Con: Not repeatable, error-prone
- Decision: Still reject

## Risk Assessment Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Metrics inaccurate | Low | High | Cross-validation in VERIFY |
| Script fails silently | Low | High | CI failure detection |
| Baseline never starts | HIGH | CRITICAL | THIS TASK |
| Script becomes stale | Medium | Low | Version field, clear errors |
| Disk space issues | Very Low | Medium | Let it fail loudly |
| Ledger format changes | Low | Medium | Version field, update script |

**High Priority Risks**: Baseline never starts (FIXED BY THIS TASK)
**Medium Priority Risks**: Metrics accuracy (addressed by cross-validation)
**Low Priority Risks**: Script staleness (monitored, easy to fix)

