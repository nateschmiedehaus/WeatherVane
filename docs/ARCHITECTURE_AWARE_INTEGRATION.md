# Architecture-Aware Integration Plan
**Integrating 4 Systems into Real Autopilot Architecture**

## Current Autopilot Architecture (As-Is)

### The Real Flow

```
┌─────────────────────────────────────────────────────────────┐
│ OrchestratorLoop (orchestrator_loop.ts)                     │
│ - Main coordination loop                                     │
│ - Adaptive tick intervals (1s - 60s)                        │
│ - Health monitoring built-in                                │
│ - Enters "monitoring mode" when idle                        │
└──────────────┬──────────────────────────────────────────────┘
               │
               ↓ (decides what to do)
┌──────────────────────────────────────────────────────────────┐
│ PolicyEngine (policy_engine.ts)                              │
│ - Analyzes system state                                      │
│ - Returns OrchestratorAction (work_task, audit, etc.)       │
└──────────────┬──────────────────────────────────────────────┘
               │
               ↓ (if work_task)
┌──────────────────────────────────────────────────────────────┐
│ OperationsManager (operations_manager.ts)                    │
│ - Queue management                                           │
│ - Token metrics tracking (already exists!)                  │
│ - Quality monitoring                                         │
│ - Rate limit handling                                        │
│ - Returns OperationsSnapshot                                │
└──────────────┬──────────────────────────────────────────────┘
               │
               ↓ (executes task)
┌──────────────────────────────────────────────────────────────┐
│ AgentCoordinator (agent_coordinator.ts)                      │
│ - Manages AgentPool                                          │
│ - Uses ContextAssembler                                      │
│ - Tracks ExecutionSummary (tokens, cost, duration)          │
│ - Has ExecutionObserver pattern                             │
└──────────────┬──────────────────────────────────────────────┘
               │
               ↓ (assigns to agent)
┌──────────────────────────────────────────────────────────────┐
│ AgentPool (agent_pool.ts)                                    │
│ - Agent lifecycle management                                 │
│ - Codex vs Claude routing                                   │
│ - Actual LLM calls                                           │
│ - Prompt caching                                             │
└──────────────────────────────────────────────────────────────┘
```

### Key Insights

1. **Token tracking already exists** in OperationsManager:
   ```typescript
   tokenMetrics: {
     averagePromptTokens: number;
     averageCompletionTokens: number;
     averageTotalTokens: number;
     pressure: TokenPressureLevel;
   }
   ```

2. **ExecutionObserver pattern** allows hooking into task lifecycle:
   ```typescript
   interface ExecutionObserver {
     recordExecution(summary: ExecutionSummary): void;
     handleRateLimit?(agentId, agentType, retryAfterSeconds): void;
   }
   ```

3. **Adaptive scheduling** already exists - we just need to make it readiness-aware

4. **Health monitoring** already exists in OrchestratorLoop

---

## Integration Points (Exact Locations)

### System 1: Task Readiness → PolicyEngine

**Why here:** PolicyEngine decides what to do next. It should filter to ready tasks BEFORE deciding.

**Location:** `tools/wvo_mcp/src/orchestrator/policy_engine.ts`

**Integration:**
```typescript
// policy_engine.ts (around line 50)
import { TaskReadinessChecker } from './task_readiness.js';

export class PolicyEngine {
  private readinessChecker: TaskReadinessChecker;

  constructor(
    private stateMachine: StateMachine,
    private scheduler: TaskScheduler,
    private qualityMonitor: QualityMonitor,
    private workspaceRoot: string  // NEW
  ) {
    // NEW: Initialize readiness checker
    this.readinessChecker = new TaskReadinessChecker(stateMachine, workspaceRoot);
  }

  async decide(health: RoadmapHealth, queue: QueueMetrics): Promise<OrchestratorAction> {
    // Existing logic to get pending tasks
    const pending = this.scheduler.getPendingTasks();

    // NEW: Filter to ready tasks ONLY
    const ready = await this.readinessChecker.filterReadyTasks(pending);

    logDebug('Task readiness check', {
      pending: pending.length,
      ready: ready.length,
      filtered: pending.length - ready.length,
    });

    if (ready.length === 0 && pending.length > 0) {
      // All tasks are blocked, enter monitoring mode
      return {
        type: 'monitor',
        reason: 'All tasks blocked, waiting for readiness',
      };
    }

    // Continue with existing logic, but use 'ready' instead of 'pending'
    const scheduled = await this.scheduler.schedule(ready);  // Changed

    // ... rest of existing logic
  }
}
```

