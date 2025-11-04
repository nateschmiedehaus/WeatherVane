# Phase 4: Implementation Plan - Model Router + WIP Limits

**Date**: 2025-10-26
**Status**: PLAN
**Estimated Time**: 5 days
**Dependencies**: Phase 3 (StateGraph modularization) complete

---

## Overview

Implement two foundational systems in sequence:
1. **Days 1-3:** Model Router (complexity assessment + model selection)
2. **Days 4-5:** WIP Limits (work-in-progress enforcement)

**Why this order?**
- Router provides immediate cost savings (needed to fund further work)
- WIP limits depend on stable task execution (router must work first)
- Router is self-contained (fewer integration points)

---

## Day 1-2: ComplexityRouter Implementation

### Step 1: Create ComplexityRouter Class (4 hours)

**File:** `tools/wvo_mcp/src/orchestrator/complexity_router.ts`

**Interface:**
```typescript
export interface TaskComplexity {
  score: number;           // 0-10 scale
  factors: ComplexityFactor[];
  reasoning: string;
}

export interface ComplexityFactor {
  name: string;           // e.g., "dependencies"
  value: number;          // e.g., 3
  weight: number;         // e.g., 2
  contribution: number;   // value * weight = 6
}

export interface ModelSelection {
  model: string;
  provider: string;
  tier: 'simple' | 'moderate' | 'complex' | 'critical';
  estimatedCost: number;  // per 1K tokens
  rationale: string;
  capabilityTags: string[];
}

export class ComplexityRouter {
  constructor(
    private readonly config: ComplexityConfig = DEFAULT_CONFIG
  ) {}

  /**
   * Assess task complexity based on multiple factors
   */
  assessComplexity(task: TaskEnvelope): TaskComplexity {
    const factors: ComplexityFactor[] = [];

    // Factor 1: Dependencies (weight: 2)
    const depCount = task.dependencies?.length || 0;
    if (depCount > 0) {
      factors.push({
        name: 'dependencies',
        value: depCount,
        weight: 2,
        contribution: depCount * 2
      });
    }

    // Factor 2: Epic parent (weight: 2)
    if (task.epic_id || task.parent_id) {
      factors.push({
        name: 'epic_task',
        value: 1,
        weight: 2,
        contribution: 2
      });
    }

    // Factor 3: Description length (weight: 2)
    const descLength = task.description?.length || 0;
    if (descLength > 500) {
      factors.push({
        name: 'long_description',
        value: 1,
        weight: 2,
        contribution: 2
      });
    }

    // Factor 4: ML work (weight: 3)
    if (task.metadata?.requires_ml) {
      factors.push({
        name: 'ml_work',
        value: 1,
        weight: 3,
        contribution: 3
      });
    }

    // Factor 5: Security impact (weight: 3)
    if (task.metadata?.affects_security) {
      factors.push({
        name: 'security_impact',
        value: 1,
        weight: 3,
        contribution: 3
      });
    }

    // Factor 6: Public API (weight: 2)
    if (task.metadata?.public_api) {
      factors.push({
        name: 'public_api',
        value: 1,
        weight: 2,
        contribution: 2
      });
    }

    // Factor 7: Cross-domain (weight: 1)
    if (task.metadata?.cross_domain) {
      factors.push({
        name: 'cross_domain',
        value: 1,
        weight: 1,
        contribution: 1
      });
    }

    const totalScore = Math.min(10, factors.reduce((sum, f) => sum + f.contribution, 0));

    return {
      score: totalScore,
      factors,
      reasoning: this.explainComplexity(totalScore, factors)
    };
  }

  /**
   * Select appropriate model based on complexity
   */
  selectModel(complexity: TaskComplexity, override?: string): ModelSelection {
    // Honor override if provided
    if (override) {
      return this.buildSelectionForModel(override, 'override', complexity);
    }

    const { score } = complexity;

    // Tier 1: Simple (0-3) -> Haiku
    if (score <= 3) {
      return {
        model: 'claude-haiku-4.5',
        provider: 'anthropic',
        tier: 'simple',
        estimatedCost: 0.001,
        rationale: `Simple task (score ${score}) - Haiku sufficient`,
        capabilityTags: ['fast', 'cheap']
      };
    }

    // Tier 2: Moderate (4-6) -> Sonnet 3.5
    if (score <= 6) {
      return {
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        tier: 'moderate',
        estimatedCost: 0.015,
        rationale: `Moderate task (score ${score}) - Sonnet 3.5 needed`,
        capabilityTags: ['reasoning', 'balanced']
      };
    }

    // Tier 3: Complex (7-9) -> Sonnet 4.5
    if (score <= 9) {
      return {
        model: 'claude-sonnet-4.5',
        provider: 'anthropic',
        tier: 'complex',
        estimatedCost: 0.03,
        rationale: `Complex task (score ${score}) - Sonnet 4.5 required`,
        capabilityTags: ['reasoning_high', 'advanced']
      };
    }

    // Tier 4: Critical (10) -> Sonnet 4.5 + Extended Thinking
    return {
      model: 'claude-sonnet-4.5',
      provider: 'anthropic',
      tier: 'critical',
      estimatedCost: 0.05,
      rationale: `Critical task (score ${score}) - Sonnet 4.5 + extended thinking`,
      capabilityTags: ['reasoning_high', 'extended_thinking']
    };
  }

  private explainComplexity(score: number, factors: ComplexityFactor[]): string {
    if (factors.length === 0) {
      return 'Simple task with no complexity factors';
    }

    const topFactors = factors
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3)
      .map(f => f.name)
      .join(', ');

    return `Score ${score} from: ${topFactors}`;
  }
}
```

