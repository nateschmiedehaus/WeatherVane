# SPEC: hierarchy-critics

**Set ID:** hierarchy-critics
**Milestone:** W0.M3
**Epic:** WAVE-0
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: EpicReviewer Works

```bash
npm run epic:review WAVE-0

# Validates:
# - All 5 phase docs present
# - Word counts adequate
# - Outcomes measurable
# - AFP/SCAS alignment
```

### AC2: SetReviewer Works

```bash
npm run set:review w0m1-supervisor-agent-integration

# Validates:
# - strategy/spec/plan present
# - Rationale clear
# - Tasks listed
```

### AC3: ClusterCritic Works

```bash
npm run cluster:review w0m1-supervisor-agent-integration

# Validates:
# - Tasks logically grouped
# - Cohesion high
# - Coupling low
```

---

**Spec complete:** 2025-11-06
