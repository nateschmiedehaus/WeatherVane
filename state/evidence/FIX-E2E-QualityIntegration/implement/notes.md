# IMPLEMENT — Notes

- Added `tools/wvo_mcp/src/orchestrator/__tests__/quality_integration_e2e.test.ts`, which spins up a real `WorkProcessEnforcer` + `WorkProcessQualityIntegration` inside a temporary workspace and drives full STRATEGIZE→MONITOR transitions.
- Stubbed deterministic shell scripts for the three quality check entry points (preflight, quality gates, reasoning) so the harness can flip between pass/fail/timeout scenarios without external dependencies.
- Updated test harness to replace evidence collector + phase validation hooks with spies so quality integration behaviour is isolated without requiring real builds/tests/coverage; ensures phase advances stay focused on quality signals.
- Normalised TypeScript imports (drop `.ts` suffix) and removed `allowImportingTsExtensions` to make `npm --prefix tools/wvo_mcp run build` pass under strict NodeNext resolution.
- Exercised both shadow and enforce modes; enforce failures assert that transitions are blocked and `recordProcessRejection` telemetry is written, while shadow mode ensures failures only warn.
- Covered fail-safe behaviour by asserting timeouts/invalid JSON only warn when `failSafe=true`, and that telemetry JSONL artifacts are created with the expected task metadata.