**Configuration:**
```typescript
export interface ComplexityConfig {
  factorWeights: Record<string, number>;
  modelTiers: ModelTier[];
}

const DEFAULT_CONFIG: ComplexityConfig = {
  factorWeights: {
    dependencies: 2,
    epic_task: 2,
    long_description: 2,
    ml_work: 3,
    security_impact: 3,
    public_api: 2,
    cross_domain: 1
  },
  modelTiers: [
    { maxScore: 3, model: 'claude-haiku-4.5', cost: 0.001 },
    { maxScore: 6, model: 'claude-3-5-sonnet-20241022', cost: 0.015 },
    { maxScore: 9, model: 'claude-sonnet-4.5', cost: 0.03 },
    { maxScore: 10, model: 'claude-sonnet-4.5', cost: 0.05 }
  ]
};
```

### Step 2: Unit Tests (4 hours)

**File:** `tools/wvo_mcp/src/orchestrator/complexity_router.test.ts`

**Test Categories:**
1. **Complexity Assessment** (10 tests)
   - Simple task (no factors)
   - Each factor individually
   - Multiple factors (additive)
   - Score clamping (max 10)
   - Edge cases (empty task, missing metadata)

2. **Model Selection** (8 tests)
   - Each tier (simple, moderate, complex, critical)
   - Tier boundaries (3→4, 6→7, 9→10)
   - Override handling
   - Rationale generation

3. **Integration** (5 tests)
   - Assess + select pipeline
   - Real task examples
   - Cost estimation accuracy

---

## Day 3: StateGraph Integration

### Step 3: Pass Model Selection to Runners (3 hours)

**Changes to StateGraph:**

**File:** `tools/wvo_mcp/src/orchestrator/state_graph.ts`

```typescript
export class StateGraph {
  constructor(
    private readonly deps: StateGraphDependencies,
    options: StateGraphOptions,
    private readonly complexityRouter: ComplexityRouter = new ComplexityRouter()
  ) {
    // ... existing constructor
  }

  async run(task: StateGraphTaskContext): Promise<StateGraphResult> {
    // ... existing setup ...

    // NEW: Assess complexity and select model
    const complexity = this.complexityRouter.assessComplexity(task);
    const modelSelection = this.complexityRouter.selectModel(complexity);

    logInfo('Task complexity assessed', {
      taskId: task.id,
      complexity: complexity.score,
      factors: complexity.factors.map(f => f.name),
      selectedModel: modelSelection.model
    });

    // ... existing state loop ...

    switch (current) {
      case 'plan': {
        const result = await runPlan(
          { task, attemptNumber, modelSelection, ... }, // Pass modelSelection
          { planner: this.deps.planner }
        );
        // ...
      }
      // ... other cases (all receive modelSelection)
    }
  }
}
```

**Changes to Runner Types:**

**File:** `tools/wvo_mcp/src/orchestrator/state_runners/runner_types.ts`

```typescript
export interface RunnerContext {
  task: TaskEnvelope;
  attemptNumber: number;
  modelSelection?: ModelSelection; // NEW: optional for backward compat
}
```

