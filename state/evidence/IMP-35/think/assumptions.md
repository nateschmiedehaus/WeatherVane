# THINK: Critical Assumptions - IMP-35

**Task ID**: IMP-35
**Phase**: THINK
**Date**: 2025-10-30
**Status**: In Progress

---

## Critical Assumptions (Must Validate)

### Assumption 1: Baseline Quality is Measurable

**Assumption**: Current prompts have ≥50% success rate on golden tasks (per spec failure criteria)

**Why Critical**: If baseline is <50%, prompts are already too broken to use as reference point

**Validation Strategy**:
- Run golden task corpus against current prompts (no overlays/personas)
- Measure n=5 runs for statistical confidence
- If baseline <50% → PIVOT: Fix prompts first, then build eval harness

**Risk if Wrong**:
- Build eval harness on broken foundation
- Cannot establish meaningful regression thresholds
- Wasted 16-22 hours of implementation

**Mitigation**:
- Validate baseline IMMEDIATELY in Step 3 (Baseline Capture)
- If <50%, create follow-up task: "FIX-PROMPTS-BASELINE-QUALITY"
- Document actual baseline in verify/baseline_report.md

---

### Assumption 2: Golden Corpus is Representative

**Assumption**: 20-30 curated tasks cover enough diversity to catch real regressions

**Why Critical**: If corpus is unrepresentative, eval harness gives false confidence

**Validation Strategy**:
- Curate tasks from:
  - Recent production tasks (last 30 days of state/evidence/)
  - Edge cases from incident reports
  - Each phase: STRATEGIZE (≥3), SPEC (≥3), PLAN (≥3), IMPLEMENT (≥4), etc.
- Compare corpus distribution vs. real task distribution
- Quarterly review: Add tasks from new incidents

**Risk if Wrong**:
- Evals pass, but production quality degrades (false negatives)
- Miss entire categories of tasks (e.g., multi-file refactoring)
- Corpus becomes stale over time

**Mitigation**:
- AC1 requires ≥3 tasks per phase (enforced in VERIFY)
- Document curation process in tools/wvo_mcp/evals/README.md
- Add "corpus coverage analysis" to MONITOR phase
- Create quarterly review task: "CORPUS-REVIEW-Q1-2025"

---

### Assumption 3: LLM Responses Are Sufficiently Deterministic

**Assumption**: With `temperature=0` and deterministic decoding, repeated runs give consistent results

**Why Critical**: If responses vary wildly, success rate metrics are noisy/unreliable

**Validation Strategy**:
- Measure variance across n=5 runs for same task
- Calculate coefficient of variation (σ/μ) for success rate
- Acceptable: CV <10% (e.g., 70% ± 7%)
- If CV >20% → increase n to 10 runs or use response caching

**Risk if Wrong**:
- High false positive rate (blocks good changes due to noise)
- High false negative rate (misses real regressions due to luck)
- CI becomes flaky, developers ignore results

**Mitigation**:
- AC4 requires n≥5 runs with confidence intervals
- Document observed variance in verify/baseline_report.md
- If too noisy: implement response caching (Phase 2 enhancement)
- Set threshold with buffer: warn at -5%, block at -10%

---

### Assumption 4: Garak is Accurate and Maintained

**Assumption**: Garak library provides reliable prompt injection tests with low false positives

**Why Critical**: Security baselines depend on garak accuracy

**Validation Strategy**:
- Run garak against known-vulnerable and known-secure prompts
- Verify expected results (vulnerable = high injection rate, secure = low)
- Check garak GitHub: Last updated? Active maintainers?
- If garak unreliable → fallback to manual injection corpus

**Risk if Wrong**:
- False sense of security (garak misses real vulnerabilities)
- False alarms (garak flags benign prompts)
- Garak abandoned → cannot maintain robustness tests

**Mitigation**:
- AC2 explicitly allows fallback: "use garak library" (not mandatory garak)
- Document garak version + attack vectors in robustness_eval.json
- Create manual injection tests as backup (IMP-35.1 follow-up)
- Monitor garak project health quarterly

---

### Assumption 5: IMP-21 (Prompt Compiler) Works Correctly

**Assumption**: PromptCompiler.compile() produces correct, consistent prompts

**Why Critical**: Evals test compiled prompts; if compiler broken, evals test wrong thing

**Validation Strategy**:
- AC7 requires attestation hash matching (IMP-24 integration)
- Verify: eval prompt hash == production prompt hash
- If hashes mismatch → eval-prod discrepancy alert
- Test compiler edge cases: empty overlays, missing personas, invalid variants

**Risk if Wrong**:
- Eval tests prompt A, production uses prompt B (false confidence)
- Compiler bug causes eval failures (false positives)
- Cannot trust eval results at all

**Mitigation**:
- Attestation verification in VERIFY phase (hash matching)
- Nightly E2E tests compare eval vs. production outputs
- Document compiler version in eval results metadata
- Alert on hash mismatches (state/analytics/eval_prod_discrepancy.jsonl)

---

### Assumption 6: 5-10% Threshold is Meaningful

**Assumption**: Blocking changes with >5% degradation prevents real regressions without too many false positives

**Why Critical**: Wrong threshold → either blocks too much (FP) or blocks too little (FN)

**Validation Strategy**:
- Observe mode (weeks 1-4): collect data on natural variance
- Measure: What % of PRs would be blocked at -5%, -10%, -15% thresholds?
- Analyze false positives: Review blocked PRs, were they actually bad?
- Tune threshold based on data

**Risk if Wrong**:
- Too strict (-2%): False positive rate >10%, developers bypass
- Too lenient (-20%): Real regressions slip through, defeats purpose
- Single threshold doesn't fit all task types

