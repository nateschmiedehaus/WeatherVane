# Task: Phase -1 Remediation - Fix Toothless Enforcement

## STRATEGIZE

**Problem Statement:**

Phase -1 "validation" created an **illusion of completion** without actually implementing enforcement:

1. **validatePhaseSequence is a stub**: Never tracks phase state, always returns `valid: true` for pending tasks
2. **Nothing registers tasks**: No calls to `startPhase()` or `advancePhase()`, so phase map stays empty
3. **No violation metrics**: No counters increment when violations occur
4. **Prompt headers unchanged**: Still show old "Specify → Plan" instead of "STRATEGIZE→MONITOR"
5. **Tests test the wrong thing**: Unit tests verify the method exists, not that the SYSTEM works end-to-end

**Root Cause Analysis:**

I violated the work process while building the enforcer:
- **SPEC was too high-level**: "validatePhaseSequence() exists" ✅ but doesn't work
- **VERIFY tested method in isolation**: Never verified end-to-end enforcement
- **REVIEW missed the core flaw**: Never asked "Does anything actually CALL startPhase?"
- **Focused on documents, not functionality**: Created evidence of tests passing, not proof of enforcement working

**Proposed Approach:**

1. **Fix validatePhaseSequence**: Actually track and validate phase sequences
2. **Integrate with StateGraph**: Call startPhase/advancePhase during state transitions
3. **Add metrics**: Increment phase_skips_attempted counter
4. **Fix prompt headers**: Update to STRATEGIZE→MONITOR
5. **Verify end-to-end**: Trace actual task through system, prove blocking works

**Connection to Purpose:**

Can't achieve <5% error if enforcement doesn't actually work. This is the foundation - if it's fake, everything built on top is worthless.

**What "Done" Actually Means:**

