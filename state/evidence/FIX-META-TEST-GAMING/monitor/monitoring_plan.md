# MONITOR: FIX-META-TEST-GAMING

**Task ID**: FIX-META-TEST-GAMING
**Date**: 2025-10-30
**Monitoring Scope**: Gaming detection effectiveness
**Duration**: 60 days (30 days observe + 30 days enforcement)

---

## Monitoring Plan

### Primary Goals

1. Validate detection accuracy >85% on real tasks
2. Keep LLM review rate <30% of tasks
3. Keep average cost <$0.15 per task
4. Catch gaming attempts (if any occur)

---

## Metrics to Track

### 1. Detection Accuracy
```bash
# Sample 20 tasks, manually verify heuristic + LLM verdicts
cat state/analytics/gaming_detections.jsonl | jq -r '.taskId' | head -20
```
**Target**: >85% accuracy (correct verdicts)

### 2. LLM Review Rate
```bash
cat state/analytics/gaming_detections.jsonl | \
  jq -s 'map(select(.llm_review != null)) | length'
```
**Target**: <30% of tasks trigger LLM review

### 3. Cost Per Task
```bash
cat state/analytics/gaming_detections.jsonl | \
  jq -s 'map(select(.llm_review != null) | .llm_review.cost_usd) | add / length'
```
**Target**: Average <$0.15 per task

### 4. Gaming Detected
```bash
cat state/analytics/gaming_detections.jsonl | \
  jq -r 'select(.blocked == true) | .taskId'
```
**Target**: 0 gaming attempts (deterrence working)

### 5. False Positives
```bash
# Tasks flagged HIGH risk but LLM says GENUINE
cat state/analytics/gaming_detections.jsonl | \
  jq -r 'select(.risk_level == "HIGH" and .llm_review.verdict == "GENUINE") | .taskId'
```
**Target**: <10% of flagged tasks

---

## Monitoring Schedule

### Week 1-2: Observe Mode (No Blocking)
- Log all heuristic scores
- Trigger LLM review for flagged tasks
- Don't block transitions (observe only)
- Measure accuracy, cost, false positive rate

**Exit Criteria**: Accuracy >80%, cost <$0.20/task, false positives <15%

### Week 3-4: Soft Enforcement
- Block if LLM says GAMING
- Show warnings if SUSPICIOUS
- Monitor agent feedback
- Refine heuristics if needed

**Exit Criteria**: No complaints about false positives, gaming caught (if attempted)

### Week 5-8: Full Enforcement
- Block GAMING verdicts
- Request better evidence for SUSPICIOUS
- Monitor for gaming adaptation
- Track pattern evolution

**Exit Criteria**: Gaming deterred or caught, detection stable

---

## Decision Points

### Decision 1: Enable Enforcement?
**When**: After 2 weeks observe mode
**Condition**: Accuracy >85%, false positives <10%, cost <$0.15/task
**Action if YES**: Enable blocking
**Action if NO**: Tune heuristics, continue observing

### Decision 2: Disable LLM Review?
**When**: If cost >$0.20/task for 1 week
**Action**: Disable LLM, rely on heuristics only
**Fallback**: Re-enable if gaming emerges

### Decision 3: Update Heuristics?
**When**: If new gaming patterns found
**Action**: Add patterns to heuristics, update weights
**Frequency**: Quarterly review

---

## Success Indicators

**Gaming detection is successful if**:
- ✅ Accuracy >85% on real tasks
- ✅ Cost <$0.15 per task average
- ✅ Gaming attempts caught (or deterred)
- ✅ False positive rate <10%

**Gaming detection is NOT successful if**:
- ❌ Accuracy <75% (too unreliable)
- ❌ Cost >$0.25 per task (too expensive)
- ❌ High false positive rate (frustrates agents)
- ❌ Gaming passes through undetected

---

**Monitoring Status**: ⏳ AWAITING IMPLEMENTATION

**Next Action**: Implement TypeScript code (GamingDetector, LLMGamingReviewer, WorkProcessEnforcer integration)
