# Design: AFP-PROCESS-TEST-SEQUENCE-20251106

---

## Context

We need to adjust the AFP workflow so that verification tests are authored before implementation rather than at VERIFY time. The current documentation places test work in VERIFY, encouraging agents to write tests after seeing their code. This change clarifies that tests must be written during PLAN, while VERIFY is limited to executing them.

---

## Five Forces Check

### COHERENCE
- [x] I searched for similar patterns in the codebase.
- Modules checked: `AGENTS.md`, `MANDATORY_WORK_CHECKLIST.md`, `docs/MANDATORY_VERIFICATION_LOOP.md` (existing process docs that coordinate phases).
- Pattern reused: Process doc alignment pattern (update primary guideline plus supporting checklists).

### ECONOMY
- [x] I explored simplification. No existing text could simply be deleted; the problem requires clarifying language instead of removal.
- LOC estimate: roughly +80/-10 (≤150 net LOC, compliant).

### LOCALITY
- [x] Changes remain in documentation files governing the workflow; all updates live under repo root or `docs/templates/`.
- Dependencies: purely textual references between these documents.

### VISIBILITY
- [x] The new wording will surface expectations clearly by moving test authoring guidance into PLAN-related sections and stating VERIFY only runs tests. No runtime errors involved.

### EVOLUTION
- [x] We reuse an established documentation pattern: update the primary guideline, supporting checklist, and template to keep them in sync. Success measured by reviewers referencing PLAN for tests.

**Pattern selected:** Process documentation alignment — update root guideline + checklist + supporting doc + template so they echo the same rule. Chosen because it preserves a single source of truth with reinforcing artefacts.

**Code leverage level:** Low — purely documentation.
**Assurance strategy:** Careful proofreading across affected docs; no automated tests required.

Commit message will include:
```
Pattern: process-doc-alignment
Deleted: none
```

---

## Via Negativa Analysis

- Reviewed `MANDATORY_WORK_CHECKLIST.md` and `docs/MANDATORY_VERIFICATION_LOOP.md` to see if removing ambiguous language could help. They lack any statement about early test authoring, so deletion alone cannot express the new policy.
- Therefore, additive clarifications are required to set expectations.

---

## Refactor vs Repair Analysis

This is a refactor of process documentation: we are correcting workflow guidance (root cause) rather than adding a one-off reminder. No large files (>200 LOC) receive structural changes beyond edited sections.

---

## Alternatives Considered

### Alternative 1: Assign test authoring to SPEC
- Pros: SPEC already captures acceptance criteria; natural place to outline tests.
- Cons: SPEC artefacts tend to be narrative, not executable. Agents may lack context to write concrete tests before design decisions.
- Rejected because PLAN better balances concreteness and readiness.

### Alternative 2: Assign test authoring to THINK
- Pros: THINK focuses on edge cases, making test enumeration intuitive.
- Cons: THINK emphasises analysis over artefact creation; mixing in mandatory coding could dilute its purpose. Some agents complete THINK before locking architecture.
- Rejected to preserve THINK as reasoning-oriented.

### Selected Approach: Assign test authoring to PLAN
- PLAN already decides files to touch and implementation sequencing. Adding test authoring here codifies TDD mindset without overloading SPEC/THINK.
- Aligns with AFP/SCAS: encourages forethought (COHERENCE), keeps work local to planning (LOCALITY), and reduces rework (ECONOMY).

---

## Complexity Analysis

- Complexity increases slightly through additional wording but reduces behavioural ambiguity. No new artefacts added.
- Trade-off is justified: clearer instructions lower future remediation cost.

---

## Implementation Plan

**Scope:**
- Files: `AGENTS.md`, `MANDATORY_WORK_CHECKLIST.md`, `docs/MANDATORY_VERIFICATION_LOOP.md`, `docs/templates/design_template.md` (4 files, within limit).
- Estimated LOC: +90 / -15 ≈ +75 net (within 150 LOC guardrail).

**Steps:**
1. Edit `AGENTS.md` PLAN/VERIFY sections to mandate PLAN-authored tests and describe VERIFY as execution only.
2. Update `MANDATORY_WORK_CHECKLIST.md` PLAN checklist with a required item for test authoring, adjust VERIFY section to reference earlier tests.
3. Modify `docs/MANDATORY_VERIFICATION_LOOP.md` Step 2 wording so it refers to running tests produced during PLAN.
4. In `docs/templates/design_template.md`, expand Implementation Plan guidance to ensure PLAN documents list tests that were authored prior to IMPLEMENT.
5. Proofread for consistency and ensure allowances for skipped/failing tests when implementation is not complete.

**Risks & Mitigations:**
- Inconsistency between documents → mitigate by reviewing all modified sections together.
- Misinterpretation about failing tests → explicitly note that PLAN-authored tests may initially fail.

**Assumptions:**
- Agents can maintain PLAN-authored tests even if implementation not ready.
- No other document contradicts the new rule; if discovered, will update accordingly.

---

**Design Complete:** 2025-11-06
