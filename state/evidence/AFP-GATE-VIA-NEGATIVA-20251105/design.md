# Design: AFP-GATE-VIA-NEGATIVA-20251105

> **Purpose:** Document design thinking for GATE enforcement validation.
> Meta-task: Apply GATE process to analyzing GATE itself.

---

## Context

**What problem are you solving and WHY?**

**Problem:** GATE enforcement system exists (281 LOC instructions + 760 LOC code) but has never been empirically validated. We don't know if it's:
- Right-sized (appropriate complexity for the problem)
- Under-powered (agents will game it)
- Over-engineered (too complex to be effective)

**Root cause:** Rushed implementation without measurement plan. Added enforcement in response to 11 superficial gate.md files, but didn't test if new system actually works better.

**User feedback:** "how many LOC can an agent handle as instruction for this context?"

This reveals uncertainty about whether current enforcement is appropriate. User wants to get GATE right, acknowledges it's worth complexity IF effective, but needs objective validation.

**Goal:** Empirically validate GATE effectiveness before iterating, so decisions are data-driven not assumption-driven.

---

## Via Negativa Analysis

**Can you DELETE or SIMPLIFY existing code instead of adding?**

**Files examined for deletion:**

1. **tools/wvo_mcp/scripts/run_design_review.ts** (142 LOC)
   - Examined: Could we delete automation, rely on manual review?
   - Verdict: NO - Evidence shows agents created 11 superficial gate.md without automation. Manual compliance doesn't work.

2. **tools/wvo_mcp/src/critics/design_reviewer.ts** (578 LOC)
   - Examined: Could we delete intelligent checks, use simple regex?
   - Verdict: MAYBE - Don't know yet. Need data on whether intelligence catches gaming.

3. **docs/agent_library/common/processes/task_lifecycle.md GATE section** (81 LOC)
   - Examined: Could we delete verbose instructions, rely on automation?
   - Verdict: MAYBE - Hypothesis: With automation, agents need less instruction. Need data.

4. **docs/templates/design_template.md** (162 LOC)
   - Examined: Could we simplify to 3 questions instead of 10+ sections?
   - Verdict: MAYBE - Need data on whether structure helps or constrains.

**Why deletion/simplification insufficient NOW:**

Without empirical data, we don't know what's essential vs what's bloat. Deleting prematurely risks removing effective components. Simplifying prematurely risks enabling gaming.

**Via negativa AFTER measurement:** Once we have data, we can precisely delete what doesn't contribute to effectiveness.

---

## Refactor vs Repair Analysis

**Are you patching a symptom or refactoring the root cause?**

**This is a PROPER FIX, not a patch.**

**Root cause:** Decision-making based on assumptions rather than evidence.

**Previous approach:**
1. Saw problem (superficial gate.md files)
2. Added enforcement (automation + checks)
3. Assumed it would work
4. Never measured effectiveness

**This fix:**
- Targets root cause: assumption-based iteration
- Establishes measurement framework
- Creates feedback loop (measure → adjust → measure)
- Prevents future assumption-based additions

**Technical debt created:** None. This adds measurement infrastructure that enables better decisions.

**Technical debt reduced:** Prevents accumulation of unmeasured enforcement code.

---

## Alternatives Considered

### Alternative 1: Simplify Immediately (Via Negativa by Default)

**What:** Delete 95% of enforcement (keep only 3 questions + 3 constraints)

**Pros:**
- Follows AFP principle (delete > add)
- Reduces maintenance burden
- Simpler system
- Faster to implement

**Cons:**
- Based on assumption that current system is over-engineered
- No data to support simplification
- Risk: Enable gaming we just tried to prevent
- If wrong, waste time re-building

**Why not selected:** Premature optimization. AFP says "delete" but also says "measure first."

### Alternative 2: Enhance Immediately (Add More Enforcement)

**What:** Add examples, dashboards, progressive disclosure, LOC verification, timestamp checks

**Pros:**
- Addresses known gaps (no examples)
- Adds gaming detection
- More comprehensive

**Cons:**
- Based on assumption that current system is under-powered
- No data to support enhancement
- Adds complexity without knowing if current works
- Risk: Over-engineer further

