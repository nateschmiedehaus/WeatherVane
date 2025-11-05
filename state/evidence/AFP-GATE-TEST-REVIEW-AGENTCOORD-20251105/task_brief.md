# Task Brief: Review agent_coordinator.ts

**Task ID**: AFP-GATE-TEST-REVIEW-AGENTCOORD-20251105

**Parent**: AFP-GATE-TEST-MACRO-20251105

**Complexity**: Medium-Complex

**Estimated Time**: 4-5 hours (including GATE)

---

## Objective

Review `tools/wvo_mcp/src/orchestrator/agent_coordinator.ts` to remove `@ts-nocheck`, fix hardcoded costs, and improve type safety.

**Focus Areas:**
1. @ts-nocheck suppressing all type errors (line 1)
2. Hardcoded model costs (lines 48-52)
3. Incomplete error handling in cost estimation (lines 65-95)

---

## Findings from Exploration

**File**: `tools/wvo_mcp/src/orchestrator/agent_coordinator.ts`

**Size**: 1,217 LOC

**Issues Identified:**

### Issue 1: @ts-nocheck (CRITICAL TYPE DEBT)
**Location**: Line 1

**Current:**
```typescript
// @ts-nocheck - Legacy MCP architecture file with incompatible types
```

**Problem:**
- Suppresses ALL type checking for 1,200+ lines
- Hidden type errors could cause runtime failures
- No way to know what types are actually wrong
- Prevents safe refactoring

**Impact:** Technical debt bomb - any type errors are invisible

### Issue 2: Hardcoded Model Costs
**Locations**: Lines 48-52

**Current Code:**
```typescript
const MODEL_COST_TABLE: Record<string, { prompt: number; completion: number }> = {
  'gpt-5-codex': { prompt: 0.012, completion: 0.024 },
  'gpt-5': { prompt: 0.012, completion: 0.03 },
  claude_code: { prompt: 0.011, completion: 0.033 },
};
```

**Problems:**
- Model prices change frequently - hardcoding makes updates difficult
- String keys don't match naming conventions elsewhere
- No version/date metadata on prices
- Should be from ModelManager, not duplicated here

**Impact:** Cost estimates silently become inaccurate over time

### Issue 3: Incomplete Cost Estimation Error Handling
**Locations**: Lines 65-95

**Current Behavior:**
- Line 82: Returns undefined if `Number.isFinite()` fails (no logging)
- Lines 90-93: Falls back to hardcoded table without warning
- No indication to caller that estimate might be stale/wrong

**Problem:** Silently produces wrong estimates

---

## Expected Improvements

### Improvement 1: Remove @ts-nocheck (MUST DO!)
**Approach:**
1. Remove @ts-nocheck line
2. Run `tsc --noEmit` to see actual type errors
3. Fix errors one by one:
   - Add missing type annotations
   - Fix incompatible types
   - Add proper interfaces
4. Re-enable type checking

**Estimated LOC:** +50 (type annotations) -1 (remove @ts-nocheck) = +49 net LOC

**Note:** This is technical debt paydown - hard to avoid

### Improvement 2: Extract Model Pricing to Manager
**Approach:**
- Create `ModelPricingManager` class
- Load prices from configuration file
- Add version/timestamp metadata
- Use from AgentCoordinator

**Estimated LOC:** +80 (new class) +10 (config file) -40 (removed hardcoded table) = +50 net LOC

### Improvement 3: Improve Cost Estimation Logging
**Approach:**
- Log when falling back to hardcoded prices
- Log when estimates fail
- Return `{cost: number, confidence: 'high' | 'medium' | 'low'}` to indicate accuracy

**Estimated LOC:** +30 (enhanced logging + confidence) = +30 net LOC

**Total Estimated:** +129 net LOC

⚠️ **Micro-batching alert:** This approaches +150 LOC limit. May need to split into 2 batches.

---

## Alternatives to Consider

### Alternative 1: Two-Phase Approach (RECOMMENDED)
**Phase 1: Remove @ts-nocheck** (this task)
- Just fix type errors
- Don't extract pricing yet
- **Net: ~+50 LOC**

**Phase 2: Extract Pricing** (separate task)
- Create ModelPricingManager
- Improve estimation logging
- **Net: ~+80 LOC**

**Why:** Splits work into manageable batches, each under limit

### Alternative 2: Full Fix (Risk Exceeding Limit)
- All 3 improvements in one go
- **Net: ~+130 LOC**
- **Risk:** May trigger micro-batching violation
- **Trade-off:** One GATE review vs two

### Alternative 3: @ts-nocheck Only (Minimal)
- Just remove type suppression, fix errors
- Leave pricing for later
- **Net: ~+50 LOC**
- **Trade-off:** Incomplete, but addresses critical type debt

---

## Success Criteria

**Code Quality:**
- ✅ No @ts-nocheck (type safety restored!)
- ✅ Model costs from centralized source
- ✅ Cost estimation errors logged
- ✅ All type checks pass

**GATE Process:**
- ✅ Micro-batching considered (likely requires split)
- ✅ Alternatives evaluate one-phase vs two-phase
- ✅ If two-phase, design.md focuses on Phase 1 only

**GATE Test Value:**
- Tests GATE at micro-batching limits
- Forces careful scope management
- Tests whether DesignReviewer catches oversized plans

---

## Deliverables

1. design.md (likely recommends two-phase approach)
2. Code improvements (Phase 1 or both)
3. Tests for type safety
4. metrics.yaml
5. summary.md

---

**Key GATE Question:** Should this be one task or two? Design document must justify the split decision.
