# MONITOR — Follow-up

- Add integration/e2e coverage (upcoming FIX-E2E-QualityIntegration) to ensure orchestration-level flows stay aligned with unit guarantees.
- Watch for telemetry schema changes; update tests if analytics fields evolve (e.g., additional attributes in JSONL entries).
- Re-run targeted Vitest when modifying `work_process_quality_integration.ts` to ensure fail-safe assumptions remain enforced.
