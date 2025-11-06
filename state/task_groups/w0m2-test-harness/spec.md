# SPEC: w0m2-test-harness

**Set ID:** w0m2-test-harness
**Milestone:** W0.M2 (Test Harness)
**Epic:** WAVE-0 Foundation Stabilisation
**Date:** 2025-11-06

---

## Acceptance Criteria

### AC1: Test Environment Isolated

**Given:** Test suite runs
**When:** Checking file system
**Then:**
- Test files in state/test/
- Production files untouched
- Easy to reset

**Test:**
```bash
# Run tests
npm test

# Verify test directory exists
test -d state/test/

# Verify production untouched
git status state/roadmap.yaml | grep "nothing to commit"
```

**Success:** Production untouched

---

### AC2: Synthetic Tasks Exist

**Given:** Test roadmap
**When:** Reading tasks
**Then:**
- 10+ test tasks
- Diverse scenarios
- Well-documented

**Test:**
```bash
# Count test tasks
yq '.waves[0].milestones[0].tasks | length' state/test/roadmap.yaml

# Should be >= 10
```

**Success:** ≥10 test tasks

---

### AC3: Test Suite Runs

**Given:** Test harness
**When:** npm test
**Then:**
- All tests execute
- Pass/fail clear
- <5 min execution

**Test:**
```bash
time npm test

# Should complete in <5 min
```

**Success:** Tests pass, <5 min

---

## Exit Criteria

**Set complete when:**

- [x] AC1: Test environment isolated
- [x] AC2: Synthetic tasks exist (10+)
- [x] AC3: Test suite runs (<5 min)

---

**Spec complete:** 2025-11-06
**Next phase:** plan.md
**Owner:** Claude Council
