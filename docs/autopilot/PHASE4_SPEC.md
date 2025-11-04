# Phase 4: Foundation - Model Router + WIP Limits

**Date**: 2025-10-26
**Status**: SPEC
**Goal**: Establish foundation for cost-efficient, focused execution

---

## Mission

Build the two foundational systems that enable all future optimizations:
1. **Intelligent Model Router** - 60% cost reduction through complexity-based model selection
2. **WIP Limits** - Eliminate context-switching waste through strict work-in-progress caps

**Why these first?**
- Model Router **enables budget** for all other features (can't afford Sonnet 4.5 without it)
- WIP Limits **enable focus** (complete tasks instead of starting them)

---

## Problem Statement

### Current Issues

**Cost Inefficiency:**
- Using Sonnet 4.5 for ALL tasks (even trivial ones)
- Current: $12/day for 2 tasks
- 70% of tasks could use Haiku ($0.001/1K vs $0.03/1K)
- Burning 30x more budget than necessary on simple tasks

**Context Switching Chaos:**
- No limit on concurrent tasks
- Workers start new tasks before finishing old ones
- Result: 10 tasks in-progress, 0 completed
- "Velocity illusion" - looks busy, delivers nothing

### Impact

Without these fixes:
- Can't afford to scale (budget explodes)
- Can't complete tasks (everything half-done)
- Other phases blocked (need budget + completion)

---

## Acceptance Criteria

### Model Router

**Functional Requirements:**
1. ✅ Assess task complexity on 0-10 scale
2. ✅ Select model based on complexity:
   - 0-3: Haiku ($0.001/1K) - 70% of tasks
   - 4-6: Sonnet 3.5 ($0.015/1K) - 20% of tasks
   - 7-9: Sonnet 4.5 ($0.03/1K) - 9% of tasks
   - 10: Sonnet 4.5 + Extended Thinking ($0.05/1K) - 1% of tasks
3. ✅ Support model override for critical tasks
4. ✅ Track model selection decisions in telemetry
5. ✅ Provide routing rationale in execution logs

**Quality Requirements:**
1. ✅ 100% of tasks routed (no fallback to default)
2. ✅ <5% misrouting rate (task uses wrong model)
3. ✅ <10ms routing overhead per task
4. ✅ Comprehensive tests (happy paths, edge cases, overrides)

**Cost Requirements:**
1. ✅ Achieve 60% cost reduction within 1 week
2. ✅ Maintain quality (critic pass rate ≥85%)
3. ✅ No complexity assessment overhead (use metadata)

### WIP Limits

**Functional Requirements:**
1. ✅ Enforce per-worker WIP limit (1 task max)
2. ✅ Enforce global WIP limit (6 tasks for 6 workers)
3. ✅ Block task assignment when WIP exceeded
4. ✅ Queue tasks when WIP at capacity
5. ✅ Release WIP slot immediately on task completion

**Quality Requirements:**
1. ✅ No task starvation (all tasks eventually execute)
2. ✅ Fair scheduling (FIFO within priority)
3. ✅ No race conditions (concurrent assignment)
4. ✅ Comprehensive tests (limits, queueing, fairness)

**Behavior Requirements:**
1. ✅ Prefetch stops when WIP reached
2. ✅ Workers idle when no tasks AND WIP limit not reached
3. ✅ Clear logging of WIP state ("WIP: 5/6, queue: 3")

---

## Architecture

### Model Router

**Component:** `ComplexityRouter`
**Location:** `tools/wvo_mcp/src/orchestrator/complexity_router.ts`

```typescript
export interface TaskComplexity {
  score: number;        // 0-10
  factors: string[];    // What contributed to score
  reasoning: string;    // Why this score
}

export interface ModelSelection {
  model: string;        // Model ID
  provider: string;     // Provider name
  cost: number;         // Estimated cost per 1K tokens
  rationale: string;    // Why this model
}

export class ComplexityRouter {
  assessComplexity(task: TaskEnvelope): TaskComplexity;
  selectModel(complexity: TaskComplexity): ModelSelection;
  override(task: TaskEnvelope, model: string): ModelSelection;
}
```

**Complexity Factors:**
```typescript
Score =
  + (dependencies.length * 2)        // More deps = complex
  + (epic_id ? 2 : 0)                // Epic tasks = complex
  + (description.length > 500 ? 2 : 0) // Long description = complex
  + (requires_ml ? 3 : 0)            // ML work = complex
  + (affects_security ? 3 : 0)       // Security = complex
  + (public_api ? 2 : 0)             // Public API = complex
  + (cross_domain ? 1 : 0)           // Multiple domains = complex
```

**Model Thresholds:**
```typescript
const MODEL_TIERS = {
  simple: { max: 3, model: 'claude-haiku-4.5', cost: 0.001 },
  moderate: { max: 6, model: 'claude-3-5-sonnet-20241022', cost: 0.015 },
  complex: { max: 9, model: 'claude-sonnet-4.5', cost: 0.03 },
  critical: { max: 10, model: 'claude-sonnet-4.5', cost: 0.05, extendedThinking: true },
};
```

### WIP Limits

**Component:** `WIPController`
**Location:** `tools/wvo_mcp/src/orchestrator/wip_controller.ts`

```typescript
export interface WIPStatus {
  current: number;      // Tasks in progress
  limit: number;        // Maximum allowed
  available: number;    // Slots available
  queued: number;       // Tasks waiting
}

export class WIPController {
  canAcceptTask(): boolean;
  reserveSlot(taskId: string): boolean;
  releaseSlot(taskId: string): void;
  getStatus(): WIPStatus;
  getQueuedTasks(): TaskEnvelope[];
}
```

**Enforcement Points:**
1. **Task Prefetch** (`unified_orchestrator.ts:prefetchTasks()`):
   - Check WIP before prefetching
   - Stop if WIP >= limit

2. **Task Assignment** (`unified_orchestrator.ts:assignNextTaskIfAvailable()`):
   - Reserve WIP slot before assignment
   - Fail assignment if reservation fails

3. **Task Completion** (all runners):
   - Release WIP slot on success or failure
   - Trigger next task assignment

**Configuration:**
```typescript
const WIP_CONFIG = {
  perWorker: 1,         // 1 task per worker max
  global: 6,            // 6 workers = 6 concurrent tasks max
  queueLimit: 50,       // Max 50 tasks in queue
};
```

---

## Integration Points

### 1. StateGraph Integration

**Current:**
```typescript
// state_graph.ts:135
const result = await runSpecify({ task, attemptNumber }, { supervisor });
```

**After:**
```typescript
// state_graph.ts:135
const complexity = this.router.assessComplexity(task);
const modelSelection = this.router.selectModel(complexity);
const result = await runSpecify(
  { task, attemptNumber, modelSelection },
  { supervisor }
);
```

**Changes:**
- Pass `modelSelection` to all runners
- Runners use selected model for agent calls
- Record selection in telemetry

### 2. Unified Orchestrator Integration

**Current:**
```typescript
// unified_orchestrator.ts:240
async prefetchTasks(): Promise<void> {
  const readyTasks = this.stateMachine.getReadyTasks();
  this.taskQueue.push(...readyTasks);
}
```

**After:**
```typescript
// unified_orchestrator.ts:240
async prefetchTasks(): Promise<void> {
  // Check WIP before prefetching
  if (!this.wipController.canAcceptTask()) {
    logDebug('WIP limit reached, skipping prefetch', this.wipController.getStatus());
    return;
  }

  const needed = this.wipController.getStatus().available;
  const readyTasks = this.stateMachine.getReadyTasks();
  this.taskQueue.push(...readyTasks.slice(0, needed));
}
```

**Current:**
```typescript
// unified_orchestrator.ts:280
async assignNextTaskIfAvailable(agent: Agent): Promise<void> {
  const task = this.taskQueue.shift();
  if (task) {
    await agent.execute(task);
  }
}
```

**After:**
```typescript
// unified_orchestrator.ts:280
async assignNextTaskIfAvailable(agent: Agent): Promise<void> {
  const task = this.taskQueue.shift();
  if (!task) return;

  // Reserve WIP slot
  if (!this.wipController.reserveSlot(task.id)) {
    logWarning('WIP limit reached, requeueing task', { taskId: task.id });
    this.taskQueue.unshift(task); // Put back at front
    return;
  }

  try {
    await agent.execute(task);
  } finally {
    // Always release slot
    this.wipController.releaseSlot(task.id);
  }
}
```

---

## Testing Strategy

### Model Router Tests

**Unit Tests** (`complexity_router.test.ts`):
```typescript
describe('ComplexityRouter', () => {
  describe('assessComplexity', () => {
    it('scores simple task as 0-3', () => {
      const task = { id: 'T1', title: 'Fix typo', description: 'Change "teh" to "the"' };
      const complexity = router.assessComplexity(task);
      expect(complexity.score).toBeLessThanOrEqual(3);
    });

    it('scores complex task as 7+', () => {
      const task = {
        id: 'T1',
        title: 'Refactor ML pipeline',
        description: '...500+ chars...',
        dependencies: ['T2', 'T3'],
        metadata: { requires_ml: true, affects_security: true }
      };
      const complexity = router.assessComplexity(task);
      expect(complexity.score).toBeGreaterThanOrEqual(7);
    });
  });

  describe('selectModel', () => {
    it('selects Haiku for score 0-3', () => {
      const selection = router.selectModel({ score: 2, factors: [], reasoning: '' });
      expect(selection.model).toBe('claude-haiku-4.5');
    });

    it('selects Sonnet 4.5 for score 7+', () => {
      const selection = router.selectModel({ score: 8, factors: [], reasoning: '' });
      expect(selection.model).toBe('claude-sonnet-4.5');
    });
  });
});
```

**Integration Tests** (`state_graph_routing.test.ts`):
```typescript
describe('StateGraph with Model Routing', () => {
  it('routes simple task to Haiku', async () => {
    const task = { id: 'T1', title: 'Simple fix', description: 'Quick change' };
    const result = await stateGraph.run(task);

    const routerDecisions = result.artifacts.routerDecisions;
    expect(routerDecisions[0].selection.model).toBe('claude-haiku-4.5');
  });

  it('routes complex task to Sonnet 4.5', async () => {
    const task = {
      id: 'T1',
      title: 'Refactor core system',
      description: '...500+ chars...',
      dependencies: ['T2', 'T3'],
      metadata: { affects_security: true }
    };
    const result = await stateGraph.run(task);

    const routerDecisions = result.artifacts.routerDecisions;
    expect(routerDecisions[0].selection.model).toBe('claude-sonnet-4.5');
  });
});
```

### WIP Limits Tests

**Unit Tests** (`wip_controller.test.ts`):
```typescript
describe('WIPController', () => {
  it('blocks when WIP at limit', () => {
    const wip = new WIPController({ limit: 2 });
    wip.reserveSlot('T1');
    wip.reserveSlot('T2');

    expect(wip.canAcceptTask()).toBe(false);
    expect(wip.reserveSlot('T3')).toBe(false);
  });

  it('releases slot on completion', () => {
    const wip = new WIPController({ limit: 2 });
    wip.reserveSlot('T1');
    wip.reserveSlot('T2');
    wip.releaseSlot('T1');

    expect(wip.canAcceptTask()).toBe(true);
  });

  it('prevents duplicate reservations', () => {
    const wip = new WIPController({ limit: 2 });
    wip.reserveSlot('T1');

    expect(wip.reserveSlot('T1')).toBe(false);
  });
});
```

**Integration Tests** (`unified_orchestrator_wip.test.ts`):
```typescript
describe('Unified Orchestrator with WIP Limits', () => {
  it('stops prefetching when WIP reached', async () => {
    const orchestrator = new UnifiedOrchestrator({
      workers: 2,
      wipLimit: 2
    });

    // Start 2 tasks (WIP reached)
    await orchestrator.start();

    // Verify no more tasks prefetched
    expect(orchestrator.taskQueue.length).toBe(0);
  });

  it('resumes prefetching when WIP drops', async () => {
    const orchestrator = new UnifiedOrchestrator({
      workers: 2,
      wipLimit: 2
    });

    await orchestrator.start();
    // Complete 1 task
    await orchestrator.completeTask('T1');

    // Verify new task prefetched
    expect(orchestrator.taskQueue.length).toBeGreaterThan(0);
  });
});
```

---

## Success Metrics

### Model Router

**Cost Reduction:**
- Target: 60% reduction in daily cost
- Baseline: $12/day (all Sonnet 4.5)
- Goal: $5/day (mixed models)
- Measurement: Track daily token cost in telemetry

**Quality Maintenance:**
- Target: ≥85% critic pass rate
- Baseline: 85% with all Sonnet 4.5
- Goal: ≥85% with mixed models
- Measurement: Track critic success rate per model tier

**Routing Accuracy:**
- Target: <5% misrouting
- Measure: Manual review of 20 tasks
- Definition: Task failed due to insufficient model capacity

### WIP Limits

**Completion Rate:**
- Target: 80% of started tasks complete within 24h
- Baseline: 40% (many abandoned)
- Goal: 80% (fewer concurrent = more completion)
- Measurement: Track task completion time

**Context Switching:**
- Target: 1 task per worker at any time
- Baseline: 2-3 tasks per worker (thrashing)
- Goal: Exactly 1 task per worker
- Measurement: Max WIP per worker over time

**Queue Health:**
- Target: Queue length < 10 tasks
- Baseline: Queue grows unbounded
- Goal: Bounded queue (WIP prevents overflow)
- Measurement: Track queue length over time

---

## Risks & Mitigations

### Risk 1: Model Router Underestimates Complexity

**Symptom:** Simple model can't handle task, fails repeatedly
**Impact:** Task stuck in retry loop, wastes time
**Mitigation:**
- Track retry count per model tier
- Auto-escalate to higher tier after 2 failures
- Manual override option for critical tasks

### Risk 2: WIP Limits Too Strict

**Symptom:** Workers idle while tasks queued
**Impact:** Throughput drops below baseline
**Mitigation:**
- Make WIP limit configurable (env var)
- Start conservative (1 per worker), tune up if needed
- Monitor idle time vs queue length

### Risk 3: Integration Breaks Existing Flow

**Symptom:** Tests fail, StateGraph errors
**Impact:** Development blocked
**Mitigation:**
- Feature flags for router and WIP (disable if broken)
- Comprehensive integration tests before merge
- Gradual rollout (router first, then WIP)

---

## Dependencies

**External:**
- None (all internal code)

**Internal:**
- StateGraph (Phase 3) - must support model selection passing
- Unified Orchestrator - must support task prefetch control
- Telemetry - must record routing decisions and WIP status

---

## Out of Scope (Phase 5+)

**Not in Phase 4:**
- Task decomposition (Phase 5)
- Parallel execution across epics (Phase 5)
- Pre-flight quality checks (Phase 6)
- Peer review protocol (Phase 6)
- Blocker escalation (Phase 6)

---

## Implementation Timeline

**Day 1-2: Model Router**
- Implement ComplexityRouter class
- Add complexity assessment
- Add model selection logic
- Unit tests

**Day 3: Model Router Integration**
- Integrate with StateGraph
- Update all runners to use selected model
- Integration tests
- Measure cost reduction

**Day 4: WIP Controller**
- Implement WIPController class
- Add slot reservation/release
- Unit tests

**Day 5: WIP Integration**
- Integrate with Unified Orchestrator
- Update prefetch logic
- Update assignment logic
- Integration tests
- Measure completion rate

**Total: 5 days (1 week)**

---

## Verification Checklist

Before claiming Phase 4 complete:

- [ ] Build passes (0 errors)
- [ ] All tests pass (existing + new)
- [ ] Cost reduction measured (≥50% reduction)
- [ ] Quality maintained (critic pass ≥85%)
- [ ] WIP limits enforced (1 task/worker)
- [ ] Completion rate improved (≥60%)
- [ ] Documentation complete
- [ ] Telemetry captures routing + WIP data

---

**Phase 4 Status**: SPEC COMPLETE
**Next**: PLAN → THINK → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR
