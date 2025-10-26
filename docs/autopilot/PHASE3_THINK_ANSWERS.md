# Phase 3 – Adversarial Questions ANSWERED

## THINK Stage - Question Resolution

**Date**: 2025-10-26
**Executor**: Claude Council
**Phase**: 3 of 7 (Recovery Playbook)

---

## 🔴 CHALLENGE 1: Are we actually solving the problem?

### ANSWER: Yes, but the problem is testability, not size

**Investigation Results**:

Let me examine the actual state_graph.ts to see what the REAL problem is:

**Current state_graph.ts analysis** (lines 123-434):
- Giant switch statement: 312 lines of dense logic
- Each state case has:
  - Agent calls (planner, thinker, implementer, verifier, reviewer)
  - Error handling
  - State transition logic
  - Retry checking
  - Artifact management
  - Checkpointing
  - Context assembly
  - Router decision logging
  - Resolution engine integration

**The REAL problem isn't size - it's COUPLING**:

1. **Testing is impossible**: To test verify state, you need:
   - Mock StateGraph
   - Mock all 7 other states
   - Mock checkpointing
   - Mock context assembly
   - Mock router
   - Mock journal
   - Mock memory
   - Result: 200+ line test setup just to test ONE state

2. **Can't test states in isolation**: Verify logic is tangled with:
   - Retry ceiling checking (shared with all states)
   - Plan delta requirements (depends on plan state)
   - Router escalation (shared state)
   - Resolution engine (verify-specific)

3. **Can't reuse state logic**: Want to run just verify in a test harness? Can't extract it.

**ANSWER**: Modularization solves the RIGHT problem (testability), size reduction is a side effect.

**Revised acceptance criteria**:
- PRIMARY: Each state is independently testable with <50 lines of test setup
- SECONDARY: state_graph.ts reduced to ~300 lines (orchestration only)

**Decision**: ✅ PROCEED - but emphasize testability, not size reduction

---

## 🔴 CHALLENGE 2: Performance regression risk

### ANSWER: Measure baseline NOW, set realistic targets

**Action**: Run performance baseline SPIKE immediately

```bash
cd tools/wvo_mcp
npm test -- src/orchestrator/__tests__/state_graph.test.ts --reporter=verbose
```

**Baseline Measurement Plan**:

1. **Add timing instrumentation** to existing state_graph.ts:
```typescript
// In state_graph.ts run() method
const stateTimings = new Map<AutopilotState, number>();

// Before each state
const stateStart = Date.now();

// After each state
const stateDuration = Date.now() - stateStart;
stateTimings.set(current, stateDuration);
```

2. **Run 100 tasks** through current implementation
3. **Calculate p50, p95, p99** for each state
4. **Record baseline**:
   - Total task time (LLM calls dominate)
   - Per-state overhead (should be <10ms)
   - Overall orchestration overhead

**Expected Results** (hypothesis):
- LLM calls: 1000-5000ms per state (dominates)
- Orchestration overhead: <10ms per state (negligible)
- Function call overhead in modular design: +2-5ms per state (acceptable)

**Performance Target Revision**:
- Old target: <100ms overhead per transition (arbitrary)
- New target: <5ms regression per transition (based on baseline)
- New target: <40ms total regression for full flow (8 states)

**Decision**: ✅ ADD to VERIFY stage:
```bash
# Step 1: Measure baseline (before refactoring)
npm test -- state_graph.test.ts --reporter=json > baseline_performance.json

# Step 2: After refactoring, measure again
npm test -- state_graph_modular.test.ts --reporter=json > modular_performance.json

# Step 3: Compare
node scripts/compare_performance.js baseline_performance.json modular_performance.json

# Step 4: FAIL if regression > 5ms per state
```

**Answer**: Performance risk is REAL but MANAGEABLE. Measure baseline, set data-driven targets, validate in VERIFY stage.

---

## 🔴 CHALLENGE 3: Backward compatibility - what breaks?

### ANSWER: Find all dependencies NOW, add compatibility tests

