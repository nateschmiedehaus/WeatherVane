# Monitor Notes — FIX-PERF-QualityChecks (Rev 2)

- Track `state/analytics/preflight_runs.jsonl` to ensure scope detection stays in `scoped` mode; investigate if `fallback_reason` reappears frequently or if warnings accumulate (missing deps, etc.).
- Monitor new metrics (`quality_check_latency_ms` with `checkType=preflight`, `quality_check_cache_*`, and the scope tags emitted by the CLI) via `check_performance_regressions.ts`; re-baseline intentionally only after sustained improvements.
- When scope rules change or new buckets are added, rerun `benchmark_quality_checks.ts` to refresh evidence and update timeout buffers.
- Keep documentation aligned (WORK_PROCESS + troubleshooting) whenever the command matrix or override behaviour evolves.
