# Task Brief: Review seven_lens_evaluator.ts

**Task ID**: AFP-GATE-TEST-REVIEW-SEVENLENS-20251105

**Parent**: AFP-GATE-TEST-MACRO-20251105

**Complexity**: Simple

**Estimated Time**: 2-3 hours (including GATE)

---

## Objective

Review `tools/wvo_mcp/src/orchestrator/seven_lens_evaluator.ts` for AFP/SCAS alignment issues and implement improvements.

**Focus Areas:**
1. Hardcoded keywords (lines 113-120)
2. No decision persistence (lines 66-96)
3. Missing validation (line 66)

---

## Findings from Exploration

**File**: `tools/wvo_mcp/src/orchestrator/seven_lens_evaluator.ts`

**Size**: 784 LOC

**Issues Identified:**

### Issue 1: Hardcoded Keywords (AFP Violation)
**Location**: Lines 113-120

**Current Code:**
```typescript
const pocValidationKeywords = [
  'poc', 'proof of concept', 'validate model', 'model validation',
  'alpha test', 'feasibility', 'experiment', 'prototype',
  'mvp', 'minimum viable product', 'spike', 'exploratory'
];
```

**Problem:**
- Keywords define task priority but are hardcoded in source
- No way to update without code change
- Typos in task titles cause scoring failures
- Doesn't handle domain-specific terminology
- Violates "configuration > code" principle

**Impact:** Brittle scoring, difficult to tune

### Issue 2: No Decision Persistence
**Location**: Lines 66-96

**Current Behavior:**
- `evaluateTask()` runs all 12 lenses every time
- No caching of evaluation results
- If task evaluated twice, scores could differ
- No audit trail of how task was scored at decision time

**Problem:**
- Non-deterministic decisions (context changes between evaluations)
- Can't debug why a task was prioritized in the past
- Wastes computation re-evaluating same task

**Impact:** Unreliable prioritization, no audit trail

### Issue 3: Missing Validation
**Location**: Line 66

**Current Code:**
```typescript
async evaluateTask(task: Task, context?: any): Promise<SevenLensResult>
```

**Problem:**
- Context parameter is `any` - could pass malformed data
- No validation of task fields before evaluation
- Lens evaluations use optional chaining without null checks

**Impact:** Runtime errors possible, unclear contract

---

## Expected Improvements

### Improvement 1: Extract Keywords to Configuration
**Approach:**
- Create `tools/wvo_mcp/config/lens_keywords.json`
- Load keywords at initialization
- Add validation of keyword format
- Document keyword update process

**Estimated LOC:** +50 (config file + loader) -15 (removed hardcoded array) = +35 net

### Improvement 2: Add Decision Caching
**Approach:**
- Create `TaskEvaluationCache` class
- Cache results with task ID + context hash
- Store to `state/lens_evaluations.jsonl` for audit
- Add TTL (time-to-live) for cache entries

**Estimated LOC:** +80 (cache class) +20 (integration) = +100 net

### Improvement 3: Add Context Validation
**Approach:**
- Define `LensContext` interface
- Add validation function `validateLensContext()`
- Replace `any` with typed interface
- Add error handling for invalid context

**Estimated LOC:** +30 (interface + validation) +10 (type fixes) = +40 net

**Total Estimated:** +175 net LOC

---

## Alternatives to Consider (for GATE)

### Alternative 1: Minimal Fix (Validation Only)
- Only add context validation
- Skip persistence and configuration extraction
- Fastest to implement (~1 hour)
- **Trade-off:** Leaves hardcoding and non-determinism issues

### Alternative 2: Full Refactor (All 3 Improvements)
- All improvements as described above
- Most thorough fix
- ~4-5 hours to implement
- **Trade-off:** Approaches micro-batching limit (+175 LOC)

### Alternative 3: Two-Phase Approach
- **Phase 1:** Extract keywords + add validation (~2 hours)
- **Phase 2:** Add caching in separate task
- Splits work into manageable batches
- **Trade-off:** Two GATE reviews instead of one

---

## Success Criteria

**Code Quality:**
- ✅ No hardcoded business logic (keywords extracted)
- ✅ Evaluation results are deterministic (with caching)
- ✅ Context is validated (no `any` types)
- ✅ Tests pass
- ✅ No regressions in task scoring

**GATE Process:**
- ✅ design.md created before implementation
- ✅ DesignReviewer passes (or remediation done)
- ✅ Via negativa explored (can we delete anything?)
- ✅ Alternatives documented (3 approaches above)
- ✅ Complexity justified (why +175 LOC is worth it)

**Metrics Collection:**
- ✅ Time spent on GATE documented
- ✅ Remediation cycles tracked
- ✅ Implementation matches design
- ✅ Usability feedback recorded

---

## GATE Checkpoint

**Before implementing:**

1. **Create design.md** from template
2. **Fill all sections:**
   - Context: Why these 3 issues matter
   - Via Negativa: Can we DELETE instead of adding keywords/cache?
   - Refactor vs Repair: Are we patching or fixing root cause?
   - Alternatives: Evaluate the 3 approaches above
   - Complexity: Justify +175 LOC
   - Implementation Plan: Break into steps

3. **Run DesignReviewer:**
   ```bash
   cd tools/wvo_mcp && npm run gate:review AFP-GATE-TEST-REVIEW-SEVENLENS-20251105
   ```

4. **If blocked:** Create remediation task, do research, update design

5. **When approved:** Proceed to implementation

---

## Files to Review

**Primary:**
- `tools/wvo_mcp/src/orchestrator/seven_lens_evaluator.ts` (784 LOC)

**Related (for context):**
- `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts` (calls evaluator)
- `tools/wvo_mcp/tests/` (existing tests to update)

---

## Deliverables

1. **design.md** - GATE document (expect 150-200 LOC)
2. **Code changes** - Improvements to seven_lens_evaluator.ts
3. **Tests** - Updated/new tests for validation and caching
4. **metrics.yaml** - GATE effectiveness metrics
5. **summary.md** - Findings and recommendations

---

## Notes

**This is a genuine code review task**, not a synthetic test:
- Real issues found by automated exploration
- Improvements have real value (better scoring reliability)
- AFP/SCAS principles apply naturally (configuration > hardcoding, caching > recomputation)

**GATE testing value:**
- Simple enough to complete in one session
- Complex enough to exercise GATE meaningfully
- Clear alternatives for trade-off analysis
- Measurable outcomes (issues fixed, tests passing)

---

**Ready to start: Create design.md and run through GATE.**
