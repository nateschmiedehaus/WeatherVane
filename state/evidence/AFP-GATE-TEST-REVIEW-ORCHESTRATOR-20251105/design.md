# Design Document: UnifiedOrchestrator Decomposition Strategy

**Task**: AFP-GATE-TEST-REVIEW-ORCHESTRATOR-20251105
**Date**: 2025-11-05
**Complexity**: Complex (Architectural Planning)
**Type**: PLANNING TASK (NOT IMPLEMENTATION)

---

## Executive Summary

The `unified_orchestrator.ts` file is a 3,858 LOC monolith that violates AFP/SCAS principles at scale. This document defines a **Strangler Fig decomposition strategy** to gradually extract concerns into separate modules over 7 distinct phases, each under the 150 LOC limit.

**Key metrics:**
- Current: 3,858 LOC, 50+ dependencies, 113 methods
- Target: ~2,400 LOC across 8 modules (37% reduction via via negativa)
- Approach: 7 sequential extraction phases
- Timeline: 7 separate tasks, each 3-6 hours

---

## Problem Statement

### Current State: Monolithic Architecture

The `UnifiedOrchestrator` class has accumulated responsibilities over time, creating a "God Object" anti-pattern:

**Responsibilities (13 major concerns):**
1. **Agent Lifecycle Management** - Spawning orchestrator, workers, critics, architecture agents
2. **Task Execution** - Core execution loop, task assignment
3. **Escalation & Remediation** - Escalating remediation, agent upgrades, forced releases
4. **Background Task Coordination** - Orchestrator background tasks, idle handling
5. **Roadmap Management** - Updates, prefetching, parent completion checks
6. **Agent Monitoring** - Snapshots, progress tracking, telemetry
7. **Preflight Validation** - Pre-execution checks
8. **Output Validation** - Post-execution validation
9. **Model Selection** - Complexity assessment, routing
10. **Policy Control** - Policy directive management
11. **Health Monitoring** - Autopilot health tracking
12. **Process Management** - Process lifecycle
13. **Context Assembly Coordination** - Integration with ContextAssembler

**Problems:**
- **Testability**: Impossible to unit test - too many dependencies
- **Maintainability**: Changes in one area break unrelated areas
- **Cognitive Load**: 3,858 LOC cannot be reasoned about as a unit
- **AFP Violation**: Massive violation of single responsibility principle
- **Micro-batching Violation**: 26x the size limit - cannot fix in one batch

### Why This Matters

This is not just technical debt - it's an **architectural crisis**:
- New features require touching this file → high risk of regression
- Testing is brittle → confidence is low
- Onboarding is impossible → knowledge concentrated in few developers
- AFP principles cannot be applied → quality suffers

---

## Via Negativa Analysis

**Central Question: What can we DELETE, not just move?**

### Deletion Opportunities (Target: 600+ LOC)

1. **Dead Code** (~100 LOC)
   - Unused private methods
   - Commented-out code blocks
   - Legacy compatibility shims

2. **Over-Abstraction** (~200 LOC)
   - Wrapper methods that just delegate
   - Unnecessary error handling layers
   - Redundant telemetry calls

3. **Duplicate Logic** (~150 LOC)
   - Agent spawning patterns repeated 5x (orchestrator, worker, critic, planner, reviewer)
   - Similar error handling in multiple methods
   - Redundant validation checks

4. **Obsolete Features** (~150 LOC)
   - Features superseded by newer implementations
   - Experimental code paths no longer used
   - Migration code from old architectures

**Principle:** Extract THEN simplify. Don't just move code - delete what's unnecessary during extraction.

---

## Alternatives Considered

### Alternative 1: Big Bang Refactor

**Approach:** Rewrite the entire orchestrator from scratch in one go.

**Pros:**
- Clean slate
- Perfect architecture

**Cons:**
- Violates micro-batching by 26x
- Extremely high risk
- Requires freeze on current orchestrator
- Months of work before any value

**Verdict:** ❌ REJECTED - Too risky, violates AFP principles

### Alternative 2: Strangler Fig Pattern (CHOSEN)

**Approach:** Extract one concern at a time, old code delegates to new module.

