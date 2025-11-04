# Phase 3 – State Graph Modularization & Incident Flow

## SPEC (Stage 1)

**Date**: 2025-10-26
**Executor**: Claude Council
**Phase**: 3 of 7 (Recovery Playbook)

---

## Goal

Modularize the state graph execution system by extracting per-state runners into independent, testable modules while ensuring retry ceilings, resolution loops, spike branches, and incident reporting are properly integrated.

**Why**: The current `state_graph.ts` is a 635-line monolithic file with all 8 states implemented in one giant switch statement (lines 123-434). This makes it:
- Hard to read and understand
- Difficult to test individual states in isolation
- Challenging to maintain and extend
- Prone to bugs due to tight coupling

**Solution**: Extract each state's execution logic into dedicated runner modules, making the system more modular, testable, and maintainable.

---

## Acceptance Criteria

### AC1: Per-State Runner Modules Created
- ✅ Create 8 runner modules (one per state):
  - `state_runners/specify_runner.ts`
  - `state_runners/plan_runner.ts`
  - `state_runners/thinker_runner.ts`
  - `state_runners/implement_runner.ts`
  - `state_runners/verify_runner.ts`
  - `state_runners/review_runner.ts`
  - `state_runners/pr_runner.ts`
  - `state_runners/monitor_runner.ts`

### AC2: Each Runner is Independently Testable
- ✅ Each runner exports a `run()` function with clear inputs/outputs
- ✅ Each runner has a corresponding test file (e.g., `specify_runner.test.ts`)
- ✅ Tests verify:
  - Success path (state completes successfully)
  - Failure path (state fails, triggers retry or resolution)
  - Retry ceiling enforcement
  - Plan delta requirements
  - Integration with incident reporter

### AC3: Retry Ceilings Enforced Per State
- ✅ Each runner respects `RETRY_LIMITS` from `state_graph.ts` (lines 23-32):
  - specify: 2 retries
  - plan: 2 retries
  - thinker: 1 retry
  - implement: 3 retries
  - verify: 2 retries
  - review: 2 retries
  - pr: 1 retry
  - monitor: 1 retry
- ✅ When retry ceiling exceeded → trigger incident reporter
- ✅ Incident reporter creates MRFC under `repro/<task>/`
- ✅ Incident reporter calls `policy.require_human()`

### AC4: Resolution Loop Integrated
- ✅ Verify runner integrates with `resolution_engine.ts` on gate failure
- ✅ Resolution result triggers:
  - Plan delta requirement
  - Thinker exploration (if `requiresThinker`)
  - Spike branch creation (if `spikeBranch`)
- ✅ Resolution traces recorded in artifacts

### AC5: Monitor State Enforces Plan Delta on Smoke Failure
- ✅ Monitor runner executes `scripts/app_smoke_e2e.sh`
- ✅ On smoke failure → force plan delta
- ✅ On smoke failure → return to plan state

### AC6: StateGraph Simplified
- ✅ `state_graph.ts` simplified from 635 lines to ~300 lines
- ✅ Giant switch statement replaced with clean runner delegation:
  ```typescript
  switch (current) {
    case 'specify': return await specifyRunner.run(context);
    case 'plan': return await planRunner.run(context);
    // ... etc
  }
  ```
- ✅ All state-specific logic moved to runners
- ✅ StateGraph only handles orchestration (flow control, retry tracking, checkpointing)

### AC7: Comprehensive Test Coverage
- ✅ 8 runner test files (one per state)
- ✅ Each runner tested for:
  - Happy path (success)
  - Failure path (retry/resolution)
  - Retry ceiling enforcement
  - Incident reporting
  - Integration with dependencies (planner, implementer, verifier, etc.)
- ✅ Integration test verifying full state graph flow with modular runners
- ✅ Stress tests for retry ceiling scenarios

---

## Relevant Documentation

### Architecture Docs
- `docs/autopilot/RECOVERY_PLAYBOOK.md` (Phase 3 definition)
- `docs/CONTEXT_SYSTEM.md` (Context assembly)
- `docs/MODEL_ROUTING_POLICY.md` (Router integration)

### Existing Code
- `src/orchestrator/state_graph.ts` (current monolith - 635 lines)
- `src/orchestrator/incident_reporter.ts` (MRFC creation)
- `src/orchestrator/resolution_engine.ts` (resolution logic)
- `src/orchestrator/planner_agent.ts` (plan state logic)
- `src/orchestrator/thinker_agent.ts` (thinker state logic)
- `src/orchestrator/implementer_agent.ts` (implement state logic)
- `src/orchestrator/verifier.ts` (verify state logic)
- `src/orchestrator/reviewer_agent.ts` (review state logic)
- `src/orchestrator/critical_agent.ts` (critical checks)
- `src/orchestrator/supervisor.ts` (specify/pr/monitor logic)

### Testing Standards
- `docs/UNIVERSAL_TEST_STANDARDS.md` (7-dimension testing)
- `CLAUDE.md` (stress testing requirements from Phase 1)
- `scripts/validate_test_quality.sh` (test quality validator)

---

## Constraints

