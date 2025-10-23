# MANDATORY VERIFICATION LOOP - NO EXCEPTIONS

**Date**: 2025-10-23
**Status**: ⚠️ **CRITICAL - MUST BE FOLLOWED BY ALL AGENTS**

---

## The Problem

Build errors were introduced because tasks were marked "complete" before running the full verification loop. **This is unacceptable and must NEVER happen again.**

---

## The Rule

**NO TASK IS "DONE" UNTIL ALL VERIFICATION STEPS PASS**

This applies to:
- ✅ **Claude Code** (all tasks)
- ✅ **Codex agents** (all tasks)
- ✅ **Autopilot** (all automated work)
- ✅ **Manual changes** (all human work)

**NO EXCEPTIONS. EVER.**

---

## The Mandatory Verification Loop

This is an **ITERATIVE LOOP** - you cycle through these steps until ALL checks pass:

```
1. BUILD → 2. TEST → 3. AUDIT → 4. Issues found?
                                      ↓ YES
                                   FIX ISSUES
                                      ↓
                                   Back to 1

                                   NO ↓
                                   DONE ✅
```

### Step 1: BUILD Verification

```bash
cd tools/wvo_mcp
npm run build
```

**Exit Criteria:**
- ✅ Build completes with **ZERO errors**
- ✅ No TypeScript compilation errors
- ✅ No linting errors

**If errors found:**
- ❌ Task is NOT complete
- ❌ Fix ALL errors
- ❌ Go back to Step 1

**Clean build if needed:**
```bash
rm -rf dist && npm run build
```

### Step 2: TEST Verification

```bash
npm test  # Run all tests

# For specific files:
npm test -- your_file.test.ts --run

# Check test quality:
bash ../../scripts/validate_test_quality.sh path/to/test.ts
```

**Exit Criteria:**
- ✅ All tests **PASS**
- ✅ Tests cover all 7 dimensions (see UNIVERSAL_TEST_STANDARDS.md):
  1. Happy path
  2. Edge cases
  3. Error handling
  4. Integration
  5. Performance
  6. Type safety
  7. Regression protection
- ✅ Coverage is comprehensive, not shallow

**If tests fail:**
- ❌ Task is NOT complete
- ❌ Fix failing tests
- ❌ Add missing coverage
- ❌ Go back to Step 1

### Step 3: AUDIT Verification

```bash
npm audit
```

**Exit Criteria:**
- ✅ **ZERO vulnerabilities** (none, not even low severity)

**If vulnerabilities found:**
- ❌ Task is NOT complete
- ❌ Run `npm audit fix`
- ❌ If auto-fix doesn't work, manually fix
- ❌ Go back to Step 1

### Step 4: RUNTIME Verification (for features)

**If your change is a feature (not just tests/docs), you MUST run it:**

```bash
# Run the feature end-to-end
# Test with realistic data (100+ items if applicable)
# Monitor resources (memory, CPU, processes)
```

**Exit Criteria:**
- ✅ Feature runs without errors
- ✅ Handles realistic data volumes
- ✅ Resources stay bounded (no memory leaks, etc.)

**If crashes/errors:**
- ❌ Task is NOT complete
- ❌ Fix runtime issues
- ❌ Go back to Step 1

### Step 5: DOCUMENTATION

**Exit Criteria:**
- ✅ Updated relevant docs
- ✅ Added test evidence to commit message
- ✅ Documented any breaking changes

**If incomplete:**
- ❌ Task is NOT complete
- ❌ Complete documentation
- ❌ Go back to Step 1

---

## Exit Criteria (ALL must be true)

**Only when ALL of these pass can you claim the task is "done":**

- ✅ Build completes with 0 errors
- ✅ All tests pass
- ✅ Test coverage is 7/7 dimensions
- ✅ npm audit shows 0 vulnerabilities
- ✅ Feature runs without errors (if applicable)
- ✅ Resources stay bounded (if applicable)
- ✅ Documentation is complete

**If even ONE criterion fails, you MUST iterate: fix → build → test → audit → repeat.**

---

## ⚠️ ESCALATION PROTOCOL: Infinite Loops

**If you iterate more than 5 times OR detect a regression loop, STOP and ESCALATE:**

### Infinite Loop Detection

Watch for:
- Same error appears 3+ times
- Fixing A breaks B, fixing B breaks A (regression cycle)
- No progress after 5 iterations

### When Detected, ESCALATE Immediately

1. **STOP iterating** - you're stuck
2. **Document the loop:**
   - What you tried (all iterations)
   - What keeps breaking
   - The cycle pattern
3. **Escalate to supervisor:**
   - Tag @user in discussion
   - Describe the fundamental problem
   - Propose architectural fix if known
4. **Do NOT:**
   - Keep iterating (wastes resources)
   - Try workarounds that mask the issue
   - Claim "done" because you're tired

