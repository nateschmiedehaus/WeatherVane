# Strategy Analysis — AFP-MODULE-REMEDIATION-20251105-V

**Template Version:** 1.0  
**Date:** 2025-11-06  
**Author:** Codex (Autopilot worker)

---

## Purpose

This document captures **WHY** this task matters and **WHAT** we're trying to achieve (not HOW - that comes in later phases).

**Instructions:**
- Be specific and honest
- Show your thinking, not just conclusions
- Use evidence from the codebase/context
- If you don't know something, say so explicitly
- Aim for ~30-60 lines of substantive analysis

---

## Hierarchical Context

Checked READMEs / sources:
- ✅ `state/epics/WAVE-0/README.md` – documents the stabilization goal for Wave 0 (autopilot foundation + proof loops). Content is skeletal but reiterates that Wave 0 must demonstrate unattended self-improvement.
- ❌ `state/milestones/W0.M1/README.md` – milestone README not yet generated; we rely on `state/roadmap.yaml` entries for milestone scope (Reboot Autopilot Core, device profile regression follow-ups, etc.).
- ✅ `tools/wvo_mcp/src/orchestrator/README.md` – describes orchestrator responsibilities and highlights the critic/reviewer stack we are touching (domain expert reviewer).
- ✅ `tools/wvo_mcp/src/guardrails/README.md` – outlines the guardrail catalog module we must restore.
- ✅ `tools/wvo_mcp/src/work_process/README.md` – confirms this module enforces AFP/SCAS lifecycle invariants (tests failing right now).
- ✅ `docs/workflows/AFP_REVIEWER_ROUTINE.md` – fresh documentation we authored earlier that now mandates the reviewer + Wave 0 flow; this task must prove those instructions actually work by finishing with a green Wave 0 run.

Key context:
- Wave 0 epic explicitly aims for <4 week path to autonomy with proof-driven enforcement; failing tests block this because ProofSystem uses `npm run test` as a gating step.
- Work-process + guardrail modules are AFP/SCAS enforcement plumbing; regressions here mean no credible safety case.
- Autopilot-only focus requires we deliver value for autopilot loops first; guardrail catalog + reviewer tests are high priority, while ML critic improvements are important but not immediately required for ProofSystem.

---

## Problem Statement

`npm run test` currently fails in four suites (domain expert reviewer, ML task aggregator critic results, work_process enforcement, guardrail catalog). ProofSystem runs this command for every Wave 0 task, so all autopilot runs halt at discovery and mark tasks `blocked`. Without green tests we cannot prove spec/plan reviewer enforcement (domain reviewer), lifecycle guardrails (work_process + guardrail catalog), or ML critic regressions. As a result, Wave 0 cannot progress past 50% completion, and autopilot evidence remains stuck in “tests failed” loops.

**Impacted stakeholders**
- **Autopilot operators (Wave 0)** – cannot complete even trivial investigation tasks; autopilot throughput is effectively zero.
- **ProcessCritic / Guardrail enforcement** – lacks live validation since catalog tests fail before guardrails run.
- **AFP Council / Director Dana** – cannot trust autopilot gating while reviewer/guardrail tests are red.
- **Downstream teams** – device profile / domain template follow-ups stay blocked because autopilot can’t unblock them autonomously.

---

## Root Cause Analysis

1. **Domain reviewer templates diverged**: The restored template files no longer include keywords (`statistics`, `philosophical`) asserted in `domain_expert_reviewer.test.ts`, and reviewer output no longer surfaces `criticalConcerns`. Evidence: Vitest failure excerpt (`expected 'Statistics Expert Review...' to contain 'statistics'` etc.) from `npx vitest run src/orchestrator/domain_expert_reviewer.test.ts`.
2. **Guardrail catalog path incorrect under tests**: Tests call `evaluateGuardrails(TEST_WORKSPACE)`, but `TEST_WORKSPACE` resolves to `/Volumes/.../Documents` instead of repo root because the relative path walks too far upward. Result: `ENOENT` for `meta/afp_scas_guardrails.yaml` even though the file exists. Evidence: 12 identical ENOENT failures.
3. **Work-process fixtures missing phase artifacts**: Enforcement now checks for existence + critic approvals of `strategy.md` etc. The tests still create synthetic tasks without evidence folders, so they fail with “strategy.md not found”. Evidence: `WorkProcessEnforcer` error stack from test run.
4. **ML task aggregator result parser not wired**: The aggregator now emits nested shapes, but tests expect `report.critic_results.<name>.passed` to be booleans; actual parser returns `undefined` because we haven’t rebuilt the critic result extraction after earlier shims. Evidence: four assertions comparing `undefined` to true/false and expecting blockers.

