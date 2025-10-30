# THINK: Edge Cases - IMP-35

**Task ID**: IMP-35
**Phase**: THINK
**Date**: 2025-10-30
**Status**: In Progress

---

## Edge Case Analysis

**Purpose**: Identify boundary conditions, exceptional scenarios, and failure modes that could break the eval harness.

---

## Category 1: Corpus Quality Edge Cases

### Edge Case 1.1: Empty Golden Corpus

**Scenario**: tasks.jsonl is empty or has 0 valid tasks

**Impact**: Cannot run evals at all (fatal)

**Detection**:
```bash
task_count=$(wc -l < tools/wvo_mcp/evals/prompts/golden/tasks.jsonl)
if [ $task_count -lt 20 ]; then
  echo "ERROR: Corpus has $task_count tasks, need ≥20"
  exit 1
fi
```

**Handling**:
- AC1 enforces: ≥20 tasks required
- Corpus validation in VERIFY phase (schema check + count check)
- Fail fast: Exit with error if corpus invalid

---

### Edge Case 1.2: Malformed Task Schema

**Scenario**: Task in corpus missing required fields (prompt, expected_criteria, pass_threshold)

**Impact**: Runner crashes or skips task silently

**Detection**:
```typescript
// Validate each task against schema
for (const task of corpus) {
  if (!task.prompt || !task.expected_criteria || !task.pass_threshold) {
    throw new Error(`Invalid task: ${task.id} missing required fields`);
  }
}
```

**Handling**:
- JSON schema validation in Step 1 (Corpus Creation)
- Validate on load: Runner rejects invalid corpus before running
- Document schema in tools/wvo_mcp/evals/README.md with examples

---

### Edge Case 1.3: Corpus Too Large (>100 tasks)

**Scenario**: Corpus grows to 100+ tasks, full mode takes >30 min

**Impact**: CI timeout, developers bypass evals

**Detection**:
- Monitor runtime in MONITOR phase
- Alert if p95 > 10 min (AC3 violation)

**Handling**:
- Quick mode: Sample 5 tasks (representative subset)
- Full mode: Run all, but parallel execution (10 tasks concurrently)
- If >100 tasks: Split into core (20) + extended (80) corpus
- Extended runs nightly only, core runs on every PR

---

## Category 2: Baseline Capture Edge Cases

### Edge Case 2.1: Baseline Success Rate <50%

**Scenario**: Current prompts are too broken (spec failure criteria)

**Impact**: Cannot establish meaningful regression thresholds

**Detection**:
```bash
baseline_success=$(jq '.success_rate_golden' state/evidence/IMP-35/verify/prompt_eval_baseline.json)
if (( $(echo "$baseline_success < 50" | bc -l) )); then
  echo "CRITICAL: Baseline $baseline_success% < 50%, prompts too broken"
fi
```

**Handling**:
- PIVOT IMMEDIATELY: Stop IMP-35 implementation
- Create follow-up task: "FIX-PROMPTS-BASELINE-QUALITY"
- Fix prompts first, then resume IMP-35
- Document in verify/baseline_report.md

---

### Edge Case 2.2: High Baseline Variance (CV >20%)

**Scenario**: Repeated runs show inconsistent results (e.g., 50%, 75%, 60%, 55%, 70%)

**Impact**: Cannot trust eval results (too noisy)

**Detection**:
```python
import numpy as np
runs = [50, 75, 60, 55, 70]
mean = np.mean(runs)  # 62%
std = np.std(runs)    # 9.3
cv = (std / mean) * 100  # 15% (acceptable)
# If cv > 20% → too noisy
```

**Handling**:
- Increase n from 5 to 10 runs
- If still high variance: Implement response caching (deterministic for same prompt)
- Widen threshold: warn at -10%, block at -15% (compensate for noise)
- Document variance in verify/baseline_report.md

---

### Edge Case 2.3: Baseline Cannot Be Captured (API Failures)

**Scenario**: LLM API fails during baseline capture (rate limit, outage)

**Impact**: Cannot proceed to Step 5 (Gate implementation)

**Detection**:
- Retry logic: 3 attempts with exponential backoff
- If all retries fail → log error, exit gracefully

**Handling**:
- Retry with backoff: 1s, 5s, 15s delays
- If API down >1 hour: Document in evidence, retry next day
- Use cached responses if available (Phase 2 enhancement)
- Do NOT proceed to gate implementation without baseline

---

## Category 3: Eval Runner Edge Cases

### Edge Case 3.1: Eval Timeout (>10 min)

**Scenario**: Full eval suite takes >10 min (AC3 violation)

**Impact**: CI bottleneck, developers bypass

