# Design: AFP-GATE-REVIEWER-FIX-20251105

> **Purpose:** Fix run_design_review.ts to invoke intelligent DesignReviewer critic
> **Parent Task:** AFP-GATE-VIA-NEGATIVA-20251105
> **Criticality:** BLOCKING - must fix before empirical testing can proceed

---

## Context

**What problem are you solving and WHY?**

**Problem:** `run_design_review.ts` does basic structural checks only. Does NOT invoke intelligent DesignReviewer critic.

**Current behavior:**
- Checks sections exist ✅
- Checks content not empty ✅
- Checks checklist marked ✅
- **NEVER calls design_reviewer.ts** ❌

**Impact:** Current `npm run gate:review` can be trivially gamed with superficial content.

**Root cause:** When I created run_design_review.ts in AFP-GATE-COMPLIANCE-FIX-20251105, I implemented basic validation instead of calling the existing DesignReviewer critic.

**Evidence:** Discovered through dogfooding - tested GATE on AFP-GATE-VIA-NEGATIVA-20251105 task, passed immediately despite run_design_review.ts never calling DesignReviewer.

**Goal:** Make `npm run gate:review` invoke intelligent AFP/SCAS analysis so it actually enforces quality.

---

## Via Negativa Analysis

**Can you DELETE or SIMPLIFY existing code instead of adding?**

**Files examined:**

1. **tools/wvo_mcp/scripts/run_design_review.ts** (142 LOC)
   - Contains basic validation logic (parseSections, hasMeaningfulContent)
   - Could DELETE all of this, just call DesignReviewer
   - Verdict: YES - basic checks are redundant if DesignReviewer does comprehensive analysis

2. **tools/wvo_mcp/src/critics/design_reviewer.ts** (578 LOC)
   - Already exists with full intelligence
   - Already has AFP/SCAS analysis
   - Just needs to be INVOKED
   - Verdict: Perfect for reuse, no changes needed

**Via negativa approach:**

DELETE 100+ LOC of basic validation → REPLACE with single DesignReviewer call

**Net effect:** -100 LOC, +20 LOC = -80 net LOC

This is actual via negativa!

---

## Refactor vs Repair Analysis

**Are you patching a symptom or refactoring the root cause?**

**This is a REFACTOR (replacing wrong implementation).**

**Root cause:** Script does wrong thing (basic checks instead of intelligent analysis)

**NOT a patch:**
- Not adding basic checks on top of intelligent ones
- Not wrapping DesignReviewer with fallback
- REPLACING basic implementation with correct one

