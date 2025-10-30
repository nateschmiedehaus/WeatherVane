# MONITOR: META-TESTING-STANDARDS

**Task ID**: META-TESTING-STANDARDS
**Phase**: MONITOR
**Date**: 2025-10-30

---

## Monitoring Overview

**Purpose**: Track adoption of verification level standards and measure success in preventing false completions

**Duration**: 90 days (30-day milestones)

**Success Criteria** (from SPEC):
- **Short-term (30 days)**: Zero false completions, 100% document level achieved
- **Medium-term (90 days)**: <10% REVIEW rejections (down from ~30%)
- **Long-term (6 months)**: Cultural shift, reduced post-merge bugs

---

## Monitoring Metrics

### Primary Metrics

#### 1. Verification Level Adoption Rate
**Metric**: % of tasks that document verification level in evidence
**Target**: 100% by Day 30
**Collection**:
```bash
# Count tasks with verification level documentation
grep -r "Level [1-4]" state/evidence/*/verify/*.md | wc -l
grep -r "Verification Level" state/evidence/*/verify/*.md | wc -l
```
**Alert**: If <80% by Day 30 → Create enforcement task

#### 2. False Completion Rate
**Metric**: % of tasks returned to IMPLEMENT from REVIEW due to insufficient verification
**Baseline**: ~30% (estimated from IMP-35 patterns)
**Target**: <10% by Day 30, <5% by Day 90
**Collection**:
```bash
# Track "returned to IMPLEMENT" in review documents
grep -r "return to IMPLEMENT\|back to IMPLEMENT" state/evidence/*/review/*.md
```
**Alert**: If >20% by Day 30 → Investigate gaps in standards

#### 3. "Build Passed = Done" Pattern Detection
**Metric**: # of tasks claiming completion with only Level 1 evidence
**Target**: Zero by Day 30
**Collection**:
```bash
# Search for claims of completion with only build evidence
grep -r "build passed" state/evidence/*/verify/*.md | grep -v "Level 2\|Level 3"
```
**Alert**: If >0 by Day 30 → Standards not being followed

#### 4. Level 3 Deferral Quality
**Metric**: % of Level 3 deferrals with explicit justification
**Target**: 100% (all deferrals documented)
**Collection**:
```bash
# Find deferral documentation
grep -r "Level 3.*DEFERRED\|Integration.*DEFERRED" state/evidence/*/verify/*.md
```
**Alert**: If <100% → Update deferral template, add enforcement

### Secondary Metrics

#### 5. REVIEW Rejection Rate
**Metric**: % of tasks rejected in REVIEW phase
**Baseline**: ~30% (estimated)
**Target**: <10% by Day 90
**Collection**: Manual review of REVIEW phase outcomes

#### 6. Documentation Mentions
**Metric**: # of mentions of VERIFICATION_LEVELS.md in evidence
**Target**: Every task references it at least once
**Collection**:
```bash
grep -r "VERIFICATION_LEVELS" state/evidence/*/
```

#### 7. Case Study Impact
**Metric**: # of tasks citing IMP-35 case studies as learning
**Target**: >10 by Day 90
**Collection**:
```bash
grep -r "IMP-35" state/evidence/*/strategize/*.md
grep -r "imp_35_round1\|imp_35_auth" state/evidence/
```

---

## Data Collection Schedule

### Daily (Automated)
- Verification level adoption count
- False completion count
- Build-passed-only count

### Weekly (Manual)
- Review rejection rate
- Deferral quality audit (sample 5 tasks)
- Documentation reference check

### Monthly (Manual)
- Success criteria assessment
- Standards effectiveness review
- Update follow-up tasks if needed

---

## Monitoring Dashboard

**Location**: `state/analytics/verification_standards_dashboard.json`

**Format**:
```json
{
  "updated": "2025-10-30T00:00:00Z",
  "period": "2025-10-30 to 2025-11-30",
  "metrics": {
    "adoption_rate": 0.0,
    "false_completion_rate": 0.0,
    "build_passed_only_count": 0,
    "level_3_deferral_quality": 0.0,
    "review_rejection_rate": 0.0
  },
  "targets": {
    "adoption_rate": 1.0,
    "false_completion_rate": 0.1,
    "build_passed_only_count": 0,
    "level_3_deferral_quality": 1.0,
    "review_rejection_rate": 0.1
  },
  "alerts": []
}
```

