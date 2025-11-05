# Test Scenarios: Enforcement Validation

## Overview

This document defines 15 test scenarios to empirically validate the unified enforcement system. Tests are organized by enforcement layer and include integration scenarios demonstrating defense-in-depth.

**Test Categories:**
1. Layer 1: Roadmap Completion Enforcement (2 scenarios)
2. Layer 2: Phase Sequence Enforcement (5 scenarios)
3. Layer 3: GATE Enforcement (4 scenarios)
4. Integration: Defense-in-Depth (4 scenarios)

**Total:** 15 scenarios

---

## Category 1: Roadmap Completion Enforcement

### Scenario 1.1: Block Incomplete Evidence

**Purpose:** Prove Layer 1 blocks marking task done without complete evidence

**Setup:**
1. Create test task: `TEST-ROADMAP-INCOMPLETE`
2. Create evidence directory: `state/evidence/TEST-ROADMAP-INCOMPLETE/`
3. Create partial evidence:
   - strategy.md ✅
   - spec.md ✅
   - plan.md ✅
   - think.md ✅
   - verify.md ❌ (missing)
   - review.md ❌ (missing)
4. Modify roadmap: mark task as `status: done`
5. Attempt commit

**Expected Outcome:**
- ❌ BLOCKED
- Error message lists missing artifacts (verify.md, review.md)
- Remediation steps provided
- Commit prevented

**Validation:**
- Error message contains: "Cannot mark TEST-ROADMAP-INCOMPLETE as done"
- Missing artifacts listed clearly
- Commit fails (exit code 1)

**Cleanup:**
- Delete test evidence directory
- Revert roadmap changes

---

### Scenario 1.2: Allow Complete Evidence

**Purpose:** Prove Layer 1 allows marking task done with complete evidence

**Setup:**
1. Create test task: `TEST-ROADMAP-COMPLETE`
2. Create evidence directory: `state/evidence/TEST-ROADMAP-COMPLETE/`
3. Create complete evidence:
   - strategy.md ✅
   - spec.md ✅
   - plan.md ✅
   - think.md ✅
   - verify.md ✅
   - review.md ✅
4. Modify roadmap: mark task as `status: done`
5. Attempt commit

**Expected Outcome:**
- ✅ ALLOWED
- Success message
- Commit proceeds normally

**Validation:**
- No error message
- Commit succeeds (exit code 0)
- Roadmap change committed

**Cleanup:**
- Revert commit
- Delete test evidence directory

---

## Category 2: Phase Sequence Enforcement

### Scenario 2.1: Block Missing STRATEGIZE

**Purpose:** Prove Layer 2 blocks implementation without STRATEGIZE phase

**Setup:**
1. Create test task: `TEST-PHASE-NO-STRATEGIZE`
2. Create evidence directory: `state/evidence/TEST-PHASE-NO-STRATEGIZE/`
3. DO NOT create strategy.md
4. Create test implementation file: `src/test_file_scenario_2_1.ts`
5. Add minimal content: `export const test = "scenario 2.1";`
6. Stage implementation file
7. Commit message: `test: scenario 2.1 [TEST-PHASE-NO-STRATEGIZE]`

**Expected Outcome:**
- ❌ BLOCKED
- Error: "STRATEGIZE: strategy.md not found"
- Phase progress shows: ❌ STRATEGIZE
- Remediation: template copy command for strategy.md

**Validation:**
- Error message lists STRATEGIZE as missing
- Commit fails
- Remediation command provided

**Cleanup:**
- Unstage file
- Delete test file
- Delete evidence directory

---

### Scenario 2.2: Block Missing SPEC

**Purpose:** Prove Layer 2 blocks implementation without SPEC phase

**Setup:**
1. Create test task: `TEST-PHASE-NO-SPEC`
2. Create evidence directory
3. Create strategy.md ✅
4. DO NOT create spec.md ❌
5. Create test implementation file: `src/test_file_scenario_2_2.ts`
6. Stage and commit with task ID

**Expected Outcome:**
- ❌ BLOCKED
- Phase progress: ✅ STRATEGIZE, ❌ SPEC
- Error: "SPEC: spec.md not found"

**Validation:**
- STRATEGIZE shown as complete
- SPEC shown as missing
- Commit fails

**Cleanup:** Delete test files and evidence

---

### Scenario 2.3: Block Missing PLAN

**Purpose:** Prove Layer 2 blocks implementation without PLAN phase

