# Complete Finish Policy — NO FOLLOW-UPS

## 🚨 CRITICAL: ALWAYS FINISH TASKS COMPLETELY - NO FOLLOW-UPS

**Policy:** When you start a task, you MUST finish it completely in the current session. **NO exceptions.**

---

## The 7 Rules

### 1. No partial completion
Don't stop at "functionally complete" or "mostly done". If you can't complete all acceptance criteria, you shouldn't have started the task.

### 2. No "follow-up sessions"
If you start SPEC, you finish MONITOR. The complete protocol must be executed in one session.

### 3. No deferring fixes
If REVIEW finds issues, fix them NOW. Don't say "I'll fix this later" or "This can wait for a follow-up".

### 4. All acceptance criteria met
Check EVERY criterion in your SPEC before claiming done. Missing even one criterion = task incomplete.

### 5. Build must pass
0 errors, 0 warnings. If the build fails, the task is not done.

### 6. All tests pass
No skipped tests, no disabled tests, no "TODO: write test". All tests green = requirement for done.

### 7. Documentation complete
Not "will document later". Docs, README updates, inline comments - all done before claiming task complete.

---

## If You Can't Finish in Current Session

**You shouldn't have started the task.**

### Recovery options:
- **Token budget too low?** Stop at previous task. Don't start new tasks when budget is insufficient.
- **Task too large?** Break it down in PLAN stage BEFORE starting implementation.
- **Unexpected complexity?** ESCALATE with summary of attempts and blockers.

---

## Violation Examples

### ❌ WRONG:
- "Runners created, StateGraph refactoring is a follow-up"
- "Tests pass but build has errors - will fix later"
- "Core complete, documentation is follow-up"
- "Implemented feature, integration tests are next session"
- "90% done, just need to add error handling"

### ✅ CORRECT:
- "Complete ALL work before moving to next task"
- "Found gap in REVIEW → loop back to IMPLEMENT → fix → re-verify → re-review"
- "Task too large → break down into subtasks → complete each fully"
- "Insufficient budget → STOP before starting, not in the middle"

---

## Why This Policy Exists

### Problems with follow-up sessions:
1. **Context loss:** Next session loses nuance, forgets edge cases
2. **Compounding debt:** "Will fix later" becomes "never fixed"
3. **Integration issues:** Partial work breaks when other work lands
4. **Accountability gaps:** Unclear who owns incomplete work
5. **Velocity illusion:** Looks productive but nothing ships

### Benefits of complete finish:
1. **Shippable increments:** Every task is production-ready
2. **Clear accountability:** One owner, one session, one outcome
3. **True velocity:** Measure completions, not "mostly done"
4. **Reduced rework:** No "fix the gaps from last session"
5. **Quality enforcement:** Can't skip verification steps

---

## Integration with Protocol Stages

### During SPEC:
- **Before starting:** Verify you can complete in current session
- **Estimate time:** If estimate > session budget, break down task

### During PLAN:
- **Check subtasks:** Each subtask should be completable in one go
- **If task too large:** Split into multiple independent tasks

### During IMPLEMENT:
- **Concurrent docs:** Update docs as you code, not after
- **Concurrent tests:** Write tests for each function, not at the end

### During REVIEW:
- **All gaps fixed:** If gaps found → back to IMPLEMENT → fix ALL gaps
- **No deferral:** Can't proceed to PR with known issues

### During MONITOR:
- **Only done when monitoring passes:** Smoke tests must pass before claiming complete

---

## Escalation Protocol

**If you can't finish after starting:**

1. **STOP immediately** - Don't waste more tokens
2. **Document state:**
   - What's complete
   - What's incomplete
   - Blocking issues
3. **ESCALATE to user:**
   - Tag @user
   - Explain blocker
   - Propose: rollback OR split task OR get help
4. **Don't claim done:** Incomplete = not done

---

## Enforcement

### Automated checks:
- ✅ Build passes (0 errors)
- ✅ All tests pass (no skips, no disabled)
- ✅ Audit passes (0 high/critical vulnerabilities)
- ✅ Lint passes (0 errors in all scopes)

### Human verification (reviewer):
- Acceptance criteria checklist - all checked?
- Docs updated?
- No "TODO" in prod code?
- No gaps in implementation?

### Consequences of violation:
- PR rejected
- Task marked incomplete
- Must re-do verification loop

---

## This is Mandatory

**This policy applies to EVERY task in the Spec→Monitor protocol.**

No exceptions. No special cases. No "just this once."

**Complete finish or don't start.**
