# Self-Improvement Integration Guide

## Overview
The `SelfImprovementManager` enables the orchestrator to safely improve itself and automatically transition from meta-work to product-work.

## Integration Points

### 1. Add to ClaudeCodeCoordinator Constructor

```typescript
// tools/wvo_mcp/src/orchestrator/claude_code_coordinator.ts

import { SelfImprovementManager } from './self_improvement_manager.js';

export class ClaudeCodeCoordinator extends EventEmitter {
  private readonly selfImprovementManager?: SelfImprovementManager;

  constructor(
    // ... existing parameters
    selfImprovementManager?: SelfImprovementManager
  ) {
    super();
    this.selfImprovementManager = selfImprovementManager;
    // ... existing initialization
  }
}
```

### 2. Hook Self-Modification Detection After Task Completion

Add after line 422 in `handleCompletion`:

```typescript
// After line 422: logInfo('Task completed', { taskId: task.id, agent: agent.id, status: 'done' });

// Check for self-modification and trigger restart if needed
if (this.selfImprovementManager && finalStatus === 'done') {
  const selfModified = await this.selfImprovementManager.checkForSelfModification(task);

  if (selfModified) {
    // Only restart if all critics passed (safe to apply changes)
    const safeToRestart = !criticOutcome || criticOutcome.passed;

    if (safeToRestart) {
      logInfo('Orchestrator self-modification detected, preparing restart', {
        taskId: task.id,
        taskTitle: task.title,
      });

      // Schedule restart after current execution completes
      queueMicrotask(async () => {
        const restarted = await this.selfImprovementManager!.executeRestart(
          task.id,
          `Self-modification: ${task.title}`
        );

        if (restarted) {
          // Note: This process will be replaced by the restart
          // New process will resume from SQLite state
          logInfo('Restart successful, new process will take over');
        }
      });
    } else {
      logWarning('Self-modification detected but critics failed, skipping restart', {
        taskId: task.id,
        failedCritics: criticOutcome?.failedCritics,
      });
    }
  }
}
```

### 3. Add Phase Completion Checks to Dispatch Loop

Add at the start of `dispatchWork`:

```typescript
// tools/wvo_mcp/src/orchestrator/claude_code_coordinator.ts
// In dispatchWork method, after line 177:

private async dispatchWork(): Promise<void> {
  if (!this.running) return;

  // Check if MCP infrastructure phases are complete
  if (this.selfImprovementManager) {
    const metaComplete = await this.selfImprovementManager.checkPhaseCompletion();

    if (metaComplete) {
      // Log transition once
      this.emit('meta-work:complete');
    }
  }

  // ... rest of existing dispatch logic
}
```

### 4. Initialize in OrchestratorRuntime

```typescript
// tools/wvo_mcp/src/orchestrator/orchestrator_runtime.ts

import { SelfImprovementManager } from './self_improvement_manager.js';

export class OrchestratorRuntime {
  private selfImprovementManager: SelfImprovementManager;

  constructor(workspaceRoot: string, options: OrchestratorOptions = {}) {
    // ... existing initialization

    this.selfImprovementManager = new SelfImprovementManager(
      this.stateMachine,
      {
        workspaceRoot,
        enableAutoRestart: options.enableAutoRestart ?? true,
        maxRestartsPerWindow: 3,
        restartWindowMinutes: 10,
        restartScriptPath: './scripts/restart_mcp.sh',
      }
    );

    // Pass to coordinator
    this.coordinator = new ClaudeCodeCoordinator(
      workspaceRoot,
      this.stateMachine,
      this.scheduler,
      this.agentPool,
      this.contextAssembler,
      this.qualityMonitor,
      this.webInspirationManager,
      this.operationsManager,
      this.observer,
      this.selfImprovementManager  // Add here
    );

    // Listen to self-improvement events
    this.selfImprovementManager.on('restart:success', (data) => {
      logInfo('Self-improvement restart successful', data);
    });

    this.selfImprovementManager.on('restart:failed', (data) => {
      logError('Self-improvement restart failed', data);
    });

    this.selfImprovementManager.on('meta-work:complete', (data) => {
      logInfo('🎉 MCP infrastructure complete, transitioning to product work', data);
    });

    this.selfImprovementManager.on('product-work:unblocked', (data) => {
      logInfo('Product work tasks unblocked', data);
    });
  }

  getImprovementStatus() {
    return this.selfImprovementManager.getStatus();
  }
}
```

### 5. Add MCP Tool for Status Visibility

```typescript
// tools/wvo_mcp/src/index-orchestrator.ts (or similar)

// Add new tool definition:
{
  name: 'self_improvement_status',
  description: 'Get status of orchestrator self-improvement and phase completion',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
}

// Add handler:
case 'self_improvement_status': {
  const status = this.runtime.getImprovementStatus();
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(status, null, 2),
    }],
  };
}
```

## How It Works

### Self-Modification Detection Flow

```
1. Agent completes task T1.2 (modify agent_pool.ts)
   ↓
2. Critics run (build, tests, manager_self_check)
   ↓ ✅ All pass
3. Task marked 'done'
   ↓
4. SelfImprovementManager.checkForSelfModification(T1.2)
   ↓ Detects: tools/wvo_mcp/src/orchestrator/agent_pool.ts
5. SelfImprovementManager.executeRestart()
   ├─ Creates checkpoint (rollback point)
   ├─ Verifies build passes
   ├─ Checks restart loop protection (max 3 in 10min)
   ├─ Runs ./scripts/restart_mcp.sh
   │  ├─ npm run build
   │  ├─ Kill old processes
   │  └─ Start new processes
   └─ Records successful restart
   ↓
6. New process loads from SQLite state
   ↓
7. Continues with next tasks using improved code ✅
```

