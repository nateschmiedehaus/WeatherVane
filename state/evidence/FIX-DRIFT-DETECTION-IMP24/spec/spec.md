# SPEC — FIX-DRIFT-DETECTION-IMP24

**Task**: Automate attestation hash drift detection (IMP-35 follow-up)
**Date**: 2025-10-30
**Spec Author**: Claude (Autopilot)

---

## Target Completion Tier

**Tier 2 - Production-Ready**

**Justification**:
- Drift detection is a monitoring/observability tool (not critical path)
- Failure mode is safe: missed drift → manual checking (existing Tier 2 state)
- Success mode: automated alerts save time, improve confidence
- Tier 2 criteria sufficient: works reliably, documented, rollback-safe

**Tier 2 Criteria for this task**:
- ✅ Core functionality (hash comparison, drift alerts)
- ✅ Basic error handling (missing files, malformed JSON)
- ✅ Documentation (usage, interpretation, troubleshooting)
- ✅ Smoke test (can run on real baseline + current results)
- ✅ Rollback-safe (script is optional, no production dependencies)

**NOT required for Tier 2** (defer to Tier 3 if needed):
- ⏸️ Comprehensive test suite (unit tests, edge cases)
- ⏸️ CI integration (automated runs on every commit)
- ⏸️ Advanced threshold tuning (multiple drift categories)
- ⏸️ Auto-remediation (baseline recapture automation)

---

## Acceptance Criteria

### AC1: Load Baseline Attestation Hashes ✅

**Requirement**: Script reads attestation hashes from baseline eval results

**Test**:
```bash
# Given baseline file exists
test -f tools/wvo_mcp/evals/results/baseline/prompt_eval_baseline.json

# When drift check runs
bash tools/wvo_mcp/scripts/check_drift.sh

# Then baseline hashes are loaded
# (verify via debug output or exit code)
```

**Acceptance**: Script successfully parses baseline JSON and extracts `attestation_hash` field from each task result

**Error handling**:
- If baseline file missing → error: "Baseline not found. Run: bash scripts/run_integrated_evals.sh --baseline"
- If JSON malformed → error: "Baseline JSON invalid at line X"
- If attestation_hash field missing → error: "Baseline missing attestation hashes (old format?)"

---

### AC2: Load Current Run Attestation Hashes ✅

**Requirement**: Script reads attestation hashes from latest eval run

**Test**:
```bash
# Given current run file exists
LATEST=$(ls -t tools/wvo_mcp/evals/results/runs/*.json | head -1)
test -f "$LATEST"

# When drift check runs
bash tools/wvo_mcp/scripts/check_drift.sh --current "$LATEST"

# Then current hashes are loaded
```

**Acceptance**: Script successfully parses current run JSON and extracts `attestation_hash` field from each task result

**Error handling**:
- If no runs exist → error: "No eval runs found. Run: bash scripts/run_integrated_evals.sh --mode full"
- If JSON malformed → error: "Current run JSON invalid at line X"
- If attestation_hash field missing → error: "Current run missing attestation hashes (compiler integration not enabled?)"

---

### AC3: Compare Hashes and Detect Drift >10% ✅

**Requirement**: Script compares hashes, alerts if mismatch exceeds threshold

**Algorithm**:
```
drift_count = 0
total_tasks = 0

for each task in baseline:
  if task.attestation_hash != current[task.id].attestation_hash:
    drift_count++
  total_tasks++

drift_rate = drift_count / total_tasks

if drift_rate > 0.10:
  exit 1  # Drift detected
else:
  exit 0  # No significant drift
```

**Test scenarios**:

**Scenario 1: No drift (0%)**
- Baseline: 10 tasks, all hashes match current
- Expected: exit 0, message "✅ No drift detected (0/10 tasks)"

**Scenario 2: Minor drift (5%)**
- Baseline: 20 tasks, 1 hash mismatch
- Expected: exit 0, message "⚠️ Minor drift detected (1/20 tasks, 5.0%) - within tolerance"

**Scenario 3: Significant drift (15%)**
- Baseline: 20 tasks, 3 hash mismatches
- Expected: exit 1, message "❌ DRIFT DETECTED (3/20 tasks, 15.0%) - recapture recommended"

**Threshold**:
- Default: 10% (configurable via `--threshold` flag)
- Rationale: 1-2 tasks drifting is expected (minor tweaks), >10% suggests systematic change

---

### AC4: Output Which Tasks Drifted ✅

**Requirement**: Script lists specific tasks that have drifted

**Output format**:
```
❌ DRIFT DETECTED (3/20 tasks, 15.0%)

Drifted tasks:
  - STRATEGIZE-001: hash changed from e4d909c290... to a1b2c3d4e5...
  - IMPLEMENT-002: hash changed from f6e8d9c0a1... to b2c3d4e5f6...
  - VERIFY-001: hash changed from 1a2b3c4d5e... to c3d4e5f6a7...

Recommendation: Recapture baseline with current prompts
  bash tools/wvo_mcp/scripts/run_integrated_evals.sh --mode full --baseline
```

**Acceptance**: User can see exactly which tasks need attention

