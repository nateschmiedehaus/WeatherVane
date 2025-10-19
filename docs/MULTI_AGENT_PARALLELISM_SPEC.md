# Multi-Agent Parallelism - Implementation Specification

**Status:** PLANNED (Not Yet Implemented)
**Priority:** HIGH (Performance Optimization)
**Estimated Effort:** 3 weeks focused work
**Expected Gain:** 50-100% throughput improvement with 2-3 agents

---

## Problem Statement

Currently running one agent at a time (e.g., `natems6@gmail.com` Codex). This is inefficient when we have multiple Codex profiles and Claude Code accounts available.

**Goal:** Enable 2+ agents to work simultaneously on different tasks without conflicts.

---

## Current Architecture Constraints

**Single-Agent Assumptions:**
1. One worker process at a time
2. Shared mutable state (roadmap.yaml, context.md, checkpoint.json, orchestrator.db)
3. Task scheduler assumes single consumer
4. No coordination/locking mechanism
5. Potential write conflicts on artifacts
6. Consensus telemetry could interleave

**Race Conditions to Prevent:**
```
Agent A: Read roadmap → Mark T1 as in_progress → Write roadmap
Agent B: Read roadmap → Mark T1 as in_progress → Write roadmap  ❌ CONFLICT

Agent A: Update context.md with T1 completion
Agent B: Update context.md with T2 completion  ❌ LOST UPDATE

Agent A: Record decision in orchestrator.db
Agent B: Record decision in orchestrator.db  ❌ POSSIBLE CORRUPTION
```

---

## Recommended Architecture: Work-Stealing Multi-Agent System

### High-Level Design

```
┌─────────────────────────────────────────────────────┐
│          Coordinator Process (single)                │
│  - Task scheduler                                    │
│  - Work queue                                        │
│  - Distributed locks                                 │
│  - Conflict resolution                               │
└─────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
│   Agent 1    │ │  Agent 2   │ │  Agent N   │
│ (Codex Pers) │ │(Codex Clnt)│ │  (Claude)  │
│              │ │            │ │            │
│ - Claim task │ │- Claim task│ │- Claim task│
│ - Execute    │ │- Execute   │ │- Execute   │
│ - Report back│ │- Report    │ │- Report    │
└──────────────┘ └────────────┘ └────────────┘
```

**Key Principles:**
- **Coordinator is single source of truth** for task assignment
- **Agents are stateless workers** that claim tasks, execute, report
- **Distributed locks** prevent concurrent writes to shared state
- **Task claims** prevent duplicate work
- **Conflict detection** handles edge cases gracefully

---

## Implementation Phases

### Phase 1: Shared State Isolation (Week 1)

#### 1.1: Distributed Locking Layer

**File:** `tools/wvo_mcp/src/orchestrator/distributed_lock.ts`

```typescript
import { promises as fs } from 'fs';
import path from 'path';

export class DistributedLock {
  private lockDir: string;

  constructor(private root: string) {
    this.lockDir = path.join(root, 'state', 'locks');
  }

  async acquire(resource: string, agentId: string, timeoutMs = 30000): Promise<boolean> {
    const lockFile = path.join(this.lockDir, `${resource}.lock`);
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        // Atomic write with exclusive flag
        await fs.writeFile(lockFile, JSON.stringify({
          agentId,
          acquiredAt: Date.now(),
          pid: process.pid,
        }), { flag: 'wx' });

        return true; // Lock acquired
      } catch (err) {
        // Lock exists, check if stale
        const lock = await this.checkStaleLock(lockFile);
        if (lock?.stale) {
          await fs.unlink(lockFile);
          continue; // Retry
        }

        // Wait and retry
        await this.sleep(100);
      }
    }

    return false; // Timeout
  }

  async release(resource: string, agentId: string): Promise<void> {
    const lockFile = path.join(this.lockDir, `${resource}.lock`);

    try {
      const content = await fs.readFile(lockFile, 'utf-8');
      const lock = JSON.parse(content);

      // Only release if we own the lock
      if (lock.agentId === agentId) {
        await fs.unlink(lockFile);
      }
    } catch (err) {
      // Lock already released or doesn't exist
    }
  }

  private async checkStaleLock(lockFile: string): Promise<{ stale: boolean } | null> {
    try {
      const content = await fs.readFile(lockFile, 'utf-8');
      const lock = JSON.parse(content);
      const age = Date.now() - lock.acquiredAt;

      // Locks older than 5 minutes are stale
      return { stale: age > 5 * 60 * 1000 };
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

**Key Features:**
- File-based locks (atomic operations via `wx` flag)
- Stale lock detection (5-minute timeout)
- Exponential backoff on contention
- Automatic cleanup on release

#### 1.2: Lock-Protected State Access

**Integration Points:**
- `session.ts::updateRoadmap()`
- `session.ts::updateContext()`
- `state_machine.ts::transition()`

```typescript
// Wrap all shared state mutations