**Detection**:
```bash
timeout 600 bash scripts/run_prompt_evals.sh --mode full
if [ $? -eq 124 ]; then
  echo "ERROR: Eval timed out after 10 minutes"
fi
```

**Handling**:
- Quick mode for pre-commit: 5 tasks, <2 min
- Full mode: Parallel execution (10 tasks concurrently)
- Profile slow tasks: Optimize LLM calls, use smaller model for quick mode
- If consistently >10 min: Split corpus (core + extended)

---

### Edge Case 3.2: LLM Returns Empty Response

**Scenario**: LLM API returns 200 OK but empty content (rare but possible)

**Impact**: Task incorrectly marked as failed

**Detection**:
```typescript
if (!response || response.content.trim().length === 0) {
  throw new Error(`Empty response for task ${task.id}`);
}
```

**Handling**:
- Retry: 3 attempts for empty responses
- Log to state/analytics/eval_failures.jsonl
- Mark task as "ERROR" (not PASS or FAIL)
- Exclude ERROR tasks from success rate calculation
- If >10% of tasks → ERROR: API issue, halt evals

---

### Edge Case 3.3: Eval Runner Crashes Mid-Run

**Scenario**: Runner crashes after 15/30 tasks complete

**Impact**: Incomplete results, cannot calculate success rate

**Detection**:
- Check results file: Expected 30 tasks, got 15

**Handling**:
- Idempotent design: Results written incrementally to temp file
- Resume from last completed task (store state in /tmp/eval_progress.json)
- On crash: Retry remaining tasks only
- Final results: Merge completed + retried

---

## Category 4: Quality Gate Edge Cases

### Edge Case 4.1: Gate Blocks All PRs (False Positive Storm)

**Scenario**: Threshold too strict, blocks 100% of PRs for 1 week

**Impact**: Development stops, gate bypassed

**Detection**:
- Monitor false positive rate in MONITOR phase
- Alert if >10% of PRs blocked (AC8 risk mitigation)

**Handling**:
- Emergency: Set feature flag `gate.prompt_evals=observe` (stop blocking)
- Analyze: Which tasks are causing false positives?
- Fix: Adjust threshold or remove flaky tasks from corpus
- Resume enforce mode only after FP rate <5%

---

### Edge Case 4.2: Manual Override Abuse

**Scenario**: Developers override gate without justification 50% of the time

**Impact**: Gate becomes meaningless

**Detection**:
```bash
override_rate=$(jq '.overrides / .total_blocks' state/analytics/prompt_eval_gates.jsonl)
if (( $(echo "$override_rate > 0.3" | bc -l) )); then
  echo "WARNING: Override rate $override_rate > 30%"
fi
```

**Handling**:
- Log all overrides with justification to state/analytics/eval_overrides.jsonl
- Weekly review: Are overrides justified?
- If >30% overrides: Gate is too strict or not trusted
- Action: Retune threshold or improve failure explanations

---

### Edge Case 4.3: Gate Misses Real Regression (False Negative)

**Scenario**: PR degrades prompt quality but gate allows merge (success rate drops 3%, threshold is -5%)

**Impact**: Production quality degrades, eval system loses trust

**Detection**:
- Post-merge monitoring: Compare pre-merge eval vs. post-merge production
- Alert if production success rate drops >5% within 7 days

**Handling**:
- Tighten threshold: -3% instead of -5%
- Add tasks to corpus (catch this failure type)
- Retro: Why did eval miss this? (wrong tasks? wrong criteria?)
- Document in MONITOR phase: False negative rate tracking

---

## Category 5: Robustness Testing Edge Cases

### Edge Case 5.1: Garak Not Installed

**Scenario**: `pip install garak` fails or garak not in PATH

**Impact**: Cannot run robustness tests (AC2 blocks)

**Detection**:
```bash
if ! command -v garak &> /dev/null; then
  echo "ERROR: garak not installed"
  exit 1
fi
```

**Handling**:
- Document garak installation in tools/wvo_mcp/evals/README.md
- Preflight check: Verify garak installed before running robustness tests
- Fallback: Manual injection tests (IMP-35.1 follow-up)
- If garak unreliable: Switch to manual corpus (AC2 allows this)

---

### Edge Case 5.2: Injection Success Rate 0%

**Scenario**: Garak reports 0% injection success (suspiciously secure)

**Impact**: False sense of security (garak might be broken)

**Detection**:
- Sanity check: Run garak against known-vulnerable prompt
- Expected: Vulnerable prompt should have >50% injection rate
- If 0% for vulnerable prompt → garak is broken

