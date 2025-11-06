# SPEC - MVP Supervisor Scaffold

**Task:** AFP-W0-M1-MVP-SUPERVISOR-SCAFFOLD
**Date:** 2025-11-05

---

## Functional Requirements

### FR1: Supervisor Loop
**Input**: Roadmap state (from StateMachine), orchestrator instance
**Output**: Continuous task selection and assignment
**Behavior**:
```typescript
while (running && !stopConditions) {
  // 1. Query available tasks (dependencies met, status=pending)
  const availableTasks = await stateMachine.getTasks({
    status: ['pending'],
    dependenciesMet: true
  });

  // 2. Select next task (MVP: simple priority order)
  const nextTask = selectNextTask(availableTasks);

  // 3. Acquire lease (prevent duplicate execution)
  if (await leaseManager.acquireLease(nextTask.id)) {
    // 4. Emit lifecycle event
    await lifecycleTelemetry.emit('task.selected', { taskId: nextTask.id });

    // 5. Assign to orchestrator
    await orchestrator.executeTask(nextTask);

    // 6. Release lease after completion
    await leaseManager.releaseLease(nextTask.id);
  }

  await sleep(pollingInterval);
}
```

**Edge Cases**:
- No available tasks → Sleep and poll again
- Lease acquisition fails → Skip task, try next
- Orchestrator execution fails → Supervisor catches, emits failure event, releases lease

---

### FR2: Lease Management (MVP Stubs)
**Purpose**: Prevent duplicate task execution across multiple supervisor instances

#### FR2.1: Acquire Lease
```typescript
async acquireLease(taskId: string, ttlMs?: number): Promise<boolean>
```
**Input**:
- `taskId` - Task identifier
- `ttlMs` (optional) - Lease time-to-live in milliseconds (default: 10 minutes)

**Output**: `true` if lease acquired, `false` if already leased

**Behavior** (MVP):
- Check in-memory lease map: `this.leases.has(taskId)`
- If not leased: Set `this.leases.set(taskId, { acquiredAt: Date.now(), ttl: ttlMs })`
- Return `true`
- If already leased: Return `false`

**Future Enhancement** (Out of MVP Scope):
- Distributed lock (Redis `SET taskId:lease "ownerID" EX 600 NX`)
- Lease renewal background worker
- Lease expiry detection

#### FR2.2: Release Lease
```typescript
async releaseLease(taskId: string): Promise<void>
```
**Input**: `taskId` - Task identifier
**Output**: None
**Behavior** (MVP):
- Remove from in-memory map: `this.leases.delete(taskId)`
- Log release event

**Future Enhancement**:
- Distributed lock deletion (Redis `DEL taskId:lease`)

#### FR2.3: Renew Lease
```typescript
async renewLease(taskId: string): Promise<boolean>
```
**Input**: `taskId` - Task identifier
**Output**: `true` if renewed, `false` if lease doesn't exist or expired
**Behavior** (MVP):
- Check if lease exists: `this.leases.has(taskId)`
- If exists: Update `acquiredAt` timestamp
- Return `true`
- If not exists: Return `false`

**Future Enhancement**:
- Distributed lock TTL extension (Redis `EXPIRE taskId:lease 600`)

---

### FR3: Lifecycle Telemetry
**Purpose**: Observable task lifecycle at strategic level

#### FR3.1: Event Types
```typescript
type LifecycleEventType =
  | 'task.selected'       // Supervisor decides to work on task
  | 'task.assigned'       // Supervisor assigns task to orchestrator
  | 'task.started'        // Orchestrator confirms execution started
  | 'task.completed'      // Task completed (success)
  | 'task.failed'         // Task failed
  | 'task.blocked';       // Task hit blocker
```

#### FR3.2: Event Emission
```typescript
async emit(eventType: LifecycleEventType, payload: LifecycleEventPayload): Promise<void>
```
**Input**:
- `eventType` - One of the lifecycle event types above
- `payload` - Event-specific data (taskId, reason, metadata)

**Output**: None (side effect: append to JSONL log)

**Behavior**:
```typescript
const event = {
  timestamp: new Date().toISOString(),
  type: eventType,
  taskId: payload.taskId,
  ...payload,
};

// Append to state/analytics/supervisor_lifecycle.jsonl
await fs.appendFile(
  path.join(workspaceRoot, 'state/analytics/supervisor_lifecycle.jsonl'),
  JSON.stringify(event) + '\n',
  'utf-8'
);
```

