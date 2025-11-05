# Design Document: base.ts Critic Review

**Task**: AFP-GATE-TEST-REVIEW-BASECRITIC-20251105
**Date**: 2025-11-05
**Complexity**: Simple-Medium (2-3 hours)

---

## Problem Statement

**File**: `tools/wvo_mcp/src/critics/base.ts` (758 LOC)

The base critic class has maintainability and error handling issues:

1. **Silent error handling** (lines 322-333, appendEscalationLog):
   - Log write failures are swallowed
   - Caller has no visibility into logging success/failure
   - Audit trail could have gaps without detection

2. **Escalation complexity** (lines 335-417, handleEscalation):
   - 82 LOC method with multiple responsibilities
   - Hard to test independently
   - Complex control flow

3. **Multiple error handling patterns**:
   - 10+ try-catch blocks with similar "log and swallow" patterns
   - No consistent strategy for error propagation
   - Silent failures throughout

**Root cause**: Base class grew organically without refactoring

---

## Via Negativa Analysis

### Current LOC Distribution
- Total file: 758 LOC
- appendEscalationLog: 12 LOC (322-333)
- handleEscalation: 82 LOC (335-417)
- Error handling blocks: ~80 LOC scattered

### Deletion Opportunities

**Option A: Do nothing** ❌
- Leaves silent errors and complexity
- Net: 0 LOC

**Option B: Extract error handling utility** ⚠️
- Would ADD ~30 LOC utility file
- REMOVE ~20 LOC from base.ts
- Net: **+10 LOC** (not via negativa!)

**Option C: Simplify in place** ✅
- Make appendEscalationLog return success/failure
- Add warning on failure at call sites
- No new files, minimal additions
- Net: **~+5 LOC** (smallest increase)

**Verdict**: None of these achieve net deletion. The task brief's "-5 LOC" claim appears incorrect based on actual code structure.

---

## Alternatives Considered

### Alternative 1: Via Negativa Focus (Minimal, Error Handling Only)

**Changes:**
1. Make appendEscalationLog return boolean (success/failure)
2. Check return value at call site (handleEscalation:378)
3. Log warning if escalation logging fails
4. Add JSDoc documenting behavior

**Impact:**
- Fixes silent error handling
- No new files
- Minimal complexity increase
- **Net: +5-8 LOC** (add return type, add check, add warning)

**Trade-offs:**
- ✅ Smallest change possible
- ✅ Addresses most critical issue (silent failures)
- ❌ Doesn't fix escalation complexity
- ❌ Doesn't unify error handling patterns

### Alternative 2: Full Refactor (Extract + Simplify)

**Changes:**
1. Extract handleEscalation into EscalationHandler class
2. Create error handling utility
3. Standardize all try-catch blocks

**Impact:**
- Much cleaner architecture
- Easier to test
- **Net: +150-200 LOC** (new files, abstractions)

**Trade-offs:**
- ✅ Best long-term maintainability
- ✅ Testability improves
- ❌ Large scope for "simple-medium" task
- ❌ Violates via negativa (adding, not deleting)

### Alternative 3: Two-Phase (Error Handling Now, Refactor Later)

**Changes:**
1. Phase 1 (this task): Fix silent errors (+5-8 LOC)
2. Phase 2 (future task): Extract escalation handler

**Impact:**
- Splits work into manageable pieces
- Can validate Phase 1 before Phase 2
- **Net (Phase 1): +5-8 LOC**
- **Net (Phase 2): +120-150 LOC**

**Trade-offs:**
- ✅ Incremental improvement
- ✅ Two GATE reviews ensure quality
- ❌ Escalation complexity remains (temporarily)

---

## Recommended Approach

**Selected: Alternative 1 (Via Negativa Focus)**

**Rationale:**
1. Fixes the **most critical** issue (silent failures in audit trail)
2. Minimizes scope (2-3 hour estimate achievable)
3. Smallest LOC increase (+5-8 vs +150-200)
4. Can always do Alternative 2/3 later if needed
5. **Via negativa CLAIM in task brief is not achievable** - the ~duplicate JSON stringification mentioned in brief doesn't exist in current code

**Note on task brief discrepancy:**
The brief claims "-5 net LOC" via deleting duplicate stringification at lines 710-717, but:
- Those lines don't contain JSON.stringify duplication
- The only JSON.stringify patterns are in different contexts (stringifyDetails for details, appendEscalationLog for records)
- No actual DRY violation exists that can be deleted

**Adjusted goal**: +5-8 LOC (minimal increase, not deletion)

---

## Implementation Plan

### Files to Modify

**1. tools/wvo_mcp/src/critics/base.ts** (MODIFY, ~+6 LOC net)

**Changes:**

