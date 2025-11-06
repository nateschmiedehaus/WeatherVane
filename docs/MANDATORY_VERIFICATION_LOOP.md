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

**The tests you run here were authored during PLAN.**  
If you discover missing coverage, STOP, return to PLAN, create the tests, then re-run IMPLEMENT. VERIFY is **execution-only**, not a time to write new tests tailored to the fresh implementation.
- Autopilot work must include a live Wave 0 loop: start `npm run wave0` (or TaskFlow live smoke), confirm `ps aux | grep wave0`, and document results. No shortcuts—PLAN defines the live steps VERIFY executes.

```bash
npm test  # Run all tests

# For specific files:
npm test -- your_file.test.ts --run

# Check test quality:
bash ../../scripts/validate_test_quality.sh path/to/test.ts
```

**Exit Criteria:**
- ✅ All tests **PASS**
- ✅ Tests match what PLAN documented (including any manual checks) and no new tests were authored in VERIFY
- ✅ Spec/Plan reviewers executed (after THINK, before IMPLEMENT) for every task approaching the gate:
  ```bash
  npm run spec:review -- <TASK-ID>
  npm run plan:review -- <TASK-ID>
  ```
  Approvals must appear in `state/analytics/spec_reviews.jsonl` and `state/analytics/plan_reviews.jsonl`.
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
node tools/wvo_mcp/scripts/rotate_overrides.mjs --dry-run
node tools/wvo_mcp/scripts/rotate_overrides.mjs
```

**Exit Criteria:**
- ✅ **ZERO vulnerabilities** (none, not even low severity)
- ✅ Overrides older than 24h archived (if `--dry-run` indicated rotation needed)
- ✅ `state/evidence/AFP-ARTIFACT-AUDIT-YYYY-MM-DD/summary.md` updated with commands + outcomes

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
- ✅ Daily Artifact Health report exists for the current 24-hour window (rotation script run, results committed)
- ✅ Guardrail Monitor (`node tools/wvo_mcp/scripts/check_guardrails.mjs`) reports PASS (or CI guardrail job is green)

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

## Revisiting Completed Work - Architectural Evolution

### When to Revisit "Done" Tasks

Agents (Claude, Codex, Autopilot) are **EMPOWERED** to propose revisions to completed work when they discover:

**1. Superior Architecture:**
- "I see a better way to structure this module that reduces complexity"
- "This pattern is cleaner and more maintainable"
- "Refactoring to use X would eliminate 3 other modules"

**2. More Intelligent Approach:**
- "New context shows we can simplify this significantly"
- "This library we added last week makes our custom solution obsolete"
- "Recent learnings suggest a different design pattern"

**3. Technical Debt:**
- "This works but has accumulated debt - time to refactor"
- "Performance bottleneck identified - needs redesign"
- "Security vulnerability discovered - requires architectural change"

### How to Propose Revisions

**Step 1: Document the Improvement**
```markdown
## Proposed Revision: [Task ID]

**Current State:** [Describe existing implementation]

**Why Revise:** [Explain superior approach]
- More elegant: [how]
- Better performance: [metrics]
- Easier to maintain: [why]
- Reduces complexity: [how]

**Proposed Approach:** [Describe new design]

**Migration Path:** [How to transition from old to new]

**Risks:** [What could go wrong]
```

**Step 2: Create Revision Task**

Agents can create revision tasks in the roadmap:

```yaml
- id: T-REVISION-[original-task-id]
  title: "Revise [original-task]: [reason]"
  description: |
    Revisiting completed task [original-id] due to superior approach discovered.

    **Original Approach:** [summary]
    **New Approach:** [summary]
    **Benefits:** [list]

    See docs/revisions/[task-id].md for full analysis.
  status: pending
  dependencies: []
  exit_criteria:
    - "New approach implemented"
    - "Tests updated and passing"
    - "Migration complete"
    - "Original approach deprecated/removed"
    - "Documentation updated"
  metadata:
    revision_of: "[original-task-id]"
    reason: "superior_architecture | more_intelligent | technical_debt"
    proposed_by: "[agent-name]"
```

**Step 3: Get Approval (if major)**

For major architectural changes:
- Tag decision-makers (CEO, CTO lens holders)
- Show cost/benefit analysis
- Propose gradual migration if risky

For minor improvements:
- Document the change
- Update roadmap
- Proceed with implementation

### Agent Authority to Reassign/Update Roadmap

**Agents CAN (no approval needed):**
- ✅ Mark completed tasks for revision when better approach found
- ✅ Update task descriptions to reflect new understanding
- ✅ Add follow-up tasks to improve existing work
- ✅ Refactor code that meets quality standards but can be improved
- ✅ Update roadmap positions when priorities shift

**Agents SHOULD (get approval first):**
- ⚠️ Completely rewrite major system components
- ⚠️ Change core architectural patterns used project-wide
- ⚠️ Remove functionality that users depend on
- ⚠️ Make breaking changes to public APIs

**The Rule:**
> **If the improvement is local (one module/component) and maintains contracts, proceed.**
> **If the change is global (affects multiple modules) or breaks contracts, propose first.**

### Examples of Good Revisions

**Example 1: Local Improvement**
```
Task T1.2.3 is marked "done" (build passes, tests pass).

Agent discovers: "We can use lodash.memoize instead of our custom cache implementation.
Simpler, better tested, same performance."

Agent action:
1. Create T-REVISION-1.2.3: "Refactor to use lodash.memoize"
2. Implement change
3. Verify (build + test + audit)
4. Update docs
5. Mark original T1.2.3 as "revised" in metadata

Result: ✅ Codebase improved, no approval needed (local change)
```

**Example 2: Architectural Improvement**
```
Tasks T2.1 through T2.5 are marked "done" (auth system complete).

Agent discovers: "We're reinventing OAuth - Passport.js would be better.
Reduces code by 80%, better security, active maintenance."

Agent action:
1. Document analysis in docs/revisions/auth-system.md
2. Create proposal with migration path
3. Tag @user (CTO lens): "Major refactor proposed - please review"
4. Wait for approval
5. If approved, create T-REVISION-2.x tasks for migration

Result: ⚠️ Major change proposed, awaiting approval
```

**Example 3: Technical Debt**
```
Task T3.4 is marked "done" (feature works, verified).

Agent detects: "This implementation has O(n²) complexity, causing slowdowns at scale.
Can be O(n log n) with better algorithm."

Agent action:
1. Create T-REVISION-3.4: "Optimize algorithm complexity"
2. Add to roadmap with priority: high (performance issue)
3. Implement better algorithm
4. Verify (build + test + benchmark)
5. Deploy

Result: ✅ Performance improved, technical debt addressed
```

### Balancing Stability and Evolution

**Stability (don't break things):**
- ✅ Always verify revisions (same loop: build + test + audit)
- ✅ Maintain backward compatibility when possible
- ✅ Test migration paths thoroughly
- ✅ Document what changed and why

**Evolution (keep improving):**
- ✅ Don't let "done" become "frozen"
- ✅ Refactor when you see better patterns
- ✅ Address technical debt proactively
- ✅ Keep codebase modern and maintainable

**The Balance:**
> **"Done" means "meets current standards," not "perfect forever."**
> **Continuous improvement requires revisiting completed work.**
> **But every revision must pass the same verification loop.**

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
