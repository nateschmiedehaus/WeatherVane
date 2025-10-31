# Implementation Notes

## Code Updates
- `tools/wvo_mcp/src/orchestrator/orchestrator_loop.ts`: initialize `MetricsCollector` early so WorkProcessEnforcer receives telemetry context, enabling quality integrations when overrides are active.
- `tools/wvo_mcp/src/orchestrator/orchestrator_runtime.ts`: load persisted quality-integration overrides, construct `WorkProcessEnforcer` with metrics + override config, and expose a getter used by tests.
- `tools/wvo_mcp/src/scripts/quality_checks_dashboard.ts`: add `--status` flag that prints a summary of success rates/recommendations after writing the dashboard file.
- `docs/autopilot/WORK_PROCESS.md`: reference the rollback playbook in the Quality Integration section.
- `docs/autopilot/QUALITY_INTEGRATION_ROLLBACK.md`: fix CLI paths to use `src/scripts/` so operators can execute the TS entrypoints without build artifacts.

## Tests
- Added `tools/wvo_mcp/src/orchestrator/__tests__/orchestrator_runtime_quality_integration.test.ts` to assert overrides enable quality checks when configured and disable them when the override file requests it.
