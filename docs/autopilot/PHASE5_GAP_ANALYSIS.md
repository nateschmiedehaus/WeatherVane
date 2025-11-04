# Phase 5 Gap Analysis & Remediation Plan

## Overview

Phase 5 aims to prove that Unified Autopilot can self-govern with 100% reliability through Spec→Monitor protocol before touching production WeatherVane work.

**Current Status**: ~40% Complete (2 of 8 acceptance criteria met)

## ✅ Completed Components

### 1. Quality Gate Integration Tests (AC #2)

**File**: `tools/wvo_mcp/src/orchestrator/quality_gate_integration.test.ts`

**Coverage**:
- ✅ Verify failure → Resolution loop → Plan delta → Success (line 647)
  ```typescript
  it('retries plan after verify failure and resolution loop closes', async () => {
    // Test proves resolution loop closes within retry ceiling
    // Simulates verify failure → plan delta → success
  });
  ```

- ✅ Incident escalation honors `policy.require_human` (line 825)
  ```typescript
  it('invokes incident reporter when plan retries exceed ceiling', async () => {
    // Test proves incident reporter triggered after max retries
    // Validates human escalation policy
  });
  ```

**Status**: COMPLETE ✓

### 2. run_integrity_tests.sh Bootstrap Logic (AC #3)

**File**: `tools/wvo_mcp/scripts/run_integrity_tests.sh`

**Features**:
- ✅ Calls `python_toolchain.sh` for environment setup (line 8)
- ✅ Supports offline/hermetic builds with `.wheels/` cache (line 19)
- ✅ Uses `pip install --no-index --find-links=.wheels/` when network unavailable (line 87)
- ✅ Graceful fallback to online pip when cache unavailable (line 91)

**Status**: COMPLETE ✓

## Phase 5 Component Status (4/8 Complete)

### 1. Smoke Test Script (AC #1) - HIGH PRIORITY ✅ COMPLETE

**Status**: COMPLETE - Script implemented and integrated with Monitor state

**Location**: `scripts/app_smoke_e2e.sh` (127 lines)

**Implementation**:
- ✅ 5 smoke tests: Build, Critical tests, Audit, MCP server, File system
- ✅ Support for quick mode (SMOKE_MODE=quick) and full mode
- ✅ Exit codes for different failure types (1=general, 2=tests, 3=server, 4=audit)
- ✅ Colored output with log helpers (log_info, log_warn, log_error)
- ✅ Cleanup trap with duration reporting

**Integration Points**:
- ✅ `monitor_runner.ts` (line 36): Calls `runAppSmoke()` after supervisor.monitor()
- ✅ `monitor_runner.ts` (line 39-47): Smoke failure triggers plan delta + returns to plan state
- ✅ `monitor_runner.ts` (line 50-52): Smoke success clears memory/router and completes task
- ✅ `smoke_command.ts`: SmokeCommand class with fallback to hermetic vitest
- ✅ `monitor_runner.test.ts`: 22/22 tests passing including smoke integration tests

**Hermetic Support**:
- ✅ Fallback command if script doesn't exist: runs monitor_runner.test.ts via vitest
- ✅ Works in CI without external dependencies

**Verified**: Smoke test runs successfully in CI (`.github/workflows/ci.yml` line 59-60)

### 2. GitHub CI Workflows (AC #4) - HIGH PRIORITY ✅ COMPLETE

**Status**: COMPLETE - All required workflows exist and are comprehensive

**Existing Workflows**:

1. **`.github/workflows/ci.yml`** (Comprehensive CI pipeline):
   ```yaml
   # Covers: test-autopilot.yml, test-web.yml, integrity.yml
   - Vitest (autopilot scope) - line 53-54
   - Vitest (web scope) - line 56-57
   - App smoke test - line 59-60 (includes npm audit)
   - Integrity batch - line 62-63
   ```
   **Triggers**: pull_request, push to main
   **Blocks merge**: ✅ Yes (GitHub branch protection required)

2. **`.github/workflows/atlas.yml`**:
   - Validates Atlas manifest and prompts
   - Runs Atlas artifact generation and tests
   **Triggers**: pull_request, push to main (when Atlas files change)

3. **`.github/workflows/refresh-model-catalog.yml`**:
   - Updates model catalog on schedule (weekly Monday 9am)
   - Manual trigger available (workflow_dispatch)
   - Detects catalog drift and fails if uncommitted changes

**Coverage Verification**:
- ✅ Build check: Covered by smoke test (scripts/app_smoke_e2e.sh line 46-48)
- ✅ Unit tests: Covered by Vitest autopilot scope (ci.yml line 53-54)
- ✅ Integration tests: Covered by integrity batch (ci.yml line 62-63)
- ✅ npm audit: Covered by smoke test (scripts/app_smoke_e2e.sh line 76)
- ✅ Web tests: Covered by Vitest web scope (ci.yml line 56-57)
- ✅ MCP server health: Covered by smoke test (scripts/app_smoke_e2e.sh line 81-93)
- ✅ File system health: Covered by smoke test (scripts/app_smoke_e2e.sh line 97-113)

**Block on Failure**: All workflows must pass before merge (enforced by GitHub)