**Investigation**: Search for StateGraph dependencies

```bash
cd tools/wvo_mcp
grep -r "StateGraph" src/ --include="*.ts" | grep -v "state_graph.ts" | grep "import"
```

**Expected dependencies**:
1. `unified_orchestrator.ts` - Main consumer
2. `state_graph.test.ts` - Test suite
3. `state_graph_integration.test.ts` - Integration tests
4. Possibly: `quality_gate_bridge.ts`, `worker_entry.ts`

**Compatibility Verification Plan**:

1. **Document current API**:
```typescript
// Current interface (MUST NOT CHANGE)
class StateGraph {
  constructor(deps: StateGraphDependencies, options: StateGraphOptions)
  async run(task: StateGraphTaskContext): Promise<StateGraphResult>
}

// Types that MUST remain compatible
- StateGraphDependencies
- StateGraphOptions
- StateGraphTaskContext
- StateGraphResult
- StateGraphError
```

2. **Add API compatibility test**:
```typescript
// __tests__/state_graph_api_compatibility.test.ts
describe('StateGraph API Compatibility', () => {
  it('constructor signature unchanged', () => {
    const deps: StateGraphDependencies = { /* ... */ };
    const options: StateGraphOptions = { /* ... */ };
    const graph = new StateGraph(deps, options);
    expect(graph).toBeDefined();
  });

  it('run() signature unchanged', async () => {
    const result = await graph.run(task);
    expect(result).toMatchObject({
      success: expect.any(Boolean),
      finalState: expect.any(String),
      notes: expect.any(Array),
      artifacts: expect.any(Object),
    });
  });

  it('StateGraphError signature unchanged', () => {
    const error = new StateGraphError('test', 'plan', { detail: 'x' });
    expect(error.state).toBe('plan');
    expect(error.details).toEqual({ detail: 'x' });
  });
});
```

3. **Add behavior compatibility test** (most important):
```typescript
// __tests__/state_graph_behavior_compatibility.test.ts
describe('StateGraph Behavior Compatibility', () => {
  it('produces identical output for same input (before/after refactoring)', async () => {
    // Use deterministic mocks
    const task = createTestTask();
    const resultBefore = await oldStateGraph.run(task); // Saved from before refactoring
    const resultAfter = await newStateGraph.run(task);

    // Compare artifacts (excluding timing/randomness)
    expect(resultAfter.artifacts).toMatchObject(resultBefore.artifacts);
    expect(resultAfter.finalState).toBe(resultBefore.finalState);
    expect(resultAfter.success).toBe(resultBefore.success);
  });
});
```

**Answer**: Backward compatibility is TESTABLE. Add API + behavior compatibility tests BEFORE refactoring.

**Decision**: ✅ ADD to PLAN:
- Step 1.5: Document current StateGraph API
- Step 1.6: Save baseline behavior (run tests, capture results)
- Step 14: Verify API compatibility
- Step 15: Verify behavior compatibility

---

## 🔴 CHALLENGE 4: Test quality - are we testing behavior or implementation?

### ANSWER: Use behavior-driven tests with strict quality validation

**Problem Analysis**: The plan has tests like:
```typescript
// BAD: Testing implementation
it('specify runner calls supervisor.specify()', async () => {
  await runSpecify(context, { supervisor });
  expect(supervisor.specify).toHaveBeenCalledWith(task);
});

// GOOD: Testing behavior
it('specify runner produces acceptance criteria and transitions to plan', async () => {
  const result = await runSpecify(context, { supervisor });
  expect(result.nextState).toBe('plan');
  expect(result.artifacts.specify.acceptanceCriteria).toHaveLength(3);
  expect(result.success).toBe(true);
});
```

**Solution**: Behavior-Driven Test Pattern

