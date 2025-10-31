# THINK — Pre-Mortem and Edge Case Analysis

**Task**: FIX-DRIFT-DETECTION-IMP24
**Date**: 2025-10-30
**Analyst**: Claude (Autopilot)

---

## Pre-Mortem: How This Could Fail

**Scenario**: It's 6 months from now, and users have stopped using `check_drift.sh`. Why?

### Failure Mode 1: False Positive Overload
**What happened**: Script reports drift for every eval run, even when prompts unchanged

**Root causes**:
1. Non-deterministic prompt generation (timestamps, random IDs in prompts)
2. Hash includes irrelevant data (metadata, timestamps)
3. Whitespace differences cause hash mismatches

**Symptoms**:
- Drift detected on every run, even without PromptCompiler changes
- Users ignore alerts ("boy who cried wolf")
- Script becomes useless

**Mitigation**:
- ✅ **Pre-flight check**: Run script twice on same baseline → should report 0% drift
- ✅ **Hash content audit**: Verify attestation hash only includes prompt text, not metadata
- ✅ **Normalization**: Consider whitespace normalization (if needed)

**Detection during IMPLEMENT**:
```bash
# Smoke test: Same baseline vs itself should show 0% drift
bash check_drift.sh --baseline baseline.json --current baseline.json
# Expected: "✅ No drift detected"
# If drift detected → bug in hash comparison
```

---

### Failure Mode 2: Unactionable Alerts
**What happened**: Script says "drift detected" but user doesn't know what to do

**Root causes**:
1. Guidance output is unclear or missing
2. Recommended commands don't work (wrong paths, missing flags)
3. User doesn't understand why drift matters

**Symptoms**:
- Users see alert, ignore it ("not my problem")
- No recapture happens, drift persists
- Quality gates make decisions on stale data

**Mitigation**:
- ✅ **Clear guidance** (Task 5): "Why?", "When?", "How?" sections
- ✅ **Working commands**: Test all recommended commands (recapture baseline)
- ✅ **Examples**: Show real output in README

**Detection during VERIFY**:
- Manual review of guidance output
- Test recommended commands actually work

---

### Failure Mode 3: Script Breaks on Schema Evolution
**What happened**: Eval harness JSON schema changes, script crashes

**Root causes**:
1. Hardcoded field names (`attestation_hash` renamed to `prompt_hash`)
2. No forward compatibility (fails on unknown fields)
3. No graceful degradation (crashes instead of warning)

**Symptoms**:
- Script works, then suddenly breaks after IMP-35 update
- No error message, just `jq: error (at line X)`
- Users can't diagnose issue

**Mitigation**:
- ✅ **Graceful errors**: Catch jq failures, print context
- ✅ **Field existence check**: Verify `attestation_hash` exists before using
- ✅ **Forward compatibility**: Ignore unknown fields (jq handles this)

**Detection during VERIFY**:
```bash
# Test with minimal JSON (no extra fields)
echo '{"tasks":[{"id":"TEST-1","attestation_hash":"abc123"}]}' > /tmp/minimal.json
bash check_drift.sh --baseline /tmp/minimal.json --current /tmp/minimal.json
# Should work

# Test with extra fields (forward compat)
echo '{"tasks":[{"id":"TEST-1","attestation_hash":"abc123","new_field":"ignored"}]}' > /tmp/extra.json
bash check_drift.sh --baseline /tmp/extra.json --current /tmp/extra.json
# Should still work
```

---

### Failure Mode 4: Performance Bottleneck
**What happened**: Script takes 5 minutes to run, users bypass it

**Root causes**:
1. Inefficient jq queries (O(n²) comparison)
2. Large baseline files (100+ tasks)
3. Network I/O (if script tries to fetch remote baselines)

**Symptoms**:
- Slow CI builds (>10min just for drift check)
- Developers skip drift check to save time
- Script not used

**Mitigation**:
- ✅ **Efficient algorithm**: O(n) linear scan (Task 4 plan)
- ✅ **Local files only**: No network I/O
- ✅ **Performance KPI**: <10 seconds for 30 tasks (spec KPI 1)

**Detection during VERIFY**:
```bash
time bash check_drift.sh --baseline baseline.json --current current.json
# Should complete in <10 seconds
```

---

### Failure Mode 5: Kill Criteria Hit (>5 hours implementation)
**What happened**: Implementation takes 6 hours, task aborted per strategize kill criteria

**Root causes**:
1. Underestimated complexity (3h estimate, actually 6h)
2. Scope creep (added features not in spec)
3. Debugging issues (bash edge cases, jq syntax)

