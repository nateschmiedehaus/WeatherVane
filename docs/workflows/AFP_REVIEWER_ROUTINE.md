# AFP Reviewer & Wave 0 How-To

Standard procedure for running the spec/plan reviewers and validating Wave 0 autopilot tasks under AFP/SCAS guardrails.

## Purpose

- Guarantee every task that reaches the gate has strategy/spec/plan/think artifacts plus reviewer approvals.
- Keep reviewer output discoverable via standard log files.
- Ensure Wave 0 runs only after reviewers pass so blocked tasks map back to concrete test failures.

## Command Flow

1. **Set task context**
   ```bash
   export TASK_ID=AFP-EXAMPLE-123
   ```
   - Task evidence lives in `state/evidence/$TASK_ID/`.
   - `strategy.md`, `spec.md`, `plan.md`, and `think.md` must exist before the reviewers will pass.

2. **Run reviewers (strategy/spec/plan/think)**
   ```bash
   cd tools/wvo_mcp
   npm run strategy:review -- $TASK_ID
   npm run think:review -- $TASK_ID
   npm run spec:review -- $TASK_ID
   npm run plan:review -- $TASK_ID
   cd ../..
   ```
   - All four commands are required before attempting DESIGN/IMPLEMENT.
   - Reviewer JSONL logs:
     - `state/analytics/strategy_reviews.jsonl`
     - `state/analytics/thinking_reviews.jsonl`
     - `state/analytics/spec_reviews.jsonl`
     - `state/analytics/plan_reviews.jsonl`
   - Copy/paste reviewer verdict excerpts into `state/evidence/$TASK_ID/phases.md` for traceability.

3. **Record daily artifact audit**
   - Follow `docs/checklists/daily_artifact_health.md`.
   - `state/evidence/AFP-ARTIFACT-AUDIT-YYYY-MM-DD/summary.md` must mention the reviewer runs.

## Execution Tagging

Every task must declare whether it was executed manually or by Wave 0.

- Manual agents: `node tools/wvo_mcp/scripts/set_execution_mode.mjs <TASK-ID> manual --source reviewer-routine`
  - Run immediately after REVIEW (before VERIFY starts) so ProcessCritic sees the metadata.
  - Re-run with `autopilot` only if Wave 0 actually finished the task.
- Wave 0 autopilot tags itself automatically; confirm `state/evidence/<TASK-ID>/metadata.json` exists before closing the task.

## Wave 0 Autopilot Execution

Wave 0 should only be exercised after reviewers pass and evidence is staged.

```bash
cd tools/wvo_mcp
npm run wave0 -- --once --epic=WAVE-0
cd ../..
```

- Logs land in `state/analytics/wave0_runs.jsonl`.
- Capture the current runner snapshot with `./wave0_status --json` and attach the output to `verify.md` or the task evidence bundle.
- Each task run emits or updates `state/evidence/<TASK-ID>/` with proof artifacts.
- If ProofSystem reports test failures, create/append the remediation entry under `state/evidence/AFP-MODULE-REMEDIATION-20251105/followups.md` and open a new subtask (suffixes Q/R/S/etc).

## Troubleshooting

- **Missing plan/spec**: create from templates under `docs/templates/` before re-running reviewers.
- **Reviewer concerns**: address the comment inline, update evidence, re-run the same command until approval logged.
- **Wave 0 lock stuck**: remove `state/wave0.lock` only after confirming no runner is active (`ps aux | grep wave0`).
- **Need status at a glance?** Run `./wave0_status` (or `--json` for structured output) to see lock/PID health plus the last few executions.
- **Test failures during Wave 0**: run `npm run test --prefix tools/wvo_mcp` locally, capture failing suites, and update the remediation tracker.

## References

- Daily checklist: `docs/checklists/daily_artifact_health.md`
- AFP lifecycle guide: `docs/agent_library/common/processes/task_lifecycle.md`
- Guardrail monitor: `node tools/wvo_mcp/scripts/check_guardrails.mjs`