**Template for each runner test**:
```typescript
describe('SpecifyRunner - Behavior Tests', () => {
  // 1. HAPPY PATH - What should happen
  describe('when specify succeeds', () => {
    it('produces acceptance criteria', async () => {
      const result = await runSpecify(context, deps);
      expect(result.artifacts.specify.acceptanceCriteria).toBeDefined();
      expect(result.artifacts.specify.acceptanceCriteria.length).toBeGreaterThan(0);
    });

    it('transitions to plan state', async () => {
      const result = await runSpecify(context, deps);
      expect(result.nextState).toBe('plan');
    });

    it('returns success=true', async () => {
      const result = await runSpecify(context, deps);
      expect(result.success).toBe(true);
    });
  });

  // 2. ERROR PATHS - What should happen when things go wrong
  describe('when supervisor throws error', () => {
    it('propagates error with context', async () => {
      supervisor.specify.mockRejectedValue(new Error('Supervisor failed'));
      await expect(runSpecify(context, deps)).rejects.toThrow('Supervisor failed');
    });
  });

  // 3. EDGE CASES - Boundary conditions
  describe('edge cases', () => {
    it('handles empty acceptance criteria', async () => {
      supervisor.specify.mockResolvedValue({ acceptanceCriteria: [] });
      const result = await runSpecify(context, deps);
      expect(result.artifacts.specify.acceptanceCriteria).toEqual([]);
      expect(result.nextState).toBe('plan'); // Still proceeds
    });

    it('handles undefined task metadata', async () => {
      const taskWithoutMetadata = { ...task, metadata: undefined };
      const result = await runSpecify({ ...context, task: taskWithoutMetadata }, deps);
      expect(result.success).toBe(true);
    });
  });

  // 4. REGRESSION PREVENTION - Specific bugs we've fixed
  describe('regression tests', () => {
    it('does not skip plan delta check (regression from v1.2)', async () => {
      // Test for specific bug we fixed
    });
  });
});
```

**Quality Gates**:
1. Every test file MUST pass `validate_test_quality.sh`
2. Every test MUST have behavior assertion (not just mock verification)
3. Every runner MUST have:
   - ≥1 happy path test
   - ≥1 error path test
   - ≥2 edge case tests

**Answer**: Test quality is ENFORCEABLE through tooling + templates.

**Decision**: ✅ MODIFY PLAN:
- Add test template to plan
- Add `validate_test_quality.sh` check to VERIFY stage for EVERY test file
- Require behavior assertions, not just mock verification

---

## 🔴 CHALLENGE 5: Error handling - what happens when runners fail?

### ANSWER: Comprehensive error handling with graceful degradation

**Error Classification**:

1. **Fatal Errors** (fail fast):
   - Missing dependencies (plan result required for implement)
   - Retry ceiling exceeded
   - Incident reporter required but missing

2. **Recoverable Errors** (retry with plan delta):
   - Verify gate fails
   - Review rejected
   - PR checklist fails
   - Monitor smoke fails

3. **Partial Failures** (log but continue):
   - Checkpoint save fails
   - Context pack emit fails
   - Router decision logging fails

**Error Handling Strategy**:

```typescript
// In each runner
export async function runVerify(context, deps, implementResult, planResult) {
  try {
    // 1. Validate inputs (FATAL if missing)
    if (!implementResult) {
      throw new StateGraphError('Verify requires implementation result', 'verify', {
        taskId: context.task.id,
        missingArtifact: 'implementResult'
      });
    }

    // 2. Execute main logic with timeout
    const verifierResult = await Promise.race([
      deps.verifier.verify({ /* ... */ }),
      timeout(30000, 'Verifier timeout')
    ]);

    // 3. Handle recoverable failures
    if (!verifierResult.success) {
      return {
        success: true, // Runner succeeded (didn't crash)
        nextState: 'plan',
        requirePlanDelta: true,
        artifacts: { verify: verifierResult },
        notes: [`Verify failed: ${verifierResult.gateResults.find(g => !g.success)?.name}`]
      };
    }

    // 4. Success path
    return {
      success: true,
      nextState: 'review',
      artifacts: { verify: verifierResult },
      notes: ['Verify passed']
    };

  } catch (error) {
    // 5. Fatal error handling
    logError('Verify runner failed', {
      taskId: context.task.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    throw new StateGraphError(
      `Verify runner failed: ${error.message}`,
      'verify',
      { originalError: error, taskId: context.task.id }
    );
  }
}
```