Why this matters:
- Wave 0 proof loop requires domain reviewer + work-process enforcement; without those tests our entire AFP/SCAS story collapses.
- Guardrail catalog is how we encode SCAS safety cases; missing file = zero guardrail coverage.
- ML critic results are lower priority for ProofSystem but still needed soon to restore ML meta-critic value; we’ll fix it if time allows but not at expense of gate-critical suites.

---

## Current State vs Desired State

**Current State**
- `npm run test` fails in <1s because the four suites abort early; ProofSystem consequently sets every Wave 0 task to `blocked`.
- Guardrail catalog cannot be read in test context, so we have zero automated validation of the baseline AFP/SCAS guardrails.
- Work-process enforcer rejects even test transitions due to missing evidence stubs, meaning we cannot simulate lifecycle flows.
- ML critic result parsing returns undefined fields, so meta-critic output is unusable (but this is the least urgent issue for blocking autopilot).

**Desired State**
- All four suites pass locally; ProofSystem sees clean tests and can advance Wave 0 tasks beyond discovery.
- Guardrail catalog tests confirm `meta/afp_scas_guardrails.yaml` loads from repo root in both runtime and tests.
- Work-process tests include synthetic evidence directories so enforcement remains strict without blocking tests.
- ML critic tests either pass with new parser logic or are explicitly deferred (documented), ensuring no false signal.
- After fixes, we rerun Wave 0 and capture a **completed** task (not just discovery) as evidence that autopilot is functional again.

**Gap**
- Current success rate: 0% autopilot tasks completing; desired: ≥1 successful Wave 0 completion in this task.
- Test suites: 4 failing / 0 passing → need 100% pass rate.
- Guardrail coverage: effectively 0 because catalog not reachable in tests → restore to 4/4 baseline guardrails.
- Lifecycle enforcement: tests never reach `spec` → need fixtures so we can validate sequential transitions again.

---

## Success Criteria

1. `npm run test --prefix tools/wvo_mcp` completes with 0 failures (domain reviewer, guardrail catalog, work_process, ML aggregator all pass or ML portion explicitly deferred with documented rationale).
2. Guardrail catalog tests read `meta/afp_scas_guardrails.yaml` from repo root and confirm all four baseline guardrails; we capture evidence (command output + file reference).
3. Work-process tests validate sequential transitions by pointing at synthetic evidence directories populated with phase docs (strategy/spec/plan/think) without relaxing enforcement logic.
4. Wave 0 run (`npm run wave0 -- --once --epic=WAVE-0`) completes a task (status transitions past discovery) after tests pass, and log entry appears in `state/analytics/wave0_runs.jsonl`.
5. Documentation / followups updated: `state/evidence/AFP-MODULE-REMEDIATION-20251105/followups.md` marks task V as done + references autopilot rerun.

---

## Impact Assessment

**Efficiency / Velocity**
- Wave 0 can progress again, so autopilot starts closing backlog tasks without human babysitting.

**Quality / Risk**
- Guardrail catalog + work-process tests ensure AFP/SCAS enforcement remains in place; reduces probability of “implementation without strategy/spec” regressions.
- Domain reviewer tests ensure spec/plan reviewer automation uses the intended templates, preventing silent prompt drift.

**Strategic**
- Demonstrating a successful Wave 0 run after these fixes proves the new reviewer routine (`docs/workflows/AFP_REVIEWER_ROUTINE.md`) is not just documentation but executable practice.
- Clearing ML critic results (even if last) prepares us for the soon-to-come ML critic module remediation tasks (IDs K/L).

**Cost**
- Minimal extra LOC (<150 net LOC). Temporary fixtures (test data + evidence directories) allow autopilot to keep SCAS enforcement strict without runtime hacks.
- ❌ GENERIC: "Quality will improve"
- ✅ QUANTIFIED: "Prevent 8 remediation tasks per 30-task cycle (8 * 2.5 hours = 20 hours saved). At 50k tokens/hour, save 1M tokens per cycle (~$15 at current rates). Strategic value: proven pattern can extend to other phases (THINK, SPEC)."

**Estimated Impact:**

[Your impact analysis here - be honest, use ranges if uncertain]

**If we DON'T do this task, what are the consequences?**

[Be specific about opportunity cost and continued pain]

**Examples:**
- ❌ GENERIC: "Problems continue"
- ✅ SPECIFIC: "Remediation burden continues at 20 hours per 30-task cycle. Quality variance remains high. Manual review burden increases as task volume scales. Strategic blindness: low-value tasks consume resources that could deliver 10x more value elsewhere."

---

## Alignment with Strategy (AFP/SCAS)

**How does this task align with Anti-Fragile Principles (AFP) and Success Cascade Assurance System (SCAS)?**

**Via Negativa (Deletion > Addition):**
[What does this task DELETE, SIMPLIFY, or PREVENT?]

**Examples:**
- ❌ ADDING: "Adds new StrategyReviewer tool" (describes implementation, not strategy)
- ✅ DELETING: "Deletes manual review burden (automates routine checks). Prevents low-value task selection (catches at source). Simplifies decision-making (clear quality bar)."

