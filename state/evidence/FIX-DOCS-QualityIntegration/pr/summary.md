# PR — FIX-DOCS-QualityIntegration

## Documentation Updates
- **CLAUDE.md** — rewrote quality integration guidance with autonomy framing, Phase 0 instrumentation workflow, baseline SLO, and cross-links to troubleshooting + instrumentation contract.
- **tools/wvo_mcp/README.md** — added Phase 0 baseline command table, override escalation reminders, and parity/capability cadence alignment.
- **docs/autopilot/WORK_PROCESS.md** — expanded “Quality Integration” to include instrumentation requirements, baseline freshness expectations, and enhanced troubleshooting references.
- **QUALITY_INTEGRATION_TROUBLESHOOTING.md** — added quick-status checks for baseline/attestation, failure playbooks for stale baselines and lingering overrides, and explicit links to Phase 0 documentation.

## Verification
- `node tools/wvo_mcp/scripts/check_work_process_artifacts.mjs --task FIX-DOCS-QualityIntegration`
- `node --import tsx tools/wvo_mcp/scripts/check_risk_oracle_coverage.ts --task FIX-DOCS-QualityIntegration --output state/evidence/FIX-DOCS-QualityIntegration/verify/oracle_coverage.json`
- `rg 'collect_phase0_baseline' ...` / `rg 'baseline_attestation' ...` confirming instrumentation references across docs.
