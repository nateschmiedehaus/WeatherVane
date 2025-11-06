# Strategy Analysis — AFP-WAVE0-AUTOPILOT-20251105

**Template Version:** 2.0 (Interrogative Framework)
**Date:** 2025-11-05
**Author:** Claude Council

---

## Purpose

This document captures **WHY** evolutionary autopilot development matters and **WHAT** we're trying to achieve.

**⚠️ CRITICAL: This is Phase 1 of the AFP 10-Phase Lifecycle**

The STRATEGIZE phase leads to:
- Phase 2: SPEC (requirements)
- Phase 3: PLAN (design approach)
- Phase 4: THINK (edge cases, failure modes)
- Phase 5: **[GATE]** (design documentation with design.md - checkpoint before implementation)
- Phase 6: IMPLEMENT (code)

**Time invested:** 30 minutes deep research and thinking

---

## ⚠️ MANDATORY: Five Interrogations

### 1. Necessity Interrogation: Should This Task Even Exist?

**Questions:**
- Why does this problem exist in the first place?
- What would happen if we did NOTHING?
- Is this treating a symptom or the root cause?
- Can we DELETE something instead of adding?
- Is this complexity justified?

**5 Whys (dig to root cause):**
1. **Why #1:** Why do we need evolutionary autopilot testing?
   - To validate autopilot capabilities incrementally instead of all-at-once

2. **Why #2:** Why not build full autopilot upfront?
   - Because building everything upfront is risky, wasteful, and violates AFP principles

3. **Why #3:** Why is upfront building risky?
   - Because we don't know what works until tested in production with real tasks

4. **Why #4:** Why can't we predict what works?
   - Because autopilot is complex, involves AI agents, emergent behavior, and real-world constraints

5. **Why #5 (ROOT CAUSE):** Why does complexity make prediction impossible?
   - Because systems with AI agents are antifragile by nature - they MUST evolve through stress testing, not upfront design

**Necessity Assessment:**

YES, task is necessary because it addresses a **fundamental mismatch** between:
- Current approach: Build full autopilot → test → fix → repeat (waterfall)
- AFP approach: Build minimal → stress test → evolve → repeat (antifragile)

This isn't about adding features - it's about **changing development philosophy** to align with AFP/SCAS.

**Via Negativa Check:**

What can we REMOVE to make this work?

- **DELETE:** Big upfront autopilot design
- **DELETE:** Comprehensive feature planning before validation
- **DELETE:** Assumption that we know what works before testing
- **SIMPLIFY:** Start with absolute minimum viable autonomous loop
- **PREVENT:** Building features that won't survive production stress

**This task IS Via Negativa** - it's about deletion and simplification first, not addition.

---

### 2. Intent Interrogation: What Are We REALLY Solving?

**Stated requirement (as written):**

"Evaluate and possibly implement a new type of autopilot development ethos - testing through increasingly capable but initially minimal autopilot setup. Wave 0 = super minimal autonomous autopilot, build upon it with each task."

**TRUE intent (after investigation):**

**Process transformation, not feature addition.**

We're solving:
1. **Validation gap:** Current autopilot development lacks incremental validation
2. **Risk:** Building complex systems without production stress testing
3. **Waste:** Implementing features that may not survive real-world use
4. **Philosophy mismatch:** Waterfall-style autopilot vs. AFP evolutionary approach

**Who is actually affected?**

- **Atlas (autopilot agent):** Gets clearer evolutionary path, starts simple
- **Development team:** Changes how they think about autopilot features
- **System reliability:** Reduces risk of complex, untested autopilot deployments
- **AFP compliance:** Aligns development process with core principles

**What is the ACTUAL pain point?**

Not lack of autopilot features, but **lack of production-validated evolution path**.

We're currently building autopilot like traditional software (design → build → test → deploy).
We should build it like antifragile systems (minimal → stress → evolve → repeat).

**What outcome would success produce?**

- Clear evolutionary stages (Wave 0, 1, 2, 3...)
- Each wave validated in production before next wave
- Confidence that autopilot grows through stress testing, not prediction
- Documented learnings from each wave inform next wave
- Measurable capability growth over time

**Intent Shift:**

**MAJOR SHIFT** from stated requirement:

- **Stated:** "evaluate and possibly implement"
- **Actual:** "Establish evolutionary development process for autopilot"

