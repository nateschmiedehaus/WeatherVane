# SPEC: hierarchy-enforcement

**Set ID:** hierarchy-enforcement
**Milestone:** W0.M3
**Epic:** WAVE-0
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: Pre-commit Hook Validates

```bash
# Try to commit task without set_id
yq '.waves[0].milestones[0].tasks[0].set_id = null' -i state/roadmap.yaml
git add state/roadmap.yaml
git commit -m "test"

# Should block:
# ❌ Task AFP-XXX missing set_id
```

### AC2: Blocks Work Without Docs

```bash
# Try to start task in set without docs
# Should block if state/task_groups/SET/strategy.md missing
```

---

**Spec complete:** 2025-11-06
