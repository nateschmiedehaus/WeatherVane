# SPEC: IMP-35 - Prompt Eval Harness + Gates

**Task ID**: IMP-35
**Task**: Prompt Evaluation Harness with Quality Gates
**Date**: 2025-10-30
**Phase**: SPEC
**Dependencies**: IMP-21 (Prompt Compiler), IMP-24 (Attestation), telemetry sinks

---

## Acceptance Criteria (ALL must pass)

### AC1: Golden Task Corpus Created
**What**: Curated corpus of 20-30 representative tasks covering all 9 phases

**Verification**:
- [ ] Corpus file exists: `tools/wvo_mcp/evals/prompts/golden/tasks.jsonl`
- [ ] Contains ≥20 tasks with diverse phase coverage:
  - STRATEGIZE: ≥3 tasks
  - SPEC: ≥3 tasks
  - PLAN: ≥3 tasks
  - THINK: ≥2 tasks
  - IMPLEMENT: ≥4 tasks
  - VERIFY: ≥2 tasks
  - REVIEW: ≥2 tasks
  - PR: ≥1 task
  - MONITOR: ≥1 task
- [ ] Each task has: prompt, expected_output_criteria, pass_threshold
- [ ] README documents corpus curation process

**Out of Scope**: Corpus evolution (will iterate after baseline)

---

### AC2: Robustness Test Integration
**What**: Garak-based prompt injection resistance testing

**Verification**:
- [ ] Garak integration script: `tools/wvo_mcp/scripts/run_robustness_evals.sh`
- [ ] Tests ≥10 injection attack vectors (jailbreak, prompt leaking, instruction override)
- [ ] Results format: `state/evidence/IMP-35/verify/robustness_eval.json`
- [ ] Injection success rate ≤1% measured and documented

**Out of Scope**: Custom attack corpus (use garak library)

---

### AC3: Eval Runner Infrastructure
**What**: Automated script to run golden tasks and robustness tests

**Verification**:
- [ ] Script exists: `tools/wvo_mcp/scripts/run_prompt_evals.sh`
- [ ] Accepts flags: `--mode {quick|full}`, `--baseline`, `--compare`
- [ ] Quick mode: 5 tasks, <2 min runtime
- [ ] Full mode: all tasks, <10 min runtime
- [ ] Outputs: `prompt_eval_results.json` with per-task success/failure
- [ ] Exit code 0 = pass, 1 = fail (for CI integration)

**Out of Scope**: UI dashboard (nightly automation only for now)

---

### AC4: Baseline Capture
**What**: Establish quality baseline before enforcement

**Verification**:
- [ ] Baseline captured: `state/evidence/IMP-35/verify/prompt_eval_baseline.json`
- [ ] Includes: success_rate_golden, injection_success_rate, groundedness_score
- [ ] Baseline measured with current production prompts (no overlays/personas)
- [ ] Statistical confidence: n≥5 runs, confidence intervals documented

**Out of Scope**: Historical baselines (only current state)

---

### AC5: VERIFY Phase Gate Implementation
**What**: Automated gate that blocks VERIFY→REVIEW transition if prompt quality degrades

**Verification**:
- [ ] Gate module: `tools/wvo_mcp/src/verify/validators/prompt_eval_gate.ts`
- [ ] Integrated into WorkProcessEnforcer VERIFY checks
- [ ] Feature flag: `gate.prompt_evals` (off/observe/enforce)
- [ ] Observe mode: logs warnings, doesn't block (default for weeks 1-4)
- [ ] Enforce mode: blocks if success_rate_golden < baseline - 5%
- [ ] Manual override mechanism with justification logging

**Out of Scope**: Multi-phase gates (only VERIFY for Phase 1)

---

### AC6: CI Integration
**What**: Evals run automatically on every PR

