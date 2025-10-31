# Plan — FIX-PERF-QualityChecks (Rev 2)

## Milestones & Timeboxes
1. **Discovery & CLI scaffolding (0.4 h)**
   - Audit current `PreflightRunner` capabilities and identify missing pieces (scope detection, reporting).
   - Build ts-node CLI wrapper with argument parsing, JSON output, and exit code propagation.
2. **Scope detection engine (0.6 h)**
   - Implement git diff/status inspector (`GitChangeClassifier`) with buckets and heuristics for filtering noisy paths (screenshots, binaries).
   - Unit tests covering: no diff ⇒ skip, targeted diff ⇒ run subset, override via `--full` ⇒ legacy path.
3. **Command tuning & integration (0.6 h)**
   - Define command presets per bucket (ruff exit-zero, Next lint/typecheck, vitest smoke).
   - Add `--full` flag/environment override.
   - Update WorkProcessQualityIntegration config + caching key signature; convert shell script to delegate to CLI.
4. **Benchmark & timeout tuning (0.3 h)**
   - Run benchmark harness before/after change (clean + cached).
   - Update timeouts, metrics tags, and evidence (`verify/*.json|md`).
5. **Documentation & verification (0.3 h)**
   - Update docs (WORK_PROCESS, QUALITY_INTEGRATION_TROUBLESHOOTING, CLAUDE.md).
   - Execute verification suite (build, targeted tests, determinism, structural policy, risk-oracle, performance regression, delta notes, follow-up classifier).

## Task Breakdown
- Create CLI module + reporting utilities.
- Build git change classifier + tests.
- Define command registry with bucket mapping + manual override story.
- Update WorkProcessQualityIntegration defaults + cache keys + tests.
- Rewrite shell script to call CLI.
- Refresh benchmark evidence + adjust timeout config.
- Update docs & roadmap metadata; capture verify artifacts.

## Oracles / Checks
- Unit: `npm --prefix tools/wvo_mcp run test -- scripts/__tests__/preflight.test.ts` (new) + existing quality integration suites.
- Integration: CLI smoke (`node --import tsx .../preflight.ts --task DEMO --status`) + WorkProcessEnforcer E2E to verify caching/hits.
- Benchmarks: `node --import tsx tools/wvo_mcp/scripts/benchmark_quality_checks.ts -- --checks preflight`.
- Policy: `check_performance_regressions.ts`, `check_determinism.ts`, `check_structural_policy.ts`, `check_risk_oracle_coverage.ts`, `check_work_process_artifacts.mjs`, delta notes, follow-up classifier.
- Docs: manual review to confirm new instructions.
