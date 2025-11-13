# Strategy: Prevent TODO/Stub Implementation Bypasses

**Task ID:** AFP-TODO-STUB-PREVENTION-20251113
**Agent:** Claude (Council)
**Date:** 2025-11-13
**Priority:** CRITICAL

## Problem Statement

AUTO-GOL-T1 was marked DONE with:
- 26-line stub implementation with "// TODO: Actual implementation would go here"
- All 10 AFP phases completed
- Tests passing (only checked build success)
- Evidence marked "PROVEN"
- DesignReviewer approved with 7.5/9

**This is completely unacceptable.**

## Root Cause Analysis

### Gate Failure #1: Task Confusion
Wave 0 thought AUTO-GOL-T1 was about "forced Wave 0 execution mode" instead of "Conway's Game of Life implementation"

Evidence:
- PLAN.md: Tests validate WAVE0_FORCE_TASK_ID, not GOL algorithm
- THINK.md: Edge cases about duplicate processes, not GOL patterns
- DESIGN.md: Only 4 lines, no algorithm specification

### Gate Failure #2: DesignReviewer Superficiality
4-line design.md approved with 7.5/9 score

Should have BLOCKED because:
- No algorithm specification
- No data structures defined
- No API design
- No acceptance criteria mapping

### Gate Failure #3: Test Quality
Tests only validated build success, not GOL correctness

Should have BLOCKED because:
- No tests for neighbor counting
- No tests for cell state transitions
- No tests for known GOL patterns (blinker, glider, etc.)
- Tests validate wrong thing (Wave 0 plumbing)

### Gate Failure #4: ProcessCritic
Didn't detect that PLAN-authored tests don't match task acceptance criteria

Should have BLOCKED because:
- Roadmap says "Implementation file at state/demos/gol/game_of_life.ts"
- Tests validate forced_execution.test.ts (different domain)

### Gate Failure #5: Pre-Commit Hook
Didn't detect TODO comments in "finished" code

Should have BLOCKED because:
- `// TODO: Actual implementation would go here` in committed code
- No WIP marker in commit message

### Gate Failure #6: Behavioral Self-Enforcement
Wave 0 didn't self-check if implementation was complete

Should have caught via mid-execution checks:
- "Did I actually implement the algorithm?"
- "Do my tests validate the requirements?"
- "Is my design detailed enough to guide implementation?"

## Strategic Goal

**Create a multi-layered prevention system that makes stub implementations impossible to commit.**

## Success Criteria

1. Pre-commit hook BLOCKS any code with TODO/FIXME comments (unless WIP branch)
2. DesignReviewer BLOCKS designs without:
   - Algorithm specification (for algorithm tasks)
   - Data structures defined
   - API contracts
   - Acceptance criteria mapping
3. ProcessCritic BLOCKS when tests don't validate task acceptance criteria
4. Test quality validator BLOCKS build-only tests for implementation tasks
5. Behavioral pattern detector auto-detects BP006 (Stub Implementation Bypass)
6. Running the fix against AUTO-GOL-T1 evidence retroactively detects all failures

## Via Negativa

Before adding detection logic, check:
- Can existing critics be enhanced instead of adding new ones?
- Can we simplify by making DesignReviewer stricter?
- Can we delete ambiguous task definitions that enable confusion?

## Refactor Not Repair

This is NOT about patching the symptom (TODO comments). It's about:
- Refactoring critics to validate OUTCOME, not just PROCESS
- Refactoring test authoring to require correctness proofs
- Refactoring design approval to block superficial designs

## Implementation Complexity

Expected changes:
- 5 files modified (critics + pre-commit hook)
- ~200-300 LOC total
- High impact: prevents entire class of bypasses

Justification: Prevents catastrophic quality failures worth 10x the implementation cost

## AFP Alignment

This task IS an AFP task:
- Following all 10 phases
- Creating comprehensive evidence
- Building quality enforcement
- Preventing future bypasses

## Next Phase

Proceed to SPEC to define exact detection rules and blocking criteria.
