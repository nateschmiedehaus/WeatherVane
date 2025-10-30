# THINK: Pre-Mortem Analysis - IMP-35

**Task ID**: IMP-35
**Phase**: THINK
**Date**: 2025-10-30
**Status**: In Progress

---

## Pre-Mortem: Imagine It's 6 Months from Now...

**Scenario**: It's April 2026. The prompt eval harness (IMP-35) has been rolled out for 6 months. It was a **catastrophic failure**. The system was rolled back, prompts regressed, and developer trust eroded.

**Question**: What went wrong?

---

## Failure Mode 1: False Positive Storm (Developer Bypass)

### What Happened

**Timeline**:
- Week 1-4: Observe mode, collected baseline
- Week 5: Enabled enforce mode (gate.prompt_evals=enforce)
- Week 6: Gate blocked 80% of PRs (false positive rate >50%)
- Week 7: Developers started using manual override for every PR
- Week 8: Culture of "just override it" emerged
- Month 3: Gate became checkbox, no one trusts results
- Month 6: Rolled back to observe mode, wasted 16-22 hours + 6 months

**Root Causes**:
1. **Threshold too strict**: -5% was too tight, natural variance was ±8%
2. **Corpus not representative**: Golden tasks didn't match real work
3. **Baseline captured during "lucky streak"**: Initial baseline was unusually high (80%), normal is 65%
4. **No developer feedback loop**: Didn't iterate on blocked PRs to understand why

**Warning Signs We Missed**:
- Week 2: Baseline variance CV = 22% (high noise, ignored)
- Week 6: False positive rate 15% (above 10% threshold, no action)
- Week 7: Override rate 40% (above 30% red flag, dismissed as "learning curve")

### Prevention Strategy

**What we should have done**:
1. **Longer observe mode**: 8 weeks instead of 4 (collect more data)
2. **Statistical rigor**: Use confidence intervals, not point estimates
3. **Gradual threshold**: Start at -15% (loose), tighten to -10%, then -5%
4. **Developer interviews**: After each false positive, ask: "Was this justified?"
5. **Corpus iteration**: Add/remove tasks based on false positive analysis

**Detection Mechanisms** (to catch this early):
- Alert: False positive rate >10% for 2 consecutive weeks
- Alert: Override rate >30% for 1 week
- Weekly review: Interview developers about blocked PRs
- Metrics dashboard: Track FP rate trend (should decrease over time)

---

## Failure Mode 2: Corpus Staleness (False Confidence)

### What Happened

**Timeline**:
- Month 1-3: Evals pass consistently, developers trust system
- Month 4: Production incidents increase (integration bugs, edge cases)
- Month 5: Post-mortem reveals: "Evals didn't catch these issues"
- Month 6: Analysis shows: Golden corpus doesn't match real task distribution
  - Corpus: 50% IMPLEMENT tasks (code generation)
  - Reality: 30% IMPLEMENT, 40% STRATEGIZE/SPEC (planning/design)
- Result: Evals gave false confidence, missed entire categories of issues

**Root Causes**:
1. **Initial corpus curation bias**: Picked "easy to evaluate" tasks (code gen), skipped "hard to evaluate" (strategy)
2. **No corpus evolution**: Never added tasks from production incidents
3. **No coverage analysis**: Didn't track corpus vs. reality distribution
4. **Quarterly review skipped**: Too busy with other work

**Warning Signs We Missed**:
- Month 2: User feedback: "Evals pass but I still find bugs in REVIEW"
- Month 3: Coverage analysis showed: 0 tasks test multi-file refactoring
- Month 4: Production incidents all related to integration (not unit-level)

### Prevention Strategy

**What we should have done**:
1. **Diverse curation**: Force distribution match (STRATEGIZE ≥20%, IMPLEMENT ≥20%, etc.)
2. **Incident-driven evolution**: Every P0 incident → new golden task
3. **Quarterly corpus audit**: Compare corpus vs. last 90 days of real tasks
4. **Coverage metrics**: Track which task types are under-represented
5. **Manual spot-checks**: Monthly, pick 5 random production tasks, run eval

