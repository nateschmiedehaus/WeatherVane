# Design: AFP-PROCESS-HIERARCHY-20251106

---

## Context

Frontline workflow docs now require tests to be authored during PLAN, but higher-level guidance (claude.md, AFP phase concept doc, agent library lifecycle) still suggests writing tests during IMPLEMENT or VERIFY. We need to align those documents so every layer enforces the same behaviour: tests are created before implementation and VERIFY only executes them.

---

## Five Forces Check

### COHERENCE
- [x] Reviewed existing instructions in `claude.md`, `docs/concepts/afp_work_phases.md`, and `docs/agent_library/common/processes/task_lifecycle.md`.
- Pattern reused: documentation alignment across hierarchy.

### ECONOMY
- [x] No new docs; minimal textual updates to existing sections.
- Estimated net LOC <100.

### LOCALITY
- [x] Changes constrained to three documentation files covering process guidance.

### VISIBILITY
- [x] Wording will clearly state where tests belong and what VERIFY does.

### EVOLUTION
- [x] Aligning docs enables autopilot/training data to follow consistent rules.

Pattern: `process-doc-alignment` (extend existing policy change up the hierarchy).  
Code leverage level: Low (docs only).  
Assurance: Manual review + plan_next sanity check.

Commit footer:
```
Pattern: process-doc-alignment
Deleted: none
```

---

## Via Negativa Analysis

- No deletions available; must edit text to remove contradictory instructions.

---

## Refactor vs Repair Analysis

- This is a documentation refactor to address root cause (inconsistent instructions), not a patch.

---

## Alternatives Considered

1. **Alternative:** Leave higher-level docs unchanged and rely on frontline docs.  
   - Rejected: perpetuates inconsistency and allows selective quoting.

2. **Alternative:** Add separate appendix referencing new rule.  
   - Rejected: increases complexity; better to edit existing sections directly.

### Selected Approach

- Update each relevant phase description inline to reflect the PLAN-first testing requirement and VERIFY execution-only stance.

---

## Complexity Analysis

- Minimal increase; wording change only. Prevents cognitive complexity by eliminating conflicting instructions.

---

## Implementation Plan

**Scope:**
- Files: `claude.md`, `docs/concepts/afp_work_phases.md`, `docs/agent_library/common/processes/task_lifecycle.md`
- PLAN-authored tests: Documentation change only; no automated tests created.
- Estimated LOC change: <100 net.

**Risk Analysis:**
- Edge cases: docs-only exemptions; autopilot guidance tone.  
- Failure modes: partial updates; incorrect tone.  
- Testing strategy: manual review + `rg` search + `plan_next` sanity check.

**Assumptions:**
- No other high-level doc needs immediate edits; will note if discovered.

---

**Design Complete:** 2025-11-06
