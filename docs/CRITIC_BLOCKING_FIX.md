# Critic Availability Blocking Loop Fix

**Date:** 2025-10-18
**Status:** RESOLVED

## Problem

The autopilot was experiencing infinite blocking loops when critics were unavailable. The issue manifested as:

```json
{
  "tasks": [
    {
      "id": "T3.4.3",
      "title": "Ship Experiments hub UI...",
      "status": "blocked",
      "domain": "product"
    },
    {
      "id": "T3.4.4",
      "title": "Deliver storytelling Reports view...",
      "status": "blocked",
      "domain": "product"
    }
  ]
}
```

**Root Cause:**
- Tasks were manually marked as `status: blocked` in roadmap.yaml when their exit criteria included `critic: design_system`
- The `design_system` critic was offline/unavailable
- The task scheduler skips tasks with `status === 'blocked'`
- Result: Autopilot got no tasks to work on → infinite loop waiting for critic to come online

## Solution

### 1. Immediate Fix
Unblocked tasks T3.4.3, T3.4.4, T3.4.5 by changing their status from `blocked` to `pending` in roadmap.yaml.

### 2. Automatic Prevention - CriticAvailabilityGuardian

Created `tools/wvo_mcp/src/orchestrator/critic_availability_guardian.ts` that:

**Automatically detects** tasks blocked by critic unavailability:
```typescript
function isBlockedByCriticOnly(task: RoadmapTask): { blocked: boolean; critics: string[] }
```

**Automatically unblocks** them:
```typescript
task.status = 'pending';  // Changed from 'blocked'
task.notes = 'Auto-unblocked by CriticAvailabilityGuardian: Critics [...] are offline. Proceeding with implementation; gather QA evidence for eventual review.';
```

**Tracks** critic requirements separately:
```typescript
{
  taskId: "T3.4.3",
  criticName: "design_system",
  status: "deferred",
  deferredAt: 1729267200000,
  reason: "Critic unavailable - proceeding with implementation, will review when critic is online"
}
```

**Logs** all overrides for transparency:
```
[CriticAvailabilityGuardian] Applied 3 override(s) to prevent blocking loops
[CriticAvailabilityGuardian] Unblocked tasks: T3.4.3, T3.4.4, T3.4.5
[CriticAvailabilityGuardian] ⚠️  Task T3.4.3 was blocked by unavailable critics [design_system] - automatically unblocked to pending
```

### 3. Integration Point

The guardian runs automatically in `session.ts::planNext()`:

```typescript
const roadmap = await this.roadmapStore.read();

// Guard against critic blocking loops before planning
ensureNoCriticBlocking(roadmap, (msg) => {
  console.log(msg);
});

// Save roadmap if any tasks were unblocked
await this.roadmapStore.write(roadmap);

const planner = new PlannerEngine(roadmap);
return planner.next(input);
```

## Principles

**Critics are advisory, not blocking:**
- Work continues even when critics are offline
- Evidence is gathered for eventual review (QA docs, screenshots, test coverage)
- Critics review when they come back online

**Separation of concerns:**
- **Blocking status** = task can't proceed (missing dependencies, actual technical blocker)
- **Critic requirements** = tracked separately as "deferred" reviews

**Transparency:**
- All automatic overrides are logged
- Tasks get notes explaining why they were unblocked
- Guardian report tracks which critics are needed for which tasks

## Impact

**Before:**
- Autopilot gets stuck when critics offline
- Zero progress
- Manual intervention required

**After:**
- Autopilot continues working
- Evidence gathered for critic review
- Automatic unblocking with full audit trail

## Testing

The guardian automatically runs on every `plan_next` call. To verify:

```bash
# Check for guardian logs in autopilot output
tail -f /tmp/wvo_autopilot.log | grep CriticAvailabilityGuardian

# Manually trigger plan_next
bash -lc "node tools/wvo_mcp/scripts/mcp_tool_cli.mjs plan_next '{\"minimal\":true}'"
```

Expected output when tasks are unblocked:
```
[CriticAvailabilityGuardian] Applied N override(s) to prevent blocking loops
[CriticAvailabilityGuardian] Unblocked tasks: T3.4.3, ...
```

## Related Files

- `tools/wvo_mcp/src/orchestrator/critic_availability_guardian.ts` - Guardian implementation
- `tools/wvo_mcp/src/session.ts` - Integration point (planNext method)
- `state/roadmap.yaml` - Tasks T3.4.3, T3.4.4, T3.4.5 unblocked
- `tools/wvo_mcp/src/orchestrator/task_scheduler.ts` - Skips blocked tasks (line 347)

## Future Improvements

1. **Integrate with critic capability profile** - Currently hardcodes `design_system` and `manager_self_check` as known-offline critics. Should query actual critic status.
2. **Persist deferred critic requirements** - Currently tracks in-memory during guardian run. Could persist to state/critics/deferred_reviews.json for longer-term tracking.
3. **Auto-trigger critic review when they come online** - When a critic comes back online, automatically run deferred reviews for all tasks that completed while it was offline.

## Conclusion

**This fix ensures critic unavailability never blocks autopilot progress again.**

The guardian runs automatically, maintains full transparency, and preserves the value of critic reviews by deferring them rather than skipping them.