**Error Test Cases** (add to each runner):
```typescript
describe('VerifyRunner - Error Handling', () => {
  it('throws StateGraphError when implementResult missing', async () => {
    await expect(
      runVerify(context, deps, undefined, planResult)
    ).rejects.toThrow(StateGraphError);
  });

  it('throws StateGraphError when verifier throws', async () => {
    deps.verifier.verify.mockRejectedValue(new Error('Verifier crashed'));
    await expect(
      runVerify(context, deps, implementResult, planResult)
    ).rejects.toThrow('Verify runner failed: Verifier crashed');
  });

  it('returns requirePlanDelta when verify fails gracefully', async () => {
    deps.verifier.verify.mockResolvedValue({ success: false, gateResults: [] });
    const result = await runVerify(context, deps, implementResult, planResult);
    expect(result.requirePlanDelta).toBe(true);
    expect(result.nextState).toBe('plan');
  });

  it('handles verifier timeout gracefully', async () => {
    deps.verifier.verify.mockImplementation(() => new Promise(() => {})); // Never resolves
    await expect(
      runVerify(context, deps, implementResult, planResult)
    ).rejects.toThrow('timeout');
  });
});
```

**Answer**: Error handling is COMPREHENSIVE with 3-tier strategy (fatal/recoverable/partial).

**Decision**: ✅ ADD to each runner:
- Input validation (throw StateGraphError if missing deps)
- Timeout wrapper (30s timeout for LLM calls)
- Error categorization (fatal vs recoverable)
- Comprehensive error tests

---

## 🔴 CHALLENGE 6: Shared state management - race conditions?

### ANSWER: Document single-threaded assumption, add safeguards

**Investigation**: Is JavaScript truly single-threaded here?

**Analysis**:
```typescript
// StateGraph.run() is async but NOT concurrent
async run(task: StateGraphTaskContext) {
  let current: AutopilotState = 'specify';

  while (current) {
    // Sequential execution - awaits each runner
    switch (current) {
      case 'specify':
        result = await runSpecify(...); // Blocks until done
        break;
      case 'plan':
        result = await runPlan(...); // Blocks until done
        break;
    }
    current = result.nextState;
  }
}
```

**Conclusion**: NO RACE CONDITIONS because:
1. States execute sequentially (await blocks)
2. Only one task runs at a time per StateGraph instance
3. Maps are mutated only during awaited operations

**BUT**: If we parallelize in the future (e.g., run verify + critical in parallel), this breaks.

**Safeguards**:

1. **Document assumption** in code:
```typescript
/**
 * StateGraph - Sequential State Execution
 *
 * IMPORTANT: This implementation assumes SEQUENTIAL state execution.
 * States are NOT run in parallel. If parallelization is added in the
 * future, shared Maps (planHashes, patchHistory, etc.) must be replaced
 * with thread-safe alternatives.
 *
 * Current flow: specify → await → plan → await → implement → await ...
 * Future risk: specify + plan in parallel → race on planHashes
 */
class StateGraph {
  private readonly planHashes = new Map<string, string>();
  private readonly patchHistory = new Map<string, Set<string>>();
  // ...
}
```

2. **Add memory leak test**:
```typescript
describe('StateGraph - Memory Management', () => {
  it('clears task state after completion', async () => {
    const graph = new StateGraph(deps, options);

    // Run 100 tasks
    for (let i = 0; i < 100; i++) {
      await graph.run(createTestTask(`T${i}`));
    }

    // Check Maps are cleaned up
    const planHashesSize = (graph as any).planHashes.size;
    const patchHistorySize = (graph as any).patchHistory.size;

    expect(planHashesSize).toBeLessThan(10); // Only recent tasks
    expect(patchHistorySize).toBeLessThan(10);
  });

  it('does not leak memory over 1000 tasks', async () => {
    const graph = new StateGraph(deps, options);
    const startMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < 1000; i++) {
      await graph.run(createTestTask(`T${i}`));
      if (i % 100 === 0 && global.gc) global.gc();
    }

    const endMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = endMemory - startMemory;

    expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024); // <10MB
  });
});
```