**Symptoms**:
- 3 hours in, only Task 1-3 complete (Tasks 4-8 remain)
- Another 3 hours projected (6h total)
- Kill criteria triggered

**Mitigation**:
- ✅ **Time tracking**: Check clock after each task
- ✅ **Simplify if needed**: Remove --threshold flag, hardcode 10%
- ✅ **Defer non-critical**: Skip Task 7 (docs) if running late, defer to follow-up

**Detection during IMPLEMENT**:
- After Task 4 (2h in): Check time, assess remaining work
- If >1.5h remaining → simplify or defer

---

## Edge Cases

### Edge Case 1: Baseline and Current Have Different Tasks
**Scenario**: Baseline has 30 tasks, current run has 28 tasks (2 removed)

**Question**: How to handle drift calculation?

**Options**:
1. **Use intersection**: drift_rate = mismatches / tasks_in_both (28 tasks)
2. **Use baseline**: drift_rate = mismatches / baseline_tasks (30 tasks)
3. **Fail**: Error if task lists don't match

**Decision**: Option 1 (intersection)
- Print warning: "⚠️ 2 tasks in baseline not in current run"
- Calculate drift on tasks that exist in both
- Rationale: Removed tasks aren't "drift", they're corpus changes

**Implementation** (Task 4):
```bash
if [[ -z "$current_hash" ]]; then
  echo "⚠️  WARNING: Task $task_id in baseline but not in current run (skipped?)"
  continue  # Don't count as drift
fi
```

---

### Edge Case 2: Current Has Tasks Not in Baseline
**Scenario**: Baseline has 30 tasks, current run has 32 tasks (2 new)

**Question**: Are new tasks "drift"?

**Decision**: NO, ignore new tasks
- Only check tasks that exist in baseline
- New tasks = corpus expansion, not drift
- Print info: "ℹ️ 2 tasks in current run not in baseline (new tasks added)"

**Implementation**:
```bash
# Iterate over baseline tasks only
while IFS='=' read -r task_id baseline_hash; do
  # Look up in current...
done <<< "$baseline"  # Only baseline tasks checked
```

---

### Edge Case 3: Empty Baseline (0 tasks)
**Scenario**: Baseline file exists but has no tasks (`{"tasks": []}`)

**Question**: What does "drift" mean for empty baseline?

