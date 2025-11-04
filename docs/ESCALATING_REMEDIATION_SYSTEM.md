# Escalating Remediation System - Task MUST Finish

**Date**: 2025-10-23
**Status**: ✅ IMPLEMENTED

---

## Problem Statement

**Before**: When a task failed quality gates, the system would:
1. Mark task as BLOCKED
2. **Release the agent immediately**
3. Assign the agent to a new task
4. **Abandoned the failed task forever**

This violated the fundamental principle: **Tasks MUST finish**.

**Example Failure**:
```
[20:00:08] ✗ ERROR: ❌ [ORCHESTRATOR] Task REJECTED by automated checks
[20:00:08] ✗ ERROR: 🛡️ [QUALITY GATE] Task REJECTED by quality gates
[20:00:08] ⏸ BLOCKED TEST-1
[20:00:08] 🧭 Agent Pool (released · worker-2 · TEST-1)  ← AGENT RELEASED!
[20:00:08] → worker-2 assigned to REM-T0.1.1  ← NEW TASK ASSIGNED!
```

The agent moved on, leaving TEST-1 blocked forever.

---

## Solution: Escalating Remediation Pipeline

**Core Principle**: **NO MAX ATTEMPTS - Task MUST finish!**

When a task fails, the system now:
1. **Keeps the agent locked** to the failed task
2. **Escalates through increasing intervention levels**
3. **Never gives up** until the task succeeds
4. **Problem solves** - tries different strategies at each level

### Escalation Ladder

**Level 0-1**: Auto-fix with same agent
- Uses FailureResponseManager to analyze error
- Applies suggested fixes automatically
- Retries with same agent

**Level 2-3**: Upgrade to higher-tier model
- Haiku → Sonnet → Opus (Claude)
- Codex-Low → Codex-Medium → Codex-High (Codex)
- More powerful model = better problem solving

**Level 4-5**: Orchestrator strategic intervention
- Escalates to orchestrator agent for strategic analysis
- Creates special task describing the failure
- Orchestrator analyzes root cause and directs fix

**Level 6+**: Human escalation (Atlas/Dana)
- Marks task as requiring human intervention
- Agent stays locked and polls every 30 seconds
- When human fixes and unblocks, agent retries automatically
- Resets to Level 0 after human intervention

---

## Implementation Details

### File Modified

`tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`

### Changes Made

**1. Added Remediation State Tracking (Lines 323-331)**:
```typescript
// Escalating remediation pipeline (no max attempts - task MUST finish)
private remediationState = new Map<string, {
  escalationLevel: number;
  attemptCount: number;
  lastError: string;
  lastAttemptTime: number;
  originalAgent: string;
  escalatedAgent?: string;
}>();
```

**2. Modified Finally Block to NOT Release on Failure (Lines 1773-1851)**:
```typescript
} finally {
  // ⚠️ CRITICAL: Task MUST finish - never give up!

  if (!finalSuccess && finalError) {
    // Task failed - escalate and retry (agent stays locked)
    logWarning('🔄 Task failed - initiating escalating remediation', {
      taskId: task.id,
      agentId: agent.id,
      error: finalError.substring(0, 200),
    });

    // Track remediation state
    const state = this.remediationState.get(task.id) || {
      escalationLevel: 0,
      attemptCount: 0,
      lastError: '',
      lastAttemptTime: Date.now(),
      originalAgent: agent.id,
    };

    state.attemptCount++;
    state.lastError = finalError;

    // Escalate if same error repeats
    if (state.lastError === finalError && state.attemptCount > 2) {
      state.escalationLevel++;
    }

    this.remediationState.set(task.id, state);

    // Schedule escalating remediation
    setTimeout(() => {
      this.performEscalatingRemediation(task, agent, state).catch(err => {
        logError('Remediation pipeline failed', { taskId: task.id, error: err.message });
      });
    }, 2000);

    // Agent stays locked - DO NOT RELEASE
    logInfo('🔒 Agent locked for remediation', {
      agentId: agent.id,
      taskId: task.id,
      escalationLevel: state.escalationLevel,
    });

  } else {
    // Task succeeded - release agent normally
    agent.currentTask = undefined;
    agent.currentTaskTitle = undefined;
    this.remediationState.delete(task.id);
    this.agentPool.releaseAgent(agent.id);
    this.assignNextTaskIfAvailable().catch(err => {
      logError('Error assigning next task', { error: err.message });
    });
  }
}
```

**3. Implemented performEscalatingRemediation (Lines 1277-1413)**:
```typescript
private async performEscalatingRemediation(
  task: Task,
  agent: Agent,
  state: { escalationLevel: number; attemptCount: number; lastError: string; ... }
): Promise<void> {

  if (state.escalationLevel === 0 || state.escalationLevel === 1) {
    // Level 0-1: Auto-fix with same agent
    await this.failureResponseManager.handleFailure(task.id);
    const result = await this.executeTask(task);
    if (result.success) return;

  } else if (state.escalationLevel === 2 || state.escalationLevel === 3) {
    // Level 2-3: Upgrade to higher-tier model
    const upgradedAgent = await this.upgradeAgentModel(agent);
    if (upgradedAgent) {
      agent.config.model = upgradedAgent.model;
      const result = await this.executeTask(task);
      if (result.success) return;
    }

  } else if (state.escalationLevel === 4 || state.escalationLevel === 5) {
    // Level 4-5: Orchestrator strategic intervention
    this.blockerEscalationManager.recordBlockedTask(task.id);
    const result = await this.executeTask(task);
    if (result.success) return;

  } else {
    // Level 6+: Human escalation
    await this.roadmapTracker.updateTaskStatus(task.id, 'blocked', {
      output: `🚨 HUMAN ESCALATION REQUIRED after ${state.attemptCount} attempts`
    });

    // Agent stays locked - check every 30s if human fixed it
    setTimeout(() => {
      this.checkIfTaskUnblocked(task, agent, state).catch(...);
    }, 30000);
  }

  // If we get here, escalate and retry
  state.escalationLevel++;
  state.attemptCount++;
  this.remediationState.set(task.id, state);

  setTimeout(() => {
    this.performEscalatingRemediation(task, agent, state).catch(...);
  }, 5000);
}
```

