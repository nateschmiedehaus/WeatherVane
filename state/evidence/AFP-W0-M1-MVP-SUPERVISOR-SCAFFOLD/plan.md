# PLAN - MVP Supervisor Scaffold

**Task:** AFP-W0-M1-MVP-SUPERVISOR-SCAFFOLD
**Date:** 2025-11-05

---

## Via Negativa - What Can We DELETE?

### Examined for Deletion
1. **Existing orchestrator code** - Can we delete unified_orchestrator.ts?
   - **Decision**: NO - Keep orchestrator for tactical concerns (WIP, scheduling, agent pool)
   - **Reason**: Clean separation of concerns (supervisor = strategic, orchestrator = tactical)

2. **Policy controller** - Can we delete policy_controller.ts?
   - **Decision**: NO - Keep policy controller (Python integration for policy state)
   - **Reason**: Different concern (policy state management vs task orchestration)

3. **Agent coordinator** - Can we delete agent_coordinator.ts?
   - **Decision**: NO - Keep coordinator (agent execution, context assembly, quality monitoring)
   - **Reason**: Operational layer (below orchestrator), not redundant with supervisor

### Complexity We're NOT Adding
1. ❌ **Distributed locks** - In-memory stubs sufficient for MVP
2. ❌ **Lease persistence** - Not needed for single-process MVP
3. ❌ **Business impact scoring** - Simple priority order sufficient for MVP
4. ❌ **7-lens evaluation** - Future enhancement, not blocking downstream work
5. ❌ **Readiness assessment** - Future enhancement, not in MVP scope

**Result**: No existing code deleted. Adding minimal new code (~180 LOC) to fill architectural gap.

---

## Refactor vs Repair Analysis

### Are we patching a symptom or fixing root cause?

**Symptom**: No lease management, duplicate task execution possible, lack of strategic/tactical separation

**Root Cause**: Supervisor layer was stripped/mixed into orchestrator during refactoring

**This is a REFACTOR** (not a patch):
- ✅ Restores architectural layer that was lost
- ✅ Separates strategic (supervisor) from tactical (orchestrator) concerns
- ✅ Introduces clean interfaces between layers
- ✅ Enables future enhancements (distributed locks, business scoring) without refactoring

**Evidence this is proper fix**:
- Task title: "Restore the stripped supervisor skeleton" (explicit acknowledgment of missing layer)
- Exit criteria: "reinstated" (implies it existed before and needs restoration)
- Roadmap dependencies: Multiple tasks blocked on this (AFP-W0-M1-MVP-AGENTS-SCAFFOLD, AFP-W0-M1-MVP-LIBS-SCAFFOLD)

**Not a patch because**:
- ❌ NOT working around a problem (adding lease checks in orchestrator would be a patch)
- ❌ NOT quick fix (creating proper architectural layer with clean interfaces)
- ❌ NOT adding technical debt (actually paying down debt by restoring separation)

---

## Architecture Design

### Module Structure

```
autopilot_mvp/
└── supervisor/
    ├── types.ts                    # ~30 LOC - Type definitions
    ├── lease_manager.ts            # ~60 LOC - In-memory lease stubs
    ├── lifecycle_telemetry.ts      # ~40 LOC - JSONL event emission
    ├── supervisor.ts               # ~80 LOC - Main supervisor loop
    └── __tests__/
        └── supervisor_integration.test.ts  # ~150 LOC - Smoke test
```

