# Specification — FIX-ROLLBACK-QualityIntegration

## Objective
Provide an auditable rollback mechanism for the quality integration guardrails, including automation, monitoring, and documentation so operators can disable, observe, and safely re-enable the checks.

## Acceptance Criteria
1. **Rollback automation**: a CLI script (checked in under `tools/wvo_mcp/scripts`) that toggles the quality integration configuration. Running with `--disable` must persist state that prevents WorkProcessEnforcer from executing quality gates; `--enable` restores the default configuration.
2. **Runtime wiring**: OrchestratorRuntime must consume the persisted override and pass it to WorkProcessEnforcer. On disable, quality integration is skipped; on enable, the current defaults (shadow/enforce) are applied.
3. **Monitoring dashboard**: a script generates `state/analytics/quality_checks_dashboard.json` summarising pass/fail counts and success rate for preflight, quality gates, and reasoning. When success rate <85%, the dashboard marks a rollback recommendation.
4. **Tests**: unit coverage proving the config loader honours enable/disable, the dashboard handles missing data gracefully, and toggling the CLI flips config as expected.
5. **Documentation**:
   - Rollback triggers (success rate <85%, sustained failures, manual override requests).
   - Step-by-step rollback procedure (command, verification, telemetry to check).
   - Re-enable procedure after fixes, including post-rollback validation.
6. **Evidence**: VERIFY artifacts include the dashboard output, CLI demonstration (before/after), updated docs, and passing tests.

## Out of Scope
- Changing the content of the quality-check scripts themselves.
- Auto-triggering rollback within the orchestrator (manual operator action remains required).
- Advanced incident management / paging workflows.
