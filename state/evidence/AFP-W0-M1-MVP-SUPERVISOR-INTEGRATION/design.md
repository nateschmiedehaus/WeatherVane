# Design: AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION

> **Purpose:** Document design thinking for integrating supervisor components (LeaseManager + LifecycleTelemetry) into Wave0Runner and validating with live autopilot testing.

---

## Context

**What problem are you solving and WHY?**

**Problem:** Batch 1 created supervisor scaffold components (LeaseManager, LifecycleTelemetry, types) totaling 123 LOC, but these components are NOT integrated with Wave0 autopilot. They exist in isolation and have never been used in production.

**Root cause:** Batch 1 focused on component implementation, deferred integration to Batch 2.

**Goal:** Wire supervisor components into Wave0Runner so that:
1. Tasks are coordinated via lease management (prevents duplicate execution)
2. Lifecycle events are emitted (provides observability into supervisor behavior)
3. Integration is validated with LIVE Wave0 autopilot running REAL tasks (not just unit tests)

**Why this matters:**
- Supervisor orchestration is foundation for multi-agent coordination
- Lease management prevents race conditions in distributed autopilot
- Lifecycle telemetry provides visibility for debugging and monitoring
- User explicitly requires: "real live autopilot and supervisor doing what a supervisor should do"

---

## Five Forces Check

**Before proceeding, verify you've considered all five forces:**

### COHERENCE - Match the terrain

- [x] I searched for similar patterns in the codebase
- **Modules checked (3 most similar):**
  1. `tools/wvo_mcp/src/wave0/runner.ts` - Main loop with task execution
  2. `autopilot_mvp/supervisor/lease_manager.ts` - Lease coordination
  3. `autopilot_mvp/supervisor/lifecycle_telemetry.ts` - Event emission

- **Pattern I'm reusing:** Integration pattern - adding instrumentation/coordination to existing loop
  - Similar to how logging/telemetry is added to request handlers
  - Wrap existing logic with before/after hooks (lease acquire/release, event emit)
  - Non-invasive: doesn't change core task execution logic

**Pattern search results:**
- Similar pattern in MCP server tools (orchestrator/tool_handler.ts) - wraps tool calls with telemetry
- Similar pattern in task executor (wave0/task_executor.ts) - wraps execution with logging
- Common integration pattern: minimal changes to existing loop, additive instrumentation

### ECONOMY - Achieve more with less

- [x] I explored deletion/simplification (via negativa - see next section)
- **Code I can delete:** None - supervisor components are new, Wave0Runner is minimal
- **Why I must add:** Supervisor orchestration doesn't exist, must be added
- **LOC estimate:** +78 -0 = net 78 LOC (≤150 limit ✅)
  - Imports: 3 LOC
  - Properties: 2 LOC
  - Constructor: 2 LOC
  - mainLoop changes: 43 LOC
  - Try/catch wrappers: 28 LOC (mitigation for telemetry/lease failures)
  - **Total: 78 LOC**

### LOCALITY - Related near, unrelated far

- [x] Related changes are in same module
- **Files changing:** 1 file (`tools/wvo_mcp/src/wave0/runner.ts`)
- **Dependencies:** All local to supervisor module
  - LeaseManager: `../autopilot_mvp/supervisor/lease_manager.js`
  - LifecycleTelemetry: `../autopilot_mvp/supervisor/lifecycle_telemetry.js`
- **Locality assessment:** ✅ Excellent - all changes in one file, dependencies are local module

### VISIBILITY - Important obvious, unimportant hidden

- [x] Errors are observable, interfaces are clear
- **Error handling:**
  - Lease acquisition failure → log warning, skip task (visible in logs)
  - Telemetry emit failure → log warning, continue (wrapped in try/catch)
  - Lease release failure → log error, continue (wrapped in try/catch)
  - All errors logged with context (taskId, error details)
- **Public API:** No new public API - internal integration only
- **Observability:**
  - Lifecycle events written to `state/analytics/supervisor_lifecycle.jsonl` (visible)
  - Lease operations logged (visible)
  - Wave0 logs show supervisor behavior (visible)

### EVOLUTION - Patterns prove fitness

- [x] I'm using proven patterns OR documenting new one for fitness tracking
- **Pattern fitness:** Integration/instrumentation pattern
  - **Usage count:** Common pattern across codebase (10+ similar uses)
  - **Bug rate:** Low - pattern is well-understood
  - **Success rate:** High - additive instrumentation rarely breaks existing code