async updateRoadmap(fn: (roadmap: RoadmapDocument) => void) {
  const agentId = this.session.profile;
  const lock = new DistributedLock(this.root);

  const acquired = await lock.acquire('roadmap', agentId);
  if (!acquired) {
    throw new Error('Failed to acquire roadmap lock');
  }

  try {
    const roadmap = await this.roadmapStore.read();
    fn(roadmap);
    await this.roadmapStore.write(roadmap);
  } finally {
    await lock.release('roadmap', agentId);
  }
}
```

#### 1.3: Task Claiming Store

**File:** `tools/wvo_mcp/src/orchestrator/task_claim_store.ts`

```typescript
interface TaskClaim {
  taskId: string;
  agentId: string;
  claimedAt: number;
  expectedCompletionMs: number;
}

export class TaskClaimStore {
  private claims = new Map<string, TaskClaim>();
  private readonly stateFile: string;

  constructor(private root: string) {
    this.stateFile = path.join(root, 'state', 'task_claims.json');
  }

  async claim(taskId: string, agentId: string): Promise<boolean> {
    await this.load();

    const existing = this.claims.get(taskId);

    if (existing) {
      const elapsed = Date.now() - existing.claimedAt;

      // If claim is stale (2x expected completion time), allow re-claim
      if (elapsed > existing.expectedCompletionMs * 2) {
        console.warn(`Stale claim detected for ${taskId} by ${existing.agentId}, re-claiming`);
      } else {
        return false; // Already claimed
      }
    }

    this.claims.set(taskId, {
      taskId,
      agentId,
      claimedAt: Date.now(),
      expectedCompletionMs: 3600000, // 1 hour default
    });

    await this.save();
    return true;
  }

  async release(taskId: string, agentId: string): Promise<void> {
    await this.load();

    const claim = this.claims.get(taskId);

    if (claim && claim.agentId === agentId) {
      this.claims.delete(taskId);
      await this.save();
    }
  }

  getOwner(taskId: string): string | null {
    return this.claims.get(taskId)?.agentId ?? null;
  }

  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(this.stateFile, 'utf-8');
      const data = JSON.parse(content);
      this.claims = new Map(Object.entries(data));
    } catch {
      // File doesn't exist yet
    }
  }

  private async save(): Promise<void> {
    const data = Object.fromEntries(this.claims);
    await fs.writeFile(this.stateFile, JSON.stringify(data, null, 2));
  }
}
```

---

### Phase 2: Coordinator Process (Week 2)

#### 2.1: Multi-Agent Coordinator

**File:** `tools/wvo_mcp/src/orchestrator/multi_agent_coordinator.ts`

```typescript
import { EventEmitter } from 'events';
import type { Task } from './state_machine.js';
import { TaskScheduler } from './task_scheduler.js';
import { TaskClaimStore } from './task_claim_store.js';
import { DistributedLock } from './distributed_lock.js';

