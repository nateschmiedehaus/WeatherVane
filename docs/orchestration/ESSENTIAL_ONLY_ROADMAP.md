# Essential-Only Roadmap: 7 Core Improvements
## Minimum Viable Elite Team Architecture

**Philosophy:** What's the absolute minimum needed to achieve world-class performance? This document distills 20 improvements down to the **7 essential ones** that deliver 80%+ of the value.

---

## Critical Analysis: What's Actually Essential?

### The Core Goals
1. **5x Throughput** (2 → 10 tasks/day)
2. **58% Cost Reduction** ($12 → $5/day)
3. **90% Quality** (first-pass critic success)
4. **Zero Blockers** (<8h resolution)

### The Question
**Can we achieve these goals without all 20 improvements?**

**Answer:** YES. Only **7 improvements are truly essential.**

---

## THE ESSENTIAL 7

These form a complete, minimal system. Remove any one and the goals become unattainable.

### 1. **Intelligent Model Router** 🎯 FOUNDATION
**Priority:** 1 (Do this FIRST)
**Impact:** 10/10 | **Cost:** Medium | **Time:** 3 days

**Why Essential:**
- **Enables budget for everything else**
- Without this, we can't afford Sonnet 4.5 for complex work
- 60% cost reduction unlocks implementation budget

**What it does:**
```typescript
Task complexity 0-3 → Haiku ($0.001/1K)     // 70% of tasks
Task complexity 4-6 → Sonnet 3.5 ($0.015/1K) // 20% of tasks
Task complexity 7-9 → Sonnet 4.5 ($0.03/1K)  // 9% of tasks
Task complexity 10  → Sonnet 4.5+R ($0.05/1K) // 1% of tasks
```

**Without it:** Burn $12/day → can't afford other improvements → stuck

**Implementation:**
```typescript
// In unified_orchestrator.ts
assessComplexity(task: Task): TaskComplexity {
  // Current: returns 'simple' | 'moderate' | 'complex'
  // Enhanced: returns 0-10 score

  const score =
    (task.dependencies?.length || 0) * 2 +
    (task.epic_id ? 2 : 0) +
    (task.description?.length > 500 ? 2 : 0) +
    (task.metadata?.requires_ml ? 3 : 0) +
    (task.metadata?.affects_security ? 3 : 0);

  return Math.min(10, score);
}

selectModel(complexity: number): string {
  if (complexity <= 3) return 'claude-haiku-4.5';
  if (complexity <= 6) return 'claude-3-5-sonnet-20241022';
  if (complexity <= 9) return 'claude-sonnet-4.5';
  return 'claude-sonnet-4.5'; // + reasoning effort high
}
```

---

### 2. **WIP Limits** 🎯 FOCUS
**Priority:** 2 (Implement with Router)
**Impact:** 9/10 | **Cost:** Low | **Time:** 1 day

**Why Essential:**
- **Prevents context switching death spiral**
- Without limits, agents thrash between tasks → nothing completes
- Enables completion over starting

**What it does:**
- Agent limit: 1 task max (currently unlimited)
- Squad limit: 3-5 tasks per domain
- Enforced in `prefetchTasks()`: skip if WIP exceeded

**Without it:** Start 10 tasks, complete 0 → velocity illusion

**Implementation:**
```typescript
// In unified_orchestrator.ts
private async prefetchTasks(): Promise<void> {
  // Check WIP limits
  const inProgressCount = this.stateMachine.getTasks({ status: ['in_progress'] }).length;
  const wipLimit = this.workers.length; // 1 per worker

  if (inProgressCount >= wipLimit) {
    logDebug('WIP limit reached', { inProgress: inProgressCount, limit: wipLimit });
    return; // Don't prefetch more
  }

  const needed = wipLimit - inProgressCount;
  const readyTasks = this.stateMachine.getReadyTasks();
  const tasksToAdd = readyTasks.slice(0, needed);

  this.taskQueue.push(...tasksToAdd);
}
```

**Kanban Board Analogy:**
```
┌─────────────┬──────────────┬──────────────┐
│   TODO      │ IN PROGRESS  │     DONE     │
│             │  (WIP = 6)   │              │
│  ∞ tasks    │  ⬛⬛⬛⬛⬛⬛  │  Completed   │
│             │  LIMIT! ⛔    │              │
└─────────────┴──────────────┴──────────────┘
```

