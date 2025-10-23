# The Verification Loop - Iterate Until Everything Passes

## The Core Principle

**You don't run verification once. You ITERATE until everything passes.**

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  1. BUILD                                       │
│     ├─ npm run build                            │
│     └─ Errors? → FIX → Start over               │
│         ↓ No errors                             │
│                                                 │
│  2. TEST                                        │
│     ├─ npm test                                 │
│     ├─ validate_test_quality.sh                 │
│     └─ Failures? → FIX → Start over             │
│         ↓ All pass                              │
│                                                 │
│  3. AUDIT                                       │
│     ├─ npm audit                                │
│     └─ Vulnerabilities? → FIX → Start over      │
│         ↓ 0 vulnerabilities                     │
│                                                 │
│  4. RUNTIME (if feature)                        │
│     ├─ Actually run it                          │
│     ├─ Test with realistic data                 │
│     └─ Crashes/errors? → FIX → Start over       │
│         ↓ Runs cleanly                          │
│                                                 │
│  5. DOCUMENTATION                               │
│     ├─ Update docs                              │
│     └─ Incomplete? → COMPLETE → Start over      │
│         ↓ Complete                              │
│                                                 │
│  ✅ ALL CHECKS PASS → DONE                      │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Common Mistake

❌ **WRONG:**
```
1. Write code
2. Run build → errors
3. Fix errors
4. "Done!" ← STOPPED TOO EARLY
```

**What's missing:** Didn't re-run build, test, or audit after fixes!

✅ **RIGHT:**
```
1. Write code
2. Run build → errors
3. Fix errors
4. Run build again → passes
5. Run tests → failures
6. Fix tests
7. Run build again → passes
8. Run tests again → passes
9. Run audit → vulnerabilities
10. Run npm audit fix
11. Run build again → passes
12. Run tests again → passes
13. Run audit again → 0 vulnerabilities
14. Run feature → works
15. NOW it's done ✅
```

## Real Example: Today's Fixes

### Initial State
- Created integration test
- Created shell script fixes
- **Claimed "done"** ❌

### What Happened
User ran `make autopilot`:
- ❌ Build failed (TypeScript errors)
- ❌ Shell script failed (unbound variable)
- ❌ Audit failed (1 vulnerability)

### Correct Iteration Loop

**Iteration 1:**
```bash
$ npm run build
❌ TypeScript errors

→ FIX: Clean build cache
→ BACK TO BUILD
```

**Iteration 2:**
```bash
$ npm run build
✅ Passes

$ bash autopilot_unified.sh
❌ Unbound variable error

→ FIX: Add ${2:-} safety checks
→ BACK TO BUILD
```

**Iteration 3:**
```bash
$ npm run build
✅ Passes

$ bash autopilot_unified.sh
✅ Runs

$ npm audit
❌ 1 vulnerability

→ FIX: npm audit fix
→ BACK TO BUILD
```

**Iteration 4:**
```bash
$ npm run build
✅ Passes

$ bash autopilot_unified.sh
✅ Runs

$ npm audit
✅ 0 vulnerabilities

→ ALL CHECKS PASS → DONE ✅
```

**Total iterations: 4**

## The Checklist

Before claiming "done", verify you've completed the full loop:

- [ ] Ran build
- [ ] Fixed any build errors
- [ ] Re-ran build (after fixes)
- [ ] Ran tests
- [ ] Fixed any test failures
- [ ] Re-ran build (after fixes)
- [ ] Re-ran tests (after fixes)
- [ ] Ran audit
- [ ] Fixed any vulnerabilities
- [ ] Re-ran build (after fixes)
- [ ] Re-ran tests (after fixes)
- [ ] Re-ran audit (after fixes)
- [ ] Ran feature end-to-end (if applicable)
- [ ] Fixed any runtime issues
- [ ] Re-ran ALL checks (after fixes)
- [ ] **ALL checks pass**

