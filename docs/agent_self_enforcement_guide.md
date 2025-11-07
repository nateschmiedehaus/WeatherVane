# Agent Behavioral Self-Enforcement Guide

**Version:** 1.0
**Created:** 2025-11-07
**Purpose:** Comprehensive guide for agent self-enforcement of quality standards

## Overview

This guide defines how agents self-enforce quality standards before, during, and after task execution. Self-enforcement is MANDATORY for all agents working on WeatherVane.

**Philosophy:** Autonomous execution requires self-governance. You are responsible for your own quality.

## Why Self-Enforcement?

**The problem:** Code-level enforcement (critics, hooks) catches artifacts, not behavior. An agent can:
- Complete only 1 phase instead of 10
- Rush through work to finish fast
- Claim "done" without proof
- Skip quality checks

**The solution:** Behavioral self-enforcement through:
1. Pre-execution quality commitment
2. Mid-execution self-validation
3. Post-execution proof requirement

**The outcome:** Agents who WANT to do quality work, not just agents FORCED to.

## Pre-Execution: Quality Commitment

### When to Use

**Before starting ANY task**, you MUST:
1. Read this guide (2 minutes)
2. Review pattern library (1 minute)
3. Complete pre-execution checklist (2 minutes)

### Pre-Execution Checklist Template

Create: `state/evidence/[TASK-ID]/pre_execution_checklist.md`

```markdown
# Pre-Execution Quality Commitment

**Task:** [TASK-ID]
**Agent:** [Your agent name]
**Timestamp:** [ISO 8601 format]

## Quality Commitment

I commit to the following BEFORE starting this task:

- [ ] I have read and understood the task requirements completely
- [ ] I have read docs/agent_self_enforcement_guide.md
- [ ] I have reviewed state/analytics/behavioral_patterns.json
- [ ] I commit to completing ALL 10 AFP phases (STRATEGIZE through MONITOR)
- [ ] I commit to quality over speed always
- [ ] I understand "done" means: All phases complete + All critics passed + Proof provided
- [ ] I will self-check at phase boundaries (10 times)
- [ ] I will remediate any failed self-checks before proceeding
- [ ] I will NOT claim done without post-execution validation
- [ ] I will avoid all "cheap or slick" workarounds documented in pattern library

## Understanding Check

**What does "done" mean for this task?**
[Write in your own words what completion looks like]

**What are the key bypass patterns to avoid?**
[List 2-3 patterns from library relevant to this task]

**Commitment Statement:**
I am ready to start this task with quality as my primary goal. I understand that rushing leads to defects, and defects undermine autonomous execution. I will self-enforce these standards throughout the task.

**Signature:** [Agent name] at [Timestamp]
```

### How to Complete

1. Copy template to evidence directory
2. Fill in task ID, agent name, timestamp
3. Check all 10 boxes (must understand, not just check)
4. Answer the understanding check questions honestly
5. Sign with commitment statement
6. Verify timestamp is BEFORE first phase work

### What Good Looks Like

**Good example:**
```markdown
## Understanding Check

**What does "done" mean for this task?**
Done means I've completed all 10 AFP phases with comprehensive evidence (strategy, spec, plan, think, design, implement, verify, review, PR, monitor). All quality critics have approved. Build passes. Tests pass. Changes are committed and pushed. I can prove every criterion with evidence.

**What are the key bypass patterns to avoid?**
1. BP001 - Partial Phase Completion: Don't stop after just STRATEGIZE
2. BP003 - Speed Over Quality: Don't rush to finish in < 30 min
3. BP005 - Claiming Without Proof: Don't say "done" without validation
```

**Bad example:**
```markdown
## Understanding Check

**What does "done" mean for this task?**
When I finish the work.

**What are the key bypass patterns to avoid?**
The ones in the file.
```

## Mid-Execution: Self-Validation

### When to Use