NOT:
- ❌ Tests pass (they did, but enforcement doesn't work)
- ❌ Documents exist (they do, but describe a fantasy)
- ❌ Code compiles (it does, but doesn't enforce)

ACTUALLY:
- ✅ Run a REAL task through system
- ✅ Task attempts to skip STRATEGIZE
- ✅ Enforcer BLOCKS it (observable in logs)
- ✅ Metrics increment (visible in telemetry)
- ✅ Legitimate tasks PASS (no false positives)

---

## SPEC

**Acceptance Criteria:**

### Core Functionality (Must Work)
1. [ ] validatePhaseSequence actually checks phase progression (not just task status)
2. [ ] startPhase() called when task begins STRATEGIZE
3. [ ] advancePhase() called at each state transition
4. [ ] Violations trigger when phases skipped
5. [ ] phase_skips_attempted counter increments on violation
6. [ ] Legitimate phase progression allowed

### Integration Points (Must Connect)
7. [ ] StateGraph calls enforcer on transitions
8. [ ] orchestrator_loop registers new tasks with startPhase()
9. [ ] Telemetry receives violation events
10. [ ] Context entries created when violations occur

### System Validation (Must Prove)
11. [ ] END-TO-END TEST: Task skipping STRATEGIZE is BLOCKED (observable in logs)
12. [ ] END-TO-END TEST: Task following process is ALLOWED
13. [ ] END-TO-END TEST: Metrics show violation counter incremented
14. [ ] Prompt headers show STRATEGIZE→MONITOR

### Build Quality (Must Pass)
15. [ ] npm run build → 0 errors
16. [ ] npm test → 100% pass rate (or document why not)
17. [ ] run_integrity_tests.sh → exit code 0

**Definition of Done:**

Can trace a REAL task attempt through logs and prove:
1. Task started → startPhase('STRATEGIZE') called
2. Task tried to skip to IMPLEMENT → validation.valid = false
3. Task blocked → status = 'blocked'
4. Metric incremented → phase_skips_attempted += 1
5. Context entry created → entry_type = 'constraint'

**Non-Goals:**
- NOT fixing StateGraph bypass (Phase 2)
- NOT adding feature flags (Phase 2)
- NOT comprehensive testing (just prove core path works)

---

## PLAN

**Task Breakdown:**

### 1. Diagnose the Actual State (15 min)
- [ ] Read work_process_enforcer.ts line-by-line
- [ ] Identify what startPhase/advancePhase actually do
- [ ] Find where (if anywhere) they're called
- [ ] Check if metrics code exists

### 2. Fix validatePhaseSequence Logic (30 min)
- [ ] Remove stub that always returns valid=true
- [ ] Implement actual sequence validation
- [ ] Check: Does current phase allow advancing to next phase?
- [ ] Check: Is task trying to skip phases?

### 3. Integrate with Task Lifecycle (45 min)
- [ ] Add startPhase() call when task enters 'in_progress'
- [ ] Add advancePhase() calls at StateGraph transitions
- [ ] OR: Add phase tracking to orchestrator_loop
- [ ] Choose integration point based on code structure

### 4. Add Violation Metrics (20 min)
- [ ] Import telemetry/metrics system
- [ ] Increment phase_skips_attempted when validation fails
- [ ] Emit metric event with taskId, violation details

### 5. Fix Prompt Headers (10 min)
- [ ] Update tools/wvo_mcp/src/utils/prompt_headers.ts
- [ ] Replace "Specify → Plan" with "STRATEGIZE→MONITOR"
- [ ] Add failure clauses

### 6. End-to-End Verification (60 min)
- [ ] Create test task that deliberately violates process
- [ ] Run through actual orchestrator
- [ ] Trace logs to confirm blocking
- [ ] Check metrics to confirm counter increment
- [ ] Run legitimate task to confirm no false positive

### 7. Fix Any Remaining Test Failures (30 min)
- [ ] Re-run npm test
- [ ] Fix any broken tests
- [ ] Re-run run_integrity_tests.sh
- [ ] Document any remaining failures

**Total Estimate:** 3.5 hours

**Dependencies:**
- Must understand existing code structure first
- StateGraph integration may require refactoring

---

## THINK

**Risk Analysis:**

### Risk 1: StateGraph Doesn't Call Enforcer
- **Probability:** High
- **Impact:** Critical (enforcement never runs)
- **Mitigation:** Check StateGraph.run() code, add enforcer calls if missing
- **Verification:** Trace StateGraph execution in logs

### Risk 2: Breaking Existing Tasks
- **Probability:** Medium
- **Impact:** High (all tasks fail)
- **Mitigation:** Start with fail-open enforcement, test with dummy task first
- **Fallback:** Add WVO_DISABLE_WORK_PROCESS_ENFORCEMENT flag

### Risk 3: Metrics System Doesn't Exist
- **Probability:** Low (seen telemetry code)
- **Impact:** Medium (can't track violations)
- **Mitigation:** Find existing metrics patterns, follow them
- **Fallback:** Log to file for now, add metrics in Phase 0

### Risk 4: Can't Trace Through Logs
- **Probability:** Medium
- **Impact:** Medium (can't verify it works)
- **Mitigation:** Add explicit log statements at each enforcement point
- **Verification:** grep logs for enforcement messages

### Risk 5: Time Estimate Too Low
- **Probability:** High
- **Impact:** Medium (don't finish in one session)
- **Mitigation:** Focus on core path first, defer nice-to-haves
- **Fallback:** Complete enough to prove enforcement works, document remaining work

**Edge Cases:**

1. **Task already in progress when enforcer loads**
   - Can't retroactively enforce
   - Document as known limitation

2. **Concurrent task modifications**
   - Phase map might have race conditions
   - Use locks or accept eventual consistency

3. **Task restarts after failure**
   - Should enforcer remember previous phase?
   - Decision: Start fresh each time

**Questions to Answer:**

1. Where is the "right" place to call startPhase? (orchestrator_loop? StateGraph?)
2. What happens if advancePhase is called out of order?
3. Should enforcement be fail-open or fail-closed?
4. Can I prove end-to-end enforcement in this session?

---

## Meta-Analysis: Why Did This Happen?

**Process Failures in Phase -1 "Validation":**

1. **SPEC**: Acceptance criteria were "interface exists" not "system works"
2. **VERIFY**: Tested method in isolation, not end-to-end system
3. **REVIEW**: Asked "does method work?" not "does SYSTEM enforce?"
4. **Focus on documents**: Created evidence files instead of working code

**The Core Mistake:**

I validated that validatePhaseSequence() **can detect violations** when given specific inputs.
I never validated that the **system actually CALLS it** with those inputs.

**Learning:**

End-to-end verification means:
1. Create a real violation scenario
2. Trace it through the ACTUAL system
3. Observe the blocking in ACTUAL logs
4. Verify the ACTUAL metrics incremented

Not:
1. ❌ Write unit test that mocks everything
2. ❌ Test method in isolation
3. ❌ Assume integration works

---

## IMPLEMENT

[Will execute systematically]

---

## VERIFY

Checklist:
- [ ] Run REAL task through orchestrator
- [ ] grep logs for "workProcessEnforcer" messages
- [ ] Check metrics file for phase_skips_attempted
- [ ] Verify task actually blocked (not just logged)
- [ ] npm test passes
- [ ] run_integrity_tests.sh passes

---

## REVIEW

Adversarial Questions:
1. Can you trace a REAL task blocking in logs? (Not unit test, REAL logs)
2. Does the metric counter ACTUALLY increment? (Not mock, ACTUAL file)
3. What happens if StateGraph bypasses enforcer? (Is it actually integrated?)
4. Could tasks still slip through? (Any other entry points?)

---

## PR

[Will document ACTUAL enforcement working, not claimed]

---

## MONITOR

[Will track REAL violations, not test violations]

---

## Ready to Execute IMPLEMENT Phase

Should I proceed with fixing the enforcement to actually work?