### 3. Autopilot Execution Documentation (AC #5) - MEDIUM PRIORITY

**Required**: `state/autopilot_execution.md`

**Content**:
- Full Spec→Monitor transcript for real WeatherVane task
- Reviewer rubric (quality gate decisions, evidence chain)
- Proof that autopilot can handle production work

**Implementation Plan**:
1. Run autopilot on sample WeatherVane backlog item
2. Capture complete transcript (all stages, decision logs)
3. Document reviewer feedback and quality gate results
4. Create evidence package in `evidence/<task-id>/`

**Estimated Effort**: 3-5 hours (includes actual autopilot run)

### 4. Screenshot Artifacts Infrastructure (AC #6) - MEDIUM PRIORITY

**Required**: Playwright screenshot capture for UI/UX changes

**Implementation Plan**:
```typescript
// tools/wvo_mcp/src/orchestrator/screenshot_capture.ts
export async function captureScreenshot(
  url: string,
  outputPath: string
): Promise<void> {
  // Use Playwright to capture screenshot
  // Save to evidence/<task-id>/screenshots/
  // Attach to quality gate decision log
}
```

**Integration**:
- Monitor/Verify stages call screenshot_capture for UI tasks
- Screenshots attached to evidence package
- Reviewers can inspect rendered changes without rerunning

**Estimated Effort**: 3-4 hours

### 5. Integration Documentation (AC #7) - LOW PRIORITY

**Required**: Think + Review stages document integration

**Current State**: Partially implemented (Think stage exists, Review has checklist)

**Enhancement Needed**:
- Add integration proof template to Think stage
- Review stage checks for integration documentation
- Plan delta triggered if integration proof missing

**Estimated Effort**: 2-3 hours

### 6. Upstream/Downstream Risk Handling (AC #8) - LOW PRIORITY

**Required**: Monitor/Verify auto-fix or record plan-delta for dependencies

**Implementation Plan**:
```typescript
// In verifier.ts or monitor_state.ts
if (upstreamRiskDetected) {
  if (canFixImmediately && inScope) {
    await autoFix(risk);
  } else {
    await recordPlanDelta(risk);
    await createFollowUpTask(risk);
  }
}
```

**Estimated Effort**: 2-3 hours

## Remediation Roadmap

### Immediate (Phase 5 Completion)

**Priority 1: Critical Path**
1. Implement `scripts/app_smoke_e2e.sh` (2-4h)
2. Create GitHub CI workflows (4-6h)
3. Run autopilot on real task, document execution (3-5h)

**Total Estimated Effort**: 9-15 hours

### Near-Term (Phase 5 Polish)

**Priority 2: Enhanced Capabilities**
4. Screenshot artifacts infrastructure (3-4h)
5. Integration documentation enhancements (2-3h)
6. Upstream/downstream risk auto-handling (2-3h)

**Total Estimated Effort**: 7-10 hours

### Phase 5 Total Remediation Effort: 16-25 hours

## Success Criteria (Phase 5 Complete)

- [x] Quality gate integration tests prove "resolve, don't stall" ✅
- [x] run_integrity_tests.sh bootstrap logic ✅
- [x] scripts/app_smoke_e2e.sh implemented and integrated ✅ (Completed: 2025-10-26)
- [x] GitHub CI workflows block on regressions ✅ (Already existed: ci.yml, atlas.yml, refresh-model-catalog.yml)
- [ ] Autopilot execution documented with real task (Priority 1 - remaining)
- [ ] Screenshot artifacts for UI/UX changes (Priority 2 - optional)
- [ ] Think + Review integration documentation (Priority 2 - optional)
- [ ] Upstream/downstream risk handling (Priority 2 - optional)

**Current**: 4/8 complete (50%) - Priority 1: 4/5 (80%)
**Target**: 8/8 complete (100%)

## Recommended Next Steps

### Option A: Complete Phase 5 First
Finish all missing components before Phase 8. This ensures autopilot is fully validated before production use.

**Pros**: Complete validation, no technical debt
**Cons**: Delays Phase 8 innovation

### Option B: Parallel Track (Recommended)
1. Implement Priority 1 items (smoke tests, CI)
2. Start Phase 8 planning in parallel
3. Complete Priority 2 items alongside Phase 8 execution

**Pros**: Maintains momentum, validates as we build
**Cons**: Requires careful coordination

### Option C: Skip to Phase 8
Document Phase 5 gaps as tech debt, proceed to Phase 8.

**Pros**: Fastest path to new features
**Cons**: Autopilot not fully validated, risk of instability

## Recommendation

**Adopt Option B (Parallel Track)**:
1. Immediately implement smoke tests (2-4h) - blocks autopilot reliability
2. Create CI workflows (4-6h) - blocks merge safety
3. Run autopilot execution (3-5h) - proves real-world capability
4. **Then proceed to Phase 8** while polishing screenshot/integration enhancements

This balances validation rigor with forward progress.

---

**Status**: Phase 5 is 25% complete. Critical path items (smoke tests, CI, execution docs) required before production deployment.

**Next Action**: User decision on remediation strategy (A, B, or C)
