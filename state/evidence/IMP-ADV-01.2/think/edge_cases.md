# IMP-ADV-01.2: Inject Hints into Planner Prompt - THINK

**Task ID**: IMP-ADV-01.2
**Phase**: THINK
**Date**: 2025-10-29
**Status**: In Progress

---

## Feature Flag Design

### Flag Definition

**Key**: `QUALITY_GRAPH_HINTS_INJECTION`

**Values**:
- `'off'` - Hints not retrieved or stored (skip quality graph query)
- `'observe'` - Hints retrieved and stored, logged to telemetry (default)
- `'enforce'` - Same as observe for now (future: require hints for planning)

**Default**: `'observe'`

**Rationale**:
- `off` allows instant disable if issues discovered
- `observe` enables data collection without blocking
- `enforce` reserved for future when prompt compiler uses hints

### Implementation in live_flags.ts

**Add to LIVE_FLAG_KEYS** (line 8-40):
```typescript
export const LIVE_FLAG_KEYS = [
  // ... existing flags ...
  'QUALITY_GRAPH_HINTS_INJECTION',  // NEW: add before closing bracket
] as const;
```

**Add to DEFAULT_LIVE_FLAGS** (line 46-78):
```typescript
export const DEFAULT_LIVE_FLAGS: LiveFlagSnapshot = {
  // ... existing defaults ...
  QUALITY_GRAPH_HINTS_INJECTION: 'observe',  // NEW: add before closing brace
};
```

**Add normalization logic** (line 84-174):
```typescript
export function normalizeLiveFlagValue<K extends LiveFlagKey>(
  key: K,
  raw: unknown,
): LiveFlagSnapshot[K] {
  const stringValue = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

  switch (key) {
    // ... existing cases ...

    case 'QUALITY_GRAPH_HINTS_INJECTION':  // NEW: add this case
      if (stringValue === 'enforce') return 'enforce' as LiveFlagSnapshot[K];
      if (stringValue === 'off') return 'off' as LiveFlagSnapshot[K];
      return 'observe' as LiveFlagSnapshot[K];  // default

    default: {
      return DEFAULT_LIVE_FLAGS[key] as LiveFlagSnapshot[K];
    }
  }
}
```

### Usage in plan_runner.ts

**Accessing the flag**:
```typescript
// Option 1: Via OrchestratorRuntime (if available)
const hintsMode = runtime.getLiveFlags().getValue('QUALITY_GRAPH_HINTS_INJECTION');

// Option 2: Via direct LiveFlags instance (if passed as dependency)
const hintsMode = deps.liveFlags.getValue('QUALITY_GRAPH_HINTS_INJECTION');

// Option 3: Via environment variable fallback (if LiveFlags unavailable)
const hintsMode = process.env.QUALITY_GRAPH_HINTS_INJECTION || 'observe';
```

**Conditional execution**:
```typescript
// In runPlan function, around line 56
if (deps.workspaceRoot) {
  const hintsMode = deps.liveFlags?.getValue('QUALITY_GRAPH_HINTS_INJECTION') ?? 'observe';

  if (hintsMode !== 'off') {  // observe or enforce
    try {
      logInfo('Querying quality graph for similar tasks', {
        taskId: task.id,
        hintsMode  // log the mode
      });

      qualityGraphHints = await getPlanningHints(/* ... */);

      // ... existing logging ...
    } catch (error) {
      // ... existing error handling ...
    }
  } else {
    logDebug('Quality graph hints disabled via feature flag', { taskId: task.id });
  }
}
```

### Flag Lifecycle

**Stage 1: Deployment** (Initial)
- Deploy with default='observe'
- Monitor telemetry for hint availability
- No user impact (hints not yet used for planning)

**Stage 2: Validation** (IMP-21)
- Prompt compiler reads hints from context pack
- A/B test with flag: observe vs enforce
- Measure planning improvement

**Stage 3: Enforcement** (IMP-35)
- Ablation study confirms improvement
- Change default to 'enforce'
- Hints required for all planning (if beneficial)

**Rollback**: Set to 'off' via SQLite or environment variable

---

## Telemetry Schema

### Log Event: Hints Retrieved

**Logger**: `logInfo`

**Message**: `'Quality graph hints retrieved and stored'`

**Metadata**:
```typescript
{
  taskId: string,           // Task being planned
  similarTasksCount: number, // Number of similar tasks found
  hintsLength: number,       // Character count of hints string
  hintsStored: true,        // Boolean flag (always true when logged)
  hintsMode: 'observe' | 'enforce'  // Current feature flag mode
}
```

