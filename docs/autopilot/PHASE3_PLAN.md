# Phase 3 – Implementation Plan

## PLAN (Stage 2)

**Date**: 2025-10-26
**Executor**: Claude Council
**Phase**: 3 of 7 (Recovery Playbook)
**Previous Stage**: SPEC ✅

---

## Implementation Steps

### Step 1: Create State Runner Directory Structure (15 min)

**Goal**: Set up directory structure for modular runners

**Actions**:
```bash
cd tools/wvo_mcp/src/orchestrator
mkdir -p state_runners
mkdir -p __tests__/state_runners
```

**Files Created**:
- `src/orchestrator/state_runners/` (directory)
- `src/orchestrator/__tests__/state_runners/` (directory)

**Verification**:
```bash
ls -la src/orchestrator/state_runners/
ls -la src/orchestrator/__tests__/state_runners/
```

---

### Step 2: Extract Shared Runner Utilities (30 min)

**Goal**: Create shared utilities used by all runners

**File**: `src/orchestrator/state_runners/runner_utils.ts`

**Exports**:
```typescript
// Common context type used by all runners
export interface RunnerContext {
  task: TaskEnvelope;
  attemptNumber: number;
  routerDecisions: Array<{ state: AutopilotState; selection?: ModelSelection }>;
  resolutionTrace: ResolutionResult[];
}

// Common result type
export interface RunnerResult {
  success: boolean;
  nextState: AutopilotState | null;
  artifacts: Record<string, unknown>;
  notes: string[];
  requirePlanDelta?: boolean;
  requireThinker?: boolean;
  spikeBranch?: string;
}

// Utility functions
export function recordRouterDecision(/* ... */): void;
export function checkRetryLimit(state: AutopilotState, attempt: number): boolean;
export function getRetryLimit(state: AutopilotState): number;
```

**Dependencies**:
- `task_envelope.ts`
- `router_policy.ts`
- `model_router.ts`
- `resolution_engine.ts`

**Verification**:
```bash
npm run build  # Must compile without errors
```

**Estimated Time**: 30 minutes

---

### Step 3: Create Specify Runner (20 min)

**File**: `src/orchestrator/state_runners/specify_runner.ts`

**Interface**:
```typescript
export interface SpecifyRunnerDeps {
  supervisor: SupervisorAgent;
}

export async function runSpecify(
  context: RunnerContext,
  deps: SpecifyRunnerDeps
): Promise<RunnerResult>
```

**Logic** (extracted from state_graph.ts lines 124-142):
- Call `supervisor.specify(task)`
- Record acceptance criteria
- Return `nextState: 'plan'`

**Test File**: `__tests__/state_runners/specify_runner.test.ts`

**Test Cases**:
1. ✅ Specify completes successfully
2. ✅ Acceptance criteria recorded
3. ✅ Router decision logged
4. ✅ Next state is 'plan'

**Verification**:
```bash
npm test -- src/orchestrator/__tests__/state_runners/specify_runner.test.ts
```

**Estimated Time**: 20 minutes

---

### Step 4: Create Plan Runner (45 min)

**File**: `src/orchestrator/state_runners/plan_runner.ts`

**Interface**:
```typescript
export interface PlanRunnerDeps {
  planner: PlannerAgent;
  planHashes: Map<string, string>;
  planDeltaRequired: Set<string>;
  pendingThinker: Set<string>;
  spikeBranches: Map<string, string>;
}

export async function runPlan(
  context: RunnerContext,
  deps: PlanRunnerDeps
): Promise<RunnerResult>
```

**Logic** (extracted from state_graph.ts lines 144-184):
- Check retry budget
- Check for plan delta requirement
- Call `planner.run()`
- Validate plan hash (ensure delta if required)
- Determine next state (thinker if needed, otherwise implement)

**Test File**: `__tests__/state_runners/plan_runner.test.ts`

