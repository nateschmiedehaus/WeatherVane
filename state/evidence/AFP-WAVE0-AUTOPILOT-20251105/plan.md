# Implementation Plan — AFP-WAVE0-AUTOPILOT-20251105

**Date:** 2025-11-05
**Author:** Claude Council
**Phase:** 3 of 10 (PLAN)

---

## Purpose

Design Wave 0 implementation approach aligned with AFP/SCAS principles.

---

## Architecture Design

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Wave 0 Autopilot                    │
│                                                         │
│  ┌──────────────┐                                      │
│  │ run_wave0.ts │  (Entry point)                       │
│  └──────┬───────┘                                      │
│         │                                              │
│         ▼                                              │
│  ┌──────────────┐                                      │
│  │  runner.ts   │  (Main loop)                        │
│  └──────┬───────┘                                      │
│         │                                              │
│         ├──► 1. Load roadmap (plan_next)              │
│         ├──► 2. Select task (first pending)           │
│         ├──► 3. Execute (task_executor)               │
│         ├──► 4. Update status (plan_update)           │
│         ├──► 5. Log results (analytics)               │
│         └──► 6. Sleep & repeat                        │
│                                                         │
│  ┌──────────────────┐                                  │
│  │ task_executor.ts │  (Execute single task)          │
│  └──────┬───────────┘                                  │
│         │                                              │
│         ├──► Create evidence bundle                    │
│         ├──► Log start (analytics)                     │
│         ├──► Execute with MCP tools                    │
│         ├──► Handle errors                             │
│         ├──► Write summary                             │
│         └──► Log completion                            │
│                                                         │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│              Existing Infrastructure                    │
│  • MCP Tools (plan_next, plan_update, etc.)            │
│  • State Management (roadmap.yaml, context.md)         │
│  • Analytics (wave0_runs.jsonl)                        │
│  • AFP Guardrails (micro-batching, safety)             │
└─────────────────────────────────────────────────────────┘
```

---

## Files to Create/Modify

### File 1: `tools/wvo_mcp/src/wave0/runner.ts`

**Purpose:** Main Wave 0 autonomous loop

**Responsibilities:**
- Load next pending task from roadmap
- Rate limiting (5 min between tasks)
- Checkpointing after each task
- Graceful shutdown on SIGTERM/SIGINT
- Error recovery

**Size estimate:** ~80 LOC

**Key functions:**
```typescript
class Wave0Runner {
  async run(): Promise<void>
  private async getNextTask(): Promise<Task | null>
  private async checkpoint(): Promise<void>
  private setupSignalHandlers(): void
}
```

### File 2: `tools/wvo_mcp/src/wave0/task_executor.ts`

**Purpose:** Execute a single task end-to-end

**Responsibilities:**
- Create evidence bundle
- Execute task with MCP tools
- Handle errors gracefully
- Write task summary
- Log execution metrics

**Size estimate:** ~50 LOC

**Key functions:**
```typescript
class TaskExecutor {
  async execute(task: Task): Promise<ExecutionResult>
  private async createEvidenceBundle(taskId: string): Promise<void>
  private async logExecution(result: ExecutionResult): Promise<void>
}
```

### File 3: `tools/wvo_mcp/scripts/run_wave0.ts`

**Purpose:** Entry point script for Wave 0

**Responsibilities:**
- Parse CLI arguments
- Initialize Wave0Runner
- Start main loop
- Handle top-level errors

**Size estimate:** ~20 LOC

**Key functions:**
```typescript
async function main(): Promise<void>
```

### Total LOC Estimate: ~150 LOC ✅

### File Count: 3 files ✅

**AFP Compliance:** Within micro-batching limits (≤5 files, ≤150 LOC)

---

## Data Flow

### Task Selection Flow

```
1. Call mcp__weathervane__plan_next({ minimal: true, limit: 1 })
   ↓
2. Filter tasks: status === "pending"
   ↓
3. Return first task (highest priority)
   ↓
4. If no tasks: sleep 5 min, retry
```

### Task Execution Flow

```
1. Create evidence directory: state/evidence/[TASK-ID]/
   ↓
2. Update task status: pending → in_progress (plan_update)
   ↓
3. Log start: { task_id, start_time, ... } → state/analytics/wave0_runs.jsonl
   ↓
4. Execute task:
   - For now: call existing MCP tools
   - Future: integrate with LLM for complex reasoning
   ↓