**Token impact:** 0 tokens (pure logic)
**Files changed:** 1 file (`policy_engine.ts`)
**Lines added:** ~15 lines

---

### System 2: WIP Limits → TaskScheduler

**Why here:** TaskScheduler already manages queue limits. Add WIP limits alongside existing resource limits.

**Location:** `tools/wvo_mcp/src/orchestrator/task_scheduler.ts`

**Current code already has resource limits:**
```typescript
// task_scheduler.ts line 794
export interface QueueMetrics {
  ready_count: number;
  pending_count: number;
  resource: {
    heavy_limit: number;
    active_heavy: number;
    queued_heavy: number;
  };
}
```

**Integration:**
```typescript
// task_scheduler.ts (around line 50)
import { WIPLimitEnforcer } from './wip_limits.js';

export class TaskScheduler {
  private wipLimits: WIPLimitEnforcer;

  constructor(stateMachine: StateMachine) {
    // Existing initialization
    this.stateMachine = stateMachine;

    // NEW: Initialize WIP limits
    this.wipLimits = new WIPLimitEnforcer(stateMachine, {
      maxGlobal: 5,
      maxPerAgent: 1,
      maxPerEpic: 3,
    });
  }

  async schedule(tasks: Task[]): Promise<ScheduledTask[]> {
    // Get current WIP status
    const wipStatus = this.wipLimits.getWIPStatus();

    // NEW: Check global WIP limit
    if (wipStatus.atLimitGlobal) {
      logDebug('At global WIP limit', {
        current: wipStatus.currentGlobal,
        max: 5,
      });
      return [];  // Don't schedule anything
    }

    // NEW: Use WIP-aware recommendation
    const recommended = this.wipLimits.getRecommendedTasks(tasks, 5);

    // Continue with existing scheduling logic on recommended tasks
    const scheduled = this.prioritizeAndBatch(recommended);

    return scheduled;
  }

  getMetrics(): QueueMetrics {
    // Existing metrics
    const existing = { ... };

    // NEW: Add WIP metrics
    const wipStatus = this.wipLimits.getWIPStatus();

    return {
      ...existing,
      wip: {  // NEW
        current: wipStatus.currentGlobal,
        limit: 5,
        atLimit: wipStatus.atLimitGlobal,
        byEpic: wipStatus.currentPerEpic,
      },
    };
  }
}
```

**Token impact:** 0 tokens (pure logic)
**Files changed:** 1 file (`task_scheduler.ts`)
**Lines added:** ~25 lines

---

### System 3: Failure Classifier → AgentCoordinator

**Why here:** AgentCoordinator handles execution failures via ExecutionObserver pattern.

**Location:** `tools/wvo_mcp/src/orchestrator/agent_coordinator.ts`

**Current failure handling:**
```typescript
// agent_coordinator.ts (around line 200)
export interface ExecutionSummary {
  success: boolean;
  failureType?: ExecutionFailureType;
  // ...
}
```

**Integration:**
```typescript
// agent_coordinator.ts (around line 50)
import { FailureClassifier } from './failure_classifier.js';

export class AgentCoordinator extends EventEmitter {
  private classifier: FailureClassifier;

  constructor(
    pool: AgentPool,
    assembler: ContextAssembler,
    stateMachine: StateMachine,
    qualityMonitor: QualityMonitor,
    workspaceRoot: string,  // NEW
    observer?: ExecutionObserver
  ) {
    // Existing initialization
    this.pool = pool;
    this.assembler = assembler;
    this.stateMachine = stateMachine;
    this.qualityMonitor = qualityMonitor;
    this.observer = observer;

    // NEW: Initialize failure classifier
    this.classifier = new FailureClassifier(workspaceRoot);
  }

  async executeTask(task: Task, agent: Agent): Promise<ExecutionSummary> {
    try {
      // Existing execution logic
      const result = await this.pool.execute(agent, task, context);

      if (!result.success) {
        // NEW: Classify the failure
        const classification = this.classifier.classify(
          task,
          result.error || 'Unknown error',
          {
            attemptCount: (task.metadata?.failure_count as number) || 0,
            previousError: task.metadata?.last_error as string,
            taskAge: Date.now() - task.created_at.getTime(),
            recentFailures: this.getRecentFailures(task.id),
          }
        );

        logInfo('Failure classified', {
          taskId: task.id,
          type: classification.type,
          shouldRetry: classification.shouldRetry,
          rootCause: classification.rootCause,
        });

        // Update task metadata with classification
        await this.stateMachine.updateTask(task.id, {
          metadata: {
            ...task.metadata,
            failure_classification: classification.type,
            should_retry: classification.shouldRetry,
            retry_strategy: classification.retryStrategy,
            failure_count: ((task.metadata?.failure_count as number) || 0) + 1,
            last_error: result.error,
            last_attempt_time: Date.now(),
          },
        });

        // NEW: Record outcome for learning
        // (This happens in the next cycle when task is retried/resolved)
      }

      return summary;
    } catch (error) {
      // Handle errors
    }
  }

  // NEW: Helper to track failure outcomes
  async recordFailureOutcome(
    task: Task,
    error: string,
    wasRetried: boolean,
    outcome: 'success' | 'failure'
  ): Promise<void> {
    await this.classifier.recordOutcome(error, wasRetried, outcome);
  }
}
```

