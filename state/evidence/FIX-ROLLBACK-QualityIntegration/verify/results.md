# Verification Results

## Build & Tests
- `npm --prefix tools/wvo_mcp run build` ✔️
- `npm --prefix tools/wvo_mcp run test -- orchestrator/__tests__/orchestrator_runtime_quality_integration.test.ts utils/__tests__/quality_integration_config.test.ts scripts/__tests__/quality_integration_toggle.test.ts scripts/__tests__/quality_checks_dashboard.test.ts` ✔️ (summary in `state/evidence/FIX-ROLLBACK-QualityIntegration/verify/test_results.json`).
- `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` ✔️ (completed end-to-end integrity harness; console log retained in session transcript).

## Quality & Policy Checks
- `node --import tsx tools/wvo_mcp/src/scripts/quality_checks_dashboard.ts --status` ✔️ → `state/analytics/quality_checks_dashboard.json` with `insufficient_data` status (no recent guardrail runs yet).
- `node --import tsx tools/wvo_mcp/src/scripts/quality_integration_toggle.ts --status` ✔️ (current state: enabled, no override file).
- `node tools/wvo_mcp/scripts/check_performance_regressions.ts` ✔️
- `node tools/wvo_mcp/scripts/check_determinism.ts --task FIX-ROLLBACK-QualityIntegration --output state/evidence/FIX-ROLLBACK-QualityIntegration/verify/determinism_check.json` ✔️
- `node --import tsx tools/wvo_mcp/scripts/check_structural_policy.ts --task FIX-ROLLBACK-QualityIntegration --output state/evidence/FIX-ROLLBACK-QualityIntegration/verify/structural_policy_report.json` ✔️
- `node --import tsx tools/wvo_mcp/scripts/check_risk_oracle_coverage.ts --task FIX-ROLLBACK-QualityIntegration --output state/evidence/FIX-ROLLBACK-QualityIntegration/verify/oracle_coverage.json` ✔️
- `node --import tsx tools/wvo_mcp/scripts/check_delta_notes.ts` ✔️ (no unresolved notes)
- `node --import tsx tools/wvo_mcp/scripts/classify_follow_ups.ts --enforce` ✔️ (no follow-up gaps)

## Roadmap Evidence Audit
- `npm --prefix tools/wvo_mcp run validate:roadmap-evidence -- --json > state/evidence/FIX-ROLLBACK-QualityIntegration/verify/roadmap_evidence_report.json` ⚠️ — fails due to existing backlog of tasks lacking evidence metadata (2,592 errors logged). No regressions introduced by this change; backlog remains from prior roadmap state.
