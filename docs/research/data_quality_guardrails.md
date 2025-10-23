# Data Quality Guardrails Research — 2025-10-20

## Overview
- Objective: replace `unknown` exit criteria on ingestion/data-quality slices by grounding guardrails in live telemetry.
- Inputs analysed:
  - `state/dq_monitoring.json` (2 most recent runs with Shopify order telemetry).
  - `storage/metadata/state/geocoding/*.json` (7 tenant coverage snapshots).
  - `experiments/features/weather_join_validation.json` (weather join coverage for `test-tenant`).
- Outputs shipped in this session:
  - Baseline metrics (`state/analytics/data_quality_baselines.json`).
  - Geocoding coverage report (`state/artifacts/research/geocoding_coverage_report.json`).
  - Guardrail helper (`shared/data_quality/baselines.py`) + tests (`tests/shared/test_data_quality_baselines.py`) to keep evidence reproducible.

## Freshness & Completeness Baselines
- Shopify orders average 245 daily rows (p05 240.5, p95 249.5) with 50 median new rows (`state/analytics/data_quality_baselines.json`). Alert history recorded zero severities beyond `ok`.
- New guardrail defaults tighten row-count drops to 20% warning / 40% critical (`MonitoringThresholds.warning_row_drop=0.8`, `critical_row_drop=0.6`) and extend history windows to 7 runs for better regression context.
- New rows baseline: 50 median, 48–52 observed. Retain `new_rows_warning_drop=0.5`, `new_rows_critical_drop=0.1` for now; doc flagged to revisit once promo/catalog datasets feed monitoring.
- Shopify geocoded ratio observed mean 0.91 (p05 0.901). Guardrails raised to warning <0.88, critical <0.75 (`MonitoringThresholds.geocoded_ratio_{warning,critical}`) so weather models fail fast on meaningful regressions instead of catastrophic drops only.

## Geocoding Coverage Findings
- `storage/metadata/state/geocoding/*.json` currently show perfect ratios (all 1.0). Research artifact marks this as insufficient sample breadth and recommends nightly harvest of real tenant runs before enabling allocator automation.
- Weather join coverage (`experiments/features/weather_join_validation.json`) confirms a single geohash (`9q8yy`) with full coverage (orders_rows=1, weather_rows=10). The guardrail helper persists the raw geohash summaries so QA can diff changes run-to-run.
- No tenant breached the 0.8 coverage threshold yet; `tenants_below_threshold` stays empty. Follow-up: pipe real production tenants into the monitoring snapshot feed (blocked on access).

## Schema & Dedupe Guardrails
- Contract validation: all ingestion payloads must pass `shared/contracts/{shopify_orders,shopify_products,promos,meta_ads,google_ads}.schema.json`. Schema drift handling must promote execution to `critical` severity unless the change is additive + backward compatible.
- Incremental dedupe acceptance relies on `tests/test_incremental_ingestion.py::test_incremental_promo_dedup_and_updates` (cursor advancement, no replays, metadata `new_rows`/`updated_rows`). Future guardrail work should add equivalent tests for orders/products connectors and assert:
  1. Cursor monotonicity (`JsonStateStore` checkpoints increase).
  2. Duplicate primary keys resolved in-lake (no double counts).
  3. Metadata fields (`total_rows`, `new_rows`, `updated_rows`) stay consistent with lake snapshots.
- Weather coverage guardrails depend on `docs/weather/coverage.md` CLI outputs; integrate summary ingestion into the monitoring artifact so row-count drops can be correlated with DMA/geohash coverage drift.

## Implementation Notes
- `shared/data_quality/baselines.py` exposes `generate_reports` for future CI use. Tests cover both pure aggregation (`compute_dataset_baselines`) and integration (writing both JSON artifacts).
- `MonitoringThresholds` defaults updated to match research findings; `docs/INGESTION.md` captures the new policy. Existing tests (`tests/apps/test_dq_monitoring.py`) remain intact with more aggressive thresholds.
- Both artifacts include timestamps and source pointers so future loops can diff evidence before re-running research.

## Remaining Gaps & Next Steps
1. Collect at least two weeks of tenant coverage data (real row counts >1) to validate guardrail tightness before enabling critic automation.
2. Extend `state/analytics/data_quality_baselines.json` once promo/catalog/connectors feed monitoring history; update guardrail defaults if variance widens.
3. Feed weather coverage summaries into `state/dq_monitoring.json` or a sibling artifact so guardrails can reason about geohash breadth, not just ratios.
4. Wire allocator/data-quality critics to read the new artifacts and require evidence attachments during readiness reviews.
