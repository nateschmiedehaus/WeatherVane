# Thinking: Edge Cases & Failure Modes for Test Remediation

## Problem Analysis

We've created 3 test files to remediate the work process violation. Now we must consider: **What can go wrong?**

## Edge Cases

### EC1: Test Files Don't Actually Test Anything

**Scenario:** Files exist but contain no meaningful tests  
**Likelihood:** Medium (template-based generation risk)  
**Impact:** HIGH - False sense of security  
**Detection:** Manual code review, run tests and verify they actually fail when implementation broken  
**Mitigation:** Read test files, verify they make real assertions

### EC2: Tests Are Not Executable

**Scenario:** Files missing shebang, wrong permissions, syntax errors  
**Likelihood:** Low (files already created with shebang)  
**Impact:** MEDIUM - Cannot run tests  
**Detection:** Try to execute: `node tools/wvo_mcp/src/nervous/test_scanner.ts`  
**Mitigation:** Fix permissions, add shebang if missing, fix syntax

### EC3: Tests Depend on Missing Dependencies

**Scenario:** Tests import packages not in package.json  
**Likelihood:** Low (uses built-in Node modules)  
**Impact:** MEDIUM - Tests crash on import  
**Detection:** `npm run build` will show module resolution errors  
**Mitigation:** Install missing dependencies or rewrite tests

### EC4: Tests Break on CI/CD

**Scenario:** Tests work locally but fail in CI (different environment)  
**Likelihood:** MEDIUM (tests use filesystem, temp directories)  
**Impact:** HIGH - Blocks deployment  
**Detection:** Run tests in clean environment  
**Mitigation:** Ensure tests clean up temp files, don't rely on local state

### EC5: Tests Are Flaky

**Scenario:** Tests pass sometimes, fail other times (race conditions, timing)  
**Likelihood:** LOW (no async race conditions visible in code)  
**Impact:** MEDIUM - Erodes trust in tests  
**Detection:** Run tests 10 times in a row  
**Mitigation:** Fix timing issues, use deterministic inputs

### EC6: Tests Don't Cover Real Edge Cases

**Scenario:** Tests only check happy path, miss error conditions  
**Likelihood:** MEDIUM (common in rushed test writing)  
**Impact:** MEDIUM - Bugs slip through  
**Detection:** Review test coverage against UNIVERSAL_TEST_STANDARDS.md  
**Mitigation:** Add tests for error handling, edge cases

### EC7: Tests Are Too Slow

**Scenario:** Tests take minutes to run (blocks development flow)  
**Likelihood:** LOW (direct Node scripts, not integration tests)  
**Impact:** LOW - Developers skip running tests  
**Detection:** Time test execution  
**Mitigation:** Optimize slow tests, mock external dependencies

### EC8: Git Commit Fails

**Scenario:** Pre-commit hooks block commit of test files  
**Likelihood:** MEDIUM (ProcessCritic may flag issues)  
**Impact:** HIGH - Cannot complete remediation  
**Detection:** Attempt `git commit`  
**Mitigation:** Fix issues raised by hooks, ensure PLAN references are correct

### EC9: Build Fails After Adding Tests

**Scenario:** TypeScript compilation errors in test files  
**Likelihood:** MEDIUM (tests use .js imports, may have type issues)  
**Impact:** HIGH - Blocks all development  
**Detection:** `npm run build`  
**Mitigation:** Fix TypeScript errors, add proper type imports

### EC10: Tests Conflict with Existing Tests

**Scenario:** Test filenames collide with existing test suite  
**Likelihood:** LOW (checked - no existing test files in those locations)  
**Impact:** MEDIUM - Test runner confusion  
**Detection:** `npm test` shows duplicate tests  
**Mitigation:** Rename files if needed

## Failure Modes

### FM1: Infinite Loop in Test Execution

**Cause:** Test creates infinite recursion or loop  
**Impact:** CRITICAL - Hangs CI, wastes resources  
**Detection:** Tests never complete, high CPU usage  
**Recovery:** Kill process, add timeouts to tests

