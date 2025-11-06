# PLAN: hierarchy-structure

**Set ID:** hierarchy-structure
**Milestone:** W0.M3
**Epic:** WAVE-0
**Date:** 2025-11-06

---

## Approach

1. Define schema (state/schemas/hierarchy.yaml)
2. Reorganize roadmap.yaml (add set_id, epic_id to all tasks)
3. Create directory structure (state/epics/, state/task_groups/)
4. Validate embedding (script checks no orphans)

---

**Files Changed:**
- state/schemas/hierarchy.yaml (new, ~100 LOC)
- state/roadmap.yaml (modified, +set_id/epic_id for all tasks)
- scripts/validate_hierarchy.sh (new, ~50 LOC)

**Total:** ~150 LOC + roadmap updates

---

**Plan complete:** 2025-11-06
