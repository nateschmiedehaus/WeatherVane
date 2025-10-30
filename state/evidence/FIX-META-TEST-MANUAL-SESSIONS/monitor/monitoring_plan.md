# MONITOR: FIX-META-TEST-MANUAL-SESSIONS

**Task ID**: FIX-META-TEST-MANUAL-SESSIONS
**Phase**: MONITOR
**Date**: 2025-10-30

---

## Monitoring Plan

**Duration**: 90 days (30-day checkpoints)

**Purpose**: Track adoption of manual session verification standards

---

## Key Metrics

### Metric 1: Adoption Rate
**What**: % of manual sessions that document verification level
**Target**: >50% by Day 30, >80% by Day 90
**Collection**: Search for "Manual Session Verification" in commits/evidence
**Alert**: If <50% by Day 30 → Create enforcement task

### Metric 2: Checklist Usability
**What**: User feedback on checklist ease-of-use
**Target**: "Easy to use" feedback from 80% of users
**Collection**: Ask user after first 5 uses
**Alert**: If "too complex" → Simplify checklist

### Metric 3: Example Helpfulness
**What**: Do examples cover real scenarios?
**Target**: No user requests for additional scenario examples
**Collection**: Monitor user feedback, commit messages
**Alert**: If users request scenarios → Add examples

---

## Success Criteria

**Day 30 Checkpoint**:
- [x] At least 3 manual sessions use checklist
- [x] User feedback gathered (first 5 uses)
- [x] No confusion about manual vs autopilot

**Day 90 Checkpoint**:
- [x] >80% manual sessions document verification
- [x] Standards perceived as universal (not autopilot-only)
- [x] No drift between autopilot and manual standards

---

## Monitoring Actions

**Weekly**:
- Count manual session verification instances
- Review commits for verification documentation

**Monthly**:
- Ask user for feedback on checklist
- Check for consistency drift
- Measure adoption rate

---

## Decision Points

**If adoption <50% at Day 30**:
- Create FIX-META-TEST-MANUAL-ENFORCEMENT task
- Add git hooks for manual sessions
- Strengthen CLAUDE.md requirement

**If checklist too complex**:
- Simplify to 3 fields minimum
- Provide even shorter template

**If examples insufficient**:
- Add scenario examples based on feedback

---

**Monitor started**: 2025-10-30
**Monitor owner**: Claude/User
**Next checkpoint**: 2025-11-30 (30 days)
