# STRATEGIZE: IMP-35 - Prompt Eval Harness + Gates

**Task ID**: IMP-35
**Task**: Prompt Evaluation Harness with Quality Gates
**Date**: 2025-10-30
**Phase**: STRATEGIZE
**Status**: In Progress

---

## Executive Summary

**Goal**: Build automated prompt evaluation infrastructure to prevent regressions and measure improvements in prompt quality across the IMP-21..26 prompt compiler/persona/overlay system.

**Key Insight**: Without automated evaluation, prompt changes are risky (can silently degrade quality). With it, we can confidently iterate and enforce quality standards.

**Recommended Approach**: Hybrid harness combining:
- **Golden task corpus** (20-30 representative tasks) for quality baseline
- **Robustness tests** (prompt injection, jailbreaks) using garak
- **Verify phase gates** (block merges if success rate degrades >5%)
- **Feature flag rollout** (observe → enforce progression)

---

## Problem Reframing

### The Obvious Problem
"We need to test if prompts are working correctly."

### The Deeper Problem
**Prompt quality is invisible until production** - we've shipped IMP-21..26 (compiler, personas, overlays, attestation, tool allowlists, variants) but have NO systematic way to know if changes help or hurt.

**Current state**:
- Manual testing (time-consuming, inconsistent)
- Production incidents reveal regressions (too late)
- No baseline for "good prompt quality"
- Can't confidently iterate on prompts

**What we actually need**:
1. **Baseline measurement** - What's "good enough" today?
2. **Regression prevention** - Block changes that degrade quality
3. **Improvement validation** - Prove new features (overlays, personas) actually help
4. **Security assurance** - Resist prompt injection attacks
5. **Continuous monitoring** - Track quality over time

---

## Fundamental Questions

### Q1: What does "prompt quality" mean?
**Answer**: Multiple dimensions:
- **Task success rate** - Does it complete the task correctly?
- **Groundedness** - Are responses factually correct?
- **Robustness** - Resists prompt injection/jailbreaks?
- **Latency** - Within acceptable bounds?
- **Cost** - Token usage reasonable?

**Implication**: Need multi-dimensional evaluation, not single score.

### Q2: How do we know if a prompt is "better"?
**Answer**: Relative to baseline + acceptance thresholds:
- Golden task success +5-10% = clear improvement
- Injection success ≤1% = acceptable security
- Groundedness non-decreasing = safety maintained
- p95 latency/cost within budget = performance OK

**Implication**: Need both baseline capture AND threshold enforcement.

### Q3: How do we prevent false positives (blocking good changes)?
**Answer**: Statistical rigor + escape hatches:
- Multiple runs (n≥5) with confidence intervals
- Threshold with buffer (e.g., -5% allowed, -10% blocks)
- Manual override for legitimate tradeoffs
- Detailed failure analysis (which tasks failed, why)

**Implication**: Eval system must provide explainability, not just pass/fail.

---

## Strategic Alternatives

### Alternative A: Manual Testing Only

**Approach**: Human reviewers test prompts before merging

**Pros**:
- Simple (no infrastructure)
- Catches nuanced issues
- Flexible

**Cons**:
- Slow (hours per review)
- Inconsistent (reviewer bias)
- Doesn't scale (IMP-21..26 changes frequently)
- No regression detection (human memory limits)

**Verdict**: ❌ **REJECT** - Cannot scale, too subjective

---

### Alternative B: End-to-End Integration Tests

**Approach**: Test full workflows (STRATEGIZE → MONITOR) with real tasks

**Pros**:
- High fidelity (tests what users see)
- Catches system interactions
- Real-world validation

**Cons**:
- Extremely slow (30-60 min per task)
- Expensive (API costs)
- Flaky (external dependencies)
- Hard to attribute failures (prompt vs system vs data)

**Verdict**: ⚠️ **SUPPLEMENT** - Useful but not primary eval method

---

### Alternative C: Unit-Style Prompt Tests

**Approach**: Test prompt → LLM → output with mocked system state

**Pros**:
- Fast (seconds per test)
- Cheap (can use smaller models or caching)
- Deterministic (mocked state)
- Easy to debug (isolated failures)

**Cons**:
- Lower fidelity (mocked state != real)
- Misses system interactions
- Requires test corpus curation

**Verdict**: ✅ **PRIMARY** - Fast feedback loop, scales well

---

### Alternative D: Golden Task Corpus

**Approach**: Curate 20-30 representative tasks, run against each prompt variant