**Example escalation:**
```
@user - Infinite loop detected in verification:

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

**The rule: If you can't get all checks passing in 5 iterations, there's a deeper problem. Escalate, don't iterate forever.**

---

## What "Done" Actually Means

**WRONG:**
- ❌ "I wrote the code" → NOT DONE
- ❌ "I wrote the tests" → NOT DONE
- ❌ "The code looks good to me" → NOT DONE
- ❌ "It probably works" → NOT DONE

**RIGHT:**
- ✅ "Build passes (0 errors)" → Step 1 ✓
- ✅ "All tests pass (comprehensive coverage)" → Step 2 ✓
- ✅ "npm audit clean (0 vulnerabilities)" → Step 3 ✓
- ✅ "Feature runs without errors" → Step 4 ✓
- ✅ "Documentation complete" → Step 5 ✓
- ✅ **NOW it's done**

**IMPORTANT: "Done" Doesn't Mean "Immutable Forever"**

✅ **Completed tasks CAN be revisited** when:
- A superior architectural approach is discovered
- A more intelligent solution emerges
- New context makes the original approach obsolete
- Technical debt needs addressing

✅ **Agents SHOULD propose revisions** when they see:
- Better patterns in the codebase
- More elegant solutions
- Performance improvements
- Maintainability gains

**"Done and verified" means the work met quality standards AT THAT TIME. It does NOT mean "never touch again."**

---

## Examples

### Example 1: Good Verification

```
Agent: I've implemented the new feature.
Agent: Running build... ✅ 0 errors
Agent: Running tests... ✅ All pass (20/20)
Agent: Running audit... ✅ 0 vulnerabilities
Agent: Testing feature... ✅ Runs correctly with 1000 items
Agent: Documentation... ✅ Updated ARCHITECTURE.md

Task is now COMPLETE. All verification steps passed.
```

### Example 2: Bad Verification (WRONG)

```
Agent: I've implemented the new feature.
Agent: The code looks good!

Task is COMPLETE.  ← WRONG! No verification!
```

### Example 3: Iteration Until Fixed

```
Agent: I've implemented the new feature.
Agent: Running build... ❌ 12 TypeScript errors
Agent: Fixing errors...
Agent: Running build... ❌ 3 TypeScript errors remain
Agent: Fixing remaining errors...
Agent: Running build... ✅ 0 errors
Agent: Running tests... ❌ 2 tests failing
Agent: Fixing tests...
Agent: Running tests... ✅ All pass (20/20)
Agent: Running audit... ✅ 0 vulnerabilities
Agent: Testing feature... ✅ Works correctly
Agent: Documentation... ✅ Complete

Task is now COMPLETE. Took 4 iterations.
```

### Example 4: Escalation (5+ iterations)

```
Agent: I've implemented the new feature.
Agent: Running build... ❌ TypeError in module A
Agent: Fixed module A...
Agent: Running build... ❌ Tests in module B now fail
Agent: Fixed module B tests...
Agent: Running build... ❌ TypeError in module A returns (same error!)
Agent: Fixed module A again...
Agent: Running build... ❌ Tests in module B fail again (same error!)
Agent: This is iteration 4, same cycle repeating.

@user - ESCALATING: Infinite loop detected. Modules A and B have circular dependency.
Proposed fix: Refactor to remove circular import.
```

---

## Integration with Tools

### TodoWrite Tool

When using TodoWrite, tasks must accurately reflect verification status:

```typescript
// WRONG
{ content: "Implement feature X", status: "completed" }  // Did you verify it?

// RIGHT - Only mark completed after verification
{ content: "Implement feature X", status: "in_progress" }
// ... do verification loop ...
{ content: "Implement feature X", status: "completed" }  // NOW it's done
```

### Agent Prompts

All agent prompts must include verification loop reminder:

```
Your task: [description]

MANDATORY: Before claiming this task is "done", you MUST complete the verification loop:
1. npm run build (0 errors)
2. npm test (all pass)
3. npm audit (0 vulnerabilities)
4. Run the feature (if applicable)
5. Update docs

See docs/MANDATORY_VERIFICATION_LOOP.md for details.
```

### Commit Messages

All commits must include test evidence:

```
feat: Add dynamic rubric generator

- Generates complexity-appropriate quality standards
- Trivial → very_complex task analysis
- Autonomy guidance per complexity level

Verification:
✅ Build: 0 errors
✅ Tests: 20/20 passing (100%)
✅ Audit: 0 vulnerabilities
✅ Runtime: Tested with 100 tasks, runs in <50ms
```

---

## Consequences of Not Following This

**If you skip verification:**
- ❌ Build breaks for the entire team
- ❌ Tests fail in CI/CD
- ❌ Production deployments blocked
- ❌ Other developers waste time fixing your errors
- ❌ Trust in automation eroded
- ❌ **The orchestrator looks incompetent**

**The cost is real:**
- Lost time: 30+ min to debug and fix
- Broken trust: "Can we trust the orchestrator?"
- Wasted resources: CI/CD cycles, developer time
- Delayed features: Other work blocked

---

## This Document Is Mandatory Reading

**Every agent must read and follow this document:**
- Claude Code
- Codex agents
- Autopilot
- Any automated system

**How to ensure agents see this:**
- Include in system prompts
- Reference in task descriptions
- Check before marking tasks complete
- Enforce in code review

---

## Summary

**The verification loop is simple:**

```
BUILD → TEST → AUDIT → RUNTIME → DOCS → ALL PASS?
  ↑                                        ↓ NO
  └──────────── FIX ISSUES ────────────────┘
                                          ↓ YES
                                        DONE ✅
```

**The rule is non-negotiable:**

**NO EXCEPTIONS. NO SHORTCUTS. NO "IT PROBABLY WORKS."**

**VERIFY EVERYTHING. ALWAYS.**

---

**Document Version**: 1.0
**Last Updated**: 2025-10-23
**Applies To**: All agents, all tasks, all code changes
**Enforcement**: MANDATORY
