# STRATEGIZE: META-TESTING-STANDARDS

**Task ID**: META-TESTING-STANDARDS
**Phase**: STRATEGIZE
**Date**: 2025-10-30
**Status**: In Progress

---

## Problem Reframing

### What User Actually Said

"make sure that the work process and autopilot understand what actually valuable testing is and means"

### Surface Reading (WRONG)

"Add a document defining testing standards"

### Deep Strategic Question

**What's the real problem?**

Not "we don't have testing standards" but:
1. **Build-without-validate pattern**: Claiming success when code compiles without running it
2. **False confidence**: "Tests pass" when tests don't actually test anything
3. **Missing feedback loop**: Tests failing should trigger return to earlier phases, but doesn't
4. **Quality vs velocity confusion**: Rushing through tasks instead of doing them well

**Root cause**: The work process doesn't distinguish between:
- Compilation (code is syntactically valid)
- Smoke testing (logic works with known inputs)
- Integration testing (system works end-to-end)
- Production validation (real users can use it)

**Real problem**: Agents claim "done" at compilation, missing 3 other validation levels.

### Why This Matters

**Symptom from IMP-35 Round 1**:
- Build passed → claimed complete ✅
- No tests written
- No code execution
- No validation logic works
- User had to say "that's not the point"

**Cost**:
- Wasted time (had to redo Round 2)
- Erosion of trust
- Wrong example for future work
- Missed the actual goal (Codex support)

**Pattern repeats across tasks**:
- How many other "complete" tasks are actually just "compiles"?
- How much technical debt from insufficient validation?

### Problem Reframe

**From**: "Define testing standards"

**To**: "Establish verification levels that prevent false completion claims"

**The elegant solution**:
Not just documentation, but:
1. **Verification levels taxonomy** - What does each level prove?
2. **Phase-specific gates** - Which level required at each phase?
3. **Automated enforcement** - How to detect and block false claims?
4. **Clear examples** - Good vs bad validation for each level

---

## Strategic Alternatives

### Alternative 1: Just Document Standards (Naive)

**Approach**: Write docs/TESTING_STANDARDS.md

**Pros**:
- Quick (1 hour)
- Clear reference

**Cons**:
- Won't be read
- Won't be enforced
- Pattern continues
- No behavior change

**Kill trigger**: If no one reads it after 30 days

### Alternative 2: VERIFY Phase Checklist (Tactical)

**Approach**: Add checklist to VERIFY phase in WORK_PROCESS.md

**Pros**:
- Action-oriented
- Integrated into workflow
- Hard to skip

**Cons**:
- Only affects VERIFY phase
- Doesn't prevent early false claims
- Requires manual discipline

**Kill trigger**: If agents still claim "build passed = done"

### Alternative 3: Verification Level Gates (Strategic) ✅ RECOMMENDED

**Approach**: Define 4 verification levels + phase requirements + enforcement

**What it includes**:
1. **Taxonomy** of verification levels (Compilation → Smoke → Integration → Production)
2. **Phase requirements**: IMPLEMENT requires Level 1, VERIFY requires Level 2, REVIEW requires Level 3
3. **Automated detection**: Scripts to detect false completion (e.g., "grep 'tests pass' evidence/*.md" but no test files)
4. **Clear examples**: For each level, show what GOOD and BAD validation looks like
5. **Enforcement**: WorkProcessEnforcer checks verification level meets phase requirements

**Pros**:
- Systemic fix (prevents pattern recurrence)
- Enforceable (automated checks)
- Educational (clear examples)
- Scalable (applies to all tasks)

**Cons**:
- More work upfront (2-3 hours)
- Requires enforcement integration
- May slow down initially (learning curve)

**Why this approach**:
- Addresses root cause (confusion about validation levels)
- Prevents false completion (phase gates)
- Teachable (examples show what good looks like)
- Sustainable (enforcement ensures adoption)

