# AFP 10-Phase Work Lifecycle

**Agentic-First Programming (AFP)** enforces a disciplined work process that prevents codebase degradation through thoughtful design before implementation.

---

## Overview

```
1. STRATEGIZE → 2. SPEC → 3. PLAN → 4. THINK → 5. [GATE]
                                                    ↓
                                             CHECKPOINT
                                                    ↓
6. IMPLEMENT → 7. VERIFY → 8. REVIEW → 9. PR → 10. MONITOR
```

**The GATE (phase 5) enforces that phases 1-4 are complete before implementation begins.**

---

## Phase Descriptions

### Phase 1: STRATEGIZE

**Purpose**: Understand WHY you're making this change (not just WHAT)

**Questions to answer**:
- What problem are we solving?
- What's the root cause?
- What's the goal/desired outcome?
- How does this align with AFP/SCAS principles?
- Is this the right problem to solve?

**Output**: Problem analysis document

**Example**:
```markdown
## STRATEGIZE

**Problem**: Weather data cache is missing 30% of requests, causing API rate limit hits

**Root cause**: Cache invalidation logic doesn't account for timezone changes

**Goal**: Reduce cache misses to <5% to stay within API quota

**AFP/SCAS alignment**: This reduces external dependency (resilience_index↑)
```

---

### Phase 2: SPEC

**Purpose**: Define success criteria and requirements

**Questions to answer**:
- What does "done" look like?
- What are the acceptance criteria?
- What are functional requirements?
- What are non-functional requirements (performance, security, etc.)?

**Output**: Requirements specification

**Example**:
```markdown
## SPEC

**Acceptance criteria**:
- Cache miss rate <5%
- No API rate limit errors
- Cache size stays <100MB

**Functional requirements**:
- Cache considers timezone in key generation
- Cache invalidation on timezone change

**Non-functional**:
- Performance: Cache lookup <10ms
- Memory: Max 100MB cache size
```

---

### Phase 3: PLAN

**Purpose**: Design the approach using AFP/SCAS principles

**Questions to answer**:
- **Via negativa**: Can I DELETE code instead of adding?
- **Refactor not repair**: Can I REFACTOR instead of patching?
- Which files need changes?
- How to keep it ≤5 files, ≤150 LOC?
- What's the architecture/flow?

**Output**: Implementation plan

**Example**:
```markdown
## PLAN

**Via negativa analysis**:
- Current cache logic is in 3 files (150 LOC) - can we DELETE the whole thing?
- NO - caching is needed, but current implementation is flawed

**Refactor analysis**:
- Cache logic is scattered across 3 files
- Should REFACTOR into single CacheManager (80 LOC)
- DELETE old cache files (3 files, -150 LOC)
- ADD new CacheManager (1 file, +80 LOC)
- Net: -2 files, -70 LOC ✅

**Files to change**:
1. DELETE: src/cache/weather_cache.ts
2. DELETE: src/cache/cache_utils.ts
3. DELETE: src/cache/invalidation.ts
4. ADD: src/cache/CacheManager.ts

**Architecture**: Single CacheManager with timezone-aware key generation
```

---

### Phase 4: THINK

**Purpose**: Reason through edge cases, failure modes, complexity

**Questions to answer**:
- What can go wrong?
- What are the edge cases?
- Does this increase complexity? How to mitigate?
- What are failure modes?
- How to test this?

**Output**: Design reasoning document

**Example**:
```markdown
## THINK

**Edge cases**:
- User changes timezone mid-session → invalidate cache
- Daylight saving time transitions → key includes DST offset
- Multiple simultaneous cache writes → use mutex

**Failure modes**:
- Cache corrupted → fallback to no-cache mode
- Out of memory → LRU eviction (already planned)

**Complexity analysis**:
- Current: 3 files, cyclomatic complexity ~15
- Proposed: 1 file, cyclomatic complexity ~8
- Complexity DECREASES ✅

**Testing strategy**:
- Unit tests: Cache key generation with timezone variations
- Integration tests: Cache hit/miss rates
- Load tests: Memory usage under load
```

---

### Phase 5: [GATE]

**Purpose**: CHECKPOINT - Verify phases 1-4 are complete before implementing

**Requirements**:

**For NON-TRIVIAL changes (>2 files or >50 LOC)**:
- Create `state/evidence/[TASK-ID]/phases.md` documenting phases 1-4
- Stage the evidence file: `git add state/evidence/[TASK-ID]/phases.md`
- Pre-commit hook will BLOCK without this evidence