**Setup:**
1. Create test task: `TEST-PHASE-NO-PLAN`
2. Create strategy.md ✅ and spec.md ✅
3. DO NOT create plan.md ❌
4. Create test implementation file
5. Attempt commit

**Expected Outcome:**
- ❌ BLOCKED
- Phase progress: ✅ STRATEGIZE, ✅ SPEC, ❌ PLAN
- Error: "PLAN: plan.md not found"

**Validation:**
- First two phases shown complete
- PLAN shown as missing
- Commit fails

**Cleanup:** Delete test files and evidence

---

### Scenario 2.4: Block Missing THINK

**Purpose:** Prove Layer 2 blocks implementation without THINK phase

**Setup:**
1. Create test task: `TEST-PHASE-NO-THINK`
2. Create strategy.md ✅, spec.md ✅, plan.md ✅
3. DO NOT create think.md ❌
4. Create test implementation file
5. Attempt commit

**Expected Outcome:**
- ❌ BLOCKED
- Phase progress: ✅ STRATEGIZE, ✅ SPEC, ✅ PLAN, ❌ THINK
- Error: "THINK: think.md not found"

**Validation:**
- First three phases shown complete
- THINK shown as missing
- Commit fails

**Cleanup:** Delete test files and evidence

---

### Scenario 2.5: Allow Complete Phases

**Purpose:** Prove Layer 2 allows implementation when all required phases complete

**Setup:**
1. Create test task: `TEST-PHASE-COMPLETE`
2. Create complete upstream evidence:
   - strategy.md ✅
   - spec.md ✅
   - plan.md ✅
   - think.md ✅
3. Create small test implementation: `src/test_file_scenario_2_5.ts` (10 LOC)
4. Attempt commit with task ID

**Expected Outcome:**
- ✅ ALLOWED
- Success message: "All required phases complete for TEST-PHASE-COMPLETE"
- Commit proceeds

**Validation:**
- No error message
- All phases shown as complete (✅)
- GATE not required (single file, <20 LOC)
- Commit succeeds

**Cleanup:** Revert commit, delete test files and evidence

---

## Category 3: GATE Enforcement

### Scenario 3.1: Block Multiple Files Without GATE

**Purpose:** Prove Layer 3 blocks multi-file commits without design.md

**Setup:**
1. Create test task: `TEST-GATE-MULTIFILE`
2. Create complete upstream phases (strategy, spec, plan, think)
3. DO NOT create design.md ❌
4. Create TWO test implementation files:
   - `src/test_file_3_1_a.ts` (10 LOC)
   - `src/test_file_3_1_b.ts` (10 LOC)
5. Stage both files
6. Attempt commit with task ID

**Expected Outcome:**
- ❌ BLOCKED
- Phase progress shows: ✅ STRATEGIZE, ✅ SPEC, ✅ PLAN, ✅ THINK
- GATE error: "❌ GATE: design.md not found (required: 2 implementation files changed)"
- Remediation: template copy command for design.md

**Validation:**
- Error explicitly states "2 implementation files changed"
- GATE shown as required but missing
- Remediation command provided
- Commit fails

**Cleanup:** Unstage files, delete test files and evidence

---

### Scenario 3.2: Block High LOC Without GATE

**Purpose:** Prove Layer 3 blocks high-LOC commits without design.md

**Setup:**
1. Create test task: `TEST-GATE-HIGH-LOC`
2. Create complete upstream phases
3. DO NOT create design.md ❌
4. Create single test file with >20 net LOC:
   - `src/test_file_scenario_3_2.ts` (50 LOC)
5. Stage file
6. Attempt commit

**Expected Outcome:**
- ❌ BLOCKED
- GATE error: "design.md not found (required: 50 net LOC)"

**Note:** LOC analysis uses `scripts/analyze_loc.mjs`

**Validation:**
- Error states LOC count
- GATE shown as required
- Commit fails

**Cleanup:** Delete test files and evidence

---

### Scenario 3.3: Allow Simple Change Without GATE

**Purpose:** Prove Layer 3 allows small single-file changes without design.md

**Setup:**
1. Create test task: `TEST-GATE-NOT-REQUIRED`
2. Create complete upstream phases (strategy, spec, plan, think)
3. DO NOT create design.md ❌
4. Create single small file:
   - `src/test_file_scenario_3_3.ts` (10 LOC)
5. Stage file
6. Attempt commit

**Expected Outcome:**
- ✅ ALLOWED
- Phase progress: ✅ STRATEGIZE, ✅ SPEC, ✅ PLAN, ✅ THINK
- GATE message: "⏭  GATE: design.md (not required: single file, ≤20 LOC)"
- Commit succeeds

