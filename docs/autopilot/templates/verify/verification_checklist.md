# Pre-Commit Verification Checklist

**MANDATORY**: Complete this checklist before marking task as COMPLETE or creating PR commit.

**Purpose**: Prevent premature completion, catch gaps before commit, ensure quality standards.

---

## 0. Priority Alignment Verification (CHECK THIS FIRST!)

**Purpose**: Verify this task was the right thing to work on and still aligns with priorities.

**Checklist**:
- [ ] **Task in IMPROVEMENT_BATCH_PLAN.md**: Verified this task is listed in current phase priorities
- [ ] **Autopilot commands checked**: No conflicting commands (e.g., "REMEDIATION only" when working on non-REMEDIATION task)
- [ ] **No higher-priority blockers**: Confirmed no critical issues emerged that should have been addressed first
- [ ] **Dependencies complete**: All prerequisite tasks finished before starting this one
- [ ] **Timing appropriate**: Not waiting for monitoring period or blocked by external factors

**If misaligned**: STOP. Ask user if this task should continue or be abandoned for higher-priority work.

**Red Flags**:
- 🚩 Task NOT in IMPROVEMENT_BATCH_PLAN.md current phase
- 🚩 Autopilot command says "EXCLUSIVELY work on X" but this task is Y
- 🚩 Critical blocker exists that delays this task's value
- 🚩 Prerequisites incomplete (building on unstable foundation)

**Alignment verification** (fill this out):
```
Task: [TASK-ID]
In IMPROVEMENT_BATCH_PLAN.md Phase: [YES/NO]
Autopilot command conflicts: [NONE/YES with details]
Higher-priority work delayed: [NONE/YES with details]
Verdict: [ALIGNED / MISALIGNED / NEEDS USER APPROVAL]
```

---

## 1. Build Verification

**Run these commands**:
```bash
npm run build
npm run lint
npm run typecheck
```

**Checklist**:
- [ ] `npm run build` → 0 errors
- [ ] `npm run lint` → 0 errors (or acceptable warnings documented below)
- [ ] `npm run typecheck` → 0 errors

**If fails**: Return to IMPLEMENT phase. Task is NOT complete.

**Acceptable warnings** (document here if any):
```
(None, or list specific warnings with justification)
```

---

## 2. Test Verification

**Run these commands**:
```bash
npm test                    # Full test suite
npm test -- <test-pattern>  # Related tests only
```

**Checklist**:
- [ ] Full test suite passes (116+ files, 1585+ tests)
- [ ] Related tests for modified modules pass
- [ ] Integration/smoke tests pass (if applicable)
- [ ] No unexplained skipped tests

**If fails**: Return to IMPLEMENT phase. Fix failing tests.

**Skipped tests** (document if any):
```
(None, or list test names with justification for skipping)
```

---

## 3. End-to-End Functional Verification

**CRITICAL**: You must ACTUALLY RUN the feature, not just read documents.

**Checklist**:
- [ ] **Actually ran the code** with realistic data (not just unit tests)
- [ ] **Verified outputs are correct** (not just "no errors")
- [ ] **Tested error cases** (invalid inputs, edge cases)
- [ ] **Error messages are actionable** (user can fix the problem)

**Commands run** (paste actual commands with outputs):
```bash
(Example: python3 script.py --flag value)
(Paste relevant output showing it works)
```

**Output verification**:
```
(Document what you verified in the outputs)
```

**If fails**: Return to IMPLEMENT phase. Feature doesn't actually work.

---

## 4. Performance Validation

**Applicable if**: Task involves performance-sensitive code (APIs, queries, ML inference, large data processing)

**Checklist**:
- [ ] **Measured actual latency** with realistic data (not estimated)
- [ ] **Critically evaluated trade-offs** (is Nx slower acceptable? for what use case?)
- [ ] **Identified missing optimizations** (batching, caching, GPU, parallelization)
- [ ] **Documented performance characteristics** (latency, throughput, memory)

**Performance measurements**:
```
Operation: [what was measured]
Latency: [actual measurement]
Throughput: [if applicable]
Comparison: [vs baseline or alternative]
```

**Red flags that require action**:
- 🚩 >10x slower without clear justification → Identify optimizations
- 🚩 >100ms latency for frequent operations → Needs optimization
- 🚩 Missing batch API for ML inference → Add it before claiming complete
- 🚩 CPU-only when GPU available → Document why or add GPU support
- 🚩 Re-loading resources on every call → Add caching

**Trade-off analysis**:
```
(Why is the performance acceptable? What use case justifies it?)
```

**If unacceptable**: Create follow-up optimization task BEFORE marking complete, or implement optimization now.

---

## 5. Integration Verification

**Checklist**:
- [ ] **Upstream callers still work** (nothing breaks existing code)
- [ ] **Downstream consumers can use new feature** (API is usable)
- [ ] **Feature flags tested** (all values: on/off/invalid)
- [ ] **Rollback path verified** (can disable feature or revert safely)

**Integration tests**:
```
(What did you test? Which callers/consumers?)
```

**Rollback plan**:
```
(How to rollback: disable flag, revert commit, etc.)
```

**If fails**: Return to IMPLEMENT phase. Integration is broken.

---

## 6. Documentation Verification

**Checklist**:
- [ ] **README examples actually work** (run them yourself)
- [ ] **Performance claims are measured** (not guessed or assumed)
- [ ] **Trade-offs honestly documented** (no hiding limitations)
- [ ] **Error messages match documentation** (consistency)

**Documentation tested**:
```
(Which examples did you run? Paste commands and outputs)
```

**If fails**: Update documentation BEFORE committing.

---

## Checklist Completion

**All sections checked?** [ ] YES (if no, task is NOT complete)

**Evidence location**: `state/evidence/<TASK-ID>/verify/verification.md`

**Ready for MONITOR phase?** [ ] YES

---

## Notes

Add any additional notes, caveats, or context here:

```
(Optional notes)
```