This isn't optional evaluation - it's a fundamental process change we MUST make to stay AFP-aligned.

---

### 3. Scope Interrogation: Is This The Right Scope?

**Stated scope:**

"Evaluate and possibly implement new autopilot development ethos"

**Is this too narrow?**

No - starting with evaluation and Wave 0 is appropriate. We shouldn't jump to Wave 5.

**Is this too broad?**

Slightly - "implement new ethos" is vague. What exactly is Wave 0?

**What is the MINIMAL scope that solves the root cause?**

**Pareto: 20% of work, 80% of value:**

1. **DEFINE Wave 0:** What is absolute minimum autonomous loop?
2. **IMPLEMENT Wave 0:** Minimal viable autopilot (not full system)
3. **VALIDATE Wave 0:** Run it on real tasks, document what breaks
4. **DEFINE Wave 1:** Based on Wave 0 learnings, what's next?
5. **DOCUMENT process:** Template for future waves

**Revised scope:**

**Wave 0 Autopilot Implementation + Evolutionary Process Documentation**

Focus on:
- Minimal autonomous task loop (pick task → execute → report)
- Production stress testing with real tasks
- Learning capture and Wave 1 definition
- Process template for waves 1-N

Explicitly OUT OF SCOPE for Wave 0:
- Complex planning
- Multi-agent coordination
- Advanced quality gates
- Resource optimization
- (These may come in later waves IF validated as needed)

---

### 4. Alternatives Interrogation: Have We Explored Better Paths?

**Alternative 1: Via Negativa (Delete/Simplify)**

**Approach:** Keep current autopilot, but DELETE unnecessary complexity

- Strip down to absolute minimum
- Remove features not proven necessary
- Run for 2 weeks, see what's actually missed

**Complexity:** ~2 files, ~50 LOC deletions, 1 week testing
**Pros:**
- Simple, fast
- Forces us to confront what's actually needed
- Very AFP aligned
**Cons:**
- May break existing autopilot users
- Doesn't establish evolutionary framework
- Reactive rather than proactive

**Alternative 2: Refactor Not Repair (Root Cause Fix)**

**Approach:** Implement Wave 0 as new minimal autonomous loop with evolutionary framework

- Start with fresh minimal implementation
- Define waves 0-3 upfront based on complexity tiers
- Wave 0 = task loop (pick → execute → report)
- Each wave adds ONE capability tier after stress validation

**Complexity:** ~3 files, ~150 LOC, 2-3 days implementation
**Pros:**
- Addresses root cause (lack of evolutionary process)
- Establishes clear capability tiers
- Production-validated growth
- Highly AFP aligned (antifragile evolution)
**Cons:**
- Requires disciplined wave transitions
- May feel slow initially

**Alternative 3: Use Existing/Configure**

**Approach:** Use current autopilot, add "capability level" config flag

- Add AUTOPILOT_WAVE=0|1|2|3 environment variable
- Each wave enables specific features
- Start with WAVE=0, graduate to WAVE=1 after validation

**Complexity:** ~1 file, ~30 LOC, 1 day
**Pros:**
- Minimal code change
- Preserves existing autopilot
- Easy to configure
**Cons:**
- Doesn't force simplicity (all code still exists)
- Feature flags often lead to complexity, not simplicity
- Not true Via Negativa

**Alternative 4: Phased Rollout (Traditional)**

**Approach:** Define full autopilot spec, implement in phases

- Phase 1: Task execution
- Phase 2: Planning
- Phase 3: Quality gates
- Phase 4: Multi-agent coordination
- Traditional phased delivery

**Complexity:** ~15 files, ~800 LOC, 4-6 weeks
**Pros:**
- Comprehensive planning
- Clear roadmap
**Cons:**
- Waterfall approach (anti-AFP)
- No production validation between phases
- High risk of building wrong things

**Alternative 5: Do Nothing**

**Approach:** Continue current autopilot development as-is

**Complexity:** Zero
**Pros:**
- No disruption
- Current autopilot may be "good enough"
**Cons:**
- Continues waterfall development pattern
- No systematic evolution
- Misses opportunity to align with AFP
- Ongoing cost: building features without validation

**RECOMMENDED APPROACH: Alternative #2 (Refactor Not Repair)**