**Mitigation**:
- Start with -5% (spec default), measure false positive rate
- AC8 allows threshold tuning based on data
- Consider per-phase thresholds (STRATEGIZE vs. IMPLEMENT)
- Manual override mechanism for legitimate tradeoffs

---

### Assumption 7: CI Performance is Acceptable

**Assumption**: Full eval suite runs in <10 minutes (AC3 requirement)

**Why Critical**: If >10 min, CI becomes bottleneck, developers work around it

**Validation Strategy**:
- Measure actual runtime during baseline capture
- Parallel execution (run tasks concurrently)
- Profile slow tasks: Model inference? Prompt compilation? Network?
- Optimize if needed: Caching, batching, smaller model for quick mode

**Risk if Wrong**:
- >10 min → developers skip evals or run in background
- >30 min → CI queue backlog, PRs blocked for hours
- Evals become "nice to have" instead of mandatory gate

**Mitigation**:
- AC3 enforces: Quick mode <2 min, Full mode <10 min
- Implement quick mode (5 tasks) for pre-commit
- Response caching for repeated eval runs (Phase 2)
- Monitor p95 latency in MONITOR phase, alert if >10 min

---

### Assumption 8: Developers Will Accept Eval Overhead

**Assumption**: Developers find evals useful (≥7/10 satisfaction) despite added time

**Why Critical**: If DX rating <5/10, developers will bypass or ignore evals

**Validation Strategy**:
- Observe mode: Collect developer feedback after each blocked PR
- Survey: "Was this block justified?" "Was failure analysis helpful?"
- Measure: What % of overrides use "not justified" as reason?
- If satisfaction <5/10 → investigate friction points

**Risk if Wrong**:
- Developers bypass evals (manual override without justification)
- Culture of "just override it" emerges
- Eval system becomes checkbox, not quality gate

**Mitigation**:
- AC9 requires comprehensive documentation (reduce confusion)
- Detailed failure analysis (show WHICH tasks failed, WHY)
- Manual override requires justification (logged for review)
- Iterate on UX based on feedback (MONITOR phase)

---

### Assumption 9: Eval-Production Alignment is Maintainable

**Assumption**: Evals stay synchronized with production (no drift over time)

**Why Critical**: If eval != production, false confidence in quality

**Validation Strategy**:
- IMP-24 attestation: Hash matching (eval hash == prod hash)
- Nightly E2E tests: Compare eval results vs. real production outputs
- Alert on discrepancy: >10% difference between eval success rate and production
- Quarterly audit: Do eval tasks match real usage patterns?

**Risk if Wrong**:
- Evals pass, production fails (nightmare scenario)
- Production changes bypass evals (compiler updated, evals not)
- Gradual drift over 6 months → evals become irrelevant

**Mitigation**:
- AC7 mandates attestation integration (hash matching)
- Nightly E2E tests (sample real production tasks)
- Alert on eval-prod discrepancy (state/analytics/eval_prod_discrepancy.jsonl)
- Corpus evolution: Add tasks from production incidents

---

### Assumption 10: Baseline Remains Valid Over Time

**Assumption**: Initial baseline (captured in Step 3) remains relevant for 3-6 months

**Why Critical**: If baseline becomes stale, thresholds are meaningless

**Validation Strategy**:
- Recapture baseline quarterly (or after major prompt changes)
- Compare: Old baseline vs. new baseline (expected to improve over time)
- If baseline degrades >10% → investigate root cause (prompts got worse?)
- Document baseline version in eval results

**Risk if Wrong**:
- Blocking changes that are actually improvements (old baseline too high)
- Allowing regressions (old baseline too low)
- Baseline inflation: Natural drift makes threshold meaningless

**Mitigation**:
- Quarterly baseline refresh (MONITOR phase task)
- Version baselines: baseline_v1.json, baseline_v2.json
- Document when baseline changes (state/evidence/IMP-35/monitor/baseline_changelog.md)
- Alert if baseline degrades >10% between versions

---

## Assumptions Summary Table

| Assumption | Criticality | Validation | Mitigation |
|------------|-------------|------------|------------|
| 1. Baseline ≥50% | HIGH | Immediate measurement in Step 3 | Pivot to prompt fixes if <50% |
| 2. Corpus representative | HIGH | Coverage analysis, quarterly review | Incident-driven corpus updates |
| 3. LLM deterministic | MEDIUM | n≥5 runs, CV <10% | Increase n or use caching |
| 4. Garak accurate | MEDIUM | Known-vulnerable/secure tests | Manual injection fallback |
| 5. Compiler works | HIGH | Hash matching (IMP-24) | Nightly E2E tests |
| 6. 5% threshold meaningful | MEDIUM | Observe mode data collection | Tune based on false positive rate |
| 7. CI <10 min | MEDIUM | Runtime profiling | Caching, parallel execution |
| 8. Developer acceptance | MEDIUM | DX survey, override analysis | Iterate on UX, detailed failures |
| 9. Eval-prod alignment | HIGH | Attestation + nightly E2E | Drift alerts, corpus evolution |
| 10. Baseline stable | LOW | Quarterly refresh | Versioned baselines, changelog |

---

## Next Steps

1. ✅ THINK phase complete (this document + edge_cases.md + pre_mortem.md)
2. ⏳ IMPLEMENT: Build with assumptions in mind
3. ⏳ VERIFY: Explicitly validate each assumption
4. ⏳ MONITOR: Track assumption validity over time

---

**THINK Phase Status**: ⏳ IN PROGRESS (assumptions documented)
**Next**: Create edge_cases.md and pre_mortem.md