**Pros**:
- Representative coverage (diverse task types)
- Measurable baseline (% passing)
- Regression detection (compare vs baseline)
- Relatively fast (minutes, not hours)

**Cons**:
- Corpus curation effort (initial + maintenance)
- May not catch edge cases
- Static corpus (doesn't evolve with usage)

**Verdict**: ✅ **PRIMARY** - Best balance of speed, coverage, and reliability

---

### Alternative E: Adversarial Robustness Tests (Garak)

**Approach**: Use garak framework to test prompt injection resistance

**Pros**:
- Security-focused (catches vulnerabilities)
- Established corpus (garak library)
- Low maintenance (community-maintained)
- Complements golden tasks

**Cons**:
- Narrow focus (security only, not quality)
- May have false positives (overly aggressive)
- Requires interpretation (what's acceptable failure rate?)

**Verdict**: ✅ **REQUIRED** - Security non-negotiable, use alongside golden tasks

---

## Recommended Approach: Hybrid Harness

**Combine C, D, E**:
1. **Golden Task Corpus** (D) - 20-30 tasks covering:
   - Strategize (problem framing)
   - Spec (acceptance criteria)
   - Plan (implementation steps)
   - Think (risk analysis)
   - Implement (code generation)
   - Verify (test generation)
   - Review (critique)
2. **Robustness Tests** (E) - Garak injection corpus
3. **Unit-Style Execution** (C) - Fast, deterministic runs

**Why This Works**:
- Fast enough for CI (5-10 min total)
- Comprehensive enough to catch regressions
- Explainable (which tasks failed, what outputs)
- Actionable (devs can debug specific failures)

---

## Decision Framework

### When to Run Evals

| Trigger | Golden Tasks | Robustness | Integration |
|---------|--------------|------------|-------------|
| Pre-commit (local) | ✅ Quick (5 tasks) | ⏸️ Skip | ⏸️ Skip |
| PR CI | ✅ Full (20-30 tasks) | ✅ Full (garak corpus) | ⏸️ Skip |
| Nightly | ✅ Full + extended | ✅ Full + new attacks | ✅ Sample (3-5 E2E) |
| Pre-release | ✅ Full + manual review | ✅ Full + manual review | ✅ Full (20 E2E) |

**Rationale**:
- Pre-commit: Fast feedback (developers)
- PR CI: Gate quality (prevent merges)
- Nightly: Catch slow regressions (monitoring)
- Pre-release: Final validation (production safety)

---

### When to Block (Gates)

**Observe Mode** (weeks 1-4):
- Run evals, collect data
- No blocking (warnings only)
- Build baseline metrics

**Enforce Mode** (after baseline established):
- Block if success_rate_golden < baseline - 5%
- Block if injection_success_rate > 1%
- Block if groundedness drops >10%
- Allow manual override with justification

**Rationale**: Observe first to avoid false positives, enforce once baseline is reliable.

---

## Integration with IMP-21..26

### IMP-21 (Prompt Compiler)
**Integration**: Evals use compiled prompts (consistent assembly)
- Compiler generates canonical prompts
- Eval harness consumes compiler output
- Hash matching ensures eval tests right version

### IMP-22 (PersonaSpec)
**Integration**: Test persona variants
- Baseline persona (neutral)
- Alternative personas (specialist, beginner, etc.)
- Measure if personas improve task success

### IMP-23 (Domain Overlays)
**Integration**: Test overlay effectiveness
- No overlays (baseline)
- Domain overlays (API, database, performance, etc.)
- Measure +5-10% improvement target

### IMP-24 (StateGraph Hook + Attestation)
**Integration**: Evals verify attested prompts
- Attestation records prompt_hash
- Eval results linked to hash
- Prevents drift (eval != production)

### IMP-25 (Tool Allowlists)
**Integration**: Test tool restriction behavior
- Verify disallowed tools rejected
- Verify allowed tools work
- No escape hatches

### IMP-26 (Prompt Variants/Telemetry)
**Integration**: Track variant performance
- Variant IDs in eval results
- A/B test variants (which performs better?)
- Telemetry feeds back to roadmap

---

## Rollout Strategy

### Phase 1: Build Harness (weeks 1-2)
**Deliverables**:
- Golden task corpus (20-30 tasks)
- Eval runner script (`run_prompt_evals.sh`)
- Baseline capture (`prompt_eval_baseline.json`)

**Exit Criteria**: Can run evals locally, see results

### Phase 2: Integrate Garak (weeks 2-3)
**Deliverables**:
- Garak integration (`run_robustness_evals.sh`)
- Robustness baseline (`robustness_eval.json`)

**Exit Criteria**: Security tests run, baseline captured

### Phase 3: CI Integration + Observe Mode (weeks 3-4)
**Deliverables**:
- GitHub Actions workflow (`.github/workflows/prompt-evals.yml`)
- PR comments with results
- Dashboard (`state/analytics/prompt_quality_dashboard.html`)

**Exit Criteria**: Evals run on every PR, results visible

### Phase 4: Enforce Mode + Gates (week 5+)
**Deliverables**:
- VERIFY phase gate (`prompt_eval_gate.ts`)
- Block logic (threshold enforcement)
- Override mechanism (manual approval)

**Exit Criteria**: Degrading PRs blocked, quality maintained

---

## Risk Analysis

### Risk 1: False Positives (blocking good changes)
**Likelihood**: MEDIUM
**Impact**: HIGH (blocks development)

**Mitigation**:
- Statistical confidence (n≥5 runs, confidence intervals)
- Threshold buffer (-5% warning, -10% block)
- Manual override with justification
- Detailed failure analysis (explain why blocked)

### Risk 2: Corpus Staleness (golden tasks don't reflect real usage)
**Likelihood**: MEDIUM
**Impact**: MEDIUM (eval loses relevance)

**Mitigation**:
- Quarterly corpus review
- Add new tasks from production incidents
- Remove obsolete tasks
- Track corpus coverage vs real task distribution

### Risk 3: Eval Infrastructure Drift (eval != production)
**Likelihood**: LOW
**Impact**: HIGH (false confidence)

**Mitigation**:
- Use compiled prompts (IMP-21 integration)
- Hash matching (IMP-24 attestation)
- Nightly E2E tests (real system)
- Alert on eval-prod discrepancy

### Risk 4: Performance (evals too slow for CI)
**Likelihood**: LOW
**Impact**: MEDIUM (slows development)

**Mitigation**:
- Cache LLM responses (deterministic for same prompt)
- Parallel execution (run tasks concurrently)
- Quick mode (5 tasks) for pre-commit
- Full mode (20-30 tasks) for PR only

---

## Success Metrics

### Leading Indicators (weeks 1-4, Observe mode)
- Baseline captured (success_rate_golden, injection_success_rate)
- Eval runs on every PR (100% coverage)
- Results visible in PR comments
- Developer feedback positive (useful, not noisy)

### Lagging Indicators (weeks 5+, Enforce mode)
- Zero regressions shipped to production (blocked by gates)
- Prompt improvements measurable (+5-10% success rate)
- Security maintained (injection_success_rate ≤1%)
- Developer velocity unchanged (evals don't slow down)

---

## Alternatives Considered and Rejected

### Rejected: Proprietary Eval Platform (Confident AI, Humanloop)
**Why**: Vendor lock-in, cost, limited customization for our use case

### Rejected: Fully Manual Review
**Why**: Doesn't scale, too subjective

### Rejected: Integration-Only Testing
**Why**: Too slow, too expensive, too flaky

### Rejected: No Evaluation
**Why**: Too risky, can't iterate confidently

---

## Alignment with Autopilot Mission

**Autopilot Mission**: "Agents should complete tasks autonomously with high quality and verifiable evidence"

**How IMP-35 Supports This**:
1. **High Quality**: Evals enforce baseline quality, prevent regressions
2. **Verifiable Evidence**: Eval results are evidence of prompt quality
3. **Autonomous**: Gates run automatically, no manual intervention
4. **Continuous Improvement**: Measurable improvements guide roadmap

**Conclusion**: IMP-35 is CRITICAL infrastructure for autonomous quality assurance.

---

## Next Steps

1. ✅ STRATEGIZE complete (this document)
2. ⏳ SPEC: Define acceptance criteria, KPIs, verification mapping
3. ⏳ PLAN: Break down implementation (corpus curation, runner script, gates, CI)
4. ⏳ THINK: Assumptions, edge cases, pre-mortem
5. ⏳ IMPLEMENT: Build harness + integrate with existing systems
6. ⏳ VERIFY: Test harness, capture baseline, measure performance
7. ⏳ REVIEW: Adversarial review, gap analysis
8. ⏳ PR: Commit, create follow-up tasks
9. ⏳ MONITOR: Track eval effectiveness over time

---

**STRATEGIZE Phase Status**: ✅ COMPLETE
**Decision**: Proceed with Hybrid Harness (Golden Tasks + Garak + Unit-Style)
**Next Phase**: SPEC (define acceptance criteria and KPIs)