**Example**:
```json
{
  "level": "info",
  "message": "Quality graph hints retrieved and stored",
  "taskId": "IMP-API-05",
  "similarTasksCount": 4,
  "hintsLength": 1823,
  "hintsStored": true,
  "hintsMode": "observe",
  "timestamp": "2025-10-29T12:34:56.789Z"
}
```

### Log Event: Hints Disabled

**Logger**: `logDebug`

**Message**: `'Quality graph hints disabled via feature flag'`

**Metadata**:
```typescript
{
  taskId: string,      // Task being planned
  hintsMode: 'off'    // Feature flag value
}
```

**Example**:
```json
{
  "level": "debug",
  "message": "Quality graph hints disabled via feature flag",
  "taskId": "IMP-API-05",
  "hintsMode": "off",
  "timestamp": "2025-10-29T12:34:56.789Z"
}
```

### Log Event: Hints Query Failed

**Logger**: `logWarning` (existing)

**Message**: `'Quality graph query failed (non-blocking)'`

**Metadata**:
```typescript
{
  taskId: string,     // Task being planned
  error: string,      // Error message
  hintsMode: string   // Feature flag value (for debugging)
}
```

**Example**:
```json
{
  "level": "warning",
  "message": "Quality graph query failed (non-blocking)",
  "taskId": "IMP-API-05",
  "error": "Python script timeout after 5s",
  "hintsMode": "observe",
  "timestamp": "2025-10-29T12:34:56.789Z"
}
```

### Telemetry Queries (Future)

**Hint availability rate**:
```sql
SELECT
  COUNT(*) FILTER (WHERE hintsStored = true) * 100.0 / COUNT(*) as availability_pct,
  AVG(similarTasksCount) as avg_similar_tasks,
  AVG(hintsLength) as avg_hints_length
FROM telemetry_logs
WHERE message = 'Quality graph hints retrieved and stored'
  AND timestamp > NOW() - INTERVAL '7 days';
```

**Hint usage by mode**:
```sql
SELECT
  hintsMode,
  COUNT(*) as query_count,
  AVG(similarTasksCount) as avg_similar_tasks
FROM telemetry_logs
WHERE message LIKE '%quality graph%'
  AND timestamp > NOW() - INTERVAL '7 days'
GROUP BY hintsMode;
```

---

## Edge Cases & Questions

### Edge Case 1: Empty Quality Graph Corpus

**Scenario**: Quality graph corpus is empty (no historical tasks)

**Behavior**:
- `getPlanningHints()` returns empty string
- `similarTasksCount` = 0
- No hints logged (existing behavior)
- Planner works normally (hints optional)

**Test**: Delete `state/quality_graph/task_vectors.jsonl`, run planning

**Resolution**: Working as designed (graceful degradation)

---

### Edge Case 2: Malformed Hints String

**Scenario**: `getPlanningHints()` returns non-markdown or corrupt string

**Behavior**:
- Hints stored as-is in context pack (no validation)
- Logged with hintsLength
- Future prompt compiler handles formatting

**Rationale**: Context pack is opaque storage, validation happens at consumption

**Test**: Mock `getPlanningHints()` to return invalid markdown

**Resolution**: No validation needed at storage layer

---

### Edge Case 3: Very Large Hints (>10KB)

**Scenario**: Many similar tasks create large hints string

**Behavior**:
- Current k=5 limit prevents this (5 tasks × ~500 chars = ~2.5KB)
- No truncation at storage layer
- Context pack has no size limit

**Mitigation**: Quality graph query already limits k=5

**Future**: If hints too large, prompt compiler can truncate/summarize

**Test**: Mock 10KB hints string, verify stored correctly

**Resolution**: Not a concern with current k=5 limit

---

### Edge Case 4: LiveFlags Unavailable

**Scenario**: LiveFlags system not initialized (early startup, tests)

**Behavior**:
```typescript
const hintsMode = deps.liveFlags?.getValue('QUALITY_GRAPH_HINTS_INJECTION') ?? 'observe';
```
- Optional chaining returns undefined
- Nullish coalescing defaults to 'observe'
- Hints are retrieved (safe default)

**Test**: Pass `liveFlags: undefined` to plan_runner

**Resolution**: Graceful fallback to default 'observe' mode

---

### Edge Case 5: Flag Changed Mid-Planning

**Scenario**: Flag changed from 'observe' to 'off' while planning in progress

**Behavior**:
- LiveFlags polls every 500ms
- Next planning cycle sees new value
- Current planning cycle completes with old value

**Impact**: No issue (eventual consistency within 500ms)

**Test**: Change flag during long-running planning

**Resolution**: Working as designed (polling-based flags)

---

### Edge Case 6: Concurrent Planning (Multiple Tasks)

**Scenario**: Multiple tasks planning simultaneously