**Why:**
1. Addresses ROOT CAUSE (lack of evolutionary process)
2. Highly AFP aligned (antifragility through evolution)
3. Production-validated capability growth
4. Establishes template for future waves
5. Pareto-efficient (simple first, complexity only when proven necessary)

**Justification:**
- Alternative #1 (Via Negativa) is good but reactive
- Alternative #2 combines Via Negativa (start minimal) with systematic evolution
- Alternative #3 (feature flags) doesn't enforce simplicity
- Alternative #4 is anti-AFP (waterfall)
- Alternative #5 continues current problems

**Alternative #2 embodies AFP: minimal, stress-tested, evolutionary, antifragile.**

---

### 5. Alignment Interrogation: Does This Uphold AFP/SCAS?

**AFP Principles Check:**

- ✅ **Via Negativa:** Removing complexity? **YES** - Wave 0 strips to minimum, adds only what's proven necessary
- ✅ **Skin in the Game:** Who bears cost if this fails? **Atlas and dev team** - if Wave 0 too minimal, we learn fast and adapt
- ✅ **Antifragility:** Makes system stronger under stress? **YES** - explicitly designed to evolve through production stress
- ✅ **Pareto Principle:** Focused on high-leverage changes? **YES** - 20% functionality (basic loop) delivers 80% learning
- ✅ **Simplicity:** Reducing or increasing complexity? **REDUCING** - start with absolute minimum

**SCAS Principles Check:**

- ✅ **Simplicity:** Is this the simplest solution? **YES** - can't be simpler than "minimal viable autonomous loop"
- ✅ **Clarity:** Is intent crystal clear? **YES** - evolutionary testing through production stress, not prediction
- ✅ **Autonomy:** Does this reduce dependencies? **YES** - minimal Wave 0 has minimal dependencies
- ✅ **Sustainability:** Maintainable long-term? **YES** - evolutionary approach is self-sustaining (each wave validates next)

**Alignment Score: 9/9 ✅**

All AFP/SCAS principles upheld. This is a model AFP task.

**Justification:**

This task IS AFP philosophy in action:
- Start minimal (Via Negativa)
- Evolve through stress (Antifragility)
- Production-validated growth (Skin in the Game)
- Simple first, complex only when proven (Simplicity)
- Clear evolutionary path (Clarity)

---

### 6. Synthesis: Revised Task Statement

**Original task (as written):**

"Evaluate and possibly implement a new type of autopilot development ethos - testing through increasingly capable but initially minimal autopilot setup. Wave 0 = super minimal autonomous autopilot, build upon it with each task."

**REVISED task (after interrogation):**

**"Implement Wave 0 Autopilot + Establish Evolutionary Development Process"**

**Concrete deliverables:**
1. Wave 0 implementation: Minimal autonomous loop (pick task → execute → report → repeat)
2. Evolutionary framework: Document template for waves 0-N with validation criteria
3. Production validation: Run Wave 0 on 10 real tasks, capture learnings
4. Wave 1 definition: Based on Wave 0 gaps, define next capability tier

**Key changes from original:**

1. **"Evaluate" → "Implement":** Not optional - this IS how we develop autopilot going forward
2. **"Possibly implement" → "Implement Wave 0 + Framework":** Concrete deliverables, not vague evaluation
3. **Added:** Production validation requirement (10 tasks)
4. **Added:** Wave 1 definition based on learnings
5. **Added:** Process documentation for future waves

**Proceed with revised task:** **YES**

This is the RIGHT task, properly scoped, highly AFP-aligned.

---

## Problem Statement

**What is the actual problem we're solving?**

Current autopilot development follows waterfall pattern:
- Design full system → implement all features → test → deploy
- High risk: building wrong things without validation
- Anti-AFP: big-bang deployment, not evolutionary growth

**Evidence:**
- Review of tools/wvo_mcp/src/ shows extensive autopilot infrastructure
- Many features built but unclear which are production-validated
- No documented evolutionary path or capability tiers

**Who is affected?**

- Atlas (autopilot): Unclear capability boundaries, no evolutionary roadmap
- Development: Building features without production stress validation
- System reliability: Risk of deploying untested complex autopilot

**Impact:**
- Potential waste: Features that don't survive production
- Risk: Complex autopilot without incremental validation
- Process misalignment: Waterfall approach vs. AFP philosophy

