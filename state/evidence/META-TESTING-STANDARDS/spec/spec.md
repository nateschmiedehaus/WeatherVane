# SPEC: META-TESTING-STANDARDS

**Task ID**: META-TESTING-STANDARDS
**Phase**: SPEC
**Date**: 2025-10-30
**Status**: In Progress

---

## Acceptance Criteria

### AC1: Verification Level Taxonomy Defined ✅ MUST HAVE

**What**: Document defining 4 verification levels with clear distinctions

**Location**: `docs/autopilot/VERIFICATION_LEVELS.md`

**Content must include**:
1. **Level 1: Compilation** - Code is syntactically valid
   - Proves: TypeScript types correct, no syntax errors
   - Does NOT prove: Logic works, integrations work, real-world usage
   - Required at: IMPLEMENT phase
   - Example good: `npm run build` returns 0 errors
   - Example bad: "Build passed" without showing command output

2. **Level 2: Smoke Testing** - Logic works with known inputs
   - Proves: Core logic correct, edge cases handled, outputs match expectations
   - Does NOT prove: Real APIs work, production-like data works
   - Required at: VERIFY phase
   - Example good: Unit tests with mocked data, all assertions pass
   - Example bad: Tests exist but don't actually assert anything

3. **Level 3: Integration Testing** - System works end-to-end
   - Proves: Real dependencies work, auth works, data flows correctly
   - Does NOT prove: Production load, real user scenarios
   - Required at: REVIEW phase (or explicitly deferred with justification)
   - Example good: Test with actual CLI logins, real API calls
   - Example bad: Mocked everything, never tested real integration

4. **Level 4: Production Validation** - Real users can use it
   - Proves: Works in production, handles real load, users succeed
   - Does NOT prove: Long-term reliability (requires monitoring)
   - Required at: MONITOR phase
   - Example good: User successfully runs feature, telemetry shows success
   - Example bad: "Looks good to me" without user testing

**Pass criteria**:
- [ ] All 4 levels documented with clear "Proves" and "Does NOT prove" sections
- [ ] Examples of good vs bad validation for each level
- [ ] Clear statement of which phase requires which level
- [ ] Task-type-specific examples (API, UI, ML, etc.)

---

### AC2: Work Process Updated with Level Requirements ✅ MUST HAVE

**What**: WORK_PROCESS.md explicitly states verification level requirements per phase

**Files to update**:
- `docs/autopilot/WORK_PROCESS.md`
- `CLAUDE.md` (section 8: The Complete Protocol → VERIFY subsection)
- `AGENTS.md` (equivalent section)

**Changes required**:
1. **IMPLEMENT phase**:
   - Add: "Must achieve Level 1 (Compilation) before proceeding"
   - Add: "Build with 0 errors required"
   - Add: "If build fails, stay in IMPLEMENT"

2. **VERIFY phase**:
   - Update from: "Run tests" (vague)
   - Update to: "Must achieve Level 2 (Smoke Testing) before proceeding"
   - Add: "Create tests that validate logic with known inputs"
   - Add: "Document what IS and IS NOT tested"
   - Add: "If smoke tests fail, return to IMPLEMENT"

3. **REVIEW phase**:
   - Add: "Assess if Level 3 (Integration) achieved or acceptably deferred"
   - Add: "If integration critical and not tested, return to IMPLEMENT/VERIFY"
   - Add: "Deferral acceptable only with explicit justification"

4. **MONITOR phase**:
   - Add: "Track Level 4 (Production) validation status"
   - Add: "User testing counts as Level 4 validation"

**Pass criteria**:
- [ ] Each phase explicitly mentions verification level
- [ ] Clear gates: failed level → return to earlier phase
- [ ] Examples added to each phase description
- [ ] Consistent terminology across all 3 files

---

### AC3: Examples Library Created ✅ MUST HAVE

**What**: Concrete examples showing good vs bad validation for common task types

**Location**: `docs/autopilot/examples/verification/`

**Files to create**:
1. `api_integration_good.md` - Example of well-validated API integration
2. `api_integration_bad.md` - Example of false completion (build-only)
3. `ml_model_good.md` - Example of validated ML model (performance tested)
4. `ml_model_bad.md` - Example of "trained model" with no validation
5. `ui_feature_good.md` - Example of tested UI (screenshots, interactions)
6. `ui_feature_bad.md` - Example of "UI built" without verification
7. `auth_integration_good.md` - Example of validated auth (real logins tested)
8. `auth_integration_bad.md` - Example of assumed auth (not tested)

