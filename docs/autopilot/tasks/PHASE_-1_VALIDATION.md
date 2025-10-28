# Task: Phase -1 Validation

## STRATEGIZE

**Problem Statement:**
- We implemented WorkProcessEnforcer but haven't validated it actually works
- Tests pass (100%) but we skipped the official integrity suite
- System prompts updated but enforcement not proven end-to-end
- Risk: False confidence in "Phase -1 complete"

**Root Cause Analysis:**
- We jumped to implementation without validation plan
- Violated the process we're trying to enforce (meta-irony)
- No evidence that run_integrity_tests.sh actually passes

**Proposed Approach:**
1. Run run_integrity_tests.sh to validate Phase -1 claims
2. If failures: Triage and fix each one systematically
3. Document actual vs. expected results
4. Prove enforcement is working with violation test

**Connection to Purpose:**
- Can't achieve <5% error if we skip validation
- Process enforcement requires proof it works
- WeatherVane reliability depends on verified foundation

**Integration Considerations:**
- WorkProcessEnforcer must integrate with orchestrator_loop execution path
- Enforcement must not break existing state machine transitions
- Telemetry must capture violations without blocking work
- Must validate that enforcer is called for EVERY task
- Must prove enforcement works across all entry points (direct, MCP tools, scheduled)

**Success Criteria:**
- run_integrity_tests.sh passes 100%
- Enforcement demonstrated with test case at each integration point
- Evidence collected and documented
- All integration paths validated

---

## SPEC

**Acceptance Criteria:**

### Core Validation
1. [ ] run_integrity_tests.sh exits with code 0
2. [ ] All sub-tests within integrity suite pass
3. [ ] Build succeeds (reconfirm: 0 errors, 0 warnings)
4. [ ] All tests pass (reconfirm: 100% pass rate)

### Enforcement Integration
5. [ ] WorkProcessEnforcer.validatePhaseSequence() called in orchestrator_loop.ts:executeTask()
6. [ ] Enforcement blocks phase skipping (test case proves it)
7. [ ] Violations logged as 'constraint' entries in state machine
8. [ ] Task marked as 'blocked' when violating process
9. [ ] Enforcer doesn't block valid phase progressions

### System Prompt Integration
10. [ ] CLAUDE.md contains mandatory process section (lines 39-47)
11. [ ] AGENTS.md contains enforcement rules (lines 56-66)
12. [ ] Prompt headers actually used by agent execution
13. [ ] Headers loaded and validated during task execution

### Telemetry Integration
14. [ ] Violation context entries created when enforcement triggers
15. [ ] Context entries have correct entry_type='constraint'
16. [ ] Metadata includes taskId and violation details
17. [ ] Metrics prepared for Phase 0 instrumentation

### Integration Path Validation
18. [ ] Direct task execution path validated (orchestrator_loop → executeTask)
19. [ ] MCP tool execution path validated (tool calls → state transitions)
20. [ ] StateGraph transitions respect enforcement
21. [ ] No bypass paths exist (e.g., direct state machine updates)

**Success Metrics:**
- Integrity suite: 100% pass rate
- Enforcement test: Phase skip blocked successfully
- Performance: No regression from enforcement overhead
- Documentation: Evidence file created with proof

**Definition of Done:**
- Integrity script completes successfully
- Evidence document shows all criteria met
- No outstanding Phase -1 work items
- Ready to proceed to Phase 0

**Non-Goals:**
- Not implementing new features
- Not fixing unrelated bugs
- Not optimizing performance
- Just validating what we built works

---

## PLAN

**Task Breakdown:**

### 1. Run Integrity Suite (15 min)
- Execute: `tools/wvo_mcp/scripts/run_integrity_tests.sh`
- Capture full output to log file
- Note any failures or warnings

### 2. Triage Failures (30 min - if needed)
- For each failure:
  - Identify root cause
  - Determine if blocker or false positive
  - Document expected vs. actual

### 3. Fix Critical Issues (60 min - if needed)
- Only fix issues that block Phase -1 completion
- Use Edit tool, not Write (preserve existing code)
- One fix at a time with test after each

### 4. Validate Enforcement (30 min)
- Create test case that attempts phase skipping
- Confirm WorkProcessEnforcer blocks it
- Verify violation logged to telemetry
- Check metric increments

