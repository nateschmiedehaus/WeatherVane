# Plan

1. **Context Refresh**
   - Review run_integrity_tests.sh stages and required env.
   - Capture current enforcement telemetry expectations (metrics file locations).
2. **Dry Preconditions**
   - Ensure wheel cache/toolchain accessible (skip if already cached), verify disk space.
   - Decide storage paths in evidence directory for logs.
3. **Execute Integrity Script**
   - Run `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` with `tee` into `state/evidence/AT-GUARD-VERIFY/verify/integrity_tests.log`.
   - Monitor for failures in real time; if a stage fails, pause to triage.
4. **Triage & Remediation**
   - For any failing stage, inspect logs/artifacts; attempt fixes if feasible within scope.
   - If unfixable, document clearly and create follow-up per governance.
5. **Evidence Packaging**
   - Collect generated reports (risk oracle, structural policy, telemetry dashboard, etc.) into evidence folder.
   - Summarise results in verification + review docs and note telemetry observations.
6. **Wrap-up**
   - Update roadmap status if criteria met; outline follow-ups; prepare review/monitor notes.
