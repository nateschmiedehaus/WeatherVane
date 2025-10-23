# Worker Entry Point with DRY_RUN Safeguards

**Task**: T6.4.3 - Worker entrypoint with DRY_RUN safeguards
**Status**: ✅ Complete
**Date**: 2025-10-22

## Overview

The worker entry point (`tools/wvo_mcp/src/worker/worker_entry.ts`) implements a comprehensive system for safe dry-run execution. When `WVO_DRY_RUN=1`, workers operate in a read-only mode that prevents accidental state mutations while allowing inspection and planning.

## Architecture

### Dual-Protection Model

The implementation uses **two layers of protection** to ensure DRY_RUN safety:

```
Layer 1: Worker Entry Point (worker_entry.ts)
  ├─ Detect WVO_DRY_RUN=1 environment variable
  ├─ Initialize with role-specific safe tool allowlist
  ├─ Validate all tool calls against allowlist
  └─ Throw DryRunViolation if mutating tool requested

Layer 2: State Machine (state_machine.ts)
  ├─ Initialize SQLite with readonly: true
  ├─ Open DB with URI: file:path?mode=ro&cache=shared
  ├─ Enforce PRAGMA query_only = 1
  └─ Guard all writes with assertWritable() checks
```

If Layer 1 is bypassed, Layer 2 catches mutations. If Layer 2 is bypassed, Layer 1 rejects unsupported tools.

### Worker Roles

#### Orchestrator Worker (WVO_WORKER_ROLE=orchestrator)

When `DRY_RUN=1`, orchestrator workers allow only these 7 safe tools:

| Tool | Purpose | Type |
|------|---------|------|
| `orchestrator_status` | Read operations manager snapshot | Status |
| `auth_status` | Check provider authentication | Status |
| `plan_next` | Query and filter roadmap tasks | Planning |
| `fs_read` | Read files from workspace | I/O |
| `autopilot_status` | Get autopilot state and consensus metrics | Status |
| `heavy_queue_list` | List queued background tasks | Status |
| `codex_commands` | Describe available Codex CLI commands | Info |

All other tools are rejected:
- ❌ `plan_update` - Updates task status
- ❌ `context_write` - Writes context entries
- ❌ `context_snapshot` - Creates snapshots
- ❌ `fs_write` - Writes files
- ❌ `cmd_run` - Executes shell commands
- ❌ `artifact_record` - Records artifacts
- ❌ `critics_run` - Runs critic checks
- ❌ `heavy_queue_enqueue` - Queues tasks

#### Executor Worker (WVO_WORKER_ROLE=executor)

When `DRY_RUN=1`, executor workers allow only:

| Tool | Purpose |
|------|---------|
| `fs_read` | Read files from workspace (inspection only) |

All other tools are rejected:
- ❌ `cmd_run` - Executes shell commands
- ❌ `fs_write` - Writes files

Executor workers have minimal scope and never have state database access.

## Implementation Details

### 1. Environment Detection

```typescript
const dryRunEnabled = isDryRunEnabled();
// Checks: process.env.WVO_DRY_RUN === '1'
```

Detection happens at worker startup, before any state initialization.

### 2. State Machine Initialization

When DRY_RUN is detected, the OrchestratorRuntime creates StateMachine with read-only flag:

```typescript
// In OrchestratorRuntime initialization
this.stateMachine = new StateMachine(workspaceRoot, {
  readonly: dryRunEnabled  // true when WVO_DRY_RUN=1
});
```

The StateMachine then:
- Opens SQLite with `mode=ro` (read-only)
- Sets `PRAGMA query_only = 1` for extra safety
- Falls back to in-memory DB if file doesn't exist
- Guards all write operations with `assertWritable()`

### 3. Tool Router Enforcement

The WorkerToolRouter (for orchestrators) and ExecutorToolRouter (for executors) handle routing:

```typescript
async function handleRunToolRequest(message, startedMs) {
  const { name, input, idempotencyKey } = message.params;

  // First guard: Check tool is in safe allowlist
  if (dryRunEnabled) {
    assertDryRunToolAllowed(name);  // Throws if not allowed
  }

  // Second guard: Route to handler which checks mutations
  const result = await router.runTool({ name, input, idempotencyKey });
  sendSuccess(message.id, result, startedMs);
}
```

### 4. Error Handling

When a mutating tool is requested in dry-run mode:

```typescript
// Error:
{
  "name": "DryRunViolation",
  "message": "Dry-run mode forbids tool:plan_update. Promote the worker before mutating state.",
  "type": "dry_run_violation"
}
```

This helps users understand they need to promote the worker to an active role to make changes.

## State Database Protection

### Read-Only SQLite Mode

When `DRY_RUN=1`, the state database uses SQLite's read-only features:

```typescript
// Mode 1: Read-only file access
const uri = `file:${this.dbPath}?mode=ro&cache=shared`;
this.db = new Database(uri, {
  uri: true,
  readonly: true,
  fileMustExist: true,
});

// Mode 2: Query-only pragma
this.db.pragma('query_only = 1');
```

This prevents:
- INSERT statements
- UPDATE statements
- DELETE statements
- Schema modifications
- Transaction writes

### Assertion Guards

All 12 write operations in StateMachine are guarded:

```typescript
private assertWritable(operation: string): void {
  if (this.readOnly) {
    throw createDryRunError(`state_machine:${operation}`);
  }
}
```

Write operations guarded:
1. `create_task`
2. `update_task_details`
3. `transition` (task status changes)
4. `assign_task`
5. `add_dependency`
6. `log_event`
7. `record_quality`
8. `record_critic_history`
9. `record_research_cache`
10. `prune_research_cache`
11. `create_checkpoint`
12. `replace_code_index`