**Why not selected:** Premature optimization in opposite direction. Need baseline data first.

### Selected Approach: Measure First, Then Decide

**What:** Run empirical test (3-10 tasks) to validate current system

**Pros:**
- Data-driven decisions
- Reveals actual pain points (not assumed ones)
- Baseline for comparison
- Can delete OR enhance based on evidence
- Avoids thrashing (simplify → breaks → enhance → over-engineered → simplify)

**Cons:**
- Takes longer (2 weeks vs immediate change)
- Requires instrumentation effort
- Must design good measurement protocol

**Why this is best:**
- AFP principle: Evidence > assumptions
- One test cycle reveals what to fix
- Prevents both over-engineering AND under-engineering
- User wants to "get it right" - measurement enables that

**How it aligns with AFP/SCAS:**
- **Via negativa applied to iteration:** DELETE assumptions, ADD measurement
- **Refactor vs repair:** Refactoring decision-making process (add measurement), not patching GATE system
- **Requisite variety:** Measurement framework handles uncertainty (can adjust either direction)
- **High feedback density:** Weekly measurement cycles

---

## Complexity Analysis

**How does this change affect complexity?**

### Complexity Increases

**Where:**
- Add instrumentation to run_design_review.ts (~30 LOC)
- Add data collection template (YAML structure)
- Add analysis protocol (test_plan.md - 300 LOC)

**Is this justified?** YES

**Reasoning:**
- Measurement infrastructure is one-time cost
- Prevents repeated iteration without learning
- Reduces long-term complexity (fewer wrong decisions)
- Enables objective optimization

**Mitigation strategy:**
- Instrumentation isolated in one place
- Can be removed after validation complete
- Data collection template is lightweight (YAML)
- Test plan is documentation, not code

### Complexity Decreases

**Long-term:**
- Enables deletion of ineffective components
- Prevents addition of unnecessary enhancements
- Creates feedback loop that maintains optimal complexity
- Documents what works (future agents have evidence)

### Trade-offs

**Necessary complexity:**
- Measurement framework (30 LOC + protocol)
- Analysis time (2 weeks)

**Unnecessary complexity avoided:**
- Premature simplification that enables gaming
- Premature enhancement that over-engineers
- Repeated iteration without learning

**Net effect:** Short-term complexity increase (measurement) enables long-term complexity reduction (data-driven optimization).

---

## Implementation Plan

### Scope

**Files to change:**
1. `tools/wvo_mcp/scripts/run_design_review.ts` - add metrics logging (~30 LOC)
2. `state/analytics/gate_metrics.jsonl` - create (append-only log)
3. `state/evidence/AFP-GATE-VIA-NEGATIVA-20251105/test_plan.md` - create (already done)
4. `state/evidence/AFP-GATE-VIA-NEGATIVA-20251105/analysis.md` - create (already done)
5. `state/evidence/AFP-GATE-VIA-NEGATIVA-20251105/enforcement_effectiveness.md` - create (already done)

**Estimated LOC:** +30 -0 = net +30 LOC (for instrumentation only)

**Micro-batching compliance:** ✅ 5 files, +30 net LOC (well within limits)

### Risk Analysis

**Edge cases:**
1. Agent doesn't follow test protocol properly
   - Mitigation: Clear instructions, record even if incomplete

2. Pilot tasks not representative of real work
   - Mitigation: Vary complexity (simple, medium, complex)

3. Measurement overhead affects behavior (Heisenberg effect)
   - Mitigation: Keep instrumentation lightweight, transparent

4. Data insufficient to make clear decision
   - Mitigation: Clear success/failure thresholds defined upfront

**Failure modes:**
1. Instrumentation breaks run_design_review.ts
   - Prevention: Add logging AFTER existing logic, isolated try-catch

2. Test tasks never executed (deprioritized)
   - Prevention: This task itself is the first test (eating own dogfood)

3. Analysis reveals ambiguous results
   - Prevention: Decision matrix defines clear outcomes for each scenario

**Testing strategy:**
1. Test instrumentation on this task first (AFP-GATE-VIA-NEGATIVA-20251105)
2. Verify metrics logged correctly
3. Then proceed with 2 more pilot tasks
4. Review data after each task (iterative learning)

