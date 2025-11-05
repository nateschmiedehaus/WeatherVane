# Strategy Analysis — [TASK-ID]

**Template Version:** 1.0
**Date:** [YYYY-MM-DD]
**Author:** [Agent/Council name]

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

## Problem Statement

**What is the actual problem we're solving?**

[Describe the problem in 2-4 sentences. Be specific.]

**Examples:**
- ❌ BAD: "The system needs improvement"
- ✅ GOOD: "Agents skip the STRATEGY phase 40% of the time (evidence: 12 of 30 recent tasks in state/evidence/ lack strategy.md), leading to poor task selection and wasted implementation effort"

**Who is affected by this problem?**

[List stakeholders and how they're impacted]

**Examples:**
- ❌ BAD: "Users"
- ✅ GOOD: "Autopilot Atlas (wastes tokens on low-value tasks), Director Dana (cannot prioritize effectively without quality analysis), Human users (receive lower-value deliverables)"

---

## Root Cause Analysis

**What is the ROOT CAUSE (not symptoms)?**

[Dig deeper. Ask "why" 3-5 times to get to the root.]

**Examples:**
- ❌ SHALLOW: "Agents don't think strategically"
- ✅ DEEPER: "No enforcement mechanism exists for STRATEGY phase → agents skip it to save time → poor quality compounds → human review catches it too late → rework costs 10x more"

**What evidence supports this root cause?**

[Provide specific evidence: file paths, metrics, quotes, observations]

**Examples:**
- ❌ VAGUE: "I noticed quality issues"
- ✅ SPECIFIC: "Review of state/evidence/ shows 12/30 tasks lack strategy.md (40%). Of those 12, 8 required significant rework (evidence: -REMEDIATION- task IDs). Average remediation time: 2-3 hours per task."

---

## Current State vs Desired State

**Current State:**

[What's happening now? Be factual.]

**Examples:**
- ❌ OPINION: "The system is bad"
- ✅ FACTUAL: "STRATEGIZE phase exists in docs (CLAUDE.md:20-25) but has no template, no examples, no enforcement. Agents skip it ~40% of the time. DesignReviewer enforces GATE but nothing enforces earlier phases."

**Desired State:**

[What should be happening? Be specific about outcomes, not solutions.]

**Examples:**
- ❌ SOLUTION-FOCUSED: "We need a StrategyReviewer tool"
- ✅ OUTCOME-FOCUSED: "100% of tasks have documented strategy analysis before PLAN phase. Quality of strategic thinking is measurable and improving over time. Agents receive feedback within 30 seconds of completing strategy.md."

**Gap Analysis:**

[What's the delta between current and desired? Quantify if possible.]

**Examples:**
- 40% → 100% compliance (2.5x improvement)
- 0 → <30 second feedback loop
- Ad-hoc → measurable quality tracking

---

## Success Criteria

**How will we know this task succeeded?**

[List 3-5 measurable criteria. Use SMART framework where possible.]

**Examples:**
- ❌ VAGUE: "Better quality"
- ✅ MEASURABLE: "100% of new tasks in state/evidence/ have strategy.md files (measured by pre-commit hook rejection rate < 5%)"
- ✅ MEASURABLE: "StrategyReviewer approval rate > 80% on first review (measured by state/analytics/strategy_reviews.jsonl)"
- ✅ MEASURABLE: "Remediation tasks decrease by 30% within 4 weeks (compare state/roadmap.yaml REMEDIATION task frequency)"

**Criteria:**

1. [Criterion 1 - measurable]
2. [Criterion 2 - measurable]
3. [Criterion 3 - measurable]
4. [Criterion 4 - measurable, optional]
5. [Criterion 5 - measurable, optional]

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