## Test Coverage

The test suite (`src/tests/worker_dry_run.test.ts`) covers:

### Orchestrator Worker Tests (7 tests)
- ✅ Rejects all mutating tools when DRY_RUN=1
- ✅ Allows all 7 safe tools when DRY_RUN=1
- ✅ Reports DRY_RUN status in health check
- ✅ Rejects unknown tools regardless of DRY_RUN
- ✅ Allows mutating tools when DRY_RUN=0
- ✅ Promotes from dry-run to active correctly
- ✅ Maintains DRY_RUN flag through status reports

### Executor Worker Tests (5 tests)
- ✅ Rejects mutating tools when DRY_RUN=1
- ✅ Allows fs_read when DRY_RUN=1
- ✅ Reports executor role and DRY_RUN status
- ✅ Rejects unsupported methods for executors
- ✅ Allows mutating tools when DRY_RUN=0

### Legacy Behavior Tests (3 tests)
- ✅ All mutating tools work when DRY_RUN=0 (orchestrator)
- ✅ All tools work when DRY_RUN=0 (executor)
- ✅ No dry-run errors when flag is disabled

**Total**: 15 tests, all passing ✅

## Usage Examples

### Starting a Dry-Run Worker

```bash
# Orchestrator in dry-run mode
WVO_DRY_RUN=1 WVO_WORKER_ROLE=orchestrator node dist/index.js

# Executor in dry-run mode
WVO_DRY_RUN=1 WVO_WORKER_ROLE=executor node dist/index.js
```

### Calling Safe Tools

```typescript
// This works in dry-run
await worker.call('runTool', {
  name: 'plan_next',
  input: { limit: 5 }
});

// This fails in dry-run with DryRunViolation
await worker.call('runTool', {
  name: 'plan_update',
  input: { task_id: 'T1', status: 'done' }
});
```

### Health Check Shows DRY_RUN Status

```typescript
const health = await worker.call('health');
// Returns:
{
  ok: true,
  role: 'orchestrator',
  dryRun: true,
  flags: { dryRun: true },
  ...
}
```

## Key Design Decisions

### 1. Allowlist Over Blocklist

We use **allowlists** (safe tools) rather than blocklists (forbidden tools):
- ✅ Explicit about what's allowed
- ✅ Safe-by-default for new tools
- ✅ Clear what capabilities exist in dry-run

### 2. Dual-Layer Protection

Both worker and state machine enforce DRY_RUN:
- ✅ Defense in depth
- ✅ Catches bugs in either layer
- ✅ Prevents accidental bypasses

### 3. Role-Specific Capabilities

Different worker roles have different safe tool sets:
- ✅ Executors have minimal scope (fs_read only)
- ✅ Orchestrators can plan but not execute
- ✅ Matches intended use cases

### 4. Clear Error Messages

DryRunViolation includes helpful guidance:
- ✅ Tells user what failed
- ✅ Explains what to do next
- ✅ Promotes understanding

## Verification Checklist

✅ **Build**: `npm run build` completes with 0 TypeScript errors
✅ **Tests**: All 15 worker DRY_RUN tests pass
✅ **Audit**: `npm audit` shows 0 vulnerabilities
✅ **Runtime**: Worker starts correctly in both roles
✅ **State Safety**: SQLite opens read-only when DRY_RUN=1
✅ **Tool Routing**: Correct tools allowed/blocked per role
✅ **Error Handling**: DryRunViolation thrown with helpful message
✅ **Documentation**: This file documents the implementation

## Integration Points

### OrchestratorRuntime

```typescript
export class OrchestratorRuntime {
  constructor(workspaceRoot: string, options?: Options) {
    this.stateMachine = new StateMachine(workspaceRoot, {
      readonly: isDryRunEnabled()  // Respects DRY_RUN
    });
  }
}
```

### WorkerToolRouter

```typescript
async runTool(params: RunToolParams) {
  // Tool router checks DRY_RUN for each tool
  // Mutations guarded by idempotency middleware
}
```

### StateMachine

```typescript
export class StateMachine {
  constructor(workspaceRoot: string, options?: { readonly?: boolean }) {
    this.readOnly = options?.readonly ?? false;
    // Opens DB read-only if readOnly: true
  }

  private assertWritable(operation: string) {
    if (this.readOnly) {
      throw createDryRunError(`state_machine:${operation}`);
    }
  }
}
```

## Future Enhancements

1. **Audit Logging**: Log all tool calls in dry-run mode for compliance
2. **Metrics**: Track which tools are called in dry-run vs active
3. **Gradual Rollout**: Support intermediate roles (e.g., read-write limited tools)
4. **Promotion Flow**: Automated workflow to promote from dry-run to active
5. **Cost Tracking**: Estimate cost of operations before executing

## References

- Task: T6.4.3 - Worker entrypoint with DRY_RUN safeguards
- Files Modified:
  - `tools/wvo_mcp/src/worker/worker_entry.ts` (enhanced with documentation)
  - `tools/wvo_mcp/src/orchestrator/state_machine.ts` (already had readonly support)
  - `tools/wvo_mcp/src/tests/worker_dry_run.test.ts` (comprehensive test coverage)
- Quality: Build ✅ Tests ✅ Audit ✅ Documentation ✅

## Completion Summary

This implementation provides enterprise-grade dry-run safety through:
- **Layered protection** (worker + state machine)
- **Role-based capabilities** (orchestrator vs executor)
- **Comprehensive testing** (15 tests, all passing)
- **Clear errors** (helpful DryRunViolation messages)
- **Production-ready** (zero build errors, zero vulnerabilities)

The worker entry point now safely routes RPCs, enforces DRY_RUN safeguards, and maintains legacy behaviour when DRY_RUN=0.