### Assumptions

1. **Assumption:** Agents will follow test protocol
   - **If wrong:** Partial data still useful, document deviations

2. **Assumption:** 3 tasks sufficient for initial signal
   - **If wrong:** Extend to 5 tasks before deciding

3. **Assumption:** Current metrics capture effectiveness
   - **If wrong:** Add metrics during pilot if gaps discovered

4. **Assumption:** User available for decision-making after pilot
   - **If wrong:** Document findings, wait for review

---

## Review Checklist (Self-Check)

Before implementing, verify:

- [x] I explored deletion/simplification (via negativa)
  - Examined all 4 major components for deletion
  - Concluded: Need data before deleting

- [x] If adding code, I explained why deletion won't work
  - Can't delete without knowing what's effective
  - Measurement enables future deletion

- [x] If modifying large files/functions, I considered full refactoring
  - Not modifying large files, only adding logging

- [x] I documented 2-3 alternative approaches
  - Alt 1: Simplify immediately
  - Alt 2: Enhance immediately
  - Selected: Measure first

- [x] Any complexity increases are justified and mitigated
  - +30 LOC instrumentation justified (enables optimization)
  - Isolated, removable after validation

- [x] I estimated scope (files, LOC) and it's within limits
  - 5 files, +30 net LOC ✅

- [x] I thought through edge cases and failure modes
  - 4 edge cases, 3 failure modes documented with mitigations

- [x] I have a testing strategy
  - Test on this task first (dogfooding)
  - Then 2 more pilots with full measurement

---

## Notes

**Meta-observation:** This task demonstrates GATE working as intended.

Before analysis, I was moving toward implementing either:
- Simplification (delete 95% of enforcement)
- Enhancement (add examples, dashboards, etc.)

GATE forced consideration of alternatives, which revealed:
- Simplification is premature (no data it's over-engineered)
- Enhancement is premature (no data it's under-powered)
- Measurement is right move (enables either direction)

**This is the value of GATE:** Prevents jumping to implementation without thinking through alternatives.

**Irony:** Applying GATE to analyze GATE is exactly the kind of recursive self-improvement that makes systems robust.

---

**Design Date:** 2025-11-05
**Author:** Claude (Sonnet 4.5)

---

## GATE Review Tracking

**GATE is ITERATIVE - expect multiple rounds:**

### Review 1: 2025-11-05
- **DesignReviewer Result:** PASSED (but see critical finding below!)
- **Concerns Raised:** None from basic checks
- **Remediation Task:** N/A for basic checks
- **Time Spent:** ~60 minutes on design thinking

**🚨 CRITICAL FINDING:** `run_design_review.ts` does BASIC checks only!

**What it checks:**
- Sections exist ✅
- Content not empty ✅
- Checklist marked ✅

**What it DOESN'T check (but should):**
- File existence verification ❌
- Via negativa depth ❌
- Alternatives quality ❌
- Any AFP/SCAS intelligence from design_reviewer.ts ❌

**Root cause:** Script I created does structural validation, not intelligent review.

**Impact:** Current `npm run gate:review` can be gamed with superficial content!

**This is exactly what empirical testing reveals:** The instrumentation itself needs fixing.

**Proposed fix:** Update run_design_review.ts to actually invoke DesignReviewer critic.

### Notes on Process

**This task followed the GATE workflow:**
1. ✅ Created design.md from template
2. ✅ Filled all sections with specific evidence
3. ⏳ About to test with DesignReviewer
4. ⏳ Will commit only if approved

**Pain points observed (first-hand):**
- Template is comprehensive (helpful but long)
- Filling all sections took ~45 minutes
- Some sections felt repetitive (Complexity vs Via Negativa overlap)
- BUT: Process forced discovery of "measure first" approach

**Helpful aspects:**
- Structure prevented jumping to solution
- Alternatives section revealed premature optimization risk
- Checklist ensured nothing skipped
- Template questions were thought-provoking

**Suggestions:**
- Add example of completed design.md (this can be one!)
- Consider consolidating Complexity and Via Negativa sections
- Quick-start guide for simple tasks?

---

**Next:** Test with DesignReviewer to validate process
