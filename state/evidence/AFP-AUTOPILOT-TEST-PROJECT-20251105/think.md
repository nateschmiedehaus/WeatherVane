# THINK Phase: TaskFlow CLI - Edge Cases and Failure Modes

**Task ID:** AFP-AUTOPILOT-TEST-PROJECT-20251105
**Date:** 2025-11-05
**Phase:** THINK
**Depends On:** plan.md (9 files, 315 LOC design complete)

---

## EDGE CASES

### Edge Case 1: Empty Task Description

**Scenario:** User runs `taskflow add ""`

**Expected Behavior:**
- Error message: "Error: Please provide a task description"
- Exit code 1
- No task created

**Current Design:** index.ts checks `if (!description)` ✅

**Risk:** Low - Handled in plan

---

### Edge Case 2: Non-Existent Task ID

**Scenario:** User runs `taskflow done 999` (ID doesn't exist)

**Expected Behavior:**
- Error message: "Error: Task #999 not found"
- Exit code 1
- No changes to task list

**Current Design:** taskManager.ts throws error if `!task` ✅

**Risk:** Low - Handled in plan

---

### Edge Case 3: .taskflow.json Corrupted

**Scenario:** User manually edits .taskflow.json, breaks JSON syntax

**Expected Behavior:**
- `JSON.parse()` throws error
- Error message: "Error: Failed to parse .taskflow.json"
- Suggest: "File may be corrupted, consider deleting and re-initializing"

**Current Design:** ❌ NOT HANDLED - loadTasks() doesn't catch parse errors

**Impact:** Medium (user sees cryptic JSON error)
**Mitigation:** Add try-catch in fileStorage.ts loadTasks()

---

### Edge Case 4: .taskflow.json Missing After Init

**Scenario:** User runs `init`, then deletes file, then runs `list`

**Expected Behavior:**
- Error: ".taskflow.json not found. Run 'taskflow init' first."
- Exit code 1

**Current Design:** storageExists() check before loadTasks() ✅

**Risk:** Low - Handled in plan

---

### Edge Case 5: Running Commands in Wrong Directory

**Scenario:** User runs `taskflow list` in directory without .taskflow.json

**Expected Behavior:**
- Error: ".taskflow.json not found in [directory]"
- Suggestion: "Run 'taskflow init' first or navigate to a TaskFlow directory"

**Current Design:** Checks current directory only ✅

**Risk:** Low - Expected behavior (project-local, not global)

---

### Edge Case 6: Duplicate Task IDs

**Scenario:** Manual .taskflow.json edit creates duplicate IDs

**Expected Behavior:**
- System should handle gracefully (use ID as unique key)
- Worst case: Both tasks affected by done/remove commands

**Current Design:** ❌ NOT EXPLICITLY HANDLED

**Impact:** Low (requires manual file edit to trigger)
**Mitigation:** Accept risk (edge case requires intentional corruption)

---

### Edge Case 7: Very Long Task Descriptions

**Scenario:** `taskflow add "[500 character description]"`

**Expected Behavior:**
- Task created successfully
- Output may wrap lines (terminal-dependent)

**Current Design:** No length limit ✅ (acceptable)

**Risk:** Low - Terminal handles wrapping

---

### Edge Case 8: Special Characters in Descriptions

**Scenario:** `taskflow add "Buy "groceries" and 'milk'"`

**Expected Behavior:**
- Task created with description: `Buy "groceries" and 'milk'`
- JSON escapes quotes properly

**Current Design:** JSON.stringify handles escaping ✅

**Risk:** Low - Built-in JSON handling

---

### Edge Case 9: Status Filter Typo

**Scenario:** `taskflow list --status pendin` (typo)

**Expected Behavior:**
- Shows all tasks (invalid filter ignored)
- OR: Error message "Invalid status. Use 'pending' or 'done'"

**Current Design:** ❌ NOT VALIDATED - passes invalid string to filter

**Impact:** Low (TypeScript types help, but runtime not enforced)
**Mitigation:** Add validation in index.ts

---

### Edge Case 10: Concurrent Writes

**Scenario:** Two terminals run `taskflow add` simultaneously

**Expected Behavior:**
- Race condition - one write may overwrite the other
- Data loss possible

**Current Design:** ❌ NO LOCKING - fs.writeFileSync is not atomic

**Impact:** Low (unlikely scenario, test project only)
**Mitigation:** Accept risk for Wave 0 (add locking in Wave 1 if needed)

---

## FAILURE MODES

### Failure Mode 1: Wave 0 Generates Invalid TypeScript

**Description:** Code compiles but has logical errors

**Root Cause:**
- Wave 0 writes syntactically correct but semantically wrong code
- Example: `task.status = 'complete'` instead of `'done'`

**Impact:** HIGH (tool doesn't work as expected)
**Likelihood:** Medium (Wave 0 is minimal, may make mistakes)

**Detection:**
- Build passes but manual testing reveals bugs
- Commands fail or behave incorrectly

**Mitigation:**
- Manual testing after each Wave 0 task completion
- Document as failure mode
- Fix issues and re-test

**Prevention (Wave 1):**
- Add automated tests to task requirements
- Wave 0 must write AND test code

---

### Failure Mode 2: Wave 0 Skips VERIFY Phase

**Description:** Wave 0 marks task complete without verifying it works

**Root Cause:**
- Current Wave 0 may not execute build/test in VERIFY
- Just marks task as done without validation

**Impact:** HIGH (tasks marked complete but broken)
**Likelihood:** Medium (depends on Wave 0 implementation)

**Detection:**
- Roadmap shows tasks "done" but code doesn't work
- Manual testing reveals issues

**Mitigation:**
- Mandate VERIFY phase includes `npm run build`
- Screen recording shows Wave 0 actually running verification

**Prevention:**
- Enhance Wave 0 VERIFY phase enforcement
- Pre-commit hooks block commits without verification evidence

---

### Failure Mode 3: Dependency Hell

**Description:** npm install fails due to package conflicts

**Root Cause:**
- chalk version incompatibility
- Node.js version mismatch

**Impact:** MEDIUM (build fails, can't run tool)
**Likelihood:** Low (using standard packages)

**Detection:**
- `npm install` fails with error messages
- Build fails due to missing dependencies

**Mitigation:**
- Use fixed versions in package.json (not ^)
- Test on multiple Node versions if needed
- Document required Node version in README

**Prevention:**
- Pin exact versions: `"chalk": "4.1.2"` (not `^4.1.2`)

---

### Failure Mode 4: File Permissions Issue

**Description:** Can't write .taskflow.json (permissions denied)

**Root Cause:**
- Running in read-only directory
- Insufficient permissions

**Impact:** MEDIUM (init fails, can't use tool)
**Likelihood:** Low (user control)

**Detection:**
- Error: "EACCES: permission denied"

**Mitigation:**
- Clear error message suggesting to check permissions
- User fixes permissions or runs in different directory

**Prevention:**
- Document in README: "Ensure you have write permissions in the directory"

---

### Failure Mode 5: Task Status Drift

**Description:** Roadmap.yaml says task "done" but code doesn't exist

**Root Cause:**
- Wave 0 crashes mid-task
- Updates roadmap but doesn't complete file write

**Impact:** MEDIUM (manual intervention needed)
**Likelihood:** Low (Wave 0 should be transactional)

**Detection:**
- Roadmap says "done" but files missing
- Manual inspection reveals gap

**Mitigation:**
- Wave 0 should update roadmap AFTER successful completion
- Rollback on failure

**Prevention:**
- Enhance Wave 0 transactional behavior
- State updates atomic with file operations

---

### Failure Mode 6: TaskFlow CLI Works but Usability Poor

**Description:** Commands work but UX is terrible

**Examples:**
- No color in output (forgot chalk import)
- Confusing error messages
- Help text incomplete

**Impact:** LOW (functional but not user-friendly)
**Likelihood:** Medium (Wave 0 may skip polish)

**Detection:**
- Manual usage testing
- "It works but feels clunky"

**Mitigation:**
- Accept for Wave 0 (functionality > UX)
- Document as "polish needed"
- Improve in Wave 1

---

### Failure Mode 7: Roadmap Task Dependencies Broken

**Description:** TASKFLOW-005 marked done but TASKFLOW-004 (dependency) failed

**Root Cause:**
- Wave 0 doesn't check dependencies properly
- Proceeds despite blockers

**Impact:** HIGH (builds fail due to missing foundations)
**Likelihood:** Medium (depends on Wave 0 dependency handling)

**Detection:**
- Build fails with "module not found" errors
- Later tasks fail because earlier tasks incomplete

**Mitigation:**
- Manual check: Ensure dependencies completed before proceeding
- Fix broken dependencies immediately

**Prevention:**
- Enhance Wave 0 dependency checking
- Block task execution if dependencies not "done"

---

### Failure Mode 8: Success Rate Calculation Wrong

**Description:** Claim 80% success but only 6/10 tasks truly work

**Root Cause:**
- Counting tasks marked "done" but not verified functional
- Build passing used as proxy for "done"

**Impact:** HIGH (false confidence)
**Likelihood:** Medium (if "done" ≠ "working")

**Detection:**
- Manual end-to-end testing reveals issues
- Commands crash despite tasks marked complete

**Mitigation:**
- Verification: Actually run ALL 10 commands
- Success = command works, not just marked done

**Prevention:**
- Live-fire validation MUST include end-to-end testing
- Screen recording shows commands actually working

---

## COMPLEXITY ANALYSIS

### Cyclomatic Complexity: LOW

**Factors:**
- Linear command flow (switch statement)
- Simple CRUD operations
- No complex algorithms or nested logic

**Complexity Score:** 3/10

**Justification:**
- Most functions are straightforward (load, save, format)
- CLI parsing is linear (command → function call)
- No recursion, minimal conditionals

---

### Cognitive Complexity: LOW

**Factors:**
- Clear separation of concerns (storage, formatting, logic)
- Obvious file structure (each file has single purpose)
- Standard patterns (CLI tools, JSON storage)

**Complexity Score:** 4/10

**Justification:**
- Easy to understand what each file does
- Minimal abstractions
- Familiar patterns (CLI, CRUD)

---

### Maintenance Complexity: LOW

**Factors:**
- Small codebase (~315 LOC)
- No external services (pure local files)
- Minimal dependencies (just chalk)

**Maintenance Burden:**
- Adding new commands: ~10-20 LOC per command
- Changing storage format: Only fileStorage.ts affected
- Updating UI: Only formatter.ts affected

**Complexity Score:** 2/10

**Justification:**
- Very maintainable
- Clear boundaries
- Easy to extend

---

## WHAT CAN GO WRONG?

### Scenario 1: Wave 0 Can't Create Project Structure

**Trigger:** TASKFLOW-001 (first task) fails

**Impact:** CATASTROPHIC (all subsequent tasks blocked)

**Symptoms:**
- Folders not created
- Files missing
- Wave 0 stuck on TASKFLOW-001

**Probability:** MEDIUM

**Root Cause:**
- Wave 0 may not know how to create folders
- File write operations fail
- Unclear task description

**Recovery:**
1. Manual intervention: Create structure manually
2. Start Wave 0 at TASKFLOW-002
3. Document as "Wave 0 gap: project scaffolding"

---

### Scenario 2: TypeScript Compilation Never Succeeds

**Trigger:** Wave 0 generates code with syntax errors

**Impact:** HIGH (no working tool)

**Symptoms:**
- `npm run build` always fails
- TypeScript errors in console
- dist/ folder never created

**Probability:** MEDIUM

**Root Cause:**
- Wave 0 writes invalid TypeScript
- Missing imports
- Type errors

**Recovery:**
1. Manual code review
2. Fix syntax errors
3. Re-run build
4. Document specific errors for Wave 1 improvement

---

### Scenario 3: Wave 0 Gives Up After 3 Failures

**Trigger:** TASKFLOW-004, 005, 006 all fail

**Impact:** MEDIUM (incomplete validation, but learnings captured)

**Symptoms:**
- Wave 0 stops attempting tasks
- Roadmap shows 3 "done", 3 "failed", 4 "pending"
- Success rate 30%

**Probability:** LOW-MEDIUM

**Root Cause:**
- Wave 0 hits capability limit
- Task complexity exceeds Wave 0 abilities
- Errors cascade (one failure causes subsequent failures)

**Recovery:**
- Accept this outcome (it's a learning)
- Success rate < 80% means Wave 1 needs significant improvement
- Document ALL failure modes for Wave 1 scope

---

### Scenario 4: TaskFlow Works But Wave 0 Can't Self-Verify

**Trigger:** Code works but Wave 0 doesn't know how to test it

**Impact:** MEDIUM (functionality exists but not validated)

**Symptoms:**
- Manual testing: TaskFlow commands work ✅
- Wave 0 logs: Tasks marked "done" without verification
- No evidence of Wave 0 running commands

**Probability:** MEDIUM

**Root Cause:**
- Wave 0 VERIFY phase insufficient
- Doesn't know to run `npm start init`, `npm start add`, etc.

**Recovery:**
- Manual end-to-end testing demonstrates functionality
- Document as "Wave 0 verification gap"
- Enhance Wave 1 with explicit verification steps

---

### Scenario 5: Human Intervention Needed Every Step

**Trigger:** Wave 0 constantly asks for help or gets stuck

**Impact:** HIGH (defeats purpose of autopilot)

**Symptoms:**
- Wave 0 pauses frequently
- Requires human to unblock
- "Functioning autopilot" claim is false

**Probability:** LOW (but possible)

**Root Cause:**
- Wave 0 too minimal
- Tasks too ambiguous
- Lack of context or knowledge

**Recovery:**
- If > 50% tasks need intervention → Wave 0 not ready
- Abort validation, go back to Wave 0 improvements
- Re-attempt TaskFlow validation after Wave 0 fixes

---

## MITIGATION STRATEGIES

### Strategy 1: Manual Checkpoints Every 2 Tasks

**Action:** After TASKFLOW-002, 004, 006, 008, 010:
- Manually check code quality
- Run build
- Test working features
- Catch issues early

**Cost:** Medium (time to manually check)
**Benefit:** High (prevents cascading failures)

---

### Strategy 2: Screen Recording of Full Run

**Action:** Record entire Wave 0 execution from start to finish

**Evidence:**
- Video shows Wave 0 selecting tasks
- Writing code
- Updating roadmap
- (If working) Shows commands being tested

**Cost:** Low (just recording)
**Benefit:** HIGH (undeniable proof of live-fire execution)

---

### Strategy 3: Fallback to Manual Completion

**Action:** If Wave 0 fails > 3 tasks, manually complete remainder

**Rationale:**
- Goal is to LEARN Wave 0 capabilities, not prove perfection
- Partial completion still valuable
- Document where Wave 0 failed

**Cost:** Medium (manual work)
**Benefit:** Medium (still get TaskFlow tool, still learn limits)

---

### Strategy 4: Iterative Validation

**Action:** Don't wait for all 10 tasks
- After TASKFLOW-005, pause and test
- If working: Continue
- If broken: Fix and continue

**Cost:** Low (built into process)
**Benefit:** HIGH (catch issues early)

---

## COMPLEXITY JUSTIFICATION

### Why 10 Tasks?

**Question:** Could we do fewer tasks (5 tasks instead of 10)?

**Analysis:**
- 5 tasks = Only basic features (init, add, list, done, help)
- Missing: remove, filter, stats, colors
- Success rate less meaningful (4/5 = 80% but limited proof)

**Answer:** 10 tasks provide:
- Range of complexity (trivial → moderate)
- Enough data points for meaningful success rate
- Comprehensive feature set

**Verdict:** 10 tasks is RIGHT-SIZED

---

### Why TypeScript?

**Question:** Could we use plain JavaScript (simpler)?

**Analysis:**
- JavaScript: Easier for Wave 0 (no types)
- TypeScript: Proves Wave 0 can handle real complexity

**Answer:** TypeScript is intentionally chosen to:
- Match WeatherVane stack
- Test Wave 0 on realistic complexity
- Prove autopilot capability (not just toys)

**Verdict:** TypeScript is JUSTIFIED

---

## RISK PRIORITIZATION

### Critical Risks (Must Prevent)

1. **Wave 0 can't create project structure** (TASKFLOW-001)
   - Mitigation: Manual fallback, document gap
   - Impact: CATASTROPHIC

2. **Verification not executed** (Wave 0 marks done without testing)
   - Mitigation: Manual verification, screen recording
   - Impact: HIGH (false confidence)

### Important Risks (Should Prevent)

3. **TypeScript compilation failures** (code doesn't build)
   - Mitigation: Manual checkpoints every 2 tasks
   - Impact: HIGH

4. **Task dependencies broken** (later tasks fail due to earlier gaps)
   - Mitigation: Dependency checking, manual inspection
   - Impact: MEDIUM

### Minor Risks (Accept)

5. **UX polish missing** (works but not pretty)
   - Mitigation: Accept for Wave 0, improve later
   - Impact: LOW

6. **Edge cases unhandled** (corrupted JSON, etc.)
   - Mitigation: Accept, document, fix in Wave 1
   - Impact: LOW

---

## DEFINITION OF DONE (THINK PHASE)

- [x] All edge cases identified and analyzed (10 cases)
- [x] All failure modes documented with mitigations (8 modes)
- [x] Complexity analysis complete (low complexity overall)
- [x] "What can go wrong?" scenarios explored (5 catastrophic scenarios)
- [x] Mitigation strategies defined (4 strategies)
- [x] Complexity justified (10 tasks, TypeScript)
- [x] Critical risks prioritized (5 risks categorized)
- [x] Recovery plans for catastrophic failures

**THINK Phase Complete**
**Next Phase:** GATE (design.md - AFP/SCAS analysis and approval)
**Risk Level:** MEDIUM (manageable with mitigations)
**Recommendation:** PROCEED TO GATE
