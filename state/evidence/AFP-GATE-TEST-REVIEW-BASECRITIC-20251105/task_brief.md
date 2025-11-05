# Task Brief: Review base.ts Critic

**Task ID**: AFP-GATE-TEST-REVIEW-BASECRITIC-20251105

**Parent**: AFP-GATE-TEST-MACRO-20251105

**Complexity**: Simple-Medium

**Estimated Time**: 2-3 hours (including GATE)

---

## Objective

Review `tools/wvo_mcp/src/critics/base.ts` for code duplication and error handling gaps.

**Focus Areas:**
1. Duplicate JSON stringification (lines 121-141, 710-717)
2. Escalation complexity (lines 335-417)
3. Silent error handling (lines 324-332)

---

## Findings from Exploration

**File**: `tools/wvo_mcp/src/critics/base.ts`

**Size**: 758 LOC

**Issues Identified:**

### Issue 1: Duplicate JSON Stringification
**Locations**: Lines 121-141 and 710-717

**Current Code:**
```typescript
// Line 121-141: stringifyDetails()
private stringifyDetails(details: unknown): string {
  try {
    return JSON.stringify(details, null, 2);
  } catch (error) {
    logWarning("Failed to stringify details", { error });
    return String(details);
  }
}

// Line 710-717: buildTaskDescription()
try {
  return JSON.stringify(evidence, null, 2);
} catch {
  return String(evidence);
}
```

**Problem:**
- Nearly identical logic in two places
- Second implementation has weaker error handling (no logging)
- Classic DRY violation

**Via Negativa Opportunity:** Can we DELETE one and reuse the other?

### Issue 2: Escalation Complexity
**Location**: Lines 335-417 (82 LOC function!)

**Current Structure:**
- `handleEscalation()` does 4 different things:
  1. Determine if escalation needed
  2. Resolve delegated tasks if passing
  3. Create context entries
  4. Log results

**Problem:**
- Too many responsibilities in one method
- Hard to test each concern independently
- Difficult to understand control flow

**Refactor Opportunity:** Extract `EscalationHandler` class?

### Issue 3: Silent Error Handling
**Location**: Lines 324-332

**Current Code:**
```typescript
} catch (error) {
  logInfo("Failed to record critic escalation log", { error });
  // Error swallowed - user won't know logging failed
}
```

**Problem:**
- Escalation log failure is silent to caller
- Can't distinguish between "logged successfully" and "logging failed"
- No way to retry or alert on persistent failures

**Impact:** Audit trail could have gaps without anyone knowing

---

## Expected Improvements

### Improvement 1: Extract Shared Utility (Via Negativa!)
**Approach:**
- DELETE duplicate code
- Create `utils/safe_stringify.ts` with enhanced version
- Add configurable logging level
- Reuse in both places

**Estimated LOC:** +15 (utility) -20 (removed duplicates) = **-5 net LOC** ✅

### Improvement 2: Extract EscalationHandler Class
**Approach:**
- Create `critics/escalation_handler.ts`
- Move resolution logic to `resolvePassingDelegates()`
- Move context creation to `createEscalationContext()`
- Keep coordination in base.ts

**Estimated LOC:** +120 (new class) -40 (extracted from base.ts) = +80 net LOC

### Improvement 3: Improve Error Propagation
**Approach:**
- Return `{success: boolean, error?: string}` from logging functions
- Let caller decide whether to fail or continue on log errors
- Add warning if escalation log fails

**Estimated LOC:** +25 (enhanced error handling) = +25 net LOC

**Total Estimated:** +100 net LOC

---

## Alternatives to Consider

### Alternative 1: Via Negativa Focus (Minimal Changes)
- **Only** fix duplicate code (Improvement 1)
- Skip escalation refactor and error handling changes
- **Net: -5 LOC** (actual deletion!)
- **Trade-off:** Leaves complexity and silent errors

### Alternative 2: Full Refactor (All 3 Improvements)
- Extract utilities, refactor escalation, improve errors
- Most thorough cleanup
- **Net: +100 LOC**
- **Trade-off:** More code to review and test

### Alternative 3: Two-Phase (Duplication Now, Refactor Later)
- Phase 1: Extract utilities + improve error handling
- Phase 2: Refactor escalation in separate task
- Splits complexity
- **Trade-off:** Two GATE reviews

---

## Success Criteria

**Code Quality:**
- ✅ No duplicate JSON stringification logic
- ✅ Error handling is explicit (caller knows if logging failed)
- ✅ Escalation logic easier to understand
- ✅ Tests pass, no regressions

**GATE Process:**
- ✅ Via negativa explored (Improvement 1 is NET DELETION!)
- ✅ Alternatives documented and justified
- ✅ If choosing +100 LOC path, complexity increase justified

**Metrics:**
- ✅ GATE time tracked
- ✅ Remediation cycles documented
- ✅ Implementation matches design

---

## GATE Highlight

**This task is perfect for testing via negativa enforcement:**
- Clear deletion opportunity (duplicate code)
- Alternative 1 achieves NET -5 LOC
- DesignReviewer should recognize and prefer this option
- Tests whether GATE actually enforces simplification

---

## Deliverables

1. design.md
2. Code improvements (via negativa preferred!)
3. Tests
4. metrics.yaml
5. summary.md

---

**Start with GATE:** Create design.md, evaluate alternatives, run DesignReviewer.
