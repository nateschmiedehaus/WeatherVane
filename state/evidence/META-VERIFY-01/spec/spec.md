# META-VERIFY-01: Pre-Commit Verification Protocol

## Problem Statement

**Observed Gap**: IMP-ADV-01.6 was marked COMPLETE and committed without:
1. Running end-to-end tests of neural embeddings mode
2. Critically evaluating 59x performance degradation (219ms vs 3.7ms)
3. Verifying implementation produces correct outputs in actual use
4. Identifying missing optimizations (batch API, GPU support)

**Root Cause**: VERIFY phase relied on pre-existing documents without:
- Actually running the code
- Testing performance claims
- Thinking critically about "acceptable" trade-offs
- Checking if builds compile with changes

**Impact**:
- IMP-ADV-01.6 is technically correct but NOT production-ready (no batch API)
- "42% improvement with 59x slower latency" should have triggered "needs optimization" flag
- Claimed completion prematurely without validating performance acceptability

## Spec: Mandatory Pre-Commit Verification Checklist

### Trigger
BEFORE marking ANY task as complete in MONITOR phase OR creating PR commit.

### Acceptance Criteria

#### AC1: Build Verification (MANDATORY)
- ✅ TypeScript build passes: `npm run build` → 0 errors
- ✅ Linter passes: `npm run lint` → 0 errors (or acceptable warnings documented)
- ✅ Type check passes: `npm run typecheck` → 0 errors

**Gate**: If build fails, task is NOT complete. Return to IMPLEMENT.

---

#### AC2: Test Verification (MANDATORY)
- ✅ Full test suite passes: `npm test` → 0 failures
- ✅ Related tests pass: Run tests for modified modules
- ✅ Integration tests pass: Run smoke/integration tests if applicable
- ✅ No skipped tests: If tests are skipped, document WHY in MONITOR

**Gate**: If tests fail, task is NOT complete. Return to IMPLEMENT.

---

#### AC3: End-to-End Functional Verification (MANDATORY)
- ✅ **Actually run the code**: Execute the feature in realistic scenario
- ✅ **Verify outputs**: Check outputs are correct, not just "no errors"
- ✅ **Test edge cases**: Try invalid inputs, boundary conditions
- ✅ **Check error messages**: Verify error messages are actionable

**Examples**:
```bash
# For IMP-ADV-01.6, should have run:
QUALITY_GRAPH_EMBEDDINGS=neural python3 scripts/quality_graph/record_task_vector.py <workspace> <task-id>
QUALITY_GRAPH_EMBEDDINGS=neural python3 scripts/quality_graph/query_similar_tasks.py <workspace> <task-id>
# Verify: Check JSONL output has 384D vectors, similarity scores make sense
```

**Gate**: If functionality doesn't work, task is NOT complete.

---

#### AC4: Performance Validation (MANDATORY for performance-sensitive changes)
- ✅ **Measure actual latency**: Benchmark with realistic data
- ✅ **Critical evaluation**: Is Nx slower "acceptable"? For what use case?
- ✅ **Missing optimizations**: Identify obvious improvements (batching, caching, GPU)
- ✅ **Document trade-offs**: Write clear analysis of performance vs quality

**Red Flags**:
- 🚩 >10x slower without clear justification
- 🚩 >100ms latency for operations that run frequently
- 🚩 No batching API for ML model inference
- 🚩 CPU-only when GPU available
- 🚩 Re-loading models on every call

**Gate**: If performance is unacceptable without optimization, create follow-up task BEFORE marking complete.

---

#### AC5: Integration Verification (MANDATORY)
- ✅ **Check upstream callers**: Do they still work?
- ✅ **Verify downstream consumers**: Can they use the new feature?
- ✅ **Test feature flags**: Try all flag values (on/off/invalid)
- ✅ **Rollback test**: Verify rollback path works (disable flag, revert code)

**Gate**: If integration breaks, task is NOT complete.

---

#### AC6: Documentation Verification (MANDATORY)
- ✅ **README accuracy**: Do usage examples actually work?
- ✅ **Error messages**: Are they actionable?
- ✅ **Performance claims**: Are they measured, not guessed?
- ✅ **Trade-offs**: Are they honestly documented?

**Gate**: If docs are wrong, update them BEFORE committing.

---

## Enforcement

### VERIFY Phase Checklist
At START of VERIFY phase, add this checklist to verify/verification.md:

```markdown
## Pre-Commit Verification Checklist

Before marking task complete:

### Build Verification
- [ ] `npm run build` → 0 errors
- [ ] `npm run lint` → 0 errors or documented warnings
- [ ] `npm run typecheck` → 0 errors

### Test Verification
- [ ] Full test suite passes
- [ ] Related tests pass
- [ ] Integration tests pass
- [ ] No unexplained skipped tests

### End-to-End Verification
- [ ] Actually ran the feature with realistic data
- [ ] Verified outputs are correct (not just "no errors")
- [ ] Tested error cases and edge cases
- [ ] Error messages are actionable

### Performance Validation (if applicable)
- [ ] Measured actual latency with realistic data
- [ ] Critically evaluated performance trade-offs
- [ ] Identified missing optimizations
- [ ] Documented performance characteristics

### Integration Verification
- [ ] Upstream callers still work
- [ ] Downstream consumers can use new feature
- [ ] Feature flags work (all values)
- [ ] Rollback path verified

### Documentation Verification
- [ ] README examples actually work
- [ ] Performance claims are measured
- [ ] Trade-offs honestly documented
```

### MONITOR Phase Gate
MONITOR phase MUST verify all checklist items checked before creating completion.md.

If ANY item fails:
1. Mark task status as "BLOCKED - verification failed"
2. Return to earliest impacted phase (usually IMPLEMENT)
3. Fix the gap
4. Re-run VERIFY → REVIEW → PR → MONITOR

### Automation (Future)
- Add pre-commit git hook that runs build + tests
- CI pipeline that blocks merge if tests fail
- Automated performance benchmarks in PR comments

---

## Success Metrics

- **Before this protocol**: Tasks marked complete without verification (e.g., IMP-ADV-01.6)
- **After this protocol**: Zero tasks marked complete with failing builds/tests/performance issues
- **Target**: 100% of tasks pass verification checklist before MONITOR phase

---

## Related Learnings

This meta task addresses:
- **Learning 5** (CLAUDE.md): Guarantee Verification Gap - never guarantee functionality without verification checklist
- **IMP-ADV-01.6 gap**: Marked complete without running neural embeddings end-to-end or critically evaluating 59x slowdown

---

## Implementation Notes

1. Add checklist template to `docs/autopilot/templates/verify/verification_checklist.md`
2. Update VERIFY phase documentation to mandate checklist
3. Update WorkProcessEnforcer to require checklist completion before MONITOR
4. Add to CLAUDE.md as mandatory VERIFY protocol

---

## Acceptance Criteria for META-VERIFY-01

1. ✅ Checklist template created in docs/autopilot/templates/
2. ✅ VERIFY phase docs updated to mandate checklist
3. ✅ CLAUDE.md updated with pre-commit verification protocol
4. ✅ At least 1 task (future) completes using this checklist
5. ✅ Evidence shows checklist caught a gap that would have been missed

---

## Status

**Created**: 2025-10-29 (in response to IMP-ADV-01.6 verification gaps)
**Priority**: HIGH (prevents future premature completions)
**Effort**: 1-2 hours (documentation updates)
**Blocking**: No (doesn't block current work, prevents future gaps)