**Total**: ~360 LOC (test code doesn't count toward 150 LOC limit)
**Production code**: ~210 LOC
**Over limit?**: Yes, 210 LOC > 150 LOC

**Mitigation Strategy** (Micro-batching):
Split into 2 micro-batches:

**Batch 1** (This task):
- `types.ts` (~30 LOC)
- `lease_manager.ts` (~60 LOC)
- `lifecycle_telemetry.ts` (~40 LOC)
- **Total**: ~130 LOC ✅ Under 150 limit

**Batch 2** (Follow-up task: AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION):
- `supervisor.ts` (~80 LOC)
- Integration test (~150 LOC - doesn't count)
- **Total**: ~80 LOC ✅ Under 150 limit

**Rationale**: Batch 1 creates foundational components (lease manager, telemetry), Batch 2 wires them together in supervisor loop.

---

## Implementation Approach

### Phase 1: Create Directory Structure
```bash
mkdir -p autopilot_mvp/supervisor/__tests__
touch autopilot_mvp/supervisor/types.ts
touch autopilot_mvp/supervisor/lease_manager.ts
touch autopilot_mvp/supervisor/lifecycle_telemetry.ts
```

### Phase 2: Implement Types (types.ts)
**Purpose**: Shared type definitions for supervisor components

**Key Types**:
```typescript
export type LifecycleEventType =
  | 'task.selected'
  | 'task.assigned'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.blocked';

export interface LifecycleEventPayload {
  taskId: string;
  reason?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface LifecycleEvent {
  timestamp: string;
  type: LifecycleEventType;
  taskId: string;
  reason?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface Lease {
  taskId: string;
  acquiredAt: number;
  ttlMs: number;
  ownerId?: string; // Future: multi-supervisor support
}

export interface SupervisorConfig {
  workspaceRoot: string;
  pollingIntervalMs: number;
  defaultLeaseTtlMs: number;
  telemetryPath?: string;
}
```

**LOC Estimate**: ~30 LOC

---

### Phase 3: Implement LeaseManager (lease_manager.ts)
**Purpose**: Prevent duplicate task execution (in-memory MVP stubs)

**Implementation**:
```typescript
import { logInfo, logWarning } from '../telemetry/logger.js';
import type { Lease } from './types.js';

export class LeaseManager {
  private readonly leases: Map<string, Lease> = new Map();
  private readonly defaultTtlMs: number;

  constructor(defaultTtlMs = 10 * 60 * 1000) { // 10 min default
    this.defaultTtlMs = defaultTtlMs;
  }

  async acquireLease(taskId: string, ttlMs?: number): Promise<boolean> {
    const existingLease = this.leases.get(taskId);

    // Check if lease expired (future: remove expired leases in background)
    if (existingLease) {
      const elapsed = Date.now() - existingLease.acquiredAt;
      if (elapsed < existingLease.ttlMs) {
        logWarning('Lease acquisition failed: already leased', { taskId });
        return false; // Still valid
      }
      // Expired, can acquire
      logInfo('Expired lease detected, removing', { taskId, elapsed });
      this.leases.delete(taskId);
    }

    // Acquire new lease
    const lease: Lease = {
      taskId,
      acquiredAt: Date.now(),
      ttlMs: ttlMs ?? this.defaultTtlMs,
    };
    this.leases.set(taskId, lease);
    logInfo('Lease acquired', { taskId, ttlMs: lease.ttlMs });
    return true;
  }

  async releaseLease(taskId: string): Promise<void> {
    if (this.leases.has(taskId)) {
      this.leases.delete(taskId);
      logInfo('Lease released', { taskId });
    }
  }

  async renewLease(taskId: string): Promise<boolean> {
    const lease = this.leases.get(taskId);
    if (!lease) {
      logWarning('Lease renewal failed: not found', { taskId });
      return false;
    }
    lease.acquiredAt = Date.now();
    logInfo('Lease renewed', { taskId });
    return true;
  }

  async releaseAll(): Promise<void> {
    const count = this.leases.size;
    this.leases.clear();
    logInfo('All leases released', { count });
  }

  // For testing/debugging
  hasLease(taskId: string): boolean {
    return this.leases.has(taskId);
  }
}
```

**LOC Estimate**: ~60 LOC

**Dependencies**:
- `../telemetry/logger.js` - Existing logging utilities
- `./types.js` - Lease type definition

---

### Phase 4: Implement LifecycleTelemetry (lifecycle_telemetry.ts)
**Purpose**: Emit task lifecycle events to JSONL log

**Implementation**:
```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { logError } from '../telemetry/logger.js';
import type { LifecycleEvent, LifecycleEventPayload, LifecycleEventType } from './types.js';

export class LifecycleTelemetry {
  private readonly logPath: string;

  constructor(workspaceRoot: string, relativePath = 'state/analytics/supervisor_lifecycle.jsonl') {
    this.logPath = path.join(workspaceRoot, relativePath);
  }

  async emit(eventType: LifecycleEventType, payload: LifecycleEventPayload): Promise<void> {
    const event: LifecycleEvent = {
      timestamp: new Date().toISOString(),
      type: eventType,
      taskId: payload.taskId,
      reason: payload.reason,
      priority: payload.priority,
      metadata: payload.metadata,
    };

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });

      // Append event to JSONL
      await fs.appendFile(this.logPath, JSON.stringify(event) + '\n', 'utf-8');
    } catch (error) {
      logError('Failed to emit lifecycle event', {
        error: error instanceof Error ? error.message : String(error),
        eventType,
        taskId: payload.taskId,
      });
    }
  }
}
```

**LOC Estimate**: ~40 LOC

**Dependencies**:
- `node:fs` - File system operations
- `node:path` - Path utilities
- `../telemetry/logger.js` - Error logging
- `./types.js` - Event type definitions

---

### Phase 5: Implementation Verification
**After Phase 4 completes, verify**:
1. ✅ All files created (`types.ts`, `lease_manager.ts`, `lifecycle_telemetry.ts`)
2. ✅ TypeScript compiles without errors
3. ✅ Total LOC ≤ 150 (verify with `cloc autopilot_mvp/supervisor/*.ts --exclude-dir=__tests__`)
4. ✅ No linter errors
5. ✅ Dependencies imported correctly

---

## LOC Estimate Summary

| File | LOC | Reason |
|------|-----|--------|
| `types.ts` | ~30 | Type definitions (interfaces, enums) |
| `lease_manager.ts` | ~60 | In-memory lease map, acquire/release/renew logic |
| `lifecycle_telemetry.ts` | ~40 | JSONL append, directory creation, error handling |
| **Total (Batch 1)** | **~130** | ✅ Under 150 LOC limit |

**Note**: Supervisor loop (`supervisor.ts`, ~80 LOC) deferred to Batch 2 (follow-up task) to stay under micro-batching limit.

---

## Dependencies

### External Dependencies (Already Installed)
- `node:fs` - File system operations
- `node:path` - Path utilities
- No new npm packages required ✅

### Internal Dependencies (Existing)
- `tools/wvo_mcp/src/telemetry/logger.js` - Logging utilities (logInfo, logWarning, logError)
- `tools/wvo_mcp/src/orchestrator/state_machine.ts` - Task state (future: supervisor.ts will use)
- `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts` - Tactical execution (future: supervisor.ts will integrate)

---

## Complexity Analysis

### Cyclomatic Complexity: LOW
- **LeaseManager**:
  - `acquireLease()`: 3 branches (existing lease? expired? acquire)
  - `releaseLease()`: 1 branch (has lease?)
  - `renewLease()`: 1 branch (has lease?)
  - **Total**: ~5 decision points
- **LifecycleTelemetry**:
  - `emit()`: 1 branch (error handling)
  - **Total**: ~1 decision point

**Overall Cyclomatic Complexity**: ~6 (LOW - easy to test and maintain)

### Integration Complexity: LOW
- **LeaseManager**: Self-contained, in-memory only (no external services)
- **LifecycleTelemetry**: Self-contained, appends to JSONL (no external services)
- **Both**: No network calls, no database, no external APIs

### Cognitive Complexity: LOW
- **LeaseManager**: Familiar pattern (mutex, semaphore, distributed lock)
- **LifecycleTelemetry**: Simple append-only log (no rotation, no compression)
- **Both**: Single responsibility, clear purpose

---

## Risk Analysis

### Risk 1: In-Memory Leases Lost on Crash
**Likelihood**: HIGH (process crashes happen)
**Impact**: MEDIUM (duplicate task execution possible after crash)
**Mitigation** (MVP):
- Accept risk (documented limitation)
- Stale task recovery (existing in unified_orchestrator.ts) will handle stuck tasks
- Lease TTL (10 min) limits blast radius

**Mitigation** (Future):
- Replace with distributed lock (Redis, etcd)
- Add lease persistence to SQLite database

---

### Risk 2: JSONL File Growth (Telemetry)
**Likelihood**: MEDIUM (continuous task execution)
**Impact**: LOW (disk space)
**Mitigation** (MVP):
- Log rotation not implemented (accept risk for MVP)
- Monitor file size during testing

**Mitigation** (Future):
- Add log rotation (weekly, or >100MB)
- Add compression (gzip old logs)

---

### Risk 3: Supervisor Not Integrated with Orchestrator (Batch 1)
**Likelihood**: CERTAIN (deferred to Batch 2)
**Impact**: MEDIUM (can't test end-to-end in Batch 1)
**Mitigation**:
- Batch 1: Unit tests for LeaseManager, LifecycleTelemetry (verify components work)
- Batch 2: Integration test for Supervisor loop (verify end-to-end)
- Clear task dependency: Batch 2 depends on Batch 1

---

### Risk 4: LOC Estimate Inaccurate
**Likelihood**: LOW (estimates conservative)
**Impact**: MEDIUM (might exceed 150 LOC limit)
**Mitigation**:
- Estimates include comments and error handling (buffer built in)
- If over limit: Remove verbose comments, inline simple functions
- Batch split strategy (130 LOC batch 1, 80 LOC batch 2) provides buffer

---

## Edge Cases

### Edge Case 1: Lease Acquisition Race Condition
**Scenario**: Two supervisor instances attempt to acquire same lease simultaneously
**MVP Behavior**: Both check `this.leases.has(taskId)` at same time, both succeed
**Impact**: Duplicate execution possible (violates lease guarantee)
**Mitigation** (MVP):
- Accept risk (single-process MVP, race condition unlikely)
- Log warning if detected

**Mitigation** (Future):
- Use atomic compare-and-set (Redis `SET NX`)
- Add supervisor leader election

---

### Edge Case 2: Telemetry File Corruption
**Scenario**: Multiple processes append to same JSONL file simultaneously
**MVP Behavior**: File corruption possible (interleaved writes)
**Impact**: Malformed JSONL, parsing errors
**Mitigation** (MVP):
- Single-process MVP (no concurrent writes)
- If future multi-process: Use file locking (flock) or separate logs per process

---

### Edge Case 3: Lease Expiry During Execution
**Scenario**: Task execution takes >10 minutes, lease expires mid-execution
**MVP Behavior**: Another supervisor can acquire lease, duplicate execution
**Impact**: Duplicate execution, wasted resources
**Mitigation** (MVP):
- Accept risk (most tasks <10 min)
- Document limitation

**Mitigation** (Future):
- Add lease renewal background worker (renew every 5 min)
- Orchestrator notifies supervisor when task starts (extend lease)

---

### Edge Case 4: Graceful Shutdown Interrupted
**Scenario**: Supervisor SIGKILL (no chance to release leases)
**MVP Behavior**: Leases remain in memory, lost on process exit
**Impact**: Next supervisor instance starts with clean slate (leases reset)
**Mitigation** (MVP):
- Acceptable for MVP (in-memory leases are volatile by design)

**Mitigation** (Future):
- Persist leases to database, clear on startup (recover from crash)

---

## Testing Strategy

### Unit Tests (Batch 1)
**File**: `autopilot_mvp/supervisor/__tests__/lease_manager.test.ts`

**Test Cases**:
1. ✅ `acquireLease()` succeeds when task not leased
2. ✅ `acquireLease()` fails when task already leased
3. ✅ `acquireLease()` succeeds after lease expires
4. ✅ `releaseLease()` makes task available again
5. ✅ `renewLease()` extends lease TTL
6. ✅ `renewLease()` fails if lease doesn't exist
7. ✅ `releaseAll()` clears all leases

**File**: `autopilot_mvp/supervisor/__tests__/lifecycle_telemetry.test.ts`

**Test Cases**:
1. ✅ `emit()` appends event to JSONL file
2. ✅ `emit()` creates directory if doesn't exist
3. ✅ Event format matches schema (valid JSON, required fields)
4. ✅ Multiple emits append (not overwrite)
5. ✅ Error handling (invalid path, permission denied)

---

### Integration Tests (Batch 2)
**File**: `autopilot_mvp/supervisor/__tests__/supervisor_integration.test.ts`

**Deferred to Batch 2** (requires supervisor.ts implementation)

---

## File Creation Order

**Order of implementation** (minimizes rework):

1. **types.ts** (30 LOC)
   - No dependencies on other files
   - Defines contracts for other modules

2. **lease_manager.ts** (60 LOC)
   - Depends on: `types.ts`, `logger.js`
   - Can be unit tested immediately

3. **lifecycle_telemetry.ts** (40 LOC)
   - Depends on: `types.ts`, `logger.js`
   - Can be unit tested immediately

4. **Unit tests** (150 LOC - doesn't count toward limit)
   - Verify LeaseManager and LifecycleTelemetry work correctly
   - Catch bugs early before integration

5. **Batch 1 Complete** ✅
   - All foundational components built
   - Unit tested
   - Ready for Batch 2 (supervisor loop integration)

---

## Micro-Batching Compliance

### Batch 1 (This Task): AFP-W0-M1-MVP-SUPERVISOR-SCAFFOLD
**Scope**:
- ✅ Create `autopilot_mvp/supervisor/` directory
- ✅ Implement `types.ts` (~30 LOC)
- ✅ Implement `lease_manager.ts` (~60 LOC)
- ✅ Implement `lifecycle_telemetry.ts` (~40 LOC)
- ✅ Unit tests for lease manager and telemetry

**Total**: ~130 LOC (under 150 limit)
**Files Changed**: 3 new files + tests
**Exit Criteria Met**:
- ✅ Lease management stubs implemented (in-memory)
- ✅ Telemetry hooks implemented (JSONL emission)
- ⚠️ Passing integration smoke test → Deferred to Batch 2 (requires supervisor.ts)

**Justification for Partial Completion**:
- Batch 1 delivers foundational components (lease manager, telemetry)
- These components can be unit tested independently
- Batch 2 will integrate them in supervisor loop and add integration test
- This approach respects 150 LOC limit while making measurable progress

---

### Batch 2 (Follow-up Task): AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION
**Scope**:
- ✅ Implement `supervisor.ts` (~80 LOC)
- ✅ Integrate with unified orchestrator
- ✅ Integration smoke test (3 tasks, lifecycle events, zero duplicates)

**Total**: ~80 LOC (under 150 limit)
**Files Changed**: 1 new file + integration test
**Exit Criteria Met**:
- ✅ Passing integration smoke exercising supervisor loop

---

## Success Criteria (Batch 1)

**How we know Batch 1 succeeds**:
1. ✅ `autopilot_mvp/supervisor/types.ts` exists, exports all required types
2. ✅ `autopilot_mvp/supervisor/lease_manager.ts` exists, LeaseManager class with 4 methods
3. ✅ `autopilot_mvp/supervisor/lifecycle_telemetry.ts` exists, LifecycleTelemetry class with emit()
4. ✅ TypeScript builds without errors
5. ✅ Unit tests pass (lease_manager.test.ts, lifecycle_telemetry.test.ts)
6. ✅ Total LOC ≤ 150 (excluding tests)
7. ✅ No linter errors

**How we verify**:
```bash
# Build
cd tools/wvo_mcp && npm run build

# Test
npm test -- autopilot_mvp/supervisor/__tests__

# LOC count
cloc autopilot_mvp/supervisor/*.ts --exclude-dir=__tests__
# Expected: ~130 LOC
```

---

## Next Phase: THINK

**Deliverables**:
- Edge cases analysis (detailed scenarios)
- Failure modes (what can go wrong?)
- Complexity analysis (cognitive load, maintainability)
- Mitigation strategies for identified risks

---

**Plan Validation**:
- ✅ **Via Negativa**: Examined existing code for deletion, justified no deletions
- ✅ **Refactor vs Repair**: This is a refactor (restoring architectural layer), not a patch
- ✅ **Architecture**: Clean module structure, clear dependencies
- ✅ **LOC Estimate**: ~130 LOC (under 150 limit via micro-batching)
- ✅ **Risk Analysis**: 4 risks identified with mitigation strategies
- ✅ **Edge Cases**: 4 edge cases documented with MVP/future mitigations
- ✅ **Testing Strategy**: Unit tests for Batch 1, integration tests for Batch 2
- ✅ **File Creation Order**: Logical sequence (types → components → tests)
- ✅ **Micro-Batching**: Batch 1 (130 LOC) + Batch 2 (80 LOC), both under 150 limit

---

**Date**: 2025-11-05
**Author**: Claude Council