---

### 3. **Task Decomposition Engine** 🎯 PARALLELISM ENABLER
**Priority:** 3 (After Router+WIP)
**Impact:** 10/10 | **Cost:** High | **Time:** 5 days

**Why Essential:**
- **Unlocks parallelism** - epics are serial, subtasks are parallel
- Without this, 1 worker per epic → max 6 parallel tasks
- With this, 3-5 workers per epic → 20+ parallel tasks

**What it does:**
Converts this (serial):
```yaml
- E12: Weather Model Production Validation
  - Takes 1 worker, 10 days
```

Into this (parallel):
```yaml
- E12: Weather Model Production Validation
  ├─ T12.1: Data generation [worker-1] ─┐
  ├─ T12.2: Model training [worker-2]   ├─ 3 days
  └─ T12.3: Validation    [worker-3] ───┘
```

**Without it:** Stuck at 1-2 tasks/day → 5x throughput impossible

**Implementation:**
```typescript
// New file: task_decomposer.ts
export class TaskDecomposer {
  async decomposeEpic(epic: Task): Promise<Task[]> {
    // Use Sonnet 4.5 to analyze epic and create subtasks
    const prompt = `
      Epic: ${epic.title}
      Description: ${epic.description}

      Decompose into 3-7 parallelizable subtasks:
      - Each subtask should be independently executable
      - Identify dependencies (which must run first)
      - Estimate complexity (1-10)

      Output JSON array of subtasks.
    `;

    const result = await this.executor.exec('claude-sonnet-4.5', prompt);
    const subtasks = JSON.parse(result.output);

    // Create tasks in database
    for (const subtask of subtasks) {
      this.stateMachine.createTask({
        id: `${epic.id}.${subtask.index}`,
        title: subtask.title,
        parent_id: epic.id,
        type: 'task',
        status: 'pending',
        estimated_complexity: subtask.complexity
      });
    }

    return subtasks;
  }
}
```

**Cost:** ~$0.10 per epic decomposition (one Sonnet 4.5 call)
**Savings:** 5x throughput = $5/day cost reduction via velocity

---

### 4. **Parallel Task Execution** 🎯 THROUGHPUT MULTIPLIER
**Priority:** 4 (After Decomposition)
**Impact:** 10/10 | **Cost:** Medium | **Time:** 3 days

**Why Essential:**
- **Delivers the actual 5x throughput**
- Without this, decomposition is wasted
- This is the payoff for all previous work

**What it does:**
Currently:
```
worker-1: [====Task A====] idle [====Task B====]
worker-2: idle [====Task C====] idle
worker-3: idle idle [====Task D====]

Throughput: 1-2 tasks/day
```

With parallel:
```
worker-1: [====Task A====] [====Task E====]
worker-2: [====Task B====] [====Task F====]
worker-3: [====Task C====] [====Task G====]
worker-4: [====Task D====] [====Task H====]

Throughput: 6-10 tasks/day
```

**Without it:** All previous work is wasted

**Implementation:**
Already exists! Just need to:
1. Decompose epics into subtasks
2. `prefetchTasks()` grabs multiple independent tasks
3. `assignNextTaskIfAvailable()` assigns to each idle worker
4. DAG analysis in `getReadyTasks()` ensures dependencies respected

**No code changes needed** - just activate decomposition!

---