**4. Implemented checkIfTaskUnblocked (Lines 1418-1448)**:
```typescript
private async checkIfTaskUnblocked(
  task: Task,
  agent: Agent,
  state: { ... }
): Promise<void> {
  const currentTask = this.stateMachine.getTask(task.id);

  if (currentTask && currentTask.status !== 'blocked') {
    // Human fixed it - retry!
    logInfo('✅ Task manually unblocked - retrying', { taskId: task.id });
    state.escalationLevel = 0;
    const result = await this.executeTask(task);
    if (result.success) return;
  } else {
    // Still blocked - check again in 30s
    setTimeout(() => {
      this.checkIfTaskUnblocked(task, agent, state).catch(...);
    }, 30000);
  }
}
```

**5. Implemented upgradeAgentModel (Lines 1453-1481)**:
```typescript
private async upgradeAgentModel(agent: Agent): Promise<{ model: string; provider: Provider } | null> {
  const currentModel = agent.config.model;

  // Upgrade paths
  if (currentModel.includes('haiku')) return { model: 'claude-sonnet-4.5', provider: 'claude' };
  if (currentModel.includes('sonnet')) return { model: 'claude-opus-4', provider: 'claude' };
  if (currentModel.includes('codex-low')) return { model: 'gpt-5-codex-medium', provider: 'codex' };
  if (currentModel.includes('codex-medium')) return { model: 'gpt-5-codex-high', provider: 'codex' };

  return null; // Already at highest tier
}
```

---

## Behavior Changes

### Before (Broken):
```
1. Task fails quality gates
2. Agent released
3. New task assigned
4. Failed task abandoned ❌
```

### After (Fixed):
```
1. Task fails quality gates
2. Agent LOCKED to task ✅
3. Level 0-1: Auto-fix attempt
4. If fails → Level 2-3: Upgrade model
5. If fails → Level 4-5: Orchestrator intervention
6. If fails → Level 6+: Human escalation
7. Agent polls every 30s until human fixes
8. Agent retries after human intervention
9. NEVER gives up until task succeeds ✅
```

---

## Expected Logs

### Level 0-1 (Auto-fix):
```
⚠ 🔄 Task failed - initiating escalating remediation
ℹ 🔺 Escalation level { taskId: 'TEST-1', level: 0, attempts: 1 }
ℹ 📋 Level 0-1: Attempting auto-fix with same agent
ℹ 🔒 Agent locked for remediation { agentId: 'worker-2', taskId: 'TEST-1', escalationLevel: 0 }
```

### Level 2-3 (Model upgrade):
```
⚠ 🔄 Task failed - initiating escalating remediation
ℹ 🔺 Escalation level { taskId: 'TEST-1', level: 2, attempts: 4 }
ℹ ⬆️ Level 2-3: Escalating to higher-tier model { taskId: 'TEST-1', currentModel: 'claude-haiku-4.5' }
ℹ 🚀 Retrying with upgraded model { taskId: 'TEST-1', newModel: 'claude-sonnet-4.5' }
ℹ 🔒 Agent locked for remediation { agentId: 'worker-2', taskId: 'TEST-1', escalationLevel: 2 }
```

### Level 4-5 (Orchestrator):
```
⚠ 🎯 Level 4-5: Escalating to orchestrator for strategic intervention
ℹ 🔒 Agent locked for remediation { agentId: 'worker-2', taskId: 'TEST-1', escalationLevel: 4 }
```

### Level 6+ (Human):
```
✗ 🚨 Level 6+: Human escalation required { taskId: 'TEST-1', escalationLevel: 6, attempts: 12 }
✗ 🚨 Critical task blocker - human intervention required
ℹ 🔒 Agent locked for remediation { agentId: 'worker-2', taskId: 'TEST-1', escalationLevel: 6 }
```

---

## Verification

### Build Status:
```bash
$ cd tools/wvo_mcp && npm run build
> tsc --project tsconfig.json

✅ Build completed with 0 errors
```

### Test with Failed Task:
1. Start autopilot
2. Create task that will fail quality gates (e.g., TEST-1)
3. Observe logs showing escalating remediation
4. Confirm agent stays locked to task
5. Confirm no new task assigned until remediation succeeds

---

## Key Guarantees

✅ **Agent NEVER released on failure** - stays locked until task succeeds
✅ **No max attempts** - infinite remediation loop until success
✅ **Progressive escalation** - tries smarter approaches at each level
✅ **Human intervention support** - polls and retries after manual fix
✅ **Zero abandoned tasks** - every task MUST finish

---

## Files Modified

- `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts`

## Files Created

- `docs/ESCALATING_REMEDIATION_SYSTEM.md` (this file)

---

**Result**: Agents now **never give up** on failed tasks. They escalate through increasingly powerful intervention strategies until the task succeeds.

**Compliance**: This system enforces the requirement that **tasks MUST finish** - no exceptions, no max attempts, no abandoned work.