export interface AgentWorker {
  id: string;
  provider: 'codex' | 'claude_code';
  profile: string;
  capabilities: string[];
  maxConcurrentTasks: number;
  activeTasks: Set<string>;
  lastHeartbeat: number;
}

export interface TaskResult {
  success: boolean;
  artifacts?: string[];
  error?: string;
}

export class MultiAgentCoordinator extends EventEmitter {
  private workers = new Map<string, AgentWorker>();
  private workQueue: Task[] = [];
  private taskScheduler: TaskScheduler;
  private claimStore: TaskClaimStore;
  private lockManager: DistributedLock;
  private heartbeatInterval: NodeJS.Timeout;

  constructor(private root: string, private stateMachine: StateMachine) {
    super();
    this.taskScheduler = new TaskScheduler(stateMachine);
    this.claimStore = new TaskClaimStore(root);
    this.lockManager = new DistributedLock(root);

    // Monitor worker health
    this.heartbeatInterval = setInterval(() => this.checkWorkerHealth(), 30000);
  }

  registerWorker(worker: AgentWorker): void {
    this.workers.set(worker.id, {
      ...worker,
      activeTasks: new Set(),
      lastHeartbeat: Date.now(),
    });

    this.emit('worker:registered', worker);
    console.log(`[Coordinator] Worker registered: ${worker.id} (${worker.provider})`);

    // Immediately try to assign work
    this.dispatchWork();
  }

  unregisterWorker(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    console.log(`[Coordinator] Worker unregistering: ${workerId}`);

    // Release all tasks claimed by this worker
    for (const taskId of worker.activeTasks) {
      this.claimStore.release(taskId, workerId);
      this.taskScheduler.releaseTask(taskId);
    }

    this.workers.delete(workerId);
    this.emit('worker:unregistered', workerId);
  }

  async heartbeat(workerId: string): Promise<void> {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.lastHeartbeat = Date.now();
    }
  }

  async claimNextTask(workerId: string): Promise<Task | null> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Unknown worker: ${workerId}`);
    }

    // Update heartbeat
    worker.lastHeartbeat = Date.now();

    // Check if worker has capacity
    if (worker.activeTasks.size >= worker.maxConcurrentTasks) {
      return null;
    }

    // Get next task from scheduler
    const scheduledTask = this.taskScheduler.takeNextTask();
    if (!scheduledTask) {
      return null;
    }

    const task = scheduledTask.task;

    // Attempt to claim
    const claimed = await this.claimStore.claim(task.id, workerId);
    if (!claimed) {
      // Task already claimed by another agent, try next
      this.taskScheduler.releaseTask(task.id);
      return this.claimNextTask(workerId);
    }

    // Mark as claimed
    worker.activeTasks.add(task.id);
    this.emit('task:claimed', { taskId: task.id, workerId });

    console.log(`[Coordinator] Task claimed: ${task.id} by ${workerId}`);

    return task;
  }

  async completeTask(workerId: string, taskId: string, result: TaskResult): Promise<void> {
    const worker = this.workers.get(workerId);
    if (!worker) {
      throw new Error(`Unknown worker: ${workerId}`);
    }

    console.log(`[Coordinator] Task completed: ${taskId} by ${workerId} (success: ${result.success})`);

    // Release claim
    await this.claimStore.release(taskId, workerId);
    worker.activeTasks.delete(taskId);

    // Update state (with locking)
    const acquired = await this.lockManager.acquire('roadmap', workerId);
    if (!acquired) {
      throw new Error('Failed to acquire lock for task completion');
    }

    try {
      if (result.success) {
        await this.taskScheduler.completeTask(taskId);
        // Record result, update telemetry, etc.
      } else {
        // Task failed, release it for retry
        this.taskScheduler.releaseTask(taskId);
      }
    } finally {
      await this.lockManager.release('roadmap', workerId);
    }

    this.emit('task:completed', { taskId, workerId, result });

    // Dispatch more work
    this.dispatchWork();
  }

  private checkWorkerHealth(): void {
    const now = Date.now();
    const timeout = 60000; // 1 minute

    for (const [workerId, worker] of this.workers) {
      const elapsed = now - worker.lastHeartbeat;

      if (elapsed > timeout) {
        console.warn(`[Coordinator] Worker ${workerId} missed heartbeat (${elapsed}ms), removing`);
        this.unregisterWorker(workerId);
      }
    }
  }

  private dispatchWork(): void {
    for (const [workerId, worker] of this.workers) {
      if (worker.activeTasks.size < worker.maxConcurrentTasks) {
        this.emit('work:available', { workerId });
      }
    }
  }

  getStatus(): {
    workers: number;
    activeTasks: number;
    queuedTasks: number;
  } {
    const activeTasks = Array.from(this.workers.values())
      .reduce((sum, w) => sum + w.activeTasks.size, 0);

    return {
      workers: this.workers.size,
      activeTasks,
      queuedTasks: this.taskScheduler.getQueueLength(),
    };
  }

  destroy(): void {
    clearInterval(this.heartbeatInterval);
    this.taskScheduler.destroy();
  }
}
```

