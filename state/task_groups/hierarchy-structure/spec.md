# SPEC: hierarchy-structure

**Set ID:** hierarchy-structure
**Milestone:** W0.M3
**Epic:** WAVE-0
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: Schema Defines 5 Levels
```yaml
# state/schemas/hierarchy.yaml
levels:
  - META: Process governance
  - PROJECT: Architecture
  - EPIC: Capabilities
  - SET: Task groups
  - TASK: Individual changes
```

### AC2: All Tasks Embedded
```bash
# No orphan tasks
! yq '.waves[].milestones[].tasks[] | select(.set_id == null)' state/roadmap.yaml
```

### AC3: Directory Structure Exists
```bash
test -d state/epics/
test -d state/task_groups/
```

---

**Spec complete:** 2025-11-06
