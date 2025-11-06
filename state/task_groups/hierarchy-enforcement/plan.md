# PLAN: hierarchy-enforcement

**Set ID:** hierarchy-enforcement
**Milestone:** W0.M3
**Epic:** WAVE-0
**Date:** 2025-11-06

---

## Approach

1. Create pre-commit hook (scripts/pre-commit-hierarchy)
2. Validate roadmap structure (all tasks have set_id/epic_id)
3. Validate docs exist (epic/set phase docs before tasks)
4. Add to .git/hooks/pre-commit

---

**Files:**
- scripts/pre-commit-hierarchy (new, ~200 LOC)
- Integration with existing pre-commit

---

**Plan complete:** 2025-11-06