**Refactor not Repair:**
[Is this addressing root cause or patching symptoms?]

**Examples:**
- ❌ PATCHING: "Add reminder in CLAUDE.md to think strategically"
- ✅ REFACTORING: "Address root cause: no enforcement mechanism. Create systematic solution similar to proven DesignReviewer pattern."

**Complexity Control:**
[Does this increase or decrease system complexity? Justify.]

**Examples:**
- "Increases code complexity: +900 LOC (critic + template + scripts). Decreases cognitive complexity: clear quality bar, automated enforcement. Net: justified trade-off."

**Force Multiplier:**
[Does this amplify future value delivery?]

**Examples:**
- "Proven pattern extends to THINK phase, SPEC phase. Enables better task selection → less waste → more value per token spent. Compounds over time as agents learn from feedback."

---

## Risks and Mitigations

**What could go wrong with this task?**

[List 3-5 risks with honest assessment]

**Risk 1: [Risk description]**
- **Likelihood:** [High/Medium/Low]
- **Impact:** [High/Medium/Low]
- **Mitigation:** [How will we address this?]

**Risk 2: [Risk description]**
- **Likelihood:** [High/Medium/Low]
- **Impact:** [High/Medium/Low]
- **Mitigation:** [How will we address this?]

**Examples:**
- ❌ GENERIC: "Risk: Implementation might fail"
- ✅ SPECIFIC: "Risk: StrategyReviewer too strict → false positives → agent frustration → gaming behavior. Likelihood: Medium (DesignReviewer has ~5% false positive rate). Impact: High (erodes trust). Mitigation: Human escalation path always available, analytics track false positive rate, tune thresholds based on data."

---

## Dependencies and Constraints

**What does this task depend on?**

[List prerequisites: tools, data, other tasks, approvals]

**Examples:**
- "Depends on: Critic base class (exists: tools/wvo_mcp/src/critics/base.ts), Research layer (exists), Analytics infrastructure (exists: state/analytics/)"

**What constraints must we respect?**

[List limitations: time, budget, technical, policy]

**Examples:**
- "Constraints: Micro-batching limits (≤5 files, ≤150 LOC - will need to split into sub-tasks), Token budget (must use intelligence layer sparingly), DesignReviewer pattern (must maintain consistency)"

---

## Open Questions

**What don't we know yet?**

[List uncertainties that might affect the approach. Be honest.]

**Examples:**
- ❌ PRETENDING TO KNOW: "This will definitely work"
- ✅ HONEST: "Unknown: Will agents game the critic by writing longer but still superficial strategy docs? Mitigation: Start with semantic analysis, evolve based on analytics. Unknown: What's the right balance between strictness and flexibility? Mitigation: Monitor false positive/negative rates, tune thresholds."

**Questions:**

1. [Question 1]
2. [Question 2]
3. [Question 3]
4. [Question 4, optional]
5. [Question 5, optional]

---

## Recommendation

**Should we do this task?**

[Yes/No/Defer and why]

**Examples:**
- ❌ WEAK: "Yes, sounds good"
- ✅ STRONG: "YES - proceed immediately. Strong evidence of problem (40% compliance, 20 hours waste per cycle). Clear impact (save 20 hours + 1M tokens per cycle). Proven pattern (DesignReviewer works). High strategic value (extends to other phases). Low risk (human escalation path, analytics feedback loop)."

**If YES:**
- **Priority:** [Critical/High/Medium/Low]
- **Urgency:** [Immediate/Soon/Can wait]
- **Effort:** [Small/Medium/Large - rough estimate]

**If NO or DEFER:**
- **Why not?** [Specific reasoning]
- **What would change your mind?** [What evidence/conditions would make this worthwhile?]

---

## Notes

[Any additional context, references, or decisions made during analysis]

**References:**
- [Link to related tasks, docs, code, discussions]

**Decisions:**
- [Key decisions made during strategy phase]

---

**Strategy Complete:** [YYYY-MM-DD]
**Next Phase:** SPEC (define requirements and acceptance criteria)

---

## Anti-Patterns to Avoid

**This template should help you avoid:**
- 🚫 Jumping straight to solutions (focus on WHY and WHAT, not HOW)
- 🚫 Vague problem statements ("improve quality" vs specific evidence)
- 🚫 Shallow root cause analysis (stopping at symptoms)
- 🚫 Unmeasurable success criteria ("better" vs quantified targets)
- 🚫 Generic risk assessment (specific risks with likelihood/impact)
- 🚫 Missing evidence (claims without supporting data)
- 🚫 Solution bias (starting with "we need X tool" vs "we need to achieve Y outcome")

**Remember:** Strategy is about THINKING, not TYPING. If your strategy.md is < 30 lines, you probably haven't thought deeply enough.