**Test Cases**:
1. ✅ Plan completes successfully → implement
2. ✅ Plan requires thinker → thinker
3. ✅ Plan delta required, same hash → throws error
4. ✅ Plan delta required, new hash → success
5. ✅ Retry ceiling exceeded → throws error
6. ✅ Spike branch recorded

**Verification**:
```bash
npm test -- src/orchestrator/__tests__/state_runners/plan_runner.test.ts
```

**Estimated Time**: 45 minutes

---

### Step 5: Create Thinker Runner (30 min)

**File**: `src/orchestrator/state_runners/thinker_runner.ts`

**Interface**:
```typescript
export interface ThinkerRunnerDeps {
  thinker: ThinkerAgent;
}

export async function runThinker(
  context: RunnerContext,
  deps: ThinkerRunnerDeps,
  planHash: string
): Promise<RunnerResult>
```

**Logic** (extracted from state_graph.ts lines 186-212):
- Call `thinker.reflect()`
- Capture insights
- Return `nextState: 'implement'`

**Test File**: `__tests__/state_runners/thinker_runner.test.ts`

**Test Cases**:
1. ✅ Thinker completes successfully
2. ✅ Insights captured
3. ✅ Router decision logged
4. ✅ Next state is 'implement'
5. ✅ Retry ceiling exceeded → throws error

**Verification**:
```bash
npm test -- src/orchestrator/__tests__/state_runners/thinker_runner.test.ts
```

**Estimated Time**: 30 minutes

---

### Step 6: Create Implement Runner (60 min)

**File**: `src/orchestrator/state_runners/implement_runner.ts`

**Interface**:
```typescript
export interface ImplementRunnerDeps {
  implementer: ImplementerAgent;
  patchHistory: Map<string, Set<string>>;
}

export async function runImplement(
  context: RunnerContext,
  deps: ImplementRunnerDeps,
  planHash: string,
  insights: string[]
): Promise<RunnerResult>
```

**Logic** (extracted from state_graph.ts lines 214-253):
- Check retry budget
- Call `implementer.apply()`
- Check for implementation failure → require plan delta, return to plan
- Check for duplicate patch → require plan delta, return to plan
- Record patch hash
- Return `nextState: 'verify'`

**Test File**: `__tests__/state_runners/implement_runner.test.ts`

**Test Cases**:
1. ✅ Implement succeeds → verify
2. ✅ Implement fails → plan (with plan delta required)
3. ✅ Duplicate patch detected → plan (with plan delta required)
4. ✅ Retry ceiling exceeded → throws error
5. ✅ Patch hash recorded

**Verification**:
```bash
npm test -- src/orchestrator/__tests__/state_runners/implement_runner.test.ts
```

**Estimated Time**: 60 minutes

---

### Step 7: Create Verify Runner (90 min) - MOST COMPLEX

**File**: `src/orchestrator/state_runners/verify_runner.ts`

**Interface**:
```typescript
export interface VerifyRunnerDeps {
  verifier: Verifier;
  router: ModelRouter;
  incidentReporter?: IncidentReporter;
  workspaceRoot: string;
  runId: string;
}

export async function runVerify(
  context: RunnerContext,
  deps: VerifyRunnerDeps,
  implementResult: ImplementerAgentResult,
  planResult: PlannerAgentResult
): Promise<RunnerResult>
```

**Logic** (extracted from state_graph.ts lines 255-331):
- Check retry budget
- Call `verifier.verify()`
- Check integrity violations
- On failure:
  - Note verify failure in router
  - Require plan delta
  - Run resolution engine
  - Record resolution trace
  - Check for thinker requirement
  - Check for spike branch
  - Return to plan
- On success:
  - Clear task in router
  - Return `nextState: 'review'`

**Test File**: `__tests__/state_runners/verify_runner.test.ts`

**Test Cases**:
1. ✅ Verify succeeds → review
2. ✅ Verify fails (gate failure) → plan + resolution
3. ✅ Integrity violation (coverage) → plan + resolution
4. ✅ Integrity violation (skipped tests) → plan + resolution
5. ✅ Integrity violation (placeholders) → plan + resolution
6. ✅ Resolution requires thinker → pendingThinker set
7. ✅ Resolution creates spike branch → spikeBranch recorded
8. ✅ Retry ceiling exceeded → throws error
9. ✅ Router noteVerifyFailure called on failure
10. ✅ Router clearTask called on success