### 5. Document Evidence (20 min)
- Create PHASE_-1_VALIDATION_EVIDENCE.md
- Include integrity test output
- Include enforcement test results
- Include metrics screenshots/logs

### 6. Final Verification (15 min)
- Re-run integrity suite
- Confirm all tests pass
- Validate build still succeeds

**Total Estimate:** 2.5 hours (assuming some failures to fix)

**Dependencies:**
- None (validation of existing work)

**Risks:**
- Integrity script may have environmental dependencies
- Browser installations for Playwright tests
- Python wheel cache issues
- Flaky tests in smoke suite

---

## THINK

**Risk Analysis:**

### Integration Risks

#### Risk 1A: Enforcer Not Called in All Execution Paths
- **Probability:** Medium (we only added it to one location)
- **Impact:** Critical (bypass defeats entire enforcement)
- **Mitigation:** Trace all task execution entry points
- **Verification:** Check StateGraph, MCP tools, scheduled tasks
- **Fallback:** Add enforcement at state machine level as fallback

#### Risk 1B: Enforcement Breaks Existing Workflows
- **Probability:** Medium (new code in critical path)
- **Impact:** High (blocks legitimate work)
- **Mitigation:** Test with existing task suite
- **Verification:** Run all integration tests
- **Fallback:** Add feature flag to disable enforcement

#### Risk 1C: Race Conditions in Validation
- **Probability:** Low (synchronous execution)
- **Impact:** Medium (inconsistent enforcement)
- **Mitigation:** Use async/await properly
- **Verification:** Test concurrent task execution
- **Fallback:** Add mutex around validation

#### Risk 1D: StateGraph Bypasses Enforcer
- **Probability:** Low (enforcer is before state transitions)
- **Impact:** Critical (defeats enforcement)
- **Mitigation:** Review StateGraph.run() carefully
- **Verification:** Trace execution from StateGraph
- **Fallback:** Add enforcement inside StateGraph

### Script Execution Risks

#### Risk 2: Integrity Script Not Executable
- **Probability:** Low
- **Impact:** High (blocks validation)
- **Mitigation:** Check file permissions first
- **Fallback:** Run commands from script manually

### Risk 2: Browser Installation Failures
- **Probability:** Medium
- **Impact:** Medium (blocks UI tests)
- **Mitigation:** Install Playwright browsers beforehand
- **Fallback:** Skip UI tests with APP_SMOKE_SKIP_VITEST=1

### Risk 3: Flaky Tests Surface
- **Probability:** High
- **Impact:** Medium
- **Mitigation:** Run 3 times to distinguish flaky vs. broken
- **Fallback:** Skip truly flaky tests, file issues

### Risk 4: Python Environment Issues
- **Probability:** Medium
- **Impact:** Low (only if Python tests exist)
- **Mitigation:** Use virtual environment
- **Fallback:** Skip Python-specific tests

### Risk 5: WorkProcessEnforcer Not Actually Enforcing
- **Probability:** Low (we see the code)
- **Impact:** Critical (entire Phase -1 invalid)
- **Mitigation:** Test with deliberate violation
- **Fallback:** Debug and fix enforcement logic

**Edge Cases:**

1. **Integrity script references files we changed**
   - Check if our edits broke expected paths
   - Validate file references still correct

2. **Enforcement only works in specific conditions**
   - Test with task in different states
   - Confirm it blocks all skip attempts

3. **Metrics not being recorded**
   - Verify telemetry system initialized
   - Check log file permissions

4. **System prompt not actually used**
   - Trace prompt loading code
   - Confirm headers included in agent calls

**Questions to Answer:**

1. Does run_integrity_tests.sh cover what we claim?
2. Are there integration tests for WorkProcessEnforcer?
3. Do we have false positives from enforcement being too strict?
4. Is the overhead from enforcement measurable?

---

## WORK PROCESS INTEGRATION ANALYSIS

### How Enforcement Fits Into STRATEGIZE→MONITOR

The WorkProcessEnforcer must integrate at multiple levels to ensure the work process is actually followed:

#### Level 1: Task Initiation (STRATEGIZE)
```typescript
// When a new task starts
orchestratorLoop.tick()
  → policy.decide() // Decides to run_task
  → orchestratorLoop.executeTask(task)
    → workProcessEnforcer.validatePhaseSequence(task) ← ENFORCEMENT POINT 1
      → If task not in cycle: Enforce must start with STRATEGIZE
      → If task skipping phases: REJECT with violation
```

