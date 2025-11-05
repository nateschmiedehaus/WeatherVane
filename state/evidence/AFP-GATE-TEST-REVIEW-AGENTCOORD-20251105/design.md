# Design Document: agent_coordinator.ts Type Safety Restoration

**Task**: AFP-GATE-TEST-REVIEW-AGENTCOORD-20251105
**Date**: 2025-11-05
**Complexity**: Medium (4-5 hours)

---

## Problem Statement

The `agent_coordinator.ts` file has critical technical debt:

1. **@ts-nocheck on line 1** - Suppresses ALL type checking for 1,217 lines of code
2. **Silent cost fallback** - Falls back to hardcoded costs without logging (lines 85-94)
3. **~12 type errors** hidden by @ts-nocheck

This creates risk - type errors can cause runtime failures, and we have no visibility into cost estimation accuracy.

## Via Negativa Analysis

**Can we delete/simplify instead of adding?**
- YES! We can DELETE the @ts-nocheck directive (line 1)
- NO on the rest - we must ADD type annotations/guards to fix errors

**What complexity can we eliminate?**
- The @ts-nocheck itself is complexity (hides problems)
- Removing it reveals actual problems we can fix

## Refactor vs Repair

**Is this a patch or a refactoring?**
- This is **DEBT PAYDOWN** (mix of both)
- Removing @ts-nocheck is debt paydown (must do)
- Fixing type errors is repair (targeted fixes)
- Adding cost fallback logging is repair (observability gap)

**Justification:**
- @ts-nocheck is critical technical debt
- Type errors indicate real bugs (e.g., undefined access)
- Cost logging is a small observability improvement

## Alternatives Considered

### Alternative 1: Minimal Fix (CHOSEN)
**Scope:**
- Remove @ts-nocheck
- Fix ~12 type errors
- Add logging for cost fallback

**LOC estimate:** -1 (remove directive) +30 (type fixes) +5 (logging) = **+34 net LOC**

**Pros:**
- Well under 150 LOC limit
- Addresses critical debt
- Improves observability

**Cons:**
- Doesn't extract hardcoded costs to config (can do later)

**Why chosen:** Focused scope, stays under limit, addresses highest-priority issue

### Alternative 2: Full Refactoring
**Scope:**
- Remove @ts-nocheck
- Fix type errors
- Extract MODEL_COST_TABLE to config file
- Create ModelPricingManager

**LOC estimate:** +130 LOC

**Pros:**
- Eliminates all technical debt at once

**Cons:**
- Approaches 150 LOC limit (risky)
- Mixes debt paydown with feature work
- Higher complexity

**Why rejected:** Too much scope, violates micro-batching principle

### Alternative 3: Two-Phase Approach
**Phase 1:** Remove @ts-nocheck (this task)
**Phase 2:** Extract pricing (future task)

**Pros:**
- Clear separation of concerns
- Each phase well under limit

**Cons:**
- Two GATE reviews instead of one

**Why rejected:** Alternative 1 already fits in one batch, no need to split

## Complexity Analysis

**Does this increase or decrease complexity?**
- **Net DECREASE**
- Removing @ts-nocheck improves maintainability
- Type safety prevents bugs
- Small LOC increase justified by debt paydown

**LOC estimate:**
- Existing: 1,217 LOC
- Changes: +34 LOC
- Net: 1,251 LOC (+2.8%)

## Type Errors to Fix

Based on test compilation (removed line 1 temporarily), there are **12 type errors**:

### Error Category 1: `boolean` passed where `Agent` expected
**Lines:** 450, 476, 552, 1086
**Issue:** `this.agentPool.completeTask(task.id, false, ...)` - second param wrong type
**Fix:** Check AgentPool signature, pass correct type (likely needs agent object)

### Error Category 2: `string | undefined` where `string` expected
**Lines:** 470, 881, 1073
**Issue:** `result.output` may be undefined
**Fix:** Add nullish coalescing: `result.output ?? ''`