**Behavior**:
- Each task queries quality graph independently
- Each task stores hints in own context pack (keyed by task.id)
- No race conditions (memory.set is synchronous)

**Test**: Run 10 tasks in parallel

**Resolution**: Thread-safe (context pack keyed by task ID)

---

### Edge Case 7: Hints Retrieved But Not Stored

**Scenario**: Planner agent called without hints parameter

**Behavior**:
- This would be a bug in plan_runner.ts
- Fixed by Task 3 in PLAN (pass hints to planner)

**Test**: Unit test verifies hints passed when available

**Resolution**: Prevented by implementation (Task 3)

---

### Edge Case 8: Backward Compatibility (Existing Code)

**Scenario**: Existing code calls planner without hints parameter

**Behavior**:
- `qualityGraphHints?: string` is optional
- `input.qualityGraphHints` is undefined
- Context pack stores undefined (same as not provided)

**Test**: Existing tests pass without modification

**Resolution**: Backward compatible (optional parameter)

---

## Questions & Answers

### Q1: Where does LiveFlags instance come from in plan_runner?

**Answer**: Plan runner is called from state_graph.ts, which has access to OrchestratorRuntime. Need to:
1. Pass LiveFlags to runPlan via deps parameter, OR
2. Access via runtime.getLiveFlags() if runtime available, OR
3. Fallback to environment variable if LiveFlags unavailable

**Preferred**: Add `liveFlags?: LiveFlagsReader` to PlanRunnerDeps interface

**Implementation**:
```typescript
export interface PlanRunnerDeps {
  planner: PlannerAgent;
  workspaceRoot?: string;
  liveFlags?: LiveFlagsReader;  // NEW: optional LiveFlags reader
}
```

---

### Q2: Should hints be validated before storage?

**Answer**: No validation needed.

**Rationale**:
- Context pack is opaque storage (no schema enforcement)
- Validation happens at consumption (prompt compiler)
- Storage layer should not know about hint format
- Allows hint format to evolve without changing storage

**Future**: Prompt compiler validates markdown format when reading

---

### Q3: How to test feature flag behavior without SQLite?

**Answer**: Use environment variable fallback for tests.

**Test approach**:
```typescript
// In test
process.env.QUALITY_GRAPH_HINTS_INJECTION = 'off';

await runPlan({ task, attemptNumber: 1 }, {
  planner,
  workspaceRoot,
  // liveFlags: undefined (triggers env var fallback)
});

// Verify hints not retrieved
```

**Alternative**: Mock LiveFlags reader
```typescript
const mockLiveFlags = {
  getValue: vi.fn().mockReturnValue('off')
};

await runPlan({ task, attemptNumber: 1 }, {
  planner,
  workspaceRoot,
  liveFlags: mockLiveFlags
});
```

---

### Q4: What if getPlanningHints throws unexpected error?

**Answer**: Already handled (plan_runner.ts:87-94).

**Current behavior**:
- try/catch wraps quality graph query
- Warning logged: "Quality graph query failed (non-blocking)"
- Planning continues without hints (graceful degradation)

**No changes needed**.

---

### Q5: Should 'enforce' mode block planning if hints unavailable?

**Answer**: Not in this task (deferred to IMP-21).

**Current implementation**: 'enforce' same as 'observe'

**Future (IMP-21)**: Prompt compiler can:
- Require hints when mode='enforce'
- Throw error if hints empty
- Or synthesize placeholder hints

**For now**: 'enforce' is a placeholder for future behavior

---

### Q6: How to measure hint effectiveness?

**Answer**: Deferred to IMP-35 (Prompt Eval Harness).

**Approach**:
1. A/B test: planning with hints vs without hints
2. Metrics: success rate, plan quality, task completion
3. Method: Run same task twice with different flag values

**Not measured in this task** (only enables capability)

---

## Worthiness Re-Check

### Is this still worth doing?

**Yes, because**:
1. Quality graph investment (~10 hours) achieves precision@5=0.780
2. Minimal work (2-3 hours) to enable hint usage
3. Forward-compatible with prompt compiler (IMP-21-24)
4. Feature flag allows easy rollback
5. Enables learning about hint effectiveness

**Red flags**: None found

---

## Alternative Approaches Rejected

### Alternative 1: Store Hints in Task Envelope

**Approach**: Add `qualityGraphHints` field to `TaskEnvelope.metadata`

**Pros**: Available to all agents, not just planner

**Cons**:
- Pollutes task metadata (hints are planning-specific)
- Persists to disk (hints are ephemeral context)
- Breaks task envelope immutability contract

**Decision**: Rejected - Wrong architecture layer

---

### Alternative 2: Pass Hints as Separate Runner Context Field

