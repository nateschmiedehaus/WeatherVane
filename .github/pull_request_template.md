# PR Checklist (AFP/SCAS Compliance)

## Micro-Batching
- [ ] ≤5 files changed
- [ ] ≤150 net LOC added (additions - deletions)
- [ ] This is an atomic, focused change

## Via Negativa
- [ ] I considered deleting/simplifying instead of adding
- [ ] I deleted unused code as part of this change (if applicable)
- [ ] Net LOC is minimized (prefer deletion over addition)

## Complexity
- [ ] Complexity did NOT increase (or strong justification below)
- [ ] No functions >50 LOC
- [ ] No files >500 LOC
- [ ] Nesting depth ≤3 levels

## Refactor vs Repair
- [ ] If modifying large files (>200 LOC): I refactored, not patched
- [ ] If modifying large functions (>50 LOC): I refactored, not patched
- [ ] No workarounds or "quick fixes" - proper solutions only

## Alternatives Considered
**List 2+ approaches you evaluated (REQUIRED):**
1. **Deletion/simplification approach:**
2. **Alternative implementation:**
3. **Selected approach and why:**

## Modularity
- [ ] Maintains or improves modularity (no tight coupling)
- [ ] Follows single responsibility principle
- [ ] No "god functions/classes" created

---

## Changes Summary
- **Files changed:**
- **LOC added:**
- **LOC deleted:**
- **Net LOC:**
- **Complexity impact:** (increase/decrease/neutral)

## Description
[Brief description of what changed and why]

## Testing
- [ ] All tests pass
- [ ] Added tests for new functionality (if applicable)
- [ ] Manually verified changes work as expected

## End-Steps Evidence
- [ ] `state/logs/<TASK>/verify/verify.log` ≥1KB and ends with SCAS summary line
- [ ] `state/logs/<TASK>/coverage/coverage.json` updated for this change
- [ ] critics/template_detector + guardrails JSON refreshed (with KPIs)
- [ ] `state/logs/<TASK>/attest/scas.json` shows pass=true with files/net_loc recorded

---

**Reviewer:** Verify all checkboxes are checked before approving. Pre-commit hook enforces micro-batching limits.