**Phases:**
1. Extract AgentLifecycleManager
2. Extract TaskExecutionEngine
3. Extract EscalationCoordinator
4. Extract BackgroundTaskScheduler
5. Extract PreflightValidator
6. Extract ModelSelectionService
7. Refactor remaining core (delete 500+ LOC)

**Pros:**
- Each phase is a separate task under limits
- Low risk - old code continues working
- Incremental value delivery
- Easy to test each extraction

**Cons:**
- Takes longer (7 tasks vs 1)
- Temporary duplication during migration
- Requires discipline to not skip phases

**Verdict:** ✅ CHOSEN - Low risk, AFP-compliant, deliverable incrementally

### Alternative 3: Freeze + Parallel Rewrite

**Approach:** Stop changes to current orchestrator, build new one in parallel, switch when ready.

**Pros:**
- No migration complexity
- Can design ideal architecture

**Cons:**
- Duplicate effort
- Business needs don't stop
- High risk cutover
- "Big Bang" problem delayed, not solved

**Verdict:** ❌ REJECTED - Violates iterative delivery

---

## Decomposition Strategy: Strangler Fig Approach

### Overview

We will extract concerns one at a time using the Strangler Fig pattern:

1. **Create new module** for extracted concern
2. **Implement extracted functionality** in new module
3. **Update UnifiedOrchestrator** to delegate to new module
4. **Delete old implementation** from UnifiedOrchestrator
5. **Add tests** for new module
6. **Repeat** for next concern

**Each extraction is a separate task, each under 150 LOC.**

### Module Boundaries

```
CURRENT:
  UnifiedOrchestrator (3,858 LOC)
    ├─ Everything

TARGET:
  UnifiedOrchestrator (800 LOC) - Coordination only
    ├─ AgentLifecycleManager (400 LOC)
    ├─ TaskExecutionEngine (600 LOC)
    ├─ EscalationCoordinator (350 LOC)
    ├─ BackgroundTaskScheduler (300 LOC)
    ├─ PreflightValidator (200 LOC)
    ├─ ModelSelectionService (250 LOC)
    └─ [Via Negativa: 600 LOC DELETED]
```

### Dependency Flow

```
UnifiedOrchestrator
  ↓ delegates to
  ├─ AgentLifecycleManager (manages agent spawning)
  │   ├─ AgentPool (existing)
  │   └─ ProcessManager (existing)
  │
  ├─ TaskExecutionEngine (executes tasks)
  │   ├─ ContextAssembler (existing)
  │   ├─ CodeSearchIndex (existing)
  │   └─ AgentPool (existing)
  │
  ├─ EscalationCoordinator (handles failures)
  │   ├─ FailureResponseManager (existing)
  │   ├─ BlockerEscalationManager (existing)
  │   └─ TaskExecutionEngine (new)
  │
  ├─ BackgroundTaskScheduler (orchestrator tasks)
  │   ├─ orchestrator_background_tasks (existing)
  │   └─ IdleManager (existing)
  │
  ├─ PreflightValidator (pre-execution checks)
  │   ├─ PreflightRunner (existing)
  │   ├─ TaskReadinessChecker (existing)
  │   └─ PolicyController (existing)
  │
  └─ ModelSelectionService (routing logic)
      ├─ model_router (existing)
      └─ AgentHierarchy (existing)
```

**Extraction Order (determined by dependencies):**
1. **ModelSelectionService** (no dependencies on other new modules)
2. **AgentLifecycleManager** (no dependencies on other new modules)
3. **PreflightValidator** (no dependencies on other new modules)
4. **TaskExecutionEngine** (depends on AgentLifecycleManager)
5. **BackgroundTaskScheduler** (depends on TaskExecutionEngine)
6. **EscalationCoordinator** (depends on TaskExecutionEngine)
7. **Core Refactor** (delete 600 LOC, simplify remaining)

---

## Phase Execution Plan

### Phase 1: Extract ModelSelectionService

**Goal:** Isolate model selection and complexity assessment logic.

**LOC estimate:** +130 new, -150 deleted from orchestrator = -20 net

**Files:**
- CREATE: `src/orchestrator/model_selection_service.ts`
- MODIFY: `unified_orchestrator.ts` (remove model selection logic)

**Responsibilities:**
- `assessComplexity(task: Task): TaskComplexity`
- `selectModelForTask(task: Task, context: any): {provider, model, tier}`
- Integration with ModelRouterTelemetryTracker
- Integration with AgentHierarchy

