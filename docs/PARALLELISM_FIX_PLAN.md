# Complete Fix Plan: True Parallel Execution

## Executive Summary

The current UnifiedOrchestrator has **false parallelism** - tasks start concurrently but execute sequentially due to:
1. Race conditions in agent selection
2. Blocking CLI calls (execa)
3. No task queue for waiting tasks
4. Missing agent availability coordination

## Solution: Implement True Agent Pool with Task Queue

### Architecture Choice: Sequential Queue with Agent Pool

**Why this approach:**
- Simpler than multi-process coordination
- Avoids race conditions entirely
- Easy to reason about and debug
- Agents become truly parallel via background CLI processes
- Natural backpressure and flow control

### Implementation Plan

## Phase 1: Add Task Queue & Agent Locking ⚡ PRIORITY

### 1.1: Create Agent Pool Manager

```typescript
// tools/wvo_mcp/src/orchestrator/agent_pool.ts

export class AgentPool {
  private agents: Map<string, Agent> = new Map();
  private reservations: Map<string, string> = new Map(); // agentId -> taskId
  private taskQueue: Array<{task: Task, resolve: Function, reject: Function}> = [];

  /**
   * Reserve an agent for a task
   * Returns immediately with an agent, or queues the task
   */
  async reserveAgent(task: Task, complexity: TaskComplexity): Promise<Agent> {
    return new Promise((resolve, reject) => {
      const agent = this.findAvailableAgent(complexity, task);

      if (agent) {
        // Agent available - reserve it immediately
        this.reservations.set(agent.id, task.id);
        agent.status = 'busy';
        agent.currentTask = task.id;
        resolve(agent);
      } else {
        // No agent available - queue the task
        this.taskQueue.push({ task, resolve, reject });
      }
    });
  }

  /**
   * Release an agent back to the pool
   * Triggers processing of queued tasks
   */
  releaseAgent(agentId: string): void {
    this.reservations.delete(agentId);
    const agent = this.agents.get(agentId);

    if (agent) {
      agent.status = 'idle';
      agent.currentTask = undefined;
      agent.lastTask = agent.currentTask;
    }

    // Process next queued task
    this.processQueue();
  }

  private processQueue(): void {
    if (this.taskQueue.length === 0) return;

    const next = this.taskQueue[0];
    const complexity = this.assessComplexity(next.task);
    const agent = this.findAvailableAgent(complexity, next.task);

    if (agent) {
      // Remove from queue and assign
      this.taskQueue.shift();
      this.reservations.set(agent.id, next.task.id);
      agent.status = 'busy';
      agent.currentTask = next.task.id;
      next.resolve(agent);

      // Try to process more queued tasks
      this.processQueue();
    }
  }

  private findAvailableAgent(complexity: TaskComplexity, task: Task): Agent | null {
    // Same logic as selectAgent but returns null if none available
    const candidates = Array.from(this.agents.values())
      .filter(a => a.status === 'idle' && !this.reservations.has(a.id));

    if (candidates.length === 0) return null;

    // Apply routing logic...
    return candidates[0];
  }
}
```

### 1.2: Modify UnifiedOrchestrator to Use AgentPool

```typescript
export class UnifiedOrchestrator extends EventEmitter {
  private agentPool: AgentPool;

  async executeTask(task: Task): Promise<ExecutionResult> {
    const startTime = Date.now();
    const complexity = this.assessComplexity(task);

    // WAIT for an available agent (queues if none available)
    const agent = await this.agentPool.reserveAgent(task, complexity);

    try {
      const prompt = await this.buildPrompt(task, agent);
      const executor = this.getExecutor(agent.config.provider);

      // Execute (this still blocks, but only this task's promise)
      const result = await executor.exec(agent.config.model, prompt);

      // Update telemetry...

      return result;
    } finally {
      // ALWAYS release the agent, even on error
      this.agentPool.releaseAgent(agent.id);
    }
  }
}
```

**Benefits:**
- ✅ Tasks queue automatically when agents are busy
- ✅ Agents are released and reassigned to waiting tasks
- ✅ No race conditions (sequential queue processing)
- ✅ True parallelism (each agent runs independently)
- ✅ Backpressure (queue grows if overloaded)

## Phase 2: Make CLI Execution Non-Blocking 🚀 ADVANCED

### 2.1: Background CLI Execution

Instead of awaiting execa (which blocks), spawn processes and monitor them:

```typescript
export class ClaudeExecutor implements CLIExecutor {
  async exec(model: string, prompt: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Spawn process WITHOUT awaiting
    const child = execa(this.bin, args, {
      env,
      input: prompt,
      timeout: 600_000,
    });

    // Return immediately - caller can await the promise
    const result = await child;

    return {
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.stderr,
      duration: Date.now() - startTime,
    };
  }
}
```

