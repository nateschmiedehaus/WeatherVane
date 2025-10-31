# Analysis — FIX-PERF-QualityChecks (Rev 2)

## Key Questions
1. **Scope detection safety**  
   - What files indicate we must run each command? Map glob patterns: `*.py` → ruff, `apps/web/**`/`shared/**.ts/tsx` → lint/typecheck, `tools/wvo_mcp/**` → vitest smoke.  
   - How do we behave when the diff is huge or unavailable? Keep scoped mode by default but surface the detected file list in the JSON output so operators can decide when to force `--full`.
2. **Exit code semantics / escalation**  
   - CLI must return actionable failure output when commands fail; WorkProcessEnforcer consumes the JSON and determines whether to block. Scoped runs should succeed even when caches skip individual commands (warnings recorded separately).
3. **Cache interplay**  
   - Cached result key should include CLI args (task id, source) and is invalidated whenever the workspace is dirty for relevant paths—same as previous cache behaviour. `--full` bypasses cache entirely.
4. **Metrics & observability**  
   - Emit tags (`scope.buckets`, `scope.mode`) with latency metrics so `check_performance_regressions.ts` can alert on drift.
5. **Operator override**  
   - Provide `--full` flag / `PRE_FLIGHT_FORCE_FULL=1` env to run the legacy heavyweight suite when desired; document how cache interacts with overrides.

## Failure Modes & Mitigations
- **False negative (missed command)** → Conservative pattern matching, JSON output includes file list for manual review, and unit tests cover edge cases (config changes, mixed extensions).
- **Missing dependencies** → CLI detects missing `node_modules`/`ruff` and records warnings so operators can bootstrap before rerunning full checks.
- **Vitest smoke flakiness** → Run the deterministic enforcement suite in-band; treat failure as blocking to maintain safety.
- **TSX loader overhead** → CLI runs once per preflight with minimal imports; measured runtime still meets SLO (~14 s).

## Evidence / Oracles
- **Unit tests**: new suites verifying scope classification + CLI option parsing.
- **Integration**: CLI exercised via benchmark harness (`benchmark_quality_checks.ts`) and runtime test to ensure WorkProcessEnforcer receives overrides.
- **Benchmarks**: re-run `benchmark_quality_checks.ts` to confirm runtime improvements and capture new JSON/MD artifacts.
- **Policy**: determinism, structural policy, performance regression, delta notes, follow-up classifier, risk-oracle coverage (risk map now includes `preflight_scope_mismatch`).
- **Manual**: Optional `--status` invocation provides human-readable summary for incident response.