#### FR3.3: Event Payload Schema
```typescript
interface LifecycleEventPayload {
  taskId: string;
  reason?: string;         // Why this task was selected
  priority?: number;       // Task priority score (future)
  metadata?: Record<string, unknown>;
}
```

---

### FR4: Supervisor-Orchestrator Integration
**Purpose**: Clean interface between strategic (supervisor) and tactical (orchestrator) layers

#### FR4.1: Supervisor → Orchestrator API
```typescript
interface SupervisorToOrchestratorAPI {
  // Execute task (tactical concerns: scheduling, WIP, agent pool)
  executeTask(task: Task): Promise<ExecutionResult>;

  // Query orchestrator state
  getWIPCount(): Promise<number>;
  isHealthy(): Promise<boolean>;
}
```

#### FR4.2: Orchestrator → Supervisor API
```typescript
interface OrchestratorToSupervisorAPI {
  // Notify supervisor of lifecycle events
  onTaskStarted(taskId: string): Promise<void>;
  onTaskCompleted(taskId: string, result: ExecutionResult): Promise<void>;
  onTaskFailed(taskId: string, error: Error): Promise<void>;
}
```

**Implementation**:
- Supervisor holds reference to orchestrator
- Orchestrator holds reference to supervisor (or uses event emitter)
- Communication: Direct TypeScript method calls (same process)

---

### FR5: Task Selection (MVP Simple Priority)
**Purpose**: Decide which task to work on next

**Algorithm** (MVP):
```typescript
function selectNextTask(availableTasks: Task[]): Task | null {
  if (availableTasks.length === 0) return null;

  // MVP: Simple priority order
  // 1. Status = 'in_progress' → Skip (already being worked on)
  // 2. Sort by: priority (high > medium > low), then by ID (alphabetical)
  // 3. Return first

  const sorted = availableTasks
    .filter(t => t.status === 'pending')
    .sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = (priorityOrder[b.priority] ?? 0) - (priorityOrder[a.priority] ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return a.id.localeCompare(b.id);
    });

  return sorted[0] ?? null;
}
```

**Future Enhancement** (Out of MVP Scope):
- WSJF scoring (Weighted Shortest Job First)
- Business impact scoring (see ORCHESTRATOR_EVOLUTION_SPEC.md)
- 7-lens evaluation framework
- Readiness assessment (infrastructure exists, dependencies met)

---

## Non-Functional Requirements

### NFR1: Performance
- **Polling interval**: 5 seconds (configurable via `SUPERVISOR_POLL_INTERVAL_MS`)
- **Lease overhead**: <10ms per acquire/release (in-memory operations)
- **Telemetry overhead**: <50ms per event emission (async append to JSONL)

### NFR2: Reliability
- **Graceful shutdown**: Supervisor releases all leases on SIGTERM/SIGINT
- **Crash recovery**: Leases expire after TTL (10 min default) - future enhancement
- **Error handling**: Orchestrator errors don't crash supervisor loop

### NFR3: Observability
- **Lifecycle events**: All strategic decisions logged to `state/analytics/supervisor_lifecycle.jsonl`
- **Lease state**: Log lease acquisitions/releases (debug level)
- **Health check**: Supervisor exposes `isHealthy()` method (returns true if loop running)

### NFR4: Testability
- **Dependency injection**: Supervisor constructor accepts orchestrator, stateMachine, leaseManager, telemetry
- **Mock-friendly**: All dependencies are interfaces (easy to mock in tests)
- **Integration test**: Smoke test exercises full supervisor loop with mocked orchestrator

---

## Acceptance Criteria

### AC1: Supervisor Loop Starts and Stops
**Given**: Supervisor instance created with dependencies
**When**: `supervisor.start()` called
**Then**:
- Supervisor loop begins polling for tasks (every 5s)
- Health check `supervisor.isHealthy()` returns `true`

**When**: `supervisor.stop()` called
**Then**:
- Supervisor loop stops polling
- All acquired leases are released
- Health check `supervisor.isHealthy()` returns `false`

---