**Dependencies:**
- model_router (existing)
- AgentHierarchy (existing)
- ModelRouterTelemetryTracker (existing)

**Why first:** No dependencies on other new modules, clear boundaries.

**Testing:** Unit tests for complexity assessment, model selection logic.

**Risk:** Low - pure logic, no state mutations.

---

### Phase 2: Extract AgentLifecycleManager

**Goal:** Consolidate agent spawning logic into a single module.

**LOC estimate:** +140 new, -180 deleted from orchestrator = -40 net

**Files:**
- CREATE: `src/orchestrator/agent_lifecycle_manager.ts`
- MODIFY: `unified_orchestrator.ts` (remove spawning logic)

**Responsibilities:**
- `spawnOrchestrator(): Promise<Agent>`
- `spawnWorker(): Promise<Agent>`
- `spawnCritic(): Promise<Agent>`
- `spawnArchitecturePlanner(): Promise<Agent>`
- `spawnArchitectureReviewer(): Promise<Agent>`
- Agent initialization patterns
- Authentication checks

**Dependencies:**
- AgentPool (existing)
- ProcessManager (existing)
- CodexExecutor / ClaudeExecutor (existing)

**Why second:** Independent of other extractions, reduces orchestrator LOC significantly.

**Testing:** Unit tests for each spawn method, integration tests for auth.

**Risk:** Medium - agent spawning is critical path, but logic is isolated.

**Via Negativa:** Eliminate duplicate spawning patterns - 5 methods become 1 generic method + 5 simple wrappers.

---

### Phase 3: Extract PreflightValidator

**Goal:** Centralize pre-execution validation logic.

**LOC estimate:** +100 new, -120 deleted from orchestrator = -20 net

**Files:**
- CREATE: `src/orchestrator/preflight_validator.ts`
- MODIFY: `unified_orchestrator.ts` (remove preflight logic)

**Responsibilities:**
- `validateTask(task: Task): ValidationResult`
- Integration with PreflightRunner
- Integration with TaskReadinessChecker
- Policy directive checks
- Task readiness checks

**Dependencies:**
- PreflightRunner (existing)
- TaskReadinessChecker (existing)
- PolicyController (existing)

**Why third:** Independent, removes clutter from main execution path.

**Testing:** Unit tests for validation logic, integration tests for policy checks.

**Risk:** Low - validation failures are already handled gracefully.

---

### Phase 4: Extract TaskExecutionEngine

**Goal:** Isolate core task execution logic.

**LOC estimate:** +150 new, -200 deleted from orchestrator = -50 net

**Files:**
- CREATE: `src/orchestrator/task_execution_engine.ts`
- MODIFY: `unified_orchestrator.ts` (remove execution logic)

**Responsibilities:**
- `executeTask(task: Task, agent: Agent): Promise<ExecutionResult>`
- Context assembly coordination
- Output validation
- Telemetry recording
- Error handling

**Dependencies:**
- AgentLifecycleManager (new - Phase 2)
- ContextAssembler (existing)
- OutputValidator (existing)
- AgentPool (existing)

**Why fourth:** Depends on AgentLifecycleManager, central to remaining extractions.

**Testing:** Integration tests for task execution, unit tests for error handling.

**Risk:** High - core execution path, requires careful migration.

**Via Negativa:** Delete redundant error handling layers, simplify telemetry.

---

### Phase 5: Extract BackgroundTaskScheduler

**Goal:** Separate orchestrator background task logic.

**LOC estimate:** +120 new, -140 deleted from orchestrator = -20 net

**Files:**
- CREATE: `src/orchestrator/background_task_scheduler.ts`
- MODIFY: `unified_orchestrator.ts` (remove background task logic)

**Responsibilities:**
- `getNextBackgroundTask(): Task | null`
- `scheduleBackgroundTask(agent: Agent): Promise<void>`
- `handleIdleWorkers(): Promise<void>`
- Integration with orchestrator_background_tasks module

**Dependencies:**
- TaskExecutionEngine (new - Phase 4)
- orchestrator_background_tasks (existing)
- IdleManager (existing)

**Why fifth:** Depends on TaskExecutionEngine.

**Testing:** Unit tests for scheduling logic, integration tests for idle handling.

