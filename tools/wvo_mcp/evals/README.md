# Prompt Evaluation System

**Status**: Active (IMP-35)
**Owner**: Autopilot Infrastructure
**Last Updated**: 2025-10-30

---

## Overview

This directory contains the prompt evaluation harness - an automated system to measure and enforce prompt quality across the 9-phase work process (STRATEGIZE → SPEC → PLAN → THINK → IMPLEMENT → VERIFY → REVIEW → PR → MONITOR).

**Purpose**:
- **Regression prevention**: Block PRs that degrade prompt quality >5%
- **Improvement validation**: Prove overlays/personas increase success rate
- **Security assurance**: Detect prompt injection vulnerabilities
- **Continuous monitoring**: Track quality trends over time

---

## Directory Structure

```
evals/
├── README.md (this file)
├── prompts/
│   └── golden/
│       └── tasks.jsonl         # Golden task corpus (30 tasks)
├── scripts/
│   ├── run_prompt_evals.sh     # Main eval runner
│   ├── run_robustness_evals.sh # Garak integration
│   └── validate_corpus.ts      # Schema validator
└── results/
    ├── baseline/
    │   └── prompt_eval_baseline.json  # Current baseline
    └── runs/
        └── YYYY-MM-DD-HH-MM-SS.json   # Historical runs
```

---

## Golden Task Corpus

**Location**: `prompts/golden/tasks.jsonl`

**Current Stats**:
- Total tasks: 30
- Phase coverage:
  - STRATEGIZE: 4 tasks
  - SPEC: 4 tasks
  - PLAN: 4 tasks
  - THINK: 2 tasks
  - IMPLEMENT: 4 tasks
  - VERIFY: 2 tasks
  - REVIEW: 2 tasks
  - PR: 2 tasks
  - MONITOR: 2 tasks
  - (+ 2 integration tasks, 1 edge case task)

### Task Schema

Each task is a JSON object with these fields:

```typescript
interface GoldenTask {
  id: string;                        // Unique ID (e.g., "STRATEGIZE-001")
  phase: string;                     // Work process phase
  prompt: string;                    // Instruction prompt for LLM
  expected_output_criteria: string[]; // Array of criteria (output must meet N of them)
  pass_threshold: number;            // Min criteria to meet (e.g., 3 out of 4)
  complexity: "low" | "medium" | "high"; // Task complexity
  reasoning_required: boolean;       // Does task need reasoning (vs pattern matching)?
}
```

**Example Task**:
```json
{
  "id": "STRATEGIZE-001",
  "phase": "strategize",
  "prompt": "You are in the STRATEGIZE phase for a task to add caching to API responses. Reframe the problem: What is the deeper problem we're solving? Consider: 1) Why do we need caching? 2) What alternatives exist? 3) What are the kill criteria?",
  "expected_output_criteria": [
    "Identifies root cause (latency? cost? load?)",
    "Lists 3+ alternatives (caching, CDN, query optimization, etc.)",
    "Defines explicit kill criteria (if X metric doesn't improve by Y%)",
    "Questions the problem statement (is caching the right solution?)"
  ],
  "pass_threshold": 3,
  "complexity": "medium",
  "reasoning_required": true
}
```

**Task succeeds if**: LLM output meets ≥3 out of 4 criteria

---

## Authentication

**IMPORTANT: This project uses monthly subscriptions, NOT API keys**

- **Claude**: Monthly subscription via Claude Code CLI
- **Codex**: Monthly subscription via OpenAI/GitHub Codex
- **Credentials**: Stored in unified autopilot system (no API key exports needed)

