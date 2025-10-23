# Agent Empowerment: Revising Completed Work

**Quick Reference for Agents**

---

## You Are Empowered To

✅ **Propose revisions to "done" tasks** when you discover:
- Superior architectural approach
- More intelligent solution
- Technical debt accumulation
- Performance/security issues
- Better patterns in the codebase

✅ **Update the roadmap** when:
- Priorities shift based on new context
- Dependencies change
- Better sequencing is discovered
- Blockers can be removed with different approach

✅ **Reassign tasks** when:
- Different agent better suited
- Complexity level changes
- New expertise required

---

## Authority Levels

### ✅ NO APPROVAL NEEDED (proceed immediately):

**Local improvements:**
- Refactor single module/component
- Improve algorithm complexity
- Add missing edge case handling
- Enhance error messages
- Update documentation
- Fix technical debt in isolated code

**Minor roadmap updates:**
- Adjust task priorities
- Update task descriptions
- Add follow-up tasks
- Mark tasks for revision

**Examples:**
```
"I can replace our custom memoization with lodash.memoize - simpler, better."
→ Create T-REVISION-X, implement, verify, done. ✅

"This O(n²) loop can be O(n) with a hash map."
→ Refactor, verify, document. ✅

"Task T5 is blocked by T3, but we can do T5 first by mocking T3's interface."
→ Update dependencies in roadmap, proceed. ✅
```

### ⚠️ APPROVAL NEEDED (propose first):

**Major architectural changes:**
- Rewrite core system components
- Change project-wide patterns
- Replace major dependencies
- Modify public APIs (breaking changes)
- Remove user-facing features

**Examples:**
```
"We should migrate from Express to Fastify - 2x faster."
→ Document analysis, propose to @user (CTO lens), await approval. ⚠️

"Our custom auth system should be replaced with Passport.js."
→ Show cost/benefit, migration path, get approval. ⚠️

"We can remove the caching layer entirely if we switch to Redis."
→ Major change, needs architectural review. ⚠️
```

---

## The Decision Rule

```
Is the change LOCAL (one module) + maintains CONTRACTS?
  → YES: Proceed (no approval)
  → NO: Propose first (get approval)
```

**Local** = Changes confined to one module/component
**Contracts** = Public APIs, interfaces, behavior guarantees

---

## How to Propose Revisions

### Step 1: Create Revision Task

```yaml
- id: T-REVISION-[original-id]
  title: "Revise [original]: [concise reason]"
  description: |
    **Why:** [Superior approach discovered]
    **Current:** [What exists now]
    **Proposed:** [What should replace it]
    **Benefits:** [Why this is better]
    **Migration:** [How to transition]

  status: pending
  dependencies: []
  exit_criteria:
    - "New implementation complete"
    - "Tests passing"
    - "Migration path validated"
    - "Documentation updated"

  metadata:
    revision_of: "[original-task-id]"
    reason: "superior_architecture | more_intelligent | technical_debt"
    local_change: true | false  # Determines if approval needed
```

### Step 2: Verify Just Like Any Task

Revisions must pass the same verification loop:
1. BUILD (0 errors)
2. TEST (all pass)
3. AUDIT (0 vulnerabilities)
4. RUNTIME (works correctly)
5. DOCS (updated)

**No shortcuts because it's a revision!**

### Step 3: Document What Changed

```markdown
## Revision Log: [Task ID]

**Date:** 2025-10-23
**Reason:** Superior architecture discovered
**Agent:** Claude Code

**Before:**
- Custom implementation of X (150 lines)
- O(n²) complexity
- Manual testing required

**After:**
- Using library Y (5 lines + dependency)
- O(n) complexity
- Battle-tested by community

**Migration:**
- No breaking changes
- Backward compatible
- Tests all pass

**Benefits:**
- 96% less code to maintain
- 10x faster performance
- Better error handling
```

---

## Real-World Scenarios

### Scenario 1: You Find Better Library

**Situation:**
```
Task T2.3 is "done": Custom JSON schema validator (200 lines).
You discover: Ajv library does this better (10x faster, more features).
```