**Verification**:
- [ ] GitHub Actions workflow: `.github/workflows/prompt-evals.yml`
- [ ] Triggers on: prompt file changes (`tools/wvo_mcp/src/prompt/**`)
- [ ] Runs full eval suite (golden + robustness)
- [ ] Posts results as PR comment (success rate, failures)
- [ ] Blocks merge if success_rate < baseline - 5% (enforce mode only)

**Out of Scope**: Nightly extended runs (future enhancement)

---

### AC7: IMP-21..26 Integration
**What**: Evals test prompts from compiler, personas, overlays, attestation

**Verification**:
- [ ] Evals use `PromptCompiler.compile()` (IMP-21 integration)
- [ ] Test variants: baseline, domain overlays, different personas
- [ ] Attestation hashes match eval prompts (IMP-24 integration)
- [ ] Variant IDs recorded in results (IMP-26 integration)
- [ ] Results show overlay effectiveness (+5-10% target measured)

**Out of Scope**: Hint injection testing (defer to IMP-ADV-01.2 follow-up)

---

### AC8: Success Metrics Meet Thresholds
**What**: Measured improvement over baseline

**Verification**:
- [ ] Baseline success_rate_golden measured (e.g., 70%)
- [ ] Post-overlay success_rate ≥ baseline + 5% (e.g., ≥75%)
- [ ] Injection_success_rate ≤1% maintained
- [ ] Groundedness non-decreasing
- [ ] p95 latency within 2x baseline
- [ ] Token cost within 1.5x baseline

**Out of Scope**: Long-term trend analysis (MONITOR phase)

---

### AC9: Documentation Complete
**What**: Comprehensive guides for using and maintaining eval system

**Verification**:
- [ ] README: `tools/wvo_mcp/evals/README.md`
- [ ] Covers: corpus format, adding tasks, running evals, interpreting results
- [ ] Gate policy documented: `docs/autopilot/PROMPT_EVAL_POLICY.md`
- [ ] Troubleshooting guide for common failures
- [ ] Examples of good/bad task definitions

**Out of Scope**: Video tutorials

---

### AC10: Rollback Verified
**What**: Can safely disable evals without breaking system

**Verification**:
- [ ] `gate.prompt_evals=off` disables gate (no blocking)
- [ ] Eval scripts still runnable (optional in CI)
- [ ] No production dependencies on eval results
- [ ] Rollback tested and documented

**Out of Scope**: Data migration (evals are stateless)

---

## KPIs (Key Performance Indicators)

### Quality KPIs
- **Baseline Quality**: success_rate_golden ≥70% (establish from current prompts)
- **Improvement Target**: +5-10% relative improvement with overlays/personas
- **Security Baseline**: injection_success_rate ≤1%
- **Groundedness**: Non-decreasing (≥baseline)