**DO NOT** set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` environment variables.
The eval scripts will use the autopilot's stored subscription logins automatically.

**Full Details**: See [../../docs/AUTHENTICATION.md](../../docs/AUTHENTICATION.md) for complete authentication documentation, troubleshooting, and token management.

---

## Running Evaluations

### Quick Mode (Pre-Commit, ~2 min)

```bash
bash scripts/run_prompt_evals.sh --mode quick
```

- Runs 5 representative tasks (sampled from corpus)
- Use for local development
- Exit code 0 = pass, non-zero = fail

### Full Mode (PR CI, ~10 min)

```bash
bash scripts/run_prompt_evals.sh --mode full
```

- Runs all 30 tasks
- Use for PR gating
- Parallel execution (10 concurrent tasks)
- Exit code 0 = pass, non-zero = fail

### Baseline Capture

```bash
bash scripts/run_prompt_evals.sh --mode full --baseline --runs 5
```

- Runs full suite 5 times (statistical confidence)
- Calculates mean + confidence intervals
- Saves to `results/baseline/prompt_eval_baseline.json`
- Use after major prompt changes or quarterly

### Comparison Mode

```bash
bash scripts/run_prompt_evals.sh --mode full --compare results/baseline/prompt_eval_baseline.json
```

- Compares current run vs. baseline
- Reports: success_rate_diff, degraded_tasks, improved_tasks
- Exit code non-zero if degradation >5% (AC5 threshold)

### Robustness Testing (Garak)

```bash
bash scripts/run_robustness_evals.sh
```

- Runs prompt injection attack corpus
- Uses garak library (10+ attack vectors)
- Target: injection_success_rate ≤1% (AC2)
- Results: `results/robustness/YYYY-MM-DD.json`

---

## Interpreting Results

### Output Format

```json
{
  "run_id": "2025-10-30-14-30-00",
  "mode": "full",
  "model": "claude-sonnet-4-5",
  "total_tasks": 30,
  "passed": 25,
  "failed": 5,
  "success_rate": 83.3,
  "p95_latency_ms": 4500,
  "total_tokens": 125000,
  "cost_usd": 1.88,
  "failed_tasks": [
    {
      "id": "STRATEGIZE-002",
      "phase": "strategize",
      "criteria_met": 2,
      "criteria_required": 3,
      "missing": ["Identifies architectural issue", "Considers do-nothing alternative"]
    }
  ]
}
```

### Success Criteria

**Per-Task**: Task passes if `criteria_met >= pass_threshold`

**Overall**: Run passes if `success_rate >= baseline - 5%`

**Example**:
- Baseline: 75% success rate
- Current run: 72% success rate
- Difference: -3% (within tolerance, PASS)
- If current: 68% (-7%), would FAIL (blocks PR)

### Failure Analysis

When evals fail, check:

1. **Which tasks failed?** (see `failed_tasks` array)
2. **Which criteria were missed?** (see `missing` field)
3. **Is it a real regression?** (compare output to baseline manually)
4. **Or is corpus wrong?** (criteria too strict? task ambiguous?)

**Common False Positives**:
- Criteria too vague ("good reasoning" - what does that mean?)
- Multiple valid approaches (task has >1 correct answer)
- Prompt wording changed but semantics same

**Fix**: Update task criteria or remove task from corpus

---

## Adding New Tasks

### When to Add

**Add a task when**:
1. Production incident revealed gap (eval should have caught this)
2. New phase or task type emerges (corpus needs coverage)
3. False negative (eval passed, but output was actually bad)
4. Quarterly review identifies under-represented work

**Don't add for**:
- Edge cases already covered by similar tasks
- One-off incidents unlikely to recur
- Tasks not representative of normal work

### How to Add

1. **Create task object** (follow schema above)
2. **Write clear criteria** (specific, measurable, no ambiguity)
3. **Set pass_threshold** (N criteria must pass, typically 3-4)
4. **Test locally** (run task 5 times, verify criteria are fair)
5. **Add to corpus**: Append to `tasks.jsonl`
6. **Validate schema**: `npx tsx scripts/validate_corpus.ts`
7. **Recapture baseline**: New task may shift overall success rate

**Example Addition**:

```bash
# 1. Append new task to corpus
cat >> prompts/golden/tasks.jsonl << 'EOF'
{"id": "IMPLEMENT-005", "phase": "implement", "prompt": "...", "expected_output_criteria": [...], "pass_threshold": 3, "complexity": "high", "reasoning_required": false}
EOF

# 2. Validate schema
npx tsx scripts/validate_corpus.ts

# 3. Test new task
bash scripts/run_prompt_evals.sh --mode full --filter "IMPLEMENT-005"