**Decision**: ERROR
- Empty baseline is invalid (can't compare)
- Error message: "Baseline has 0 tasks (invalid baseline, recapture needed)"
- Exit code: 2 (error)

**Implementation**:
```bash
if [[ $(echo "$baseline" | wc -l) -eq 0 ]]; then
  echo "❌ ERROR: Baseline has 0 tasks (invalid baseline)"
  exit 2
fi
```

---

### Edge Case 4: All Hashes Match but Different Order
**Scenario**: Baseline tasks in order [A, B, C], current tasks in order [B, A, C]

**Question**: Is reordering "drift"?

**Decision**: NO
- Hash comparison is by task ID (lookup), not position
- Order doesn't matter, only hash values
- No special handling needed

**Implementation**: Already handled (Task 4 uses grep to find by ID)

---

### Edge Case 5: Threshold Exactly at Boundary (10.0%)
**Scenario**: 10 tasks, 1 drift → 10.0% drift, threshold 10%

**Question**: Is 10.0% == 10% a match or exceeds?

**Decision**: Match (no alert)
- Use `>` not `>=` in comparison
- 10% is acceptable, 10.1% is not
- Conservative: avoid false positives

**Implementation**:
```bash
if (( $(echo "$drift_rate > $threshold" | bc -l) )); then
  # Drift detected (strict >)
fi
```

---

### Edge Case 6: Hash is Null or Empty String
**Scenario**: Task has `"attestation_hash": null` or `"attestation_hash": ""`

**Question**: How to handle?

**Decision**: WARN, treat as drift
- Missing hash = can't compare = assume drift
- Warning: "⚠️ Task X has null/empty attestation hash (old format?)"
- Count as drifted (conservative)

**Implementation**:
```bash
if [[ -z "$baseline_hash" ]]; then
  echo "⚠️  WARNING: Task $task_id has empty hash in baseline"
  ((drift_count++))  # Conservative: count as drift
fi
```

---

### Edge Case 7: jq Not Installed
**Scenario**: User runs script on system without jq

**Question**: Fail gracefully or crash with `command not found`?

**Decision**: Fail gracefully (pre-flight check)

**Implementation**:
```bash
#!/usr/bin/env bash

# Pre-flight check
if ! command -v jq &>/dev/null; then
  echo "❌ ERROR: jq is required but not installed"
  echo "Install: brew install jq  (macOS)"
  echo "         apt-get install jq  (Ubuntu)"
  exit 2
fi
```

---

### Edge Case 8: Baseline Path Has Spaces
**Scenario**: `bash check_drift.sh --baseline "/path/with spaces/baseline.json"`

**Question**: Does path parsing break?

**Decision**: Must handle correctly (quote all variable expansions)

**Implementation**:
```bash
# WRONG (breaks on spaces)
load_baseline_hashes $baseline_path

# CORRECT (quotes preserve spaces)
load_baseline_hashes "$baseline_path"
```

**Verification**: Test with path containing spaces

---

### Edge Case 9: Concurrent Runs (Race Condition)
**Scenario**: Two users run check_drift.sh simultaneously

**Question**: Could this cause corruption or conflicts?

**Decision**: NO RISK
- Script is read-only (no file writes)
- No shared state between invocations
- Safe to run concurrently

**No mitigation needed**

---

### Edge Case 10: Very Large Hashes (>1KB)
**Scenario**: Attestation hash is 2KB (very long prompt)

**Question**: Does output become unreadable?

**Decision**: Truncate in output (first 10 chars)

**Implementation** (already in Task 4 plan):
```bash
echo "  - $task_id: ${baseline_hash:0:10}... → ${current_hash:0:10}..."
# Truncates to 10 chars for readability
```

---

## Assumptions to Validate

### Assumption 1: Attestation hashes are stable
**Assumption**: Running eval with same prompts twice produces identical hashes

**Why this matters**: If hashes are non-deterministic, script reports false drift

**Validation**: Run eval twice with no changes, compare hashes

**Risk if false**: High (script unusable)

---

### Assumption 2: jq is available
**Assumption**: jq is installed on all systems where script runs

**Why this matters**: Script fails without jq

**Validation**: Pre-flight check (Edge Case 7)

**Risk if false**: Medium (script fails, but error is clear)

---

### Assumption 3: Baseline format is stable
**Assumption**: `{"tasks": [{"id": "...", "attestation_hash": "..."}]}` format won't change

**Why this matters**: Schema change breaks script

**Validation**: Forward compatibility (Failure Mode 3 mitigation)

**Risk if false**: Medium (fixable with script update)

---

### Assumption 4: 10% threshold is appropriate
**Assumption**: 10% drift threshold balances false positives vs false negatives

**Why this matters**: Too strict → alert fatigue, too lenient → miss real drift

**Validation**: Empirical (requires real usage data)

**Risk if false**: Low (threshold is configurable)

---

### Assumption 5: Baseline is authoritative
**Assumption**: Baseline represents "correct" prompts to test

**Why this matters**: If baseline is stale/wrong, drift alerts are meaningless

**Validation**: User responsibility (recapture baseline when needed)

**Risk if false**: Medium (user error, not script error)

---

## Mitigation Summary

| Risk | Mitigation | Implemented In |
|------|------------|----------------|
| False positives | Self-comparison smoke test | VERIFY (Task 8) |
| Unactionable alerts | Clear guidance output | IMPLEMENT (Task 5) |
| Schema evolution | Graceful error handling | IMPLEMENT (Task 6) |
| Performance | Efficient algorithm, <10s KPI | PLAN (Task 4), VERIFY |
| Kill criteria | Time tracking, simplify if needed | IMPLEMENT (all tasks) |
| Missing jq | Pre-flight check | IMPLEMENT (Task 1) |
| Path with spaces | Quote all expansions | IMPLEMENT (all tasks) |
| Empty baseline | Explicit error check | IMPLEMENT (Task 2) |
| Null hashes | Warn and count as drift | IMPLEMENT (Task 4) |

---

## Critical Questions Before IMPLEMENT

1. **Are attestation hashes deterministic?**
   - How to validate: Run eval twice, compare hashes
   - If not: BLOCK (script unusable)

2. **What is the baseline file format exactly?**
   - How to validate: Read real baseline file if exists
   - If format differs from assumed: Update Task 2/3

3. **Is jq available in CI?**
   - How to validate: Check CI environment
   - If not: Add jq installation to CI setup

4. **What is acceptable drift threshold empirically?**
   - How to validate: Requires real usage data (defer)
   - If unknown: Use 10% as default, make configurable

---

## Next Phase

**IMPLEMENT**: Begin Task 1 (Skeleton + Args), proceed sequentially through Task 8

**Critical checkpoint after Task 4**: Time check
- If >2.5 hours elapsed → assess remaining work
- If >1.5 hours remaining → simplify (remove --threshold, skip full docs)
