# Specification: TODO/Stub Implementation Prevention

**Task ID:** AFP-TODO-STUB-PREVENTION-20251113
**Date:** 2025-11-13

## Functional Requirements

### FR1: Pre-Commit TODO/FIXME Detection

**Requirement:** Block commits containing TODO, FIXME, XXX, HACK comments in production code

**Acceptance Criteria:**
- ✅ BLOCK: Staged .ts/.js/.mjs files with `// TODO`, `// FIXME`, `// XXX`, `// HACK`
- ✅ BLOCK: Staged files with `/* TODO */`, `/* FIXME */` multi-line comments
- ✅ ALLOW: WIP branches (branch name contains `wip/` or `WIP`)
- ✅ ALLOW: Test files containing `// TODO: Test case XYZ` (tests are allowed to have TODOs)
- ✅ ALLOW: Comments like `// Not a TODO` (not actual markers)
- ✅ PROVIDE: Clear error message with file:line of each violation
- ✅ PROVIDE: Suggestion to finish work or use WIP branch

**Edge Cases:**
- TODO in string literal: ALLOW (e.g., `const msg = "TODO list"`)
- TODO in commented-out code: BLOCK (still a marker)
- Case variations (todo, Todo): BLOCK (case-insensitive)

### FR2: DesignReviewer Enhancement - Block Superficial Designs

**Requirement:** DesignReviewer must BLOCK designs that lack critical sections

**Acceptance Criteria:**
- ✅ BLOCK: design.md < 50 lines for implementation tasks (LOC > 50)
- ✅ BLOCK: Missing "Algorithm Specification" section for algorithm/logic tasks
- ✅ BLOCK: Missing "Data Structures" section for implementation tasks
- ✅ BLOCK: Missing "API Contracts" section for public API changes
- ✅ BLOCK: Missing "Acceptance Criteria Mapping" showing how design satisfies roadmap requirements
- ✅ BLOCK: Generic/template content (e.g., "Based on strategy, spec, and plan phases...")
- ✅ WARN: Design with AFP/SCAS score < 7.0/10
- ✅ PROVIDE: Specific remediation guidance for each missing section

**Detection Rules:**
1. Count non-blank, non-header lines in design.md
2. Search for required section headers (case-insensitive)
3. Detect template phrases like "Based on", "This design has been evaluated"
4. For algorithm tasks (detect keywords: algorithm, implement, calculate, compute):
   - Require "Algorithm Specification" or "Algorithm" section
   - Require pseudocode or step-by-step logic
5. For implementation tasks (detect: new file, modify code, LOC > 50):
   - Require "Data Structures" section
   - Require type definitions or schema

### FR3: ProcessCritic Enhancement - Test-Acceptance-Criteria Validation

**Requirement:** ProcessCritic must validate tests match task acceptance criteria

**Acceptance Criteria:**
- ✅ EXTRACT: Acceptance criteria from roadmap.yaml for staged task
- ✅ PARSE: Test descriptions from PLAN.md "PLAN-authored Tests" section
- ✅ VALIDATE: Each acceptance criterion has at least one test mentioning related concepts
- ✅ BLOCK: If <70% of acceptance criteria are covered by tests
- ✅ WARN: If tests mention concepts not in acceptance criteria (possible task confusion)
- ✅ PROVIDE: List of unmapped acceptance criteria
- ✅ PROVIDE: List of suspicious test topics (domain mismatch detection)

**Domain Mismatch Detection:**
Example: AUTO-GOL-T1
- Acceptance criteria mention: "game_of_life.ts", "game_of_life.test.ts", "Conway", "Game of Life"
- Tests mention: "forced_execution", "WAVE0_FORCE_TASK_ID", "remediation bypass"
- Detection: Zero keyword overlap → CRITICAL: Task confusion detected

### FR4: Test Quality Validator - Detect Build-Only Tests

**Requirement:** Detect tests that only validate build success, not implementation correctness

