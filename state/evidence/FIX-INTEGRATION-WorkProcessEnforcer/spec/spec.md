# SPEC: WorkProcessEnforcer Quality Integration

**Task**: FIX-INTEGRATION-WorkProcessEnforcer
**Date**: 2025-10-30
**Phase**: SPEC

---

## Acceptance Criteria

### AC1: Integration Code Wired
**Requirement**: work_process_quality_integration.ts wired into work_process_enforcer.ts

**Acceptance Test:**
```typescript
// Given: WorkProcessEnforcer instance with quality checks enabled
const enforcer = new WorkProcessEnforcer(stateMachine, workspaceRoot, metrics, {
  qualityChecks: { mode: 'enforce', preflight: { enabled: true } }
});

// When: Phase transition attempted
await enforcer.advanceToPhase(taskId, 'implement');

// Then: Quality integration module is invoked
expect(qualityIntegration.runPreflightChecks).toHaveBeenCalled();
```

**Verification Method**: Unit test + code inspection

**Evidence**:
- `tools/wvo_mcp/src/orchestrator/work_process_quality_integration.ts` exists
- Import present in work_process_enforcer.ts
- Integration methods called in phase transition logic

---

### AC2: Pre-Flight Checks at IMPLEMENT Start
**Requirement**: Pre-flight checks run automatically when IMPLEMENT phase starts

**Acceptance Test:**
```bash
# Given: Task transitioning from PLAN to IMPLEMENT
# When: advanceToPhase('taskId', 'implement') called
# Then: preflight_check.sh executes
# And: Results logged to state/analytics/preflight_runs.jsonl
# And: Phase transition blocked if checks fail (in enforce mode)

test -f state/analytics/preflight_runs.jsonl || exit 1
grep "preflight" state/analytics/preflight_runs.jsonl || exit 1
```

**Verification Method**: Integration test with real WorkProcessEnforcer

**Evidence**:
- Telemetry shows preflight_check.sh invocation
- JSON report generated in /tmp/preflight_report_*.json
- Phase transition blocked when checks fail (enforce mode)

---

### AC3: Quality Gates Before VERIFY Phase
**Requirement**: Quality gates checked automatically before VERIFY phase

**Acceptance Test:**
```bash
# Given: Task transitioning from IMPLEMENT to VERIFY
# When: advanceToPhase('taskId', 'verify') called
# Then: check_quality_gates.sh executes
# And: Results logged to state/analytics/quality_gates.jsonl
# And: Transition blocked if violations exist (enforce mode)

grep "quality_gates" state/analytics/quality_gates.jsonl || exit 1
```

**Verification Method**: Integration test with oversized file (should fail)

**Evidence**:
- Quality gates run before VERIFY
- Violations detected (e.g., file >500 lines)
- Phase blocked in enforce mode

---

### AC4: Reasoning Validation Before Task Complete
**Requirement**: Reasoning validation runs before marking task complete (MONITOR phase)

**Acceptance Test:**
```bash
# Given: Task transitioning from PR to MONITOR
# When: advanceToPhase('taskId', 'monitor') called
# Then: check_reasoning.sh executes with --task parameter
# And: Results logged to state/analytics/reasoning_validation.jsonl
# And: Completion blocked if reasoning incomplete (enforce mode)

grep "reasoning_validation" state/analytics/reasoning_validation.jsonl || exit 1
```

**Verification Method**: Integration test with incomplete evidence

**Evidence**:
- Reasoning validation runs for task
- Missing phases detected
- Completion blocked in enforce mode

---

### AC5: Fallback Strategy Implemented
**Requirement**: Timeout/error handling implemented (fail-safe)

**Acceptance Test:**
```typescript
// Given: Quality check script times out (>30s for preflight)
// When: Timeout occurs
// Then: Warning logged, phase transition continues (fail-safe)
// And: Timeout event recorded in telemetry

const result = await runQualityCheck('preflight', taskId, { timeoutMs: 100 });
expect(result.timedOut).toBe(true);
expect(result.blockTransition).toBe(false);  // fail-safe: don't block
```

**Verification Method**: Unit test with simulated timeout

**Evidence**:
- Timeout handling code exists
- Warning logged on timeout
- Phase transition not blocked
- Telemetry shows timeout event

---