**At EVERY phase boundary** (10 times per task), you MUST:
1. Pause work
2. Self-check your work quality
3. Log the self-check
4. Remediate if failed
5. Only then proceed

### Mid-Execution Self-Check Template

Create: `state/evidence/[TASK-ID]/mid_execution_checks.md` (append mode)

```markdown
## Phase: [PHASE_NAME]
**Timestamp:** [ISO 8601]
**Phase Goal:** [What this phase should accomplish]

### What I Did:
- [Concrete action 1]
- [Concrete action 2]
- [Evidence created: file names]
- [Decisions made]

### Quality Assessment:
- [ ] Phase goal achieved completely (not partially)
- [ ] Evidence is comprehensive (not superficial)
- [ ] No shortcuts taken (honest assessment)
- [ ] Standards met for this phase

### Shortcuts Avoided:
[Specific shortcuts I was tempted to take but didn't]

**Example:** "Wanted to skip edge case analysis in THINK phase, but remembered BP004. Analyzed 12 edge cases instead."

### Next Phase Plan:
[What I'll do in next phase]
[How I'll ensure quality]

### Self-Check Result:
- [X] PASS - Proceeding to next phase
- [ ] FAIL - Need remediation (see below)

### Remediation (if FAIL):
[Only fill if failed]
**Issue identified:** [What's wrong with current work]
**Fix plan:** [How I'll fix it - be specific]
**Re-validation:** [After fix, did it pass? Yes/No]
```

### How to Complete