### Phase Completion Flow

```
1. Every 60 seconds during dispatch
   ↓
2. SelfImprovementManager.checkPhaseCompletion()
   ↓
3. Checks status of:
   ├─ PHASE-1-HARDENING
   ├─ PHASE-2-COMPACT
   └─ PHASE-3-BATCH
   ↓
4. If all tasks in phases are 'done':
   ├─ Mark metaWorkComplete = true
   ├─ Find all tasks blocked by these phases
   ├─ Remove phase dependencies
   ├─ Transition blocked tasks to 'pending'
   └─ Emit 'product-work:unblocked' event
   ↓
5. Scheduler now includes product work tasks ✅
   ↓
6. Agents start working on WeatherVane features
```

## Safety Mechanisms

### 1. Restart Loop Protection
- Max 3 restarts per 10-minute window
- If exceeded: automatic rollback to last good checkpoint
- Prevents infinite restart cycles

### 2. Build Verification
- Runs `npm run build` before restart
- If build fails: abort restart, keep current process
- Ensures new code compiles before switching

### 3. Checkpoint Rollback
- Checkpoint created before every restart
- On restart failure: automatic rollback to checkpoint
- SQLite state restored to pre-restart state

### 4. Critic Enforcement
- Restart only triggered if critics pass
- Failed critics = skip restart, mark needs_improvement
- Ensures quality before applying self-modifications

### 5. File Modification Detection
Multiple strategies to detect changed files:
- Task metadata: `files_modified` array
- Event log parsing: recent task events
- Pattern matching: extracts file paths from notes

## Configuration Options

```typescript
interface SelfImprovementConfig {
  // Enable/disable automatic restart (default: true)
  enableAutoRestart: boolean;

  // Max restarts in time window (default: 3)
  maxRestartsPerWindow: number;

  // Time window for restart limit (default: 10 minutes)
  restartWindowMinutes: number;

  // Path to restart script (default: ./scripts/restart_mcp.sh)
  restartScriptPath: string;

  // Workspace root directory
  workspaceRoot: string;
}
```

## Testing the Integration

### Manual Test: Self-Modification
```bash
# 1. Start orchestrator
make mcp-autopilot

# 2. Assign self-modification task
# Via MCP: plan_update(task_id='T1.2', status='in_progress')

# 3. Agent modifies tools/wvo_mcp/src/orchestrator/agent_pool.ts

# 4. Critics run and pass

# 5. Task marked done

# 6. Watch logs for:
# "Orchestrator self-modification detected, preparing restart"
# "Executing orchestrator restart"
# "Build verification passed"
# "Orchestrator restart completed successfully"

# 7. Verify new process is using updated code
```

### Manual Test: Phase Completion
```bash
# 1. Check current phases
# Via MCP: self_improvement_status()

# 2. Complete PHASE-1-HARDENING tasks
# Mark all subtasks as 'done'

# 3. Complete PHASE-2-COMPACT tasks

# 4. Complete PHASE-3-BATCH tasks

# 5. Wait for next dispatch cycle (checks every 60s)

# 6. Watch logs for:
# "🎉 MCP infrastructure phases complete! Transitioning to product work."
# "Unblocked X product work tasks"

# 7. Verify product tasks now appear in schedule
# Via MCP: plan_next(minimal=true)
```

## Troubleshooting

### Restart Loop Detected
```
ERROR: Restart loop detected, aborting restart and rolling back
```
**Solution**: Self-modification introduced a bug. System automatically rolls back. Review failed task logs, fix issue manually.

### Build Verification Failed
```
ERROR: Build verification failed: [error details]
```
**Solution**: Code doesn't compile. Task stays at 'done' but restart skipped. Fix build errors manually, then trigger restart via `./scripts/restart_mcp.sh`.

### Phase Not Completing
```
Phases checked but meta-work still not complete
```
**Solution**:
1. Check task statuses: all phase tasks must be 'done' or 'archived'
2. Verify task hierarchy: phase tasks have correct parent/dependencies
3. Check logs for phase detection warnings

### No Restart After Self-Modification
```
Task completed but no restart triggered
```
**Possible causes**:
1. Critics failed (check `criticsFailed` in logs)
2. File modification not detected (add `files_modified` to task metadata)
3. Auto-restart disabled (`enableAutoRestart: false`)
4. Restart loop protection triggered (check restart history)

## Benefits

### Before Self-Improvement Integration
```
Day 1: Agent improves orchestrator ✅
Day 1: Task marked done ✅
Day 1: Human manually restarts MCP ⏳
Day 1: Benefits available ✅

Result: Manual intervention required
```

### After Self-Improvement Integration
```
Day 1: Agent improves orchestrator ✅
Day 1: Task marked done ✅
Day 1: Auto-restart triggered ✅
Day 1: Benefits available immediately ✅

Day 2: PHASE-1 complete ✅
Day 2: PHASE-2 complete ✅
Day 2: PHASE-3 complete ✅
Day 2: Product work auto-unblocked ✅
Day 2: WeatherVane features begin ✅

Result: Fully autonomous transition from meta → product
```

## Summary

The Self-Improvement Integration enables:
- ✅ **Safe self-modification** - Can improve its own code without breaking
- ✅ **Automatic restarts** - Applies improvements immediately
- ✅ **Rollback protection** - Reverts on failure
- ✅ **Phase tracking** - Knows when meta-work is done
- ✅ **Auto-transition** - Moves from infrastructure to product automatically
- ✅ **Zero intervention** - Fully autonomous improvement cycle

The system can now evolve itself safely and know when to stop improving the tooling and start building the actual product.
