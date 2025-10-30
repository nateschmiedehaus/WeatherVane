# MONITOR: FIX-META-TEST-ENFORCEMENT

**Task ID**: FIX-META-TEST-ENFORCEMENT
**Date**: 2025-10-30
**Monitoring Scope**: Phase 1 (Observe Mode) effectiveness
**Duration**: 30 days minimum (Phase 1 validation period)

---

## Monitoring Plan

### Phase 1 Goals

**Primary Goal**: Validate that detection works accurately before enforcing

**Success Criteria**:
1. Detection accuracy ≥90% on real task completions
2. False positive rate ≤10% (claimed level higher than actual)
3. False negative rate ≤10% (claimed level lower than actual)
4. Agents self-correct when shown mismatches (optional)

---

## Metrics to Track

### 1. Detection Accuracy
**Metric**: Percentage of tasks where detected level matches actual level

**How to measure**:
```bash
# After 30 days, manually review sample of tasks
cat state/analytics/verification_mismatches.jsonl | \
  jq -r '.taskId' | sort -u | head -20 | \
  xargs -I {} bash -c 'echo "=== {} ==="; ls state/evidence/{}/'

# For each task, compare:
# - Detected level (from verification_mismatches.jsonl)
# - Actual evidence (manual inspection of implement/*.md, verify/*.md)
```

**Target**: ≥90% accuracy

**Action if <90%**: Refine detection logic before Phase 2

---

### 2. Mismatch Rate
**Metric**: Percentage of phase transitions that trigger mismatch warnings

**How to measure**:
```bash
# Count total mismatches
cat state/analytics/verification_mismatches.jsonl | wc -l

# Count by transition type
cat state/analytics/verification_mismatches.jsonl | \
  jq -r '.transition' | sort | uniq -c
```

**Expected range**: 10-30% (if higher, indicates widespread verification gaps)

**Action if >50%**: Investigate whether standards are too strict or agents need training

---

### 3. Self-Correction Rate (Optional)
**Metric**: Percentage of tasks that initially had mismatches but were corrected before completion

**How to measure**:
```bash
# Check if tasks with mismatches eventually achieved correct level
# (requires comparing early warnings to final evidence)

# For now, track anecdotally: Did any agents fix verification gaps after warnings?
```

**Target**: >50% self-correction (would indicate observe mode is effective feedback)

**Action if 0%**: Observe mode may not be effective → consider moving to Phase 2 earlier

---

### 4. False Positive Analysis
**Metric**: Tasks marked as insufficient when verification was actually adequate

**How to measure**:
```bash
# Sample 10 mismatches
cat state/analytics/verification_mismatches.jsonl | \
  jq -r 'select(.confidence == "high") | .taskId' | \
  head -10

# Manually inspect each:
# - Did detection miss valid evidence?
# - Was evidence present but not recognized?
# - Were search patterns too narrow?
```

**Target**: ≤10% false positives

**Action if >10%**: Add more search patterns, improve evidence parsing

---

### 5. False Negative Analysis
**Metric**: Tasks that passed detection but lacked actual verification

**How to measure**:
```bash
# Sample 10 tasks with NO mismatches
cat state/analytics/verification_mismatches.jsonl | \
  jq -r '.taskId' | sort -u > /tmp/mismatch_tasks.txt

# Find recent tasks NOT in mismatch list
ls state/evidence/ | grep -v -f /tmp/mismatch_tasks.txt | head -10

# Manually inspect: Did any lack proper verification despite passing detection?
```

**Target**: ≤10% false negatives

**Action if >10%**: Detection is too lenient → tighten search criteria

---

### 6. Phase Transition Distribution
**Metric**: Which transitions trigger most mismatches?

**How to measure**:
```bash
cat state/analytics/verification_mismatches.jsonl | \
  jq -r '.transition' | sort | uniq -c | sort -rn

# Expected output:
# 15 VERIFY->REVIEW  (Level 2 missing)
# 8 IMPLEMENT->VERIFY (Level 1 missing)
# 3 REVIEW->PR (Level 3 missing or deferred)
```

**Insight**: If VERIFY→REVIEW is highest, agents are skipping smoke testing

**Action**: Focus training/documentation on Level 2 (test execution)

---

## Monitoring Schedule

### Week 1 (Days 1-7)
**Focus**: Validate detection is working at all

**Actions**:
- [x] Confirm `verification_mismatches.jsonl` is being created
- [x] Spot-check 3-5 mismatches for accuracy
- [x] Verify error messages are helpful (not cryptic)
- [x] Check for any detection crashes/errors

**Exit Criteria**: No crashes, mismatches are logged correctly

---

### Week 2 (Days 8-14)
**Focus**: Assess detection accuracy

**Actions**:
- [ ] Sample 10 mismatches → manually verify accuracy
- [ ] Calculate detection accuracy (correct level / total checked)
- [ ] Identify any false positive patterns
- [ ] Refine detection logic if accuracy <80%

**Exit Criteria**: Detection accuracy ≥80% (interim target)

---

### Week 3 (Days 15-21)
**Focus**: Track agent behavior changes

**Actions**:
- [ ] Review new task completions → are verification levels improving?
- [ ] Check if any agents fixed gaps after seeing warnings
- [ ] Measure mismatch rate trend (increasing/decreasing)
- [ ] Identify common gap patterns (always missing Level 2? Always deferring Level 3?)

**Exit Criteria**: Evidence of whether agents are self-correcting

---

### Week 4 (Days 22-30)
**Focus**: Phase 1 decision (continue/upgrade/refine)