### AC6: Feature Flags for Gradual Rollout
**Requirement**: Feature flags control shadow/observe/enforce modes

**Acceptance Test:**
```typescript
// Shadow mode: run checks, don't block
const shadowEnforcer = new WorkProcessEnforcer(sm, root, metrics, {
  qualityChecks: { mode: 'shadow', preflight: { enabled: true } }
});
await shadowEnforcer.advanceToPhase(taskId, 'implement');
// Expect: checks run, no blocking

// Observe mode: run checks, show warnings
const observeEnforcer = new WorkProcessEnforcer(sm, root, metrics, {
  qualityChecks: { mode: 'observe', preflight: { enabled: true } }
});
await observeEnforcer.advanceToPhase(taskId, 'implement');
// Expect: checks run, warnings logged, no blocking

// Enforce mode: run checks, block on failure
const enforceEnforcer = new WorkProcessEnforcer(sm, root, metrics, {
  qualityChecks: { mode: 'enforce', preflight: { enabled: true } }
});
await expect(enforceEnforcer.advanceToPhase(badTaskId, 'implement')).rejects.toThrow();
// Expect: checks run, phase blocked
```

**Verification Method**: Unit tests for each mode

**Evidence**:
- Config interface includes mode: 'shadow' | 'observe' | 'enforce'
- Mode correctly controls blocking behavior
- Telemetry records mode used

---

### AC7: End-to-End Integration Tests Passing
**Requirement**: Full workflow tests pass with quality checks enabled

**Acceptance Test:**
```bash
# Test 1: Happy path (all checks pass)
npm run test -- work_process_enforcer.integration.test.ts -t "quality checks pass"

# Test 2: Pre-flight failure blocks IMPLEMENT
npm run test -- work_process_enforcer.integration.test.ts -t "preflight failure"

# Test 3: Quality gate failure blocks VERIFY
npm run test -- work_process_enforcer.integration.test.ts -t "quality gate failure"

# Test 4: Reasoning failure blocks MONITOR
npm run test -- work_process_enforcer.integration.test.ts -t "reasoning failure"

# Test 5: Timeout doesn't block (fail-safe)
npm run test -- work_process_enforcer.integration.test.ts -t "timeout failsafe"

# All tests pass
```

**Verification Method**: Integration test suite

**Evidence**:
- New test file: work_process_enforcer.integration.test.ts
- All 5+ tests passing
- Code coverage >80% for integration code

---

### AC8: Autopilot Success Rate Maintained >90%
**Requirement**: Quality integration doesn't degrade autopilot performance

**Acceptance Test:**
```bash
# Before: Baseline autopilot success rate
BASELINE=$(grep "autopilot_success_rate" state/analytics/autopilot_metrics.jsonl | tail -1 | jq .rate)

# After: Deploy quality integration in shadow mode, run 100 tasks
# (This is a monitoring criterion, not a one-time test)

# Then: Success rate maintained
CURRENT=$(grep "autopilot_success_rate" state/analytics/autopilot_metrics.jsonl | tail -1 | jq .rate)
[ "$CURRENT" -ge 90 ] || exit 1
```

**Verification Method**: Production monitoring (shadow mode week)

**Evidence**:
- Telemetry tracking autopilot_success_rate
- Success rate >90% in shadow mode
- No spike in autopilot errors

---

## Integration Contract

### TypeScript Interfaces

