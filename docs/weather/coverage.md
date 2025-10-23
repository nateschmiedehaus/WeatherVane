# Weather Coverage Validation

The weather coverage CLI inspects a tenant's feature matrix to ensure the blended
weather data lines up with observed orders and guardrails stay healthy. Running
the check produces a persistent JSON report and, optionally, a cached summary that
appears in downstream telemetry.

## Running the CLI
- Warm a tenant lake snapshot first (for example by running the PoC worker flow or
  seeding synthetic data with `python -m apps.worker.run <tenant-id> --retention-only`).
- Execute the validation script:

```bash
python -m apps.worker.validation.weather \
  --tenant-id TENANT123 \
  --lake-root storage/lake/raw \
  --report-path experiments/features/weather_join_validation.json
```

Key flags:
- `--start/--end`: ISO timestamps that bound the evaluation window. Omit both to
  rely on `--lookback-days` (defaults to 30).
- `--lake-root`: Location of tenant parquet datasets. Use the sandbox tmp path when
  working with synthetic data.
- `--report-path`: Destination for the detailed join report. The default matches
  the path consumed by modelling telemetry.
- `--summary-root`: Directory for cached summaries (`storage/metadata/state` by
  default). Pass an empty string to skip persistence.

The script writes a JSON payload to stdout containing aggregate metrics (join
mode, coverage ratios, leakage counts) so it can feed CI gates or notebook
automation. Exit status is non-zero only when the FeatureBuilder raises an error
outside of the guardrail path.

## Output Artefacts
- `experiments/features/weather_join_validation.json`: Detailed join report with
  coverage statistics, leakage breakdowns, and any date gaps.
- `storage/metadata/state/weather/<tenant>.json`: Cached summary saved via
  `JsonStateStore` when a summary root is provided; orchestration layers read this
  file to populate context tags.

Guardrails:
- If the leakage guardrail fires, the CLI still emits the matrix snapshot and
  flags `guardrail_triggered=true`.
- Missing weather rows or geocoding coverage below 0.8 degrade the status to
  `warning`, while wholesale weather dropouts promote `status=missing`.

## When to Run
- After onboarding a tenant or backfilling weather data, to confirm coverage before
  enabling allocator automation.
- During smoke tests (`make smoke-context`) or CI workflows that validate feature
  store health; capture the stdout JSON for dashboards.
- Locally when investigating leakage or coverage regressions surfaced by the
  worker flows or Prefect telemetry.

Tests live in `tests/test_weather_coverage.py` and cover both the happy path and
guardrail-triggered scenarios with synthetic data to keep local runs deterministic.

## Nightly Monitoring
- The `Nightly Weather QA` GitHub Action (`.github/workflows/nightly-weather-ingestion.yml`)
  runs every day at 05:00 UTC.
- It executes `make smoke-context` followed by `tools/ci/run_weather_ingestion_tests.sh`
  to exercise ingestion and weather coverage regressions end-to-end.
- Each run emits a structured summary at `state/telemetry/weather_ingestion.json`
  and uploads logs plus telemetry as workflow artefacts for quick triage when a
  regression slips in.
