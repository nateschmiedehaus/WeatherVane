# Live Roadmap Sync Design
## Dynamic Task Discovery & Multi-Agent Coordination

**Problem:** Current sync-on-startup means:
1. New tasks added to roadmap.yaml aren't visible until restart
2. Agents within same run can't discover new work
3. External updates (human edits, other orchestrators) are invisible
4. Long-running autopilot sessions go stale

**Solution:** File-watch based continuous sync with smart invalidation

---

## Architecture

### Pattern: Event-Driven Sync (Spotify/Linear Model)

```
┌─────────────────────────────────────────────────────┐
│  File System Watcher                                │
│  (chokidar on roadmap.yaml)                         │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  Sync Coordinator                                   │
│  - Debounce (2s to batch rapid changes)            │
│  - Parse roadmap.yaml                               │
│  - Diff against current database state              │
│  - Apply incremental updates                        │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  State Machine (SQLite)                             │
│  - Transactional updates                            │
│  - Emit "roadmap_updated" event                     │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  Agent Pool                                         │
│  - Re-prefetch tasks when roadmap changes           │
│  - Notify idle agents of new work                   │
│  - Invalidate cached context                        │
└─────────────────────────────────────────────────────┘
```

---

## Implementation

### 1. File Watcher (New Module)

**File:** `tools/wvo_mcp/src/orchestrator/roadmap_watcher.ts`

```typescript
import chokidar from 'chokidar';
import { EventEmitter } from 'node:events';
import { syncRoadmapFile } from './roadmap_adapter.js';
import type { StateMachine } from './state_machine.js';

export class RoadmapWatcher extends EventEmitter {
  private watcher?: chokidar.FSWatcher;
  private debounceTimer?: NodeJS.Timeout;
  private lastSyncHash?: string;

  constructor(
    private readonly stateMachine: StateMachine,
    private readonly workspaceRoot: string,
    private readonly debounceMs: number = 2000
  ) {
    super();
  }

  start(): void {
    const roadmapPath = path.join(this.workspaceRoot, 'state', 'roadmap.yaml');

    this.watcher = chokidar.watch(roadmapPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    this.watcher.on('change', () => this.scheduleSync());
    logInfo('RoadmapWatcher started', { path: roadmapPath });
  }

  private scheduleSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => this.performSync(), this.debounceMs);
  }

  private async performSync(): Promise<void> {
    try {
      const beforeCount = this.stateMachine.getTasks({ status: ['pending'] }).length;

      await syncRoadmapFile(this.stateMachine, this.workspaceRoot);

      const afterCount = this.stateMachine.getTasks({ status: ['pending'] }).length;
      const delta = afterCount - beforeCount;

      logInfo('Roadmap synced from file change', {
        pendingTasks: afterCount,
        newTasks: delta
      });

      if (delta !== 0) {
        this.emit('roadmap_updated', { newTasks: delta, totalPending: afterCount });
      }
    } catch (error) {
      logError('Roadmap sync failed', { error });
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      logInfo('RoadmapWatcher stopped');
    }
  }
}
```

### 2. Integrate into UnifiedOrchestrator

**File:** `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`

```typescript
import { RoadmapWatcher } from './roadmap_watcher.js';

export class UnifiedOrchestrator extends EventEmitter {
  // ... existing fields ...
  private roadmapWatcher?: RoadmapWatcher;

  async start(): Promise<void> {
    // ... existing startup code ...

    // Start roadmap watcher
    this.roadmapWatcher = new RoadmapWatcher(
      this.stateMachine,
      this.config.workspaceRoot
    );

    this.roadmapWatcher.on('roadmap_updated', (event) => {
      this.handleRoadmapUpdate(event);
    });

    this.roadmapWatcher.start();

    // ... rest of startup ...
  }

  private async handleRoadmapUpdate(event: { newTasks: number; totalPending: number }): Promise<void> {
    logInfo('Handling roadmap update', event);

    // Invalidate plan cache
    this.invalidateCache();

    // If new tasks and workers are idle, trigger prefetch
    if (event.newTasks > 0) {
      const idleWorkers = this.workers.filter(w => w.status === 'idle');

      if (idleWorkers.length > 0) {
        logInfo('New tasks available, notifying idle workers', {
          newTasks: event.newTasks,
          idleWorkers: idleWorkers.length
        });

        await this.prefetchTasks();
        await this.assignNextTaskIfAvailable();
      }
    }
  }

  async stop(): Promise<void> {
    // ... existing stop code ...

    if (this.roadmapWatcher) {
      this.roadmapWatcher.stop();
    }

    // ... rest of stop ...
  }
}
```

### 3. Smart Cache Invalidation

**Pattern:** Invalidate only affected entries, not entire cache

```typescript
private invalidateCache(changedTaskIds?: string[]): void {
  if (!changedTaskIds) {
    // Full invalidation
    this.planNextCache.clear();
    return;
  }

  // Selective invalidation: only clear cache entries that might be affected
  for (const [key, cached] of this.planNextCache.entries()) {
    const filters = JSON.parse(key);

    // If cached results include any changed task, invalidate
    if (cached.result.some(task => changedTaskIds.includes(task.id))) {
      this.planNextCache.delete(key);
    }
  }
}
```

---

## Polling Alternative (Simpler, No Dependencies)

If file-watching adds complexity, use polling:

```typescript
export class RoadmapPoller extends EventEmitter {
  private intervalId?: NodeJS.Timeout;
  private lastMtime: number = 0;

  start(intervalMs: number = 10000): void {
    this.intervalId = setInterval(() => this.checkForChanges(), intervalMs);
  }

  private async checkForChanges(): Promise<void> {
    const roadmapPath = path.join(this.workspaceRoot, 'state', 'roadmap.yaml');

    try {
      const stats = await fs.stat(roadmapPath);

      if (stats.mtimeMs > this.lastMtime) {
        this.lastMtime = stats.mtimeMs;
        await this.performSync();
      }
    } catch (error) {
      // File might not exist yet, ignore
    }
  }
}
```

**Tradeoff:**
- File watcher: Instant (<100ms latency), more complex
- Polling: 5-10s latency, simpler, no dependencies

**Recommendation:** Start with polling (simpler), upgrade to file-watch if latency matters

---

## Additional Sync Points

### 1. MCP Tool Integration

When `plan_next` is called via MCP, check if roadmap is stale:

```typescript
async planNext(input: PlanNextInput): Promise<Task[]> {
  // Check if roadmap.yaml is newer than last sync
  if (await this.isRoadmapStale()) {
    await syncRoadmapFile(this.stateMachine, this.workspaceRoot);
  }

  // ... existing plan_next logic ...
}

private async isRoadmapStale(): Promise<boolean> {
  const roadmapPath = path.join(this.workspaceRoot, 'state', 'roadmap.yaml');
  const stats = await fs.stat(roadmapPath);

  return stats.mtimeMs > this.lastRoadmapSyncMs;
}
```

### 2. Periodic Sync (Safety Net)

Even with file watching, sync periodically to catch edge cases:

```typescript
// In UnifiedOrchestrator.start()
this.periodicSyncInterval = setInterval(async () => {
  logDebug('Periodic roadmap sync');
  await syncRoadmapFile(this.stateMachine, this.config.workspaceRoot);
}, 60000); // Every 60 seconds
```

### 3. Agent-Triggered Sync

When agent completes task, sync to pick up any manual updates:

```typescript
async executeTask(task: Task): Promise<ExecutionResult> {
  // ... existing execution ...

  // After completion, sync roadmap
  if (result.success) {
    await syncRoadmapFile(this.stateMachine, this.config.workspaceRoot);
  }

  // ... rest of method ...
}
```

---

## Multi-Orchestrator Coordination

For true "world-class" setup, support multiple orchestrators running simultaneously:

### Database-Level Locking

```typescript
// In StateMachine
claimTask(taskId: string, agentId: string): boolean {
  const tx = this.db.transaction(() => {
    const task = this.getTask(taskId);

    if (task.status !== 'pending' || task.assigned_to) {
      return false; // Already claimed
    }

    this.db.prepare(`
      UPDATE tasks
      SET assigned_to = ?, status = 'in_progress', started_at = ?
      WHERE id = ? AND assigned_to IS NULL
    `).run(agentId, Date.now(), taskId);

    return this.db.changes > 0; // True if we got the lock
  });

  return tx();
}
```

### Heartbeat Protocol

Each orchestrator writes heartbeat to database:

```sql
CREATE TABLE orchestrator_instances (
  instance_id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  last_heartbeat INTEGER NOT NULL,
  agent_count INTEGER NOT NULL
);
```

Stale instances (no heartbeat >60s) have their tasks reclaimed.

---

## Performance Considerations

### 1. Incremental Sync (Don't Re-Parse Entire File)

```typescript
async syncRoadmapFile(stateMachine: StateMachine, workspaceRoot: string): Promise<void> {
  const roadmapPath = path.join(workspaceRoot, 'state', 'roadmap.yaml');

  // Compute hash of file content
  const content = await fs.readFile(roadmapPath, 'utf-8');
  const hash = createHash('sha256').update(content).digest('hex');

  // Check if we've already synced this version
  const lastHash = await stateMachine.getMetadata('roadmap_hash');
  if (lastHash === hash) {
    logDebug('Roadmap unchanged, skipping sync');
    return;
  }

  // Parse and sync
  const roadmap = yaml.parse(content);
  await syncRoadmapDocument(stateMachine, roadmap);

  // Store hash
  await stateMachine.setMetadata('roadmap_hash', hash);
}
```

### 2. Batch Database Writes

Instead of one transaction per task, batch updates:

```typescript
const tasks = extractTasks(roadmap);
stateMachine.db.transaction(() => {
  for (const task of tasks) {
    synchroniseTask(stateMachine, task, ...);
  }
})();
```

### 3. Debounce Rapid Changes

If roadmap.yaml is edited multiple times quickly, batch the syncs:

```typescript
// In RoadmapWatcher
this.debounceTimer = setTimeout(() => this.performSync(), 2000); // 2s debounce
```

---

## Migration Plan

### Phase 1: Add Polling (Week 1) ✅ Simple
1. Add `RoadmapPoller` class (50 LOC)
2. Integrate into `UnifiedOrchestrator.start()`
3. Test: Edit roadmap while autopilot running

### Phase 2: Add MCP Sync Check (Week 1) ✅ Quick Win
1. Add `isRoadmapStale()` to Session
2. Call in `planNext()` MCP handler
3. Test: Edit roadmap, call `plan_next` via MCP

### Phase 3: File Watcher (Week 2) ⚡ Lower Latency
1. Add `chokidar` dependency
2. Implement `RoadmapWatcher`
3. Replace poller with watcher

### Phase 4: Multi-Orchestrator (Week 3-4) 🚀 Advanced
1. Add database locking
2. Implement heartbeat protocol
3. Test with 2 orchestrators simultaneously

---

## Immediate Action (Today)

I'll implement Phase 1 (polling) right now since it's:
- Simple (no new dependencies)
- High impact (enables live discovery)
- Low risk (just periodic sync)

Let's do it!