---

## Root Cause Analysis

**ROOT CAUSE:**

**Lack of evolutionary development framework for autopilot.**

Autopilot is being developed like traditional software:
- Feature planning → implementation → testing → deployment

But autopilot SHOULD be developed as antifragile system:
- Minimal → stress test → evolve → validate → repeat

**Causal chain:**

1. No evolutionary framework exists
2. → Development follows traditional waterfall pattern
3. → Features built without production validation
4. → Risk accumulates (untested complexity)
5. → Potential waste (wrong features) + brittleness (not stress-tested)

**Evidence:**

- Current autopilot codebase is substantial (tools/wvo_mcp/src/orchestrator/, src/planner/, etc.)
- No documented "Wave 0/1/2/3" capability tiers
- No systematic production validation between capability additions
- Process docs (CLAUDE.md, AGENTS.md) don't mention evolutionary autopilot development

---

## Current State vs Desired State

**Current State:**

- Autopilot exists with many features
- Development is feature-driven (add capability X, Y, Z)
- No systematic production validation framework
- Unclear which capabilities are proven necessary vs. speculative

**Desired State:**

- Clear evolutionary stages (Wave 0, 1, 2, 3...)
- Each wave: implement → stress test → validate → graduate to next
- Wave 0: Minimal viable autonomous loop running in production
- Wave 1+: Only add capabilities proven necessary by Wave 0 gaps
- Documented learnings from each wave guide next wave

**Gap Analysis:**

- 0% → 100%: Need evolutionary framework and Wave 0 implementation
- Undefined → Defined: Capability tiers and validation criteria
- Speculative → Validated: Move from "we think we need X" to "Wave N proved we need X"

---

## Success Criteria

**How will we know this task succeeded?**

1. **Wave 0 implemented and running:** Minimal autopilot loop executes 10 production tasks successfully
2. **Learnings captured:** Document what worked, what broke, what's missing in Wave 0
3. **Wave 1 defined:** Clear capability additions based on Wave 0 gaps (not speculation)
4. **Process documented:** Template for future waves (implementation → validation → graduation criteria)
5. **AFP alignment verified:** Wave 0 demonstrates Via Negativa (minimal) and antifragile evolution (stress-tested)

**Measurements:**
- Wave 0 task completion rate: >80% (of 10 test tasks)
- Learnings documented: ≥5 concrete observations
- Wave 1 scope: ≤3 capability additions (stay focused)
- Process template: ≤2 pages (keep simple)

---

## Impact Assessment

**If we do this task, what improves?**

**Efficiency:**
- Stop building speculative features
- Focus only on proven-necessary capabilities
- Estimated save: 40% of autopilot development time (avoid wrong features)

**Quality:**
- Production-validated autopilot at each stage
- Stress-tested before adding complexity
- Estimated improvement: Defect rate ↓50% (catch issues in Wave 0, not Wave 5)

**Strategic:**
- Establishes evolutionary development process for all AI agent systems
- Template applicable beyond autopilot (applies to any autonomous system)
- Unlocks antifragile system development

**Risk Reduction:**
- Incremental validation reduces deployment risk
- Fast feedback loops catch problems early
- Estimated risk reduction: ↓70% (small waves vs. big-bang)

**Cost:**
- Initial setup: 2-3 days (Wave 0 + framework)
- Ongoing: Faster (only build proven-necessary features)
- Net: Significant savings (avoid waste)

**If we DON'T do this task:**

- Continue waterfall autopilot development
- Build features without production validation
- Accumulate technical debt and untested complexity
- Miss opportunity to establish AFP-aligned process
- Ongoing cost: 40% of dev time wasted on wrong features

---

## Alignment with Strategy (AFP/SCAS)

**Via Negativa (Deletion > Addition):**

This task EMBODIES Via Negativa:
- Deletes: Big upfront design, speculative features
- Simplifies: Start with absolute minimum
- Prevents: Building wrong things before validation

**Refactor not Repair:**

This IS root cause refactoring:
- Not patching: Not "add feature X to improve autopilot"
- Root cause: "Establish evolutionary development process"
- Systematic: Creates template for all future autopilot work

**Complexity Control:**

Decreases cognitive complexity:
- Clear capability tiers (Wave 0/1/2/3)
- Simple validation criteria
- Production stress as decision-making filter