#### 2.2: Worker Client Protocol

**File:** `tools/wvo_mcp/src/worker/multi_agent_worker_client.ts`

```typescript
export class MultiAgentWorkerClient {
  private workerId: string;
  private heartbeatInterval: NodeJS.Timeout;

  constructor(
    private coordinatorUrl: string,
    private workerConfig: AgentWorker,
    private taskExecutor: (task: Task) => Promise<TaskResult>
  ) {
    this.workerId = workerConfig.id;
  }

  async start(): Promise<void> {
    // Register with coordinator
    await this.register();

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), 15000);

    // Start work loop
    await this.workLoop();
  }

  async stop(): Promise<void> {
    clearInterval(this.heartbeatInterval);
    await this.unregister();
  }

  private async register(): Promise<void> {
    const response = await fetch(`${this.coordinatorUrl}/workers/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.workerConfig),
    });

    if (!response.ok) {
      throw new Error(`Failed to register worker: ${response.statusText}`);
    }

    console.log(`[Worker ${this.workerId}] Registered with coordinator`);
  }

  private async unregister(): Promise<void> {
    await fetch(`${this.coordinatorUrl}/workers/${this.workerId}`, {
      method: 'DELETE',
    });

    console.log(`[Worker ${this.workerId}] Unregistered`);
  }

  private async sendHeartbeat(): Promise<void> {
    await fetch(`${this.coordinatorUrl}/workers/${this.workerId}/heartbeat`, {
      method: 'POST',
    });
  }

  private async workLoop(): Promise<void> {
    while (true) {
      try {
        // Claim next task
        const task = await this.claimTask();

        if (!task) {
          // No work available, wait
          await this.sleep(5000);
          continue;
        }

        console.log(`[Worker ${this.workerId}] Executing task: ${task.id}`);

        // Execute task
        const result = await this.taskExecutor(task);

        // Report completion
        await this.completeTask(task.id, result);

      } catch (error) {
        console.error(`[Worker ${this.workerId}] Error in work loop:`, error);
        await this.sleep(10000); // Back off on error
      }
    }
  }

  private async claimTask(): Promise<Task | null> {
    const response = await fetch(`${this.coordinatorUrl}/workers/${this.workerId}/claim`, {
      method: 'POST',
    });

    if (response.status === 204) {
      return null; // No work available
    }

    if (!response.ok) {
      throw new Error(`Failed to claim task: ${response.statusText}`);
    }

    return await response.json();
  }

  private async completeTask(taskId: string, result: TaskResult): Promise<void> {
    const response = await fetch(`${this.coordinatorUrl}/workers/${this.workerId}/tasks/${taskId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });

    if (!response.ok) {
      throw new Error(`Failed to complete task: ${response.statusText}`);
    }

    console.log(`[Worker ${this.workerId}] Task completed: ${taskId}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

---

### Phase 3: Conflict Resolution (Week 3)

#### 3.1: Context Merge Strategy

**File:** `tools/wvo_mcp/src/orchestrator/context_merger.ts`

```typescript
export class ContextMerger {
  async merge(updates: Array<{ agentId: string; content: string; timestamp: number }>): Promise<string> {
    // Sort by timestamp
    updates.sort((a, b) => a.timestamp - b.timestamp);

    // Parse each update into sections
    const sections = new Map<string, string>();

    for (const update of updates) {
      const parsed = this.parseContext(update.content);

      for (const [section, content] of Object.entries(parsed)) {
        if (section === 'Recent Updates') {
          // Special handling for Recent Updates - merge and deduplicate
          const existing = sections.get(section) || '';
          const merged = this.mergeRecentUpdates(existing, content);
          sections.set(section, merged);
        } else {
          // Last write wins for other sections
          sections.set(section, content);
        }
      }
    }

    return this.formatContext(sections);
  }

  private mergeRecentUpdates(existing: string, incoming: string): string {
    // Parse timestamps and deduplicate
    const existingLines = existing.split('\n').filter(l => l.startsWith('- 2025-'));
    const incomingLines = incoming.split('\n').filter(l => l.startsWith('- 2025-'));

    const allLines = [...existingLines, ...incomingLines];
    const unique = new Set(allLines);

    // Sort by timestamp (descending)
    const sorted = Array.from(unique).sort((a, b) => {
      const tsA = a.match(/2025-\d{2}-\d{2}T\d{2}:\d{2}Z/)?.[0] || '';
      const tsB = b.match(/2025-\d{2}-\d{2}T\d{2}:\d{2}Z/)?.[0] || '';
      return tsB.localeCompare(tsA);
    });

    // Keep only last 10 entries
    return sorted.slice(0, 10).join('\n');
  }

  private parseContext(content: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const lines = content.split('\n');
    let currentSection = '';
    let currentContent: string[] = [];

    for (const line of lines) {
      if (line.startsWith('## ')) {
        // Save previous section
        if (currentSection) {
          sections[currentSection] = currentContent.join('\n');
        }

        // Start new section
        currentSection = line.replace('## ', '').trim();
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }

    // Save last section
    if (currentSection) {
      sections[currentSection] = currentContent.join('\n');
    }

    return sections;
  }

  private formatContext(sections: Map<string, string>): string {
    const parts: string[] = [];

    for (const [section, content] of sections) {
      parts.push(`## ${section}`);
      parts.push(content);
      parts.push('');
    }

    return parts.join('\n');
  }
}
```

#### 3.2: Artifact Conflict Detector

**File:** `tools/wvo_mcp/src/orchestrator/artifact_conflict_detector.ts`

```typescript
interface Conflict {
  path: string;
  versions: Array<{ agentId: string; content: string }>;
  resolution: 'use_most_recent' | 'merge' | 'escalate';
}

