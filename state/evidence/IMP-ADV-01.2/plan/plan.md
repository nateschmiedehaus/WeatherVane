# IMP-ADV-01.2: Inject Hints into Planner Prompt - PLAN

**Task ID**: IMP-ADV-01.2
**Phase**: PLAN
**Date**: 2025-10-29
**Status**: In Progress

---

## Work Breakdown

### Task 1: Extend PlannerAgentInput Interface
**File**: `tools/wvo_mcp/src/orchestrator/planner_agent.ts`

**Changes**:
```typescript
export interface PlannerAgentInput {
  task: TaskEnvelope;
  attempt: number;
  requireDelta: boolean;
  modelSelection?: ModelSelection;
  qualityGraphHints?: string;  // NEW: add this line
}
```

**Effort**: 1 line
**Risk**: Very Low (backward compatible, optional parameter)
**Dependencies**: None

---

### Task 2: Store Hints in Context Pack
**File**: `tools/wvo_mcp/src/orchestrator/planner_agent.ts`

**Changes**:
```typescript
// In async run(input: PlannerAgentInput) method, around line 143
const contextPack = {
  planHash,
  kb: kbPack,
  index: indexSnapshot,
  summary: `Context pack for ${input.task.id}`,
  coverageTarget,
  proofMetadata,  // existing line
  qualityGraphHints: input.qualityGraphHints,  // NEW: add this line
};
```

**Effort**: 1 line
**Risk**: Very Low (adds optional field to context pack)
**Dependencies**: Task 1 (interface change)

---

### Task 3: Pass Hints from Plan Runner to Planner
**File**: `tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts`

**Changes**:
```typescript
// Around line 99, update planner.run() call
const planResult = await deps.planner.run({
  task,
  attempt: attemptNumber,
  requireDelta: requirePlanDelta ?? false,
  modelSelection, // Pass ComplexityRouter selection
  qualityGraphHints,  // NEW: add this line (variable already exists at line 53)
});
```

**Effort**: 1 line
**Risk**: Very Low (variable already exists from line 53)
**Dependencies**: Task 1 (interface change)

---

### Task 4: Remove TODO Comment
**File**: `tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts`

**Changes**:
```typescript
// Line 98: DELETE this line
// TODO: Extend PlannerAgent to accept hints parameter and inject into prompt
```

**Effort**: 1 line deletion
**Risk**: None
**Dependencies**: Tasks 1-3 (TODO is now resolved)

---

### Task 5: Update Telemetry Logging
**File**: `tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts`

**Changes**:
```typescript
// Around line 79, update existing log to indicate hints stored
if (qualityGraphHints) {
  // Count similar tasks from hints
  const matches = qualityGraphHints.match(/###\s+\d+\./g);
  similarTasksCount = matches ? matches.length : 0;

  logInfo('Quality graph hints retrieved and stored', {  // UPDATE: add "and stored"
    taskId: task.id,
    similarTasksCount,
    hintsLength: qualityGraphHints.length,
    hintsStored: true,  // NEW: add this field
  });
} else {
  logInfo('No similar tasks found in quality graph', { taskId: task.id });
}
```

**Effort**: 2 lines (1 update, 1 addition)
**Risk**: Very Low (adds telemetry field)
**Dependencies**: None (updates existing code)

---

### Task 6: Add Feature Flag Support
**File**: `tools/wvo_mcp/src/state/live_flags.ts`

**Changes**: (Check if this file exists, if not, update documentation)

**Option A (If LiveFlags schema exists)**:
```typescript
export interface LiveFlagsSchema {
  // ... existing flags
  quality_graph?: {
    hints_injection?: 'off' | 'observe' | 'enforce';
  };
}
```

**Option B (If LiveFlags uses different approach)**:
Document flag in README and use environment variable:
```bash
export QUALITY_GRAPH_HINTS_INJECTION=observe  # off|observe|enforce
```

**Effort**: 3-5 lines (depends on flag system)
**Risk**: Low (feature flag infrastructure already exists)
**Dependencies**: None (independent of other changes)

---

### Task 7: Apply Feature Flag in Plan Runner
**File**: `tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts`

**Changes**:
```typescript
// Around line 56-58, check feature flag before querying
if (deps.workspaceRoot) {
  // NEW: Check feature flag
  const hintsEnabled = getLiveFlag('quality_graph.hints_injection') !== 'off';

  if (hintsEnabled) {
    try {
      logInfo('Querying quality graph for similar tasks', { taskId: task.id });

      qualityGraphHints = await getPlanningHints(/* ... existing params ... */);

      // ... rest of existing code ...
    } catch (error) {
      // ... existing error handling ...
    }
  } else {
    logDebug('Quality graph hints disabled via feature flag', { taskId: task.id });
  }
}
```