**Detection Mechanisms**:
- Alert: Production bug not caught by evals → add to corpus
- Quarterly review: Distribution drift analysis (corpus vs. reality)
- Manual review: "Would this corpus catch last month's bugs?"

---

## Failure Mode 3: Eval-Production Drift (Wrong Version Tested)

### What Happened

**Timeline**:
- Month 1: Evals test prompts compiled with Compiler v1.0
- Month 2: Production upgraded to Compiler v1.1 (breaking change)
- Month 3: Evals still using v1.0 (not noticed)
- Month 4: Production prompt quality degrades (not caught by evals)
- Month 5: Attestation hash mismatch alerts ignored (assumed false alarms)
- Month 6: Discovery: Evals testing wrong version for 4 months (wasted effort)

**Root Causes**:
1. **No version tracking**: Eval harness didn't track compiler version
2. **Attestation integration incomplete**: Hash mismatch alerts not actionable
3. **Nightly E2E tests skipped**: Too expensive, disabled after week 2
4. **No smoke tests**: Never validated "eval prompt == production prompt"

**Warning Signs We Missed**:
- Month 2: Attestation hash mismatches (dismissed as "compiler bug")
- Month 3: Eval success rate stable, production incidents increasing (divergence)
- Month 4: Developer reports: "Evals pass but prod fails"

### Prevention Strategy

**What we should have done**:
1. **Version pinning**: Eval harness declares compiler version explicitly
2. **Attestation enforcement**: Hash mismatch → fail eval, don't ignore
3. **Nightly E2E tests**: Sample 5 real production tasks, compare eval vs. prod
4. **Smoke test**: Pre-eval, verify compiler.compile() == production.getPrompt()
5. **Alert routing**: Hash mismatches page on-call, not just log

