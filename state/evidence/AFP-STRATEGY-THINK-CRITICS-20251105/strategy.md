# Strategy — AFP-STRATEGY-THINK-CRITICS-20251105

## Problem Statement

The GATE phase (phase 5) has rigorous enforcement via DesignReviewer and design_template.md, which catches superficial thinking and compliance theater. However, **STRATEGY (phase 1) and THINK (phase 4) lack this rigor**, creating a "garbage in, garbage out" problem:

- Agents can propose **bullshit tasks** that sound good but deliver no value
- **No systematic BS detection** at the strategy phase to ask "is this worth doing at all?"
- **No value analysis** to determine if the task solves the right problem
- **No waste elimination focus** early enough (via negativa comes too late at GATE)
- **Inconsistent strategic depth** - some strategy.md files are excellent (OUTCOME-LOG), others superficial (just goals/principles)
- **THINK phase is shallow** - focuses on implementation details rather than fundamental reasoning
- **No automated critics** to enforce quality like DesignReviewer does for GATE

This means we can execute tasks perfectly (GATE→VERIFY works) while solving the **wrong problem** or creating **unnecessary work**.

## Current Reality

**What exists:**
- design_template.md for GATE phase with AFP/SCAS analysis
- DesignReviewer critic (intelligent, uses research layer, blocks commits)
- Some excellent strategy.md examples (OUTCOME-LOG shows deep thinking)
- Some think.md files (but sparse, implementation-focused)

**What's missing:**
- No strategy_template.md to guide strategic thinking
- No think_template.md to guide critical reasoning
- No StrategyReviewer critic to detect BS
- No ThinkingCritic to validate reasoning
- No systematic "is this worth doing?" analysis
- No "what better task could we do instead?" generation
- Templates not referenced in AGENTS.md/CLAUDE.md

