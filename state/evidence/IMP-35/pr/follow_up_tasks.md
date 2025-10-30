# Follow-Up Tasks - IMP-35 Round 2

**Task ID**: IMP-35
**Phase**: PR
**Date**: 2025-10-30

---

## Summary

IMP-35 Round 2 completed **multi-agent testing** (Claude + Codex support). The following work remains deferred as documented in round2_review.md.

---

## Deferred Work

### 1. IMP-21..26 Integration (Remaining Scope of IMP-35)

**Status**: DEFERRED (intentionally not completed in Round 2)

**Original AC7**: "Evals test prompts from compiler, personas, overlays, attestation"
- Current completion: 40% (multi-agent testing added)
- Remaining: 60% (compiler/persona/overlay/attestation integration)

**What's missing**:
1. **IMP-21 Integration**: Use PromptCompiler to generate eval prompts (not hand-written synthetic prompts)
2. **IMP-22 Integration**: Test persona variants (Planner, Implementer, Reviewer)
3. **IMP-23 Integration**: Test with domain overlays (Statistics, Philosophy, Meteorology, etc.)
4. **IMP-24 Integration**: Match attestation hashes between compiled prompts and eval runs
5. **IMP-26 Integration**: Track variant IDs in eval outputs

**Why deferred**:
- User emphasized Codex testing as "material" priority
- Compiler integration is separate concern
- Doesn't block multi-agent comparison
- Can be done incrementally

**How to resume**:
```bash
# Current: Hand-written synthetic prompts
const goldenTask = {
  prompt: "You are a planner...",  // Synthetic
  criteria: ["strategic", "risks"]
};

# Target: Compiled prompts from PromptCompiler
import { PromptCompiler } from '../prompt/compiler';
const compiler = new PromptCompiler(workspaceRoot);
const compiled = compiler.compile({
  phase: 'plan',
  persona: 'planner',
  overlays: ['statistics', 'philosophy']
});
const goldenTask = {
  prompt: compiled.prompt,
  attestation_hash: compiled.hash,
  variant_id: compiled.variant_id,
  criteria: ["strategic", "risks"]
};
```

**Acceptance criteria** (from original IMP-35):
- [ ] Evals load prompts from PromptCompiler (IMP-21)
- [ ] Test all persona variants (IMP-22)
- [ ] Test with domain overlays (IMP-23)
- [ ] Verify attestation hashes match (IMP-24)
- [ ] Record variant IDs in results (IMP-26)

**Evidence location** (when completed):
- `state/evidence/IMP-35/implement/compiler_integration.md`
- `state/evidence/IMP-35/verify/persona_variant_tests.json`
- `state/evidence/IMP-35/verify/attestation_verification.md`

---

### 2. Real API Integration Testing (User Responsibility)

**Status**: DEFERRED (requires user's API keys)

**What's tested**:
- ✅ Comparison logic (smoke tests passing)
- ✅ Type safety (build passes)

**What's NOT tested**:
- ❌ Real Claude API calls
- ❌ Real Codex/OpenAI API calls
- ❌ LLM-as-judge evaluation
- ❌ End-to-end workflow
- ❌ Error handling (rate limits, network errors)

**Why deferred**:
- Requires ANTHROPIC_API_KEY and OPENAI_API_KEY
- Logic is validated with smoke tests
- User can test when ready

**How user can test**:
```bash
# Test Claude
export ANTHROPIC_API_KEY="your-key"
bash tools/wvo_mcp/scripts/run_prompt_evals.sh --mode quick --agent claude

# Test Codex
export OPENAI_API_KEY="your-key"
bash tools/wvo_mcp/scripts/run_prompt_evals.sh --mode quick --agent codex

# Compare
bash tools/wvo_mcp/scripts/compare_agents.sh --mode quick
```

**What to verify**:
- [ ] Both runs complete without errors
- [ ] Results files generated
- [ ] Success rates calculated correctly
- [ ] Comparison report generated
- [ ] Task categorization correct (claude_better, codex_better, both_pass, both_fail)

---

### 3. LLM-as-Judge Bias Mitigation (Future Enhancement)

**Status**: DEFERRED (future improvement, not blocking)

**Issue**: Claude evaluating Codex outputs might be biased (or vice versa)

**Current approach**: Always use same evaluator (Claude) for consistency

**Potential improvements**:
1. Dual evaluation: Claude judges Claude, GPT-4 judges Codex
2. Cross-validation: Both judges evaluate both outputs
3. Ensemble judging: Average scores from multiple judges
4. Benchmark against human judgments

**Why deferred**:
- Current approach is acceptable (consistent evaluator)
- Bias is documented as known limitation
- Improvements can be evaluated later
- Not blocking core functionality

**How to implement** (when prioritized):
- Add `--evaluator {claude|gpt4|both}` flag
- Implement dual evaluation mode
- Generate cross-judge comparison reports
- Collect human baseline judgments for validation

---

## Non-Deferred Work (Completed in Round 2)

✅ **Multi-agent support** - Both Claude and Codex SDKs integrated
✅ **Comparison function** - Categorizes task performance differences
✅ **Smoke tests** - 3 tests passing, logic validated
✅ **Bash scripts** - `run_prompt_evals.sh` and `compare_agents.sh` ready
✅ **Documentation** - Honest gap documentation throughout
✅ **Build passing** - 0 errors
✅ **Runtime validation** - Tests actually run and pass

---

## Recommendations

1. **Immediate**: User should test with real API keys to validate integration
2. **Next Sprint**: Complete IMP-21..26 integration (40% → 100%)
3. **Future**: Evaluate LLM-as-judge bias mitigation approaches

---

## Related Documents

- Round 2 Review: `state/evidence/IMP-35/review/round2_review.md`
- Runtime Validation: `state/evidence/IMP-35/verify/runtime_validation.md`
- Implementation: `state/evidence/IMP-35/implement/codex_implementation.md`
- IMPROVEMENT_BATCH_PLAN: `docs/autopilot/IMPROVEMENT_BATCH_PLAN.md` (line 294, IMP-35 definition)

---

**Status**: Follow-up tasks documented
**Next Phase Action**: Commit changes