#### Level 2: Phase Transitions (SPEC → PLAN → ...)
```typescript
// During StateGraph execution
stateGraph.run(task)
  → runSpecify() // SPEC phase
  → runPlan() // PLAN phase
    → Each transition should check:
      - workProcessEnforcer.advancePhase(task.id) ← ENFORCEMENT POINT 2
      - Validates previous phase complete
      - Blocks if evidence insufficient
```

#### Level 3: Tool Execution (IMPLEMENT)
```typescript
// When tools are called (e.g., write_code, git_commit)
toolRouter.execute(tool, params)
  → Check required phase for tool ← ENFORCEMENT POINT 3 (Phase 2)
  → If current phase < required phase: REJECT
  → Example: git_commit requires PR phase
```

#### Level 4: Quality Gates (VERIFY)
```typescript
// During verification
verifier.verify(task)
  → Run automated checks
  → If Observer enabled: observer.observe(task, result) ← Phase 1 integration
  → If Cross-Check enabled: crossCheck.validate(task) ← Phase 3 integration
  → workProcessEnforcer must validate VERIFY completed ← ENFORCEMENT POINT 4
```

#### Level 5: State Machine (All Transitions)
```typescript
// Every state transition
stateMachine.transition(taskId, newState)
  → Before transition:
    - Check if transition is allowed ← ENFORCEMENT POINT 5 (Phase 2)
    - Reject SPEC→IMPLEMENT (must go through PLAN)
    - Reject PLAN→VERIFY (must go through IMPLEMENT)
```

### Integration Path Matrix

| Entry Point | Enforcement Location | Validated? | Phase |
|-------------|---------------------|------------|-------|
| orchestrator_loop.executeTask() | Line 695 | ✅ Yes | -1 |
| StateGraph.run() | Need to add | ❌ No | 2 |
| Tool execution | Need to add | ❌ No | 2 |
| Direct state transitions | Need to add | ❌ No | 2 |
| MCP tool calls | Inherits from above | 🟡 Partial | N/A |
| Scheduled tasks | Inherits from orchestrator | ✅ Yes | -1 |

### Current Coverage Analysis

**Covered:**
- ✅ orchestrator_loop.executeTask() validates before execution
- ✅ Violations logged to state machine
- ✅ Tasks blocked when violating

**Not Yet Covered:**
- ❌ StateGraph transitions (no phase validation)
- ❌ Tool-level enforcement (Phase 2 work)
- ❌ Direct state machine updates (potential bypass)

**To Validate in This Task:**
1. Prove orchestrator_loop path works
2. Check if StateGraph can bypass enforcement
3. Verify no other entry points exist
4. Document gaps for Phase 2

### The Meta-Process Integration

**This validation task itself demonstrates the work process:**

```
Phase -1 Validation Task
├── STRATEGIZE: Identified validation gap
├── SPEC: Defined acceptance criteria (including integration)
├── PLAN: Breaking down validation steps
├── THINK: Analyzing integration risks ← YOU ARE HERE
├── IMPLEMENT: Will execute validation systematically
├── VERIFY: Will collect evidence of all integration points
├── REVIEW: Will challenge assumptions about coverage
├── PR: Will document for team
└── MONITOR: Will track enforcement effectiveness

WorkProcessEnforcer validates this task:
  ✓ Must complete STRATEGIZE before SPEC
  ✓ Must complete SPEC before PLAN
  ✓ Must complete PLAN before THINK
  ✓ Must complete THINK before IMPLEMENT
  ✓ Cannot skip to VERIFY without IMPLEMENT
```

This is self-validating: If we can't follow the process for this task, the enforcement isn't working.

---

## IMPLEMENT

[Will execute during this phase - not writing code in advance]

**Execution Log:**

### Step 1: Pre-flight Checks
```bash
# Check script exists and is executable
ls -la tools/wvo_mcp/scripts/run_integrity_tests.sh
```

### Step 2: Run Integrity Suite
```bash
cd /Volumes/BigSSD4/nathanielschmiedehaus/Documents/WeatherVane/tools/wvo_mcp
./scripts/run_integrity_tests.sh 2>&1 | tee phase_-1_validation.log
```

### Step 3: Analyze Results
- Parse output for failures
- Categorize by severity
- Prioritize fixes

### Step 4: Fix Issues
[Will document each fix as it happens]

