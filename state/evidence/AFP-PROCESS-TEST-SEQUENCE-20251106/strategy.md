# Strategy Analysis — AFP-PROCESS-TEST-SEQUENCE-20251106

**Template Version:** 1.0  
**Date:** 2025-11-06  
**Author:** Codex (WeatherVane)

---

## Purpose

Agents currently draft or adjust verification tests at the end of the lifecycle. The user asked us to require that those tests be written earlier so they cannot be tailored after seeing implementation details. This strategy captures why the change matters before we adjust the process documentation.

---

## Problem Statement

**What is the actual problem we're solving?**

Tests that should validate behaviour are often authored during the VERIFY phase, after the implementation is already in place. This timing makes it easy for agents to write narrow tests that only confirm the code they just wrote, instead of independently validating requirements. The outcome is weaker regression coverage and limited protection against incorrect implementations.

**Who is affected by this problem?**

- Autopilot agents and codex operators: lose the guardrail of unbiased tests and can unconsciously bias coverage.
- Reviewers and downstream consumers: receive features that appear verified but may miss edge cases because tests mirror the implementation rather than the specification.
- Product stakeholders: see increased risk of regressions and follow-up remediation tasks when gaps surface later.

---

## Root Cause Analysis

**What is the ROOT CAUSE (not symptoms)?**

The AFP lifecycle documentation assigns test execution to the VERIFY phase and never mandates that test cases be defined or coded earlier. Without an explicit requirement, agents default to writing tests right before running them. The path of least resistance therefore encourages "implementation-informed" tests instead of requirements-informed tests.

**What evidence supports this root cause?**

- `AGENTS.md` (Phase 7) directs readers to `docs/MANDATORY_VERIFICATION_LOOP.md`, which focuses on running tests after implementation but is silent on when tests must be authored.
- `docs/MANDATORY_VERIFICATION_LOOP.md` (Step 2: TEST Verification) assumes tests exist or are written while executing the loop; it emphasises coverage dimensions but not an earlier authoring phase.
- None of the STRATEGIZE/SPEC/PLAN/THINK descriptions assign responsibility for writing tests, leaving a structural gap that makes late-stage authoring the default.

---

## Current State vs Desired State

**Current State:**

- Tests are typically created or updated during VERIFY immediately after implementation.
- Process documentation does not force agents to articulate or commit to tests earlier in the lifecycle.
- This allows confirmation bias: developers read their new code and then write minimal tests that obviously pass.

**Desired State:**

- Test plans or actual failing tests are produced during an upstream phase (SPEC, PLAN, or THINK) before implementation begins.
- Documentation clearly states which phase owns producing the tests, and VERIFY focuses on executing the previously defined tests.
- Agents are incentivised to think through edge cases earlier, increasing independent validation and decreasing biased test writing.

**Gap Analysis:**

- Phase ownership for tests shifts from VERIFY to an earlier AFP phase.
- Documentation needs aligned updates in `AGENTS.md`, `MANDATORY_WORK_CHECKLIST.md`, and `docs/MANDATORY_VERIFICATION_LOOP.md`.
- Templates or checklists must prompt agents to capture the planned tests before IMPLEMENT.

---

## Success Criteria

1. `AGENTS.md` explicitly assigns test authoring to a pre-IMPLEMENT phase and constrains VERIFY to running earlier tests.
2. `MANDATORY_WORK_CHECKLIST.md` includes a checkbox confirming tests were prepared before implementation (within the selected phase).
3. The chosen phase template (PLAN or THINK) gains guidance to detail or code those tests ahead of time.
4. Related process docs contain no contradictions about when tests are written versus executed.

---

## Impact Assessment

- **Quality:** Earlier test design encourages requirement-focused validation and strengthens regression protection.
- **Risk:** Reduces biased test coverage and mitigates late discovery of missing edge cases.
- **Efficiency:** Moving test authoring upstream lowers rework in the verification loop and shortens subsequent remediation cycles.
- **Strategic:** Aligns process with TDD-style discipline, improving readiness for more autonomous agent operation.

---

## Via Negativa / Simplification

- Focus on revising existing documentation; avoid introducing new tooling unless a gap remains after doc updates.
- Reuse existing templates and checklists instead of creating new artefacts when possible.

---

## Risks and Mitigations

1. **Risk:** Agents misunderstand whether they must ship executable tests pre-implementation.  
   **Likelihood:** Medium.  
   **Impact:** Medium. Could cause confusion or blockers.  
   **Mitigation:** Clarify that tests must be authored (code or detailed plan) and may be temporarily skipped if implementation is incomplete, but they must exist before IMPLEMENT.

2. **Risk:** Missing a downstream checklist leaves conflicting guidance.  
   **Likelihood:** Medium.  
   **Impact:** High, because conflicting docs create process debt.  
   **Mitigation:** Audit all lifecycle docs touched by VERIFY, especially `MANDATORY_WORK_CHECKLIST.md` and verification loop guidance.

3. **Risk:** Pre-written tests might fail to compile without stubs.  
   **Likelihood:** Low.  
   **Impact:** Low.  
   **Mitigation:** Encourage using TODO markers or skipped tests with clear notes until implementation enables execution.

---

## Dependencies and Constraints

- Must respect micro-batching guardrails (≤5 files, ≤150 net LOC).
- Ensure all documentation changes remain ASCII and consistent with repo style.
- No external approvals or tooling changes required for this task.

---

## Open Questions

1. Which lifecycle phase should formally own drafting the tests? (SPEC vs PLAN vs THINK.)
2. How do we document expectations for test code versus test plans when implementation prerequisites are missing?
3. Do we need to update design.md expectations or leave that to follow-up work?
4. Should we schedule a follow-up task for automated enforcement after the documentation change?

---

## Recommendation

**Proceed — Priority: High, Urgency: Immediate, Effort: Small.** The change directly addresses a user-identified gap, requires only documentation updates, and reduces quality risk with minimal cost.

---

**Strategy Complete:** 2025-11-06  
**Next Phase:** SPEC
