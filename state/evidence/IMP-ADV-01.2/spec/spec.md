# IMP-ADV-01.2: Inject Hints into Planner Prompt - SPEC

**Task ID**: IMP-ADV-01.2
**Phase**: SPEC
**Date**: 2025-10-29
**Status**: In Progress

---

## Acceptance Criteria

All criteria must be met for task completion:

### AC1: Hints Parameter Added to Planner Agent
**Criterion**: `PlannerAgentInput` interface accepts optional `qualityGraphHints` parameter

**Verification**:
```typescript
// tools/wvo_mcp/src/orchestrator/planner_agent.ts
export interface PlannerAgentInput {
  task: TaskEnvelope;
  attempt: number;
  requireDelta: boolean;
  modelSelection?: ModelSelection;
  qualityGraphHints?: string;  // NEW: optional hints
}
```

**Test**: TypeScript compilation succeeds, interface change reflected in types

**Evidence Location**: `state/evidence/IMP-ADV-01.2/implement/planner_agent_diff.patch`

---

### AC2: Hints Stored in Context Pack
**Criterion**: Planner agent stores hints in context pack when provided

**Verification**:
```typescript
// tools/wvo_mcp/src/orchestrator/planner_agent.ts
const contextPack = {
  planHash,
  kb: kbPack,
  index: indexSnapshot,
  summary: `Context pack for ${input.task.id}`,
  coverageTarget,
  proofMetadata,
  qualityGraphHints: input.qualityGraphHints,  // NEW: store hints
};
this.deps.memory.set(input.task.id, 'planner', 'context_pack', contextPack);
```

**Test**: Unit test verifies hints appear in context pack when provided

**Evidence Location**: `state/evidence/IMP-ADV-01.2/verify/context_pack_test.log`

---

### AC3: Plan Runner Passes Hints to Planner
**Criterion**: `plan_runner.ts` passes retrieved hints to planner agent

**Verification**:
```typescript
// tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts
const planResult = await deps.planner.run({
  task,
  attempt: attemptNumber,
  requireDelta: requirePlanDelta ?? false,
  modelSelection,
  qualityGraphHints,  // NEW: pass hints from line 53
});
```

**Test**: Integration test verifies hints flow from getPlanningHints() → planner.run() → context pack

**Evidence Location**: `state/evidence/IMP-ADV-01.2/verify/plan_runner_test.log`

---

### AC4: Feature Flag Controls Hint Injection
**Criterion**: LiveFlags system includes `quality_graph.hints_injection` flag with values: off/observe/enforce

**Verification**:
```typescript
// tools/wvo_mcp/src/state/live_flags.ts (or equivalent)
export interface LiveFlagsSchema {
  // ... existing flags
  quality_graph?: {
    hints_injection?: 'off' | 'observe' | 'enforce';
  };
}
```

**Flag Behavior**:
- `off`: Hints not retrieved or stored (bypass quality graph query)
- `observe` (default): Hints retrieved and stored, logged to telemetry
- `enforce`: Same as observe (actual injection happens in IMP-21)

**Test**: Flag can be set via environment variable or config file

**Evidence Location**: `state/evidence/IMP-ADV-01.2/verify/feature_flag_test.log`

---

### AC5: Telemetry Logs Hint Availability
**Criterion**: When hints are provided, telemetry logs hint metadata

**Verification**:
```typescript
// tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts
if (qualityGraphHints) {
  logInfo('Quality graph hints stored in context pack', {
    taskId: task.id,
    similarTasksCount,
    hintsLength: qualityGraphHints.length,
    hintsStored: true,
  });
}
```

**Test**: Telemetry output includes hint metadata when hints provided

**Evidence Location**: `state/evidence/IMP-ADV-01.2/verify/telemetry_output.log`

---

### AC6: Zero Regression in Existing Tests
**Criterion**: All existing planner and plan_runner tests pass without modification

**Verification**:
- Run `npm test` in `tools/wvo_mcp`
- Specifically verify:
  - `src/orchestrator/__tests__/state_runners/plan_runner.test.ts`
  - `src/orchestrator/planner_agent.ts` (if tests exist)

**Test**: CI build green, all existing tests pass

**Evidence Location**: `state/evidence/IMP-ADV-01.2/verify/test_results.json`

---

### AC7: Forward-Compatible with Prompt Compiler
**Criterion**: Hints stored in context pack follow structure that IMP-21 prompt compiler can consume

**Verification**:
- Hints stored as string in context pack (not complex object)
- Context pack location is standard (`RunEphemeralMemory`)
- No tight coupling to current planner implementation