### Step 4: Update All Agents to Use Selected Model (2 hours)

**Example: PlannerAgent**

**File:** `tools/wvo_mcp/src/orchestrator/planner_agent.ts`

```typescript
export class PlannerAgent {
  async run(input: PlannerInput): Promise<PlannerAgentResult> {
    // Use provided model or fall back to router
    const model = input.modelSelection?.model || this.router.pickModel({
      capability: 'reasoning_high',
      source: 'fallback'
    }).model;

    const prompt = this.buildPlanPrompt(input.task);
    const result = await this.executor.exec(model, prompt);

    return {
      planHash: this.hashPlan(result.output),
      summary: result.output,
      model: input.modelSelection || { /* fallback info */ }
    };
  }
}
```

**Repeat for:** ThinkerAgent, ImplementerAgent, ReviewerAgent, SupervisorAgent

### Step 5: Integration Tests (3 hours)

**File:** `tools/wvo_mcp/src/orchestrator/__tests__/state_graph_routing.test.ts`

**Tests:**
```typescript
describe('StateGraph with Complexity Routing', () => {
  it('routes simple task to Haiku', async () => {
    const task = createSimpleTask();
    const result = await stateGraph.run(task);

    const planDecision = result.artifacts.routerDecisions.find(d => d.state === 'plan');
    expect(planDecision.selection.model).toBe('claude-haiku-4.5');
    expect(planDecision.selection.tier).toBe('simple');
  });

  it('routes complex task to Sonnet 4.5', async () => {
    const task = createComplexTask(); // many dependencies, security impact
    const result = await stateGraph.run(task);

    const planDecision = result.artifacts.routerDecisions.find(d => d.state === 'plan');
    expect(planDecision.selection.model).toBe('claude-sonnet-4.5');
    expect(planDecision.selection.tier).toBe('complex');
  });

  it('records all routing decisions', async () => {
    const result = await stateGraph.run(task);

    // Should have routing decision for each state
    expect(result.artifacts.routerDecisions).toHaveLength(8); // all 8 states
  });

  it('allows model override for critical tasks', async () => {
    const task = { ...simpleTask, metadata: { model_override: 'claude-sonnet-4.5' } };
    const result = await stateGraph.run(task);

    const planDecision = result.artifacts.routerDecisions[0];
    expect(planDecision.selection.model).toBe('claude-sonnet-4.5');
    expect(planDecision.selection.rationale).toContain('override');
  });
});
```

---

## Day 4: WIPController Implementation

### Step 6: Create WIPController Class (3 hours)

**File:** `tools/wvo_mcp/src/orchestrator/wip_controller.ts`

```typescript
export interface WIPConfig {
  perWorker: number;    // 1 task per worker
  global: number;       // 6 workers = 6 concurrent
  queueLimit: number;   // Max queue size
}

export interface WIPStatus {
  current: number;
  limit: number;
  available: number;
  queued: number;
  slots: Map<string, string>; // taskId -> workerId
}

export class WIPController {
  private readonly config: WIPConfig;
  private readonly activeSlots = new Map<string, string>(); // taskId -> workerId
  private readonly queuedTasks: TaskEnvelope[] = [];

  constructor(config: Partial<WIPConfig> = {}) {
    this.config = {
      perWorker: config.perWorker || 1,
      global: config.global || 6,
      queueLimit: config.queueLimit || 50
    };
  }

  /**
   * Check if we can accept another task
   */
  canAcceptTask(): boolean {
    return this.activeSlots.size < this.config.global;
  }

  /**
   * Reserve a WIP slot for a task
   * Returns false if WIP limit reached
   */
  reserveSlot(taskId: string, workerId?: string): boolean {
    // Prevent duplicate reservations
    if (this.activeSlots.has(taskId)) {
      return false;
    }

    // Check global WIP limit
    if (this.activeSlots.size >= this.config.global) {
      return false;
    }

    // Check per-worker WIP limit if workerId provided
    if (workerId) {
      const workerTasks = Array.from(this.activeSlots.values())
        .filter(wid => wid === workerId);
      if (workerTasks.length >= this.config.perWorker) {
        return false;
      }
    }

    // Reserve slot
    this.activeSlots.set(taskId, workerId || 'unknown');
    return true;
  }

  /**
   * Release a WIP slot when task completes
   */
  releaseSlot(taskId: string): void {
    this.activeSlots.delete(taskId);
  }

  /**
   * Add task to queue when WIP full
   */
  enqueue(task: TaskEnvelope): boolean {
    if (this.queuedTasks.length >= this.config.queueLimit) {
      return false; // Queue full
    }
    this.queuedTasks.push(task);
    return true;
  }

  /**
   * Get next queued task (FIFO)
   */
  dequeue(): TaskEnvelope | undefined {
    return this.queuedTasks.shift();
  }

  /**
   * Get current WIP status
   */
  getStatus(): WIPStatus {
    return {
      current: this.activeSlots.size,
      limit: this.config.global,
      available: this.config.global - this.activeSlots.size,
      queued: this.queuedTasks.length,
      slots: new Map(this.activeSlots)
    };
  }

  /**
   * Get all queued tasks
   */
  getQueuedTasks(): TaskEnvelope[] {
    return [...this.queuedTasks];
  }

  /**
   * Clear all slots (for testing)
   */
  reset(): void {
    this.activeSlots.clear();
    this.queuedTasks.length = 0;
  }
}
```