```typescript
// tools/wvo_mcp/src/orchestrator/work_process_quality_integration.ts

export interface QualityCheckConfig {
  mode: 'shadow' | 'observe' | 'enforce';
  preflight: {
    enabled: boolean;
    timeoutMs: number;  // default: 30000
    scriptPath?: string;  // default: 'scripts/preflight_check.sh'
  };
  qualityGates: {
    enabled: boolean;
    timeoutMs: number;  // default: 15000
    scriptPath?: string;  // default: 'scripts/check_quality_gates.sh'
  };
  reasoning: {
    enabled: boolean;
    timeoutMs: number;  // default: 20000
    scriptPath?: string;  // default: 'scripts/check_reasoning.sh'
  };
  failSafe: boolean;  // default: true - if timeout/error, log and continue
}

export interface QualityCheckResult {
  checkType: 'preflight' | 'quality_gates' | 'reasoning';
  taskId: string;
  passed: boolean;
  executionTimeMs: number;
  timedOut: boolean;
  error?: string;
  details: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    warnings: string[];
    failures: string[];
  };
  blockTransition: boolean;  // true if should block phase transition
  reportPath?: string;  // path to JSON report
}

export class WorkProcessQualityIntegration {
  constructor(
    private config: QualityCheckConfig,
    private workspaceRoot: string,
    private metricsCollector: MetricsCollector
  );

  // Run pre-flight checks (before IMPLEMENT phase)
  async runPreflightChecks(taskId: string): Promise<QualityCheckResult>;

  // Run quality gates (before VERIFY phase)
  async runQualityGates(taskId: string): Promise<QualityCheckResult>;

  // Run reasoning validation (before MONITOR phase)
  async runReasoningValidation(taskId: string): Promise<QualityCheckResult>;

  // Generic check runner with timeout and error handling
  private async runCheck(
    checkType: string,
    scriptPath: string,
    args: string[],
    timeoutMs: number
  ): Promise<QualityCheckResult>;

  // Determine if phase transition should be blocked
  private shouldBlockTransition(result: QualityCheckResult): boolean;

  // Log telemetry for quality check
  private logQualityCheckEvent(result: QualityCheckResult): void;
}
```

### WorkProcessEnforcer Integration Points

```typescript
// tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts

import { WorkProcessQualityIntegration, type QualityCheckConfig } from './work_process_quality_integration.js';

export interface WorkProcessEnforcerConfig {
  // ... existing config ...
  qualityChecks?: QualityCheckConfig;  // NEW
}

export class WorkProcessEnforcer {
  private qualityIntegration?: WorkProcessQualityIntegration;  // NEW

  constructor(
    private stateMachine: StateMachine,
    private workspaceRoot: string,
    private metricsCollector: MetricsCollector,
    config?: WorkProcessEnforcerConfig
  ) {
    // ... existing initialization ...

    // NEW: Initialize quality integration if enabled
    if (config?.qualityChecks) {
      this.qualityIntegration = new WorkProcessQualityIntegration(
        config.qualityChecks,
        workspaceRoot,
        metricsCollector
      );
    }
  }

  // MODIFIED: Add quality check before IMPLEMENT
  async advanceToPhase(taskId: string, newPhase: WorkPhase): Promise<void> {
    // ... existing validation ...

    // NEW: Run quality checks based on phase
    if (this.qualityIntegration) {
      if (newPhase === 'implement') {
        const result = await this.qualityIntegration.runPreflightChecks(taskId);
        if (result.blockTransition) {
          throw new Error(`Pre-flight checks failed for ${taskId}: ${result.details.failures.join(', ')}`);
        }
      } else if (newPhase === 'verify') {
        const result = await this.qualityIntegration.runQualityGates(taskId);
        if (result.blockTransition) {
          throw new Error(`Quality gates failed for ${taskId}: ${result.details.failures.join(', ')}`);
        }
      } else if (newPhase === 'monitor') {
        const result = await this.qualityIntegration.runReasoningValidation(taskId);
        if (result.blockTransition) {
          throw new Error(`Reasoning validation failed for ${taskId}: ${result.details.failures.join(', ')}`);
        }
      }
    }

    // ... existing phase transition logic ...
  }
}
```

---

## Verification Matrix

| AC # | Requirement | Verification Method | Evidence Location | Pass Criteria |
|------|-------------|---------------------|-------------------|---------------|
| AC1 | Integration wired | Code inspection + unit test | work_process_quality_integration.ts created, imported in work_process_enforcer.ts | File exists, imports correct, called in advanceToPhase |
| AC2 | Pre-flight at IMPLEMENT | Integration test | state/analytics/preflight_runs.jsonl has entries | Telemetry shows preflight ran before IMPLEMENT |
| AC3 | Quality gates at VERIFY | Integration test | state/analytics/quality_gates.jsonl has entries | Violations detected, phase blocked in enforce mode |
| AC4 | Reasoning at MONITOR | Integration test | state/analytics/reasoning_validation.jsonl has entries | Missing phases detected, completion blocked in enforce mode |
| AC5 | Timeout fallback | Unit test with mock | Test output shows timeout handled gracefully | Warning logged, transition continues (fail-safe) |
| AC6 | Feature flags | Unit tests for each mode | Test suite covers shadow/observe/enforce | Blocking behavior matches mode |
| AC7 | E2E tests pass | Integration test suite | work_process_enforcer.integration.test.ts passes | All 5+ integration tests green |
| AC8 | Success rate >90% | Production monitoring | state/analytics/autopilot_metrics.jsonl | Success rate sustained >90% in shadow mode |