**Test**: Manual review confirms migration path documented

**Evidence Location**: `state/evidence/IMP-ADV-01.2/think/migration_path.md`

---

### AC8: Documentation Updated
**Criterion**: Quality graph README and planner agent comments reflect hint injection

**Verification**:
- `tools/wvo_mcp/src/quality_graph/README.md` updated (usage section)
- `tools/wvo_mcp/src/orchestrator/planner_agent.ts` comments updated
- `tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts` TODO comment removed

**Test**: Documentation review confirms clarity

**Evidence Location**: `state/evidence/IMP-ADV-01.2/implement/doc_updates.md`

---

## KPIs

### Immediate (This Task)
1. **Hint Availability Rate**: % of plans with hints stored in context pack
   - Target: >80% (when quality graph has corpus)
   - Measurement: Telemetry logs `hintsStored: true`

2. **Hint Size**: Average length of hints string
   - Target: 500-2000 characters (5 similar tasks × ~200 chars each)
   - Measurement: Telemetry logs `hintsLength`

3. **Similar Tasks Count**: Average number of similar tasks per query
   - Target: 3-5 tasks (k=5, filtered by minSimilarity=0.3)
   - Measurement: Telemetry logs `similarTasksCount`

4. **Feature Flag Compliance**: Flag controls hint behavior correctly
   - Target: 100% compliance (off=no hints, observe=hints stored)
   - Measurement: Manual test with flag values

5. **Zero Regression**: All existing tests pass
   - Target: 100% pass rate (same as before changes)
   - Measurement: CI test results

### Future (IMP-21 Integration)
These KPIs require prompt compiler implementation:

1. **Planning Improvement**: Task success rate with hints vs without
   - Target: +5-10% success rate with hints
   - Measurement: Ablation study (IMP-35)

2. **Hint Usage Rate**: % of plans where hints influenced decisions
   - Target: >60% (hints used when relevant)
   - Measurement: Prompt compiler logs hint injection

3. **Plan Quality**: Human-rated or automated rubric scores
   - Target: +0.5 points on 5-point scale
   - Measurement: Plan quality rubric (IMP-35)

---

## Verification Mapping

Table mapping acceptance criteria to verification methods:

| AC# | Criterion | Verification Method | Evidence Artifact | Pass/Fail |
|-----|-----------|---------------------|-------------------|-----------|
| AC1 | Hints parameter added | TypeScript compilation + code review | `implement/planner_agent_diff.patch` | TBD |
| AC2 | Hints stored in context | Unit test: context pack inspection | `verify/context_pack_test.log` | TBD |
| AC3 | Plan runner passes hints | Integration test: end-to-end flow | `verify/plan_runner_test.log` | TBD |
| AC4 | Feature flag controls | Config test: flag behavior | `verify/feature_flag_test.log` | TBD |
| AC5 | Telemetry logs | Log inspection: hint metadata present | `verify/telemetry_output.log` | TBD |
| AC6 | Zero regression | CI test run: all tests pass | `verify/test_results.json` | TBD |
| AC7 | Forward-compatible | Manual review: migration path clear | `think/migration_path.md` | TBD |
| AC8 | Documentation updated | Doc review: clarity and accuracy | `implement/doc_updates.md` | TBD |

**Completion Gate**: ALL criteria must show "PASS" before advancing to PR phase.

---

## Non-Functional Requirements

### Performance
- **Latency**: Hint storage adds <1ms to planning (negligible)
- **Memory**: Context pack grows by ~1-2KB (hints string)
- **Throughput**: No impact on concurrent planning

**Rationale**: Hints already retrieved in plan_runner (lines 52-95), storage is O(1) operation

### Reliability
- **Graceful Degradation**: Planner works without hints (optional parameter)
- **Error Handling**: Quality graph query failure doesn't block planning (existing)
- **Rollback**: Feature flag can disable hints instantly

**Rationale**: Follows existing graceful degradation pattern (plan_runner.ts:87-94)

### Maintainability
- **Code Clarity**: Minimal changes (~15 lines total)
- **Test Coverage**: Existing tests cover base case, new tests cover hints case
- **Documentation**: Clear migration path to prompt compiler

**Rationale**: Minimal approach reduces maintenance burden

### Security
- **No Security Impact**: Hints are derived from internal task history, not external input
- **No PII**: Task vectors contain only technical metadata
- **No Secrets**: Quality graph doesn't store secrets

**Rationale**: Hints are internal context, not user-controlled input

---

## Out of Scope

Explicitly NOT part of this task (deferred to future work):

