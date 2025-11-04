# Case Study: IMP-35 Round 1 - Build Without Validate

**Task**: IMP-35 (Prompt Eval Harness + Gates)
**Date**: 2025-10-30
**Phase**: VERIFY
**Issue**: Claimed completion with Level 1 only, needed Level 2

---

## What Was Claimed

"Build passed, eval harness complete"

**Evidence provided**:
- TypeScript compilation successful (0 errors)
- Files created in correct locations
- Build artifacts in dist/ directory

**Claimed verification level**: Level 1 (Compilation)

---

## What Was Actually Needed

**Required verification level**: Level 2 (Smoke Testing)

**Why Level 2 needed**:
- Eval harness is executable code, not just library types
- Must prove: comparison logic works, scripts execute, results are accurate
- Integration with existing eval system must be validated

---

## User Feedback

> "also we arent JUST documenting build passing. that's not the point"

> "as a folloup task i want you to make sure that the work process and autopilot understand what actually valuable testing is and means"

---

## Root Cause Analysis

### What Went Wrong

**Assumption**: "If it compiles, the implementation is complete"

**Reality**: Compilation only proves syntax is valid, not that logic works

**Verification gap**:
- ✅ Level 1: Code compiles
- ❌ Level 2: No tests created
- ❌ Level 2: No code execution
- ❌ Level 2: No validation of comparison logic
- ❌ Level 2: No proof that scripts work

### Why This Happened

1. **Vague phase requirements**: VERIFY phase said "run tests" but didn't specify what counts as testing
2. **No examples**: Lacked concrete examples of good vs bad verification
3. **Speed over quality**: Rushed to completion without validating functionality
4. **Build-centric mindset**: Treated "builds successfully" as primary success criterion

---

## Cost of This Failure

### Immediate Impact
- **Time wasted**: Had to redo in Round 2 (~2 hours)
- **User frustration**: Had to explicitly request proper testing
- **Wrong example**: Set bad precedent for future work

### Missed Goals
- **Codex support**: Round 1 focused on Claude only, missed requirement
- **Actual validation**: Didn't prove eval harness works with real prompts
- **Integration**: Didn't test integration with existing eval infrastructure

### Technical Debt
- Round 2 had to add:
  - 3 smoke test cases
  - Test data fixtures
  - Execution validation
  - Result accuracy checks

---

## How It Was Fixed (Round 2)

### Tests Created
```typescript
// multi_model_runner.test.ts
describe('compareAgents', () => {
  it('calculates success rates correctly', () => {
    const claudeResults = { passed: 4, total_tasks: 5 };
    const codexResults = { passed: 3, total_tasks: 5 };

    const comparison = compareAgents(claudeResults, codexResults);

    expect(comparison.claude_success_rate).toBe(80);  // 4/5 = 80%
    expect(comparison.codex_success_rate).toBe(60);   // 3/5 = 60%
    expect(comparison.diff_percentage).toBe(20);      // 80-60 = 20
  });

  it('handles edge case: both agents pass all tasks', () => {
    const claudeResults = { passed: 5, total_tasks: 5 };
    const codexResults = { passed: 5, total_tasks: 5 };

    const comparison = compareAgents(claudeResults, codexResults);

    expect(comparison.diff_percentage).toBe(0);  // No difference
  });

  it('handles edge case: both agents fail same tasks', () => {
    const claudeResults = { passed: 0, total_tasks: 5 };
    const codexResults = { passed: 0, total_tasks: 5 };

    const comparison = compareAgents(claudeResults, codexResults);

    expect(comparison.claude_success_rate).toBe(0);
    expect(comparison.codex_success_rate).toBe(0);
  });
});
```

### What Tests Proved (Level 2 Achieved)
- ✅ Success rate calculation works correctly
- ✅ Percentage difference logic correct
- ✅ Edge cases handled (0%, 100%, equal rates)
- ✅ Core comparison logic validated

### What Tests Did NOT Prove (Level 3 Gap)
- ⏳ Real Claude API calls work
- ⏳ Real Codex API calls work
- ⏳ Authentication system integration
- ⏳ End-to-end workflow with actual prompts

---

## Lessons Learned

### For Agents

**NEVER claim completion with only compilation**. Always ask:
- Does the code actually run?
- Have I tested it with realistic inputs?
- Do the outputs match expectations?
- What edge cases exist?

**"Build passed" is Level 1, not done**. Level 2 (smoke tests) is minimum before claiming implementation complete.

### For Work Process

**VERIFY phase must require evidence**:
- Not just "tests exist" but "tests run and pass"
- Not just "code compiles" but "code executes correctly"
- Not just "looks right" but "outputs validated"

**Pre-commit checklist must enforce**:
- [ ] Build succeeds (Level 1)
- [ ] Tests created (Level 2 requirement)
- [ ] Tests run and pass (Level 2 proof)
- [ ] Core logic validated (Level 2 outcome)

---

## Prevention: How Verification Levels Help

### With Verification Levels Taxonomy

**IMPLEMENT phase** requires Level 1:
- ✅ Code compiles
- ✅ No syntax errors
- ✅ Build artifacts generated
- **CANNOT proceed to VERIFY without Level 1**

**VERIFY phase** requires Level 2:
- ✅ Tests exist
- ✅ Tests execute
- ✅ Tests pass
- ✅ Core logic validated with known inputs
- **CANNOT proceed to REVIEW without Level 2**

**Clear gates prevent premature completion**:
```
IMPLEMENT (Level 1) → VERIFY (Level 2) → REVIEW (Level 3 or defer)
       ↓                    ↓                    ↓
   Build passes?        Tests pass?      Integration works?
   If NO → Stay         If NO → Back     If NO → Back or defer
```

### Detection

With verification levels, this failure would have been caught:
```bash
# Automated check
bash scripts/check_verification_level.sh IMP-35

# Output:
# ❌ MISMATCH: Claims Level 2 (VERIFY complete) but evidence shows Level 1
# Found: Build logs (Level 1)
# Missing: Test execution logs (Level 2)
# Action: Return to IMPLEMENT, create smoke tests
```

---

## Applicability to Other Tasks

**This pattern applies to**:
- API integrations (compile ≠ works with real API)
- UI components (renders ≠ user can interact)
- ML models (trains ≠ predictions accurate)
- Scripts (syntax valid ≠ executes correctly)

**Key question**: "If this breaks in production, what will I wish I had tested?"

**Answer for IMP-35**: "I wish I had tested that the comparison logic actually calculates success rates correctly"

**How to prevent**: Write those tests BEFORE claiming done.

---

## References

- IMP-35 Round 1 evidence: `state/evidence/IMP-35/round1/`
- IMP-35 Round 2 evidence: `state/evidence/IMP-35/round2/`
- Test file: `tools/wvo_mcp/src/evals/multi_model_runner.test.ts`
- Verification taxonomy: `docs/autopilot/VERIFICATION_LEVELS.md`

---

## Summary

**Pattern**: Build-without-validate (claiming Level 2 with only Level 1)

**Cost**: 2 hours wasted, user frustration, wrong example set

**Fix**: Created smoke tests, validated logic, documented gaps

**Prevention**: Verification level taxonomy with phase gates

**Key Learning**: "Build passed" means "can proceed to testing", NOT "task complete"