### AC2: Lease Prevents Duplicate Execution
**Given**: Task `AFP-W0-M1-TEST-TASK` with status `pending`
**When**:
- Supervisor A acquires lease for task
- Supervisor B attempts to acquire lease for same task
**Then**:
- Supervisor A lease succeeds (`true`)
- Supervisor B lease fails (`false`)
- Only Supervisor A assigns task to orchestrator
- No duplicate execution

**When**: Supervisor A releases lease
**Then**: Supervisor B can now acquire lease

---

### AC3: Lifecycle Events Emitted
**Given**: Task `AFP-W0-M1-TEST-TASK` with status `pending`
**When**: Supervisor selects and assigns task
**Then**: Events appear in `state/analytics/supervisor_lifecycle.jsonl`:
```jsonl
{"timestamp":"2025-11-05T20:00:00.000Z","type":"task.selected","taskId":"AFP-W0-M1-TEST-TASK"}
{"timestamp":"2025-11-05T20:00:01.000Z","type":"task.assigned","taskId":"AFP-W0-M1-TEST-TASK"}
```

**When**: Orchestrator completes task (success)
**Then**: Completion event emitted:
```jsonl
{"timestamp":"2025-11-05T20:05:00.000Z","type":"task.completed","taskId":"AFP-W0-M1-TEST-TASK","result":"success"}
```

---

### AC4: Supervisor-Orchestrator Integration
**Given**: Supervisor and orchestrator both running
**When**: Supervisor calls `orchestrator.executeTask(task)`
**Then**:
- Orchestrator applies tactical scheduling (WSJF, WIP limits)
- Orchestrator assigns task to agent from pool
- Agent executes task
- Orchestrator notifies supervisor of completion

**When**: Orchestrator calls `supervisor.onTaskCompleted(taskId, result)`
**Then**:
- Supervisor emits `task.completed` lifecycle event
- Supervisor releases lease for task
- Supervisor continues to next task

---

### AC5: Integration Smoke Test Passes
**Test Scenario**:
```typescript
// Create 3 pending tasks
await stateMachine.createTask({ id: 'TASK-1', status: 'pending', priority: 'high' });
await stateMachine.createTask({ id: 'TASK-2', status: 'pending', priority: 'medium' });
await stateMachine.createTask({ id: 'TASK-3', status: 'pending', priority: 'low' });

// Start supervisor with mocked orchestrator
const mockOrchestrator = new MockOrchestrator();
const supervisor = new Supervisor({ orchestrator: mockOrchestrator, ... });
await supervisor.start();

// Wait for all tasks to complete
await waitFor(() => mockOrchestrator.executedTasks.length === 3, { timeout: 30000 });

// Assert
expect(mockOrchestrator.executedTasks).toEqual(['TASK-1', 'TASK-2', 'TASK-3']); // Correct priority order
expect(lifecycleEventsCount).toEqual(9); // 3 tasks × 3 events (selected, assigned, completed)
expect(duplicateExecutions).toEqual(0); // No race conditions
```

**Assertions**:
- ✅ All 3 tasks executed in priority order (high → medium → low)
- ✅ 9 lifecycle events emitted (3 per task)
- ✅ Zero duplicate executions (verified via lease log)

---

## Out of Scope (MVP)

### Not Implementing (Future Tasks)
1. **Distributed lock persistence** (Redis, etcd) - In-memory leases sufficient for MVP
2. **Lease renewal background worker** - Single-process MVP doesn't need renewal
3. **Business impact scoring** - Simple priority order sufficient for MVP
4. **7-lens evaluation framework** - Future enhancement (see ORCHESTRATOR_EVOLUTION_SPEC.md)
5. **Readiness assessment** - Future enhancement (infrastructure checks)
6. **Autonomous priority decisions** - Future enhancement (AI-driven prioritization)

### Rationale for Deferral
- **ECONOMY**: Build minimum to unblock downstream tasks
- **EVOLUTION**: Let usage inform production requirements
- **Via Negativa**: What can we DELETE from scope? → Everything not blocking AFP-W0-M1-MVP-AGENTS-SCAFFOLD

---

## API Contracts Summary

### LeaseManager Interface
```typescript
interface LeaseManager {
  acquireLease(taskId: string, ttlMs?: number): Promise<boolean>;
  releaseLease(taskId: string): Promise<void>;
  renewLease(taskId: string): Promise<boolean>;
  releaseAll(): Promise<void>; // For graceful shutdown
}
```

