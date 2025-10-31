## Spec: Guardrail Monitoring Checks

### Required checks
- Verify CI guardrail steps completed successfully in the latest runs (loader guard, structural policy, risk-oracle, PR metadata, review audit).
- Confirm integrity harness produced fresh outputs (e.g., `state/evidence/AT-GUARD-ZERO-BACKLOG/verify/results.md` logs, `state/automation/*.json`).
- Run `npm run validate:roadmap-evidence -- --json` to ensure evidence backfill remains current.
- Run `node tools/wvo_mcp/scripts/check_work_process_artifacts.mjs --task AT-GUARD-TS-LOADER-GATE`, `AT-GUARD-ZERO-BACKLOG`, `META-GUARD-SELF-CORRECT`, `AT-GUARD-PR` to confirm guardrail tasks retain STRATEGIZE→MONITOR evidence.

### Deliverables
- Monitoring log in `monitor/monitor.md` summarizing observations, metrics, and any discrepancies.
- Verification results recorded in `verify/results.md` (commands, outputs).
- Review notes referencing guardrail health and any required follow-ups.

### Out of scope
- Modifying guardrail implementations; monitoring only.
- Handling unrelated documentation drift (tracked separately under other tasks).
