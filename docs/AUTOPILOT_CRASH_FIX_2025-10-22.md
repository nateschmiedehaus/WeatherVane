# Autopilot Crash Fix - 2025-10-22

## Problem Summary

The autopilot was causing system crashes due to a **runaway task decomposition loop**. The task decomposer was recursively breaking down tasks into subtasks indefinitely, exhausting system resources (CPU, memory) and causing the computer to freeze/crash.

### Symptoms

- Hundreds of "Task decomposed" messages flooding the console
- System becoming unresponsive
- High CPU and memory usage
- Computer crashes requiring hard restart
- Zero useful telemetry - couldn't see what agents were actually doing

### Root Cause

The task decomposition system had **no safeguards** against infinite recursion:

1. **No depth limit**: Subtasks could be decomposed again if they matched decomposition criteria
2. **Race condition**: Tasks could be decomposed multiple times before the `decomposed` flag was set
3. **No session limit**: No cap on total decompositions per session
4. **No circuit breaker**: The orchestrator kept trying to decompose tasks in a tight loop

## Fixes Applied

### 1. TaskDecomposer Safeguards (tools/wvo_mcp/src/orchestrator/task_decomposer.ts)

#### A. Session-Wide Decomposition Limit
```typescript
private decompositionCount = 0;
private readonly MAX_DECOMPOSITIONS_PER_SESSION = 50;
```
- Tracks total decompositions per session
- Hard stop at 50 decompositions to prevent runaway loops

#### B. Maximum Nesting Depth
```typescript
private readonly MAX_DECOMPOSITION_DEPTH = 2;

private getDecompositionDepth(task: Task): number {
  // Counts dots in task ID (e.g., T1.1.1 has depth 2)
  // Also checks parent_task_id chain
  // Max depth of 2 levels prevents infinite nesting
}
```
- Prevents tasks from being decomposed more than 2 levels deep
- Checks both task ID format and parent chain

#### C. Early Decomposition Marking
```typescript
// CRITICAL: Mark as decomposed IMMEDIATELY
await this.stateMachine.transition(task.id, task.status, {
  ...task.metadata,
  decomposed: true,
  decomposition_started_at: new Date().toISOString(),
});
```
- Marks task as decomposed BEFORE starting decomposition
- Prevents race condition where same task is decomposed multiple times

### 2. Orchestrator Circuit Breaker (tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts)

#### A. Per-Minute Rate Limiting
```typescript
private decompositionAttempts = 0;
private lastDecompositionReset = Date.now();
private readonly MAX_DECOMPOSITION_ATTEMPTS_PER_MINUTE = 100;
```

#### B. Circuit Breaker in Prefetch Loop
```typescript
// Circuit breaker check
if (this.decompositionAttempts >= this.MAX_DECOMPOSITION_ATTEMPTS_PER_MINUTE) {
  logError('Decomposition circuit breaker triggered');
  break; // Stop decomposing tasks
}
```
- Stops decomposition attempts if rate exceeds 100/minute
- Logs error with full context for debugging
- Automatically resets counter every minute

### 3. Enhanced Telemetry

#### A. Detailed Decomposition Logging
- Every decomposition attempt now logs:
  - Task ID being decomposed
  - Attempt number
  - Total ready tasks
  - Subtask count created
  - Running total of decompositions

#### B. Circuit Breaker Alerts
- Clear error messages when limits are hit
- Time since last reset tracked
- Total attempts logged for analysis

### 4. Real-Time Monitoring Script

Created `scripts/monitor_autopilot.sh` for live visibility:

**Features:**
- Decomposition health check (shows rate and circuit breaker status)
- Active task counts (pending, in_progress, blocked, done)
- Agent activity feed (last 10 actions)
- System resource usage (CPU, memory, process count)
- Error and warning counts with recent log excerpts
- Emergency stop (Ctrl+C kills all processes)

**Usage:**
```bash
bash scripts/monitor_autopilot.sh
```

The monitor refreshes every 5 seconds and provides a dashboard view of:
- ✅ Healthy decomposition rates
- ⚠️ Warning when decomposition rate is high
- 🚨 Alert when circuit breaker triggers
- Real-time agent actions
- Resource consumption
- Error tracking