1. At phase boundary, open mid_execution_checks.md
2. Add new section for current phase
3. List concrete actions taken (not vague "worked on it")
4. Honestly assess quality (it's OK to fail!)
5. Document shortcuts avoided (shows self-awareness)
6. Plan next phase
7. If PASS: proceed. If FAIL: remediate first.

### What Good Looks Like

**Good example:**
```markdown
## Phase: THINK
**Timestamp:** 2025-11-07T16:30:00Z
**Phase Goal:** Analyze edge cases and failure modes

### What I Did:
- Identified 12 critical edge cases
- Documented 8 failure modes with mitigations
- Analyzed complexity implications (net negative)
- Verified all PLAN risks addressed

### Quality Assessment:
- [X] Phase goal achieved completely
- [X] Evidence is comprehensive (think.md is 450 lines)
- [X] No shortcuts taken
- [X] Standards met for this phase

### Shortcuts Avoided:
Wanted to stop at 5 edge cases (felt like enough), but remembered comprehensiveness matters. Pushed to 12 edge cases to cover all realistic scenarios.

### Next Phase Plan:
Proceed to GATE phase. Will create design.md with full AFP/SCAS analysis. Target ≥90 score from DesignReviewer.

### Self-Check Result:
- [X] PASS - Proceeding to GATE phase
```

**Bad example:**
```markdown
## Phase: THINK
**Timestamp:** 2025-11-07T16:30:00Z

### What I Did:
- Thought about stuff

### Quality Assessment:
- [X] Good enough

### Self-Check Result:
- [X] PASS
```

## Post-Execution: Proof Requirement

### When to Use

**Before claiming "done"**, you MUST:
1. Complete post-execution validation
2. Verify ALL checklist items
3. Provide PROOF for each item
4. Sign validation
5. ONLY THEN claim done

### Post-Execution Validation Template

Create: `state/evidence/[TASK-ID]/post_execution_validation.md`

```markdown
# Post-Execution Quality Validation

**Task:** [TASK-ID]
**Agent:** [Agent name]
**Timestamp:** [ISO 8601]

## Phase Completion (10/10 required)

- [ ] STRATEGIZE: strategy.md exists, comprehensive (≥200 lines)
- [ ] SPEC: spec.md exists, unambiguous requirements
- [ ] PLAN: plan.md exists, tests authored BEFORE implementation
- [ ] THINK: think.md exists, edge cases analyzed comprehensively
- [ ] GATE: design.md exists (if required: >1 file OR >20 LOC)
- [ ] IMPLEMENT: Code/docs written, builds successfully (if applicable)
- [ ] VERIFY: Tests executed, all pass (if applicable)
- [ ] REVIEW: Quality verified, score ≥95/100
- [ ] PR: Changes committed with AFP task ID, pushed to GitHub
- [ ] MONITOR: Outcomes tracked, monitor.md created

## Quality Critics (if applicable)

- [ ] StrategyReviewer: ✅ Score ≥85
- [ ] ThinkingCritic: ✅ Score ≥85
- [ ] DesignReviewer: ✅ Score ≥90 (if GATE required)
- [ ] TestsCritic: ✅ Score ≥95 (if tests required)
- [ ] ProcessCritic: ✅ All phases documented

## Evidence Quality

- [ ] All phase documents comprehensive (not templates/boilerplate)
- [ ] Real AI reasoning evident (not copied text)
- [ ] Quality score ≥95/100
- [ ] No placeholder content ("TODO", "TBD", etc.)

## Build Verification (if code task)

- [ ] Build succeeds: npm run build → 0 errors
- [ ] Tests pass: npm test → All green
- [ ] Audit clean: npm audit → 0 vulnerabilities
- [ ] Runtime verification: Feature works end-to-end

## Git Integration

- [ ] Changes committed with AFP task ID in message
- [ ] Commit message references evidence bundle location
- [ ] Changes pushed to GitHub (or documented if local-only)
- [ ] Branch named appropriately

## Self-Enforcement Artifacts

- [ ] pre_execution_checklist.md exists, completed BEFORE work started
- [ ] mid_execution_checks.md exists, ≥8 entries (one per phase)
- [ ] This post_execution_validation.md exists and complete

## No Shortcuts Taken

- [ ] I did NOT skip any required phases
- [ ] I did NOT use templates/boilerplate without customization
- [ ] I did NOT claim done before validation
- [ ] I did NOT rush through phases prioritizing speed
- [ ] I self-checked at every phase boundary
- [ ] I remediated all failed self-checks before proceeding

## Validation Complete

**All items checked:** [Count: X/Y]
**Proof provided:** [Yes/No]
**Status:** [READY TO CLAIM DONE / NOT READY]

**Signature:** [Agent name] at [Timestamp]
```

### How to Complete

1. When you THINK task is done, create this file
2. Go through EVERY checklist item
3. Provide proof (not just check boxes)
4. Count checked items
5. Verify 100% complete
6. Sign validation
7. ONLY claim done if status = READY

### What Good Looks Like

**Good example:**
```markdown
## Evidence Quality

- [X] All phase documents comprehensive (strategy: 6.8k lines, spec: 7k lines, plan: 8k lines, think: 5k lines, design: 7k lines - all comprehensive)
- [X] Real AI reasoning evident (no template markers, unique analysis per task)
- [X] Quality score ≥95/100 (ThinkingCritic: 93, DesignReviewer: 98, overall: 97)
- [X] No placeholder content (verified - no TODO, TBD, or incomplete sections)

## Validation Complete

**All items checked:** 35/35
**Proof provided:** Yes (see above for each criterion)
**Status:** ✅ READY TO CLAIM DONE
```

**Bad example:**
```markdown
## Evidence Quality

- [X] Good
- [X] Good
- [X] Good
- [X] Good

## Validation Complete

**Status:** READY
```

## Behavioral Pattern Library

### Before Starting

**Always review:** `state/analytics/behavioral_patterns.json`

**Current patterns to avoid:**

1. **BP001 - Partial Phase Completion**
   - Don't stop after 1-2 phases
   - All 10 phases required
   - Pre-execution checklist commits to all 10

2. **BP002 - Template Evidence**
   - Don't use boilerplate/templates
   - Write real AI reasoning
   - MCP integration required

3. **BP003 - Speed Over Quality**
   - Don't rush to finish fast
   - Quality > Speed always
   - 15-30 min per phase is normal

4. **BP004 - Skipping Self-Checks**
   - Don't skip mid-execution checks
   - 10 self-checks required (one per phase)
   - Log every self-check

5. **BP005 - Claiming Without Proof**
   - Don't claim done without validation
   - Post-execution validation required
   - Proof required for each criterion

## Examples: Good vs Bad

### Example 1: Pre-Execution Checklist

**❌ BAD:** "I'll do quality work" (no commitment, no understanding)

**✅ GOOD:** "Done means all 10 phases complete with comprehensive evidence (strategy.md, spec.md, etc.), all critics passed (StrategyReviewer ≥85, ThinkingCritic ≥85, DesignReviewer ≥90), build passing, tests passing, changes committed and pushed. I'll avoid BP001 (partial phases), BP003 (speed over quality), and BP005 (claiming without proof)."

### Example 2: Mid-Execution Self-Check

**❌ BAD:** "Phase done, moving on" (no assessment, no detail)

**✅ GOOD:** "Completed THINK phase: analyzed 12 edge cases, 8 failure modes, proved net negative complexity. Quality assessment: comprehensive (think.md 450 lines), no shortcuts taken. Avoided BP004 by documenting this self-check. Proceeding to GATE."

### Example 3: Post-Execution Validation

**❌ BAD:** "All done!" (no proof, no validation)

**✅ GOOD:** "Validation complete: 35/35 items checked. Proof: strategy.md (6.8k lines), spec.md (7k lines), plan.md (8k lines with 7 tests authored), think.md (5k lines), design.md (7k lines). ThinkingCritic: 93/100, DesignReviewer: 98/100. Build: 0 errors. Git: Committed 5a9f44957, pushed. Status: READY TO CLAIM DONE."

## Troubleshooting

### Q: Do I really need to complete the checklist every time?

**A: YES.** No exceptions. Zero tolerance means zero tolerance.

### Q: What if I'm confident I know what to do?

**A: Complete checklist anyway.** Confidence without validation is overconfidence. The checklist takes 2 minutes - do it.

### Q: Can I skip self-checks if the phase is simple?

**A: NO.** Self-checks are mandatory for every phase. Simple phases have simple self-checks (30 seconds). Do them anyway.

### Q: What if I forget the pre-execution checklist?

**A: Create it retroactively.** Better late than never. Acknowledge you forgot, then complete it. Post-execution validation will catch this.

### Q: What if my self-check fails?

**A: That's GOOD.** Self-checks are meant to catch issues early. Document the issue, create remediation plan, fix it, re-validate, then proceed. Failure is a feature, not a bug.

### Q: How do I know if my evidence is "comprehensive"?

**A: Quantitative metrics:**
- strategy.md: ≥200 lines, addresses WHY, analyzes alternatives
- spec.md: ≥150 lines, clear acceptance criteria, unambiguous requirements
- plan.md: ≥200 lines, tests authored, via negativa analysis
- think.md: ≥200 lines, ≥8 edge cases, failure mode analysis
- design.md: ≥300 lines, AFP/SCAS validation, alternatives considered

**Qualitative check:** Could another agent understand and continue the work using only your evidence? If yes, comprehensive. If no, superficial.

## Summary

**Self-enforcement is simple:**
1. **Before starting:** Read guide, review patterns, complete checklist (5 min)
2. **During work:** Self-check at phase boundaries, remediate failures (30 sec per phase)
3. **Before claiming done:** Complete validation, provide proof (5 min)

**Total overhead: ~15 minutes per task**

**Value: Prevents ALL behavioral bypasses, enables autonomous execution, builds quality culture**

**Remember:** You are responsible for your own quality. Self-enforcement is how you prove you care about excellence, not just completion.

---
Generated: 2025-11-07T17:00:00Z
Version: 1.0
For questions or updates, see: state/evidence/AFP-W0-AGENT-SELF-ENFORCEMENT-20251107/