- **Why this pattern works:**
  - Non-invasive: doesn't restructure existing code
  - Additive: easy to remove if needed (delete wrapper lines)
  - Observable: telemetry makes behavior visible
  - Testable: can verify events emitted without mocking

**Pattern Decision:**

**Similar patterns found:**
- Pattern 1: `tools/wvo_mcp/src/orchestrator/tool_handler.ts` - wraps tool calls with telemetry/error handling
- Pattern 2: `tools/wvo_mcp/src/wave0/task_executor.ts` - wraps task execution with logging
- Pattern 3: HTTP middleware pattern - wrap request handling with logging/auth

**Pattern selected:** Instrumentation wrapper pattern (Pattern 1)

**Why this pattern:** Perfect fit for adding supervisor orchestration to existing Wave0 loop
- Before task: acquire lease, emit selection events
- During task: emit progress events
- After task: emit completion events, release lease
- Error handling: wrap in try/catch, log failures

**Leverage Classification:**

**Code leverage level:** High

- **High:** Public APIs, frequently changed → comprehensive testing
  - Wave0Runner is core autopilot loop (runs continuously)
  - Failure impacts all task execution
  - Changes to mainLoop() affect every task
  - Supervisor integration is foundation for multi-agent coordination

**My code is:** High **because** Wave0Runner is core autopilot loop, runs for all tasks, failure blocks all work

**Assurance strategy:**
- Build verification (TypeScript must compile)
- Live Wave0 autopilot testing (real task execution)
- Manual validation (check telemetry logs, verify lifecycle events)
- Monitor for 5+ tasks to verify stability
- Future: Add integration test harness (beyond MVP scope)

**Commit message will include:**
```
Pattern: Instrumentation wrapper
Tests: Live Wave0 autopilot with real task execution
Telemetry: state/analytics/supervisor_lifecycle.jsonl
```

---

## Via Negativa Analysis

**Can you DELETE or SIMPLIFY existing code instead of adding?**

**What existing code did you examine for deletion/simplification?**

- **Wave0Runner (tools/wvo_mcp/src/wave0/runner.ts):**
  - Examined: 237 LOC
  - Could delete: ❌ No - all code is essential (lock file, task fetch, executor, status update)
  - Could simplify: ❌ No - already minimal MVP implementation

- **Supervisor components (autopilot_mvp/supervisor/):**
  - Examined: 123 LOC total (LeaseManager, LifecycleTelemetry, types)
  - Could delete: ❌ No - these ARE the components we're integrating
  - Could simplify: ❌ No - Batch 1 already minimal

- **TaskExecutor (tools/wvo_mcp/src/wave0/task_executor.ts):**
  - Examined: Not changing - out of scope
  - Could delete: ❌ No - core task execution logic

**If you must add code, why is deletion/simplification insufficient?**

**Must add code because:**
1. Supervisor integration doesn't exist - nothing to delete
2. Wave0Runner currently has NO lease management - must be added
3. Wave0Runner currently emits NO lifecycle events - must be added
4. This is INTEGRATION work, not refactoring or cleanup

**Via negativa doesn't apply here because:**
- This is NEW CAPABILITY, not fixing existing complexity
- No redundant code exists (supervisor unused, Wave0 basic)
- No alternative: can't delete our way to supervisor integration

**Result:** Via negativa is not applicable - this is additive integration work.

---

## Refactor vs Repair Analysis

**Are you patching a symptom or refactoring the root cause?**

**Is this a PATCH/WORKAROUND or a PROPER FIX?**

**Neither - this is INTEGRATION:**
- Not fixing a bug (patch)
- Not restructuring complex code (refactor)
- **Adding new capability:** Supervisor orchestration to Wave0 autopilot

**Classification:** Clean integration of new components

**If modifying file >200 LOC or function >50 LOC: Did you consider refactoring the WHOLE module?**

**Yes, considered full refactoring:**
- Wave0Runner.mainLoop() is ~60 LOC after changes
- Considered breaking into smaller methods (selectTask, executeTask, releaseTask)
- **Decided against** because:
  - mainLoop() is clear sequential flow (easy to follow)
  - Breaking into methods adds indirection without clarity benefit
  - Small methods don't reduce complexity (just move it)
  - Single mainLoop() makes control flow obvious

**What technical debt does this create (if any)?**

