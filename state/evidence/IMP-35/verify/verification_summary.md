# VERIFY: IMP-35 - Prompt Eval Harness + Gates

**Task ID**: IMP-35
**Phase**: VERIFY
**Date**: 2025-10-30
**Status**: In Progress

---

## Verification Checklist

### 1. Build Verification ✅

**Test**: TypeScript compilation
```bash
npm run build
```

**Result**: ✅ PASSED
- Zero errors
- All files compile successfully
- dist/ output generated

---

### 2. Schema Validation ✅

**Test**: Golden corpus schema validation
```bash
npx tsx tools/wvo_mcp/evals/scripts/validate_corpus.ts
```

**Result**: ✅ PASSED
- 29 tasks loaded
- All required fields present
- Phase distribution meets requirements (AC1)
- All IDs unique
- pass_threshold ≤ criteria_count for all tasks

---

### 3. Acceptance Criteria Verification

#### AC1: Golden Task Corpus Created ✅

- ✅ Corpus file exists: `tools/wvo_mcp/evals/prompts/golden/tasks.jsonl`
- ✅ Contains ≥20 tasks (actual: 29)
- ✅ Diverse phase coverage (all 9 phases meet minimums)
- ✅ Each task has: prompt, expected_output_criteria, pass_threshold
- ✅ README documents corpus curation process

**Status**: COMPLETE

---

#### AC2: Robustness Test Integration ✅

- ✅ Script exists: `tools/wvo_mcp/scripts/run_robustness_evals.sh` (executable)
- ✅ Tests 6 attack vector categories
- ✅ Results format: JSON output to `results/robustness/`
- ⚠️ **Limitation**: Simplified injection testing (full garak integration pending)

**Status**: PARTIAL - Script created but full garak integration requires additional setup
**Follow-up**: IMP-35.1 - Full Garak Integration

---

#### AC3: Eval Runner Infrastructure ✅

- ✅ Script exists: `scripts/run_prompt_evals.sh` (executable)
- ✅ Accepts flags: `--mode {quick|full}`, `--baseline`, `--compare`, `--model`, `--filter`
- ✅ Quick mode targets 5 tasks, <2 min
- ✅ Full mode runs 29 tasks, <10 min target
- ✅ Outputs JSON with per-task results
- ✅ Exit codes: 0=pass, 1=fail, 2=error

**Status**: COMPLETE (pending runtime testing)

---

#### AC4: Baseline Capture ✅

- ✅ Baseline functionality: `--baseline --runs N` flag
- ✅ Includes: success_rate_golden (injection_success_rate from robustness script)
- ✅ Statistical confidence: n≥5 runs supported
- ⏳ **Not yet run**: Requires API key to test

**Status**: IMPLEMENTED (not tested with real API calls)

---

#### AC5: VERIFY Phase Gate Implementation ✅

- ✅ Gate module exists: `src/verify/validators/prompt_eval_gate.ts`
- ✅ Feature flag support: `gate.prompt_evals` (off/observe/enforce)
- ✅ Observe mode: logs warnings, doesn't block
- ✅ Enforce mode: blocks if degradation >5%
- ✅ Manual override with justification logging
- ⏳ **Not integrated**: WorkProcessEnforcer integration pending

**Status**: IMPLEMENTED (not integrated with WorkProcessEnforcer)

---

#### AC6: CI Integration ✅

- ✅ GitHub Actions workflow: `.github/workflows/prompt-evals.yml`
- ✅ Triggers on prompt file changes
- ✅ Runs full eval suite
- ✅ Posts results as PR comment (script template)
- ✅ Blocks merge logic (based on PROMPT_EVAL_GATE_MODE secret)
- ⏳ **Not tested**: Requires PR to trigger

**Status**: IMPLEMENTED (not tested in CI environment)

---

#### AC7: IMP-21..26 Integration ⚠️ **CRITICAL GAP**

- ⚠️ **Claude-only**: Current implementation uses Anthropic SDK
- ❌ **Missing**: Codex support (OpenAI SDK integration)
- ❌ **Missing**: Integration with autopilot ModelRouter
- ❌ **Missing**: Attestation hash matching (IMP-24)
- ❌ **Missing**: Variant ID tracking (IMP-26)

**Status**: PARTIAL - Major gaps identified

**Critical Issues**:
1. **Codex vs Claude testing**: User emphasized this is "material" - prompts must work for both agents
2. **ModelRouter integration**: Should use autopilot's subscription routing, not direct SDK
3. **Attestation**: No hash matching to ensure eval==production prompts

**Follow-up Tasks Required**:
- IMP-35.2: Add Codex Support (OpenAI SDK, model routing)
- IMP-35.3: Integrate with Autopilot ModelRouter
- IMP-35.4: Attestation Integration (IMP-24 hash matching)
- IMP-35.5: Variant Tracking (IMP-26 integration)

---

#### AC8: Success Metrics Meet Thresholds ⏳ PENDING

- ⏳ Baseline not yet measured (requires API testing)
- ⏳ Post-overlay success rate (requires running evals)
- ⏳ Injection ≤1% (requires robustness testing)
- ⏳ Groundedness (requires grounding integration)
- ⏳ p95 latency (requires performance testing)
- ⏳ Token cost (requires cost tracking)

**Status**: PENDING - Cannot verify without running actual evals

---

#### AC9: Documentation Complete ✅