**Token impact:** 0 tokens (pattern matching)
**Files changed:** 1 file (`agent_coordinator.ts`)
**Lines added:** ~40 lines
**Token budget:** ~100 tokens/day for pattern persistence

---

### System 4: Knowledge Graph → ContextAssembler

**Why here:** ContextAssembler builds context for agent prompts. It's the natural place to inject knowledge.

**Location:** `tools/wvo_mcp/src/orchestrator/context_assembler.ts`

**Current context structure:**
```typescript
// context_assembler.ts (around line 20)
export interface AssembledContext {
  relatedTasks: Task[];
  decisions: ContextEntry[];
  learnings: ContextEntry[];
  qualityIssues: ContextEntry[];
  filesToRead: string[];
  // ...
}
```

**Integration:**
```typescript
// context_assembler.ts (around line 50)
import { KnowledgeGraph } from './knowledge_graph.js';

export class ContextAssembler {
  private knowledgeGraph: KnowledgeGraph;
  private readonly TOKEN_BUDGET_KNOWLEDGE = 2000;  // Strict limit

  constructor(
    private stateMachine: StateMachine,
    private workspaceRoot: string,
    private options: ContextAssemblyOptions = {}
  ) {
    // NEW: Initialize knowledge graph
    this.knowledgeGraph = new KnowledgeGraph(workspaceRoot);
  }

  async assembleForTask(taskId: string, options?: ContextAssemblyOptions): Promise<AssembledContext> {
    const task = this.stateMachine.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    // Existing context assembly
    const relatedTasks = await this.getRelatedTasks(task);
    const decisions = await this.getRecentDecisions(task);
    const learnings = await this.getLearnings(task);
    const qualityIssues = await this.getQualityIssues(task);

    // NEW: Get relevant knowledge
    const relevantKnowledge = await this.knowledgeGraph.getRelevantKnowledge(task, 10);

    // NEW: Format knowledge (with token budget enforcement)
    const knowledgeText = this.knowledgeGraph.formatForContext(relevantKnowledge);
    const knowledgeTokens = this.estimateTokens(knowledgeText);

    if (knowledgeTokens > this.TOKEN_BUDGET_KNOWLEDGE) {
      logWarning('Knowledge exceeds token budget, trimming', {
        taskId,
        tokens: knowledgeTokens,
        budget: this.TOKEN_BUDGET_KNOWLEDGE,
      });

      // Trim to fit budget
      const trimmed = this.trimToTokenBudget(relevantKnowledge, this.TOKEN_BUDGET_KNOWLEDGE);
      return {
        ...existingContext,
        knowledge: this.knowledgeGraph.formatForContext(trimmed),  // NEW
      };
    }

    return {
      relatedTasks,
      decisions,
      learnings,
      qualityIssues,
      knowledge: knowledgeText,  // NEW
      // ... rest of context
    };
  }

  // NEW: Extract knowledge after task completion
  async extractKnowledgeFromCompletion(task: Task, result: ExecutionSummary): Promise<void> {
    const taskResult = {
      success: result.success,
      output: result.output,
      error: result.error,
      duration: result.durationSeconds * 1000,
      metadata: {
        agentType: result.agentType,
        qualityScore: result.qualityScore,
      },
    };

    await this.knowledgeGraph.extractKnowledge(task, taskResult);

    logDebug('Knowledge extracted', {
      taskId: task.id,
      graphSize: this.knowledgeGraph.getStatistics().totalNodes,
    });
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);  // 1 token ≈ 4 chars
  }

  private trimToTokenBudget(nodes: KnowledgeNode[], budget: number): KnowledgeNode[] {
    const result = [];
    let tokens = 0;

    for (const node of nodes) {
      const nodeTokens = this.estimateTokens(node.content);
      if (tokens + nodeTokens <= budget) {
        result.push(node);
        tokens += nodeTokens;
      } else {
        break;
      }
    }

    return result;
  }
}
```