**Actions**:
- [ ] Final accuracy check on 20 tasks
- [ ] Calculate false positive/negative rates
- [ ] Assess self-correction rate
- [ ] Write Phase 1 summary report
- [ ] Decide: Move to Phase 2 or continue observing?

**Exit Criteria**: All metrics meet targets OR decision to refine detection

---

## Decision Points

### Decision 1: Move to Phase 2 (Soft-Block)
**When**: After 30 days if ALL conditions met:
- ✅ Detection accuracy ≥90%
- ✅ False positive rate ≤10%
- ✅ False negative rate ≤10%
- ✅ No evidence of detection breaking workflows

**Action**: Update VERIFICATION_ENFORCEMENT_MODE=soft, create Phase 2 task

---

### Decision 2: Continue Phase 1 (Observe Longer)
**When**: After 30 days if ANY condition met:
- ⚠️ Detection accuracy 80-89% (close but not confident)
- ⚠️ Agents are self-correcting (observe mode is working)
- ⚠️ Need more data to validate edge cases

**Action**: Continue observing for another 30 days, refine detection logic

---

### Decision 3: Refine Detection (Delay Phase 2)
**When**: After 30 days if ANY condition met:
- ❌ Detection accuracy <80% (too many false positives/negatives)
- ❌ False positive rate >15% (frustrating agents with wrong warnings)
- ❌ Detection crashes or breaks workflows

**Action**: Update detection logic, restart 30-day observation period

---

### Decision 4: Accelerate to Phase 2 (Early Upgrade)
**When**: ONLY if:
- ✅ Detection accuracy ≥95% (very confident)
- ✅ Agents NOT self-correcting (observe mode ineffective)
- ✅ High mismatch rate (>40%, indicating widespread gaps)

**Action**: Move to Phase 2 after 15 days (half the planned observation period)

---

## Reporting

### Daily Report (Automated)
**Generated by**: Analytics dashboard (if built) or manual script

**Contents**:
- Mismatches today (count by transition type)
- Detection confidence distribution (high/medium/low)
- Any errors or crashes

**Location**: `state/analytics/daily/verification_YYYY-MM-DD.json`

---

### Weekly Report (Manual)
**Generated by**: Human reviewer or future automation

**Contents**:
- Week N summary (total mismatches, trends)
- Sample accuracy check (5-10 tasks manually reviewed)
- Notable patterns (common gaps, false positives)
- Recommendations (refine detection, continue observing, move to Phase 2)

**Location**: `state/analytics/weekly/verification_week_N.md`

---

### Phase 1 Final Report (Day 30)
**Generated by**: Human reviewer

**Contents**:
- Overall detection accuracy (on 20+ task sample)
- False positive/negative rates
- Self-correction rate (if measurable)
- Phase transition distribution
- Decision: Move to Phase 2, continue observing, or refine detection
- Lessons learned (what worked, what didn't)

**Location**: `state/evidence/FIX-META-TEST-ENFORCEMENT/monitor/phase_1_final_report.md`

---

## Rollback Plan

### If detection causes problems during Phase 1:

**Problem**: Too many false positives (agents complain warnings are wrong)
**Action**: Disable temporarily (`VERIFICATION_ENFORCEMENT_ENABLED=false`), refine logic, re-enable

**Problem**: Detection crashes or breaks workflows
**Action**: Disable immediately, fix crash, restart observation period

**Problem**: Agents ignore warnings completely (no behavior change)
**Action**: Continue observing but plan Phase 2 (soft-block) to create accountability

---

## Success Indicators

**Phase 1 is successful if**:
- ✅ Detection works (no crashes, logs correctly)
- ✅ Accuracy ≥90% (confident in detection logic)
- ✅ Agents aware of standards (warnings are visible)
- ✅ Foundation ready for Phase 2 (soft-block)

**Phase 1 is NOT successful if**:
- ❌ Detection accuracy <80% (too unreliable)
- ❌ High false positive rate (frustrates agents)
- ❌ Detection never triggered (agents always pass → may be too lenient)

---

## Long-Term Tracking

### Beyond Phase 1 (90 days total)

**Phase 2 (Days 31-60)**: Soft-block mode monitoring
- Track confirmation rate (how often agents confirm to proceed despite warnings)
- Measure behavior change (does soft-block reduce mismatches?)
- Prepare for Phase 3 (hard-block)

**Phase 3 (Days 61-90)**: Hard-block mode monitoring
- Track emergency bypass usage (should be <1%)
- Measure gap prevention (are false completions eliminated?)
- Assess agent satisfaction (is enforcement helpful or frustrating?)

**Steady State (Day 90+)**: Continuous quality tracking
- Monitor verification levels across all tasks
- Track gaming patterns (separate task FIX-META-TEST-GAMING)
- Refine detection as evidence formats evolve

---

## Monitoring Artifacts

**Created during monitoring**:
- `state/analytics/verification_mismatches.jsonl` (continuous)
- `state/analytics/daily/verification_YYYY-MM-DD.json` (if automated)
- `state/analytics/weekly/verification_week_N.md` (manual reports)
- `state/evidence/FIX-META-TEST-ENFORCEMENT/monitor/phase_1_final_report.md` (Day 30)
- `state/evidence/FIX-META-TEST-ENFORCEMENT/monitor/completion.md` (when all phases done)

---

**Monitoring Status**: ⏳ AWAITING IMPLEMENTATION (monitoring begins after Phase 1 is coded and deployed)

**Next Action**: Implement TypeScript code (VerificationLevelDetector + WorkProcessEnforcer integration) in dedicated coding session