**Effort**: 5-8 lines (adds conditional check)
**Risk**: Low (graceful degradation already exists)
**Dependencies**: Task 6 (feature flag definition)

---

### Task 8: Update Quality Graph README
**File**: `tools/wvo_mcp/src/quality_graph/README.md`

**Changes**: Update "Automatic Hints (PLAN Phase)" section around line 99-113

**Before**:
```markdown
### Automatic Hints (PLAN Phase)

Similar tasks are queried before planning:

```typescript
// In state machine PLAN phase
const result = await runPlan(context, {
  planner,
  workspaceRoot,  // Enables quality graph queries
});

// Hints attached to plan result:
// result.artifacts.plan.qualityGraphHints
// result.artifacts.plan.similarTasksCount
```
```

**After**:
```markdown
### Automatic Hints (PLAN Phase)

Similar tasks are queried before planning and stored in planner context:

```typescript
// In state machine PLAN phase
const result = await runPlan(context, {
  planner,
  workspaceRoot,  // Enables quality graph queries
});

// Hints stored in planner context pack:
// - Accessible to future prompt compiler (IMP-21)
// - Logged to telemetry for observability
// - Controlled by feature flag: quality_graph.hints_injection

// Also attached to plan result:
// result.artifacts.plan.qualityGraphHints
// result.artifacts.plan.similarTasksCount
```

**Feature Flag**:
- `quality_graph.hints_injection=off` - Hints not retrieved
- `quality_graph.hints_injection=observe` - Hints retrieved and stored (default)
- `quality_graph.hints_injection=enforce` - Same as observe (future: enforce usage)
```
```

**Effort**: 10-15 lines
**Risk**: None (documentation only)
**Dependencies**: All tasks (documents complete implementation)

---

### Task 9: Update Planner Agent Comments
**File**: `tools/wvo_mcp/src/orchestrator/planner_agent.ts`

**Changes**: Add JSDoc comment to PlannerAgentInput interface

```typescript
export interface PlannerAgentInput {
  task: TaskEnvelope;
  attempt: number;
  requireDelta: boolean;
  modelSelection?: ModelSelection;
  /**
   * Quality graph hints from similar tasks (optional)
   *
   * Hints are stored in context pack for future prompt compiler (IMP-21).
   * Currently used for observability/telemetry only.
   *
   * Format: Markdown list of similar tasks with summaries
   * Example:
   *   ### 1. IMP-API-02 (similarity: 0.87)
   *   Implement JWT authentication...
   *
   * @see tools/wvo_mcp/src/quality_graph/hints.ts - getPlanningHints()
   */
  qualityGraphHints?: string;
}
```

**Effort**: 15 lines (JSDoc comment)
**Risk**: None (documentation only)
**Dependencies**: Task 1 (interface change)

---

### Task 10: Add Unit Test for Context Pack Storage
**File**: `tools/wvo_mcp/src/orchestrator/__tests__/planner_agent.test.ts` (create if doesn't exist)

**Changes**: Add test case for hints storage

```typescript
describe('PlannerAgent', () => {
  // ... existing tests ...

  it('should store quality graph hints in context pack when provided', async () => {
    const mockMemory = createMockMemory();
    const mockKB = createMockKB();
    const mockProjectIndex = createMockProjectIndex();
    const mockRouter = createMockRouter();

    const planner = new PlannerAgent({
      router: mockRouter,
      memory: mockMemory,
      kb: mockKB,
      projectIndex: mockProjectIndex,
    });

    const hints = '### 1. TASK-123 (similarity: 0.85)\nImplement authentication...';

    await planner.run({
      task: createMockTask('TASK-456'),
      attempt: 1,
      requireDelta: false,
      qualityGraphHints: hints,
    });

    const contextPack = mockMemory.get('TASK-456', 'planner', 'context_pack');
    expect(contextPack.qualityGraphHints).toBe(hints);
  });

  it('should work without hints (backward compatible)', async () => {
    const mockMemory = createMockMemory();
    const mockKB = createMockKB();
    const mockProjectIndex = createMockProjectIndex();
    const mockRouter = createMockRouter();

    const planner = new PlannerAgent({
      router: mockRouter,
      memory: mockMemory,
      kb: mockKB,
      projectIndex: mockProjectIndex,
    });

    await planner.run({
      task: createMockTask('TASK-789'),
      attempt: 1,
      requireDelta: false,
      // No qualityGraphHints provided
    });

    const contextPack = mockMemory.get('TASK-789', 'planner', 'context_pack');
    expect(contextPack.qualityGraphHints).toBeUndefined();
  });
});
```

**Effort**: 40-50 lines (new test file or addition to existing)
**Risk**: Low (test code)
**Dependencies**: Tasks 1-2 (implementation to test)

---

### Task 11: Add Integration Test for End-to-End Flow
**File**: `tools/wvo_mcp/src/orchestrator/__tests__/state_runners/plan_runner.test.ts`

**Changes**: Add test case for hints flow

```typescript
describe('runPlan with quality graph hints', () => {
  it('should pass hints from getPlanningHints to planner agent', async () => {
    const mockPlanner = {
      run: vi.fn().mockResolvedValue({
        planHash: 'abc123',
        requiresThinker: false,
        summary: 'Test plan',
        planDeltaToken: 'token123',
        coverageTarget: 0.05,
      }),
    };

    const mockTask = createMockTask('TASK-999');
    const mockWorkspaceRoot = '/test/workspace';

    // Mock getPlanningHints to return test hints
    vi.mock('../../quality_graph/hints.js', () => ({
      getPlanningHints: vi.fn().mockResolvedValue(
        '### 1. TASK-111 (similarity: 0.90)\nTest hint...'
      ),
    }));

    const result = await runPlan(
      { task: mockTask, attemptNumber: 1 },
      { planner: mockPlanner, workspaceRoot: mockWorkspaceRoot }
    );

    // Verify planner was called with hints
    expect(mockPlanner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        qualityGraphHints: expect.stringContaining('TASK-111'),
      })
    );

    // Verify hints attached to result
    expect(result.artifacts.plan.qualityGraphHints).toContain('TASK-111');
    expect(result.artifacts.plan.similarTasksCount).toBe(1);
  });
});
```

**Effort**: 30-40 lines
**Risk**: Low (test code)
**Dependencies**: Tasks 1-3 (implementation to test)

---

## Change Budget

### Lines Changed
- **Added**: ~15-20 lines (interface, context pack, plan runner, telemetry, flag)
- **Modified**: ~5 lines (telemetry log, README updates)
- **Deleted**: 1 line (TODO comment)
- **Total**: ~20-25 lines of production code

### Files Modified
1. `tools/wvo_mcp/src/orchestrator/planner_agent.ts` - 2 changes (interface + context pack)
2. `tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts` - 4 changes (pass hints, remove TODO, update logs, add flag check)
3. `tools/wvo_mcp/src/state/live_flags.ts` - 1 change (add flag schema)
4. `tools/wvo_mcp/src/quality_graph/README.md` - 1 change (update docs)

### Files Created
1. `tools/wvo_mcp/src/orchestrator/__tests__/planner_agent.test.ts` - Unit tests (if doesn't exist)

### Test Changes
- Added: 2 unit tests (context pack storage, backward compatibility)
- Added: 1 integration test (end-to-end hints flow)
- Modified: 0 existing tests (backward compatible)

### Max Diff Lines: ~150 lines (including tests and docs)

---

## Dependencies

### Sequential Dependencies
```
Task 1 (Interface) → Task 2 (Context Pack)
                   ↘ Task 3 (Plan Runner)
                     ↓