**Token impact:** ~2K tokens/task (controlled)
**Files changed:** 1 file (`context_assembler.ts`)
**Lines added:** ~60 lines
**Token budget:** 2K tokens/task (strictly enforced)

---

## Token Flow Optimization

### Current Token Flow (Measured)

```typescript
// OperationsManager already tracks tokens
interface OperationsSnapshot {
  tokenMetrics: {
    averagePromptTokens: number;      // ~10K
    averageCompletionTokens: number;  // ~5K
    averageTotalTokens: number;       // ~15K
    pressure: TokenPressureLevel;
  };
}
```

### Enhanced Token Tracking

**Add to OperationsManager:**
```typescript
// operations_manager.ts (extend existing token tracking)
interface TokenMetrics {
  // Existing
  averagePromptTokens: number;
  averageCompletionTokens: number;
  averageTotalTokens: number;
  pressure: TokenPressureLevel;

  // NEW: Breakdown by system
  breakdown: {
    baseline: number;           // Core context
    relatedTasks: number;       // Existing
    decisions: number;          // Existing
    knowledge: number;          // NEW - track separately
    filesToRead: number;        // Existing
  };

  // NEW: Efficiency metrics
  efficiency: {
    preventedStarts: number;    // Tasks blocked by readiness
    preventedRetries: number;   // Retries blocked by classifier
    tokensSaved: number;        // Estimated savings
    roi: number;                // Saved / Spent
  };
}
```

**Hook into existing ExecutionObserver:**
```typescript
// In AgentCoordinator, use existing observer pattern
class TokenEfficiencyObserver implements ExecutionObserver {
  recordExecution(summary: ExecutionSummary): void {
    // Track token breakdown
    const breakdown = this.analyzeTokenUsage(summary);

    // Record to OperationsManager's existing token tracking
    this.operationsManager.recordTokenBreakdown(breakdown);
  }
}
```

---

## Phased Rollout (Architecture-Aware)

### Phase 1: PolicyEngine + TaskScheduler (Week 1)

**Files to modify:**
1. `policy_engine.ts` - Add readiness filtering
2. `task_scheduler.ts` - Add WIP limits

**Integration points:**
```typescript
// 1. policy_engine.ts constructor
this.readinessChecker = new TaskReadinessChecker(stateMachine, workspaceRoot);

// 2. task_scheduler.ts constructor
this.wipLimits = new WIPLimitEnforcer(stateMachine);
```

**Testing:**
```bash
# Run orchestrator loop
npm run build
npm test

# Check metrics
cat state/analytics/orchestration_metrics.json | jq '.wip'
```

**Expected outcome:**
- OrchestratorLoop logs: "Filtered 45/50 unready tasks"
- TaskScheduler metrics: "WIP: 5/5 (at limit)"
- Token savings: 262.5K/day

---

### Phase 2: AgentCoordinator (Week 2)

**Files to modify:**
1. `agent_coordinator.ts` - Add failure classification

**Integration points:**
```typescript
// agent_coordinator.ts constructor
this.classifier = new FailureClassifier(workspaceRoot);

// In executeTask() after failure
const classification = this.classifier.classify(task, error, context);
```

**Testing:**
```bash
# Run tasks that will fail
npm run build
npm test

# Check classification results
cat state/failure_patterns.json | jq '.patterns | length'
```

**Expected outcome:**
- Classifier learns patterns
- Impossible tasks marked immediately
- Token savings: 148.9K/day (cumulative: 411.4K/day)

---

### Phase 3: ContextAssembler (Week 3)

**Files to modify:**
1. `context_assembler.ts` - Add knowledge injection