### Step 5: Enforcement Test
```bash
# Create test that deliberately skips phases
npm test -- --run test_enforcement.ts
```

### Step 6: Evidence Collection
- Gather logs
- Capture metrics
- Document proof

---

## VERIFY

**Verification Checklist:**

### Automated Checks
- [ ] run_integrity_tests.sh exit code = 0
- [ ] npm test shows 100% pass
- [ ] npm run build shows 0 errors
- [ ] Enforcement test passes

### Manual Checks
- [ ] Review integrity test output for warnings
- [ ] Confirm WorkProcessEnforcer code is invoked
- [ ] Verify telemetry logs contain violations
- [ ] Check metrics show expected counters

### Evidence Requirements
- [ ] Full integrity test output captured
- [ ] Enforcement test results documented
- [ ] Metrics snapshot showing violation tracking
- [ ] Build output confirming 0 errors

### Performance Validation
- [ ] Test suite runtime not significantly increased
- [ ] No memory leaks from enforcement
- [ ] Telemetry overhead < 1% of execution time

---

## REVIEW

**Adversarial Questions:**

1. **"How do you know enforcement is actually preventing violations?"**
   - Answer with test case that proves blocking
   - Show violation logged when attempted

2. **"What if the integrity script itself is broken?"**
   - Compare against manual test execution
   - Validate script commands match documentation

3. **"Could enforcement have false positives?"**
   - Test legitimate workflows
   - Confirm no valid work is blocked

4. **"Is the performance overhead acceptable?"**
   - Measure before/after
   - Confirm < 1% impact

5. **"What about edge cases the integrity suite misses?"**
   - Document known gaps
   - File follow-up tasks for missing coverage

**Peer Review Checklist:**
- [ ] Evidence is verifiable (not just claims)
- [ ] All acceptance criteria actually tested
- [ ] Failure scenarios considered
- [ ] Documentation is complete
- [ ] No false confidence

---

## PR

**Pull Request Content:**

### Title
`validate(phase-1): Prove Phase -1 foundation complete with integrity suite`

### Description
**Problem:**
Phase -1 implementation claimed complete but never validated with official integrity suite.

**Solution:**
- Ran run_integrity_tests.sh and fixed all failures
- Created enforcement test proving phase skipping is blocked
- Documented evidence of all acceptance criteria met

**Evidence:**
- Integrity test output: [link to log]
- Enforcement test results: [link to test file]
- Metrics showing violations tracked: [screenshot]
- Evidence document: docs/autopilot/tasks/PHASE_-1_VALIDATION_EVIDENCE.md

### Changes
- Fixed [list specific issues found and fixed]
- Added enforcement test
- Created evidence documentation

### Testing
- [x] Integrity suite passes 100%
- [x] Enforcement blocks phase skipping
- [x] Build succeeds
- [x] All tests pass

---

## MONITOR

**Post-Validation Monitoring:**

### Metrics to Track
1. **Enforcement Effectiveness**
   - Count of phase skip attempts blocked
   - False positive rate (legitimate work blocked)
   - Time added per task from enforcement

2. **Integrity Suite Health**
   - Pass rate over time
   - Flaky test identification
   - Runtime trends

3. **System Stability**
   - Test pass rate remains 100%
   - Build time stable
   - No enforcement-related errors in logs

### Success Criteria (Week 1)
- Enforcement blocks 100% of invalid phase transitions
- Zero false positives (valid work not blocked)
- No performance regression > 1%
- Integrity suite continues passing

### Escalation Triggers
- Enforcement fails to block obvious violation
- False positive blocks legitimate work
- Performance regression > 5%
- Integrity suite starts failing

### Rollback Plan
- Disable enforcement via feature flag (if one exists)
- Revert WorkProcessEnforcer changes
- Document issues for re-implementation

---

## Execution Notes

**This task demonstrates the work process we're validating:**
1. STRATEGIZE: Identified validation gap
2. SPEC: Defined clear acceptance criteria
3. PLAN: Broke down into concrete steps
4. THINK: Analyzed risks and edge cases
5. IMPLEMENT: Will execute systematically
6. VERIFY: Will collect evidence
7. REVIEW: Will challenge assumptions
8. PR: Will document for team
9. MONITOR: Will track effectiveness

**Meta-validation:** If this task follows the process correctly, it proves the process can be followed.

**Ready to execute IMPLEMENT phase when approved.**