5. Handle result:
   - Success: status → done
   - Error: status → blocked, capture error
   ↓
6. Write summary: state/evidence/[TASK-ID]/summary.md
   ↓
7. Log completion: { task_id, end_time, status, ... } → analytics
   ↓
8. Return result
```

### Loop Control Flow

```
INIT:
  - Load checkpoint (if exists)
  - Setup signal handlers (SIGTERM, SIGINT)
  - Start loop

LOOP:
  1. Get next task
  2. If no task: sleep 5 min, continue
  3. Execute task
  4. Checkpoint state
  5. Sleep 5 min (rate limit)
  6. Repeat

SHUTDOWN:
  - On SIGTERM/SIGINT: finish current task
  - Checkpoint final state
  - Exit gracefully
```

---

## Integration Points

### Existing Systems

**1. MCP Tools Integration:**
- Use `mcp__weathervane__plan_next` for task loading
- Use `mcp__weathervane__plan_update` for status updates
- Use `mcp__weathervane__context_write` for summaries
- No changes to existing MCP tools needed ✅

**2. State Management:**
- Read from: state/roadmap.yaml
- Write to: state/analytics/wave0_runs.jsonl
- Evidence: state/evidence/[TASK-ID]/
- No schema changes needed ✅

**3. AFP Guardrails:**
- Micro-batching enforced in task executor
- Safety commands checked via existing guardrails
- Token budgets tracked in analytics
- No new guardrails needed ✅

### New Components

**Wave 0 Directory:**
- Create: `tools/wvo_mcp/src/wave0/` directory
- Contains: runner.ts, task_executor.ts
- Export: wave0 module for future use

**Analytics Log:**
- Create: `state/analytics/wave0_runs.jsonl`
- Format: One JSON object per line
- Fields: { task_id, start_time, end_time, status, tokens, errors }

**Run Script:**
- Create: `tools/wvo_mcp/scripts/run_wave0.ts`
- npm script: `"wave0": "npx tsx scripts/run_wave0.ts"`
- Usage: `npm run wave0`

---

## Implementation Strategy

### Phase 1: Scaffolding (30 min)

1. Create directory structure:
   ```bash
   mkdir -p tools/wvo_mcp/src/wave0
   mkdir -p state/analytics
   ```

2. Create stub files:
   - runner.ts (basic class structure)
   - task_executor.ts (basic class structure)
   - run_wave0.ts (entry point)

3. Add npm script to package.json:
   ```json
   {
     "scripts": {
       "wave0": "npx tsx scripts/run_wave0.ts"
     }
   }
   ```

### Phase 2: Core Implementation (2-3 hours)

1. Implement runner.ts:
   - Main loop logic
   - Task selection
   - Rate limiting
   - Signal handling

2. Implement task_executor.ts:
   - Evidence bundle creation
   - Task execution wrapper
   - Error handling
   - Analytics logging

3. Implement run_wave0.ts:
   - CLI argument parsing
   - Runner initialization
   - Error handling

### Phase 3: Testing (1 hour)

1. Build verification:
   ```bash
   cd tools/wvo_mcp && npm run build
   ```

2. Unit tests (if time permits):
   - Test task selection logic
   - Test error handling
   - Test logging

3. Manual testing:
   ```bash
   npm run wave0
   ```
   - Verify loop starts
   - Verify task selection
   - Verify graceful shutdown

## PLAN-authored Tests
- `npm --prefix tools/wvo_mcp run build` — ensure new Wave 0 modules compile (expected to fail until IMPLEMENT fills scaffolds).
- `npm --prefix tools/wvo_mcp run test -- wave0` — author initial unit/integration tests for runner + task executor.
- `npm run wave0 -- --once` — manual live run to confirm single-task execution on development roadmap.
- `ps aux | grep wave0` — verify background process alive during live-fire testing.
- `node tools/wvo_mcp/scripts/run_process_critic.mjs --check wave0` — ensure ProcessCritic passes once plan + implementation align.

### Phase 4: Production Validation (2-3 hours)

1. Select 10 test tasks from roadmap
2. Run Wave 0 on each task
3. Monitor execution
4. Capture learnings

---

## AFP/SCAS Alignment

### Via Negativa: What are we DELETING?

✅ **Deleted:**
- Complex planning logic
- Multi-agent coordination
- Advanced quality gates
- Sophisticated decision-making

✅ **Simplified:**
- Task selection: first pending task (not complex prioritization)
- Execution: direct MCP tool calls (not LLM reasoning)
- Logging: simple JSONL (not complex analytics)

### Refactor Not Repair

✅ **Not patching current autopilot** - creating new minimal system
✅ **Establishes evolutionary framework** - template for waves 1-N
✅ **Addresses root cause** - waterfall → evolutionary development

### Complexity Analysis

**Code complexity:** LOW
- 3 files, ~150 LOC
- Simple loop structure
- Direct MCP tool calls
- No complex state machine

**Cognitive complexity:** MINIMAL
- Clear responsibilities per file
- Obvious data flow
- Easy to understand in <10 minutes

**Maintenance burden:** LOW
- Few dependencies
- Simple error handling
- Clear extension points for future waves

**Complexity increase justified?** NO - this DECREASES complexity by establishing clear evolutionary path

---

## Risks and Mitigations

**Risk 1: Task execution fails (API errors, timeouts, etc.)**

**Mitigation:**
- Wrap all MCP calls in try/catch
- Log errors to analytics
- Mark task as "blocked" (not "failed")
- Continue to next task (don't crash)

**Risk 2: Wave 0 gets stuck on single task**

**Mitigation:**
- 30-minute timeout per task
- After timeout: mark blocked, move to next
- Log timeout reason for analysis

**Risk 3: Rate limiting too aggressive (wastes time)**

**Mitigation:**
- Start with 5-minute wait (conservative)
- Monitor utilization during testing
- Adjust based on learnings (Wave 1)

**Risk 4: Evidence bundles incomplete (logging fails)**

**Mitigation:**
- Evidence creation is best-effort
- Log errors but don't block task execution
- Missing evidence = opportunity to improve in Wave 1

---

## Testing Strategy

### Unit Tests (Optional for Wave 0)

Given time constraints and minimal complexity, unit tests are OPTIONAL for Wave 0.

**If time permits:**
- Test task selection logic
- Test error handling paths
- Test logging functions

**If no time:**
- Skip unit tests for Wave 0
- Rely on integration testing
- Add tests in Wave 1 if needed

### Integration Testing (Required)

**Manual integration tests:**
1. Start Wave 0: `npm run wave0`
2. Verify loop starts (logs show initialization)
3. Verify task selected from roadmap
4. Verify task execution (evidence created)
5. Verify status update (roadmap updated)
6. Verify graceful shutdown (CTRL+C)

**Production validation tests:**
1. Select 10 real tasks
2. Run Wave 0 with human monitoring
3. Capture success rate, errors, gaps
4. Document learnings

---

## Deployment Plan

### Rollout Strategy

**Phase 1: Controlled Testing (Day 1-2)**
- Deploy Wave 0 code
- Run manually with supervision
- Monitor closely for issues

**Phase 2: Production Validation (Day 2-3)**
- Run on 10 real tasks
- Low-risk tasks only (docs, analysis)
- Human review of outputs

**Phase 3: Analysis & Documentation (Day 3)**
- Analyze results
- Document learnings
- Define Wave 1

**Not planned for Wave 0:**
- Automated deployment
- Continuous operation
- Production monitoring dashboard
- (May add in future waves if needed)

---

## Success Metrics

**Development metrics:**
- Implementation time: ≤3 hours ✅
- LOC: ≤150 ✅
- Files: ≤3 ✅
- Build time: <5 seconds ✅

**Execution metrics:**
- Task completion rate: ≥80% (target)
- Execution time: ≤30 min per task (target)
- Error recovery: 100% (graceful, not crashes)
- Token efficiency: ≤500k per task

**Learning metrics:**
- Documented learnings: ≥5 worked, ≥3 broke, ≥5 gaps
- Wave 1 defined: clear scope based on gaps
- Process documented: template for future waves

---

## Next Steps

After PLAN phase:

1. **THINK phase:** Reason through edge cases and failure modes
2. **GATE phase:** Document design (design.md) - REQUIRED (>1 file changed)
3. **IMPLEMENT phase:** Write the code
4. **VERIFY phase:** Test it works
5. **REVIEW phase:** Quality check
6. **PR phase:** Human review
7. **MONITOR phase:** Track results

---

**PLAN Complete:** 2025-11-05
**Next Phase:** THINK (edge cases, failure modes, AFP/SCAS validation)