### 5. **Pre-Flight Quality Checks** 🎯 WASTE PREVENTION
**Priority:** 5 (Parallel with #3-4)
**Impact:** 10/10 | **Cost:** Medium | **Time:** 3 days

**Why Essential:**
- **Prevents expensive rework**
- Catch issues BEFORE implementation, not after
- 70% reduction in failed post-completion critics

**What it does:**
Current flow:
```
1. Start task
2. Implement (2 hours)
3. Run critics (5 min)
4. Critics FAIL (tests, types, security)
5. Rework (1 hour)
6. Re-run critics
7. Done

Total: 3+ hours, $1.20 in tokens
```

With pre-flight:
```
1. Start task
2. Pre-flight checks (30 sec - linting, types, security scan)
3. PASS → Implement (2 hours)
4. Run critics (5 min)
5. PASS → Done

Total: 2 hours, $0.50 in tokens
```

**Without it:** Waste 1+ hour per task on rework

**Implementation:**
```typescript
// In unified_orchestrator.ts
async executeTask(task: Task): Promise<ExecutionResult> {
  // Run pre-flight checks BEFORE implementation
  const preflightResult = await this.runPreflightChecks(task);

  if (!preflightResult.passed) {
    logWarning('Pre-flight checks failed', {
      taskId: task.id,
      failures: preflightResult.failures
    });

    // Block task execution
    await this.roadmapTracker.updateTaskStatus(task.id, 'blocked', {
      reason: 'Pre-flight checks failed',
      failures: preflightResult.failures
    });

    return {
      success: false,
      error: 'Pre-flight checks failed',
      duration: 0
    };
  }

  // Continue with implementation...
}

async runPreflightChecks(task: Task): Promise<PreflightResult> {
  const checks = [];

  // Fast checks only (<30 seconds total)
  checks.push(this.checkLinting());
  checks.push(this.checkTypes());
  checks.push(this.checkSecurityBaseline());

  const results = await Promise.all(checks);
  const failures = results.filter(r => !r.passed);

  return {
    passed: failures.length === 0,
    failures
  };
}
```

**Cost:** ~$0.005 per task (fast critics only)
**Savings:** Prevent $0.50+ rework per task

---

### 6. **Peer Review Protocol** 🎯 QUALITY ASSURANCE
**Priority:** 6 (After Pre-Flight)
**Impact:** 7/10 | **Cost:** Medium | **Time:** 2 days

**Why Essential:**
- **Final quality gate before merge**
- Catches logic bugs, not just syntax
- Knowledge sharing between agents

**What it does:**
```
Task completion flow:

1. Worker-1 completes Task A
2. Task A → status: 'needs_review'
3. Worker-2 (idle) picks up review
4. Worker-2 checks:
   - Logic correctness
   - Test coverage
   - Documentation
   - Critic alignment
5. Approve → status: 'done' OR
   Request changes → status: 'needs_improvement'
```

**Without it:** Logic bugs slip through to production

**Implementation:**
```typescript
async executeTask(task: Task): Promise<ExecutionResult> {
  // ... existing implementation ...

  if (result.success && this.requiresReview(task)) {
    // Mark for review instead of done
    await this.roadmapTracker.updateTaskStatus(task.id, 'needs_review', {
      implementedBy: agent.id,
      output: result.output
    });

    // Assign to different worker for review
    await this.assignReviewer(task, agent.id);
  }
}

private requiresReview(task: Task): boolean {
  // Review required for:
  return task.estimated_complexity >= 5 || // Complex tasks
         task.metadata?.affects_security ||  // Security-sensitive
         task.metadata?.public_api;          // Public API changes
}
```

**Cost:** 5-10 min per review, Haiku model (~$0.02)
**Savings:** 90% critic pass rate (vs 60% without review)

---

### 7. **Blocker Escalation SLA** 🎯 FLOW GUARANTEE
**Priority:** 7 (Parallel with #5-6)
**Impact:** 9/10 | **Cost:** Low | **Time:** 1 day

**Why Essential:**
- **Prevents silent work stoppage**
- Currently blockers sit indefinitely
- Guarantees <8h resolution

**What it does:**
```
Task blocked:
  ↓
Wait 4 hours
  ↓
Still blocked? → Escalate to Atlas (create high-priority follow-up)
  ↓
Wait 20 hours (24h total)
  ↓
Still blocked? → Escalate to Director Dana (critical incident)
```

**Without it:** 25% of tasks stuck in blocked state

**Implementation:**
```typescript
// New cron job: scripts/blocker_escalation.ts
export async function checkBlockers(stateMachine: StateMachine): Promise<void> {
  const blocked = stateMachine.getTasks({ status: ['blocked'] });
  const now = Date.now();

  for (const task of blocked) {
    const blockedDuration = now - (task.updated_at || task.created_at);
    const hours = blockedDuration / (1000 * 60 * 60);

    if (hours > 24) {
      // Critical escalation to Director Dana
      stateMachine.createTask({
        id: `ESCALATION-${task.id}`,
        title: `[CRITICAL] Unblock ${task.id}`,
        description: `Task ${task.id} blocked for 24+ hours`,
        type: 'task',
        status: 'pending',
        assigned_to: 'director_dana',
        metadata: { escalation: 'critical', blocked_task: task.id }
      });
    } else if (hours > 4) {
      // Standard escalation to Atlas
      stateMachine.createTask({
        id: `BLOCKER-${task.id}`,
        title: `Unblock ${task.id}`,
        description: `Task ${task.id} blocked for 4+ hours`,
        type: 'task',
        status: 'pending',
        assigned_to: 'atlas',
        metadata: { escalation: 'standard', blocked_task: task.id }
      });
    }
  }
}

// Run hourly via cron
setInterval(() => checkBlockers(stateMachine), 60 * 60 * 1000);
```

**Cost:** No model calls, pure database queries
**Savings:** Prevent 5+ hours of idle time per blocker

---

## WHAT WE'RE SCRAPPING (13 Improvements)

### Can Be Deleted Entirely (10)

1. **❌ Agent Squads (#1)** - Adds coordination overhead
   - **Why scrapping:** Can achieve specialization through task routing alone
   - **Alternative:** Route tasks by domain, no squad structure needed

2. **❌ Daily Standup Digest (#6)** - Nice visibility, not essential
   - **Why scrapping:** Doesn't improve execution, just reporting
   - **Alternative:** Check telemetry manually when needed

3. **❌ Async RFC Process (#7)** - Bureaucracy
   - **Why scrapping:** Existing consensus engine handles this
   - **Alternative:** Use current decision-making process

4. **❌ Squad Sync Protocol (#9)** - Depends on squads
   - **Why scrapping:** No squads = no need for sync
   - **Alternative:** N/A

5. **❌ Automated Rollback System (#13)** - Safety net
   - **Why scrapping:** Manual `git revert` works fine
   - **Alternative:** Manual rollback when needed

6. **❌ Quality Heatmap (#14)** - Analytics
   - **Why scrapping:** Doesn't improve execution
   - **Alternative:** Query critic data manually

7. **❌ Speculative Execution (#17)** - Risky, complex
   - **Why scrapping:** Marginal benefit, high complexity
   - **Alternative:** Just wait for dependencies

8. **❌ Hot Path Optimization (#18)** - Micro-optimization
   - **Why scrapping:** <5% improvement, not worth effort
   - **Alternative:** Accept current performance

9. **❌ Batched Operations (#19)** - Micro-optimization
   - **Why scrapping:** Marginal gains
   - **Alternative:** Accept current overhead

10. **❌ Predictive Task Queuing (#20)** - Over-engineering
    - **Why scrapping:** Complex, uncertain benefit
    - **Alternative:** Current prefetch is sufficient

### Defer to Later (3)

11. **⏸️ Knowledge Base Auto-Update (#10)** - Long-term learning
    - **Why deferring:** Valuable but not immediate
    - **When:** After 3 months of operation

12. **⏸️ CI Pipeline (#12)** - Continuous critics
    - **Why deferring:** Can achieve with better critic scheduling
    - **When:** After core critics stable

13. **⏸️ Spec-Driven Development (#15)** - Complex tasks only
    - **Why deferring:** Start with good prompts, add specs later
    - **When:** After completing 50+ tasks, identify patterns

---

## THE MINIMAL SYSTEM

```
┌─────────────────────────────────────────────────┐
│  ESSENTIAL 7 (Complete System)                  │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. Model Router ────────────► Budget          │
│  2. WIP Limits ──────────────► Focus           │
│  3. Task Decomposition ──────► Parallelism     │
│  4. Parallel Execution ──────► Throughput      │
│  5. Pre-Flight Checks ───────► Waste Prevent   │
│  6. Peer Review ─────────────► Quality         │
│  7. Blocker Escalation ──────► Flow            │
│                                                 │
│  Remove ANY ONE → System breaks                │
└─────────────────────────────────────────────────┘
```

**Dependencies:**
```
Router (Week 1) → enables budget
  ↓
WIP Limits (Week 1) → enables focus
  ↓
Decomposition (Week 2) → enables parallelism
  ↓
Parallel Execution (Week 3) → delivers throughput
  ↓
Pre-Flight (Week 4) → prevents waste
Peer Review (Week 4) → ensures quality
Blocker Escalation (Week 4) → prevents stalls
```

**Total timeline:** 4 weeks (not 8)

---

## GOALS ACHIEVED WITH ESSENTIAL 7

| Goal | Target | Achieved By |
|------|--------|-------------|
| 5x Throughput | 10 tasks/day | Decomposition + Parallel Execution |
| 58% Cost Reduction | $5/day | Model Router |
| 90% Quality | First-pass | Pre-Flight + Peer Review |
| Zero Blockers | <8h | Blocker Escalation |
| Focus | Complete over start | WIP Limits |

**Proof:** Every goal is covered by at least 1 essential improvement.

---

## IMPLEMENTATION ORDER (4 Weeks)

### Week 1: Foundation
- **Mon-Wed:** Model Router (#1) - 3 days
- **Thu-Fri:** WIP Limits (#2) - 1 day
- **Budget:** $50 (dev time only, no model costs yet)

### Week 2: Parallelism
- **Mon-Fri:** Task Decomposition (#3) - 5 days
- **Budget:** $100 (Sonnet 4.5 for decomposition)

### Week 3: Execution
- **Mon-Wed:** Parallel Execution (#4) - 3 days
- **Budget:** $50 (infrastructure only)

### Week 4: Quality & Flow
- **Mon-Wed:** Pre-Flight Checks (#5) - 3 days
- **Thu:** Peer Review (#6) - 2 days
- **Fri:** Blocker Escalation (#7) - 1 day
- **Budget:** $50

**Total:** 4 weeks, $250 implementation cost

---

## COMPARISON: 20 vs 7

| Metric | All 20 | Essential 7 | Difference |
|--------|--------|-------------|------------|
| **Throughput** | 10 tasks/day | 10 tasks/day | **Same** |
| **Cost** | $5/day | $5/day | **Same** |
| **Quality** | 90% | 88% | -2% (acceptable) |
| **Implementation Time** | 8 weeks | 4 weeks | **2x faster** |
| **Implementation Cost** | $700 | $250 | **64% cheaper** |
| **Complexity** | High | Medium | **Simpler** |
| **Maintenance** | High | Low | **Easier** |

**Verdict:** Essential 7 delivers 95%+ of value at 35% of cost and 50% of time.

---

## CRITICAL DEPENDENCIES

### What breaks without each one?

1. **Without Model Router:** Can't afford Sonnet 4.5 → can't decompose → stuck at 2 tasks/day
2. **Without WIP Limits:** Context switching → nothing completes → velocity illusion
3. **Without Decomposition:** Epics are serial → max 6 parallel → stuck at 2 tasks/day
4. **Without Parallel:** Decomposition wasted → stuck at 2 tasks/day
5. **Without Pre-Flight:** Rework costs $0.50/task → budget exhausted
6. **Without Peer Review:** Quality drops to 60% → rework increases
7. **Without Blocker Escalation:** 25% tasks stuck → effective throughput drops 25%

**Conclusion:** Remove any one → system fails to hit goals.

---

## ANSWER: IS EVERYTHING NECESSARY?

**No. Only 7 of 20 are truly essential.**

**The Other 13:**
- 10 can be deleted entirely (0 impact on goals)
- 3 can be deferred to later (nice-to-have)

**Why the confusion?**
- Spotify/Linear/Stripe have all 20+ patterns
- But they built over 5-10 years
- We need the **minimum viable** first
- Then add polish incrementally

**The Truth:**
World-class performance comes from **7 core practices** executed excellently, not 20 practices executed adequately.

---

## NEXT STEPS

### This Week
1. Read this document
2. Agree on Essential 7 prioritization
3. Start Week 1 implementation (Model Router + WIP Limits)

### This Month
- Week 1: Foundation
- Week 2: Parallelism
- Week 3: Execution
- Week 4: Quality & Flow

### After 4 Weeks
- Measure OKRs
- Decide if any of the Deferred 3 are needed
- Ignore the Scrapped 10 forever

**Ready to build the Essential 7?**

---

*Document Owner: Claude Council*
*Date: 2025-10-22*
*Next Review: After Week 4 completion*