**For TRIVIAL changes (≤2 files, ≤50 LOC)**:
- Document reasoning inline in code comments
- No separate evidence file required

**IF GATE VIOLATED (you already coded without phases 1-4)**:
1. **STOP CODING IMMEDIATELY**
2. **GO BACK** to phase 1 (STRATEGIZE)
3. **RETHINK** your implementation through AFP/SCAS lens:
   - Can you DELETE instead of add?
   - Can you REFACTOR instead of patch?
   - How to reduce files/LOC?
4. **REVISE** your code to match the better design

**Enforcement**: Pre-commit hook blocks commits >2 files without phase evidence

---

### Phase 6: IMPLEMENT

**Purpose**: Write the code (NOW you can code)

**Constraints** (enforced by pre-commit hook):
- ≤5 files changed
- ≤150 net LOC (additions - deletions)
- Refactor not patch
- Prefer deletion over addition

**Process**:
1. Follow the PLAN from phase 3
2. Keep commits atomic and focused
3. Write clean, simple code
4. Follow project conventions

**Output**: Code changes

---

### Phase 7: VERIFY

**Purpose**: Test that it works

**Requirements** (see `MANDATORY_VERIFICATION_LOOP.md` for details):
1. **BUILD**: `npm run build` completes with 0 errors
2. **TEST**: All tests pass, 7/7 coverage dimensions
3. **AUDIT**: `npm audit` shows 0 vulnerabilities
4. **RUNTIME**: Feature works end-to-end with realistic data
5. **DOCUMENTATION**: Docs updated

**Exit criteria**: ALL checks pass (no shortcuts)

**If ANY check fails**: Fix → go back to BUILD → repeat

---

### Phase 8: REVIEW

**Purpose**: Quality check and phase compliance verification

**Checklist**:
- [ ] GATE was followed (phases 1-4 completed before implementing)
- [ ] Evidence exists (`state/evidence/[TASK-ID]/phases.md`)
- [ ] Implementation matches PLAN (phase 3)
- [ ] All quality checks pass (micro-batching, via negativa, complexity)
- [ ] Verification loop completed (phase 7)
- [ ] Integrity tests pass (`bash tools/wvo_mcp/scripts/run_integrity_tests.sh`)

**If phase compliance failed**:
- Create follow-up refactoring task
- Document technical debt in `state/evidence/[TASK-ID]/debt.md`
- Do NOT mark task complete until compliance restored

---

### Phase 9: PR

**Purpose**: Human review

**Process**:
1. Use `.github/pull_request_template.md`
2. Include evidence from phases 1-4
3. Include verification results from phase 7
4. Request review from module owners

**PR must show**:
- Problem analysis (phase 1)
- Requirements (phase 2)
- Design approach (phase 3)
- Test results (phase 7)
- AFP/SCAS compliance (≤5 files, ≤150 LOC, etc.)

---

### Phase 10: MONITOR

**Purpose**: Track results post-deployment

**Activities**:
- Monitor for errors/crashes
- Track performance metrics
- Verify requirements met (phase 2)
- Collect feedback for next iteration

---

## GATE Enforcement

**The GATE (phase 5) is the critical checkpoint that prevents codebase degradation.**

### Why GATE exists

**Problem**: Agents jump straight to coding without thinking, leading to:
- Patching instead of refactoring
- Addition instead of deletion
- Complexity increase
- Technical debt accumulation

**Solution**: GATE forces thinking BEFORE coding

### How GATE works

**Pre-commit hook checks**:
1. If commit changes >2 files OR >50 LOC (non-trivial):
2. Check for `state/evidence/.*/phases.md` in staged changes
3. If missing → **BLOCK commit** with detailed error:
   - Explains phases 1-4 requirements
   - Demands going back and completing phases properly
   - Forces rethinking implementation through AFP/SCAS lens

**Message on violation**:
```
❌ GATE VIOLATION: You skipped phases 1-4. STOP CODING.

YOU MUST GO BACK AND COMPLETE PHASES 1-4 PROPERLY:

1. STRATEGIZE - Understand WHY (not just WHAT)
   → What problem are you solving? What's the root cause?
   → How does this align with AFP/SCAS principles?

2. SPEC - Define success criteria and requirements
   → What does 'done' look like?

3. PLAN - Design the approach using AFP/SCAS
   → Can you DELETE code instead of adding?
   → Can you REFACTOR instead of patching?

4. THINK - Reason through edge cases
   → What can go wrong?

If you already coded without thinking: THAT'S THE PROBLEM.
Revisit your design with AFP/SCAS lens before proceeding.
```