---

## Out of Scope

### Explicitly NOT in This Task

**1. Full Enforce Mode Rollout**
- This task delivers shadow mode integration
- Enforce mode rollout is a separate deployment decision
- Rationale: Need monitoring period first

**2. Quality Check Tuning**
- This task uses existing checks as-is
- Tuning thresholds (e.g., file size limits) is future work
- Rationale: Shadow mode will reveal tuning needs

**3. Performance Optimization**
- Initial implementation prioritizes correctness
- Optimizations (caching, parallel execution) deferred
- Rationale: Measure first, optimize later

**4. Learning System Integration**
- Quality check results don't feed learning system yet
- Future: learnings from failures improve gates
- Rationale: Phase 7 work (separate epic)

**5. CI Pipeline Integration**
- This task focuses on autopilot integration only
- GitHub Actions integration is separate task (FIX-CI-Pipeline-Integration)
- Rationale: Different integration points

**6. False Positive Tracking UI**
- No UI for reviewing/overriding false positives
- Future: dashboard enhancement
- Rationale: MVP focuses on core integration

**7. Multi-Agent Coordination**
- Single autopilot instance only
- No handling of concurrent task quality checks
- Rationale: Not needed for current architecture

---

## KPIs & Success Metrics

### Functional KPIs
- **Quality Check Execution Rate**: 100% of phase transitions trigger checks (when enabled)
- **Blocking Accuracy**: 0% false blocks in shadow mode (no transitions blocked)
- **Telemetry Completeness**: 100% of quality check runs logged

### Performance KPIs
- **Pre-flight Execution**: p95 <30s
- **Quality Gates Execution**: p95 <15s
- **Reasoning Validation**: p95 <20s
- **Total Overhead**: <5 min per full STRATEGIZE→MONITOR workflow
- **Timeout Rate**: <1% of checks timeout

### Quality KPIs
- **Autopilot Success Rate**: >90% maintained (no degradation)
- **False Positive Rate**: <10% (after shadow mode analysis)
- **Integration Bugs**: 0 autopilot crashes due to quality integration
- **Early Detection Rate**: >50% of issues caught before REVIEW phase

### Adoption KPIs
- **Shadow Mode Deployment**: Within 1 day of PR merge
- **Observe Mode Deployment**: Within 1 week (after shadow analysis)
- **Enforce Mode Deployment**: Within 2-3 weeks (after observe period)

---

## Dependencies

### Upstream Dependencies (Must Exist)
1. ✅ WORK-PROCESS-FAILURES complete (quality check scripts exist)
2. ✅ WorkProcessEnforcer exists with phase transition logic
3. ✅ MetricsCollector available for telemetry
4. ✅ Script execution infrastructure (execSync, spawn)
5. ✅ Roadmap.yaml for auto-task creation

### Downstream Dependencies (Will Use This)
1. ⏳ FIX-CI-Pipeline-Integration (GitHub Actions)
2. ⏳ Quality gate tuning tasks
3. ⏳ Dashboard enhancements for quality metrics
4. ⏳ Learning system (Phase 7)

---

## Risk Assessment

### Technical Risks

**Risk T1: Script Execution Failures**
- **Likelihood**: Medium
- **Impact**: High (blocks autopilot)
- **Mitigation**: Fail-safe mode (timeout → log warning, continue)
- **Detection**: Monitor error rate in telemetry
- **Response**: Disable feature flag if error rate >5%

**Risk T2: Performance Degradation**
- **Likelihood**: Low
- **Impact**: Medium (slower iterations)
- **Mitigation**: Aggressive timeouts, fail-safe defaults
- **Detection**: Monitor execution time in telemetry
- **Response**: Optimize or increase timeouts if p95 >targets

**Risk T3: Integration Bugs**
- **Likelihood**: Low
- **Impact**: Critical (autopilot broken)
- **Mitigation**: Comprehensive testing, feature flag for rollback
- **Detection**: Monitor autopilot error rate
- **Response**: Disable quality checks, fix bugs, re-enable

