# THINK: WAVE-1 – Governance & AFP Enforcement

**Epic ID:** WAVE-1
**Status:** Pending
**Date:** 2025-11-06

---

## Edge Cases

### Edge Case 1: Legitimate Urgent Work Blocked by Enforcement
**Scenario:** Production outage requires immediate fix, but enforcement blocks commit (missing GATE phase)

**How to handle:**
- Emergency override mechanism (EMERGENCY=1 git commit)
- Requires post-hoc documentation (create GATE phase after)
- Audit trail captures all overrides
- Director Dana approval required

**Why acceptable:** Safety valve for true emergencies, but accountable

### Edge Case 2: DesignReviewer False Positive
**Scenario:** DesignReviewer blocks legitimate work (overly strict)

**How to handle:**
- Appeal process (human reviews critic decision)
- Critic tuning (adjust thresholds based on appeals)
- Override with justification (documented in commit)
- Track false positive rate (improve critic)

### Edge Case 3: Roadmap Schema Evolution
**Scenario:** Need to change roadmap structure, but schema validation blocks

**How to handle:**
- Schema versioning (v1, v2, etc.)
- Migration scripts (upgrade roadmap to new schema)
- Backward compatibility period (support old + new)
- Governance approval for schema changes

---

## Failure Modes

### Failure Mode 1: Enforcement Too Strict (Work Grinds to Halt)
**Symptom:** Every commit blocked, developers frustrated, productivity drops

**Detection:**
- Commit block rate >50%
- Average time to merge >2 days
- Developer complaints increasing

**Mitigation:**
- Tune critics (adjust thresholds)
- Add override mechanisms (with justification)
- Monitor false positive rate
- Iterate on enforcement rules

### Failure Mode 2: Enforcement Bypassed
**Symptom:** Developers find ways around enforcement (--no-verify, direct pushes)

**Detection:**
- Commits without phase docs appearing
- Git history shows --no-verify usage
- Evidence bundles incomplete

**Mitigation:**
- Server-side hooks (can't bypass with --no-verify)
- Protected branches (require reviews)
- Audit trail review (weekly checks)
- Cultural enforcement (peer pressure)

### Failure Mode 3: Ledger Becomes Overwhelming
**Symptom:** Every decision logged, ledger grows to thousands of entries, unusable

**Detection:**
- Ledger file >10MB
- Query time >5 seconds
- No one reads it anymore

**Mitigation:**
- Retention policy (archive old decisions)
- Summarization (roll up minor decisions)
- Indexing (fast queries)
- Tiering (critical vs routine decisions)

---

## Dependencies

**External:**
- Git hooks functional (WAVE-0 git stability)
- Critics operational (DesignReviewer, StrategyReviewer)
- Roadmap structure stable (W0.M3 hierarchy)

**Internal:**
- None (WAVE-1 self-contained)

---

## Assumptions

### Assumption 1: Pre-commit Hooks Sufficient
**Assumption:** Client-side hooks adequate for enforcement

**If false:** Need server-side hooks (GitHub Actions, GitLab CI)

**Validation:** Monitor bypass attempts, move to server-side if >5% bypass rate

### Assumption 2: DesignReviewer Accuracy Acceptable
**Assumption:** False positive rate <20%

**If false:** Critic needs major tuning or human-in-loop

**Validation:** Track appeals, tune critic based on feedback

---

## Complexity Analysis

**Added:**
- Enforcement logic (~1000 LOC)
- Decision ledger (~500 LOC)
- Schema validation (~500 LOC)

**Justified?**
- **Yes:** Prevents process debt (hours of cleanup avoided)
- **Yes:** Scales automation (doesn't require humans)
- **Yes:** Accountability (audit trail for compliance)

---

**Think complete:** 2025-11-06
**Next phase:** design.md
**Owner:** Director Dana