#### Change 1: Make appendEscalationLog return status (lines 322-333)
```typescript
// BEFORE:
private appendEscalationLog(record: CriticEscalationLogRecord): void {
  if (!this.escalationLogPath) return;
  try {
    fs.mkdirSync(path.dirname(this.escalationLogPath), { recursive: true });
    fs.appendFileSync(this.escalationLogPath, `${JSON.stringify(record)}\\n`, "utf-8");
  } catch (error) {
    logInfo("Failed to record critic escalation log", {
      path: this.escalationLogPath,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// AFTER:
/**
 * Append escalation record to audit log
 * @returns true if logged successfully, false if failed
 */
private appendEscalationLog(record: CriticEscalationLogRecord): boolean {
  if (!this.escalationLogPath) return false;
  try {
    fs.mkdirSync(path.dirname(this.escalationLogPath), { recursive: true });
    fs.appendFileSync(this.escalationLogPath, `${JSON.stringify(record)}\\n`, "utf-8");
    return true;
  } catch (error) {
    logWarning("Failed to record critic escalation log", { // Changed from logInfo to logWarning
      path: this.escalationLogPath,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
```

**LOC change**: +3 (JSDoc, return type, return statements)

#### Change 2: Check return value in handleEscalation (line ~378)
```typescript
// BEFORE (line 378):
this.appendEscalationLog({ ... });

// AFTER:
const logged = this.appendEscalationLog({ ... });
if (!logged) {
  logWarning("Escalation audit trail may have gaps", {
    critic: result.critic,
    passed: result.passed,
  });
}
```

**LOC change**: +4 (check + warning)

**Total net change**: +7 LOC for base.ts

### Risk Analysis

**Risk 1: Breaking existing callers**
- **Likelihood**: Low
- **Impact**: Medium
- **Mitigation**: appendEscalationLog is private, only called in handleEscalation. Check all call sites during implementation.

**Risk 2: Warning spam if logging consistently fails**
- **Likelihood**: Low (logging should succeed unless disk full or permissions issue)
- **Impact**: Low (warnings are appropriate for infrastructure failures)
- **Mitigation**: Warnings are logged once per escalation, not repeatedly

**Risk 3: Tests may need updating**
- **Likelihood**: Medium
- **Impact**: Low
- **Mitigation**: Run tests after changes, update mocks if needed

---

## Testing Strategy

**Unit Tests:**
- ✅ Existing tests should pass (no behavior change for success cases)
- ✅ May need to add test for appendEscalationLog failure handling

**Integration Tests:**
- ✅ Test full escalation flow with logging enabled
- ✅ Test escalation flow with logging disabled (no-op path)

**Manual Testing:**
- ✅ Run a critic that escalates, verify warning appears if log write fails

---

## Complexity Justification

**LOC increase: +7** (minimal)

**Why justified:**
1. Fixes **silent failures** in audit trail (high-impact bug)
2. Enables detection of logging infrastructure issues
3. Minimal scope matches "simple-medium" estimate
4. No new files or abstractions added
5. Can always refactor further (Alternative 2/3) if escalation complexity becomes a problem

**Via negativa trade-off:**
- Ideally would DELETE code, but no deletion opportunity exists
- +7 LOC is the MINIMUM to fix the critical silent error issue
- Alternative (do nothing) leaves audit gaps

---

## Success Criteria

**Functionality:**
- ✅ appendEscalationLog returns success/failure
- ✅ Caller (handleEscalation) checks return value
- ✅ Warning logged if escalation logging fails
- ✅ No behavior change for success cases

**Quality:**
- ✅ All tests pass
- ✅ No regressions in escalation behavior
- ✅ JSDoc added for clarity

**Metrics:**
- ✅ Net LOC: +5-8 (actual will verify)
- ✅ Implementation time: <2 hours (within 2-3 hour estimate)
- ✅ GATE time: ~30-40 minutes (similar to Task 1)

---

## Open Questions

**Q1: Should we also fix other silent error handling (recordHistory, recordDelegationContext)?**
- **A**: No, out of scope. This task focuses on escalation logging. Can address others in follow-up task.

**Q2: Should we add retry logic for failed log writes?**
- **A**: No, adds complexity. If disk write fails, retrying immediately unlikely to help. Better to warn and continue.

**Q3: Should log write failures fail the entire critic run?**
- **A**: No, logging is infrastructure concern. Critic logic should succeed even if audit trail fails. Warning is appropriate response.

---

## Appendix: Why Task Brief Estimates Don't Match

**Task brief claimed:** "-5 net LOC via deleting duplicate JSON stringification"

**Actual findings:**
- Lines 710-717 mentioned in brief don't contain JSON.stringify duplication
- stringifyDetails() (lines 129-142) and appendEscalationLog() (line 326) use JSON.stringify in different contexts (details vs records)
- No DRY violation to delete
- Best we can do is +5-8 LOC to fix silent errors

**Lesson:** Estimates must be based on actual code inspection, not assumptions