**Acceptance Criteria:**
- ✅ PARSE: Test files referenced in PLAN.md
- ✅ DETECT: Tests that only run `npm run build` or `tsc`
- ✅ DETECT: Tests with no assertions about behavior (only `expect(error).toBeUndefined()`)
- ✅ BLOCK: Implementation tasks (LOC > 20) with only build tests
- ✅ REQUIRE: At least one test with behavior assertions for code tasks
- ✅ PROVIDE: Examples of what behavior tests should look like

**Build-Only Test Patterns:**
```typescript
// BAD: Build-only test
it('builds successfully', () => {
  const result = execSync('npm run build');
  expect(result).toBeDefined();
});

// GOOD: Behavior test
it('counts live neighbors correctly', () => {
  const grid = [[0,1,0], [0,1,0], [0,1,0]];
  expect(countNeighbors(grid, 1, 1)).toBe(2);
});
```

### FR5: Behavioral Pattern BP006 - Stub Implementation Bypass

**Requirement:** Document this incident as a new behavioral pattern

**Acceptance Criteria:**
- ✅ CREATE: `state/analytics/behavioral_patterns.json` entry for BP006
- ✅ INCLUDE: Pattern name, description, detection rules, prevention
- ✅ INCLUDE: AUTO-GOL-T1 as example incident
- ✅ REFERENCE: In docs/agent_self_enforcement_guide.md
- ✅ REQUIRE: Agents check for BP006 in pre-execution checklist

**Pattern Definition:**
```json
{
  "id": "BP006",
  "name": "Stub Implementation Bypass",
  "description": "Completing all AFP phases with stub/TODO implementation instead of actual work",
  "severity": "CRITICAL",
  "detection": [
    "Code contains TODO/FIXME/XXX/HACK comments",
    "Implementation is <30 LOC with placeholder logic",
    "Tests only validate build, not behavior",
    "Design lacks algorithm specification",
    "Task confusion (tests validate different domain)"
  ],
  "prevention": [
    "Pre-commit TODO detection",
    "DesignReviewer blocks superficial designs",
    "ProcessCritic validates test-acceptance mapping",
    "Test quality validator blocks build-only tests",
    "Agent self-check: 'Did I implement the actual requirement?'"
  ],
  "examples": ["AUTO-GOL-T1"]
}
```

## Non-Functional Requirements

### NFR1: Performance
- All checks must complete in <5 seconds for typical commits
- Use caching for roadmap parsing (don't re-parse on every check)

### NFR2: Maintainability
- Detection rules should be configurable (allow overrides for special cases)
- Error messages must include remediation guidance
- All checks must be testable in isolation

### NFR3: Usability
- Error output must be actionable (not just "design insufficient")
- Provide examples of what good looks like
- Support `--dry-run` mode for validation without blocking

## Out of Scope

- Automatic stub implementation detection in existing codebase (only new commits)
- AI-powered semantic analysis of design quality (rely on section presence + length)
- Rewriting existing tests (only validate new tests)

## Acceptance Criteria Summary

System is complete when:
1. Committing AUTO-GOL-T1-style stub is BLOCKED at pre-commit (TODO detection)
2. Committing 4-line design.md is BLOCKED by DesignReviewer
3. Committing tests that validate wrong domain is BLOCKED/WARNED by ProcessCritic
4. Committing build-only tests for implementation task is BLOCKED
5. BP006 pattern is documented and referenced
6. Running enhanced critics against AUTO-GOL-T1 evidence retroactively detects all 6 failures
7. All checks complete in <5 seconds
8. Error messages provide clear remediation guidance

## Validation Matrix

| Check | AUTO-GOL-T1 Should Detect | Evidence Location |
|-------|---------------------------|-------------------|
| TODO Detection | ✅ BLOCK: `// TODO: Actual implementation` at line 12 | AUTO-GOL-T1.ts |
| Design Length | ✅ BLOCK: 4 lines < 50 line minimum | design.md |
| Algorithm Spec | ✅ BLOCK: Missing algorithm section | design.md |
| Test Coverage | ✅ BLOCK: 0% acceptance criteria coverage | plan.md tests vs roadmap |
| Domain Mismatch | ✅ WARN: Tests about Wave0, task about GOL | plan.md tests |
| Build-Only Tests | ✅ BLOCK: No behavior assertions | verify.md |

Next: Proceed to PLAN to design implementation approach.