### GATE exemptions

**Trivial changes (≤2 files, ≤50 LOC)**:
- No phase evidence file required
- Document reasoning inline
- Hook allows commit

**Documentation-only changes**:
- No phase evidence required
- Hook allows commit

---

## Phase Evidence Format

**File**: `state/evidence/[TASK-ID]/phases.md`

**Template**:
```markdown
# Phase Evidence: [TASK-ID]

**Task**: [Brief description]

---

## Phase 1: STRATEGIZE

**Problem**: [What problem are we solving?]

**Root cause**: [Why does this problem exist?]

**Goal**: [What's the desired outcome?]

**AFP/SCAS alignment**: [How does this align with principles?]

---

## Phase 2: SPEC

**Acceptance criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]

**Functional requirements**:
- [Requirement 1]
- [Requirement 2]

**Non-functional requirements**:
- Performance: [metrics]
- Security: [considerations]

---

## Phase 3: PLAN

**Via negativa analysis**:
- Can we DELETE instead of add? [Analysis]

**Refactor analysis**:
- Should we REFACTOR instead of patch? [Analysis]

**Files to change**:
1. [file1] - [what changes]
2. [file2] - [what changes]

**Architecture**: [Design approach]

**LOC estimate**: [files count] files, [net LOC] LOC

---

## Phase 4: THINK

**Edge cases**:
- [Edge case 1] → [Mitigation]
- [Edge case 2] → [Mitigation]

**Failure modes**:
- [Failure mode 1] → [Handling]

**Complexity analysis**:
- Current: [metrics]
- Proposed: [metrics]
- Change: [increase/decrease/neutral]

**Testing strategy**:
- [Test approach]

---

**Phase completion date**: [YYYY-MM-DD]
**Implementer**: [Agent name]
```

---

## Best Practices

### 1. Complete phases sequentially

**Do**: STRATEGIZE → SPEC → PLAN → THINK → [GATE] → IMPLEMENT

**Don't**: Jump to IMPLEMENT and backfill documentation

### 2. Use GATE to prevent mistakes

**Do**: Let hook block you, go back, rethink design

**Don't**: Bypass hook with `--no-verify` (defeats the purpose)

### 3. Document honestly

**Do**: Write real analysis in phase evidence

**Don't**: Write fake evidence just to pass GATE

### 4. Embrace via negativa

**Do**: Always consider deletion/simplification first

**Don't**: Default to addition/patching

### 5. Refactor instead of repair

**Do**: If file >200 LOC or function >50 LOC, refactor the whole thing

**Don't**: Patch large files/functions

### 6. Make GATE evidence useful

**Do**: Write evidence that helps future developers

**Don't**: Write minimal evidence that provides no value

---

## Common Issues

### Issue: "I already coded, now GATE blocks me"

**Root cause**: Skipped phases 1-4, jumped to IMPLEMENT

**Fix**:
1. Don't bypass hook
2. Go back to phase 1 (STRATEGIZE)
3. Work through phases 1-4 properly
4. Rethink implementation through AFP/SCAS lens
5. Revise code to match better design
6. Create phase evidence
7. Stage evidence and commit

**Lesson**: Complete phases BEFORE coding (not after)

### Issue: "Phase evidence feels like bureaucracy"

**Root cause**: Writing evidence AFTER coding (backfilling)

**Fix**:
1. Write evidence BEFORE implementing
2. Use phases as design tool, not documentation burden
3. Let phases guide better design
4. Evidence should capture real thinking, not justify existing code

**Lesson**: Phases prevent bad code, not document bad decisions

### Issue: "How much detail in phase evidence?"

**Answer**: Enough to:
- Explain design choices to future developers
- Show AFP/SCAS principles were considered
- Demonstrate thoughtful design (not rushed)
- Enable someone else to review/understand approach

**Rule of thumb**: 10-20 lines per phase (not a novel, not one sentence)

---

## References

- [Task Lifecycle](/docs/agent_library/common/processes/task_lifecycle.md)
- [Mandatory Verification Loop](/docs/MANDATORY_VERIFICATION_LOOP.md)
- [Mandatory Work Checklist](/MANDATORY_WORK_CHECKLIST.md)
- [AGENTS.md](/AGENTS.md)
- [CLAUDE.md](/CLAUDE.md)

---

**Version**: 1.0.0
**Last Updated**: 2025-11-05