### FM2: Test Creates Zombie Processes

**Cause:** Test spawns child process but doesn't wait for exit  
**Impact:** HIGH - Resource leak  
**Detection:** `ps aux` shows orphaned processes  
**Recovery:** Add proper cleanup in test afterEach/afterAll

### FM3: Test Fills Disk

**Cause:** Test creates temp files but doesn't clean up  
**Impact:** HIGH - Disk full error  
**Detection:** Disk usage increases during test runs  
**Recovery:** Add cleanup logic, use temp directories with auto-delete

### FM4: Test Leaks Memory

**Cause:** Test holds references to large objects, prevents GC  
**Impact:** MEDIUM - Eventually crashes  
**Detection:** Monitor memory during test runs  
**Recovery:** Ensure proper cleanup, null out references

### FM5: Test Modifies Production State

**Cause:** Test writes to wrong directory (not temp)  
**Impact:** CRITICAL - Data corruption  
**Detection:** Check file writes during test  
**Recovery:** Sandbox tests, use mock filesystem

### FM6: False Positive (Test Passes When It Should Fail)

**Cause:** Test doesn't actually check implementation, just mocks  
**Impact:** HIGH - Gives false confidence  
**Detection:** Break implementation, verify test fails  
**Recovery:** Rewrite test to check real behavior

### FM7: False Negative (Test Fails When It Should Pass)

**Cause:** Test has incorrect expectations, too strict assertions  
**Impact:** MEDIUM - Blocks valid changes  
**Detection:** Review test logic, check if assertion makes sense  
**Recovery:** Fix test assertion

### FM8: Test Suite Never Gets Run

**Cause:** Not integrated into CI, developers forget to run  
**Impact:** HIGH - Tests become obsolete  
**Detection:** Check last test run timestamp  
**Recovery:** Add to pre-commit hooks, CI pipeline

### FM9: Test Files Get Deleted

**Cause:** Cleanup script, refactoring removes tests  
**Impact:** HIGH - Lose test coverage  
**Detection:** ProcessCritic should catch missing PLAN-referenced tests  
**Recovery:** Restore from git history

### FM10: Tests Become Maintenance Burden

**Cause:** Tests are too brittle, break on every change  
**Impact:** MEDIUM - Developers disable tests  
**Detection:** High rate of test modifications  
**Recovery:** Refactor tests to be more resilient

## Assumptions

### A1: Node.js is installed and ≥18

**If wrong:** Syntax errors, tests won't run  
**Likelihood:** LOW (already running other Node code)  
**Impact:** CRITICAL  
**Verification:** `node --version`

### A2: ripgrep is installed