**Only when every checkbox is checked and all checks pass can you claim done.**

## Why This Matters

**Without iteration:**
- You fix build errors but don't re-test
- Tests could be broken by your fix
- You ship broken code

**With iteration:**
- Every fix is verified
- No regressions slip through
- Confident that everything works

## The Rule

```
IF (any_check_fails) {
  fix_the_issue();
  goto START;  // Back to build
}

ONLY_WHEN (all_checks_pass) {
  claim_done();
}
```

**No shortcuts. No "probably works". Iterate until proven.**

## Exit Criteria (ALL must be true simultaneously)

1. ✅ `npm run build` → 0 errors
2. ✅ `npm test` → all pass
3. ✅ `npm audit` → 0 vulnerabilities
4. ✅ Feature runs end-to-end (if applicable)
5. ✅ Resources bounded (if applicable)
6. ✅ Documentation complete

**ALL at the same time. Not "build passes now, tests passed 2 iterations ago".**

## Escalation Protocol: When to STOP Iterating

### Infinite Loop Detection

**STOP and ESCALATE if:**

1. **Same error 3+ times**
   - Error appears, you fix it, it reappears
   - Pattern: Fix → Pass → New change → Same error returns

2. **Regression cycle**
   - Fixing A breaks B
   - Fixing B breaks A
   - Back and forth with no progress

3. **Exceeded 5 iterations**
   - Still not all checks passing after 5 complete loops
   - Indicates fundamental design problem

### When Detected: ESCALATE, Don't Iterate

**Steps:**

1. **STOP** - Don't keep going
2. **Document the loop:**
   ```
   Iteration 1: Fixed X → Y broke
   Iteration 2: Fixed Y → X broke
   Iteration 3: Fixed both → Z broke
   Iteration 4: Fixed Z → X broke again
   Iteration 5: Same pattern

   LOOP DETECTED: Circular dependency between X and Y
   ```

3. **Escalate to supervisor:**
   ```
   @user - Infinite loop detected

   Problem: Circular dependency in [component]
   Iterations: 5 (documented above)
   Root cause: [architectural issue]
   Proposed fix: [if known]

   Need architectural guidance to break the cycle.
   ```

4. **Wait for guidance** - Don't keep iterating

### Example: Regression Cycle

❌ **WRONG (infinite loop):**
```
1. Fix file A → tests break
2. Fix tests → file A breaks
3. Fix file A → tests break
4. Fix tests → file A breaks
... (forever)
```

✅ **RIGHT (escalate):**
```
1. Fix file A → tests break
2. Fix tests → file A breaks
3. Detect cycle
4. STOP
5. Document pattern
6. Escalate: "Files A and tests have conflicting requirements"
7. Wait for architectural fix
```

### The 5-Iteration Rule

**After 5 iterations, if not all checks pass:**
- There's a fundamental problem
- Iteration won't solve it
- Need architectural change
- **ESCALATE**

### Example Escalation

```
@user - Cannot complete verification after 5 iterations

Task: Add new feature X
Iterations attempted: 5

Pattern:
- Build passes → tests fail
- Fix tests → build passes → audit fails
- Fix audit → build passes → tests fail
- Repeating cycle

Root cause analysis:
Feature X requires dependency Y version 2.0
Tests require dependency Y version 1.5
Both cannot be satisfied simultaneously

Proposed solutions:
A. Upgrade tests to Y 2.0 (may break other tests)
B. Refactor feature X to work with Y 1.5
C. Use different dependency

Escalating for decision on approach.
```

## Summary

- **Not:** Build → fix → done
- **But:** Build → test → audit → fix → **BUILD → TEST → AUDIT** → repeat until ALL pass
- **Then:** Done
- **UNLESS:** Infinite loop detected → **ESCALATE** → supervisor fixes root cause

**Iteration limit: 5 cycles. After that, escalate.**

This is now enforced in CLAUDE.md. No agent can iterate forever OR skip escalation.