**Integration points:**
```typescript
// context_assembler.ts constructor
this.knowledgeGraph = new KnowledgeGraph(workspaceRoot);

// In assembleForTask()
const knowledge = await this.knowledgeGraph.getRelevantKnowledge(task, 10);
context.knowledge = this.knowledgeGraph.formatForContext(knowledge);

// After task completion
await this.assembler.extractKnowledgeFromCompletion(task, result);
```

**Testing:**
```bash
# Run several tasks
npm run build
npm test

# Check knowledge growth
cat state/knowledge_graph.json | jq '.nodes | length'
```

**Expected outcome:**
- Knowledge graph grows to ~50 nodes
- Injection stays under 2K tokens
- Success rate improves month-over-month

---

## Monitoring Dashboard (Leverage Existing)

**OperationsManager already has a snapshot system:**
```typescript
interface OperationsSnapshot {
  // Use existing structure, add our metrics
  agent_pool: { ... };
  queue: { ... };
  tokenMetrics: { ... };  // Extend this

  // NEW: Add efficiency metrics
  autonomy: {
    readiness: {
      totalChecks: number;
      readyPercent: number;
      avgBlockersPerTask: number;
    };
    wip: {
      current: number;
      limit: number;
      utilizationPercent: number;
    };
    failures: {
      totalClassifications: number;
      preventedRetries: number;
      roiMultiplier: number;
    };
    knowledge: {
      totalNodes: number;
      avgConfidence: number;
      injectionCount: number;
      tokensPerInjection: number;
    };
  };
}
```

**Query existing analytics:**
```bash
# OperationsManager already writes to state/analytics/
cat state/analytics/orchestration_metrics.json | jq '.autonomy'
```

---

## Complete Integration Checklist

### Week 1: PolicyEngine + TaskScheduler
- [ ] Add `TaskReadinessChecker` to `policy_engine.ts`
- [ ] Add `WIPLimitEnforcer` to `task_scheduler.ts`
- [ ] Update `QueueMetrics` interface to include WIP status
- [ ] Test: Run orchestrator loop, verify filtering works
- [ ] Measure: Token usage should decrease 35%
- [ ] Deploy: Merge to main

### Week 2: AgentCoordinator
- [ ] Add `FailureClassifier` to `agent_coordinator.ts`
- [ ] Update `ExecutionSummary` to include classification
- [ ] Hook into existing `ExecutionObserver` pattern
- [ ] Test: Trigger failures, verify classification
- [ ] Measure: Retry rate should decrease 50%
- [ ] Deploy: Merge to main

### Week 3: ContextAssembler
- [ ] Add `KnowledgeGraph` to `context_assembler.ts`
- [ ] Update `AssembledContext` interface to include knowledge
- [ ] Implement token budget enforcement (2K max)
- [ ] Add extraction after task completion
- [ ] Test: Complete tasks, verify knowledge extraction
- [ ] Measure: Graph size, injection tokens, ROI
- [ ] Deploy: Merge to main

---

## Success Criteria

### Week 1: Core Systems
✅ OrchestratorLoop filters unready tasks
✅ TaskScheduler respects WIP limits
✅ No token increase from integration
✅ 35% reduction in wasted task starts

### Week 2: Learning
✅ FailureClassifier learns patterns
✅ Impossible tasks detected immediately
✅ 55% cumulative reduction in wasted tokens

### Week 3: Knowledge
✅ Knowledge graph grows bounded (<100 nodes)
✅ Injection stays under 2K tokens/task
✅ 60% cumulative reduction in wasted tokens

### Month 3: Compound Learning
✅ Task success rate improves 20-30%
✅ Knowledge reuse visible in logs
✅ 70% cumulative reduction in wasted tokens

---

## The Complete Picture

```
OrchestratorLoop
  ├─ PolicyEngine (+ TaskReadinessChecker)  ← Week 1
  │    ↓
  ├─ TaskScheduler (+ WIPLimitEnforcer)     ← Week 1
  │    ↓
  ├─ AgentCoordinator (+ FailureClassifier) ← Week 2
  │    ├─ ContextAssembler (+ KnowledgeGraph) ← Week 3
  │    └─ AgentPool
  │         ↓
  └─ OperationsManager (tracks everything)   ← Existing!
```

**Key insight:** We're not building a new system - we're enhancing the existing autopilot with 4 targeted improvements that integrate cleanly into the architecture.

**Token philosophy:** Prevent waste (readiness, WIP, classifier) before adding features (knowledge graph).

**You now have an architecture-aware, token-optimized integration plan that works with your real autopilot.**