### Error Category 3: `number | undefined` where `number` expected
**Lines:** 562, 725
**Issue:** `result.durationSeconds` may be undefined
**Fix:** Add nullish coalescing: `result.durationSeconds ?? 0`

### Error Category 4: Undefined access
**Line:** 563
**Issue:** `result.output.slice(...)` when output might be undefined
**Fix:** Add guard: `result.output?.slice(...) ?? ''`

### Error Category 5: String literal type mismatch
**Line:** 688
**Issue:** `Type 'string' is not assignable to type '"unknown" | PromptCacheStatus'`
**Fix:** Cast or use type guard

### Error Category 6: AgentType mismatch
**Line:** 730
**Issue:** `Type 'string' is not assignable to type 'AgentType | undefined'`
**Fix:** Type assertion or validation

## Implementation Plan

### Files to Change
1. `tools/wvo_mcp/src/orchestrator/agent_coordinator.ts` (MODIFY)

### Specific Changes

**Change 1: Remove @ts-nocheck (line 1)**
```typescript
// DELETE THIS LINE:
// @ts-nocheck - Legacy MCP architecture file with incompatible types
```

**Change 2: Fix completeTask calls (lines ~450, 476, 552, 1086)**
```typescript
// Before
this.agentPool.completeTask(task.id, false, result.durationSeconds, {...});

// After (check AgentPool interface first, likely needs):
this.agentPool.completeTask(task.id, agent, result.durationSeconds, {...});
```

**Change 3: Add nullish coalescing for output (lines ~470, 881, 1073)**
```typescript
// Before
result.output

// After
result.output ?? ''
```

**Change 4: Guard output.slice (line ~563)**
```typescript
// Before
outputExcerpt: result.output.slice(0, 4000),

// After
outputExcerpt: (result.output ?? '').slice(0, 4000),
```

**Change 5: Fix type mismatches (lines ~688, 730)**
```typescript
// After inspecting interfaces, add appropriate casts/guards
```

**Change 6: Add cost fallback logging (lines 85-94)**
```typescript
// Fall back to hardcoded table
const pricingKey = agentType === 'codex' ? modelSlug ?? 'gpt-5-codex' : 'claude_code';
if (!pricingKey) return undefined;

const pricing = MODEL_COST_TABLE[pricingKey];
if (!pricing) return undefined;

// ADD THIS:
logWarning("Cost estimate using stale hardcoded prices", {
  agentType,
  modelSlug,
  pricingKey,
  source: "MODEL_COST_TABLE"
});

const cost = ...
```

### Testing Plan
- Build verification: `npm run build` (must pass with 0 errors)
- Test suite: `npm test` (all 996 tests must pass)
- No new tests needed (type safety is the test)

### Risks
1. **Risk**: Type fixes reveal deeper architectural issues
   - **Mitigation**: Fix errors incrementally, test after each

2. **Risk**: completeTask signature unknown without reading AgentPool
   - **Mitigation**: Read AgentPool interface before implementing

3. **Risk**: Tests fail due to type changes
   - **Mitigation**: Run tests iteratively, fix any breakage

## Exit Criteria
- ✅ @ts-nocheck removed
- ✅ `npm run build` completes with 0 errors
- ✅ All 996 tests pass
- ✅ Cost fallback logs warning
- ✅ LOC within limit (+34 vs +150 max)

## AFP/SCAS Compliance
- **Via negativa**: Deleting @ts-nocheck removes complexity
- **Refactor not repair**: This is justified debt paydown (critical technical debt)
- **Complexity**: Net decrease (type safety >> small LOC increase)
- **LOC constraint**: +34 LOC << +150 limit ✅
- **File constraint**: 1 file << 5 max ✅

## Notes
- The hardcoded MODEL_COST_TABLE can be extracted in a future task
- This task focuses on critical type safety debt
- Micro-batching principle: do the minimal fix that pays down debt