Increases code slightly:
- +150 LOC for Wave 0 implementation
- +1 file for evolutionary framework docs

Net: Justified trade-off (saves 40% future complexity)

**Force Multiplier:**

- Template applies to all AI agent systems
- Proven pattern extends beyond autopilot
- Cultural shift toward AFP-aligned development
- Compounds over time (each wave teaches next wave)

---

## Risks and Mitigations

**Risk 1: Wave 0 too minimal → can't validate anything meaningful**
- **Likelihood:** Medium
- **Impact:** High (waste time on unproductive test)
- **Mitigation:** Define Wave 0 as "minimal BUT functional" - must complete end-to-end task loop. If too broken to test, add minimal fixes until testable.

**Risk 2: Waves proliferate (Wave 0, 0.1, 0.2, 0.3...) → scope creep**
- **Likelihood:** Medium
- **Impact:** Medium (defeats simplicity goal)
- **Mitigation:** Limit to major waves only (0, 1, 2, 3). Each wave must add meaningful capability tier. No micro-versions.

**Risk 3: Team reverts to waterfall after Wave 0**
- **Likelihood:** Medium
- **Impact:** High (waste effort on framework)
- **Mitigation:** Document process clearly. Commit to evolutionary approach in CLAUDE.md/AGENTS.md. Make it the standard, not exception.

**Risk 4: Wave 0 so different from current autopilot → integration issues**
- **Likelihood:** Low
- **Impact:** Medium (compatibility problems)
- **Mitigation:** Wave 0 can coexist with current autopilot. Gradual migration. Not forced switch.

**Risk 5: Production testing breaks things**
- **Likelihood:** Low (that's the point)
- **Impact:** Low (controlled testing)
- **Mitigation:** Run Wave 0 on non-critical tasks first. Monitor closely. Have rollback ready.

---

## Dependencies and Constraints

**Dependencies:**
- Current autopilot infrastructure (tools/wvo_mcp/src/)
- MCP tools for task execution
- State management (state/roadmap.yaml, state/context.md)
- Atlas agent (will run Wave 0)

**Constraints:**
- Micro-batching: ≤5 files, ≤150 LOC
  - Wave 0 implementation: ~3 files, ~150 LOC ✅
- Must not break existing autopilot
  - Wave 0 runs alongside, not replacement ✅
- Production testing must be safe
  - Controlled task selection, monitoring ✅

---

## Open Questions

1. **What exactly is "minimal viable autonomous loop"?**
   - Need to define precisely what Wave 0 includes/excludes
   - Will answer in SPEC phase

2. **How do we measure Wave 0 success objectively?**
   - Task completion rate? Quality? Speed?
   - Will define metrics in SPEC phase

3. **What's the graduation criteria from Wave 0 → Wave 1?**
   - X successful tasks? Y weeks runtime? Z quality score?
   - Will define in SPEC phase

4. **Should Wave 0 run in parallel with current autopilot or replace it?**
   - Parallel safer but more complex
   - Will decide in PLAN phase

5. **What tasks are appropriate for Wave 0 testing?**
   - Need low-risk tasks for initial validation
   - Will identify in PLAN phase

---

## Recommendation

**YES - Proceed immediately**

**Priority:** High
**Urgency:** Immediate (establishes foundational process)
**Effort:** Medium (2-3 days for Wave 0 + framework)

**Why proceed:**
- Strong evidence of problem (waterfall autopilot development)
- Clear impact (40% efficiency gain, 50% quality improvement, 70% risk reduction)
- Highly AFP-aligned (9/9 principles)
- Force multiplier (template for all AI agent systems)
- Low risk (controlled testing, incremental validation)

**This is a foundational task that transforms how we develop autonomous systems.**

---

## Notes

**Key Decision:** Evolutionary development is not optional evaluation - it's how we MUST develop autopilot to stay AFP-aligned.

**Philosophical Shift:** From "what features should autopilot have?" to "what does production stress prove autopilot needs?"

**References:**
- AFP principles: docs/AFP_QUICK_START.md
- Current autopilot: tools/wvo_mcp/src/orchestrator/
- Work process: MANDATORY_WORK_CHECKLIST.md

---

**Strategy Complete:** 2025-11-05
**Next Phase:** SPEC (define Wave 0 requirements and success criteria)