**Note:** This already works! `execa` returns a promise that doesn't block the event loop. The issue is the agent reservation logic, not execa itself.

## Phase 3: Progress Monitoring 📊

### 3.1: Add Progress Events

```typescript
export class AgentPool extends EventEmitter {
  processQueue(): void {
    // ... existing code ...

    this.emit('queue:updated', {
      queueLength: this.taskQueue.length,
      availableAgents: this.getAvailableAgents().length,
      busyAgents: this.reservations.size,
    });
  }
}
```

### 3.2: Update Live Telemetry

```javascript
// In autopilot_unified.sh
orchestrator.on('queue:updated', (status) => {
  console.log(`Queue: ${status.queueLength} waiting | ${status.busyAgents} busy | ${status.availableAgents} available`);
});
```

## Phase 4: Testing & Validation ✅

### 4.1: Unit Tests

```typescript
describe('AgentPool', () => {
  it('should queue tasks when no agents available', async () => {
    const pool = new AgentPool();
    pool.addAgent(agent1);

    // Reserve the only agent
    const reserved1 = await pool.reserveAgent(task1, 'moderate');

    // Try to reserve again - should queue
    const promise2 = pool.reserveAgent(task2, 'moderate');

    // Release first agent
    pool.releaseAgent(reserved1.id);

    // Second task should now get the agent
    const reserved2 = await promise2;
    expect(reserved2).toBeDefined();
  });
});
```

### 4.2: Integration Test

```bash
# Test with 5 agents, 10 tasks
make autopilot AGENTS=5 MAX_ITERATIONS=1

# Expected: 5 tasks running concurrently, 5 queued
# As tasks complete, queued tasks should start automatically
```

## Implementation Steps

### Step 1: Create AgentPool ⏱️ 30 minutes
- [ ] Create `tools/wvo_mcp/src/orchestrator/agent_pool.ts`
- [ ] Implement reserveAgent, releaseAgent, processQueue
- [ ] Add unit tests

### Step 2: Integrate with UnifiedOrchestrator ⏱️ 20 minutes
- [ ] Modify UnifiedOrchestrator constructor to create AgentPool
- [ ] Update executeTask to use reserveAgent/releaseAgent
- [ ] Add try/finally to ensure agents are always released

### Step 3: Update Routing Logic ⏱️ 15 minutes
- [ ] Move selectAgent logic into AgentPool.findAvailableAgent
- [ ] Return null instead of busy agents
- [ ] Remove fallback to "least busy" agent

### Step 4: Add Telemetry ⏱️ 10 minutes
- [ ] Emit queue:updated events
- [ ] Update autopilot_unified.sh to display queue status
- [ ] Add agent utilization metrics

### Step 5: Test ⏱️ 30 minutes
- [ ] Write unit tests for AgentPool
- [ ] Test with 3 agents, 10 tasks
- [ ] Verify all agents are utilized
- [ ] Verify no race conditions

### Step 6: Documentation ⏱️ 15 minutes
- [ ] Update README with new architecture
- [ ] Add troubleshooting guide
- [ ] Document queue behavior

**Total Time: ~2 hours**

## Alternative: Use WorkerManager (Quick Fix) ⚡

If we need a faster solution:

```bash
# Just use the proven working system
make mcp-autopilot AGENTS=5
```

**Pros:**
- ✅ Already works
- ✅ True parallelism via fork()
- ✅ Battle-tested

**Cons:**
- ❌ Codex-only (no multi-provider support)
- ❌ More complex architecture
- ❌ Requires separate worker processes

## Recommendation

**For production now:** Use `make mcp-autopilot` (proven working)

**For future improvement:** Implement AgentPool (2 hours of work)

This gives you:
1. Immediate working solution
2. Path forward for multi-provider support
3. Clean architecture without race conditions

## Risk Assessment

### High Risk: Doing Nothing
- Workers remain idle
- No parallelism
- Timeouts continue

### Medium Risk: Quick Patching
- Might fix surface issue
- Underlying race conditions remain
- Hard to debug failures

### Low Risk: Proper AgentPool Implementation
- Clean solution
- Easy to test
- Solves root cause
- 2 hours of focused work

## Decision Point

**Option A:** Implement AgentPool now (2 hours, permanent fix)
**Option B:** Use mcp-autopilot now, implement AgentPool later (5 minutes now, 2 hours later)

My recommendation: **Option B** - Get working system now, improve architecture later.