3. **Ensure cleanup in monitor state**:
```typescript
// In monitor_runner.ts
export async function runMonitor(context, deps) {
  // ... monitoring logic ...

  // Success - clean up task state
  deps.memory.clearTask(context.task.id);
  deps.router.clearTask(context.task.id);

  return { success: true, nextState: null, artifacts, notes };
}
```

**Answer**: NO race conditions in current design. Document assumption, add memory tests, ensure cleanup.

**Decision**: ✅ ADD to implementation:
- Document single-threaded assumption in StateGraph
- Add memory leak tests (100 tasks, 1000 tasks)
- Ensure cleanup in monitor state
- Add TODO: "If parallelizing states, use immutable data structures"

---

## 🔴 CHALLENGE 7: Is 11 hours realistic?

### ANSWER: No - add 50% buffer for unknowns

**Historical Data Check**:
- Phase 1: Estimated unknown, actual ~2 hours (SPEC + PLAN + THINK + IMPLEMENT + VERIFY + REVIEW + PR + MONITOR)
- But Phase 1 had fewer unknowns (tests only, no refactoring)

**Risk Factors for Phase 3**:
1. **Refactoring existing code** (higher risk than greenfield)
2. **Backward compatibility required** (adds testing burden)
3. **8 runners + 10 tests** (lots of files to coordinate)
4. **Integration with existing state graph** (subtle bugs likely)

**Realistic Estimate**:

| Category | Original (min) | Buffer | Realistic (min) |
|----------|----------------|--------|-----------------|
| Implementation | 680 | +50% | 1020 |
| Debugging | 0 | New | 180 |
| Integration issues | 0 | New | 120 |
| Test fixes | 0 | New | 120 |
| **Total** | **680** | | **1440 (24 hours)** |

**Breakdown**:
- Day 1 (8 hours): Steps 1-6 (setup + runners 1-4)
- Day 2 (8 hours): Steps 7-10 (runners 5-8)
- Day 3 (8 hours): Steps 11-14 (refactor StateGraph + tests + docs)

**Answer**: 11 hours is OPTIMISTIC. Realistic estimate is 24 hours (3 days).

**Decision**: ✅ UPDATE time estimate:
- Original: 680 minutes (11 hours)
- Revised: 1440 minutes (24 hours, 3 days)
- Add to PLAN: "Budget 3 days for implementation + debugging + integration"

---

## 🔴 CHALLENGE 8: Simpler alternatives - did we consider them?

### ANSWER: Yes, and modularization is justified

**Alternatives Evaluation**:

| Alternative | Time | Testability | Maintainability | Extensibility | Decision |
|-------------|------|-------------|-----------------|---------------|----------|
| **Add comments** | 1h | ❌ Poor (still monolith) | ⚠️ OK | ❌ Poor | ❌ Reject |
| **Extract only verify** | 3h | ⚠️ OK (one state) | ⚠️ OK | ❌ Inconsistent | ❌ Reject |
| **Class methods** | 5h | ⚠️ OK (methods testable) | ⚠️ OK | ⚠️ OK | ⚠️ Consider |
| **State machine library** | 8h | ✅ Good | ⚠️ Learning curve | ✅ Good | ❌ Reject (dependency) |
| **Modular runners** | 24h | ✅ Excellent | ✅ Excellent | ✅ Excellent | ✅ **CHOSEN** |

**Why modular runners wins**:

1. **Testability**: Each state independently testable with <50 lines setup
2. **Maintainability**: Clear separation of concerns
3. **Extensibility**: Adding new state = add new runner (no StateGraph changes)
4. **No dependencies**: Pure TypeScript, no external libraries

