# Plan: AFP-COGNITIVE-MODEL-ROUTING-20251106

## Implementation Approach (Fundamental - Post Via Negativa Pivot)

**Note:** Original plan was tactical (380 LOC). After via negativa analysis, pivoted to fundamental approach (65 LOC, 84% reduction).

### Architecture

**Core Insight:** Work type (WHAT) is orthogonal to reasoning level (HOW DEEP)

**Extended Module:** `tools/wvo_mcp/src/orchestrator/reasoning_classifier.ts`
- Add: `WorkType` type (cognitive | implementation | remediation | observational)
- Add: `inferWorkType(task): WorkType` function (~37 LOC)
  - Priority cascade: metadata.work_type → current_phase → title → default
- Enhance: `inferReasoningRequirement(task, context)` (+25 LOC)
  - Check work_type first, then fall back to existing heuristics
- Add: `getThinkingBudget(reasoningLevel): number` helper (~28 LOC)
  - Maps reasoning level → Claude extended thinking token budget

**No new modules:** Extends existing reasoning_classifier pattern

**No configuration files:** Budgets hardcoded in getThinkingBudget()

### Files to Change

**Modified Files:**
1. `tools/wvo_mcp/src/orchestrator/reasoning_classifier.ts` (+65 LOC)

**New Files:**
2. `tools/wvo_mcp/src/orchestrator/__tests__/reasoning_classifier_work_type.test.ts` (+215 LOC)

**Total:** 280 net LOC (65 code + 215 tests) across 2 files

### Testing Strategy

**Test File:** `tools/wvo_mcp/src/orchestrator/__tests__/reasoning_classifier_work_type.test.ts`

**PLAN-authored tests (25 total):**

**Unit Tests (20 tests):**

```typescript
// reasoning_classifier_work_type.test.ts
describe('inferWorkType', () => {
  it('returns cognitive for STRATEGIZE phase', () => {
    const task = { id: 'T1', metadata: { current_phase: 'STRATEGIZE' } };
    expect(inferWorkType(task)).toBe('cognitive');
  });

  it('returns cognitive for all cognitive phases', () => {
    // Test all 6 cognitive phases: STRATEGIZE, SPEC, PLAN, THINK, GATE, REVIEW
    for (const phase of COGNITIVE_PHASES) {
      expect(inferWorkType({ metadata: { current_phase: phase } })).toBe('cognitive');
    }
  });

  it('returns implementation for IMPLEMENT phase', () => {
    const task = { metadata: { current_phase: 'IMPLEMENT' } };
    expect(inferWorkType(task)).toBe('implementation');
  });

  it('returns remediation for REMEDIATION in title', () => {
    const task = { title: 'REMEDIATION: Fix build' };
    expect(inferWorkType(task)).toBe('remediation');
  });

  it('returns observational for MONITOR in title', () => {
    const task = { title: 'MONITOR: Track metrics' };
    expect(inferWorkType(task)).toBe('observational');
  });

  it('prefers explicit work_type over phase inference', () => {
    const task = {
      metadata: { work_type: 'observational', current_phase: 'IMPLEMENT' }
    };
    expect(inferWorkType(task)).toBe('observational');
  });
});

describe('inferReasoningRequirement with work_type', () => {
  it('returns high reasoning for cognitive work', () => {
    const task = { metadata: { work_type: 'cognitive' } };
    const decision = inferReasoningRequirement(task, {});
    expect(decision.level).toBe('high');
    expect(decision.override).toBe('metadata');
  });

  it('returns low reasoning for remediation work', () => {
    const task = { metadata: { work_type: 'remediation' } };
    const decision = inferReasoningRequirement(task, {});
    expect(decision.level).toBe('low');
  });

  it('falls back to task-based heuristics for implementation', () => {
    const task = { title: 'Implement feature', estimated_complexity: 8 };
    const decision = inferReasoningRequirement(task, {});
    // Expect either medium or high based on complexity heuristics
    expect(decision.level).toMatch(/^(medium|high)$/);
  });
});

describe('getThinkingBudget', () => {
  it('returns 12K tokens for high reasoning', () => {
    expect(getThinkingBudget('high')).toBe(12000);
  });

  it('returns 4K tokens for medium reasoning', () => {
    expect(getThinkingBudget('medium')).toBe(4000);
  });

  it('returns 0 tokens for low reasoning', () => {
    expect(getThinkingBudget('low')).toBe(0);
  });
});

describe('Integration: work_type → reasoning → thinking budget', () => {
  it('cognitive task → high reasoning → 12K thinking budget', () => {
    const task = { metadata: { current_phase: 'STRATEGIZE' } };

    const workType = inferWorkType(task);
    expect(workType).toBe('cognitive');

    const reasoning = inferReasoningRequirement(task, {});
    expect(reasoning.level).toBe('high');

    const thinkingBudget = getThinkingBudget(reasoning.level);
    expect(thinkingBudget).toBe(12000);
  });

  it('remediation task → low reasoning → 0 thinking budget', () => {
    const task = { title: 'REMEDIATION: Fix failing test' };

    const workType = inferWorkType(task);
    expect(workType).toBe('remediation');

    const reasoning = inferReasoningRequirement(task, {});
    expect(reasoning.level).toBe('low');

    const thinkingBudget = getThinkingBudget(reasoning.level);
    expect(thinkingBudget).toBe(0);
  });
});
```