**Why refactor:**
1. Basic checks insufficient (proven by testing)
2. DesignReviewer already exists (don't duplicate)
3. Reduces code (via negativa)
4. Fixes fundamental design flaw

**Technical debt created:** None

**Technical debt reduced:**
- Removes redundant validation code
- Uses existing critic infrastructure
- Eliminates gaming vulnerability

---

## Alternatives Considered

### Alternative 1: Keep Basic Checks + Add DesignReviewer

**What:** Run basic checks first, then call DesignReviewer if pass

**Pros:**
- Fast failure for structural issues
- Layered validation

**Cons:**
- More complex (two validation layers)
- More code to maintain
- Unclear which layer caught what
- Optimization we don't need (DesignReviewer is fast enough)

**Why not selected:** Over-engineering. DesignReviewer can check structure AND quality.

### Alternative 2: Enhance Basic Checks

**What:** Add AFP/SCAS logic to run_design_review.ts

**Pros:**
- Self-contained script
- No dependencies on critic

**Cons:**
- Duplicates design_reviewer.ts logic (578 LOC)
- Maintenance nightmare (two implementations drift)
- Violates DRY principle
- More code (opposite of via negativa)

**Why not selected:** Exactly wrong direction. We need LESS code, not duplicate implementation.

### Selected Approach: Replace with DesignReviewer Call

**What:** Delete basic checks, invoke DesignReviewer critic, format output

**Pros:**
- Reuses existing intelligence (578 LOC)
- Net deletion (-80 LOC)
- Single source of truth
- Gets all AFP/SCAS checks (file verification, depth analysis, etc.)
- Consistent with critic architecture

**Cons:**
- Adds dependency on critic module
- Slightly more complex imports

**Why this is best:**
- Via negativa (delete 100 LOC)
- DRY principle (reuse, don't duplicate)
- Fixes root cause (wrong implementation)
- Unblocks empirical testing

**How it aligns with AFP/SCAS:**
- **Via negativa:** Deleting redundant code
- **Refactor not repair:** Replacing wrong implementation
- **Requisite variety:** Using existing intelligence instead of duplicating
- **High feedback density:** DesignReviewer provides detailed, actionable feedback

---

## Complexity Analysis

**How does this change affect complexity?**

### Complexity Decreases

**Code complexity:**
- DELETE: parseSections(), hasMeaningfulContent(), manual section checking (100 LOC)
- ADD: DesignReviewer import + invocation (20 LOC)
- **Net: -80 LOC**

**Conceptual complexity:**
- Before: "What checks does run_design_review.ts do? Are they enough?"
- After: "It calls DesignReviewer" (single source of truth)

**Maintenance complexity:**
- Before: Keep basic checks in sync with DesignReviewer expectations
- After: Only maintain DesignReviewer (one place)

### Complexity Increases

**Dependency complexity:**
- Before: Self-contained script (no imports)
- After: Depends on design_reviewer.ts module

**Is this justified?** YES

**Reasoning:**
- DesignReviewer is in same codebase
- Import is simple (ESM)
- Benefit (intelligent checks) far outweighs cost (one import)

**Mitigation:** None needed - this is appropriate coupling.

### Trade-offs

**Necessary complexity:**
- Import DesignReviewer class (1 line)
- Instantiate with workspace root (1 line)
- Call reviewDesign() (1 line)
- Format output (15 lines)

**Unnecessary complexity avoided:**
- Duplicating 578 LOC of validation logic
- Maintaining two implementations
- Keeping basic checks in sync with intelligent ones

**Net effect:** Significant complexity reduction (-80 LOC, single source of truth)

---

## Implementation Plan

### Scope

**Files to change:**
1. `tools/wvo_mcp/scripts/run_design_review.ts` - refactor to call DesignReviewer (~-100 +20 LOC)

**Estimated LOC:** +20 -100 = net -80 LOC

**Micro-batching compliance:** ✅ 1 file, -80 net LOC (well within limits)

### Implementation Steps

1. **Import DesignReviewer:**
   ```typescript
   import { DesignReviewerCritic } from '../src/critics/design_reviewer.js';
   ```

2. **Replace validation logic with DesignReviewer call:**
   ```typescript
   const reviewer = new DesignReviewerCritic(repoRoot);
   const result = await reviewer.reviewDesign(taskId);
   ```

3. **Format output:**
   - If passed: Success message with approval
   - If failed: Format concerns with severity, guidance, remediation instructions

4. **Preserve exit codes:**
   - 0: Approved
   - 1: Needs revision (has concerns)
   - 2: Error (design.md not found)

5. **Delete redundant code:**
   - parseSections()
   - hasMeaningfulContent()
   - REQUIRED_SECTIONS array
   - Manual section iteration

### Risk Analysis

**Edge cases:**
1. DesignReviewer throws exception
   - Mitigation: try-catch, show error, exit 2

2. Task ID doesn't exist
   - Mitigation: Already handled (design.md not found → exit 2)

3. DesignReviewer returns unexpected format
   - Mitigation: Type checking, safe property access

**Failure modes:**
1. Import fails (module not found)
   - Prevention: Test import before committing
   - Detection: TypeScript compile error

2. DesignReviewer behavior differs from expectations
   - Prevention: Test on AFP-GATE-VIA-NEGATIVA-20251105 task
   - Detection: Manual verification of output

3. Output formatting breaks
   - Prevention: Preserve color codes, message structure
   - Detection: Visual inspection during testing

**Testing strategy:**
1. **Build:** `cd tools/wvo_mcp && npm run build`
2. **Test on AFP-GATE-VIA-NEGATIVA-20251105:**
   ```bash
   npm run gate:review AFP-GATE-VIA-NEGATIVA-20251105
   ```
3. **Verify:**
   - Calls DesignReviewer ✅
   - Shows intelligent feedback (not just basic checks) ✅
   - Logs to state/analytics/gate_reviews.jsonl ✅
   - Exit codes correct ✅

### Assumptions

1. **Assumption:** DesignReviewer works correctly
   - **If wrong:** Test and fix DesignReviewer separately

2. **Assumption:** ESM import works in tsx script
   - **If wrong:** Adjust import syntax or use require()

3. **Assumption:** repoRoot path resolves correctly
   - **If wrong:** Debug path resolution

---

## Review Checklist (Self-Check)

Before implementing, verify:

- [x] I explored deletion/simplification (via negativa)
  - Deleting 100 LOC of redundant basic checks ✅

- [x] If adding code, I explained why deletion won't work
  - Net deletion (-80 LOC) ✅
  - +20 LOC is to invoke existing intelligence

- [x] If modifying large files/functions, I considered full refactoring
  - Full refactor (replace implementation, not patch) ✅

- [x] I documented 2-3 alternative approaches
  - Alt 1: Keep basic + add DesignReviewer (over-engineering)
  - Alt 2: Enhance basic checks (code duplication)
  - Selected: Replace with DesignReviewer (via negativa)

- [x] Any complexity increases are justified and mitigated
  - Dependency complexity justified (reuse > duplicate)
  - Net complexity decrease (-80 LOC, single source of truth)

- [x] I estimated scope (files, LOC) and it's within limits
  - 1 file, -80 net LOC ✅

- [x] I thought through edge cases and failure modes
  - 3 edge cases, 3 failure modes, all mitigated

- [x] I have a testing strategy
  - Test on AFP-GATE-VIA-NEGATIVA-20251105
  - Verify intelligent feedback
  - Check JSONL logging

---

## Notes

**This fix unblocks empirical testing:**

Without this fix:
- `npm run gate:review` does superficial checks
- Agents can game with placeholder text
- Can't validate GATE enforcement effectiveness

With this fix:
- `npm run gate:review` does intelligent AFP/SCAS analysis
- File verification catches fake references
- Via negativa depth enforced
- Alternatives quality checked
- Can proceed with empirical testing

**Meta-observation:** Finding this bug through dogfooding validates the empirical testing approach. Measuring systems reveals their actual behavior, not assumed behavior.

---

**Design Date:** 2025-11-05
**Author:** Claude (Sonnet 4.5)

---

## GATE Review Tracking

### Review 1: 2025-11-05
- **DesignReviewer Result:** pending (will self-test)
- **Expected:** Should pass (this is straightforward refactor)
- **Time Spent:** ~30 minutes on design thinking

**Note:** Once I fix run_design_review.ts, I can test it on this very design.md!

**Recursive dogfooding:**
1. AFP-GATE-VIA-NEGATIVA-20251105 revealed bug
2. AFP-GATE-REVIEWER-FIX-20251105 documents fix
3. Fix enables testing both designs with intelligent reviewer
4. Validates entire GATE system

**This is how empirical testing should work:** Discover issue → Fix → Verify fix → Continue testing.