**Validation:**
- GATE shown as not required
- Reason provided (single file, low LOC)
- Commit succeeds

**Cleanup:** Revert commit, delete test files and evidence

---

### Scenario 3.4: Allow Complex Change With GATE

**Purpose:** Prove Layer 3 allows complex changes when design.md exists

**Setup:**
1. Create test task: `TEST-GATE-SATISFIED`
2. Create complete evidence including design.md:
   - strategy.md ✅
   - spec.md ✅
   - plan.md ✅
   - think.md ✅
   - design.md ✅
3. Create multi-file implementation:
   - `src/test_file_3_4_a.ts` (20 LOC)
   - `src/test_file_3_4_b.ts` (20 LOC)
4. Stage both files
5. Attempt commit

**Expected Outcome:**
- ✅ ALLOWED
- Phase progress: All ✅ including GATE
- GATE message: "✅ GATE: design.md"
- Commit succeeds

**Validation:**
- GATE shown as satisfied
- All phases complete
- Commit succeeds

**Cleanup:** Revert commit, delete test files and evidence

---

## Category 4: Integration (Defense-in-Depth)

### Scenario 4.1: Bypass Attempt Caught by First Layer

**Purpose:** Prove defense-in-depth catches violations at first applicable layer

**Setup:**
1. Create test task: `TEST-INTEGRATION-BYPASS`
2. Create NO evidence (empty evidence directory)
3. Create implementation file: `src/test_file_scenario_4_1.ts`
4. Attempt commit with task ID

**Expected Outcome:**
- ❌ BLOCKED by Layer 2
- Error: "No evidence directory" or "Missing phases: STRATEGIZE, SPEC, PLAN, THINK"
- Never reaches Layer 1 (roadmap not modified)
- Never reaches Layer 3 (blocked before GATE check)

**Validation:**
- Layer 2 blocks immediately
- Error message from phase validation (not roadmap validation)
- Commit fails at first enforcement point

**Cleanup:** Delete test files and evidence

---

### Scenario 4.2: Full Compliance Allowed Through All Layers

**Purpose:** Prove valid workflow passes all three layers

**Setup:**
1. Create test task: `TEST-INTEGRATION-VALID`
2. Create complete evidence:
   - strategy.md ✅
   - spec.md ✅
   - plan.md ✅
   - think.md ✅
   - design.md ✅
   - verify.md ✅
   - review.md ✅
3. Create implementation file: `src/test_file_scenario_4_2.ts` (10 LOC)
4. Commit implementation (Layer 2 validates)
5. Modify roadmap: mark task done (Layer 1 validates)
6. Commit roadmap change

**Expected Outcome:**
- ✅ ALLOWED through Layer 2 (implementation commit)
- ✅ ALLOWED through Layer 1 (roadmap commit)
- Both commits succeed
- No blocks

**Validation:**
- Implementation commit passes Layer 2
- Roadmap commit passes Layer 1
- Full workflow validated

**Cleanup:** Revert commits, delete test files and evidence

---

### Scenario 4.3: Partial Compliance Caught by Appropriate Layer

**Purpose:** Prove each layer catches violations in its domain

**Test 4.3a: Implementation Without Phases (Layer 2)**
- Setup: No evidence, attempt implementation
- Expected: ❌ BLOCKED by Layer 2
- Validation: Phase validation error

**Test 4.3b: Mark Done Without Verify (Layer 1)**
- Setup: Evidence without verify.md, modify roadmap
- Expected: ❌ BLOCKED by Layer 1
- Validation: Roadmap validation error

**Test 4.3c: Multi-File Without GATE (Layer 3)**
- Setup: Complete phases except design.md, multi-file impl
- Expected: ❌ BLOCKED by Layer 3 (embedded in Layer 2)
- Validation: GATE requirement error

**Expected Outcome:**
- Each layer blocks its specific violation
- Errors are specific to layer
- No cross-layer confusion

**Validation:**
- Layer 2 errors mention phases
- Layer 1 errors mention roadmap evidence
- Layer 3 errors mention GATE/design.md

**Cleanup:** Delete all test artifacts

---

### Scenario 4.4: Docs-Only Exempt From Validation

**Purpose:** Prove exemptions work correctly

**Setup:**
1. Create docs-only change: `docs/test_scenario_4_4.md`
2. Add content to docs file
3. Stage docs file
4. Commit without task ID or evidence