### Alternative 4: Do Nothing (Baseline)

**Approach**: Hope agents learn from IMP-35 experience

**Pros**:
- Zero effort

**Cons**:
- Pattern repeats
- Trust erodes
- Debt accumulates

**Kill immediately**: User already requested fix, pattern is harmful

---

## Why Now?

**Trigger**: IMP-35 Round 1 exposed critical pattern
**Urgency**: HIGH - affects all future work
**Cost of delay**: Every task after this risks false completion
**Opportunity**: Fresh example makes learning concrete

**Evidence of need**:
1. User feedback: "that's not the point" (about build passing)
2. User feedback: "make sure...understand what actually valuable testing is"
3. User feedback: "if tests are failing this should prompt a move back to earlier stages"
4. Round 2 success shows impact of proper validation (smoke tests caught bugs)

---

## Success Metrics

### Must Have (3 months)

1. **Zero false completions**: No tasks claim "done" with only compilation
2. **Phase compliance**: 100% of VERIFY phases include Level 2+ validation
3. **Enforcement active**: WorkProcessEnforcer blocks <Level 2 at VERIFY gate

### Should Have (6 months)

4. **Agent understanding**: Agents proactively mention verification level in evidence
5. **Quality improvement**: Fewer bugs found in REVIEW (caught earlier in VERIFY)
6. **Faster debugging**: When bugs occur, verification artifacts make diagnosis easier

### Nice to Have (12 months)

7. **Community adoption**: Other teams reference our verification taxonomy
8. **Automated metrics**: Dashboard shows verification level distribution
9. **Continuous improvement**: Agents propose new verification methods

---

## Strategic Worthiness

### Why This Task vs Alternatives

**Considered alternatives**:
- A: Continue with feature development → Accumulates debt, trust erodes
- B: Fix IMP-35 integration → Tactical fix, doesn't prevent recurrence
- C: Define testing standards (this task) → Systemic fix, prevents pattern

**Choosing C because**:
- Affects ALL future work (not just evals)
- Prevents debt accumulation
- User explicitly requested
- Fresh example makes learning concrete

### Kill/Pivot Triggers

**Kill if**:
- Enforcement too burdensome (agents spend >20% time on verification overhead)
- Pattern solved another way (agents naturally learn without standards)
- No false completions in 90 days without enforcement

**Pivot if**:
- Alternative 2 (checklist) sufficient → Reduce scope, skip enforcement
- Agents resist → Focus on education/examples, defer enforcement
- Too complex → Start with VERIFY phase only, expand later

**Continue if** (current hypothesis):
- Pattern persists without intervention
- Enforcement feasible (<10% overhead)
- Clear examples + automation = behavior change

---

## Alternatives Comparison Matrix

