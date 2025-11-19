# Strategy Analysis — AFP-AUTOPILOT-ARCH-20251119

**Template Version:** 1.0
**Date:** 2025-11-19
**Author:** Codex

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

**Check for existing READMEs before starting analysis:**

**Epic context:** WAVE-0 epic README not present (checked `state/epics`); closest guiding doc: `docs/orchestration/unified_autopilot_enhancement_plan.md` outlining orchestration guardrails and dual high-end planning lane.
**Milestone context:** No milestone README found under `state/milestones`, but current critical task in AGENTS.md points to `AFP-W0-AUTOPILOT-INTEGRITY-ENFORCEMENT-20251107`.
**Task group context:** None located in `state/task_groups`.
**Module context:** `docs/orchestration/AUTOPILOT_VALIDATION_RULES.md` defines live-fire validation expectations; `docs/orchestration/ORCHESTRATOR_EVOLUTION_SPEC.md` captures orchestration stack evolution requirements.

Key insights pulled:
- Enhancement plan stresses guardrail restoration, dual planner/reviewer lane, and policy telemetry—aligns with desired automated mapping.
- Validation rules insist build/tests are insufficient; require live Wave0-style execution evidence for autonomy.
- Current instructions (AGENTS.md) enforce AFP 10-phase lifecycle with evidence, indicating process-heavy baseline that needs automation support rather than bypass.

---

## Problem Statement

**What is the actual problem we're solving?**

We need an architecture that maps AFP phases (strategy → monitor) to an automated multi-agent stack so work can run autonomously without today’s heavy manual ceremony, while fitting the strict guardrails already in place. Lacking this mapping, agents oscillate between over-ceremony (manual checklists) and brittle shortcuts (risking violations), and we can’t quantify how close we are to ideal autonomy.

**Who is affected by this problem?**

- Autopilot orchestrator (Wave0) – lacks blueprint to distribute AFP phases across agents/tools.
- Process owners (Atlas/Dana) – can't tell which guardrails can be automated or measured.
- Implementing agents – incur overhead from manual evidence authoring and risk blockers (DesignReviewer, ProcessCritic) without automation cues.
- Users relying on autonomous delivery – experience delays or failed runs when phases are skipped or overdone.

---

## Root Cause Analysis

**What is the ROOT CAUSE (not symptoms)?**

Root cause: AFP lifecycle and guardrails are documented as manual checklists (AGENTS.md, MANDATORY_WORK_CHECKLIST.md), but there’s no explicit architecture that binds each phase to agents, sandboxes, critics, and environment automation. This leaves enforcement to humans/agents ad hoc, causing inconsistency and bypass attempts.

**What evidence supports this root cause?**
- AGENTS.md focuses on behavioural mandates rather than an automated pipeline mapping phases to tools/environments.
- `docs/orchestration/unified_autopilot_enhancement_plan.md` lists gaps like missing guardrail restoration, memo trails, and context orchestration—indicating architecture debt.
- Guardrail monitor currently failing due to stale daily audit (node tools/wvo_mcp/scripts/check_guardrails.mjs run at 2025-11-19T21:07:44Z) showing operational enforcement not automated.

---

## Current State vs Desired State

**Current State:**
- AFP phases mandated with strict behavioural guardrails and evidence folders; compliance depends on humans/agents manually creating docs and running scripts.
- Orchestrator (Wave0) lacks explicit mapping of phases to agent roles, sandboxes, and tooling; checks like guardrail monitor run manually.
- Verification relies on consolidated integrity script and Wave0 live testing but not tied into an automated per-phase pipeline.

**Desired State:**
- A documented architecture where each AFP phase is owned by a specialized agent/tool with clear inputs/outputs, RAG/context, sandbox requirements, critics, and telemetry.
- Automated enforcement of required steps (daily audit, guardrail monitor, design gate) with clear recovery paths and minimal manual ceremony.
- Repeatable preview/test/deploy flow for web work with policy-aware controls and evidence emitted automatically.

**Gap Analysis:**
- Mapping is implicit/tribal → needs explicit documented flow.
- Manual execution of audits/tests → needs orchestrated triggers with telemetry feedback loops.
- Quality gates applied late or manually → need phase-aligned critics + sandbox policies embedded in orchestration.

---

## Success Criteria

**Criteria:**

1. Architecture doc produced that maps all 10 AFP phases to agent roles/tooling/sandboxes with explicit inputs/outputs and telemetry hooks (reviewable in docs/).
2. Alignment table comparing ideal vs current process with prioritized gaps and next actions (at least 5 concrete alignment steps).
3. DesignReviewer/critics pass on design artifact tied to this architecture.
4. Guardrail monitor passes after audit remediation within this task.
5. Evidence trail for all AFP phases completed for this task (strategy → monitor) without bypass flags.

---

## Impact Assessment

**If we do this task, what improves?**

[Quantify impact where possible. Consider multiple dimensions.]

**Dimensions to consider:**
- **Efficiency:** Time/tokens saved
- **Quality:** Defects reduced, rework avoided
- **Velocity:** Tasks completed per week
- **Cost:** Budget impact (token usage, human time)
- **Risk:** What risks are reduced?
- **Strategic:** Does this unlock future capabilities?

**Examples:**
- ❌ GENERIC: "Quality will improve"
- ✅ QUANTIFIED: "Prevent 8 remediation tasks per 30-task cycle (8 * 2.5 hours = 20 hours saved). At 50k tokens/hour, save 1M tokens per cycle (~$15 at current rates). Strategic value: proven pattern can extend to other phases (THINK, SPEC)."

**Estimated Impact:**
- Efficiency: reduce manual ceremony per task by ~15-30 minutes once automation plan is implemented; fewer blocked gates.
- Quality: clearer ownership of phases should increase critic first-pass rate (design/strategy/think) and lower remediation loops.
- Risk: improved secret/FS policy alignment reduces breach risk when automating (explicit allow/deny).
- Velocity: enables Wave0 to run more tasks concurrently by parallelizing phase owners.

**If we DON'T do this task, what are the consequences?**
- Continued guardrail failures (e.g., stale daily audit) and manual firefighting.
- Agents either bypass phases (violating zero-tolerance) or get stuck in ceremony with no automation uplift.
- Autopilot roadmap stalls—no blueprint to evolve toward full autonomy in web dev context.

---

## Alignment with Strategy (AFP/SCAS)

**How does this task align with Anti-Fragile Principles (AFP) and Success Cascade Assurance System (SCAS)?**

**Via Negativa (Deletion > Addition):**
- Aim to delete redundant manual checklists by replacing with automated phase hooks; prevent bypass attempts by making automation handle gating.

**Refactor not Repair:**
- Addressing root cause (missing orchestration mapping) by designing a structured, automatable flow rather than adding more reminders.

**Complexity Control:**
- Adds a single architecture doc and alignment plan (minimal LOC) but reduces cognitive complexity by clarifying phase ownership and automation responsibilities; net complexity decrease through structure.

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
