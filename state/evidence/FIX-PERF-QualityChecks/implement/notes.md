## Implementation Notes (Rev 2)

- Added a TypeScript preflight CLI at `tools/wvo_mcp/src/scripts/preflight.ts` with change-aware scope detection, command planning, analytics emission, and JSON reporting. The legacy `scripts/preflight_check.sh` now delegates to this CLI.
- Scoped preflight now selects Python lint, web lint/typecheck, and an Autopilot vitest smoke based on git diff buckets. Python lint runs with `ruff --exit-zero` so we record findings without blocking; web/tests execute only when relevant.
- Benchmarks regenerated via `benchmark_quality_checks.ts` for preflight (`state/evidence/FIX-PERF-QualityChecks/verify/preflight_benchmark.{json,md}`) and quality gates/reasoning (`verify/quality_reasoning_benchmark.{json,md}`) with the optimized runner.
- Updated unit/integration coverage: new CLI helper tests at `tools/wvo_mcp/src/scripts/__tests__/preflight.test.ts` and runtime integration in `orchestrator_runtime_quality_integration.test.ts` to ensure overrides flow into WorkProcessEnforcer.
- Documentation refresh: WORK_PROCESS, QUALITY_INTEGRATION_TROUBLESHOOTING, and CLAUDE.md now reference the new CLI (`--status` / `--full` usage) and scoped behaviour.