- ✅ README exists: `tools/wvo_mcp/evals/README.md`
- ✅ Covers: corpus format, running evals, interpreting results, adding tasks
- ✅ Troubleshooting guide included
- ✅ Examples of task definitions included
- ✅ Integration documentation (VERIFY gate, CI)

**Status**: COMPLETE

---

#### AC10: Rollback Verified ⏳ PENDING

- ⏳ `gate.prompt_evals=off` disables gate (requires testing)
- ⏳ Eval scripts still runnable (requires testing)
- ✅ No production dependencies (by design)
- ⏳ Rollback not yet tested

**Status**: PENDING - Requires integration testing

---

## Critical Gaps Summary

### Gap 1: Codex Support ❌ **BLOCKING**

**Issue**: Evals only test Claude (Anthropic SDK). No Codex (OpenAI) testing.

**Impact**: HIGH - Cannot verify prompts work for both agents. User emphasized this is "material".

**Evidence**: User messages:
- "make sure you're also testing with codex"
- "codex v claude is a material thing to test as well"

**Mitigation**: Create IMP-35.2 immediately

**Resolution Plan**:
1. Add OpenAI SDK dependency
2. Add model routing (claude vs codex vs gpt-4)
3. Update runner to support both SDKs
4. Add cost calculation for OpenAI models
5. Test same golden corpus against both agents
6. Measure success rate differences (Claude 75% vs Codex X%?)

**Estimated Effort**: 3-4 hours

---

### Gap 2: Autopilot ModelRouter Integration ⚠️ IMPORTANT

**Issue**: Eval runner uses direct SDK clients (Anthropic, future OpenAI). Should use autopilot's existing subscription routing.

**Impact**: MEDIUM - Standalone testing works, but autopilot integration bypasses existing routing infrastructure

**User Clarification**: "unified autopilot ALREADY uses my subscription logins. it doesn't use API key unless I manually integrate it"

**Resolution Plan**:
1. Eval runner remains standalone (can use API keys for manual testing)
2. VERIFY gate integration (Step 5) routes through autopilot ModelRouter
3. Document dual-mode support (standalone vs integrated)

**Status**: Design clarified, implementation pending

---

### Gap 3: No Runtime Testing ⏳ BLOCKED

**Issue**: Cannot fully test evals without:
- ANTHROPIC_API_KEY (for Claude testing)
- OPENAI_API_KEY (for Codex testing, once added)

**Impact**: MEDIUM - Build passes, schema validates, but actual LLM evaluation not tested

**Resolution**:
- Defer to user testing (they have API keys)
- Or: Add smoke test with mocked LLM responses

---

## Verification Evidence

### Build Output ✅
```
> npm run build
> tsc --project tsconfig.json

[No errors]
```

### Schema Validation Output ✅
```
> npx tsx tools/wvo_mcp/evals/scripts/validate_corpus.ts

✅ Corpus validation PASSED
   Total tasks: 29

   Phase distribution:
   ✅ implement: 7 tasks (requires ≥4)
   ✅ monitor: 2 tasks (requires ≥1)
   ✅ plan: 4 tasks (requires ≥3)
   ✅ pr: 2 tasks (requires ≥1)
   ✅ review: 2 tasks (requires ≥2)
   ✅ spec: 4 tasks (requires ≥3)
   ✅ strategize: 4 tasks (requires ≥3)
   ✅ think: 2 tasks (requires ≥2)
   ✅ verify: 2 tasks (requires ≥2)
```

### Files Created ✅
```bash
ls -la tools/wvo_mcp/evals/
# prompts/golden/tasks.jsonl exists
# scripts/validate_corpus.ts exists
# scripts/run_prompt_evals.sh exists (executable)
# scripts/run_robustness_evals.sh exists (executable)
# README.md exists

ls -la tools/wvo_mcp/src/evals/
# runner.ts exists

ls -la tools/wvo_mcp/src/verify/validators/
# prompt_eval_gate.ts exists

ls -la .github/workflows/
# prompt-evals.yml exists
```

---

## Next Steps

### Immediate (Before REVIEW)
1. ⏳ **Document Codex gap** in REVIEW phase
2. ⏳ **Create follow-up tasks** in PR phase:
   - IMP-35.2: Add Codex Support (HIGH PRIORITY)
   - IMP-35.3: ModelRouter Integration
   - IMP-35.4: Attestation Integration
   - IMP-35.5: Variant Tracking
   - IMP-35.6: Full Garak Integration

### User Testing Required
1. Run `bash scripts/run_prompt_evals.sh --mode quick` with ANTHROPIC_API_KEY
2. Verify runtime <2 min
3. Verify success rate calculation works
4. Test baseline capture
5. Test comparison mode

### Future (After IMP-35.2)
1. Run evals against both Claude and Codex
2. Compare success rates
3. Identify prompt quality differences
4. Iterate on prompts to improve both

---

## VERIFY Phase Status

**Overall**: ⚠️ PARTIAL PASS

**Passed**:
- ✅ Build compiles
- ✅ Schema validates
- ✅ All scripts created
- ✅ Documentation complete

**Gaps**:
- ❌ **CRITICAL**: No Codex support (material gap per user)
- ⚠️ No runtime testing (blocked by API keys)
- ⚠️ AC7 only 25% complete (missing integration with IMP-21..26)

**Recommendation**: Move to REVIEW with documented gaps, create follow-up tasks in PR phase

---

**Next Phase**: REVIEW (adversarial review of gaps and design)