**Technical debt created:**
1. **Simple YAML parsing** (existing debt, not new):
   - Wave0Runner uses regex to parse roadmap.yaml
   - Risk: Race conditions if roadmap edited during execution
   - **Mitigation:** Document as known limitation, defer to future waves

2. **In-memory lease management** (Batch 1 debt, not new):
   - LeaseManager uses in-memory Map (doesn't persist)
   - Risk: Leases lost on Wave0 crash
   - **Mitigation:** Lease TTL expiration (30 min) + restart clears leases

3. **No retry logic for telemetry** (acceptable for MVP):
   - If telemetry emit fails, we log and continue
   - Risk: Missing events in telemetry log
   - **Mitigation:** Telemetry is observability (non-critical), failures logged

**Debt assessment:** ✅ Acceptable for Wave 0 MVP - documented limitations, defer to future waves

---

## Alternatives Considered

**List 2-3 approaches you evaluated:**

### Alternative 1: Unit Test File Only (REJECTED)

- **What:** Create standalone test file that imports and tests supervisor components in isolation
- **Pros:**
  - Fast (no real autopilot execution)
  - Easy to mock
  - Test edge cases in controlled environment
- **Cons:**
  - ❌ Doesn't integrate supervisor with Wave0Runner
  - ❌ Supervisor components never used in production code
  - ❌ Doesn't test with real autopilot
  - ❌ Doesn't validate supervisor orchestrates real tasks
  - ❌ **Completely misses the point of "integration"**
- **Why not selected:** Task title says "COMPLETE AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION" - requires ACTUAL integration, not just a test file. User explicitly requested: "real live autopilot and supervisor doing what a supervisor should do"

### Alternative 2: Mock Wave0 Runner for Testing (REJECTED)

- **What:** Create mock/fake Wave0 runner for testing supervisor components
- **Pros:**
  - Fast execution
  - Controlled test environment
  - Easy to test edge cases
- **Cons:**
  - ❌ Doesn't test real Wave0Runner
  - ❌ Doesn't validate with live autopilot
  - ❌ Mock may not match real behavior
  - ❌ **User explicitly requested testing with "real live autopilot and supervisor"**
- **Why not selected:** User requirement: "also this needs to be tested with the 'wave 0' autopilot with real live autopilot and supervisor doing what a supervisor should do"

### Selected Approach: Integrate Supervisor into Wave0Runner + Live Testing ✅

- **What:** Wire LeaseManager + LifecycleTelemetry into Wave0Runner, test with live autopilot
- **Why:**
  - ✅ Actual integration (not just test file)
  - ✅ Supervisor orchestrates real tasks
  - ✅ Tests with live Wave 0 autopilot
  - ✅ Validates lifecycle events in production scenario
  - ✅ Verifies lease coordination works
  - ✅ Low LOC (~78 lines including error handling)
  - ✅ **Meets user requirement for live autopilot testing**
  - ✅ Establishes end-to-end testing philosophy for all future autopilot work

- **How it aligns with AFP/SCAS:**
  - **ECONOMY:** Minimal changes (~78 LOC), reuses existing components
  - **COHERENCE:** Natural fit with Wave0Runner's task execution loop, matches existing instrumentation patterns
  - **LOCALITY:** Integration code contained in Wave0Runner, dependencies are local module
  - **VISIBILITY:** Lifecycle events provide clear telemetry, errors are logged
  - **EVOLUTION:** Foundation for multi-supervisor coordination later, proven integration pattern

---

## Complexity Analysis

**How does this change affect complexity?**

### **Complexity increases:**

**Where:** Wave0Runner.mainLoop() cyclomatic complexity increases from 5 → 8

**Why increase happens:**
- +1 for lease acquisition check (if !leaseAcquired)
- +1 for try/finally block (lease release guarantee)
- +1 for telemetry error handling (multiple try/catch wrappers)

**Is this increase JUSTIFIED?**

**✅ Yes, justified because:**
1. **Lease coordination is essential** - prevents duplicate task execution (correctness)
2. **Lifecycle events are essential** - provides observability (debuggability)
3. **Error handling is essential** - telemetry failure shouldn't crash autopilot (reliability)

**How will you MITIGATE this complexity?**

**Mitigation strategies:**
1. **Clear comments** - each section labeled (1. Get task, 2. Acquire lease, 3. Emit selected, etc.)
2. **Sequential flow** - mainLoop() reads top-to-bottom (no complex branching)
3. **Single responsibility per section** - each section does ONE thing
4. **Try/finally pattern** - standard pattern for resource management (lease = resource)
5. **Comprehensive documentation** - strategy, spec, plan, think phases explain rationale

**Complexity assessment:** ✅ Acceptable - increase is small, justified, and mitigated

### **Complexity decreases:** None

- No code deleted (via negativa not applicable)
- No refactoring of existing complexity

### **Trade-offs:**

**Necessary complexity:**
- Lease management (prevents race conditions)
- Lifecycle events (provides observability)
- Error handling (prevents crashes)

**Avoided unnecessary complexity:**
- No new abstractions (directly use LeaseManager/LifecycleTelemetry)
- No complex state machines (simple sequential flow)
- No configuration options (hard-code 30min TTL, standard event schema)

**Trade-off assessment:** ✅ Excellent - only necessary complexity added, no gold-plating

---

## Implementation Plan

**Scope:**
- **Files to change:** 1 file - `tools/wvo_mcp/src/wave0/runner.ts`
- **PLAN-authored tests:** Live Wave0 autopilot testing (not traditional unit tests)
  - Test 1: Build verification (`npm run build`) - PASSING (requirement)
  - Test 2: Wave0 startup (`npm run wave0 &`) - TO BE RUN in VERIFY phase
  - Test 3: Live task execution (add TEST-SUPERVISOR-001 to roadmap) - TO BE RUN in VERIFY phase
  - Test 4: JSONL validation (`cat supervisor_lifecycle.jsonl | jq`) - TO BE RUN in VERIFY phase
  - Test 5: Lease coordination (verify no duplicate execution) - TO BE RUN in VERIFY phase
  - **Status:** Tests authored in PLAN phase, execution deferred to VERIFY phase (acceptable for live integration tests)
  - **N/A justification:** Traditional unit tests not applicable - this is integration work requiring live autopilot
- **Estimated LOC:** +78 -0 = net 78 LOC
- **Micro-batching compliance:** ✅ 1 file, ≤150 net LOC

**Risk Analysis:**

**Edge cases (from THINK phase):**
1. Concurrent Wave0 instances → handled by lock file + LeaseManager
2. Lease already held → skip task with warning, retry after TTL expiration
3. Task execution throws exception → finally block ensures lease release
4. Telemetry emission fails → wrap in try/catch, log warning, continue
5. Lease release fails → wrap in try/catch, log error, continue
6. Empty roadmap → Wave0 exits gracefully after 15 min (existing behavior)
7. Roadmap update during execution → race condition (known limitation, documented)
8. Wave0 killed mid-execution (SIGKILL) → lease expires after 30 min (acceptable)
9. Wave0 shutdown during execution (SIGTERM) → completes current task, then exits (graceful)
10. Telemetry directory missing → LifecycleTelemetry should create (validate in IMPLEMENT)

**Failure modes:**
1. Import path resolution failure → verify paths before implementation
2. Runtime lease acquisition failure → TTL expiration recovers (30 min)
3. Telemetry write failure → non-blocking (wrapped in try/catch)
4. Task executor crash → existing error handling continues to work

**Testing strategy:**
1. **Build verification:** `npm run build` (must succeed with 0 errors)
2. **Live Wave0 startup:** `npm run wave0 &` (must enter main loop)
3. **Real task execution:** Add TEST-SUPERVISOR-001 to roadmap, verify execution
4. **Lifecycle event validation:** Check supervisor_lifecycle.jsonl for 4 events
5. **JSONL structure validation:** Parse log with jq, verify valid JSON
6. **Lease coordination validation:** Check logs for acquire/release, verify single execution

**Assumptions:**

1. **Assumption:** Supervisor components are importable from Wave0Runner
   - **Validation:** Check import paths (`../autopilot_mvp/supervisor/`)
   - **Risk:** Import paths may be incorrect or components may not be built
   - **Contingency:** Fix import paths, ensure TypeScript build includes supervisor

2. **Assumption:** Wave0Runner build pipeline includes supervisor components
   - **Validation:** `npm run build` should compile supervisor + Wave0Runner
   - **Risk:** Build may fail if supervisor not in tsconfig paths
   - **Contingency:** Update tsconfig.json to include autopilot_mvp/

3. **Assumption:** Wave0 autopilot can be started with `npm run wave0`
   - **Validation:** Check package.json scripts
   - **Risk:** Script may not exist or may have different name
   - **Contingency:** Use `npx tsx scripts/run_wave0.ts` directly

4. **Assumption:** supervisor_lifecycle.jsonl telemetry directory exists
   - **Validation:** LifecycleTelemetry creates state/analytics/ automatically
   - **Risk:** Directory creation may fail due to permissions
   - **Contingency:** Pre-create directory in Wave0Runner setup

5. **Assumption:** Integration with live autopilot is sufficient for Batch 1 exit criterion
   - **Validation:** Exit criterion: "passing integration smoke exercising supervisor loop"
   - **Risk:** May need additional validation
   - **Contingency:** Add telemetry validation script if needed

---

## Review Checklist (Self-Check)

Before implementing, verify:

- [x] I explored deletion/simplification (via negativa)
  - ✅ Examined Wave0Runner (237 LOC), supervisor (123 LOC), TaskExecutor
  - ✅ Nothing to delete - this is additive integration work

- [x] If adding code, I explained why deletion won't work
  - ✅ Supervisor integration doesn't exist - must add new capability
  - ✅ Via negativa not applicable to new feature integration

- [x] If modifying large files/functions, I considered full refactoring
  - ✅ Considered breaking mainLoop() into smaller methods
  - ✅ Decided against - sequential flow is clearest approach

- [x] I documented 2-3 alternative approaches
  - ✅ Alt 1: Unit test file only (rejected - not integration)
  - ✅ Alt 2: Mock Wave0 runner (rejected - user wants live testing)
  - ✅ Selected: Integrate + live testing (meets requirements)

- [x] Any complexity increases are justified and mitigated
  - ✅ Complexity increase from 5 → 8 cyclomatic (justified)
  - ✅ Mitigation: Clear comments, sequential flow, try/finally pattern

- [x] I estimated scope (files, LOC) and it's within limits
  - ✅ 1 file, 78 LOC (under 150 limit)
  - ✅ Micro-batching compliant

- [x] I thought through edge cases and failure modes
  - ✅ 10 edge cases analyzed in THINK phase
  - ✅ 4 failure modes documented with recovery strategies

- [x] I authored the verification tests during PLAN (listed above) and have a testing strategy
  - ✅ 5 tests authored (build, startup, execution, JSONL, lease coordination)
  - ✅ Testing strategy: Live Wave0 autopilot with real tasks (end-to-end)

**All boxes checked ✅ - Ready to implement.**

---

## Notes

**Testing Philosophy Established:**

This task establishes END-TO-END TESTING as the standard for ALL future autopilot work:

1. **Prefer live autopilot testing** over unit tests
2. **Prefer real task execution** over mocked components
3. **Prefer production-like validation** over synthetic test scenarios
4. **Prefer integration verification** over isolated component tests

**Testing hierarchy (prefer top over bottom):**
1. **🥇 BEST:** Live Wave 0 autopilot running real tasks
2. **🥈 GOOD:** Integration test with real Wave0Runner (no mocks)
3. **🥉 ACCEPTABLE:** Unit tests for leaf functions only
4. **❌ AVOID:** Mocked Wave0Runner, synthetic test harnesses

**Application to future tasks:**
- Any new supervisor features → test with live Wave 0
- Any Wave0Runner changes → test with real autopilot
- Any task executor changes → test with actual task execution
- Any lifecycle changes → validate with real lifecycle events

**This testing philosophy applies to ALL future autopilot development.**

---

**Design Date:** 2025-11-06
**Author:** Claude Council

---

## GATE Review Tracking

**GATE is ITERATIVE - expect multiple rounds:**

### Review 1: [Pending]
- **DesignReviewer Result:** pending
- **Concerns Raised:** [awaiting DesignReviewer feedback]
- **Remediation Task:** [will create if concerns raised]
- **Time Spent:** [will track remediation effort]

*Next step: Run `cd tools/wvo_mcp && npm run gate:review AFP-W0-M1-MVP-SUPERVISOR-INTEGRATION` to validate design*

---

**IMPORTANT:** If DesignReviewer finds issues, I MUST:
1. Create remediation task (new STRATEGIZE→MONITOR cycle)
2. Do actual research/exploration (30-60 min per critical issue)
3. **Update UPSTREAM phase artifacts** (strategy.md, spec.md, plan.md)
   - Via negativa concern → revise PLAN to show deletion analysis
   - Refactor concern → revise STRATEGY to target root cause
   - Alternatives concern → revise SPEC with new requirements
4. Update design.md with revised approach (reflects upstream changes)
5. Re-submit for review

**Superficial edits to pass GATE = compliance theater = rejected.**
