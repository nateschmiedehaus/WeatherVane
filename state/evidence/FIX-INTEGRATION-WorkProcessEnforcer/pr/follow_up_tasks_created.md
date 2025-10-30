# Follow-Up Tasks Created

**Task**: FIX-INTEGRATION-WorkProcessEnforcer
**Date**: 2025-10-30
**Phase**: PR

---

## Summary

Created 6 follow-up tasks for deferred work identified during REVIEW phase and Pre-Mortem analysis.

**Total Tasks Created**: 6
**Source**: REVIEW findings (3) + Pre-Mortem mitigations (3 selected)

---

## Tasks Created

### 1. FIX-TEST-QualityIntegration
**Source**: REVIEW Finding 1 (No Unit Tests)
**Severity**: MEDIUM
**Estimated Effort**: 2 hours

**Description**: Create unit tests for WorkProcessQualityIntegration class

**Scope**:
- Test timeout handling (SIGTERM → SIGKILL escalation)
- Test error parsing (invalid JSON, script failures)
- Test mode logic (shadow/observe/enforce blocking behavior)
- Test fail-safe defaults
- Test telemetry logging

**Exit Criteria**:
- Test coverage >80% for work_process_quality_integration.ts
- All error paths tested
- All mode combinations tested

---

### 2. FIX-E2E-QualityIntegration
**Source**: REVIEW Finding 2 (No Integration Tests)
**Severity**: MEDIUM
**Estimated Effort**: 1.5 hours

**Description**: Create end-to-end integration tests for WorkProcessEnforcer + quality checks

**Scope**:
- Test phase transition hooks execute correctly
- Test quality checks run at correct phases
- Test blocking behavior in enforce mode
- Test telemetry is logged
- Test recordProcessRejection called on failures

**Exit Criteria**:
- E2E test passes in CI
- All phase transitions tested
- Enforce mode blocking verified

---

### 3. FIX-PERF-QualityChecks
**Source**: REVIEW Finding 3 (Performance Unverified) + Pre-Mortem Task 0.2
**Severity**: LOW
**Estimated Effort**: 2 hours

**Description**: Performance benchmarking and optimization for quality checks

**Scope**:
- Benchmark execution time on production tasks
- Identify if timeouts are appropriate
- Implement caching if needed (1-hour TTL)
- Implement parallel execution if safe
- Tune timeout values based on measurements

**Exit Criteria**:
- p95 execution time documented
- Timeouts tuned to actual needs
- Performance targets met (<30s preflight, <15s gates, <20s reasoning)

---

### 4. FIX-ERROR-QualityIntegration
**Source**: Pre-Mortem Task 0.1 (Comprehensive Error Testing)
**Severity**: MEDIUM
**Estimated Effort**: 1.5 hours

**Description**: Comprehensive error handling tests for quality integration

**Scope**:
- Test script not found errors
- Test script non-executable errors
- Test timeout errors (SIGTERM → SIGKILL)
- Test invalid JSON parsing
- Test disk full scenarios (telemetry)
- Test missing evidence directory

**Exit Criteria**:
- All error scenarios tested
- Error messages are actionable
- No uncaught exceptions possible

---

### 5. FIX-DOCS-QualityIntegration
**Source**: Pre-Mortem Task 0.5 (Documentation)
**Severity**: MEDIUM
**Estimated Effort**: 1 hour

**Description**: Update documentation for quality integration

**Scope**:
- Update CLAUDE.md Section 9 (mark autopilot integration complete)
- Update tools/wvo_mcp/README.md (config options, troubleshooting)
- Update docs/autopilot/WORK_PROCESS.md (phase transition enforcement)
- Create troubleshooting guide for quality check failures
- Document rollout progression (shadow → observe → enforce)

**Exit Criteria**:
- All documentation updated
- Examples provided for configuration
- Troubleshooting guide complete

---

### 6. FIX-ROLLBACK-QualityIntegration
**Source**: Pre-Mortem Task 0.4 (Rollback Procedure)
**Severity**: MEDIUM
**Estimated Effort**: 1 hour

**Description**: Document and test rollback procedure for quality integration

**Scope**:
- Create rollback script (disable quality checks)
- Document rollback triggers (success rate <85%)
- Test rollback procedure
- Create monitoring dashboard for rollback decision
- Document re-enable procedure after fixes

**Exit Criteria**:
- Rollback script tested
- Rollback procedure documented
- Monitoring dashboard available

---

## Tasks NOT Created (Explicitly Out of Scope)

### Pre-Mortem Task 0.3: Alert System
**Reason**: Shadow mode telemetry sufficient for initial rollout. Alerts can be added after observing actual failure patterns.
**Deferral**: Revisit after 2 weeks of shadow mode data.

### Pre-Mortem Task 0.6: Load Testing
**Reason**: Autopilot is single-instance, load testing not applicable. Performance benchmarking (FIX-PERF-QualityChecks) covers this.

### Pre-Mortem Task 0.7: User Training
**Reason**: Quality checks are autonomous, no user training required. Documentation (FIX-DOCS-QualityIntegration) covers operator needs.

### Task-Type Exemptions
**Reason**: Not needed until enforce mode. Can be added in Week 3+ if false positives show need for research/spike exemptions.

### False Positive Dashboard
**Reason**: JSONL telemetry + jq sufficient for initial analysis. UI can be built later if needed.

---

## Task Creation Summary

```bash
# Tasks added to state/roadmap.yaml
grep "id: FIX-.*-QualityIntegration" state/roadmap.yaml | wc -l
# Expected: 6

# Tasks by severity
# MEDIUM: 5 (TEST, E2E, ERROR, DOCS, ROLLBACK)
# LOW: 1 (PERF)

# Total estimated effort
# 2 + 1.5 + 2 + 1.5 + 1 + 1 = 9 hours
```

---

## Epic Assignment

All follow-up tasks assigned to:
**Epic**: E-QUALITY-FOLLOWUP
**Milestone**: M-QUALITY-ASSURANCE-v1

**Rationale**: These tasks complete the quality integration MVP and prepare for enforce mode rollout.

---

## Priority Guidance

**Week 1 (Shadow Mode)**:
- No tasks required (monitoring only)

**Week 2 (Observe Mode)**:
- FIX-DOCS-QualityIntegration (before observe mode starts)
- FIX-PERF-QualityChecks (tune based on shadow mode data)

**Week 3 (Before Enforce Mode)**:
- FIX-TEST-QualityIntegration (confidence for enforce mode)
- FIX-E2E-QualityIntegration (prove hooks work correctly)
- FIX-ERROR-QualityIntegration (ensure error handling robust)
- FIX-ROLLBACK-QualityIntegration (safety net for enforce mode)

**Sequence**: DOCS → PERF → TEST → E2E → ERROR → ROLLBACK

---

**Status**: ✅ FOLLOW-UP TASKS DOCUMENTED AND CREATED
