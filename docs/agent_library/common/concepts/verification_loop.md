# Verification Loop

**CRITICAL**: Never claim a task is "done" without completing the full verification loop.

---

## The Iterative Loop

This is an **ITERATIVE process** - you keep cycling through these steps until ALL checks pass:

```
1. BUILD → 2. TEST → 3. AUDIT → 4. RUNTIME → 5. DOCS → Issues found?
                                                              ↓ YES
                                                          FIX ISSUES
                                                              ↓
                                                          Back to 1

                                                          NO ↓
                                                          DONE ✅
```

**You are NOT done until ALL 5 steps pass.**

---

## Step 1: BUILD Verification

**Objective**: Code compiles with zero errors

### Commands:
```bash
cd tools/wvo_mcp && npm run build

# Or from project root:
make build
```

### Exit Criteria:
- ✅ Build completes successfully
- ✅ Zero compilation errors
- ✅ Zero type errors

### If Build Fails:
1. Read error messages carefully
2. Fix all errors
3. **Go back to Step 1** (rebuild)
4. Repeat until build succeeds

**Tip**: Clean build cache if needed:
```bash
rm -rf dist && npm run build
```

---

## Step 2: TEST Verification

**Objective**: All tests pass with 7/7 dimension coverage

### Commands:
```bash
# Run all tests
npm test

# Check test quality (from tools/wvo_mcp)
bash ../../scripts/validate_test_quality.sh path/to/test.ts

# Or from project root:
bash scripts/validate_test_quality.sh path/to/test.ts
```

### Exit Criteria:
- ✅ All tests pass
- ✅ Essential 7 dimensions covered:
  1. Happy path
  2. Edge cases
  3. Error handling
  4. Integration
  5. Performance
  6. Security
  7. Regression
- ✅ Unit test coverage ≥80%
- ✅ Tests are deterministic (no flakiness)

### If Tests Fail:
1. Review failing test output
2. Fix the issues
3. **Go back to Step 1** (rebuild and retest)
4. If coverage is shallow → add tests → go back to Step 1

See [Testing Standards](/docs/agent_library/common/standards/testing_standards.md) for detailed guidance.

---

## Step 3: AUDIT Verification

**Objective**: Zero security vulnerabilities

### Commands:
```bash
npm audit
```

### Exit Criteria:
- ✅ 0 vulnerabilities reported
- ✅ All dependencies up to date (or documented as intentionally old)

### If Audit Fails:
1. Run `npm audit fix` to auto-fix when possible
2. If auto-fix doesn't work → manually update dependencies
3. If vulnerability can't be fixed → document and escalate
4. **Go back to Step 1** (rebuild and retest after dependency updates)

**Important**: Dependency updates can break tests or build, so always cycle back to Step 1 after fixing audit issues.

---

## Step 4: RUNTIME Verification

**Objective**: Feature actually works end-to-end

### What to Test:
- **Run the feature** in realistic scenario
- **Test with realistic data** (100+ items if applicable)
- **Monitor resources** (memory, CPU, processes)
- **Check for errors** in console/logs
- **Verify behavior** matches specification