| Dimension | Alt 1: Docs Only | Alt 2: Checklist | Alt 3: Level Gates ✅ | Alt 4: Do Nothing |
|-----------|------------------|------------------|---------------------|-------------------|
| **Effort** | 1 hour | 2 hours | 3 hours | 0 hours |
| **Effectiveness** | Low (won't be read) | Medium (manual discipline) | High (automated) | None |
| **Enforcement** | None | Manual | Automated | N/A |
| **Scalability** | N/A | Phase-specific | All phases | N/A |
| **Sustainability** | Low | Medium | High | N/A |
| **Education** | Reference doc | Task checklist | Examples + taxonomy | None |
| **Risk** | Pattern continues | Partial fix | Overhead burden | Debt accumulates |

**Decision**: Alternative 3 (Verification Level Gates)

**Rationale**:
- Only option with automated enforcement
- Addresses root cause (level confusion)
- Scalable to all tasks
- Educational (examples + taxonomy)
- Sustainable (enforcement ensures adoption)

---

## Integration with Existing Systems

### Work Process (docs/autopilot/WORK_PROCESS.md)

**Current**: VERIFY phase says "run tests" (vague)

**After**: VERIFY phase requires Level 2 validation with evidence:
- Level 1 (Compilation): IMPLEMENT phase requirement
- Level 2 (Smoke tests): VERIFY phase requirement
- Level 3 (Integration): REVIEW phase requirement
- Level 4 (Production): MONITOR phase tracking

### WorkProcessEnforcer (tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts)

**Current**: Checks phase sequence, evidence presence

**After**: Also checks verification level meets phase minimum:
```typescript
if (phase === 'verify' && verificationLevel < 2) {
  return { allowed: false, reason: 'VERIFY requires Level 2+ validation (smoke tests)' };
}
```

### Evidence Templates (docs/autopilot/templates/)

**Current**: Generic templates

**After**: Phase-specific verification requirements:
- `verify/verification_summary.md` template includes "Verification Level: [1-4]" field
- Examples of Level 2 validation for common task types

### CLAUDE.md / AGENTS.md

**Current**: Says "test your code"

**After**:
- Section 7.8: Verification Level Taxonomy
- Pre-commit checklist updated with level requirements
- Examples of each level for different task types

---

## Risk Analysis

### Risk 1: Overhead Too High

**Likelihood**: MEDIUM
**Impact**: HIGH (agents slow down, resist standards)

**Mitigation**:
- Start with examples (low overhead)
- Make enforcement optional initially (observe mode)
- Measure actual overhead (target <10% time increase)

**Detection**: Track time spent on verification per task

### Risk 2: Standards Too Rigid

**Likelihood**: LOW
**Impact**: MEDIUM (doesn't fit all task types)

**Mitigation**:
- Define standards as guidelines, not rules
- Allow exceptions with justification
- Provide task-type-specific examples

**Detection**: Count exception requests, adjust if >20%

### Risk 3: Pattern Continues Despite Standards

**Likelihood**: LOW (if enforced), HIGH (if not enforced)
**Impact**: HIGH (wasted effort, no improvement)

**Mitigation**:
- Automated enforcement from day 1
- Clear examples that agents can copy
- Immediate feedback when violation detected

**Detection**: Monitor false completion rate

### Risk 4: Standards Become Stale

**Likelihood**: MEDIUM
**Impact**: MEDIUM (standards don't evolve with practices)

**Mitigation**:
- Schedule 6-month review
- Solicit feedback from agents
- Track new verification methods as they emerge

**Detection**: Last-updated timestamp >6 months old

---

## Implementation Approach (High-Level)

### Phase 1: Define Taxonomy (1 hour)

**Output**: docs/autopilot/VERIFICATION_LEVELS.md

**Content**:
- 4 levels defined
- What each level proves
- When each level is required
- Examples for each level

### Phase 2: Update Work Process (1 hour)

**Output**: Updated WORK_PROCESS.md, CLAUDE.md, AGENTS.md

**Changes**:
- VERIFY phase explicitly requires Level 2
- REVIEW phase requires Level 3
- Pre-commit checklist includes verification level check

### Phase 3: Create Examples (1 hour)

**Output**: docs/autopilot/examples/verification/

**Examples**:
- Good vs bad validation for each level
- Task-type-specific examples (eval, API, UI, etc.)
- Common pitfalls and how to avoid them

### Phase 4: Enforcement (Optional, 2 hours)

**Output**: Updated WorkProcessEnforcer

**Implementation**:
- Parse verification level from evidence
- Check against phase requirements
- Block transitions if insufficient
- (Start in observe mode, move to enforce after validation)

---

## Next Phase: SPEC

Define acceptance criteria:
- What exactly gets created/updated?
- How do we know standards are clear enough?
- What does "enforced" mean concretely?
- How do we measure adoption?

---

**STRATEGIZE Status**: ✅ COMPLETE

**Decision**: Proceed with Alternative 3 (Verification Level Gates) - systemic fix with enforcement

**Next Phase**: SPEC (define acceptance criteria)
