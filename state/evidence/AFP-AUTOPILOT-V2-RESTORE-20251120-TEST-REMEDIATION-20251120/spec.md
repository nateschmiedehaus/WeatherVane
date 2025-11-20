# Specification: Test Remediation for Autopilot V2

## Objective
Create comprehensive test files for all Autopilot V2 components (Scanner, Brain, Body/Membrane) that were promised in PLAN but never authored, and add enforcement to prevent future violations.

## Scope

### In Scope
1. **Test File Creation (3 files):**
   - `tools/wvo_mcp/src/nervous/test_scanner.ts` - Tests for SignalScanner
   - `tools/wvo_mcp/src/brain/test_brain.ts` - Tests for DSPy Optimizer and Memory
   - `tools/wvo_mcp/src/body/test_body.ts` - Tests for Membrane/Dashboard (renamed from "body")

2. **ProcessCritic Enforcement:**
   - Add validation script: `scripts/validate_plan_tests.sh`
   - Integrate into pre-commit hook for PLAN phase commits
   - Block PLAN commits if listed tests don't exist

3. **Documentation Updates:**
   - Add BP006 pattern to `state/analytics/behavioral_patterns.json`
   - Update violation evidence in parent task

### Out of Scope
- Fixing implementation bugs (if tests reveal bugs, those are SEPARATE remediation tasks)
- Rewriting existing V2 components (only testing them)
- Adding new features (pure test coverage, no feature work)

## Functional Requirements

### FR1: Test Files Must Exist
**Requirement:** All 3 test files must be created in correct locations
**Acceptance Criteria:**
- `ls tools/wvo_mcp/src/nervous/test_scanner.ts` returns file (not "No such file")
- `ls tools/wvo_mcp/src/brain/test_brain.ts` returns file
- `ls tools/wvo_mcp/src/body/test_body.ts` returns file

### FR2: Tests Must Be Executable
**Requirement:** Each test file must run without syntax/import errors
**Acceptance Criteria:**
- `npx tsx tools/wvo_mcp/src/nervous/test_scanner.ts` exits with code 0 (pass) or 1 (fail), not crash
- `npx tsx tools/wvo_mcp/src/brain/test_brain.ts` runs without crashes
- `npx tsx tools/wvo_mcp/src/body/test_brain.ts` runs without crashes
- No "Cannot find module" or "Unexpected token" errors

### FR3: Tests Must Cover 7/7 Quality Dimensions
**Requirement:** Each test file must address all dimensions from `UNIVERSAL_TEST_STANDARDS.md`
**Acceptance Criteria:**
- `bash scripts/validate_test_quality.sh <test_file>` returns score ≥7/7
- Dimensions covered:
  1. **Correctness:** Happy path works (Scanner finds @CRITICAL, Optimizer compiles prompt)
  2. **Edge cases:** Empty input, huge files, binary files, missing directories
  3. **Error handling:** Network failures, API errors, corrupt JSON, permission denied
  4. **Performance:** Scanner handles 100+ files, Optimizer handles 100+ traces
  5. **Integration:** Components work together (Scanner → Dispatcher, Optimizer → Memory)
  6. **Behavioral:** Template detection catches violations, Smart Stub mode works
  7. **Regression:** Previous bugs don't return (circular deps, zombie processes)

### FR4: ProcessCritic Validation Script
**Requirement:** Script validates PLAN-listed tests exist
**Acceptance Criteria:**
- Script location: `scripts/validate_plan_tests.sh`
- Usage: `bash scripts/validate_plan_tests.sh <TASK_ID>`
- Behavior:
  - Read `state/evidence/<TASK_ID>/plan.md`
  - Extract test file paths from "PLAN-authored tests" section
  - Check if each file exists
  - Exit 0 if all exist, exit 1 if any missing
  - Output: Clear error message listing missing files

### FR5: Pre-Commit Integration
**Requirement:** Hook blocks PLAN commits without test files
**Acceptance Criteria:**
- `.git/hooks/pre-commit` calls `validate_plan_tests.sh` for PLAN commits
- Commit blocked if validation fails (exit 1)
- Error message guides user: "PLAN lists test files that don't exist: <list>"
- Exemption allowed: PLAN can include `<!-- TEST_EXEMPTION: docs-only -->`

## Non-Functional Requirements

### NFR1: Test Execution Speed
**Requirement:** All tests complete quickly
**Target:** <30 seconds total execution time
**Rationale:** Fast tests = more likely to run frequently

### NFR2: Test Clarity
**Requirement:** Tests are self-documenting
**Criteria:**
- Each test has clear comment explaining WHAT it validates
- Test names follow pattern: `test_<component>_<scenario>`
- Assertion failures have descriptive messages

### NFR3: Test Independence
**Requirement:** Tests don't depend on external state
**Criteria:**
- No network calls (use mocks/stubs)
- No writing to production state directories (use temp dirs)
- Tests can run in any order

### NFR4: Backward Compatibility
**Requirement:** Adding validation doesn't break existing tasks
**Criteria:**
- Only applies to tasks with "PLAN-authored tests" section
- Legacy tasks without this section pass validation (no false positives)
- Exemption mechanism for docs-only tasks

## Test Case Specifications