**Verification**:
```bash
npm test -- src/orchestrator/__tests__/state_runners/verify_runner.test.ts
```

**Estimated Time**: 90 minutes

---

### Step 8: Create Review Runner (45 min)

**File**: `src/orchestrator/state_runners/review_runner.ts`

**Interface**:
```typescript
export interface ReviewRunnerDeps {
  reviewer: ReviewerAgent;
  critical: CriticalAgent;
}

export async function runReview(
  context: RunnerContext,
  deps: ReviewRunnerDeps,
  implementResult: ImplementerAgentResult,
  verifierResult: VerifierResult
): Promise<RunnerResult>
```

**Logic** (extracted from state_graph.ts lines 333-370):
- Check retry budget
- Call `reviewer.review()` and `critical.audit()` in parallel
- If not approved or critical issues → require plan delta, return to plan
- If approved → return `nextState: 'pr'`

**Test File**: `__tests__/state_runners/review_runner.test.ts`

**Test Cases**:
1. ✅ Review approved, no critical issues → pr
2. ✅ Review rejected → plan (with plan delta required)
3. ✅ Critical issues found → plan (with plan delta required)
4. ✅ Retry ceiling exceeded → throws error

**Verification**:
```bash
npm test -- src/orchestrator/__tests__/state_runners/review_runner.test.ts
```

**Estimated Time**: 45 minutes

---

### Step 9: Create PR Runner (30 min)

**File**: `src/orchestrator/state_runners/pr_runner.ts`

**Interface**:
```typescript
export interface PrRunnerDeps {
  supervisor: SupervisorAgent;
}

export async function runPr(
  context: RunnerContext,
  deps: PrRunnerDeps
): Promise<RunnerResult>
```

**Logic** (extracted from state_graph.ts lines 372-395):
- Call `supervisor.preparePr()`
- If not ready → require plan delta, return to plan
- If ready → return `nextState: 'monitor'`

**Test File**: `__tests__/state_runners/pr_runner.test.ts`

**Test Cases**:
1. ✅ PR checklist satisfied → monitor
2. ✅ PR checklist failed → plan (with plan delta required)
3. ✅ Retry ceiling exceeded → throws error

**Verification**:
```bash
npm test -- src/orchestrator/__tests__/state_runners/pr_runner.test.ts
```

**Estimated Time**: 30 minutes

---

### Step 10: Create Monitor Runner (60 min)

**File**: `src/orchestrator/state_runners/monitor_runner.ts`

**Interface**:
```typescript
export interface MonitorRunnerDeps {
  supervisor: SupervisorAgent;
  workspaceRoot: string;
}

export async function runMonitor(
  context: RunnerContext,
  deps: MonitorRunnerDeps
): Promise<RunnerResult>
```

**Logic** (extracted from state_graph.ts lines 397-430):
- Call `supervisor.monitor()`
- Run app smoke test (`scripts/app_smoke_e2e.sh`)
- If smoke fails → require plan delta, return to plan
- If smoke succeeds → return `nextState: null` (terminal state)

**Test File**: `__tests__/state_runners/monitor_runner.test.ts`

**Test Cases**:
1. ✅ Monitor succeeds, smoke passes → done (nextState: null)
2. ✅ Monitor smoke fails → plan (with plan delta required)
3. ✅ Retry ceiling exceeded → throws error
4. ✅ App smoke script executed
5. ✅ App smoke log captured

**Verification**:
```bash
npm test -- src/orchestrator/__tests__/state_runners/monitor_runner.test.ts
```

**Estimated Time**: 60 minutes

---

### Step 11: Refactor StateGraph to Use Runners (120 min)

**File**: `src/orchestrator/state_graph.ts`