### Exit Criteria:
- ✅ Feature runs without errors
- ✅ Output is correct
- ✅ Resources stay bounded (memory doesn't leak, CPU reasonable)
- ✅ Performance meets requirements

### Examples:

**API endpoint**:
```bash
# Start server
npm run dev

# Test endpoint
curl http://localhost:3000/api/weather?location=NYC

# Verify response
# - Status code 200
# - Data structure matches schema
# - Values are reasonable
```

**CLI tool**:
```bash
# Run with realistic input
node dist/cli.js --input data/sample.json --output results.json

# Verify:
# - No errors in output
# - Results file created
# - Data looks correct
```

**Background job**:
```bash
# Trigger job
npm run job:weather-sync

# Monitor:
# - Logs show progress
# - No errors
# - Job completes successfully
# - Database updated correctly
```

### If Runtime Fails:
1. Fix the issues
2. **Go back to Step 1** (rebuild, retest, rerun)
3. Repeat until runtime succeeds

---

## Step 5: DOCUMENTATION Verification

**Objective**: Documentation is complete and accurate

### Checklist:
- [ ] **Code comments** for complex logic
- [ ] **README updated** if behavior changed
- [ ] **API docs updated** if public interface changed
- [ ] **Test evidence** in commit message
- [ ] **Breaking changes** documented (if applicable)
- [ ] **Migration guide** (if API changed)

### If Documentation Incomplete:
1. Complete the documentation
2. **Go back to Step 1** if docs reveal issues
3. Otherwise, move to final check

---

## Final Exit Criteria

**ALL must be true** before claiming done:

- ✅ Build completes with 0 errors
- ✅ All tests pass
- ✅ Test coverage is 7/7 dimensions
- ✅ npm audit shows 0 vulnerabilities
- ✅ Feature runs without errors (if applicable)
- ✅ Resources stay bounded (if applicable)
- ✅ Documentation is complete

**Only when ALL criteria pass can you mark the task as `done`.**

---

## Escalation Protocol: Infinite Loops

**If you iterate more than 5 times OR detect a regression loop, STOP and ESCALATE:**

### Infinite Loop Detection:
- Same error appears 3+ times
- Fixing A breaks B, fixing B breaks A (regression cycle)
- No progress after 5 iterations

### When Detected, ESCALATE Immediately:

1. **STOP iterating** - you're stuck in a loop

2. **Document the loop**:
   - What you tried (all iterations)
   - What keeps breaking
   - The cycle pattern

3. **Escalate to supervisor**:
   ```markdown
   @atlas - Infinite loop detected in verification:

   Iterations:
   1. Fixed TypeScript error in file A → broke tests in file B
   2. Fixed tests in file B → TypeScript error in file A returns
   3. Fixed both → npm audit fails
   4. Fixed audit → TypeScript error in file A returns
   5. Same cycle repeating

   Root cause: Files A and B have circular dependency
   Proposed fix: Refactor to remove circular dependency

   Escalating for architectural guidance.
   ```

4. **Do NOT**:
   - Keep iterating (wastes resources)
   - Try workarounds that mask the issue
   - Claim "done" because you're tired

**The rule**: If you can't get all checks passing in 5 iterations, there's a deeper problem. Escalate, don't iterate forever.

---

## Verification Loop Shortcuts (NOT Allowed)

**Never skip steps** to save time. These shortcuts ALWAYS backfire:

❌ **"Tests probably still pass, I'll skip running them"**
→ Result: Break tests in production

❌ **"It compiled, must be working"**
→ Result: Runtime errors in production

❌ **"I'll update docs later"**
→ Result: Docs never get updated

❌ **"One vulnerability is fine"**
→ Result: Security incident

❌ **"I tested it once, doesn't need retesting"**
→ Result: Regression after dependency update

**The only valid shortcut is DOING IT RIGHT THE FIRST TIME.**

---

## Example: Complete Verification Flow

**Task**: Add caching to weather data fetcher

### Iteration 1:

1. **BUILD**: ✅ Pass
2. **TEST**: ❌ Fail - Missing tests for cache expiration
3. **Action**: Add cache expiration tests
4. **Go back to Step 1**

### Iteration 2:

1. **BUILD**: ✅ Pass
2. **TEST**: ✅ Pass
3. **AUDIT**: ❌ Fail - 2 vulnerabilities in lodash
4. **Action**: Run `npm audit fix`
5. **Go back to Step 1**

### Iteration 3:

1. **BUILD**: ❌ Fail - Type error after lodash update
2. **Action**: Fix type error
3. **Go back to Step 1**

### Iteration 4:

1. **BUILD**: ✅ Pass
2. **TEST**: ✅ Pass
3. **AUDIT**: ✅ Pass
4. **RUNTIME**: ❌ Fail - Cache not actually expiring
5. **Action**: Fix cache expiration logic
6. **Go back to Step 1**

### Iteration 5:

1. **BUILD**: ✅ Pass
2. **TEST**: ✅ Pass
3. **AUDIT**: ✅ Pass
4. **RUNTIME**: ✅ Pass
5. **DOCS**: ❌ Incomplete - Missing cache config in README
6. **Action**: Update README
7. **Go back to Step 1** (sanity check)

### Iteration 6:

1. **BUILD**: ✅ Pass
2. **TEST**: ✅ Pass
3. **AUDIT**: ✅ Pass
4. **RUNTIME**: ✅ Pass
5. **DOCS**: ✅ Pass

**DONE!** ✅ Task can now be marked complete.

---

## Common Questions

**Q: Do I really need to run ALL steps EVERY time?**
A: Yes. Skipping steps causes bugs in production. The loop exists because changes in one area affect others.

**Q: What if I'm just updating docs?**
A: Still run the loop. Doc changes can break build (broken links, syntax errors).

**Q: Can I mark it done if just one test is flaky?**
A: No. Fix or skip the flaky test, then complete the loop.

**Q: What if audit shows a vulnerability I can't fix?**
A: Document it, create a security task, escalate to security team. Don't mark original task done until resolved.

---

## Key Principles

1. **Completeness**: ALL 5 steps required
2. **Iteration**: Keep cycling until all pass
3. **No shortcuts**: Skipping steps = bugs
4. **Escalate loops**: >5 iterations = deeper problem
5. **Evidence**: Document that you completed the loop

---

## References

- [Testing Standards](/docs/agent_library/common/standards/testing_standards.md)
- [Quality Standards](/docs/agent_library/common/standards/quality_standards.md)
- [CLAUDE.md Verification Section](/CLAUDE.md#critical-mandatory-verification-loop-before-claiming-completion)

---

**Version**: 1.0.0
**Last Updated**: 2025-10-23