**Your Action:**
```
1. Check: Is this local? → YES (one module)
2. Check: Maintains contracts? → YES (same validation API)
3. Create: T-REVISION-2.3 "Replace custom validator with Ajv"
4. Implement, verify (build + test + audit)
5. Update docs
6. Done ✅ (no approval needed - local change)
```

### Scenario 2: You See Architectural Flaw

**Situation:**
```
Tasks T5.1-T5.5 are "done": Multi-tenant system with shared DB.
You realize: Should be separate DBs per tenant (data isolation).
```

**Your Action:**
```
1. Check: Is this local? → NO (affects entire tenant system)
2. Check: Maintains contracts? → NO (major data model change)
3. Document: docs/revisions/multi-tenant-architecture.md
4. Create proposal with:
   - Current issues (data isolation risks)
   - Proposed approach (separate DBs)
   - Migration path (gradual tenant migration)
   - Cost/benefit analysis
5. Tag @user (CTO lens): "Major refactor proposed"
6. Wait for approval ⚠️
```

### Scenario 3: Technical Debt Accumulation

**Situation:**
```
Task T8.2 is "done" but has grown messy:
- 500-line function
- 8 levels of nesting
- No error handling
- Difficult to test
```

**Your Action:**
```
1. Check: Is this local? → YES (one function in one module)
2. Check: Maintains contracts? → YES (same behavior, cleaner code)
3. Create: T-REVISION-8.2 "Refactor for maintainability"
4. Break into smaller functions
5. Add error handling
6. Add tests
7. Verify (build + test + audit)
8. Done ✅ (no approval needed - local improvement)
```

---

## When NOT to Revise

**Don't revise if:**

❌ **No real improvement** - Just different, not better
```
Bad: "Let's rewrite in TypeScript" (if JavaScript works fine)
Good: "Let's add TypeScript for type safety after 3 bugs from typos"
```

❌ **Chasing trends** - New isn't always better
```
Bad: "Let's use [new framework] because it's trendy"
Good: "Let's use [new framework] because it solves our X problem"
```

❌ **Bikeshedding** - Trivial style preferences
```
Bad: "Let's rename all variables to match my preferred naming"
Good: "Let's fix inconsistent naming that confuses new contributors"
```

❌ **Not verifiable** - Can't test the improvement
```
Bad: "This feels cleaner" (subjective, unmeasurable)
Good: "This reduces complexity from O(n²) to O(n)" (measurable)
```

---

## Revision Checklist

Before proposing a revision, ask:

- [ ] **Is it measurably better?** (Performance, maintainability, correctness)
- [ ] **Have I checked if it's local vs. global?** (Determines approval need)
- [ ] **Does it maintain contracts?** (Or require migration path)
- [ ] **Can I verify it?** (Build + test + audit will pass)
- [ ] **Have I documented the rationale?** (Why this is superior)
- [ ] **Is the effort justified?** (Benefit > cost of change)

**If all YES → Proceed (with approval if needed)**

---

## Key Principles

1. **"Done" ≠ "Frozen"**
   - Completed work can evolve
   - Continuous improvement is expected
   - Architecture matures over time

2. **Verify Everything**
   - Revisions go through same verification loop
   - No shortcuts for "just a refactor"
   - Quality standards always apply

3. **Local Authority, Global Consensus**
   - Local improvements: Your call
   - Global changes: Team decision
   - When in doubt, propose

4. **Document Decisions**
   - Why you revised
   - What changed
   - What improved (measurable)

---

## Summary

✅ **You ARE empowered** to improve completed work
✅ **You CAN revise** tasks when you see better approaches
✅ **You SHOULD propose** architectural improvements
✅ **You MUST verify** all revisions (no shortcuts)

**The balance:**
> **Be bold with local improvements.**
> **Be collaborative with global changes.**
> **Always verify everything.**

---

**See also:**
- `docs/MANDATORY_VERIFICATION_LOOP.md` - Full verification requirements
- `docs/ARCHITECTURE.md` - Architectural principles
- `state/roadmap.yaml` - Current roadmap (you can update this!)

---

**Remember:** Architecture evolves. "Done" is a milestone, not a monument.