### Performance KPIs
- **Quick Mode Runtime**: <2 min (5 tasks)
- **Full Mode Runtime**: <10 min (20-30 tasks)
- **False Positive Rate**: <5% (blocked changes that shouldn't be)
- **CI Reliability**: ≥99.5% uptime (non-flaky)

### Adoption KPIs (MONITOR phase)
- **PR Coverage**: 100% of prompt changes trigger evals
- **Developer Satisfaction**: ≥7/10 (useful, not noise)
- **Regression Prevention**: Zero quality regressions shipped to prod (after enforce mode)

---

## Out of Scope (Explicit Non-Goals)

### Not Included in Phase 1:
1. **UI Dashboard** - Nightly runs use CLI only, dashboard is follow-up
2. **Historical Tracking** - Baseline only, trend analysis in MONITOR
3. **Custom Attack Corpus** - Use garak library, custom attacks later
4. **Multi-Phase Gates** - Only VERIFY gate for Phase 1
5. **Production Monitoring** - Evals are pre-merge only, prod monitoring separate
6. **A/B Testing Framework** - Variant comparison manual for Phase 1
7. **Cost Optimization** - Response caching deferred to Phase 2

### Deferred to Future:
- IMP-35.1: Extended robustness corpus (adversarial prompts from incidents)
- IMP-35.2: Eval UI dashboard (state/analytics/prompt_evals.html)
- IMP-35.3: Production eval alignment (eval vs prod discrepancy alerts)
- IMP-35.4: Response caching (speed up re-runs)

---

## Verification Mapping

| Acceptance Criterion | Verification Method | Success Signal |
|---------------------|---------------------|----------------|
| AC1: Corpus Created | File check + schema validation | tasks.jsonl exists, ≥20 tasks |
| AC2: Robustness Tests | Script run + results check | robustness_eval.json, injection ≤1% |
| AC3: Eval Runner | Script execution + timing | Exit 0, <10 min full mode |
| AC4: Baseline Capture | Results file + stats | baseline.json, n≥5, CIs documented |
| AC5: VERIFY Gate | Integration test + flag check | Gate blocks when should, observes when should |
| AC6: CI Integration | PR test + workflow run | Workflow triggers, posts results |
| AC7: IMP-21..26 Integration | Hash matching + variant test | Attestation matches, variants tested |
| AC8: Metrics Meet Thresholds | Results comparison | +5-10% success, injection ≤1% |
| AC9: Documentation Complete | README review + example run | Docs exist, examples work |
| AC10: Rollback Verified | Flag test + system health | Rollback clean, no errors |

---

## Dependencies

### Required (Blocking):
- IMP-21: Prompt Compiler (for canonical prompt assembly)
- IMP-24: Attestation (for prompt hash matching)
- Telemetry sinks (for logging eval results)

### Optional (Enhance):
- IMP-22: PersonaSpec (for testing persona variants)
- IMP-23: Domain Overlays (for testing overlay effectiveness)
- IMP-26: Prompt Variants (for A/B testing)

---

## Risks and Mitigations

### Risk: Corpus Not Representative
**Mitigation**: Quarterly review, add tasks from prod incidents, coverage analysis

### Risk: False Positives Block Development
**Mitigation**: Threshold buffer (-5% warn, -10% block), manual override, detailed failure analysis

### Risk: Evals Drift from Production
**Mitigation**: Hash matching (IMP-24), nightly E2E tests, alert on discrepancy

### Risk: Performance Issues (too slow)
**Mitigation**: Quick mode for pre-commit, caching (Phase 2), parallel execution

---

## Success Definition

**Phase 1 is successful if**:
1. ✅ All 10 acceptance criteria met
2. ✅ Baseline captured with ≥70% success rate
3. ✅ Overlays/personas show +5-10% improvement
4. ✅ Injection success rate ≤1%
5. ✅ CI integration reliable (≥99.5% uptime)
6. ✅ Zero regressions shipped after enforce mode enabled
7. ✅ Developer feedback positive (≥7/10 satisfaction)

**Failure Criteria**:
- Baseline success rate <50% (prompts already too broken)
- False positive rate >10% (blocks too many good changes)
- CI flakiness >5% (unreliable, ignored by devs)
- No measurable improvement from overlays/personas (wasted effort)

---

## Next Steps

1. ✅ SPEC complete (this document)
2. ⏳ PLAN: Break down implementation steps, time estimates, dependencies
3. ⏳ THINK: Assumptions, edge cases, pre-mortem
4. ⏳ IMPLEMENT: Build eval runner, corpus, gates, CI workflow
5. ⏳ VERIFY: Run evals, capture baseline, measure performance
6. ⏳ REVIEW: Adversarial review, gap analysis, quality check
7. ⏳ PR: Commit strategy, follow-up tasks, rollout plan
8. ⏳ MONITOR: Track eval effectiveness, iterate on corpus

---

**SPEC Phase Status**: ✅ COMPLETE
**Acceptance Criteria**: 10 defined with clear verification
**Out of Scope**: 7 items explicitly deferred
**Next Phase**: PLAN (implementation breakdown)
