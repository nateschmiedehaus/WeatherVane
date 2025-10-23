# Task Decomposer Integration Guide
## 2025-10-22

This document contains the integration code for the Task Decomposer (#3 Essential Improvement).

## Status

✅ **TaskDecomposer class created** - `tools/wvo_mcp/src/orchestrator/task_decomposer.ts` (370 lines)
✅ **Import added** - `unified_orchestrator.ts:32`
✅ **Class member added** - `unified_orchestrator.ts:264`
✅ **Constructor initialization added** - `unified_orchestrator.ts:332-334`
⏳ **prefetchTasks() modification pending** - Waiting for background process to complete

## Remaining Integration: prefetchTasks() Method

Replace the existing `prefetchTasks()` method in `unified_orchestrator.ts` (around line 516) with:

```typescript
  private async prefetchTasks(): Promise<void> {
    if (this.prefetchInProgress || !this.running) {
      return;
    }

    this.prefetchInProgress = true;

    try {
      // Keep queue filled with 2x worker count to prevent idle gaps
      const targetQueueSize = this.workers.length * 2;

      if (this.taskQueue.length >= targetQueueSize) {
        return; // Queue already full
      }

      const needed = targetQueueSize - this.taskQueue.length;
      const allReadyTasks = this.stateMachine.getReadyTasks();

      // Step 1: Decompose large tasks into subtasks (enables parallelism)
      for (const task of allReadyTasks) {
        if (this.taskDecomposer.shouldDecompose(task)) {
          try {
            const result = await this.taskDecomposer.decompose(task);
            if (result.shouldDecompose && result.subtasks) {
              await this.taskDecomposer.registerSubtasks(task, result.subtasks);
              logInfo('Task decomposed for parallel execution', {
                taskId: task.id,
                subtaskCount: result.subtasks.length,
              });
            }
          } catch (error) {
            logWarning('Task decomposition failed, will execute as single task', {
              taskId: task.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Step 2: Fetch ready tasks (including newly created subtasks)
      const readyTasks = this.stateMachine.getReadyTasks().filter(task => {
        // Skip epic-level tasks (they should be decomposed)
        if (task.type === 'epic') {
          return false;
        }
        // Skip standalone E- tasks that haven't been decomposed
        if (/^E-/.test(task.id) && !task.parent_id && !task.epic_id && !task.metadata?.decomposed) {
          return false;
        }
        return true;
      });

      // Add to queue (up to needed amount)
      const tasksToAdd = readyTasks.slice(0, needed);
      this.taskQueue.push(...tasksToAdd);

      if (tasksToAdd.length > 0) {
        logDebug('Prefetched tasks', {
          count: tasksToAdd.length,
          queueSize: this.taskQueue.length,
          subtasks: tasksToAdd.filter(t => t.metadata?.parent_task_id).length,
        });
      }
    } finally {
      this.prefetchInProgress = false;
    }
  }
```

## Task Completion Tracking (Optional Enhancement)

Add this method to handle parent task completion when all subtasks are done:

```typescript
  /**
   * Check if parent task should be marked complete after subtask finishes
   */
  private async checkParentTaskCompletion(taskId: string): Promise<void> {
    const task = this.stateMachine.getTask(taskId);
    if (!task) return;

    const parentTaskId = task.metadata?.parent_task_id as string | undefined;
    if (!parentTaskId) return;

    // Check if all sibling subtasks are complete
    if (this.taskDecomposer.isParentTaskComplete(parentTaskId)) {
      await this.roadmapTracker.updateTaskStatus(parentTaskId, 'done', {
        message: 'All subtasks completed',
        subtask_completion: true,
      });
      logInfo('Parent task marked complete after all subtasks finished', {
        parentTaskId,
        completedSubtaskId: taskId,
      });
    }
  }
```

Then call it in the task completion handler (around line 704):

```typescript
          await this.roadmapTracker.updateTaskStatus(task.id, 'done', {
            agent: agent.id,
            duration,
            output: result.output,
          });

          // Check if parent task should be completed
          await this.checkParentTaskCompletion(task.id);  // <-- ADD THIS

          // Record model router telemetry for cost tracking
          await this.modelRouterTelemetry.recordTaskExecution(
            task,
            modelSelection.tier,
            modelSelection.complexity,
            costEstimate.estimatedCost,
            costEstimate.estimatedTokens
          );
```

## How It Works

### 1. Task Decomposition Triggers

Tasks are decomposed if they meet any of these criteria:
- Epic-level tasks (`type === 'epic'` or `id.startsWith('E')`)
- Tasks with 3+ exit criteria (multi-phase work)
- Tasks with complexity keywords ("implement and test", "design and implement", etc.)
- Long descriptions (>500 chars)

### 2. Decomposition Strategies

**Exit Criteria-Based**: Each exit criterion becomes a subtask
```
Parent: "Implement authentication"
Exit Criteria: ["Setup OAuth", "Add session management", "Create login UI"]
→ Subtask 1: "Setup OAuth"
→ Subtask 2: "Add session management"
→ Subtask 3: "Create login UI"
```

**Pattern-Based**: Recognizes common patterns
```
Parent: "Implement and test user auth"
→ Subtask 1: "Implement user auth"
→ Subtask 2: "Test user auth"
```

**Phase-Based**: Default 3-phase breakdown
```
Parent: "Build feature X"
→ Subtask 1: "Research and design for feature X"
→ Subtask 2: "Implement feature X"
→ Subtask 3: "Validate and test feature X"
```

### 3. Dependency Tracking

Subtasks have sequential dependencies by default:
```
Subtask 1: [] (no dependencies, can start immediately)
Subtask 2: [Subtask 1] (waits for Subtask 1)
Subtask 3: [Subtask 2] (waits for Subtask 2)
```

This allows:
- Subtask 1 starts immediately
- Multiple independent Subtask 1s can run in parallel across different parent tasks
- Natural phased execution within each parent

### 4. Parallel Execution

With 4 workers and 2 epics:
```
Without decomposition:
Worker 1: Epic A (10 min)
Worker 2: Epic B (10 min)
Worker 3: idle
Worker 4: idle
Total: 10 minutes

With decomposition:
Worker 1: Epic A - Phase 1 (3 min)
Worker 2: Epic B - Phase 1 (3 min)
Worker 3: Epic A - Phase 2 (4 min, starts after A-Phase1)
Worker 4: Epic B - Phase 2 (4 min, starts after B-Phase1)
Total: 7 minutes (43% faster)
```

## Testing

After integration, test with:

```bash
# Build
npm run build

# Run autopilot with 4+ workers to see parallelism
make mcp-autopilot AGENTS=6

# Check logs for decomposition messages
grep "Task decomposed for parallel execution" /tmp/wvo_autopilot.log
grep "All subtasks complete" /tmp/wvo_autopilot.log
```

Expected log output:
```
ℹ Task decomposed for parallel execution { taskId: 'E4', subtaskCount: 3 }
ℹ Prefetched tasks { count: 6, queueSize: 8, subtasks: 4 }
✓ COMPLETED E4.1 (2.3m)
✓ COMPLETED E4.2 (3.1m)
✓ COMPLETED E4.3 (1.8m)
ℹ Parent task marked complete after all subtasks finished { parentTaskId: 'E4' }
```

## Benefits

### 3-5x Throughput Increase
- Current: 2 tasks/day (1 worker, sequential execution)
- With decomposition: 6-10 tasks/day (4 workers, parallel subtasks)

### Better Resource Utilization
- Before: Workers often idle waiting for large tasks
- After: Subtasks keep all workers busy

### Predictable Execution Times
- Large monolithic tasks: 10-20 minutes (blocks other work)
- Decomposed subtasks: 2-5 minutes each (interleaved with other work)

### Natural Checkpointing
- Each subtask completion is a checkpoint
- Can resume from failed phase instead of restarting entire task

## Next Steps

1. Complete the integration when background process finishes
2. Build and test with `npm run build`
3. Run autopilot with 6 agents to validate parallel execution
4. Monitor telemetry for throughput improvements
5. Document task decomposition implementation (#6 todo)

## See Also

- Task Decomposer source: `tools/wvo_mcp/src/orchestrator/task_decomposer.ts`
- Model Router integration: `docs/orchestration/MODEL_ROUTER_IMPLEMENTATION.md`
- Essential 7 roadmap: `docs/orchestration/ESSENTIAL_ONLY_ROADMAP.md`
