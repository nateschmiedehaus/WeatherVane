# STRATEGY: w0m2-test-harness

**Set ID:** w0m2-test-harness
**Milestone:** W0.M2 (Test Harness)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Problem Analysis

**What problem are we solving?**

Autopilot can execute real roadmap tasks, but needs safe testing environment:
- **Risk:** Testing on production roadmap could break real work
- **Isolation:** Need separate test environment for validation
- **Repeatability:** Tests must be reproducible
- **Coverage:** Need diverse test scenarios (simple, complex, failure cases)

**Current state:**
- Only way to test is run Wave 0 on real roadmap (risky)
- No isolated test environment
- Can't test edge cases without affecting production
- Hard to reproduce test scenarios

**Pain points:**
1. **Production risk** - Testing might break real roadmap
2. **Limited scenarios** - Can't test failure cases safely
3. **Not reproducible** - Every test modifies state
4. **Slow feedback** - Must wait for real tasks to test

---

## Root Cause

**Why does this gap exist?**

**Historical:**
- Built autopilot for production use (test environment deferred)
- Focused on real tasks (not test harness)
- MVP approach (ship first, test later)

**Systemic:**
- No test-first culture
- Production and test not separated
- Manual testing only

**The core issue:** **No safe test environment for autopilot validation**

---

## Goal / Desired Outcome

**Build test harness for safe autopilot validation:**

### 1. Isolated Test Environment
- Separate test roadmap (state/test/roadmap.yaml)
- Separate test evidence (state/test/evidence/)
- No interference with production
- Easy to reset

**Measurable:** Tests run in isolation, production untouched

### 2. Synthetic Test Tasks
- Simple tasks (validate basic flow)
- Complex tasks (multi-step, dependencies)
- Failure cases (errors, timeouts, conflicts)
- Edge cases (empty input, huge files, etc.)

**Measurable:** 10+ synthetic tasks covering common scenarios

### 3. Automated Test Suite
- Run all tests with one command
- Parallel execution (fast feedback)
- Clear pass/fail reporting
- Integration with CI

**Measurable:** npm test runs all tests, <5 min execution

---

## AFP/SCAS Alignment

### ECONOMY (Via Negativa)

**What are we DELETING?**
- Manual testing → automated tests
- Production risk → isolated environment
- Slow feedback → fast parallel tests

**What are we ADDING?**
- Test harness (~300 LOC)
- Synthetic tasks (~200 LOC)
- Test runner (~100 LOC)

**Is the addition justified?**
- **Yes:** Prevents production issues (safety)
- **Yes:** Faster feedback (minutes vs hours)
- **Yes:** Better coverage (edge cases testable)

---

## Success Criteria

**Set complete when:**

### Test Environment Isolated
- [ ] Test roadmap in state/test/
- [ ] Test evidence in state/test/evidence/
- [ ] Production untouched by tests
- [ ] Easy reset (rm -rf state/test/)

### Synthetic Tasks Created
- [ ] 10+ test tasks (simple, complex, failure, edge)
- [ ] Cover common scenarios
- [ ] Reproducible
- [ ] Well-documented

### Test Suite Automated
- [ ] npm test runs all tests
- [ ] Parallel execution
- [ ] Pass/fail reporting
- [ ] <5 min execution

---

## Estimated Effort

**Test environment:** 4 hours
**Synthetic tasks:** 4 hours
**Test runner:** 4 hours

**Total:** ~12 hours

---

**Strategy complete:** 2025-11-06
**Next phase:** spec.md
**Owner:** Claude Council
**Tasks in set:** AFP-W0-M2-TEST-HARNESS-VALIDATION
