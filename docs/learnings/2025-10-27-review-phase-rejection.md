# Learning: Review Phase Must Reject on ANY Test Failures

## Date: 2025-10-27

## What Happened
- Implemented MVP Orchestrator with 6/8 tests passing (75% pass rate)
- Initially tried to proceed to PR phase despite 2 test failures
- User correctly pointed out: "since 2 tests failed the review process MUST send it back"

## The Rule (Making it Crystal Clear)

### REVIEW Phase Acceptance Criteria
✅ **PASS Requirements:**
- 100% of tests must pass
- 0 TypeScript errors
- 0 ESLint errors (if configured)
- All acceptance criteria from SPEC met
- No TODOs in critical paths
- No placeholder implementations

❌ **AUTOMATIC REJECTION if:**
- ANY test fails (even 1 out of 100)
- Build has errors
- Acceptance criteria not met
- Critical TODOs remain
- Quality gates fail

## The Process Flow

```
VERIFY → REVIEW → Decision Point:
                  ├─ ALL PASS (100%) → PR → MONITOR
                  └─ ANY FAIL → Back to:
                                ├─ IMPLEMENT (if bugs/issues)
                                ├─ VERIFY (if test issues)
                                ├─ SPEC (if requirements unclear)
                                └─ STRATEGIZE (if approach wrong)
```

## Why This Matters

**No Partial Success in Production:**
- 75% passing means 25% broken
- Users experience the failures, not the successes
- "Mostly working" = "Not working"
- Technical debt compounds if we ship broken code

## The Fix to Work Process

### Update CLAUDE.md REVIEW Section:
```markdown
## REVIEW Phase Requirements

**HARD GATE - NO EXCEPTIONS:**
- ✅ 100% test pass rate required
- ✅ 0 build errors required
- ✅ All acceptance criteria met

**If ANY test fails:**
1. STOP - Do not proceed to PR
2. ANALYZE - Why did it fail?
3. RETURN - Go back to appropriate phase:
   - Small fix → IMPLEMENT
   - Test wrong → VERIFY
   - Spec unclear → SPEC
   - Approach wrong → STRATEGIZE
4. FIX - Address all issues
5. RE-VERIFY - Run full test suite again
6. RE-REVIEW - Only proceed if 100% pass

**NO COMMITS WITH FAILING TESTS**
```

## Applied to Current Situation

**Current State:**
- 6/8 tests passing (75%)
- 2 failures: QualityMonitor foreign key, TaskScheduler method

**Correct Action:**
1. ❌ REVIEW REJECTED
2. Return to IMPLEMENT
3. Fix both issues
4. Re-run tests
5. Only proceed when 8/8 pass (100%)

## Enforcement Mechanism

**Make it impossible to commit with failures:**
```bash
# Add to pre-commit hook
npm test || {
  echo "❌ Tests failed - commit blocked"
  echo "Fix all test failures before committing"
  exit 1
}
```

## Success Metrics
- Zero commits with test failures in next 30 days
- 100% pass rate before every PR
- Clear rejection trail in documentation

## Meta-Learning

**Pattern:** We tend to accept "good enough" when we should demand "perfect"
**Fix:** Hard gates that cannot be bypassed
**Result:** Higher quality, fewer production issues

---

This learning makes the work process unambiguous: **ANY test failure = REVIEW rejection**