**Each example must include**:
- Task description
- What was claimed as "done"
- What verification level was actually achieved
- What verification level was needed
- Why this is good/bad
- How to fix (for bad examples)

**Pass criteria**:
- [ ] At least 8 examples (4 good, 4 bad) covering different task types
- [ ] Each example clearly maps to verification levels
- [ ] "How to fix" section for all bad examples
- [ ] Real-world scenarios (not contrived)

---

### AC4: False Completion Detection Script ✅ SHOULD HAVE

**What**: Automated script to detect verification level mismatches

**Location**: `scripts/check_verification_level.sh`

**Functionality**:
```bash
# Usage: bash scripts/check_verification_level.sh IMP-35

# Checks:
# 1. If verify/verification_summary.md claims Level 2 but no test files exist
# 2. If implement complete but build never ran
# 3. If review claims integration works but no integration test evidence
# 4. If monitor claims user validation but no user testing documented

# Outputs:
# ✅ Verification level matches evidence
# ❌ MISMATCH: Claims Level X but evidence shows Level Y
# ⚠️  WARNING: Verification level not documented
```

**Detection rules**:
1. **Level 1 claimed** → Must find build log in evidence
2. **Level 2 claimed** → Must find test files AND test execution logs
3. **Level 3 claimed** → Must find integration test evidence or explicit deferral
4. **Level 4 claimed** → Must find user testing results or telemetry

**Pass criteria**:
- [ ] Script exists and is executable
- [ ] Detects all 4 levels of mismatch
- [ ] Provides actionable error messages
- [ ] Can be run in CI (exit code 0 = pass, 1 = fail)
- [ ] Optional `--strict` mode for enforcement

---

### AC5: Pre-Commit Checklist Updated ✅ MUST HAVE

**What**: Section 7.6 in CLAUDE.md updated with verification level requirements

**Current problem**: Checklist says "run tests" but doesn't specify what counts as testing

**Updates needed**:
1. Add "Verification Level" field to checklist
2. For each verification type, specify required level:
   - Build Verification → Level 1
   - Test Verification → Level 2
   - End-to-End Functional Verification → Level 3 (or defer with reason)
   - Integration Verification → Level 3 (or defer with reason)

3. Add new checklist item: "Verification Level Validation"
   - [ ] Claimed verification level matches evidence
   - [ ] If Level 2: tests exist, tests run, tests pass
   - [ ] If Level 3: integration tested OR explicitly deferred
   - [ ] If deferred: justification documented

**Pass criteria**:
- [ ] Pre-commit checklist explicitly mentions verification levels
- [ ] Clear mapping: checklist item → verification level
- [ ] Deferral allowed but requires documentation

---

### AC6: Motivating Examples Documented ✅ MUST HAVE

**What**: Document real failures from IMP-35 as cautionary examples

**Location**: `docs/autopilot/examples/verification/case_studies/`

**Case Study 1: IMP-35 Round 1 - Build Without Validate**
- What was claimed: "Build passed, task complete"
- What verification level achieved: Level 1 (Compilation only)
- What verification level needed: Level 2 (Smoke tests)
- Consequence: User had to say "that's not the point", redo Round 2
- Cost: Wasted time, erosion of trust, missed actual requirement (Codex support)
- How it was fixed: Round 2 created smoke tests, validated logic
- Learning: "Build passed" ≠ "works correctly"

**Case Study 2: IMP-35 Auth Assumption**
- What was claimed: "Multi-agent testing with Claude and Codex"
- What verification level achieved: Level 2 (Logic tested with mocked data)
- What verification level needed: Level 3 (Integration with actual auth)
- Consequence: Implemented SDK auth when system uses CLI logins
- Cost: Implementation doesn't work with actual system, needs rewrite
- How to fix: Test with actual CLI logins (`codex login`, `claude` CLI)
- Learning: Don't assume auth mechanism - test with real system

**Pass criteria**:
- [ ] Both case studies documented with full analysis
- [ ] Clear "Cost" section showing real impact
- [ ] "How to fix" includes specific steps
- [ ] Linked from main VERIFICATION_LEVELS.md as cautionary examples

---

### AC7: Integration with WorkProcessEnforcer 💡 NICE TO HAVE

**What**: Automated enforcement of verification level requirements

**Location**: `tools/wvo_mcp/src/orchestrator/work_process_enforcer.ts`

**Implementation**:
```typescript
// In canTransition function
if (targetPhase === 'review') {
  const verificationLevel = await detectVerificationLevel(taskId);
  if (verificationLevel < 2) {
    return {
      allowed: false,
      reason: 'VERIFY phase requires Level 2 (Smoke Testing). Found: Level ' + verificationLevel
    };
  }
}
```

