# Strategy: AFP-S1-WORK-PROCESS-ENFORCE

## Problem Statement

**What is the actual problem we're solving?**

Agents (including Claude Council) can bypass the mandated 10-phase work process and skip critical phases, particularly:
- PLAN (via negativa analysis, architecture decisions)
- THINK (edge cases, failure modes)
- GATE (design.md + DesignReviewer approval)

**Evidence of the problem:**
- AFP-S1-GUARDRAILS initial attempt: Jumped from SPEC directly to IMPLEMENT
- User feedback: "yes but I specifically notice you are skipping over design/gate and potentially other gates and work process"
- Corrected only after explicit user intervention

**Current state:**
- ✅ WorkProcessLedger exists (`tools/wvo_mcp/src/work_process/index.ts`)
- ✅ WorkProcessEnforcer validates sequential phase transitions
- ❌ Agents can still bypass by not using the ledger
- ❌ No pre-commit verification of phase compliance
- ❌ Agent instructions not strongly enforced

## Root Cause Analysis

**Why does this problem exist?**

1. **Voluntary compliance:** WorkProcessEnforcer is not automatically invoked
   - Agents must choose to use it
   - No system-level enforcement
   - Easy to forget or skip

2. **No artifact verification:** Pre-commit hooks don't verify phase artifacts
   - Can commit without strategy.md, spec.md, plan.md, etc.
   - No check that all required phases completed

3. **Agent instruction weakness:** CLAUDE.md instructions are guidelines, not hard blocks
   - Agents can interpret flexibly
   - No automatic reminder system
   - No blocking mechanism

4. **No integration with git workflow:** Work process not tied to commit flow
   - Can commit implementation without GATE approval
   - No verification loop

## Success Criteria

**How will we know when this is solved?**

**Measurable outcomes:**
1. ✅ Pre-commit hook verifies all required phase artifacts exist
2. ✅ Pre-commit hook blocks commits missing phase files
3. ✅ Agent instructions updated with stronger enforcement language
4. ✅ WorkProcessEnforcer integration with git hooks
5. ✅ Tests verify enforcement works (block on missing phases)

**Exit criteria:**
1. Cannot commit implementation without all upstream phase artifacts
2. Cannot skip GATE phase for tasks requiring design.md
3. Agent attempts to bypass are automatically blocked

## Impact Assessment

**What changes if we solve this?**

**Immediate benefits:**
- **Quality:** All tasks follow proper AFP/SCAS thinking
- **Governance:** Work process compliance mandatory, not optional
- **Risk reduction:** Critical thinking phases cannot be skipped
- **Accountability:** Evidence trail always complete

**Downstream enables:**
- Automated quality gates (no human intervention needed)
- Consistent work process across all agents
- Measurable compliance (all tasks have complete evidence)
- Retrospectives more valuable (complete phase data)

**Risks if not solved:**
- Continued bypassing of critical thinking phases
- Incomplete evidence trails
- Poor design decisions (skipping GATE)
- Technical debt accumulation (skipping via negativa)

## AFP/SCAS Alignment

**Via Negativa:**
- ✅ Can we DELETE manual enforcement? → No, need automated checks
- ✅ Can we SIMPLIFY? → Yes, integrate with existing git hooks
- ❌ Over-engineering risk: Keep enforcement minimal (file existence checks)

**Refactor Not Repair:**
- This is ENHANCEMENT (adding enforcement to existing system)
- Not patching - completing incomplete enforcement
- Root cause: Voluntary compliance insufficient

**Complexity Control:**
- ✅ Essential: Phase artifact verification
- ❌ Accidental: None if done right
- Trade-off: +100 LOC enforcement script vs. unbounded design debt

**Measurement:**
- Track bypass attempts (blocked by hook)
- Measure compliance rate (100% target)
- Monitor evidence completeness

## Decision

**Recommendation:** PROCEED with work process enforcement

**Approach:**
1. Enhance pre-commit hook to verify phase artifacts
2. Update agent instructions with stronger enforcement
3. Add WorkProcessEnforcer integration
4. Write tests for enforcement logic
5. Document new workflow

**Why now?**
- User explicitly requested after catching bypass
- AFP-S1-GUARDRAILS complete (good foundation)
- WorkProcessLedger exists (can integrate)
- High value, low effort

**Alternatives considered:**
1. **Do nothing** - Rely on agent discipline
   - Con: Already proven insufficient
   - Con: Continues problem

2. **Manual review only** - Human checks phase compliance
   - Con: Not scalable
   - Con: Slow feedback loop
   - Con: Human error

3. **Automated enforcement** (SELECTED) - Git hooks + integration
   - Pro: Automatic, fast feedback
   - Pro: Scales to all agents
   - Pro: Zero human intervention
   - Pro: Measurable compliance

---

**Strategy Date:** 2025-11-05
**Author:** Claude Council
**Recommendation:** Proceed to SPEC

**Next task in roadmap:** AFP-S1-STATE-GRAPH (can proceed in parallel)