---

## Success Milestones

### Day 30 Checkpoint
- [ ] 100% of tasks document verification level
- [ ] Zero "build passed = done" instances
- [ ] <10% false completion rate
- [ ] All Level 3 deferrals have justification
- [ ] At least 5 tasks cite IMP-35 case studies

**Decision Point**: If all checkpoints met → Continue monitoring. If not → Investigate and create remediation tasks.

### Day 90 Checkpoint
- [ ] <5% false completion rate (sustained)
- [ ] <10% REVIEW rejection rate
- [ ] Standards referenced in all evidence
- [ ] Cultural shift visible (agents proactively mention levels)

**Decision Point**: If all checkpoints met → Archive as success, reduce monitoring frequency. If not → Extend monitoring, investigate gaps.

---

## Alert Triggers and Responses

### Alert 1: Low Adoption (<80% by Day 30)
**Response**:
1. Create FIX-META-TEST-ADOPTION task
2. Add WorkProcessEnforcer checks (FIX-META-TEST-ENFORCEMENT)
3. Update agent briefing to emphasize standards

### Alert 2: High False Completion Rate (>20% by Day 30)
**Response**:
1. Review standards clarity - are they confusing?
2. Add more examples for common task types
3. Strengthen REVIEW phase adversarial questions

### Alert 3: Gaming Detected (trivial tests, mock-only integration)
**Response**:
1. Fast-track FIX-META-TEST-GAMING task
2. Add static analysis for assertions
3. Update examples with "how to game" warnings

### Alert 4: Deferral Abuse (weak justifications)
**Response**:
1. Strengthen deferral template requirements
2. Add deferral quality checks to REVIEW phase
3. Create examples of good vs bad deferrals

---

## Follow-Up Task Monitoring

**Created Tasks** (from PR phase):
1. FIX-META-TEST-ENFORCEMENT (WorkProcessEnforcer integration)
2. FIX-META-TEST-GAMING (detect trivial tests, mock abuse)
3. FIX-META-TEST-MANUAL-SESSIONS (apply to manual sessions)

**Monitoring**:
- Track when each task starts (Day X)
- Track when each task completes (Day Y)
- Measure impact on primary metrics after completion

---

## Baseline Data Collection

**Priority**: Collect baseline BEFORE standards are widely adopted

**Baseline Period**: 2025-10-23 to 2025-10-30 (7 days before standards)

**Baseline Tasks to Audit**:
- CRIT-PERF-GLOBAL-9dfa06 series
- Recent IMP-* tasks
- Recent META-* tasks

**Baseline Questions**:
1. How many tasks claimed completion with only "build passed"?
2. How many tasks were returned from REVIEW for insufficient testing?
3. What % of tasks had Level 2+ evidence (even if not explicitly called that)?

**Baseline Report**: `state/evidence/META-TESTING-STANDARDS/monitor/baseline_audit.md` (to be created)

---

## Reporting

### Monthly Report Format

**To**: User (nathanielschmiedehaus)
**Format**: `state/evidence/META-TESTING-STANDARDS/monitor/month_N_report.md`

**Contents**:
- Metrics vs targets table
- Examples of success (tasks with good verification)
- Examples of gaps (tasks with weak verification)
- Recommendations for next month
- Follow-up task progress

---

## MONITOR Phase Status

**Status**: ✅ ACTIVE (Day 0 of 90)

**Next Actions**:
1. Collect baseline data (audit past 7 days of tasks)
2. Set up automated data collection scripts
3. Create initial dashboard JSON
4. Schedule Day 30 checkpoint review

**Expected Completion**: 2026-01-30 (90 days)

---

**Monitor started**: 2025-10-30
**Monitor owner**: Claude/Codex agents
**Escalation**: If targets not met by checkpoints