**Changes**:
1. Import all runner functions
2. Replace giant switch statement (lines 123-434) with runner delegation
3. Keep orchestration logic:
   - Retry tracking (attemptCounter)
   - Plan hash tracking (planHashes)
   - Patch history (patchHistory)
   - Plan delta requirements (planDeltaRequired)
   - Thinker requirements (pendingThinker)
   - Spike branches (spikeBranches)
   - Resolution traces (resolutionTraces)
   - Context packs (contextPackRefs)
   - Checkpointing
   - Context assembly
4. Simplify `run()` method to ~100 lines (from 330+ lines)

**New Structure**:
```typescript
async run(task: StateGraphTaskContext): Promise<StateGraphResult> {
  const context: RunnerContext = {
    task,
    attemptNumber: 0,
    routerDecisions: [],
    resolutionTrace: [],
  };

  let current: AutopilotState = 'specify';
  let artifacts: Record<string, unknown> = {};
  let notes: string[] = [];

  // Shared state for runners
  let planResult: PlannerAgentResult | undefined;
  let implementResult: ImplementerAgentResult | undefined;
  let verifierResult: VerifierResult | undefined;
  let thinkerInsights: string[] = [];

  try {
    while (current) {
      this.incrementAttempt(task.id, current);
      context.attemptNumber = this.getAttempt(task.id, current);

      let result: RunnerResult;

      switch (current) {
        case 'specify':
          result = await runSpecify(context, { supervisor: this.deps.supervisor });
          break;
        case 'plan':
          result = await runPlan(context, {
            planner: this.deps.planner,
            planHashes: this.planHashes,
            planDeltaRequired: this.planDeltaRequired,
            pendingThinker: this.pendingThinker,
            spikeBranches: this.spikeBranches,
          });
          planResult = result.artifacts.plan as PlannerAgentResult;
          break;
        case 'thinker':
          if (!planResult) throw new StateGraphError('Thinker requires plan', current);
          result = await runThinker(context, { thinker: this.deps.thinker }, planResult.planHash);
          thinkerInsights = result.artifacts.thinker?.insights ?? [];
          break;
        case 'implement':
          if (!planResult) throw new StateGraphError('Implement requires plan', current);
          result = await runImplement(
            context,
            { implementer: this.deps.implementer, patchHistory: this.patchHistory },
            planResult.planHash,
            thinkerInsights
          );
          implementResult = result.artifacts.implement as ImplementerAgentResult;
          break;
        case 'verify':
          if (!implementResult || !planResult) throw new StateGraphError('Verify requires plan+implement', current);
          result = await runVerify(
            context,
            {
              verifier: this.deps.verifier,
              router: this.deps.router,
              incidentReporter: this.incidentReporter,
              workspaceRoot: this.workspaceRoot,
              runId: this.runId,
            },
            implementResult,
            planResult
          );
          verifierResult = result.artifacts.verify as VerifierResult;
          break;
        case 'review':
          if (!implementResult || !verifierResult) throw new StateGraphError('Review requires implement+verify', current);
          result = await runReview(
            context,
            { reviewer: this.deps.reviewer, critical: this.deps.critical },
            implementResult,
            verifierResult
          );
          break;
        case 'pr':
          result = await runPr(context, { supervisor: this.deps.supervisor });
          break;
        case 'monitor':
          result = await runMonitor(context, {
            supervisor: this.deps.supervisor,
            workspaceRoot: this.workspaceRoot,
          });
          break;
        default:
          throw new StateGraphError(`Unknown state ${current}`, current);
      }

      // Handle result
      artifacts = { ...artifacts, ...result.artifacts };
      notes.push(...result.notes);

      if (result.requirePlanDelta) {
        this.requirePlanDelta(task.id);
      }
      if (result.requireThinker) {
        this.pendingThinker.add(task.id);
      }
      if (result.spikeBranch) {
        this.spikeBranches.set(task.id, result.spikeBranch);
      }

      await this.checkpoint(task.id, current, result.artifacts);
      await this.emitContextPack(/* ... */);

      current = result.nextState;
    }

    // Success - attach final artifacts
    this.attachContextPackArtifacts(task.id, artifacts);
    return { success: true, finalState: 'monitor', notes, artifacts };

  } catch (error) {
    // Error handling...
  }
}
```