### Step 7: Unit Tests (2 hours)

**File:** `tools/wvo_mcp/src/orchestrator/wip_controller.test.ts`

**Tests:**
1. **Reservation** (8 tests)
   - Reserve slot when available
   - Block when WIP at limit
   - Prevent duplicate reservations
   - Per-worker limit enforcement
   - Release and re-reserve

2. **Queueing** (5 tests)
   - Enqueue when WIP full
   - Dequeue FIFO order
   - Queue limit enforcement
   - Queue persistence across reservations

3. **Status** (3 tests)
   - Accurate current/available counts
   - Slot mapping correct
   - Queue count accurate

---

## Day 5: Orchestrator Integration

### Step 8: Integrate WIP with Unified Orchestrator (4 hours)

**File:** `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`

**Changes:**

```typescript
export class UnifiedOrchestrator {
  private readonly wipController: WIPController;

  constructor(config: OrchestratorConfig) {
    // ... existing setup ...
    this.wipController = new WIPController({
      perWorker: 1,
      global: this.workers.length,
      queueLimit: 50
    });
  }

  /**
   * Prefetch tasks - MODIFIED to respect WIP
   */
  private async prefetchTasks(): Promise<void> {
    // NEW: Check WIP before prefetching
    const wipStatus = this.wipController.getStatus();
    if (wipStatus.available === 0) {
      logDebug('WIP limit reached, skipping prefetch', wipStatus);
      return;
    }

    // Only prefetch what we have capacity for
    const needed = wipStatus.available;
    const readyTasks = this.stateMachine.getReadyTasks();
    const tasksToAdd = readyTasks.slice(0, needed);

    logDebug('Prefetching tasks', {
      needed,
      available: readyTasks.length,
      adding: tasksToAdd.length
    });

    this.taskQueue.push(...tasksToAdd);
  }

  /**
   * Assign task to worker - MODIFIED to reserve WIP slot
   */
  private async assignNextTaskIfAvailable(agent: Agent): Promise<void> {
    const task = this.taskQueue.shift();
    if (!task) {
      logDebug('No tasks in queue', { agentId: agent.id });
      return;
    }

    // NEW: Reserve WIP slot
    const reserved = this.wipController.reserveSlot(task.id, agent.id);
    if (!reserved) {
      logWarning('WIP limit reached, requeueing task', {
        taskId: task.id,
        agentId: agent.id,
        wipStatus: this.wipController.getStatus()
      });
      // Put back at front of queue
      this.taskQueue.unshift(task);
      return;
    }

    logInfo('Task assigned', {
      taskId: task.id,
      agentId: agent.id,
      wipStatus: this.wipController.getStatus()
    });

    try {
      await agent.execute(task);
    } finally {
      // NEW: Always release slot
      this.wipController.releaseSlot(task.id);
      logDebug('WIP slot released', {
        taskId: task.id,
        wipStatus: this.wipController.getStatus()
      });

      // Trigger next prefetch
      await this.prefetchTasks();
    }
  }
}
```

### Step 9: Integration Tests (2 hours)

**File:** `tools/wvo_mcp/src/orchestrator/__tests__/unified_orchestrator_wip.test.ts`