**Expected Outcome:**
- ✅ ALLOWED
- Message: "Documentation/chore commit, skipping phase validation"
- No phase validation runs
- Commit succeeds

**Validation:**
- No enforcement errors
- Exemption message shown
- Commit succeeds

**Cleanup:** Revert commit, delete test docs file

---

## Test Execution Plan

### Preparation

1. **Create test branch:**
   ```bash
   git checkout -b test-enforcement-validation
   ```

2. **Create test directory:**
   ```bash
   mkdir -p state/evidence/test-scenarios
   ```

3. **Prepare templates:**
   - Copy phase templates for quick evidence creation
   - Prepare test file templates

### Execution Order

**Phase 1: Layer 1 Tests**
- Run scenarios 1.1, 1.2
- Validate roadmap enforcement
- Document results

**Phase 2: Layer 2 Tests**
- Run scenarios 2.1, 2.2, 2.3, 2.4, 2.5
- Validate phase sequence enforcement
- Document results

**Phase 3: Layer 3 Tests**
- Run scenarios 3.1, 3.2, 3.3, 3.4
- Validate GATE enforcement
- Document results

**Phase 4: Integration Tests**
- Run scenarios 4.1, 4.2, 4.3, 4.4
- Validate defense-in-depth
- Document results

### Evidence Collection

**For each scenario:**
1. **Setup state:** Document initial conditions
2. **Execute test:** Run exact commands
3. **Capture output:** Copy full error messages or success confirmations
4. **Validate outcome:** Confirm matches expectation
5. **Clean up:** Remove test artifacts
6. **Document:** Record in test_execution.md

### Success Criteria

**Per Scenario:**
- Outcome matches expectation (blocked or allowed)
- Error messages are clear and helpful
- Remediation steps work (if blocked)

**Overall:**
- 9/9 block scenarios successfully block
- 6/6 allow scenarios successfully allow
- Error messages provide clear remediation
- Coverage: 100% of designed scenarios

---

## Remediation Validation

**For each block scenario:**
1. **Observe error:** Capture error message
2. **Follow remediation:** Execute provided commands
3. **Retry commit:** Attempt commit again
4. **Verify success:** Confirm commit now allowed
5. **Document:** Prove remediation guidance works

**Example (Scenario 2.1):**
```bash
# Initial attempt: BLOCKED
git commit -m "test [TEST-PHASE-NO-STRATEGIZE]"
# Error: "STRATEGIZE: strategy.md not found"

# Follow remediation
cp docs/templates/strategy_template.md state/evidence/TEST-PHASE-NO-STRATEGIZE/strategy.md

# ... create other required phases

# Retry: ALLOWED
git commit -m "test [TEST-PHASE-NO-STRATEGIZE]"
# Success
```

---

## Expected Results Summary

| Scenario | Layer | Expected | Validation Point |
|----------|-------|----------|------------------|
| 1.1 | L1 | ❌ BLOCKED | Missing verify.md, review.md |
| 1.2 | L1 | ✅ ALLOWED | Complete evidence |
| 2.1 | L2 | ❌ BLOCKED | No strategy.md |
| 2.2 | L2 | ❌ BLOCKED | No spec.md |
| 2.3 | L2 | ❌ BLOCKED | No plan.md |
| 2.4 | L2 | ❌ BLOCKED | No think.md |
| 2.5 | L2 | ✅ ALLOWED | All phases complete |
| 3.1 | L3 | ❌ BLOCKED | 2 files, no design.md |
| 3.2 | L3 | ❌ BLOCKED | >20 LOC, no design.md |
| 3.3 | L3 | ✅ ALLOWED | Single file, <20 LOC |
| 3.4 | L3 | ✅ ALLOWED | Complex + design.md |
| 4.1 | L2 | ❌ BLOCKED | No evidence |
| 4.2 | ALL | ✅ ALLOWED | Full compliance |
| 4.3 | Varies | ❌ BLOCKED | Layer-specific violations |
| 4.4 | EXEMPT | ✅ ALLOWED | Docs-only exemption |

**Blocks:** 9/15 (60% should block invalid scenarios)
**Allows:** 6/15 (40% should allow valid scenarios)
**Coverage:** 100% (all enforcement points tested)

---

## Next Steps

1. Execute all 15 scenarios on test branch
2. Capture actual output for each scenario
3. Validate outcomes match expectations
4. Document results in `test_execution.md`
5. Calculate efficacy metrics in `efficacy_metrics.md`

**Estimated Execution Time:** 2-3 hours for all 15 scenarios with full documentation