**Test File**: `__tests__/state_runners/state_graph_modular.test.ts`

**Test Cases**:
1. ✅ Full happy path flow (specify → plan → implement → verify → review → pr → monitor)
2. ✅ Flow with thinker (specify → plan → thinker → implement → verify → review → pr → monitor)
3. ✅ Verify failure triggers resolution → plan
4. ✅ Review failure → plan
5. ✅ PR failure → plan
6. ✅ Monitor smoke failure → plan
7. ✅ Retry ceiling exceeded in any state → incident reporter
8. ✅ Plan delta enforced
9. ✅ Spike branch created and tracked
10. ✅ Resolution trace recorded

**Verification**:
```bash
npm test -- src/orchestrator/__tests__/state_runners/state_graph_modular.test.ts
```

**Estimated Time**: 120 minutes

---

### Step 12: Add Stress Tests for Retry Ceilings (60 min)

**File**: `__tests__/state_runners/retry_ceiling.stress.test.ts`

**Test Cases**:
1. ✅ Specify: 2 retries max, 3rd triggers incident
2. ✅ Plan: 2 retries max, 3rd triggers incident
3. ✅ Thinker: 1 retry max, 2nd triggers incident
4. ✅ Implement: 3 retries max, 4th triggers incident
5. ✅ Verify: 2 retries max, 3rd triggers incident
6. ✅ Review: 2 retries max, 3rd triggers incident
7. ✅ PR: 1 retry max, 2nd triggers incident
8. ✅ Monitor: 1 retry max, 2nd triggers incident
9. ✅ Incident reporter creates MRFC directory
10. ✅ Incident reporter creates README.md
11. ✅ Incident reporter creates run.sh
12. ✅ Incident reporter calls policy.require_human()

**Verification**:
```bash
npm test -- src/orchestrator/__tests__/state_runners/retry_ceiling.stress.test.ts
```

**Estimated Time**: 60 minutes

---

### Step 13: Update Integration Tests (30 min)

**File**: `__tests__/state_graph_integration.test.ts` (existing)

**Changes**:
- Update to use modular runners
- Verify end-to-end flow still works
- Verify all existing tests pass

**Verification**:
```bash
npm test -- src/orchestrator/__tests__/state_graph_integration.test.ts
```

**Estimated Time**: 30 minutes

---

### Step 14: Update Documentation (45 min)

**Files to Update**:
1. `docs/autopilot/PHASE3_COMPLETION_REPORT.md` (create)
2. `docs/CONTEXT_SYSTEM.md` (update state graph section)
3. `docs/MODEL_ROUTING_POLICY.md` (update router integration section)
4. `README.md` in `src/orchestrator/state_runners/` (create)

**Content**:
- Overview of modular runner architecture
- How to add new states
- How to test individual runners
- Integration with state graph

**Estimated Time**: 45 minutes

---

## Summary of Files

### Files Created (20 total)

**Runner Modules (9)**:
1. `state_runners/runner_utils.ts`
2. `state_runners/specify_runner.ts`
3. `state_runners/plan_runner.ts`
4. `state_runners/thinker_runner.ts`
5. `state_runners/implement_runner.ts`
6. `state_runners/verify_runner.ts`
7. `state_runners/review_runner.ts`
8. `state_runners/pr_runner.ts`
9. `state_runners/monitor_runner.ts`

**Test Files (10)**:
1. `__tests__/state_runners/specify_runner.test.ts`
2. `__tests__/state_runners/plan_runner.test.ts`
3. `__tests__/state_runners/thinker_runner.test.ts`
4. `__tests__/state_runners/implement_runner.test.ts`
5. `__tests__/state_runners/verify_runner.test.ts`
6. `__tests__/state_runners/review_runner.test.ts`
7. `__tests__/state_runners/pr_runner.test.ts`
8. `__tests__/state_runners/monitor_runner.test.ts`
9. `__tests__/state_runners/state_graph_modular.test.ts`
10. `__tests__/state_runners/retry_ceiling.stress.test.ts`