**If wrong:** SignalScanner tests will fail  
**Likelihood:** MEDIUM (system dependency)  
**Impact:** HIGH (can't test scanner)  
**Verification:** `which rg`

### A3: Filesystem is writable

**If wrong:** Tests can't create temp directories  
**Likelihood:** LOW  
**Impact:** HIGH  
**Verification:** `mktemp -d`

### A4: Tests run in isolation

**If wrong:** Tests interfere with each other  
**Likelihood:** LOW (each creates own temp dir)  
**Impact:** MEDIUM  
**Verification:** Run tests in parallel

### A5: Git hooks are configured

**If wrong:** Pre-commit checks won't run  
**Likelihood:** LOW (hooks already working)  
**Impact:** MEDIUM  
**Verification:** Check `.git/hooks/pre-commit`

## Complexity Analysis

### Essential Complexity

**What complexity is REQUIRED?**
- Tests must actually execute implementation code
- Tests must verify observable behavior (file I/O, signals, state)
- Tests must handle cleanup (temp directories)

**Estimate:** ~250 LOC for 3 test files is reasonable for comprehensive coverage

### Accidental Complexity

**What complexity can we REMOVE?**
- ❌ Don't use external test frameworks (Vitest) - tests are direct Node scripts ✅
- ❌ Don't mock everything - use real filesystem with temp directories ✅
- ❌ Don't over-engineer test harness - simple functions work ✅

**Current approach is already minimal complexity.**

## Mitigation Strategies

### Prevention

1. **Code Review:** Manual review of test files before IMPLEMENT
2. **Build Check:** Run `npm run build` to catch TypeScript errors
3. **Dry Run:** Execute tests before committing
4. **Cleanup Check:** Verify temp directories are deleted after tests

### Detection

1. **Test Execution:** Run `node tools/wvo_mcp/src/nervous/test_scanner.ts`
2. **Resource Monitor:** Check `ps aux` and `df -h` during test runs
3. **Repeat Runs:** Execute tests 5 times to detect flakiness
4. **Break Test:** Modify implementation to verify test actually fails

### Recovery

1. **Git Revert:** If tests break build, revert commit
2. **Hot Fix:** Quick patch for critical issues
3. **Escalation:** If tests fundamentally flawed, restart PLAN phase

## Testing Strategy (Meta: Tests for Tests)

### How do we verify the TEST FILES work?

1. **Execution Test:** Run each test file with `node`
   - Expected: Exit code 0 (success) or clear error message

2. **Coverage Test:** Read test files, verify they cover:
   - Happy path ✅
   - Edge cases ✅
   - Error handling ✅
   - Resource limits ✅
   - Observable behavior ✅

3. **Failure Test:** Temporarily break implementation
   - Expected: Tests should FAIL (proves they actually test something)

4. **Resource Test:** Monitor during execution
   - CPU usage < 50%
   - Memory growth < 100MB
   - No zombie processes
   - Temp files cleaned up

## Paranoid Thinking (Worst Case)

### Worst Case Scenario #1: Tests Create Backdoor

**Scenario:** Malicious test file executes arbitrary code  
**Likelihood:** EXTREMELY LOW (we control test creation)  
**Impact:** CATASTROPHIC  
**Prevention:** Code review, no external code execution in tests

### Worst Case Scenario #2: Tests Corrupt Git Repository

**Scenario:** Test modifies .git directory, corrupts history  
**Likelihood:** EXTREMELY LOW (tests use temp directories)  
**Impact:** CATASTROPHIC  
**Prevention:** Tests must not write outside temp directories

### Worst Case Scenario #3: Tests Leak Secrets

**Scenario:** Test logs sensitive data (API keys, tokens)  
**Likelihood:** LOW (no secrets in autopilot V2 code)  
**Impact:** HIGH  
**Prevention:** Grep test files for sensitive patterns

## Decision Points

### DP1: Should we convert tests to Vitest?

**Options:**
- A) Keep as direct Node scripts
- B) Convert to Vitest framework

**Analysis:**
- A) Pros: Already working, simpler, no framework overhead
- A) Cons: Not integrated with existing test suite
- B) Pros: Consistent with codebase, better mocking
- B) Cons: More work, adds complexity

**Decision:** Keep as Node scripts (A) - **Via Negativa principle**

### DP2: Should we run tests in CI?

**Options:**
- A) Add to CI pipeline
- B) Local-only tests

**Analysis:**
- A) Pros: Catches regressions automatically
- A) Cons: Increases CI time
- B) Pros: Faster development
- B) Cons: Tests get forgotten

**Decision:** Add to CI (A) - **Quality over speed**

## Time Estimates

- **THINK Phase (current):** 30 min ✅
- **GATE Phase:** 20 min
- **IMPLEMENT Phase:** 30 min (run tests, fix errors)
- **VERIFY Phase:** 30 min (full validation)

**Remaining:** ~1.5 hours

## Conclusion

The test files appear well-structured. Main risks are:
1. **TypeScript compilation errors** (MEDIUM likelihood)
2. **Missing ripgrep dependency** (MEDIUM likelihood)
3. **Tests don't actually test** (LOW likelihood, code looks good)

All risks are manageable. Proceeding to GATE phase.