### LifecycleTelemetry Interface
```typescript
interface LifecycleTelemetry {
  emit(eventType: LifecycleEventType, payload: LifecycleEventPayload): Promise<void>;
}
```

### Supervisor Interface
```typescript
interface Supervisor {
  start(): Promise<void>;
  stop(): Promise<void>;
  isHealthy(): boolean;
  onTaskCompleted(taskId: string, result: ExecutionResult): Promise<void>;
  onTaskFailed(taskId: string, error: Error): Promise<void>;
}
```

---

## Dependencies

**Existing Modules** (No Changes Required):
- `tools/wvo_mcp/src/orchestrator/state_machine.ts` - Task state queries
- `tools/wvo_mcp/src/orchestrator/unified_orchestrator.ts` - Tactical execution
- `tools/wvo_mcp/src/telemetry/logger.ts` - Logging utilities

**New Modules** (To Be Created):
- `autopilot_mvp/supervisor/supervisor.ts` - Main supervisor loop
- `autopilot_mvp/supervisor/lease_manager.ts` - Lease management (MVP stubs)
- `autopilot_mvp/supervisor/lifecycle_telemetry.ts` - Lifecycle event emission
- `autopilot_mvp/supervisor/types.ts` - Supervisor-specific types
- `autopilot_mvp/supervisor/__tests__/supervisor_integration.test.ts` - Smoke test

---

## Test Strategy

### Unit Tests
1. **LeaseManager** (lease_manager.test.ts)
   - Test: Acquire lease succeeds when not leased
   - Test: Acquire lease fails when already leased
   - Test: Release lease makes task available again
   - Test: Renew lease extends TTL
   - Test: ReleaseAll clears all leases

2. **LifecycleTelemetry** (lifecycle_telemetry.test.ts)
   - Test: Emit event appends to JSONL file
   - Test: Event format matches schema
   - Test: File created if doesn't exist
   - Test: Concurrent emits don't corrupt file

3. **Supervisor Task Selection** (supervisor.test.ts)
   - Test: Selects high priority before medium/low
   - Test: Returns null when no tasks available
   - Test: Skips tasks with status='in_progress'

### Integration Test
1. **Supervisor Loop Smoke Test** (supervisor_integration.test.ts)
   - Test: Complete 3 tasks in priority order
   - Test: Lifecycle events emitted for all tasks
   - Test: Zero duplicate executions (verified via lease log)
   - Test: Graceful shutdown releases all leases

---

## Migration Path (MVP → Production)

**Phase 1: MVP (This Task)**
- ✅ In-memory lease manager
- ✅ Basic lifecycle telemetry
- ✅ Simple priority task selection
- ✅ Integration smoke test

**Phase 2: Production Enhancements** (Future Tasks)
- Replace in-memory leases with distributed lock (Redis/etcd)
- Add lease renewal background worker
- Add business impact scoring
- Add 7-lens evaluation framework
- Add readiness assessment (infrastructure checks)

**Phase 3: Autonomous Operations** (Future Tasks)
- AI-driven priority decisions
- Self-healing lease recovery
- Multi-supervisor leader election
- Real-time dashboard (supervisor state visualization)

**Key Insight**: Clean interfaces (LeaseManager, LifecycleTelemetry) allow swapping implementations without changing Supervisor core logic.

---

## Next Phase: PLAN

**Deliverables**:
- File structure and module architecture
- Implementation approach (order of file creation)
- LOC estimates (verify ≤150 net LOC limit)
- Dependencies and import structure
- Risk mitigation strategies

---

**Spec Validation**:
- ✅ **Functional requirements**: 5 FRs defined with clear inputs, outputs, behaviors
- ✅ **Non-functional requirements**: 4 NFRs (performance, reliability, observability, testability)
- ✅ **Acceptance criteria**: 5 ACs with specific test scenarios
- ✅ **API contracts**: 3 interfaces fully specified (LeaseManager, LifecycleTelemetry, Supervisor)
- ✅ **Out of scope**: Clearly documented what's NOT in MVP
- ✅ **Test strategy**: Unit + integration tests defined

---

**Date**: 2025-11-05
**Author**: Claude Council