**Documentation (1)**:
1. `state_runners/README.md`

### Files Modified (4)

1. `state_graph.ts` - Refactored to use runners
2. `__tests__/state_graph_integration.test.ts` - Updated for modular runners
3. `docs/CONTEXT_SYSTEM.md` - Updated state graph section
4. `docs/MODEL_ROUTING_POLICY.md` - Updated router integration

---

## Verification Commands

### Build
```bash
cd tools/wvo_mcp && npm run build
```

### Tests
```bash
# Run all state runner tests
npm test -- src/orchestrator/__tests__/state_runners/

# Run specific runner tests
npm test -- src/orchestrator/__tests__/state_runners/specify_runner.test.ts
npm test -- src/orchestrator/__tests__/state_runners/plan_runner.test.ts
npm test -- src/orchestrator/__tests__/state_runners/thinker_runner.test.ts
npm test -- src/orchestrator/__tests__/state_runners/implement_runner.test.ts
npm test -- src/orchestrator/__tests__/state_runners/verify_runner.test.ts
npm test -- src/orchestrator/__tests__/state_runners/review_runner.test.ts
npm test -- src/orchestrator/__tests__/state_runners/pr_runner.test.ts
npm test -- src/orchestrator/__tests__/state_runners/monitor_runner.test.ts

# Run integration tests
npm test -- src/orchestrator/__tests__/state_runners/state_graph_modular.test.ts

# Run stress tests
npm test -- src/orchestrator/__tests__/state_runners/retry_ceiling.stress.test.ts

# Run all tests
npm test
```

### Audit
```bash
npm audit
```

### Linting
```bash
npm run lint
```

---

## Time Estimates

| Step | Task | Time (min) |
|------|------|-----------|
| 1 | Create directory structure | 15 |
| 2 | Extract shared utilities | 30 |
| 3 | Specify runner | 20 |
| 4 | Plan runner | 45 |
| 5 | Thinker runner | 30 |
| 6 | Implement runner | 60 |
| 7 | Verify runner (most complex) | 90 |
| 8 | Review runner | 45 |
| 9 | PR runner | 30 |
| 10 | Monitor runner | 60 |
| 11 | Refactor StateGraph | 120 |
| 12 | Stress tests | 60 |
| 13 | Update integration tests | 30 |
| 14 | Documentation | 45 |
| **Total** | | **680 min (~11 hours)** |

---

## Dependencies

### External Dependencies (Unchanged)
- All existing agent modules (planner, thinker, implementer, verifier, reviewer, critical, supervisor)
- Model router
- Resolution engine
- Incident reporter
- Decision journal
- Context assembler

### Internal Dependencies (New)
- `runner_utils.ts` → All runner modules depend on this
- All runner modules → `state_graph.ts` imports all runners

---

## Risk Mitigation

### Risk: Breaking existing integrations
**Mitigation**:
- Keep StateGraph API unchanged
- Run full integration tests before/after
- Maintain backward compatibility

### Risk: Performance regression
**Mitigation**:
- Performance benchmarks before/after
- Target < 100ms overhead per transition
- Stress test with 1000+ transitions

### Risk: Missing test coverage
**Mitigation**:
- Use UNIVERSAL_TEST_STANDARDS.md checklist for each runner
- Stress tests for retry ceilings
- Integration test for full flow

---

## Plan Hash

```
plan_hash: phase3-state-graph-modularization-v1
timestamp: 2025-10-26T02:30:00Z
steps: 14
estimated_time: 680 minutes
files_created: 20
files_modified: 4
```

---

## Next Steps

**Current Stage**: PLAN ✅ COMPLETE
**Next Stage**: THINK (Adversarial Review of Plan)

---

**Executor**: Claude Council
**Date**: 2025-10-26
**Protocol Stage**: 2/8 (PLAN)