**Risk:** Medium - background tasks are non-critical path, but must not block main execution.

---

### Phase 6: Extract EscalationCoordinator

**Goal:** Centralize escalation and remediation logic.

**LOC estimate:** +140 new, -180 deleted from orchestrator = -40 net

**Files:**
- CREATE: `src/orchestrator/escalation_coordinator.ts`
- MODIFY: `unified_orchestrator.ts` (remove escalation logic)

**Responsibilities:**
- `performEscalatingRemediation(task: Task, attempts: number): Promise<void>`
- `upgradeAgentModel(agent: Agent): Promise<void>`
- `forceReleaseAgentAndBlockTask(task: Task): Promise<void>`
- `calculateBackoffDelay(attempts: number): number`
- Escalation level management
- Remediation state tracking

**Dependencies:**
- TaskExecutionEngine (new - Phase 4)
- FailureResponseManager (existing)
- BlockerEscalationManager (existing)

**Why sixth:** Depends on TaskExecutionEngine.

**Testing:** Unit tests for escalation logic, integration tests for remediation.

**Risk:** Medium - escalation is critical for failure recovery, but well-isolated.

**Via Negativa:** Simplify escalation levels (currently 7 levels, likely over-engineered).

---

### Phase 7: Core Refactor & Via Negativa Cleanup

**Goal:** Delete dead code, simplify remaining orchestrator, finalize architecture.

**LOC estimate:** +50 new (cleanup), -600 deleted = -550 net

**Files:**
- MODIFY: `unified_orchestrator.ts` (simplify, delete dead code)

**Activities:**
1. **Delete dead code** (~100 LOC)
   - Unused private methods
   - Commented-out blocks
   - Legacy compatibility code

2. **Delete over-abstraction** (~200 LOC)
   - Wrapper methods that just delegate
   - Unnecessary error handling layers

3. **Simplify remaining coordination** (~300 LOC)
   - Remove redundant checks
   - Simplify event emission
   - Consolidate telemetry

4. **Final architecture verification**
   - Ensure all concerns extracted
   - Verify test coverage
   - Document final architecture

**Why seventh:** After all extractions, remaining code is much easier to reason about and simplify.

**Testing:** Full integration test suite, regression tests.

**Risk:** Low - most risky code already extracted.

**Via Negativa:** This is where we achieve the 600 LOC deletion target.

---

## LOC Accounting

### Current State
- unified_orchestrator.ts: 3,858 LOC

### Target State (after all 7 phases)
| Module | LOC | Type |
|--------|-----|------|
| ModelSelectionService | 130 | NEW |
| AgentLifecycleManager | 140 | NEW |
| PreflightValidator | 100 | NEW |
| TaskExecutionEngine | 150 | NEW |
| BackgroundTaskScheduler | 120 | NEW |
| EscalationCoordinator | 140 | NEW |
| unified_orchestrator.ts | 800 | REFACTORED |
| **Via Negativa (DELETED)** | **-600** | **DELETED** |
| **TOTAL** | **1,580** | **-2,278 from original** |

**Net reduction: 2,278 LOC (59% reduction)**

Wait, that doesn't add up correctly. Let me recalculate:
- Original: 3,858 LOC
- New modules: 130 + 140 + 100 + 150 + 120 + 140 = 780 LOC
- Remaining orchestrator: 800 LOC
- Total after: 1,580 LOC
- Deleted: 3,858 - 1,580 = 2,278 LOC ✓

---

## Complexity Analysis

**Does decomposition increase or decrease complexity?**

**NET DECREASE:**
- **Cognitive Complexity**: 8 smaller modules easier to understand than 1 monolith
- **Test Complexity**: Each module can be unit tested in isolation
- **Change Risk**: Changes localized to specific concerns
- **Onboarding**: New developers can understand one module at a time

**Temporary Increase During Migration:**
- Delegation overhead (old → new modules)
- Dual maintenance during transition
- Integration complexity

**Trade-off:** Temporary increase for long-term massive decrease. Worth it.

---

## Testing Strategy

### Maintaining Correctness During Decomposition

**Principle:** Never break existing functionality. Each phase must pass all existing tests.

**Approach:**

1. **Baseline:** Run full test suite before Phase 1 (capture golden output)

2. **Per-Phase Testing:**
   - Write unit tests for NEW module
   - Verify integration tests still pass
   - Add regression tests for extracted concern

