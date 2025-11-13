# Design: [TASK-ID]

> **Purpose:** Document your design thinking BEFORE implementing.
> This prevents compliance theater and ensures AFP/SCAS principles guide your work.

---

## Context

**What problem are you solving and WHY?**

[Describe the problem, root cause, and goal. Focus on WHY, not just WHAT.]

---

## Five Forces Check

**Before proceeding, verify you've considered all five forces:**

### COHERENCE - Match the terrain
- [ ] I searched for similar patterns in the codebase
- Modules checked (3 most similar): [list them]
- Pattern I'm reusing: [name] OR why existing patterns don't fit: [explain]

### ECONOMY - Achieve more with less
- [ ] I explored deletion/simplification (via negativa - see next section)
- Code I can delete: [specific files/functions] OR why I must add: [reason]
- LOC estimate: +[X] -[Y] = net [Z] (≤150 limit? If not, justify)

### LOCALITY - Related near, unrelated far
- [ ] Related changes are in same module
- Files changing: [list - are they all in same area?]
- Dependencies: [are they local or scattered across codebase?]

### VISIBILITY - Important obvious, unimportant hidden
- [ ] Errors are observable, interfaces are clear
- Error handling: [how are failures logged?]
- Public API: [is it minimal and self-explanatory?]

### EVOLUTION - Patterns prove fitness
- [ ] I'm using proven patterns OR documenting new one for fitness tracking
- Pattern fitness: [has this pattern worked before? usage count, bug rate?]
- If new pattern: [why needed? how will we measure success?]

**Pattern Decision:**

**Similar patterns found:** [from COHERENCE search above]
- Pattern 1: [file:line, description]
- Pattern 2: [file:line, description]
- Pattern 3: [file:line, description]