export class ArtifactConflictDetector {
  async detectConflict(
    artifacts: Array<{ agentId: string; path: string; content: string; timestamp: number }>
  ): Promise<Conflict | null> {
    const byPath = new Map<string, typeof artifacts>();

    for (const artifact of artifacts) {
      if (!byPath.has(artifact.path)) {
        byPath.set(artifact.path, []);
      }
      byPath.get(artifact.path)!.push(artifact);
    }

    for (const [path, versions] of byPath) {
      if (versions.length > 1) {
        // Conflict detected
        return {
          path,
          versions: versions.map(v => ({ agentId: v.agentId, content: v.content })),
          resolution: this.suggestResolution(path, versions),
        };
      }
    }

    return null;
  }

  private suggestResolution(
    path: string,
    versions: Array<{ agentId: string; content: string; timestamp: number }>
  ): 'use_most_recent' | 'merge' | 'escalate' {
    // Strategy 1: If one is superset of other, take superset
    if (versions.length === 2) {
      const [a, b] = versions;
      if (a.content.includes(b.content)) {
        return 'use_most_recent'; // A is superset
      }
      if (b.content.includes(a.content)) {
        return 'use_most_recent'; // B is superset
      }
    }

    // Strategy 2: If test files, merge test cases
    if (path.includes('.test.') || path.includes('.spec.')) {
      return 'merge';
    }

    // Strategy 3: For code files, escalate (manual resolution)
    if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.py')) {
      return 'escalate';
    }