1. **Prompt Injection** (IMP-21): Actual LLM prompt assembly with hints
2. **Ablation Study** (IMP-35): Measuring planning improvement
3. **Prompt Templates** (IMP-23): Domain-specific hint formatting
4. **Neural Embeddings** (IMP-ADV-01.6): Improved hint relevance
5. **Hint Filtering**: Advanced filtering by domain, success rate, recency
6. **Hint Ranking**: Reranking hints by predicted usefulness
7. **Hint Summarization**: LLM-based hint condensation
8. **Cross-Task Learning**: Generalizing patterns across tasks

---

## Dependencies

### Upstream (Required Before This Task)
- ✅ IMP-ADV-01.3 (Similarity Evaluation) - COMPLETE
- ✅ Quality Graph Corpus - EXISTS (synthetic + real)
- ✅ Feature Flags System - EXISTS (LiveFlags)

### Downstream (Enabled By This Task)
- IMP-21 (Prompt Compiler) - Can read hints from context pack
- IMP-35 (Prompt Eval Harness) - Can measure hint effectiveness
- IMP-ADV-01.6 (Neural Embeddings) - Can improve hint relevance

### Parallel (Independent)
- IMP-ADV-01.4 (Corpus Size Monitoring) - Independent telemetry
- IMP-OBS-04 (Alert Scaffolding) - Independent observability
- IMP-OBS-05 (Metrics Dashboard) - Independent dashboard

---

## Rollback Plan

**Trigger Conditions**:
1. Feature flag test fails (hints not controlled correctly)
2. Regression in existing tests (AC6 fails)
3. Integration issues discovered in VERIFY
4. User requests rollback during observe mode

**Rollback Steps**:
1. Set `quality_graph.hints_injection=off` in config
2. Planner ignores hints parameter (backward compatible)
3. Plan runner skips quality graph query
4. Zero state migration needed (context pack backward compatible)

**Recovery Time**: Immediate (feature flag toggle)

**Data Loss**: None (hints are derived, not stored state)

---

## Risks & Mitigations

### Risk 1: Hints Don't Improve Planning (Medium Likelihood, Low Impact)
**Risk**: Even with high precision hints, planner decisions don't improve
**Mitigation**:
- Feature flag allows easy disable
- Learn from negative result (hints need better formatting? different injection point?)
- Defer measurement to IMP-35 (this task only enables capability)

### Risk 2: Context Pack Incompatibility (Low Likelihood, High Impact)
**Risk**: Prompt compiler (IMP-21) can't consume hints from context pack
**Mitigation**:
- Document clear migration path in THINK phase
- Store hints as simple string (not complex object)
- Use standard RunEphemeralMemory location

### Risk 3: Telemetry Noise (Low Likelihood, Low Impact)
**Risk**: Hint logging creates too much telemetry noise
**Mitigation**:
- Use logInfo (not logDebug) for hint availability
- Include only essential metadata (count, length, stored flag)
- Can adjust log level post-deployment

---

## Success Definition

**This task is COMPLETE when**:
1. ✅ All 8 acceptance criteria show "PASS" in verification table
2. ✅ Build succeeds with 0 errors
3. ✅ All existing tests pass (zero regression)
4. ✅ Feature flag controls hint behavior
5. ✅ Telemetry logs hint availability
6. ✅ Documentation updated with migration path
7. ✅ Evidence artifacts committed to git
8. ✅ MONITOR document confirms completion

**This task is BLOCKED if**:
- Prompt compiler (IMP-21) completes first → Integrate directly
- Quality graph corpus is empty → Wait for backfill
- Feature flag system unavailable → Build minimal flag support

**None of these blockers are present → PROCEED**

---

## Next Steps

1. ✅ Complete STRATEGIZE (done)
2. ✅ Complete SPEC (this document)
3. → PLAN: Break down into implementation subtasks
4. → THINK: Design feature flag behavior and telemetry schema
5. → IMPLEMENT: Make code changes (~15 lines)
6. → VERIFY: Run tests, check telemetry, validate feature flag
7. → REVIEW: Forward-compatibility review
8. → PR: Commit with evidence
9. → MONITOR: Track hint availability metrics

---

## References

- STRATEGIZE Document: `state/evidence/IMP-ADV-01.2/strategize/strategy.md`
- Quality Graph README: `tools/wvo_mcp/src/quality_graph/README.md`
- Plan Runner: `tools/wvo_mcp/src/orchestrator/state_runners/plan_runner.ts`
- Planner Agent: `tools/wvo_mcp/src/orchestrator/planner_agent.ts`
- LiveFlags System: `tools/wvo_mcp/src/state/live_flags.ts`