**Phases**:
1. **Phase 1: Observe** - Log mismatches but allow transitions
2. **Phase 2: Warn** - Show warnings but allow transitions
3. **Phase 3: Enforce** - Block transitions if level insufficient

**Pass criteria** (if implemented):
- [ ] `detectVerificationLevel()` function implemented
- [ ] Works for all 4 levels
- [ ] Starts in observe mode (can be upgraded to enforce)
- [ ] Clear error messages when blocking
- [ ] Can be disabled via flag for emergencies

**Deferral acceptable**: This is optional enforcement automation

---

## Non-Functional Requirements

### NFR1: Clarity

- All documentation uses plain language (no jargon without definition)
- Examples are concrete and realistic
- Distinctions between levels are sharp (no ambiguity)

### NFR2: Actionability

- Every "bad" example includes "how to fix"
- Error messages from detection script are actionable
- Checklists can be copy-pasted and executed

### NFR3: Maintainability

- Single source of truth for level definitions (VERIFICATION_LEVELS.md)
- Other docs reference this, don't duplicate
- Examples are real cases, not hypotheticals (easier to update)

### NFR4: Adoptability

- Low friction (examples make it easy to comply)
- Clear benefits (faster debugging, fewer false completions)
- Not punitive (deferral allowed with justification)

---

## Out of Scope (Explicitly NOT Included)

### NOT: Performance Testing Standards

While Level 3 includes "works end-to-end", we're NOT defining specific performance thresholds. Each task defines its own performance requirements.

### NOT: Security Testing Standards

Security testing is a separate concern. This focuses on functional verification levels.

### NOT: Specific Testing Frameworks

We're NOT prescribing Vitest vs Jest vs pytest. Any framework that achieves the verification level is acceptable.

### NOT: Code Coverage Thresholds

We're NOT requiring specific coverage percentages. Level 2 requires "logic validated" but doesn't mandate 80% coverage.

---

## Success Metrics

### Short-term (30 days)

1. **Zero false completions**: No tasks claim "done" with only compilation
2. **Verification level documented**: 100% of new tasks document achieved level
3. **Phase compliance**: All VERIFY phases include Level 2 evidence

### Medium-term (90 days)

4. **Fewer REVIEW rejections**: <10% of tasks rejected for insufficient validation (down from ~30%)
5. **Faster debugging**: When bugs occur, verification artifacts reduce diagnosis time
6. **Adoption**: Agents proactively mention verification level in evidence

### Long-term (6 months)

7. **Cultural shift**: "What verification level?" becomes standard question
8. **Quality improvement**: Measurable reduction in post-merge bugs
9. **Documentation improvement**: Examples library grows organically

---

## Verification Strategy

### How to Verify This Spec

1. **Documentation completeness**: All 6 AC must-haves exist and meet pass criteria
2. **Example quality**: 3 engineers read examples and understand distinction between levels
3. **Detection accuracy**: Script correctly identifies 10 test cases (5 correct, 5 mismatched)
4. **Process integration**: Updated WORK_PROCESS docs reviewed and approved
5. **Real-world applicability**: Apply standards to 3 recent tasks retrospectively

### Review Questions

- Can an agent read VERIFICATION_LEVELS.md and know which level they need?
- Can an agent look at examples and understand good vs bad?
- Does the pre-commit checklist prevent false completion?
- Is deferral path clear and acceptable?

---

**SPEC Status**: ✅ COMPLETE

**Next Phase**: PLAN (how to implement each AC, what order, dependencies)

---

## Appendix: Real Examples Motivating This Spec

### Example A: IMP-35 Round 1

**Claim**: "Build passed, eval harness complete"

**Reality**: Level 1 achieved, Level 2 needed

**User feedback**: "we arent JUST documenting build passing. that's not the point"

**Cost**: Had to redo in Round 2, wasted 2 hours

### Example B: IMP-35 Auth Integration

**Claim**: "Multi-agent testing works with Claude and Codex"

**Reality**: Level 2 achieved (logic tested), Level 3 not tested (auth mechanism assumed)

**User feedback**: "we are not using API keys we are using monthly subscription logins"

**Cost**: Implementation uses wrong auth mechanism, needs rewrite

### Example C: (Pattern Across Tasks)

**Pattern**: Many tasks claim "tests pass" when:
- Tests don't actually test anything (no assertions)
- Tests only test trivial cases
- Tests mock everything (no integration validation)
- Tests exist but were never run

**This spec prevents**: Claiming Level 2 without evidence of validation