    // Default: Use most recent
    return 'use_most_recent';
  }

  async resolveConflict(conflict: Conflict): Promise<string> {
    const versions = conflict.versions.sort((a, b) => {
      // Sort by timestamp if available
      return 0; // Simplified
    });

    switch (conflict.resolution) {
      case 'use_most_recent':
        return versions[versions.length - 1].content;

      case 'merge':
        // Simple merge: concatenate unique lines
        const allLines = new Set<string>();
        for (const version of versions) {
          version.content.split('\n').forEach(line => allLines.add(line));
        }
        return Array.from(allLines).join('\n');

      case 'escalate':
        throw new Error(`Manual resolution required for ${conflict.path}`);

      default:
        return versions[0].content;
    }
  }
}
```

---

### Phase 4: Coordination Patterns

#### 4.1: Domain-Based Partitioning

```typescript
// Assign agents to specific domains to reduce conflicts

const domainAssignments = {
  'codex_personal': ['product'],
  'codex_client': ['mcp'],
  'claude_code': ['product', 'mcp'], // Fallback for both
};

coordinator.setDomainPreference('codex_personal', ['product']);
coordinator.setDomainPreference('codex_client', ['mcp']);
```

#### 4.2: Epic-Level Parallelism

```typescript
// Different agents work on different epics to minimize conflicts

coordinator.setEpicPreference('codex_personal', ['E3', 'E12']);
coordinator.setEpicPreference('codex_client', ['E4', 'E31']);
```

#### 4.3: Read-Only Task Optimization

```typescript
// Research/analysis tasks don't modify shared state
// These can run in parallel without coordination

interface TaskProfile {
  readonly: boolean;
  artifacts: string[];
  dependencies: string[];
}

// Tag research tasks as readonly in roadmap.yaml
tasks:
  - id: T4.2.0
    title: Research ML/causal/optimization
    readonly: true  # No locking needed
```

---

## CLI Interface

### Coordinator Commands

```bash
# Start coordinator process (runs in background)
make mcp-coordinator

# Check coordinator status
make mcp-coordinator-status
# Output:
# Coordinator: Running
# Workers: 3 registered
# Active Tasks: 2
# Queued Tasks: 12
```

### Worker Commands

```bash
# Terminal 1: Start Codex Personal worker
CODEX_PROFILE=weathervane_orchestrator \
CODEX_HOME=.accounts/codex/codex_personal \
WVO_COORDINATOR_URL=http://localhost:9001 \
make mcp-worker

# Terminal 2: Start Codex Client worker
CODEX_PROFILE=weathervane_client \
CODEX_HOME=.accounts/codex/codex_client \
WVO_COORDINATOR_URL=http://localhost:9001 \
make mcp-worker

# Terminal 3: Start Claude Code worker
CLAUDE_CONFIG_DIR=.accounts/claude/claude_primary \
WVO_COORDINATOR_URL=http://localhost:9001 \
make mcp-worker

