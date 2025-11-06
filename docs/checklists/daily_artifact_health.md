# Daily Artifact Health Checklist

> **Cadence:** Run at least once every 24 hours (preferably at shift start and before hand-off).

1. `git status --short` shows no untracked files.  
   - If untracked items exist: classify → either commit or add to approved ignore with justification.
2. `node tools/wvo_mcp/scripts/rotate_overrides.mjs --dry-run`  
   - Verify result reports `status: rotated` or `status: noop`.  
   - If rotation is needed, rerun without `--dry-run` and commit the updated ledger/archive.
3. Confirm latest override archive exists under `state/analytics/override_history/` for the current day.  
   - Missing archive after rotation → rerun script and inspect permissions.
4. Scan `state/evidence/` for new AFP tasks created since last audit; ensure each has STRATEGIZE→PLAN artifacts staged.  
   - If any are missing, block IMPLEMENT work until lifecycle artifacts are in place.
5. Run spec/plan reviewers for tasks approaching the gate (after THINK phase):  
   ```bash
   cd tools/wvo_mcp
   npm run spec:review -- <TASK-ID>
   npm run plan:review -- <TASK-ID>
   ```
   - Verify corresponding approvals appear in `state/analytics/spec_reviews.jsonl` and `state/analytics/plan_reviews.jsonl`.
5. Document results in `state/evidence/AFP-ARTIFACT-AUDIT-YYYY-MM-DD/summary.md` using the daily template (include commands run + outcomes).
6. Run `node tools/wvo_mcp/scripts/check_guardrails.mjs` (or inspect CI results) to confirm guardrails passing; address failures immediately.
7. Push the audit evidence and notify ProcessCritic owner if any remediation is required.

**Escalation:** If rotation fails or the repository still shows untracked items after remediation, open a follow-up task immediately and tag the Autopilot Council. Do not proceed to IMPLEMENT on unrelated work until the audit passes.
