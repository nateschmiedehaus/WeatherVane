# Plan — FIX-ROLLBACK-QualityIntegration

## Milestones
1. **Discovery & design (0.25h)**
   - Inspect existing WorkProcessEnforcer + runtime config paths.
   - Design override schema (`state/config/quality_integration.json`) and CLI behaviour.
2. **Config loader + runtime wiring (0.5h)**
   - Implement `quality_integration_config.ts` utilities (load/save/merge defaults).
   - Update `OrchestratorRuntime` (and unified orchestrator) to load overrides and pass `qualityChecks` config to WorkProcessEnforcer.
3. **CLI + monitoring tooling (0.5h)**
   - Add `quality_integration_toggle.ts` CLI with `--disable/--enable` commands.
   - Add `quality_checks_dashboard.ts` generator summarising success rates and threshold logic.
4. **Testing & verification (0.5h)**
   - Write unit tests covering config load/save + CLI operations + dashboard.
   - Run benchmark CLI quickly to capture before/after demonstration (optional sanity check).
   - Execute required project checks (build, targeted tests, determinism, perf).
5. **Documentation & evidence (0.25h)**
   - Author `docs/autopilot/QUALITY_INTEGRATION_ROLLBACK.md` (triggers, commands, re-enable).
   - Update relevant sections in WORK_PROCESS doc if necessary.
   - Capture VERIFY results (CLI outputs, dashboard JSON) and update review/pr/monitor notes.

## Task Breakdown
- Implement config helper + tests.
- Modify runtime constructors.
- Create CLI script + tests.
- Create dashboard generator + tests.
- Document process + update docs.
- Execute verification suite (build, vitest subset, determinism, performance).

## Oracles / Checks
- `npm run build --prefix tools/wvo_mcp`
- `npm --prefix tools/wvo_mcp run test -- quality/quality_integration_config.test.ts` (new) and relevant existing suites.
- `node tools/wvo_mcp/scripts/quality_integration_toggle.ts --status` (if provided) / manual inspection to confirm toggles.
- `node tools/wvo_mcp/scripts/quality_checks_dashboard.ts --output ...`
- `node tools/wvo_mcp/scripts/check_performance_regressions.ts`
- `node tools/wvo_mcp/scripts/check_determinism.ts --task FIX-ROLLBACK-QualityIntegration`
- `node tools/wvo_mcp/scripts/check_work_process_artifacts.mjs --task FIX-ROLLBACK-QualityIntegration`