3. **Migration Pattern:**
   ```typescript
   // BEFORE (in UnifiedOrchestrator)
   private async spawnWorker() {
     // ... 50 LOC of logic
   }

   // AFTER Phase 2 (delegate to new module)
   private async spawnWorker() {
     return this.agentLifecycleManager.spawnWorker();
   }
   ```

4. **Validation:**
   - Old behavior = new behavior (contract tests)
   - Performance unchanged (benchmark tests)
   - Integration tests pass (end-to-end tests)

5. **Safety Net:**
   - Feature flags for gradual rollout
   - Rollback plan for each phase
   - Monitoring for regression detection

---

## Risk Assessment

### Risks Per Phase

| Phase | Risk Level | Mitigation |
|-------|-----------|------------|
| 1. ModelSelectionService | LOW | Pure logic, no state |
| 2. AgentLifecycleManager | MEDIUM | Critical path, but isolated |
| 3. PreflightValidator | LOW | Validation failures already handled |
| 4. TaskExecutionEngine | HIGH | Core execution, requires careful migration + extensive testing |
| 5. BackgroundTaskScheduler | MEDIUM | Non-critical path |
| 6. EscalationCoordinator | MEDIUM | Critical for failures, but isolated |
| 7. Core Refactor | LOW | Most risk already extracted |

### Global Risks

**Risk 1: Breaking existing behavior**
- **Likelihood:** Medium
- **Impact:** High
- **Mitigation:** Extensive integration tests, feature flags, phased rollout

**Risk 2: Performance degradation**
- **Likelihood:** Low
- **Impact:** Medium
- **Mitigation:** Benchmark tests, profiling after each phase

**Risk 3: Incomplete extraction (missed responsibilities)**
- **Likelihood:** Low
- **Impact:** Medium
- **Mitigation:** Comprehensive code review, responsibility mapping

**Risk 4: Abandonment (phases 1-3 done, 4-7 never completed)**
- **Likelihood:** Medium (if not prioritized)
- **Impact:** Medium (partial improvement, but incomplete)
- **Mitigation:** Commit to all 7 phases, block new features until complete

---

## Exit Criteria

**This decomposition succeeds if:**

✅ **All 7 phases completed**
- Each phase is a separate committed task
- Each phase passes all tests
- Each phase under 150 LOC net change

✅ **Via negativa achieved**
- At least 600 LOC deleted
- No unnecessary code remains
- Architecture is simplified, not just redistributed

✅ **Quality improved**
- Test coverage increased (unit tests for new modules)
- Cognitive load decreased (smaller modules)
- Change velocity increased (easier to modify)

✅ **AFP/SCAS compliance restored**
- Single responsibility principle restored
- Each module has clear boundaries
- Micro-batching limits respected

---

## AFP/SCAS Compliance

### Via Negativa
- **Target:** 600 LOC deleted
- **Approach:** Delete during extraction, not after
- **Principle:** Extract THEN simplify

### Refactor Not Repair
- This IS a refactoring (architectural improvement)
- Justified by massive SRP violation
- Not a patch - fundamental restructuring

### Complexity
- **Current:** Impossible to reason about 3,858 LOC
- **Target:** 8 modules averaging 250 LOC each
- **Net decrease** in cognitive complexity

### Micro-batching
- **Compliant:** Each phase under 150 LOC net change
- **Phases:** 7 separate tasks
- **Deliverable:** Incremental value

---

## Recommendations

1. **Commit to all 7 phases** - Don't stop after Phase 3
2. **Maintain test coverage** - Every extracted module needs unit tests
3. **Document architecture** - Update docs after each phase
4. **Monitor for regression** - Watch for behavior changes
5. **Celebrate wins** - Each phase is a significant improvement

---

## Meta: This is a PLANNING document

**This document does NOT include:**
- TypeScript code
- Implementation details
- Specific line-by-line changes

**This document DOES include:**
- Architectural strategy
- Phase-by-phase plan
- Risk assessment
- Via negativa analysis
- Testing strategy

**Next steps:**
1. GATE review of THIS document
2. If approved, create 7 separate task briefs (one per phase)
3. Execute Phase 1 (separate task)
4. Repeat for Phases 2-7

This is architectural planning, not implementation.