**Why NOT class methods**:
- Still couples states to StateGraph class
- Harder to test (need whole StateGraph instance)
- Less clear separation

**Answer**: Modularization is the RIGHT choice for long-term maintainability, despite higher upfront cost.

**Decision**: ✅ PROCEED with modular runners, document alternatives in SPEC

---

## Open Questions ANSWERED

### Q1: What happens if a runner needs new dependencies?

**Answer**: Use optional dependencies with feature flags

```typescript
export interface VerifyRunnerDeps {
  verifier: Verifier;
  router: ModelRouter;
  incidentReporter?: IncidentReporter; // Optional
  securityScanner?: SecurityScanner; // Optional (future)
}

export async function runVerify(context, deps, ...) {
  // Use optional dependency if available
  if (deps.securityScanner) {
    const scanResult = await deps.securityScanner.scan();
    artifacts.securityScan = scanResult;
  }

  // Continue even if optional dep missing
}
```

**Decision**: ✅ Use optional deps for new features

---

### Q2: How do we handle state-specific context?

**Answer**: Use typed artifacts in RunnerContext

```typescript
export interface RunnerContext {
  task: TaskEnvelope;
  attemptNumber: number;
  artifacts: {
    plan?: PlannerAgentResult;
    implement?: ImplementerAgentResult;
    verify?: VerifierResult;
    [key: string]: unknown;
  };
}

// Verify runner can access plan + implement artifacts
export async function runVerify(context: RunnerContext, deps, ...) {
  const planResult = context.artifacts.plan as PlannerAgentResult;
  const implementResult = context.artifacts.implement as ImplementerAgentResult;

  if (!planResult || !implementResult) {
    throw new StateGraphError('Verify requires plan + implement', 'verify');
  }

  // Use artifacts...
}
```

**Decision**: ✅ Use typed artifacts in RunnerContext

---

### Q3: What about state runner composition?

**Answer**: Extract shared utilities, avoid premature abstraction

```typescript
// state_runners/utils.ts
export function createCheckpoint(state: AutopilotState, artifacts: unknown) {
  return {
    state,
    timestamp: new Date().toISOString(),
    artifacts: typeof artifacts === 'object' ? { ...artifacts } : { value: artifacts }
  };
}

// Use in runners
import { createCheckpoint } from './utils.js';

export async function runSpecify(context, deps) {
  // ... logic ...
  const checkpoint = createCheckpoint('specify', result);
  // ... save checkpoint ...
}
```

**Decision**: ✅ Start with simple utils, refactor if >3 duplications

---

### Q4: How do we version runner interfaces?

**Answer**: Accept breaking changes for internal code, use semver for exports

**Strategy**:
- Runners are INTERNAL (not exported from package)
- Breaking changes OK during development
- Once stable, freeze interfaces or use versioning

**For now**: Accept breaking changes, update all callers atomically

**Decision**: ✅ No versioning needed (internal code)

---

## Spike Investigations - EXECUTION PLAN

### SPIKE 1: Performance baseline measurement

**Status**: ✅ REQUIRED before implementation

**Execution**:
```bash
# 1. Add timing to current state_graph.ts
# Add this to state_graph.ts run() method before refactoring:

const stateTimings: Array<{ state: AutopilotState; duration: number }> = [];

while (current) {
  const stateStart = Date.now();

  switch (current) {
    // ... existing cases ...
  }

  const stateDuration = Date.now() - stateStart;
  stateTimings.push({ state: current, duration: stateDuration });
  artifacts.stateTimings = stateTimings;
}

# 2. Run tests and capture timings
npm test -- state_graph.test.ts > baseline_timings.log

# 3. Extract timings from test output
grep "stateTimings" baseline_timings.log > baseline_performance.json

# 4. Calculate baseline metrics
node -e "
const timings = require('./baseline_performance.json');
const specify = timings.filter(t => t.state === 'specify').map(t => t.duration);
console.log('Specify p50:', median(specify), 'ms');
// ... repeat for all states
"
```