**Detection Mechanisms**:
- Smoke test (pre-eval): Compile test prompt, verify hash matches expected
- Attestation alerts: Hash mismatch → block eval run (don't proceed)
- Nightly E2E: If eval-prod divergence >10% → page on-call
- Quarterly audit: Manual verification of eval-prod alignment

---

## Failure Mode 4: Performance Degradation (CI Bottleneck)

### What Happened

**Timeline**:
- Month 1: Full eval suite runs in 8 min (within 10 min SLO)
- Month 2: Corpus grows to 40 tasks, now 15 min
- Month 3: LLM API latency increases (p95 10s → 30s), now 25 min
- Month 4: CI queue backlog, PRs waiting 2 hours for eval
- Month 5: Developers push directly to main (bypass CI)
- Month 6: Eval system bypassed, reverted to manual testing

**Root Causes**:
1. **No parallel execution**: Tasks ran sequentially (40 tasks × 30s = 20 min)
2. **No response caching**: Re-ran same prompts repeatedly
3. **No quick mode adoption**: Developers didn't use quick mode (5 tasks, <2 min)
4. **Corpus grew unchecked**: 20 → 40 tasks, no pruning
5. **API latency not monitored**: Didn't notice p95 degradation until too late

**Warning Signs We Missed**:
- Month 2: p95 latency 12s (above 10s baseline, no alert)
- Month 3: PR comments: "Why does eval take so long?"
- Month 4: CI queue depth >10 (alert threshold, ignored)

### Prevention Strategy

**What we should have done**:
1. **Parallel execution**: Run 10 tasks concurrently (4x speedup)
2. **Response caching**: Cache LLM responses (deterministic for same prompt)
3. **Quick mode default**: Pre-commit runs quick mode (5 tasks), full mode only on PR
4. **Corpus pruning**: Cap at 30 tasks, remove redundant tasks quarterly
5. **Latency monitoring**: Alert if p95 >15s, investigate API issues
6. **Model optimization**: Use Haiku for simple tasks (19x cheaper, faster)

**Detection Mechanisms**:
- Alert: Eval runtime p95 >10 min for 3 consecutive runs
- Alert: CI queue depth >5 for >1 hour
- Metrics: Track eval runtime trend (should stay flat or decrease)
- User feedback: Survey after each PR - "Was eval too slow?"

---

## Failure Mode 5: Cost Spiral (Budget Exhaustion)

### What Happened

**Timeline**:
- Month 1: Eval cost ~$2 per run, 100 runs/month = $200/month (acceptable)
- Month 2: Corpus grows to 40 tasks, cost $5 per run
- Month 3: Enabled variants testing (personas + overlays), cost $15 per run
- Month 4: 200 runs/month = $3,000/month (budget exceeded)
- Month 5: Finance blocks LLM API, evals disabled
- Month 6: Cannot run evals, rolled back to manual

**Root Causes**:
1. **No cost tracking**: Didn't monitor token usage or costs
2. **No cost budget**: Never defined "acceptable cost" in spec
3. **Corpus bloat**: 20 → 40 tasks, no pruning
4. **Variant explosion**: 3 personas × 5 overlays = 15 variants per task
5. **Always Sonnet**: Never tested Haiku for simple tasks (19x cheaper)

**Warning Signs We Missed**:
- Month 2: Token usage doubled (no alert)
- Month 3: Cost/run increased 7x (dismissed as "one-time spike")
- Month 4: Finance email: "LLM costs increased 15x this quarter"

### Prevention Strategy

**What we should have done**:
1. **Cost budget**: Define max $500/month in spec (AC8)
2. **Cost monitoring**: Track token usage per run, alert if >$10
3. **Model tiering**: Haiku for simple tasks, Sonnet for complex
4. **Response caching**: Only re-run changed prompts (not entire corpus)
5. **Variant sampling**: Test 3 variants (not all 15), rotate weekly
6. **Corpus capping**: Max 30 tasks, remove lowest-value tasks

**Detection Mechanisms**:
- Alert: Cost per run >$10 (20x initial)
- Alert: Monthly cost >$500 (2.5x budget)
- Dashboard: Cost trend (tokens × model pricing)
- Quarterly review: Cost vs. value (bugs caught per $)

---

## Failure Mode 6: No Measurable Improvement (Wasted Effort)

### What Happened

**Timeline**:
- Month 1-6: Built eval harness, ran evals on every PR
- Month 6: Retrospective question: "Did overlays/personas improve quality?"
- Analysis: Baseline 70%, post-overlay 68% (WORSE, not better)
- Discovery: Spent 100 hours (16h implementation + 84h integration) for NEGATIVE value
- Result: IMP-22/23 (personas/overlays) were wasted effort, eval harness just confirmed it

**Root Causes**:
1. **Baseline captured too late**: Should have measured overlays/personas BEFORE building them
2. **No A/B testing**: Never compared baseline vs. overlay side-by-side
3. **Spec assumed improvement**: AC8 says "+5-10% target" but never validated
4. **No kill criteria**: Never defined "if improvement <5%, kill overlays"
5. **Sunk cost fallacy**: Kept going even when data showed no improvement

**Warning Signs We Missed**:
- Month 2: Baseline capture showed 70% (spec expected ≥70%, just barely)
- Month 4: Overlay testing showed 72% (only +2%, not +5-10%)
- Month 5: Developer feedback: "Overlays don't seem to help"

### Prevention Strategy

**What we should have done**:
1. **Pre-validation**: Measure baseline BEFORE building IMP-22/23
2. **Hypothesis testing**: "We believe overlays will improve X by Y%" (explicit)
3. **Kill criteria**: If improvement <5% after 3 months → kill overlays
4. **A/B testing**: Run baseline vs. overlay side-by-side for 2 weeks
5. **ROI analysis**: Effort (hours) vs. value (bugs prevented × 90 min each)

**Detection Mechanisms**:
- Month 3 checkpoint: Measure improvement, if <3% → investigate
- Month 6 retrospective: "Did this investment pay off?"
- Quarterly review: ROI calculation (cost vs. bugs prevented)

---

## Failure Mode 7: Garak Compromise (False Security)

### What Happened

**Timeline**:
- Month 1: Garak reports 0.8% injection success rate (AC2 met)
- Month 2-5: Continued 0% injection rate (confident in security)
- Month 6: Red team exercise finds 15 injection vulnerabilities
- Discovery: Garak library had bugs, missed entire attack categories
- Result: False sense of security for 6 months, actual security was poor

**Root Causes**:
1. **Blind trust in Garak**: Never validated tool accuracy
2. **No sanity checks**: Never tested against known-vulnerable prompts
3. **No manual testing**: Relied 100% on automated tool
4. **No attack corpus evolution**: Garak corpus was static
5. **No red team exercises**: Never validated with real attackers

**Warning Signs We Missed**:
- Month 1: 0.8% injection rate (suspiciously low, ignored)
- Month 3: Garak GitHub issues mention false negatives (not checked)
- Month 4: User report: "I can jailbreak this prompt easily" (dismissed)

### Prevention Strategy

**What we should have done**:
1. **Garak validation**: Test against known-vulnerable and known-secure prompts
2. **Manual injection corpus**: Create 10 custom attacks (not just Garak)
3. **Red team quarterly**: Hire security researchers to attack prompts
4. **Sanity checks**: If injection 0% for 3 months → validate tool
5. **Attack evolution**: Add new attacks from incident reports

**Detection Mechanisms**:
- Sanity check (pre-eval): Garak against known-vulnerable prompt (should fail)
- Quarterly red team: External validation of security claims
- Manual spot-checks: Attempt jailbreaks monthly
- Alert: Injection rate 0% for >3 months (suspiciously secure)

---

## Failure Mode 8: Integration Hell (IMP-21..26 Coupling)

### What Happened

**Timeline**:
- Month 1: Eval harness integrated with IMP-21 (compiler)
- Month 2: IMP-22 (personas) broke eval harness (tight coupling)
- Month 3: IMP-24 (attestation) changed hash format, evals failed
- Month 4: IMP-26 (variants) introduced breaking API changes
- Month 5: Spent 40 hours fixing integration issues (2.5x original estimate)
- Month 6: Eval harness too brittle, any upstream change breaks it

**Root Causes**:
1. **Tight coupling**: Eval harness directly called internal APIs
2. **No versioned contracts**: APIs changed without versioning
3. **No integration tests**: Never tested against mock compiler/personas
4. **No graceful degradation**: Single integration failure → entire harness broken
5. **No feature flags**: Couldn't disable problematic integrations

**Warning Signs We Missed**:
- Month 2: First integration break (assumed one-time issue)
- Month 3: Second break (pattern emerging, ignored)
- Month 4: Third break (definitely a systemic issue, too late)

### Prevention Strategy

**What we should have done**:
1. **Loose coupling**: Use stable APIs, not internal implementation
2. **Versioned contracts**: APIs use semantic versioning (v1, v2)
3. **Integration tests**: Mock all upstream dependencies
4. **Graceful degradation**: If IMP-24 fails → skip attestation check (log warning)
5. **Feature flags**: Can disable each integration independently
6. **Adapter pattern**: Isolate integration logic in adapters

**Detection Mechanisms**:
- Integration tests: Run against mocked IMP-21..26 (catch breaking changes early)
- Alert: Any integration failure → investigate within 24 hours
- Quarterly review: Integration stability (how many breaks this quarter?)

---

## Mitigation Priority Matrix

| Failure Mode | Likelihood | Impact | Priority | Key Mitigation |
|--------------|------------|--------|----------|----------------|
| 1. False Positive Storm | HIGH | CRITICAL | P0 | Longer observe mode, gradual threshold tightening |
| 2. Corpus Staleness | MEDIUM | HIGH | P1 | Incident-driven evolution, quarterly audit |
| 3. Eval-Prod Drift | MEDIUM | CRITICAL | P0 | Attestation enforcement, nightly E2E tests |
| 4. Performance Degradation | MEDIUM | HIGH | P1 | Parallel execution, response caching, Haiku for simple tasks |
| 5. Cost Spiral | LOW | MEDIUM | P2 | Cost monitoring, model tiering, caching |
| 6. No Improvement | MEDIUM | HIGH | P1 | Pre-validation, kill criteria, A/B testing |
| 7. Garak Compromise | LOW | HIGH | P1 | Sanity checks, quarterly red team, manual corpus |
| 8. Integration Hell | HIGH | MEDIUM | P1 | Loose coupling, versioned contracts, graceful degradation |

**P0 (Critical Path)**: Must address in IMPLEMENT phase
**P1 (Important)**: Address in IMPLEMENT or early VERIFY
**P2 (Nice-to-have)**: Address in Phase 2 enhancements

---

## Pre-Implementation Checklist (Prevent Failure)

Before starting IMPLEMENT, verify:

- [ ] **Failure Mode 1**: Observe mode plan is ≥8 weeks (not 4)
- [ ] **Failure Mode 2**: Corpus curation forces distribution match (STRATEGIZE ≥20%, etc.)
- [ ] **Failure Mode 3**: Attestation integration is mandatory, not optional
- [ ] **Failure Mode 4**: Parallel execution + response caching designed from start
- [ ] **Failure Mode 5**: Cost budget defined ($500/month max)
- [ ] **Failure Mode 6**: A/B test plan for overlays/personas (validate hypothesis)
- [ ] **Failure Mode 7**: Garak sanity check + manual corpus planned
- [ ] **Failure Mode 8**: Integration adapters designed (loose coupling)

**If ANY checkbox fails → Return to SPEC, update acceptance criteria**

---

## Success Criteria (Avoiding Failure)

**6 months from now, IMP-35 is successful if:**

1. ✅ **Developer trust maintained**: DX rating ≥7/10, override rate <10%
2. ✅ **Corpus stays relevant**: Production bugs → added to corpus within 1 week
3. ✅ **Eval-prod alignment**: Hash mismatches <1%, E2E tests pass >95%
4. ✅ **Performance acceptable**: p95 runtime <10 min, CI not bottleneck
5. ✅ **Cost sustainable**: <$500/month, ROI positive (bugs prevented > cost)
6. ✅ **Measurable improvement**: Overlays/personas show +5-10% (AC8 met)
7. ✅ **Security maintained**: Quarterly red team finds ≤2 vulnerabilities
8. ✅ **Integration stable**: <2 integration breaks per quarter

**Failure criteria** (trigger rollback):
- ❌ Override rate >30% for 4 consecutive weeks (Failure Mode 1)
- ❌ Production bugs missed by evals for 3 consecutive months (Failure Mode 2)
- ❌ Hash mismatch alerts ignored for >2 weeks (Failure Mode 3)
- ❌ CI runtime >20 min for 2 consecutive weeks (Failure Mode 4)
- ❌ Cost >$1,000/month for 2 consecutive months (Failure Mode 5)
- ❌ No measurable improvement after 6 months (Failure Mode 6)
- ❌ Red team finds >5 vulnerabilities (Failure Mode 7)
- ❌ >5 integration breaks in one quarter (Failure Mode 8)

---

## Next Steps

1. ✅ Pre-mortem complete (this document)
2. ✅ THINK phase complete (assumptions + edge cases + pre-mortem)
3. ⏳ IMPLEMENT: Build with failure modes in mind
4. ⏳ VERIFY: Test mitigations explicitly
5. ⏳ MONITOR: Track failure indicators

---

**THINK Phase Status**: ✅ COMPLETE
**Next Phase**: IMPLEMENT (Step 1: Golden Task Corpus Creation)

**Key Insight**: Most failure modes are preventable with:
- Longer observe mode (8 weeks, not 4)
- Statistical rigor (confidence intervals, variance tracking)
- Integration discipline (loose coupling, graceful degradation)
- Cost/performance monitoring (alerts, budgets)
- Corpus evolution (incident-driven, quarterly audits)
