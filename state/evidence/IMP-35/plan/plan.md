# PLAN: IMP-35 - Prompt Eval Harness + Gates

**Task ID**: IMP-35
**Date**: 2025-10-30
**Phase**: PLAN
**Estimated Total**: 16-20 hours

---

## Implementation Order

**Strategy**: Bottom-up (corpus → runner → gates → CI)

---

## Step 1: Golden Task Corpus Creation (3-4 hours)

**Files**:
- `tools/wvo_mcp/evals/prompts/golden/tasks.jsonl`
- `tools/wvo_mcp/evals/README.md`

**Tasks**:
1. Define task schema (prompt, phase, expected_criteria, pass_threshold)
2. Curate 20-30 representative tasks (≥3 per STRATEGIZE/SPEC/PLAN, ≥4 IMPLEMENT)
3. Write corpus README (format, adding tasks, maintenance)
4. Validate schema (all tasks parseable)

**Time**: 3-4 hours

---

## Step 2: Eval Runner Script (4-5 hours)

**Files**:
- `tools/wvo_mcp/scripts/run_prompt_evals.sh`
- `tools/wvo_mcp/src/evals/runner.ts`

**Tasks**:
1. CLI arg parsing (--mode, --baseline, --compare)
2. Load tasks from corpus
3. For each task: compile prompt (IMP-21) → run LLM → check criteria
4. Aggregate results (success rate, failures list)
5. Output JSON + exit code

**Time**: 4-5 hours

---

## Step 3: Baseline Capture (1-2 hours)

**Files**:
- `state/evidence/IMP-35/verify/prompt_eval_baseline.json`

**Tasks**:
1. Run eval suite n=5 times
2. Calculate mean + confidence intervals
3. Document baseline metrics
4. Commit baseline for future comparisons

**Time**: 1-2 hours

---

## Step 4: Garak Integration (2-3 hours)

**Files**:
- `tools/wvo_mcp/scripts/run_robustness_evals.sh`
- `state/evidence/IMP-35/verify/robustness_eval.json`

**Tasks**:
1. Install garak (`pip install garak`)
2. Select attack vectors (jailbreak, prompt leak, instruction override)
3. Run garak against compiled prompts
4. Parse results (injection success rate)

**Time**: 2-3 hours

---

## Step 5: VERIFY Phase Gate (3-4 hours)

**Files**:
- `tools/wvo_mcp/src/verify/validators/prompt_eval_gate.ts`
- Integration in `work_process_enforcer.ts`

**Tasks**:
1. Create PromptEvalGate class
2. Load baseline, run current evals
3. Compare (threshold logic: baseline - 5%)
4. Feature flag support (off/observe/enforce)
5. Manual override with justification
6. Tests for gate logic

**Time**: 3-4 hours

---

## Step 6: CI Integration (2-3 hours)

**Files**:
- `.github/workflows/prompt-evals.yml`

**Tasks**:
1. Workflow triggers (on prompt file changes)
2. Run full eval suite
3. Post results as PR comment
4. Block merge if enforce mode + failure

**Time**: 2-3 hours

---

## Step 7: Documentation (1-2 hours)

**Files**:
- `tools/wvo_mcp/evals/README.md`
- `docs/autopilot/PROMPT_EVAL_POLICY.md`

**Tasks**:
1. Corpus format + examples
2. Running evals (local + CI)
3. Interpreting results
4. Troubleshooting guide

**Time**: 1-2 hours

---

## Total: 16-22 hours

---

## Dependency Graph

```
Step 1 (Corpus) → Step 2, 3, 4
Step 2 (Runner) → Step 3, 5
Step 3 (Baseline) → Step 5
Step 4 (Garak) → Step 6
Step 5 (Gate) → Step 6
Step 6 (CI) → (final integration)
Step 7 (Docs) → (parallel with any)
```

---

## Risks

### Risk: Corpus curation takes longer
**Mitigation**: Start with 10 tasks, expand to 20 iteratively

### Risk: Garak integration issues
**Mitigation**: Fallback to manual injection tests if garak fails

### Risk: CI flakiness
**Mitigation**: Cache responses, retry logic

---

**PLAN Status**: ✅ COMPLETE
**Next**: THINK phase