**Time**: 2 hours
**Owner**: Claude Council
**Due**: Before IMPLEMENT stage

---

### SPIKE 2: StateGraph dependency analysis

**Status**: ✅ COMPLETE

**Execution**:
```bash
cd tools/wvo_mcp
grep -r "StateGraph\|state_graph" src/ --include="*.ts" | grep -v "state_graph.ts" | grep "import"
```

**ACTUAL Results**: Only 2 dependencies found:
1. **`src/orchestrator/state_graph.test.ts`** - Test file (expected)
2. **`src/orchestrator/unified_orchestrator.ts`** - Main consumer (expected)

**unified_orchestrator.ts Usage Analysis**:

Lines where StateGraph is used:
- Line 61: Import statement
  ```typescript
  import { StateGraph, type StateGraphTaskContext, type CheckpointClient } from './state_graph.js';
  ```
- Line 521: Private field
  ```typescript
  private readonly stateGraph: StateGraph;
  ```
- Line 750: Instantiation
  ```typescript
  this.stateGraph = this.createStateGraph();
  ```
- Line 754-780: Constructor call
  ```typescript
  return new StateGraph(
    { planner, thinker, implementer, verifier, reviewer, critical, supervisor, router, journal, memory, contextAssembler },
    { workspaceRoot, runId, incidentReporter }
  );
  ```
- Line 825: Main execution
  ```typescript
  const result = await this.stateGraph.run(this.toTaskEnvelope(task) as StateGraphTaskContext);
  ```

**API Surface** (MUST NOT CHANGE):
1. Constructor signature: `new StateGraph(deps, options)`
2. Method signature: `stateGraph.run(task): Promise<StateGraphResult>`
3. Types exported:
   - `StateGraphTaskContext`
   - `CheckpointClient`
   - `StateGraph` (class)
   - `StateGraphResult` (interface)
   - `StateGraphError` (class)

**Conclusion**: ✅ VERY LIMITED dependencies - only 1 production file uses StateGraph. Low risk of breaking changes if we preserve the API.

**Time**: 30 minutes (completed)
**Owner**: Claude Council
**Due**: ✅ DONE

---

## Risk Summary - FINAL ASSESSMENT

### HIGH RISKS - MITIGATED ✅

1. **No performance baseline** → ✅ SPIKE 1 required, added to plan
2. **Backward compatibility unknown** → ✅ API + behavior tests added
3. **Error handling gaps** → ✅ Comprehensive error strategy defined
4. **Time estimate underestimated** → ✅ Revised to 24 hours (3 days)

### MEDIUM RISKS - MONITORED ⚠️

1. **Shared state race conditions** → ✅ Documented assumptions, memory tests added
2. **Test quality concerns** → ✅ Behavior-driven template + validate_test_quality.sh
3. **Debugging harder** → ✅ Good logging + error context + docs

### LOW RISKS - ACCEPTED ✅

1. **Increased cognitive load** → ✅ Justified by testability gains
2. **Memory leaks** → ✅ Tests will catch
3. **Simpler alternatives exist** → ✅ Evaluated and rejected

---

## FINAL VERDICT

**Adversarial Assessment**: All major concerns ADDRESSED ✅

**Proceed to IMPLEMENT with**:
1. ✅ Performance baseline SPIKE first
2. ✅ Revised time estimate (24 hours)
3. ✅ Comprehensive error handling
4. ✅ Behavior-driven tests with quality validation
5. ✅ API + behavior compatibility tests
6. ✅ Memory leak tests
7. ✅ Documented assumptions

**Next Stage**: SPIKE 1 (performance baseline), then IMPLEMENT

---

**Executor**: Claude Council
**Date**: 2025-10-26
**Protocol Stage**: 3/8 (THINK - ADVERSARIAL ANSWERS)
**Status**: ✅ COMPLETE - All questions answered, ready for IMPLEMENT