### Performance
- **No regression**: Modularization must not slow down state execution
- **Target**: State transitions remain < 100ms overhead
- **Memory**: No memory leaks from runner instantiation/cleanup

### Compatibility
- **Backward compatible**: Existing state graph API unchanged
- **No breaking changes**: TaskEnvelope, StateGraphResult interfaces unchanged
- **Dependencies**: Runners depend on existing agents (planner, implementer, etc.) without modification

### Security
- **No secret exposure**: Runners must not log sensitive context
- **MRFC safety**: Incident reporter must not include secrets in repro artifacts

### Testing
- **7-dimension coverage**: All runners tested against UNIVERSAL_TEST_STANDARDS.md
- **Stress testing**: Retry ceiling scenarios tested with 100+ iterations
- **Integration testing**: Full state graph flow tested end-to-end

---

## Current State Analysis

### What Exists
1. ✅ `state_graph.ts` - monolithic implementation (635 lines)
2. ✅ `incident_reporter.ts` - MRFC creation
3. ✅ `resolution_engine.ts` - resolution logic
4. ✅ Retry ceiling tracking (lines 23-32, 460-477)
5. ✅ Plan delta enforcement (lines 492-495)
6. ✅ Spike branch tracking (lines 84, 319-322)
7. ✅ Monitor smoke testing (lines 398-407, 628-633)
8. ✅ Incident reporting on retry ceiling (lines 471-516)

### What's Missing
1. ❌ Per-state runner modules
2. ❌ Independent tests for each state runner
3. ❌ Clean separation of orchestration vs execution logic
4. ❌ Simplified state graph coordinator
5. ❌ Stress tests for retry ceiling scenarios

---

## Dependencies

### Required Files (Unchanged)
- `planner_agent.ts`, `thinker_agent.ts`, `implementer_agent.ts`, `verifier.ts`, `reviewer_agent.ts`, `critical_agent.ts`, `supervisor.ts`
- `model_router.ts`, `resolution_engine.ts`, `incident_reporter.ts`
- `task_envelope.ts`, `router_policy.ts`
- `memory/decision_journal.ts`, `memory/run_ephemeral.ts`
- `context/context_assembler.ts`

### New Files (To Create)
- `state_runners/` directory with 8 runner modules
- 8 corresponding test files
- Integration test for modular state graph
- Stress test for retry ceilings

---

## Success Metrics

### Code Quality
- `state_graph.ts` reduced from 635 lines to ~300 lines
- Each runner module < 150 lines
- Test coverage 100% for all runners
- 0 linting/type errors

### Test Quality
- 8 runner test files (7-dimension coverage each)
- 1 integration test (end-to-end state graph flow)
- 1 stress test (retry ceiling scenarios)
- All tests pass (100% pass rate)
- Test execution time < 5s for all runner tests combined

### Performance
- State transition overhead < 100ms
- Memory growth < 1MB for 1000 state transitions
- No resource leaks (temp files cleaned up)

### Maintainability
- Each state's logic isolated in dedicated module
- Clear interfaces between runners and state graph
- Easy to add new states (just add new runner)
- Easy to test individual states in isolation

---

## Out of Scope (Explicitly Not Included)

### Future Phases
- ❌ Agents, Reviewer Rubric, Critical Pass (Phase 4)
- ❌ CI, Scripts, Integration Tests (Phase 5)
- ❌ Telemetry & Documentation (Phase 6)
- ❌ Acceptance & Rollout (Phase 7)

### Not Required by Phase 3
- ❌ New state types (stick to existing 8 states)
- ❌ Changes to agent implementations
- ❌ Model router modifications
- ❌ Context assembly changes
- ❌ Decision journal schema changes

### Deferred to Later
- ❌ Performance optimizations (beyond no-regression)
- ❌ Advanced retry strategies (exponential backoff, etc.)
- ❌ Distributed state graph execution
- ❌ State graph visualization tools

---

## Risk Assessment

### High Risk
- **Breaking changes**: Modularization could break existing integrations
  - *Mitigation*: Keep StateGraph API unchanged, maintain backward compatibility
  - *Mitigation*: Comprehensive integration tests before/after

### Medium Risk
- **Performance regression**: Additional function calls could slow down state execution
  - *Mitigation*: Performance benchmarks before/after
  - *Mitigation*: Target < 100ms overhead per transition

- **Test coverage gaps**: Missing edge cases in runner tests
  - *Mitigation*: Use UNIVERSAL_TEST_STANDARDS.md checklist
  - *Mitigation*: Stress tests for retry ceilings
  - *Mitigation*: Integration test for full flow

### Low Risk
- **Code duplication**: Helper methods duplicated across runners
  - *Mitigation*: Extract shared utilities to `state_runners/utils.ts`

---

## Next Steps (Stage 2: PLAN)

Once this SPEC is approved, proceed to PLAN stage:
1. Break down implementation into concrete steps
2. Identify specific files to create/modify
3. List exact commands to run for verification
4. Estimate time/complexity for each step
5. Record plan hash in journal

**SPEC Status**: ✅ COMPLETE
**Ready for**: PLAN stage

---

**Executor**: Claude Council
**Date**: 2025-10-26
**Protocol Stage**: 1/8 (SPEC)