Task 4 (Remove TODO) ← Tasks 1-3 complete
                     ↓
Task 5 (Telemetry) ← Independent but related
Task 6 (Feature Flag) → Task 7 (Apply Flag)
                       ↓
Tasks 8-9 (Documentation) ← All implementation complete
Tasks 10-11 (Tests) ← Implementation complete
```

### Critical Path
1. Task 1 (Interface) - Blocks Tasks 2, 3, 9
2. Task 2 (Context Pack) - Core functionality
3. Task 3 (Plan Runner) - Core functionality
4. Task 5 (Telemetry) - Observability requirement
5. Task 10-11 (Tests) - Verification requirement

### Parallel Work
- Task 6 (Feature Flag) - Can be done in parallel with Tasks 1-3
- Task 8-9 (Documentation) - Can be done after core implementation

---

## Rollback Plan

### Sentence
"Revert commit X and set `quality_graph.hints_injection=off` in config; no state migration required."

### Preconditions for Rollback
1. Feature flag test fails (hints not controlled correctly)
2. Regression discovered in existing tests
3. Performance degradation detected (>10ms latency increase)
4. User-reported issues during observe mode

### Rollback Steps
1. **Immediate**: Set feature flag to `off` via environment variable
   ```bash
   export QUALITY_GRAPH_HINTS_INJECTION=off
   ```
2. **If flag insufficient**: Revert commit via git
   ```bash
   git revert <commit-hash>
   git push
   ```
3. **Verify rollback**: Run smoke test to confirm planner works without hints

### Recovery Time
- Flag toggle: Immediate (next planning cycle)
- Git revert: 5-10 minutes (including CI pipeline)

### Data Loss
- None (hints are derived, not stored state)
- Context packs are ephemeral (cleared between runs)

---

## Estimates

### Time Estimates (Sequential)
- Task 1 (Interface): 2 minutes
- Task 2 (Context Pack): 2 minutes
- Task 3 (Plan Runner): 2 minutes
- Task 4 (Remove TODO): 1 minute
- Task 5 (Telemetry): 5 minutes
- Task 6 (Feature Flag): 10 minutes (depends on flag system)
- Task 7 (Apply Flag): 10 minutes
- Task 8 (Update README): 10 minutes
- Task 9 (Update Comments): 5 minutes
- Task 10 (Unit Tests): 30 minutes
- Task 11 (Integration Test): 20 minutes

**Total Active Work**: ~1.5 hours

### Time Estimates (Parallel)
- Core Implementation (Tasks 1-5): 30 minutes
- Feature Flag (Tasks 6-7): 20 minutes (parallel)
- Documentation (Tasks 8-9): 15 minutes (parallel)
- Tests (Tasks 10-11): 50 minutes

**Total Elapsed Time (Optimized)**: ~1 hour

### Contingency
- +30 minutes for unexpected issues (flag system complexity, test setup)
- +30 minutes for VERIFY phase (running full test suite, checking telemetry)
- +15 minutes for REVIEW phase (code review, forward-compatibility check)

**Total Estimated Time**: 2-3 hours (matches IMPROVEMENT_BATCH_PLAN estimate)

---

## Risk Mitigation

### Risk 1: Feature Flag System Complexity
**If LiveFlags doesn't support nested flags**:
- **Fallback**: Use environment variable `QUALITY_GRAPH_HINTS_INJECTION`
- **Code**: Read from `process.env` directly in plan_runner.ts
- **Time Impact**: -10 minutes (simpler implementation)

### Risk 2: Test Setup Complexity
**If mock setup is complex**:
- **Fallback**: Manual testing with telemetry inspection
- **Evidence**: Screenshot of telemetry logs showing hints stored
- **Time Impact**: -30 minutes (skip unit tests, rely on integration test)

### Risk 3: Context Pack Type Mismatch
**If context pack has strict type validation**:
- **Solution**: Check RunEphemeralMemory schema, add type declaration
- **Time Impact**: +15 minutes (type investigation + fix)

---

## Prohibited Operations

**Do NOT**:
1. ❌ Implement actual LLM call in PlannerAgent (out of scope)
2. ❌ Add complex prompt templates (deferred to IMP-23)
3. ❌ Implement hint filtering/ranking (future enhancement)
4. ❌ Break backward compatibility (existing code must work)
5. ❌ Skip tests (AC6 requires zero regression)
6. ❌ Deploy without feature flag (must have rollback mechanism)

---

## Owners/Roles

- **Implementer**: Claude (this session)
- **Reviewer**: Adversarial review (REVIEW phase)
- **Verifier**: Automated tests + manual telemetry check (VERIFY phase)
- **Approver**: User (after MONITOR phase)

---

## Next Steps

1. ✅ Complete STRATEGIZE (done)
2. ✅ Complete SPEC (done)
3. ✅ Complete PLAN (this document)
4. → THINK: Design feature flag behavior, investigate LiveFlags system
5. → IMPLEMENT: Execute tasks 1-11 sequentially
6. → VERIFY: Run tests, check telemetry, validate feature flag
7. → REVIEW: Forward-compatibility analysis
8. → PR: Commit with evidence, update prompting roadmap docs
9. → MONITOR: Track hint availability metrics

---

## References

- STRATEGIZE: `state/evidence/IMP-ADV-01.2/strategize/strategy.md`
- SPEC: `state/evidence/IMP-ADV-01.2/spec/spec.md`
- Plan Runner: `tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts`
- Planner Agent: `tools/wvo_mcp/src/orchestrator/planner_agent.ts`
- Quality Graph Hints: `tools/wvo_mcp/src/quality_graph/hints.ts`