# 4. Recapture baseline (if satisfied)
bash scripts/run_prompt_evals.sh --mode full --baseline --runs 5
```

---

## Corpus Maintenance

### Quarterly Review (Every 3 Months)

**Goal**: Keep corpus representative of real work

**Process**:
1. **Distribution analysis**: Compare corpus vs. last 90 days of real tasks
   - Pull phase distribution from `state/evidence/*/` directories
   - Compare to corpus phase distribution
   - If mismatch >10% → add/remove tasks
2. **Coverage gaps**: Which task types are missing?
   - Multi-file refactoring?
   - Cross-package integration?
   - Performance optimization?
3. **Obsolete tasks**: Remove tasks that no longer apply
   - Technology changed (deprecated APIs)
   - Process changed (new work process phases)
4. **Incident-driven additions**: Add tasks from P0 incidents
   - Did any P0 bugs slip through? (eval should have caught)
5. **Recapture baseline**: After changes, update baseline

**Document changes**: Update this README with version history

### Corpus Evolution Log

**v1.0** (2025-10-30): Initial corpus
- 30 tasks covering 9 phases
- Emphasis on STRATEGIZE/SPEC/PLAN (reasoning phases)
- Includes integration and edge case tasks

**v1.1** (TBD): After first quarterly review
- (Will document additions/removals here)

---

## Integration with Work Process

### VERIFY Phase Gate (AC5)

**Location**: `tools/wvo_mcp/src/verify/validators/prompt_eval_gate.ts`

**Feature Flag**: `gate.prompt_evals` (off/observe/enforce)

**Modes**:
1. **off**: Gate disabled, evals don't run
2. **observe** (default weeks 1-4): Evals run, log warnings, don't block
3. **enforce** (after baseline established): Block if success_rate < baseline - 5%

**Manual Override**:
```bash
# Override gate (requires justification)
export PROMPT_EVAL_OVERRIDE="Justified: overlays change prompt structure, will recapture baseline"
bash scripts/run_prompt_evals.sh --mode full
```

**Override logged to**: `state/analytics/eval_overrides.jsonl`

### CI Integration (AC6)

**Workflow**: `.github/workflows/prompt-evals.yml`

**Triggers**:
- On PR: Changes to `tools/wvo_mcp/src/prompt/**`
- Nightly: Full suite + robustness tests

**Actions**:
1. Run full eval suite (30 tasks)
2. Compare vs. baseline
3. Post results as PR comment
4. Block merge if enforce mode + degradation >5%

**Example PR Comment**:
```markdown
## Prompt Evaluation Results

**Run ID**: 2025-10-30-14-30-00
**Model**: claude-sonnet-4-5
**Success Rate**: 78% (baseline: 75%, +3% ✅)

### Summary
- ✅ Passed: 23/30 tasks
- ❌ Failed: 7/30 tasks
- ⚡ Performance: p95 latency 4.2s (<10s target)
- 💰 Cost: $1.88 per run

### Failed Tasks
- STRATEGIZE-002: Missing "architectural issue" criterion
- SPEC-004: Query plan requirements not specified

[View full results](link-to-artifact)
```

---

## Model Selection

**Default**: `claude-sonnet-4-5` (reasoning tasks, high accuracy)

**Alternative**: `claude-haiku-4-5` (simple tasks, 19x cheaper)

**Recommendation**:
- **Baseline capture**: Use Sonnet (accuracy critical)
- **Quick mode**: Try Haiku (if ≥95% agreement with Sonnet)
- **Full mode**: Mixed approach (Haiku for simple tasks, Sonnet for complex)

**Cost Comparison**:
- Sonnet: ~$0.015/1k tokens (~$2 per full run)
- Haiku: ~$0.0008/1k tokens (~$0.10 per full run)

**To test Haiku**:
```bash
# Run with Haiku
bash scripts/run_prompt_evals.sh --mode full --model haiku

# Compare Haiku vs Sonnet
bash scripts/compare_models.sh --baseline sonnet --test haiku
```

---

## Troubleshooting

### Issue: Eval Suite Takes >10 Minutes

**Symptoms**: CI timeout, developers bypass

**Diagnosis**:
```bash
# Check per-task latency
jq '.tasks[] | {id, latency_ms}' results/runs/latest.json | sort -k2 -n
```

**Fixes**:
1. **Parallel execution**: Already enabled (10 concurrent tasks)
2. **Response caching**: Implement in Phase 2 (cache LLM responses)
3. **Model optimization**: Use Haiku for simple tasks
4. **Corpus pruning**: Remove redundant tasks (cap at 30)

---

### Issue: High False Positive Rate (>10%)

**Symptoms**: Evals block many good PRs, developers override frequently

**Diagnosis**:
```bash
# Check which tasks cause most failures
jq '.failed_tasks[] | .id' results/runs/*.json | sort | uniq -c | sort -rn
```

**Fixes**:
1. **Review failing tasks**: Are criteria too strict? Ambiguous?
2. **Widen threshold**: warn at -10%, block at -15% (instead of -5%, -10%)
3. **Increase baseline runs**: n=10 instead of n=5 (reduce noise)
4. **Remove flaky tasks**: If task causes >50% false positives, remove

---

### Issue: Eval-Production Drift

**Symptoms**: Evals pass, but production quality degrades

**Diagnosis**:
```bash
# Check attestation hashes
jq '{eval_hash, prod_hash}' state/analytics/eval_prod_discrepancy.jsonl
```

**Fixes**:
1. **Attestation enforcement**: Fail eval if hash mismatch (IMP-24 integration)
2. **Nightly E2E tests**: Run real production tasks, compare outputs
3. **Corpus update**: Add tasks from production incidents
4. **Smoke test**: Verify compiler.compile() == production.getPrompt() before eval

---

### Issue: Corpus Becomes Stale

**Symptoms**: Evals pass consistently, but miss new issue types

**Diagnosis**:
```bash
# Compare corpus vs recent tasks
ls state/evidence/*/strategize/strategy.md | wc -l  # Real STRATEGIZE tasks
jq 'select(.phase == "strategize")' prompts/golden/tasks.jsonl | wc -l  # Corpus STRATEGIZE tasks
```

**Fixes**:
1. **Quarterly review**: Add tasks from last 90 days
2. **Incident-driven**: Add tasks from P0 bugs
3. **Distribution matching**: Ensure corpus matches real work distribution
4. **Recapture baseline**: After corpus changes

---

## Metrics & Monitoring

**Dashboard**: `state/analytics/hybrid_metrics.html`

**Key Metrics**:
1. **Success rate trend**: Should stay ≥baseline (75%+)
2. **False positive rate**: Should be <5% (blocked good PRs)
3. **False negative rate**: Should be <5% (missed bad changes)
4. **Eval runtime**: p95 <10 min (CI not bottleneck)
5. **Cost per run**: <$10 (sustainable budget)
6. **Override rate**: <10% (gate is trusted)

**Alerts**:
- Success rate <baseline - 5% for 2 consecutive weeks → investigate
- False positive rate >10% for 1 week → widen threshold or fix corpus
- Override rate >30% for 1 week → gate losing trust, review
- Cost per run >$10 for 1 week → optimize (Haiku, caching)

---

## References

- **IMP-35 Evidence**: `state/evidence/IMP-35/`
- **Spec (AC1-10)**: `state/evidence/IMP-35/spec/spec.md`
- **Plan (7 steps)**: `state/evidence/IMP-35/plan/plan.md`
- **Pre-Mortem**: `state/evidence/IMP-35/think/pre_mortem.md`
- **Garak Library**: https://github.com/leondz/garak

---

## FAQ

**Q: Why 30 tasks? Can we add more?**
A: 30 is balanced (coverage vs runtime). More tasks → longer runs → CI bottleneck. Cap at 40 tasks, prune lowest-value tasks.

**Q: Can I skip evals for urgent hotfix?**
A: Use manual override with justification: `export PROMPT_EVAL_OVERRIDE="Hotfix: production down, will validate post-deploy"`

**Q: Why is baseline only 75%? Shouldn't it be higher?**
A: 75% is realistic. Tasks are challenging (reasoning, design, edge cases). 100% would mean corpus is too easy (not catching real issues).

**Q: Can I test my prompt changes before pushing?**
A: Yes! Run locally: `bash scripts/run_prompt_evals.sh --mode quick` (2 min, 5 tasks)

**Q: How often should I recapture baseline?**
A: Quarterly, or after major prompt changes (new overlays, personas, compiler version)

---

**Status**: ✅ Corpus ready (30 tasks)
**Next**: Implement eval runner (Step 2)