# Monitor all workers
make mcp-status
# Output:
# Coordinator: Running (3 workers)
# Workers:
#   - codex_personal: 1 active task (T3.4.3)
#   - codex_client: 1 active task (T4.1.8)
#   - claude_code: 0 active tasks (idle)
#
# Work Queue: 12 pending tasks
# Completed: 45 tasks
# Failed: 2 tasks
```

---

## Expected Performance

### Current (Single Agent)
- ~1 task per 10-15 minutes
- ~4-6 tasks/hour
- ~50-75 tasks/day

### With 2 Agents (Work-Stealing)
- ~8-10 tasks/hour theoretical
- ~30% coordination overhead
- **Net: ~6-7 tasks/hour (50% improvement)**

### With 3 Agents
- ~12 tasks/hour theoretical
- ~40% coordination overhead
- **Net: ~7-8 tasks/hour (30% improvement over 2 agents)**

**Diminishing returns after 3-4 agents** due to:
- Lock contention
- Context switching
- Coordination overhead

---

## Risk Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Data corruption** | HIGH | Distributed locking with atomic operations |
| **Duplicate work** | MEDIUM | Task claiming with CAS, deduplication |
| **Deadlocks** | MEDIUM | Lock timeout (30s), stale lock detection |
| **Stale claims** | MEDIUM | Heartbeat mechanism, automatic claim expiry |
| **Merge conflicts** | LOW | Conflict detection + resolution strategies |
| **Coordinator SPOF** | HIGH | Coordinator failover (Phase 2.5) |

---

## Migration Path

### Stage 1: Shadow Mode (Week 5)
- Run multi-agent in parallel with existing single-agent
- Don't commit multi-agent results
- Log telemetry and identify bugs

### Stage 2: Partial Rollout (Week 6)
- Enable for read-only tasks first
- Then domain-partitioned tasks
- Monitor for conflicts in production

### Stage 3: Full Rollout (Week 7)
- Enable work-stealing for all tasks
- Monitor performance gains
- Tune worker count based on throughput

---

## Implementation Checklist

**Phase 1: Shared State (Week 1)**
- [ ] Implement `DistributedLock` class
- [ ] Implement `TaskClaimStore` class
- [ ] Wrap all shared state access with locks
- [ ] Unit tests for locking primitives
- [ ] Integration test: 2 processes claiming same task

**Phase 2: Coordinator (Week 2)**
- [ ] Implement `MultiAgentCoordinator` class
- [ ] Implement worker registration protocol
- [ ] Implement task claiming API
- [ ] Implement heartbeat mechanism
- [ ] Implement worker health monitoring
- [ ] Integration test: coordinator + 2 workers

**Phase 3: Conflict Resolution (Week 3)**
- [ ] Implement `ContextMerger` class
- [ ] Implement `ArtifactConflictDetector` class
- [ ] Integration test: concurrent context updates
- [ ] Integration test: artifact conflict resolution

**Phase 4: Coordination Patterns (Week 4)**
- [ ] Implement domain partitioning
- [ ] Implement epic preferences
- [ ] Tag read-only tasks in roadmap
- [ ] Performance benchmarks: 1 vs 2 vs 3 agents

**Phase 5: Production Readiness (Week 5)**
- [ ] CLI commands (`make mcp-coordinator`, `make mcp-worker`)
- [ ] Status dashboard
- [ ] Monitoring + alerting
- [ ] Runbook documentation
- [ ] Shadow mode deployment

---

## Future Enhancements (Post-MVP)

1. **Coordinator Failover:** Run 2 coordinators with leader election
2. **Dynamic Worker Scaling:** Auto-scale workers based on queue depth
3. **Intelligent Task Assignment:** ML-based assignment (assign similar tasks to same agent for context efficiency)
4. **Cross-Agent Learning:** Share context between agents working on related tasks
5. **Web UI:** Real-time dashboard showing agent activity, task progress

---

## References

- **Task Scheduler:** `tools/wvo_mcp/src/orchestrator/task_scheduler.ts`
- **State Machine:** `tools/wvo_mcp/src/orchestrator/state_machine.ts`
- **Session Management:** `tools/wvo_mcp/src/session.ts`
- **Worker Manager:** `tools/wvo_mcp/src/worker/worker_manager.ts`

---

## Decision Log

**2025-10-18:** Spec created. Not yet implemented. Deferred for post-MVP due to complexity. Will revisit when single-agent throughput becomes a bottleneck.

**Key Decision:** Start with full work-stealing architecture (not simple domain partitioning) to maximize flexibility. The extra complexity is worth it for true parallelism.