**Evidence of the gap:**
- Looking at state/evidence/*/strategy.md, quality varies wildly
- think.md files mostly answer "how to implement" not "should we implement"
- No automated blocking at strategy phase like GATE has

## Goals

1. **Elevate strategic thinking quality** - make STRATEGY phase as rigorous as GATE
2. **Detect bullshit early** - catch bad tasks BEFORE we design/implement them
3. **Generate better alternatives** - don't just validate the given task, propose superior alternatives
4. **Align with AFP/SCAS** - via negativa, refactor-not-repair from the START
5. **Automate quality enforcement** - critics that block low-quality strategy/thinking like DesignReviewer does

## Guiding Principles

1. **Prevent > Detect > Correct** - catch bad tasks at STRATEGY, not at GATE or VERIFY
2. **Question Everything** - brilliant strategists ask "why this task?" not "how to do this task?"
3. **Value Over Activity** - measure potential value, not just effort or complexity
4. **Via Negativa First** - STRATEGY should ask "what can we delete?" before PLAN does
5. **Critical Thinking Depth** - THINK phase should reason about fundamentals, not just implementation
6. **Automated BS Detection** - humans are biased toward their own ideas; need critic systems
7. **Alternative Generation** - always propose at least one superior alternative task

## Core Insights: What Brilliant Strategists Do

A brilliant code strategist would instill these practices in STRATEGY phase:

### 1. Value Questioning
- **"Is this worth doing at all?"** - most important question
- **"What's the opportunity cost?"** - what else could we do instead?
- **"Does this align with core mission?"** - or is it feature creep?
- **"What's the failure mode of NOT doing this?"** - how bad is the status quo?

### 2. Root Cause Analysis
- **"Are we treating symptoms or causes?"** - most tasks patch symptoms
- **"What's the deeper pattern?"** - one-off fix vs systemic improvement
- **"Why does this problem exist?"** - 5 whys analysis
- **"What created the need for this task?"** - address the source

### 3. Via Negativa Upfront
- **"Can we delete instead of add?"** - should be phase 1, not phase 5
- **"What becomes possible if we remove X?"** - subtractive thinking
- **"Is complexity the problem?"** - more code rarely solves complexity
- **"What's the simplest thing that could work?"** - YAGNI from the start

### 4. Better Alternative Generation
- **"What's a 10x better version of this task?"** - thinking bigger
- **"What would solving the root cause look like?"** - vs this patch
- **"Could we eliminate the need for this entirely?"** - meta-level thinking
- **"What task would deliver more value?"** - opportunity cost analysis

### 5. Strategic Alignment
- **"How does this advance AFP/SCAS goals?"** - not just comply, but advance
- **"Does this reduce or increase entropy?"** - entropy budget
- **"Does this enable future simplification?"** - vs future tech debt
- **"Is this a force multiplier?"** - vs linear effort/value

A brilliant thinker in THINK phase would add:

### 6. Fundamental Reasoning
- **"What are the hidden assumptions?"** - make them explicit
- **"What's the model of reality?"** - is it accurate?
- **"What are the second-order effects?"** - ripple consequences
- **"What's the long-term trajectory?"** - vs short-term fix
- **"What makes this idea fragile?"** - Taleb's antifragility lens

### 7. Complexity Analysis
- **"Is this essential or accidental complexity?"** - Fred Brooks distinction
- **"What's the complexity budget?"** - every task has a cost
- **"Does this simplify the mental model?"** - vs adding cognitive load
- **"What's the maintenance burden?"** - ongoing cost

### 8. Failure Modes & Robustness
- **"How could this make things worse?"** - iatrogenic effects
- **"What are the unintended consequences?"** - Chesterton's fence
- **"Is this reversible?"** - one-way vs two-way doors (Bezos)
- **"What's the blast radius of failure?"** - risk containment

## Strategic Options

### Option 1: Templates Only
**What:** Create strategy_template.md and think_template.md with checklists
**Pros:** Low effort, provides guidance, consistent structure
**Cons:** No enforcement, still allows superficial compliance theater
**Verdict:** Necessary but insufficient

### Option 2: Templates + Manual Review
**What:** Templates + require human (Claude Council) review of strategy/think phases
**Pros:** Human judgment, flexible, catches nuance
**Cons:** Slow, inconsistent, doesn't scale, human bias
**Verdict:** Good for high-stakes decisions, not scalable

### Option 3: Templates + Automated Critics (SELECTED)
**What:** Templates + StrategyReviewer + ThinkingCritic (like DesignReviewer)
**Pros:** Automated enforcement, consistent quality, scales, blocks bad work early
**Cons:** More implementation work upfront, needs ML reasoning layer
**Verdict:** Best ROI - prevents bad work at source, matches GATE quality

### Option 4: Templates + Critics + Alternative Task Generator
**What:** Option 3 + AI system that proposes better alternative tasks
**Pros:** Not just validation but generation of superior options
**Cons:** Most complex, needs sophisticated reasoning, might overwhelm
**Verdict:** Ideal state but phase 2 - start with Option 3, evolve to this

## Selected Approach: Option 3 (with path to Option 4)

**Phase 1 (this task):**
1. Create strategy_template.md with rigorous BS detection questions
2. Create think_template.md with fundamental reasoning questions
3. Build StrategyReviewer critic (intelligent, blocks low-quality strategies)
4. Build ThinkingCritic (validates reasoning depth)
5. Integrate into AGENTS.md, CLAUDE.md, MANDATORY_WORK_CHECKLIST.md
6. Add npm scripts: `npm run strategy:review [TASK-ID]`, `npm run think:review [TASK-ID]`
7. Update pre-commit hook to run strategy/think reviewers for staged strategy.md/think.md

**Phase 2 (future task):**
8. Build AlternativeTaskGenerator that proposes 2-3 better tasks
9. Integrate into StrategyReviewer output
10. Track alternative adoption rate in analytics

## Key Questions & Decisions

**Q: Should strategy/think critics be as strict as DesignReviewer?**
A: YES. Even stricter. Bad strategy → wasted design/implementation effort. Better to block at phase 1 than phase 5.

**Q: What makes a strategy "good" vs "bullshit"?**
A: Good strategy:
- Identifies root cause, not symptoms
- Proposes deletion/simplification over addition
- Shows value analysis (why worth doing)
- Considers alternatives (including "don't do this")
- Aligns with AFP/SCAS principles
- Has clear success criteria
- Acknowledges assumptions and risks

Bullshit strategy:
- Assumes task is worth doing without analysis
- No root cause analysis (treats symptoms)
- No via negativa consideration
- No alternatives explored
- No value analysis
- Vague goals
- Hidden assumptions

**Q: Should critics run automatically in pre-commit hook?**
A: YES for strategy.md/think.md being staged. Same pattern as DesignReviewer for design.md.

**Q: How to measure success?**
A: Track in state/analytics/strategy_remediations.jsonl:
- % of strategies that pass first review
- Common failure modes (no via negativa, no alternatives, etc.)
- Time spent in remediation
- Task rejection rate (strategy says "don't do this task")

**Q: Should StrategyReviewer be able to reject entire tasks?**
A: YES. Brilliant outcome: "This task shouldn't be done. Here's why. Consider doing X instead."

**Q: What does "intelligent" mean for these critics?**
A: Like DesignReviewer:
- Uses research layer for deep analysis
- Provides specific, actionable feedback
- Detects compliance theater (superficial answers)
- Suggests concrete improvements
- Can block commits (exit code 1) when quality insufficient
- Learns patterns from state/analytics

## Why This Is Worth Doing

**Prevents waste at the source:**
- Catching a bad task at STRATEGY saves ~10-20 hours vs catching at VERIFY
- Prevents accumulation of unnecessary code
- Reduces tech debt creation

**Elevates strategic thinking:**
- Forces agents to think critically upfront
- Builds muscle for questioning assumptions
- Creates culture of "why" before "how"

**Compounds quality gains:**
- GATE already improves design quality
- Adding STRATEGY/THINK improves task selection quality
- Together: right tasks + right designs + right implementation = excellence

**Enables better alternatives:**
- Not just "do this task well" but "should we do a different task?"
- Opens possibility of 10x better solutions
- Encourages strategic creativity

**Matches GATE rigor:**
- Inconsistent to have strong GATE but weak STRATEGY
- Creates end-to-end quality pipeline
- All phases have enforcement mechanisms

## Kill / Pivot Triggers

**Kill this task if:**
- DesignReviewer proves ineffective (but evidence shows it works)
- Strategy phase proves too subjective to automate (try anyway, learn)
- Resource cost outweighs benefit (unlikely - prevention is cheap)

**Pivot if:**
- Templates sufficient without critics (monitor for 2 weeks, track quality)
- Critics too slow/expensive (optimize or use lighter model)
- Agents find ways to game the system (evolve detection)

## Integration Considerations

**Documentation updates required:**
- AGENTS.md: Add STRATEGY/THINK templates to phase descriptions
- CLAUDE.md: Reference strategy/think critics in operating brief
- MANDATORY_WORK_CHECKLIST.md: Add strategy/think verification checkboxes
- docs/orchestration/: New guide for strategy/think critics

**Tool integration:**
- StrategyReviewer similar architecture to DesignReviewer
- Reuse research layer, ML task aggregator
- Add to run_integrity_tests.sh
- Pre-commit hook additions

**Analytics tracking:**
- state/analytics/strategy_remediations.jsonl
- state/analytics/think_remediations.jsonl
- Task rejection log (strategies that recommend "don't do this")
- Alternative adoption tracking

## Success Criteria

**This task succeeds when:**

1. **Templates exist:**
   - docs/templates/strategy_template.md (comprehensive, BS-detecting)
   - docs/templates/think_template.md (fundamental reasoning focused)

2. **Critics exist:**
   - tools/wvo_mcp/src/critics/strategy_reviewer.ts (intelligent, blocking)
   - tools/wvo_mcp/src/critics/thinking_critic.ts (reasoning validator)
   - Both pass tests with real strategy/think examples

3. **Integration complete:**
   - npm run strategy:review [TASK-ID] works
   - npm run think:review [TASK-ID] works
   - Pre-commit hook runs critics for staged strategy.md/think.md
   - AGENTS.md, CLAUDE.md, MANDATORY_WORK_CHECKLIST.md updated

4. **Evidence of quality:**
   - Test with 3-5 existing strategy.md files
   - Critics correctly identify gaps (via negativa missing, no alternatives, etc.)
   - Analytics tracking in place

5. **Documentation:**
   - Guide for using strategy/think critics
   - Examples of good vs bad strategies
   - Integration with AFP lifecycle documented

**Bonus success:**
- At least one task rejected at STRATEGY phase ("don't do this, do X instead")
- Measurable reduction in downstream GATE/VERIFY failures
- Agents report better strategic thinking quality

---

**Next Phase:** SPEC - Define what makes an excellent StrategyReviewer and ThinkingCritic