**Details to include**:
- Task ID (e.g., STRATEGIZE-001)
- Old hash (first 10 chars for readability)
- New hash (first 10 chars)

---

### AC5: Recommend Recapture Baseline with Justification ✅

**Requirement**: Script provides actionable guidance when drift detected

**Guidance**:
```
Why recapture?
- Baseline prompts differ from production prompts
- Eval results may not reflect current behavior
- Quality gate decisions based on stale data

When to recapture:
- ✅ After PromptCompiler changes (IMP-21)
- ✅ After persona updates (IMP-22)
- ✅ After overlay changes (IMP-23)
- ✅ After major refactoring
- ❌ NOT for minor tweaks (<10% drift)

How to recapture:
  bash tools/wvo_mcp/scripts/run_integrated_evals.sh --mode full --baseline --runs 5

This will:
1. Run full eval suite 5 times (statistical confidence)
2. Calculate mean + confidence intervals
3. Update baseline file with new hashes
```

**Acceptance**: User understands why drift matters and how to fix it

---

## Key Performance Indicators (KPIs)

**KPI 1: Execution Time**
- Target: <10 seconds for 30-task baseline + current run
- Measurement: `time bash tools/wvo_mcp/scripts/check_drift.sh`
- Rationale: Fast enough for CI pre-commit hook

**KPI 2: Accuracy**
- Target: 100% correct drift detection (no false positives/negatives)
- Measurement: Manual verification of hash comparison logic
- Rationale: Trust in alerts is critical

**KPI 3: Actionability**
- Target: ≥90% of users understand output without reading docs
- Measurement: User testing (if available) or self-review
- Rationale: Clear output = higher adoption

---

## Non-Functional Requirements

### NFR1: Backward Compatibility
- Must work with existing baseline files (no schema changes)
- If baseline missing attestation hashes → clear error (not crash)

### NFR2: Forward Compatibility
- Must handle new fields in baseline/current JSON (ignore unknown fields)
- Robust to schema evolution

### NFR3: Error Messages
- All error messages must be actionable (tell user how to fix)
- No stack traces or internal errors (catch and translate)

### NFR4: Documentation
- README section in `tools/wvo_mcp/evals/README.md`
- Script help text: `bash check_drift.sh --help`
- Troubleshooting guide for common errors

---

## Verification Mapping

| AC | Verification Method | Evidence |
|----|---------------------|----------|
| AC1 | Smoke test with real baseline | verify/smoke_test.md |
| AC2 | Smoke test with real current run | verify/smoke_test.md |
| AC3 | Unit test (mock data: 0%, 5%, 15% drift) | verify/unit_tests.md |
| AC4 | Manual inspection of output format | verify/smoke_test.md |
| AC5 | Documentation review | verify/docs_review.md |

---

## Dependencies

**Upstream (must exist)**:
- IMP-35: Eval harness with attestation hashes ✅ (DONE)
- IMP-24: Attestation hash capture ✅ (DONE)
- Baseline file: `tools/wvo_mcp/evals/results/baseline/prompt_eval_baseline.json` ⚠️ (User must create via testing)

**Downstream (will use this)**:
- Future Tier 3 work: CI integration, automated baseline recapture

---

## Out of Scope

**Explicitly NOT doing** (defer to future work):
- ❌ Automated baseline recapture (requires user approval)
- ❌ CI integration (will be separate task)
- ❌ Functional drift detection (Alternative 4 from strategize)
- ❌ Drift prevention (Alternative 3 from strategize)
- ❌ Multi-threshold alerting (warning vs error)

---

## Autopilot Integration Points

**Where this fits in autopilot workflow**:
1. User runs `run_integrated_evals.sh` (captures baseline)
2. PromptCompiler changes (IMP-21), overlays update (IMP-23), etc.
3. **This script** detects drift automatically
4. Alerts user: "Baseline stale, recapture recommended"
5. User recaptures baseline (or ignores if minor)

**Autopilot functionality enhanced**:
- Quality gate reliability (AC5 from IMP-35)
- Prompt evolution monitoring
- Self-diagnostic capability

---

## Success Criteria Summary

**Task succeeds if ALL of these hold**:
1. ✅ Script runs without errors on real baseline + current run
2. ✅ Drift detection is accurate (0%, 5%, 15% test cases pass)
3. ✅ Output is clear and actionable (user knows what to do)
4. ✅ Documentation is complete (README + help text)
5. ✅ Error handling is graceful (no crashes, clear messages)
6. ✅ Tier 2 criteria met (functional, documented, rollback-safe)

**Task fails if ANY of these hold**:
1. ❌ Script crashes on malformed JSON
2. ❌ False positives (reports drift when none exists)
3. ❌ False negatives (misses actual drift)
4. ❌ Confusing output (user doesn't know what to do)
5. ❌ No error handling (crashes instead of actionable error)

---

## Next Phase

**PLAN**: Break down implementation into tasks:
- Task 1: Baseline loader (AC1)
- Task 2: Current run loader (AC2)
- Task 3: Hash comparison logic (AC3)
- Task 4: Output formatter (AC4, AC5)
- Task 5: Error handling (NFR3)
- Task 6: Documentation (NFR4)
- Task 7: Smoke test (VERIFY)