### Scanner Tests (test_scanner.ts)
**Based on `think.md` test cases 1-3:**

1. **Test:** Scanner finds @CRITICAL tag
   - Input: File with `// @CRITICAL: Fix memory leak`
   - Expected: Signal object `{ type: 'CRITICAL', message: 'Fix memory leak', ... }`

2. **Test:** Scanner ignores normal comments
   - Input: File with `// Just a regular comment`
   - Expected: No signals (empty array)

3. **Test:** Scanner handles missing directory
   - Input: Scan path `/nonexistent/path`
   - Expected: Empty result, no crash

4. **Test:** Scanner handles huge file
   - Input: File >1MB
   - Expected: Completes in <5s OR gracefully skips with warning

5. **Test:** Scanner handles binary files
   - Input: PNG image file
   - Expected: No signals, no crash

### Brain Tests (test_brain.ts)
**Based on `think.md` test cases 4-6:**

1. **Test:** Optimizer compiles prompt signature
   - Input: Signature `{ input: "query", output: "answer" }` + examples
   - Expected: Compiled prompt string (non-empty)

2. **Test:** LLMService uses Smart Stub when no API key
   - Input: `llm.generate("hello")` with no env vars
   - Expected: Simulated response, no crash, mode=STUB

3. **Test:** LLMService validates Zod schema
   - Input: Schema `z.object({ name: z.string() })`
   - Expected: Response has `name` property (string type)

4. **Test:** Optimizer handles empty trace
   - Input: Record empty trace `{ examples: [] }`
   - Expected: No state change, no crash

5. **Test:** Memory stores and retrieves episode
   - Input: Store episode `{ task: "TEST", outcome: "SUCCESS" }`
   - Expected: Retrieve returns same episode

### Body/Membrane Tests (test_body.ts)
**Based on `think.md` test cases 7-9:**

1. **Test:** Dashboard renders without crashing
   - Input: Initialize React component
   - Expected: Component mounts, no exceptions

2. **Test:** KPI writer appends to file
   - Input: Write KPI event `{ metric: "test", value: 42 }`
   - Expected: Line added to `state/analytics/test.jsonl`

3. **Test:** Dispatcher routes CRITICAL to correct agent
   - Input: Signal `{ type: 'CRITICAL' }`
   - Expected: Dispatcher returns agent role `'firefighter'`

4. **Test:** Integration: Scanner → Dispatcher
   - Input: File with `@CRITICAL`
   - Expected: Scanner finds signal → Dispatcher assigns agent

## Success Metrics

### Must-Have (Blocking)
- ✅ All 3 test files exist (100% compliance)
- ✅ All tests executable (no import/syntax errors)
- ✅ Test quality score ≥7/7 per file
- ✅ ProcessCritic script exists and works
- ✅ Pre-commit integration active

### Nice-to-Have (Non-Blocking)
- 🎯 All tests pass (green) - if they fail, that's OK! Means we found bugs to fix
- 🎯 Test execution <30s total
- 🎯 Code coverage >80% for V2 components

## Dependencies
- **Upstream:** Parent task `AFP-AUTOPILOT-V2-RESTORE-20251120` (BLOCKED until this completes)
- **Downstream:** Future V2 development (will benefit from test foundation)
- **External:** None (tests use local filesystem, no APIs)

## Assumptions
1. V2 components exist and are importable (Scanner, Dispatcher, Optimizer, Memory, Dashboard)
2. TypeScript/Node.js environment is working (build already passes)
3. `npx tsx` is available for running TypeScript directly

## Constraints
- **Time:** Must complete in <4 hours (this is blocking parent task)
- **Scope:** Only test authoring, no implementation changes
- **Quality:** Cannot compromise on 7/7 dimensions (quality is non-negotiable)

## Acceptance Criteria (Exit Criteria)

Task is complete when ALL of these are true:
1. ✅ All 3 test files exist in correct locations
2. ✅ Each test file has ≥4 test cases covering 7/7 dimensions
3. ✅ `bash scripts/validate_test_quality.sh <file>` returns 7/7 for each
4. ✅ `npx tsx <test_file>` runs without crashes for each file
5. ✅ `scripts/validate_plan_tests.sh` exists and works correctly
6. ✅ Pre-commit hook calls validation for PLAN commits
7. ✅ BP006 pattern documented in `behavioral_patterns.json`
8. ✅ Parent task VERIFY phase can resume with working tests

## Out of Scope (Explicitly NOT Doing)
- ❌ Fixing bugs revealed by tests (separate remediation tasks)
- ❌ Improving V2 component implementations
- ❌ Adding new features to V2 architecture
- ❌ Refactoring existing code (pure test addition)

## Reference Documents
- Parent task PLAN: `state/evidence/AFP-AUTOPILOT-V2-RESTORE-20251120/plan.md`
- Test cases source: `state/evidence/AFP-AUTOPILOT-V2-RESTORE-20251120/think.md`
- Test standards: `docs/UNIVERSAL_TEST_STANDARDS.md`
- Process guide: `MANDATORY_WORK_CHECKLIST.md`
- Violation doc: `state/evidence/AFP-AUTOPILOT-V2-RESTORE-20251120/CRITICAL_VIOLATION.md`
