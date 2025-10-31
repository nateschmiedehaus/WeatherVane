# Follow-Up Tasks — FIX-TEST-QualityIntegration

## Overview
This document tracks follow-up tasks created during the REVIEW phase as deferred work that does not block Tier 2 (Production-Ready) completion.

---

## Task 1: Fix Vitest Coverage Tooling

**Task ID**: FIX-TOOLING-Vitest-Coverage
**Priority**: HIGH
**Severity**: MEDIUM
**Source**: Adversarial Review § 6.1

**Gap Description**:
Automated coverage reporting with `@vitest/coverage-v8` fails with "MISSING DEPENDENCY" error despite package being installed in node_modules. Manual coverage analysis was performed as mitigation but automated reports are standard practice.

**Root Cause**:
- Unclear - package exists at `tools/wvo_mcp/node_modules/@vitest/coverage-v8/`
- Version `3.2.4` matches vitest version
- Vitest cannot find dependency when invoked with `--coverage` flag
- May be configuration issue in `vitest.config.ts` (coverage explicitly disabled)

**Acceptance Criteria**:
1. `npx vitest run <test-file> --coverage` succeeds
2. Coverage report generated (HTML/terminal)
3. Coverage integrated into CI pipeline
4. Coverage thresholds enforced (>80%)

**Effort Estimate**: 1-2 hours

**Complexity**: LOW-MEDIUM
- Likely configuration or tooling issue
- Standard vitest coverage setup

**Follow-Up Epic**: TESTING-INFRASTRUCTURE

---

## Task 2: Enhance Quality Integration Edge Case Testing (OPTIONAL)

**Task ID**: ENHANCE-TEST-QualityIntegration-EdgeCases
**Priority**: LOW
**Severity**: LOW
**Source**: Adversarial Review § 6.2
**Tier**: Tier 3 (Hardened)

**Gap Description**:
Rare/extreme edge cases not tested in current test suite:
1. Script with partial JSON (cut off mid-stream)
2. Very large JSON output (memory limits)
3. Script that spawns child processes
4. Disk full scenario (logging failures)

**Rationale for Deferral**:
- Current test suite is comprehensive for Tier 2 (Production-Ready)
- These scenarios are unlikely in practice
- Fail-safe design mitigates impact of untested edges
- Telemetry provides observability for unexpected failures

**Acceptance Criteria**:
1. Test partial JSON output handling
2. Test large output scenarios (>1MB)
3. Test child process cleanup
4. Test disk full gracefully handled
5. All tests pass with 100% coverage

**Effort Estimate**: 3-4 hours

**Complexity**: MEDIUM
- Requires complex test setup (mocking disk full, etc.)
- Child process handling is non-trivial

**Follow-Up Epic**: TESTING-INFRASTRUCTURE (Tier 3 work)

---

## Task 3: Enhance Quality Integration Concurrency Testing (OPTIONAL)

**Task ID**: ENHANCE-TEST-QualityIntegration-Concurrency
**Priority**: LOW
**Severity**: MEDIUM
**Source**: Adversarial Review § 6.2
**Tier**: Tier 3 (Hardened)

**Gap Description**:
Concurrent execution and race conditions not tested. Current autopilot runs single-threaded so risk is low, but future multi-threaded execution could expose issues.

**Scenarios to Test**:
1. Multiple quality checks running concurrently
2. Race conditions in telemetry logging
3. Shared state conflicts
4. Load testing (many tasks in parallel)

**Rationale for Deferral**:
- Autopilot currently single-threaded
- No concurrent execution in production yet
- Would require significant test infrastructure
- Tier 3 work (hardened, not production-ready)

**Acceptance Criteria**:
1. Concurrent check execution tested (10+ parallel)
2. No race conditions detected
3. Telemetry logging thread-safe
4. Performance acceptable under load

**Effort Estimate**: 2-3 hours

**Complexity**: MEDIUM-HIGH
- Requires understanding of concurrency model
- May expose real implementation issues

**Follow-Up Epic**: TESTING-INFRASTRUCTURE (Tier 3 work)

---

## Summary

**Total Follow-Up Tasks**: 3
- **Required for Tier 2**: 1 (FIX-TOOLING-Vitest-Coverage)
- **Optional Tier 3**: 2 (edge cases, concurrency)

**Immediate Action**:
- Create FIX-TOOLING-Vitest-Coverage task in roadmap.yaml (HIGH priority)
- Defer Tier 3 tasks to TESTING-INFRASTRUCTURE epic (low priority)

**Follow-Up Budget**:
- 1 required task created (within 5-task limit)
- 2 optional tasks documented but deferred (not counted toward budget)