**Approach**: Add `qualityGraphHints` to `RunnerContext` interface

**Pros**: Available to all runners in state machine

**Cons**:
- Hints only relevant to planner (not thinker, implementer, etc.)
- Couples quality graph to runner interface
- Makes hints feel more important than they are

**Decision**: Rejected - Over-generalizing

---

### Alternative 3: Create HintsService Singleton

**Approach**: Global hints service that caches hints for current task

**Pros**: Accessible anywhere without passing through parameters

**Cons**:
- Adds global state (anti-pattern)
- Race conditions in concurrent planning
- Tight coupling across modules

**Decision**: Rejected - Poor architecture

---

## Migration Path to Prompt Compiler (IMP-21)

### Current State (After This Task)

**Plan Runner**:
```typescript
qualityGraphHints = await getPlanningHints(/* ... */);

const planResult = await planner.run({
  task,
  qualityGraphHints,  // Pass to planner
});
```

**Planner Agent**:
```typescript
const contextPack = {
  planHash,
  kb: kbPack,
  index: indexSnapshot,
  qualityGraphHints: input.qualityGraphHints,  // Store in context
};
this.deps.memory.set(task.id, 'planner', 'context_pack', contextPack);
```

**Result**: Hints stored in context pack, not used

---

### Future State (IMP-21: Prompt Compiler)

**State Graph Hook** (new file: `state_graph.ts`):
```typescript
// Before calling plan runner
const compiled = await promptCompiler.compile({
  phase: 'plan',
  task,
  contextPack: memory.get(task.id, 'planner', 'context_pack'),
});

const promptHash = compiled.hash;
const systemMessage = compiled.systemMessage;
const userMessage = compiled.userMessage;

// Prompt includes hints injected from context pack
// Store prompt hash in attestation
```

**Prompt Compiler** (new file: `prompt/compiler.ts`):
```typescript
class PromptCompiler {
  compile(params: CompileParams): CompiledPrompt {
    const { phase, task, contextPack } = params;

    // Read hints from context pack
    const hints = contextPack.qualityGraphHints;

    // Inject into prompt
    const systemMessage = this.assembleSystem(phase, hints);
    const userMessage = this.assembleUser(task, hints);

    return {
      systemMessage,
      userMessage,
      hash: this.hash(systemMessage + userMessage),
    };
  }

  private assembleSystem(phase: string, hints?: string): string {
    let prompt = `# System Prompt for ${phase}\\n\\n`;

    if (hints) {
      prompt += `## Context from Similar Tasks\\n\\n${hints}\\n\\n`;
    }

    // ... rest of prompt assembly
    return prompt;
  }
}
```

**Migration**: Zero code changes to plan_runner or planner_agent needed!

---

### Migration Checklist (For IMP-21)

**When implementing prompt compiler**:
1. ✅ Read hints from context pack (location: `memory.get(task.id, 'planner', 'context_pack').qualityGraphHints`)
2. ✅ Inject hints into system or user prompt (format: markdown section)
3. ✅ Test with feature flag: observe vs enforce
4. ✅ Measure planning improvement (ablation study in IMP-35)
5. ✅ Update documentation (migration complete)

**No changes needed to**:
- plan_runner.ts (still passes hints to planner)
- planner_agent.ts (still stores hints in context pack)
- Feature flag logic (still controls hint retrieval)

**Why this works**:
- Context pack is standard location for phase context
- Prompt compiler already reads from context pack (for kb, index, etc.)
- Adding hints is natural extension
- Separation of concerns: plan_runner prepares data, compiler uses data

---

## Next Steps

1. ✅ Complete STRATEGIZE (done)
2. ✅ Complete SPEC (done)
3. ✅ Complete PLAN (done)
4. ✅ Complete THINK (this document)
5. → IMPLEMENT: Execute Tasks 1-11 from PLAN
6. → VERIFY: Run tests, check telemetry, validate feature flag
7. → REVIEW: Forward-compatibility analysis, code quality
8. → PR: Commit with evidence, update prompting roadmap docs
9. → MONITOR: Track hint availability metrics

---

## References

- STRATEGIZE: `state/evidence/IMP-ADV-01.2/strategize/strategy.md`
- SPEC: `state/evidence/IMP-ADV-01.2/spec/spec.md`
- PLAN: `state/evidence/IMP-ADV-01.2/plan/plan.md`
- LiveFlags System: `tools/wvo_mcp/src/state/live_flags.ts`
- LiveFlags Reader: `tools/wvo_mcp/src/orchestrator/live_flags.ts`
- Plan Runner: `tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts`
- Planner Agent: `tools/wvo_mcp/src/orchestrator/planner_agent.ts`