### Quality Risks

**Risk Q1: False Positives**
- **Likelihood**: High (initially)
- **Impact**: High (blocks valid work)
- **Mitigation**: Start in shadow mode, tune before enforcing
- **Detection**: Manual review of shadow mode failures
- **Response**: Adjust thresholds or disable problematic checks

**Risk Q2: False Negatives**
- **Likelihood**: Medium
- **Impact**: Medium (misses real issues)
- **Mitigation**: Parallel manual checks during shadow mode
- **Detection**: Compare automated vs manual detection
- **Response**: Add/strengthen checks that missed issues

### Process Risks

**Risk P1: Rollout Too Aggressive**
- **Likelihood**: Low
- **Impact**: High (autopilot unusable)
- **Mitigation**: Progressive rollout (shadow → observe → enforce)
- **Detection**: Monitor success rate drop
- **Response**: Rollback to previous mode

**Risk P2: Insufficient Monitoring**
- **Likelihood**: Medium
- **Impact**: Medium (can't assess effectiveness)
- **Mitigation**: Comprehensive telemetry from day 1
- **Detection**: Check telemetry completeness
- **Response**: Add missing metrics before enforce mode

---

## Test Strategy

### Unit Tests
**File**: `tools/wvo_mcp/src/orchestrator/__tests__/work_process_quality_integration.test.ts`

**Tests**:
1. ✅ Constructor initializes config correctly
2. ✅ runPreflightChecks executes script and parses output
3. ✅ runQualityGates executes script and parses output
4. ✅ runReasoningValidation executes script with --task parameter
5. ✅ Timeout handling logs warning and returns non-blocking result
6. ✅ Error handling logs error and returns non-blocking result (fail-safe)
7. ✅ shouldBlockTransition returns correct boolean based on mode
8. ✅ Telemetry logged for all check types
9. ✅ Shadow mode never blocks transitions
10. ✅ Observe mode never blocks but logs warnings
11. ✅ Enforce mode blocks on failure

### Integration Tests
**File**: `tools/wvo_mcp/src/orchestrator/__tests__/work_process_enforcer.quality.integration.test.ts`

**Tests**:
1. ✅ Happy path: all checks pass, all phases advance
2. ✅ Pre-flight failure blocks IMPLEMENT in enforce mode
3. ✅ Quality gate failure blocks VERIFY in enforce mode
4. ✅ Reasoning failure blocks MONITOR in enforce mode
5. ✅ Timeout doesn't block (fail-safe)
6. ✅ Script error doesn't block (fail-safe)
7. ✅ Shadow mode: checks run but don't block
8. ✅ Feature flag disabled: no checks run

### Manual Testing
**Checklist**:
- [ ] Deploy to dev environment with shadow mode
- [ ] Run 10 tasks, verify telemetry shows checks running
- [ ] Inject quality violation (oversized file), verify detection
- [ ] Switch to enforce mode, verify blocking works
- [ ] Disable feature flag, verify autopilot works without checks
- [ ] Monitor performance overhead (<5 min)

---

## Documentation Plan

### Code Documentation
- JSDoc comments for all public methods
- Inline comments explaining complex logic (timeout handling, fail-safe)
- README.md update with integration architecture

### User Documentation
- CLAUDE.md update: explain quality check integration
- AGENTS.md update: same for Codex agents
- Runbook for troubleshooting quality check failures

### Operational Documentation
- Rollout checklist (shadow → observe → enforce)
- Feature flag configuration guide
- Monitoring dashboard setup

---

## Definition of "Done" for SPEC Phase

This SPEC is complete when:
1. ✅ All 8 acceptance criteria defined with clear tests
2. ✅ Integration contract (TypeScript interfaces) specified
3. ✅ Verification matrix complete (how to test each AC)
4. ✅ Out-of-scope boundaries explicit
5. ✅ KPIs defined with measurable targets
6. ✅ Dependencies mapped (upstream & downstream)
7. ✅ Risks assessed with mitigations
8. ✅ Test strategy comprehensive (unit, integration, manual)

**Status**: ✅ COMPLETE - ready for PLAN phase

---

**Next Phase**: PLAN - break down implementation into specific tasks with time estimates
