# Strategy Analysis — AFP-PROCESS-HIERARCHY-20251106

**Template Version:** 1.0  
**Date:** 2025-11-06  
**Author:** Codex (WeatherVane)

---

## Purpose

Extend the PLAN-first testing requirement to higher-level process guides (Council instructions, concept docs, task-lifecycle playbooks) so every layer of guidance delivers the same message: tests must be authored before implementation and separated from VERIFY by at least one phase. This prevents ambiguity where different docs still imply tests can be written during IMPLEMENT or VERIFY.

---

## Problem Statement

**What is the actual problem we're solving?**

We recently updated frontline docs (AGENTS.md, Mandatory checklist, design template) to require tests during PLAN, but higher-level process manuals still state or imply that tests are written during IMPLEMENT or VERIFY. This inconsistency provides loopholes for agents referencing older guidance and undermines the behavioural change we just introduced.

**Who is affected by this problem?**

- Council reviewers relying on `claude.md` for enforcement cues.
- Agents consulting `docs/concepts/afp_work_phases.md` or the agent library lifecycle guide when onboarding or seeking clarifications.
- Autopilot orchestration tasks referencing these docs programmatically.

---

## Root Cause Analysis

**What is the ROOT CAUSE (not symptoms)?**

Documentation hierarchy evolved over time, and deeper references (concept guides, lifecycle scripts) still reflect the old sequencing where tests are authored during VERIFY. Recent updates targeted only frontline references, leaving upstream documentation out of sync.

**What evidence supports this root cause?**

- `claude.md` Phase 6/7 instructions currently say "Write tests" during IMPLEMENT and "Test it works" during VERIFY with no mention of PLAN-authored tests.
- `docs/concepts/afp_work_phases.md` PLAN section lacks any mention of test authoring, while Phase 7 emphasises testing responsibilities.
- `docs/agent_library/common/processes/task_lifecycle.md` Step 6 instructions explicitly say "Write tests" during implementation.

---

## Current State vs Desired State

**Current State:**

- High-level docs conflict with updated frontline requirements, allowing agents to justify writing tests in VERIFY/IMPLEMENT.
- No explicit instruction in those docs to return to PLAN when new tests are required mid-VERIFY.

**Desired State:**

- Every phase description across the documentation hierarchy (Council guidance, concept guide, lifecycle playbook) states that tests are authored during PLAN, may initially fail/skip, and VERIFY solely executes them.
- Documents instruct agents to loop back to PLAN if they discover missing tests later.

**Gap Analysis:**

- PLAN sections missing test authoring requirements → need textual updates in multiple docs.
- IMPLEMENT sections still say "write tests" → must adjust to "make PLAN tests pass".
- VERIFY sections must explicitly forbid new test authoring and require returning to PLAN.

---

## Success Criteria

1. `claude.md` PLAN/VERIFY sections mirror the new policy and mention how to handle missing coverage.
2. `docs/concepts/afp_work_phases.md` PLAN description and examples mention authoring tests ahead of implementation; Phase 7 emphasises execution-only testing.
3. `docs/agent_library/common/processes/task_lifecycle.md` updates Implementation/Verify steps to align with earlier test creation and direct agents to loop back to PLAN when gaps arise.
4. Quick `rg "Write tests"` search in targeted docs shows no remaining instructions that contradict the policy.

---

## Impact Assessment

- **Quality:** Eliminates mixed messaging, reinforcing unbiased test authoring earlier in lifecycle.
- **Risk:** Reduces likelihood of agents cherry-picking guidance that suits late testing.
- **Efficiency:** Upstream thinking about tests lowers rework in VERIFY loops.
- **Strategic:** Supports consistent enforcement across manuals, enabling autopilot and reviewers to cite any doc without contradiction.

---

## Via Negativa / Simplification

- No deletions needed; minimal textual edits aligning existing sections suffice.
- Avoid duplicating long explanations—reuse concise phrasing and cross-reference existing docs.

---

## Risks and Mitigations

1. **Risk:** Missed references in other less-visible docs.  
   **Mitigation:** Run targeted searches (`rg "Write tests"`, `rg "VERIFY"`) after edits to catch obvious stragglers.

2. **Risk:** Tone mismatch in various docs.  
   **Mitigation:** Adapt wording to each document’s voice while keeping core message identical.

3. **Risk:** Agents misinterpret requirement as forbidding iterative test refinement.  
   **Mitigation:** Explicitly mention that tests may start failing/skipped and must be updated in PLAN if new cases arise.

---

## Dependencies and Constraints

- Must stay within micro-batching guardrails (≤5 files, ≤150 LOC).
- No toolchain changes required beyond re-running `plan_next` sanity check.

---

## Open Questions

1. Are there additional docs (e.g., onboarding guides) that also require updates? If discovered, schedule follow-up tasks.
2. Should we add automated linting to detect phrases like "Write tests" in certain sections? Out of scope now but worth noting.

---

## Recommendation

**Proceed — Priority: High, Urgency: Immediate, Effort: Small.** Aligning top-level documentation now ensures the new policy sticks across the organisation.

---

**Strategy Complete:** 2025-11-06  
**Next Phase:** SPEC