## Prevention Measures

### Before Running Autopilot

1. **Start the monitor first:**
   ```bash
   bash scripts/monitor_autopilot.sh
   ```
   This gives you real-time visibility and an emergency stop button.

2. **Check system resources:**
   - Ensure you have sufficient free memory (2GB+ recommended)
   - Close unnecessary applications
   - Monitor CPU usage baseline

3. **Review roadmap complexity:**
   - Check how many tasks will be decomposed
   - Consider manually breaking down very large epics first

### During Autopilot Operation

1. **Watch decomposition rate:**
   - Normal: <20 decompositions per minute
   - Warning: 20-50 decompositions per minute
   - Critical: >50 decompositions per minute (circuit breaker triggers)

2. **Monitor process count:**
   - Normal: 3-6 processes
   - Warning: 7-10 processes
   - Critical: >10 processes (possible runaway)

3. **Emergency stop if needed:**
   - Press Ctrl+C in the monitor terminal
   - This kills all autopilot and worker processes
   - System returns to safe state

### After Issues

1. **Check logs:**
   ```bash
   grep "circuit breaker" /tmp/wvo_autopilot.log
   grep "Max decomposition" /tmp/wvo_autopilot.log
   ```

2. **Analyze telemetry:**
   ```bash
   cat state/telemetry/usage.jsonl | tail -100
   ```

3. **Review roadmap state:**
   ```bash
   grep -A2 "decomposed: true" state/roadmap.yaml
   ```

## Configuration Limits

You can adjust these limits in the code if needed:

| Limit | Location | Default | Purpose |
|-------|----------|---------|---------|
| MAX_DECOMPOSITIONS_PER_SESSION | task_decomposer.ts:40 | 50 | Total decompositions allowed per session |
| MAX_DECOMPOSITION_DEPTH | task_decomposer.ts:41 | 2 | Maximum nesting depth for subtasks |
| MAX_DECOMPOSITION_ATTEMPTS_PER_MINUTE | unified_orchestrator.ts:300 | 100 | Rate limit for decomposition attempts |

**Warning:** Increasing these limits may lead to resource exhaustion. Only adjust if you understand the implications.

## Testing the Fix

To verify the fix is working:

1. **Build the changes:**
   ```bash
   npm run build
   ```

2. **Start the monitor:**
   ```bash
   bash scripts/monitor_autopilot.sh
   ```

3. **Run autopilot with a small task:**
   ```bash
   # In another terminal
   WVO_AUTOPILOT_ONCE=1 AGENTS=1 make autopilot
   ```

4. **Verify in monitor:**
   - Decomposition rate stays under 50/minute
   - No circuit breaker triggers
   - Process count stays reasonable
   - System resources stable

## Rollback Plan

If you need to revert these changes:

```bash
# Rollback decomposer changes
git checkout HEAD -- tools/wvo_mcp/src/orchestrator/task_decomposer.ts

# Rollback orchestrator changes
git checkout HEAD -- tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts

# Rebuild
npm run build
```

However, **this will remove all crash prevention safeguards** and may cause the original issue to recur.

## Future Improvements

1. **Adaptive rate limiting**: Adjust decomposition rate based on system resources
2. **Decomposition analytics**: Track which tasks cause most decompositions
3. **Smart depth limits**: Allow deeper nesting for specific task types
4. **Resource quotas**: Per-agent memory and CPU limits
5. **Graceful degradation**: Slow down instead of hard stop when approaching limits

## Related Issues

- TypeScript compilation errors in `otel_spans.ts` and `resource_budgets.ts` (fixed)
- Missing telemetry visibility (addressed with monitor script)
- No emergency stop mechanism (added to monitor)

## Validation Status

- [x] TypeScript compiles without errors
- [x] Decomposition limits enforced
- [x] Circuit breaker triggers correctly
- [x] Monitor script provides real-time visibility
- [x] Emergency stop works
- [ ] End-to-end autopilot test (needs user verification)

## Contact

If you encounter issues with these fixes:
1. Check the monitor output for specific errors
2. Review logs at `/tmp/wvo_autopilot.log`
3. Use emergency stop (Ctrl+C in monitor) if system becomes unstable
4. Document the issue with monitor screenshots and log excerpts