**Handling**:
- Validate garak: Test against known-vulnerable and known-secure prompts
- If garak broken: Document in verify/robustness_report.md
- Use manual injection tests as ground truth
- Do NOT trust 0% without validation

---

### Edge Case 5.3: Injection Success Rate >10%

**Scenario**: Prompts are highly vulnerable (AC2 allows ≤1%)

**Impact**: Security issue, must fix prompts

**Detection**:
```bash
injection_rate=$(jq '.injection_success_rate' state/evidence/IMP-35/verify/robustness_eval.json)
if (( $(echo "$injection_rate > 10" | bc -l) )); then
  echo "CRITICAL: Injection rate $injection_rate% > 10%"
fi
```

**Handling**:
- BLOCK: Do NOT proceed to gate implementation
- Create follow-up task: "FIX-PROMPTS-INJECTION-RESISTANCE"
- Fix prompts, recapture baseline
- Target: ≤1% injection rate (AC2 requirement)

---

## Category 6: CI Integration Edge Cases

### Edge Case 6.1: GitHub Actions API Rate Limit

**Scenario**: Cannot post PR comment due to API rate limit

**Impact**: Eval results not visible to developer

**Detection**:
- gh CLI returns 403 Forbidden or 429 Too Many Requests

**Handling**:
- Retry with exponential backoff
- Fallback: Write results to artifact (downloadable)
- If persistent: Use GitHub App (higher rate limits)
- Do NOT fail CI job (eval ran successfully, just can't post)

---

### Edge Case 6.2: PR Merged Before Eval Finishes

**Scenario**: Developer merges PR while eval is still running (10 min)

**Impact**: Regression slips into main branch

**Detection**:
- GitHub branch protection: Require "Prompt Evals" check to pass

**Handling**:
- Configure branch protection: Cannot merge while eval in progress
- If already merged: Post-merge monitoring catches regression
- Revert if regression detected (success rate drops >5%)

---

### Edge Case 6.3: CI Workflow Disabled or Bypassed

**Scenario**: Developer disables workflow or pushes directly to main

**Impact**: No eval enforcement

**Detection**:
- Monitor: Check if all prompt-changing PRs trigger workflow
- Alert if workflow skipped for prompt file changes

**Handling**:
- GitHub branch protection: Require workflow for all PRs
- Post-merge checks: Run evals on main branch commits
- If regression detected: Create follow-up task to fix + educate developer

---

## Category 7: Integration Edge Cases

### Edge Case 7.1: Compiler (IMP-21) Breaking Change

**Scenario**: PromptCompiler.compile() changes output format, evals break

**Impact**: All evals fail (false positives)

**Detection**:
- Attestation hash changes (IMP-24 integration)
- Success rate drops to 0% suddenly

**Handling**:
- Detect: Hash mismatch alert
- Action: Recapture baseline with new compiler version
- Update eval harness to match compiler changes
- Version eval harness with compiler version (e.g., eval_v1_compiler_v2)

---

### Edge Case 7.2: Persona/Overlay (IMP-22/23) Missing

**Scenario**: Eval tries to test persona variant but persona not found

**Impact**: Eval crashes or skips variant

**Detection**:
```typescript
const persona = await PersonaSpec.load(variant.persona_id);
if (!persona) {
  throw new Error(`Persona ${variant.persona_id} not found`);
}
```

**Handling**:
- Preflight: Validate all persona/overlay IDs exist before running eval
- Skip variant if persona missing (log warning)
- Mark variant as "SKIPPED" in results (not PASS or FAIL)
- Alert: Missing personas should be rare (indicates config issue)

---

### Edge Case 7.3: Attestation Hash Mismatch

**Scenario**: Eval prompt hash != production prompt hash (IMP-24 integration)

**Impact**: Eval-production drift (false confidence)

**Detection**:
```typescript
const evalHash = attestation.hash(evalPrompt);
const prodHash = stateGraph.getAttestationHash(task_id);
if (evalHash !== prodHash) {
  console.error(`Hash mismatch: eval=${evalHash}, prod=${prodHash}`);
}
```

**Handling**:
- Alert: Log to state/analytics/eval_prod_discrepancy.jsonl
- Investigate: Why are hashes different? (compiler bug? cache stale?)
- Do NOT trust eval results until hashes match
- Recapture baseline if compiler changed

---

## Category 8: Performance Edge Cases

### Edge Case 8.1: Eval Latency Spike (p95 >30s)

**Scenario**: LLM API slow, eval takes 30s per task instead of 5s

**Impact**: Full mode takes >30 min, CI timeout

**Detection**:
```bash
p95_latency=$(jq '.latency_ms | sort | .[-5]' /tmp/eval_results.json)
if [ $p95_latency -gt 30000 ]; then
  echo "WARNING: p95 latency $p95_latency ms > 30s"
fi
```

**Handling**:
- Retry with timeout: 60s per task
- If timeout: Mark task as ERROR (not FAIL)
- Use cached responses if available
- Alert: Persistent high latency → API issue

---

### Edge Case 8.2: Eval Cost Spike (>$10 per run)

**Scenario**: LLM API costs exceed budget

**Impact**: Unsustainable, must reduce eval frequency

**Detection**:
- Track token usage per run
- Calculate cost: tokens × $0.015/1k tokens (Sonnet pricing)
- Alert if cost >$10 per full run

**Handling**:
- Use smaller model for quick mode (Haiku: $0.0008/1k tokens)
- Response caching: Only run new/changed prompts
- Reduce corpus size: 20 core tasks instead of 30
- Nightly only: Run full corpus nightly, quick mode for PRs

---

## Category 9: Monitoring Edge Cases

### Edge Case 9.1: Metrics Not Collected

**Scenario**: WorkProcessEnforcer integration fails, no telemetry

**Impact**: Cannot monitor eval effectiveness

**Detection**:
- Check state/analytics/hybrid_evidence_telemetry.jsonl
- If empty for >24 hours → telemetry broken

**Handling**:
- Manual metrics collection: Document in verify/metrics_summary.md
- Fix integration: Debug WorkProcessEnforcer hooks
- Do NOT proceed to MONITOR phase without metrics

---

### Edge Case 9.2: Dashboard Stale (>7 days)

**Scenario**: Metrics dashboard not updated (state/analytics/hybrid_metrics.html)

**Impact**: Cannot see trends, blind to issues

**Detection**:
```bash
dashboard_age=$(stat -f %m state/analytics/hybrid_metrics.html)
now=$(date +%s)
age_days=$(( ($now - $dashboard_age) / 86400 ))
if [ $age_days -gt 7 ]; then
  echo "WARNING: Dashboard stale ($age_days days old)"
fi
```

**Handling**:
- Regenerate dashboard: bash scripts/collect_hybrid_metrics.sh
- Automate: Cron job (weekly dashboard refresh)
- Alert: Dashboard staleness >7 days

---

## Edge Case Summary Table

| Category | Edge Case | Severity | Handling |
|----------|-----------|----------|----------|
| Corpus | Empty corpus (<20 tasks) | CRITICAL | Fail fast, block VERIFY |
| Corpus | Malformed task schema | HIGH | Schema validation on load |
| Corpus | Too large (>100 tasks) | MEDIUM | Split core + extended |
| Baseline | Success rate <50% | CRITICAL | Pivot to prompt fixes |
| Baseline | High variance (CV >20%) | HIGH | Increase n, widen threshold |
| Baseline | API failure | MEDIUM | Retry with backoff |
| Runner | Timeout (>10 min) | HIGH | Parallel execution, quick mode |
| Runner | Empty LLM response | MEDIUM | Retry, mark ERROR |
| Runner | Crash mid-run | MEDIUM | Resume from checkpoint |
| Gate | False positive storm | CRITICAL | Emergency: switch to observe mode |
| Gate | Manual override abuse | HIGH | Log/review, retune threshold |
| Gate | False negative | MEDIUM | Tighten threshold, add tasks |
| Robustness | Garak not installed | HIGH | Preflight check, fallback |
| Robustness | Injection 0% (suspicious) | MEDIUM | Validate garak accuracy |
| Robustness | Injection >10% (critical) | CRITICAL | Block, fix prompts |
| CI | API rate limit | LOW | Retry, use artifact |
| CI | PR merged too early | HIGH | Branch protection required |
| CI | Workflow bypassed | MEDIUM | Post-merge monitoring |
| Integration | Compiler breaking change | HIGH | Recapture baseline, version |
| Integration | Persona/overlay missing | MEDIUM | Preflight, skip variant |
| Integration | Hash mismatch | HIGH | Alert, investigate, rebaseline |
| Performance | Latency spike (>30s) | MEDIUM | Timeout, caching |
| Performance | Cost spike (>$10) | LOW | Smaller model, caching |
| Monitoring | Metrics not collected | HIGH | Fix integration, manual fallback |
| Monitoring | Dashboard stale | LOW | Regenerate, automate |

---

## Next Steps

1. ✅ Edge cases documented (this file)
2. ⏳ Create pre_mortem.md (failure modes analysis)
3. ⏳ IMPLEMENT with edge cases in mind
4. ⏳ VERIFY: Test each edge case explicitly

---

**THINK Phase Status**: ⏳ IN PROGRESS (edge cases documented)
**Next**: Create pre_mortem.md
