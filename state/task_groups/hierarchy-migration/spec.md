# SPEC: hierarchy-migration

**Set ID:** hierarchy-migration
**Milestone:** W0.M3
**Epic:** WAVE-0
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: All Tasks Assigned

```bash
# Count tasks without set_id
yq '.waves[].milestones[].tasks[] | select(.set_id == null) | .id' state/roadmap.yaml | wc -l

# Should be 0
```

### AC2: Evidence Migrated

```bash
# All evidence dirs have set/epic metadata
for dir in state/evidence/AFP-*; do
  test -f $dir/metadata.json || echo "Missing: $dir"
done
```

---

**Spec complete:** 2025-11-06