**Tests:**
```typescript
describe('Unified Orchestrator with WIP Limits', () => {
  it('stops prefetching when WIP reached', async () => {
    const orchestrator = createOrchestrator({ workers: 2, wipLimit: 2 });

    // Add 5 ready tasks
    addReadyTasks(5);

    // Start orchestrator
    await orchestrator.start();

    // Should only prefetch 2 (WIP limit)
    expect(orchestrator.wipController.getStatus().current).toBe(2);
    expect(orchestrator.taskQueue.length).toBe(0);
  });

  it('releases slot on task completion', async () => {
    const orchestrator = createOrchestrator({ workers: 2, wipLimit: 2 });

    await orchestrator.start();
    expect(orchestrator.wipController.getStatus().current).toBe(2);

    // Complete 1 task
    await completeTask('T1');

    // WIP should drop to 1
    expect(orchestrator.wipController.getStatus().current).toBe(1);
  });

  it('prefetches new task after slot release', async () => {
    const orchestrator = createOrchestrator({ workers: 2, wipLimit: 2 });
    addReadyTasks(5);

    await orchestrator.start();
    await completeTask('T1');

    // Should prefetch 1 more task
    expect(orchestrator.wipController.getStatus().current).toBe(2);
  });

  it('blocks assignment when WIP at limit', async () => {
    const orchestrator = createOrchestrator({ workers: 2, wipLimit: 2 });
    addReadyTasks(3);

    await orchestrator.start();

    // 2 tasks assigned, 1 in queue
    expect(orchestrator.wipController.getStatus().current).toBe(2);
    expect(orchestrator.taskQueue.length).toBe(1);
  });
});
```

---

## Verification Steps

### After Day 3 (Model Router Complete)

**Run:**
```bash
npm run build && npm test
npm test complexity_router
npm test state_graph_routing
```

**Measure:**
```bash
# Check telemetry for model usage
grep "selectedModel" state/telemetry/operations.jsonl | tail -20

# Expected: Mix of haiku, sonnet-3.5, sonnet-4.5
```

### After Day 5 (WIP Limits Complete)

**Run:**
```bash
npm test wip_controller
npm test unified_orchestrator_wip
```

**Measure:**
```bash
# Check WIP status in logs
grep "WIP limit" state/telemetry/operations.jsonl | tail -20

# Expected: "WIP: X/6" logs, no exceeding limit
```

---

## Rollout Strategy

### Phase 4A: Model Router (Days 1-3)

**Feature Flag:** `WVO_MODEL_ROUTING_ENABLED=true`

**Rollout:**
1. Deploy with flag OFF (no behavior change)
2. Run 5 tasks with flag ON, monitor cost
3. If cost reduces ≥50%, enable permanently
4. If quality drops <80%, revert and tune thresholds

### Phase 4B: WIP Limits (Days 4-5)

**Feature Flag:** `WVO_WIP_LIMIT=6`

**Rollout:**
1. Deploy with flag OFF (unlimited WIP)
2. Set limit to 10 (loose), monitor for issues
3. Reduce to 6 (1 per worker), monitor completion rate
4. If completion rate improves ≥20%, keep at 6
5. If throughput drops <50%, increase to 8

---

## Success Criteria

**Phase 4 is complete when:**

- [ ] ComplexityRouter class implemented and tested
- [ ] WIPController class implemented and tested
- [ ] StateGraph integrated with router
- [ ] Unified Orchestrator integrated with WIP
- [ ] All tests pass (existing + new)
- [ ] Build passes (0 errors)
- [ ] Cost reduction measured (≥50%)
- [ ] Quality maintained (critic pass ≥85%)
- [ ] Completion rate improved (≥20%)
- [ ] Documentation updated
- [ ] Feature flags in place

---

## Estimated Effort

| Task | Hours | Confidence |
|------|-------|------------|
| ComplexityRouter implementation | 4 | High |
| ComplexityRouter tests | 4 | High |
| StateGraph integration | 3 | Medium |
| Agent updates | 2 | High |
| Integration tests (router) | 3 | Medium |
| WIPController implementation | 3 | High |
| WIPController tests | 2 | High |
| Orchestrator integration | 4 | Medium |
| Integration tests (WIP) | 2 | Medium |
| Testing & measurement | 3 | Low |

**Total:** 30 hours (~4 days with interruptions)

**Contingency:** +1 day for unforeseen issues

**Total with buffer:** 5 days

---

**Next Step:** THINK stage (adversarial questioning of this plan)