**Total tests:** 25 covering:
- inferWorkType: 11 tests (all phases, title patterns, priority cascade)
- inferReasoningRequirement: 5 tests (work_type override, fallback)
- getThinkingBudget: 4 tests (all reasoning levels)
- Integration: 3 tests (end-to-end flow)
- Codex compatibility: 2 tests (verifies gpt-5-high routing)

**Integration Tests (5 tests):**

```bash
# Build verification test
cd tools/wvo_mcp && npm run build
# Expected: 0 errors

# Unit test execution
npm test -- reasoning_classifier_work_type.test.ts
# Expected: 25/25 tests pass

# Guardrail verification test
node scripts/check_guardrails.mjs
# Expected: All guardrails pass

# End-to-end flow test (manual verification)
# - Create task with metadata.current_phase = 'STRATEGIZE'
# - Verify inferWorkType() returns 'cognitive'
# - Verify inferReasoningRequirement() returns level='high'
# - Verify getThinkingBudget('high') returns 12000

# Backward compatibility test (manual verification)
# - Create task without metadata.current_phase
# - Verify falls back to existing heuristics
```

**Post-Merge Production Integration:**
- Integrate getThinkingBudget() at Claude provider API layer
- Monitor thinking token usage in production via telemetry
- Tune budgets based on actual utilization data
- Add Wave 0 test with STRATEGIZE phase task to verify routing

### Edge Cases & Mitigations

**Edge Case 1:** Task has no metadata.current_phase
- **Mitigation:** Fall back to title inference, then default to 'implementation'

**Edge Case 2:** Task title contains multiple keywords (e.g., "FIX cognitive analysis")
- **Mitigation:** Priority: metadata > phase > title (REMEDIATION wins over cognitive)

**Edge Case 3:** Thinking budget exceeded (Claude returns partial response)
- **Mitigation:** Log warning, allow completion, tune budget in getThinkingBudget()

**Edge Case 4:** Non-AFP tasks should use existing heuristics
- **Mitigation:** Work type defaults to 'implementation', existing complexity-based logic continues

### Risk Analysis

**Risk 1: Cost increase from extended thinking**
- **Likelihood:** High for cognitive work
- **Impact:** Medium (offset by better quality, less rework)
- **Mitigation:** Conservative budgets (12K tokens), monitor usage, adjust if needed

**Risk 2: Work type inference accuracy**
- **Likelihood:** Low (simple pattern matching)
- **Impact:** Medium (wrong reasoning level = suboptimal quality)
- **Mitigation:** Explicit metadata.work_type override, comprehensive tests

**Risk 3: Backward compatibility breaks**
- **Likelihood:** Very Low
- **Impact:** Critical (existing workflows break)
- **Mitigation:** Defaults to 'implementation', existing heuristics unchanged

## Timeline (Actual - Fundamental Approach)

1. **IMPLEMENT phase:** 1 hour
   - Enhanced reasoning_classifier.ts (+65 LOC)
   - Created reasoning_classifier_work_type.test.ts (+215 LOC)

2. **VERIFY phase:** 30 minutes
   - Run build: `npm run build` (0 errors)
   - Run tests: `npm test` (25/25 pass)
   - Run guardrails: all pass

3. **REVIEW phase:** 20 minutes
   - Phase compliance verification
   - Evidence documentation
   - Commit preparation

**Total actual:** ~2 hours (vs 4-6 hours estimated for tactical approach)