**Pattern selected:** [which one I'm using]
**Why this pattern:** [fits my use case because...]

**OR**

**New pattern needed:** [name]
**Why existing patterns don't fit:** [specific reason]
**How this pattern differs:** [key differences]

**Leverage Classification:**

**Code leverage level:** [critical / high / medium / low]

- **Critical:** Auth, payments, core abstractions → formal verification or 100% test coverage
- **High:** Public APIs, frequently changed → comprehensive testing
- **Medium:** Business logic, orchestrators → happy path + error cases
- **Low:** Utils, rarely changed → smoke tests

**My code is:** [level] **because** [reason]
**Assurance strategy:** [testing/verification approach based on leverage]

**Commit message will include:**
```
Pattern: [pattern name]
Deleted: [what was removed/simplified, if +50 LOC]
```

**See:** [docs/AFP_QUICK_START.md](../AFP_QUICK_START.md) for five forces details and examples.

---

## Via Negativa Analysis

**Can you DELETE or SIMPLIFY existing code instead of adding?**

What existing code did you examine for deletion/simplification?
- File/function 1: [examined, could/couldn't be deleted because...]
- File/function 2: [examined, could/couldn't be simplified because...]

**If you must add code, why is deletion/simplification insufficient?**

[Explain why via negativa doesn't work here]

---

## Refactor vs Repair Analysis

**Are you patching a symptom or refactoring the root cause?**

- Is this a PATCH/WORKAROUND or a PROPER FIX? [which and why?]
- If modifying file >200 LOC or function >50 LOC: Did you consider refactoring the WHOLE module? [yes/no and reasoning]
- What technical debt does this create (if any)? [be honest]

---

## Alternatives Considered

**List 2-3 approaches you evaluated:**

### Alternative 1: [Deletion/Simplification Approach]
- What: [describe approach]
- Pros: [benefits]
- Cons: [drawbacks]
- Why not selected: [reasoning]

### Alternative 2: [Refactoring Approach]
- What: [describe approach]
- Pros: [benefits]
- Cons: [drawbacks]
- Why not selected: [reasoning]

### Selected Approach: [Your Choice]
- What: [describe your selected approach]
- Why: [why this is best given trade-offs]
- How it aligns with AFP/SCAS: [specific principles]

---

## Complexity Analysis

**How does this change affect complexity?**

- **Complexity increases:** [where and why?]
  - Is this increase JUSTIFIED? [yes/no and why]
  - How will you MITIGATE this complexity? [strategy]

- **Complexity decreases:** [where and how?]
  - What are you simplifying/removing?

- **Trade-offs:** [necessary complexity vs unnecessary]

**Remember:** Not all complexity is bad. But it must be WORTH IT.

---

## Implementation Plan

**Scope:**
- Files to change: [list, e.g., "3 files: cache_manager.ts (refactor), cache_utils.ts (delete), tests/cache.test.ts (update)"]
- PLAN-authored tests: [list the tests you created/updated during PLAN; include status (failing/skipped acceptable) and any N/A justification]
- Autopilot scope: [If touching Wave 0/autopilot, list the live runs you will execute (`npm run wave0`, TaskFlow wave0-smoke, telemetry checks)]
- Estimated LOC: +[X] -[Y] = net [Z] LOC
- Micro-batching compliance: [≤5 files? ≤150 net LOC? If not, how will you split?]

**Risk Analysis:**
- Edge cases: [what edge cases must you handle?]
- Failure modes: [what could go wrong?]
- Testing strategy: [how will you verify this works?]

**Assumptions:**
- [List assumptions you're making]
- [What happens if these assumptions are wrong?]

---

## Review Checklist (Self-Check)

Before implementing, verify:

- [ ] I explored deletion/simplification (via negativa)
- [ ] If adding code, I explained why deletion won't work
- [ ] If modifying large files/functions, I considered full refactoring
- [ ] I documented 2-3 alternative approaches
- [ ] Any complexity increases are justified and mitigated
- [ ] I estimated scope (files, LOC) and it's within limits
- [ ] I thought through edge cases and failure modes
- [ ] I authored the verification tests during PLAN (listed above) and have a testing strategy
- [ ] If autopilot work, I defined the Wave 0 live loop (commands + telemetry) that VERIFY will execute

**If ANY box unchecked:** Revisit your design. You're not ready to implement.

---

## Notes

- 2025-11-06: Implementation refines the CLI into separate `collect`, `files`, and `ui` helpers so every file stays under the 150 LOC AFP guardrail while keeping the root `wave0_status` entry point tiny.

---

**Design Date:** [YYYY-MM-DD]
**Author:** [Your name/agent ID]

---

## GATE Review Tracking

**GATE is ITERATIVE - expect multiple rounds:**

### Review 1: [Date]
- **DesignReviewer Result:** [pending/needs-revision/approved]
- **Concerns Raised:** [list any concerns]
- **Remediation Task:** [TASK-ID-REMEDIATION-XXX if created]
- **Time Spent:** [hours on remediation work]

### Review 2: [Date] (if needed)
- **DesignReviewer Result:** [pending/needs-revision/approved]
- **Concerns Raised:** [list any concerns]
- **Remediation Task:** [TASK-ID-REMEDIATION-XXX if created]
- **Time Spent:** [hours on remediation work]

### Review 3: [Date] (if needed)
- **DesignReviewer Result:** [pending/needs-revision/approved]
- **Final Approval:** [yes/no]
- **Total GATE Effort:** [X hours across all reviews + remediation]

**IMPORTANT:** If DesignReviewer finds issues, you MUST:
1. Create remediation task (new STRATEGIZE→MONITOR cycle)
2. Do actual research/exploration (30-60 min per critical issue)
3. **Update UPSTREAM phase artifacts** (strategy, spec, plan docs)
   - Via negativa concern → revise PLAN to show deletion analysis
   - Refactor concern → revise STRATEGY to target root cause
   - Alternatives concern → revise SPEC with new requirements
4. Update design.md with revised approach (reflects upstream changes)
5. Re-submit for review

**Superficial edits to pass GATE = compliance theater = rejected.**

**Remember:** design.md is a SUMMARY of phases 1-4. If DesignReviewer finds
fundamental issues, you may need to GO BACK and revise your strategy, spec, or
plan. This is EXPENSIVE but NECESSARY to ensure quality. GATE enforces that
implementation is based on SOLID thinking, not rushed assumptions.
