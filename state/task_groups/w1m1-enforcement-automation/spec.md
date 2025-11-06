# SPEC: w1m1-enforcement-automation

**Set ID:** w1m1-enforcement-automation
**Milestone:** W1.M1
**Epic:** WAVE-1
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: Work Process Enforced
```bash
# Try commit without GATE phase
# Should block:
# ❌ Missing required phase: GATE (design.md)
```

### AC2: DesignReviewer Blocks
```bash
# Submit superficial design.md
cd tools/wvo_mcp && npm run gate:review TASK-ID
# Should output: BLOCKED with concerns
```

### AC3: Roadmap Validates
```bash
# Try commit invalid roadmap
yq '.waves[0].milestones = null' -i state/roadmap.yaml
git add state/roadmap.yaml
git commit -m "test"
# Should block: Invalid roadmap schema
```

---

**Spec complete:** 2025-11-06
