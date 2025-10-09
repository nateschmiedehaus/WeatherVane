# Observability Runbook

## Exports
- `make export-observability` (or Prefect deployment `observability-export`) writes NDJSON under
  `observability/latest/`.
- Files:
  - `retention.ndjson`: single JSON object with totals, warning counts, tag counts, per-tenant summaries.
  - `geocoding.ndjson`: one JSON object per tenant with coverage ratio and status.

## Dashboards
Until Grafana/BigQuery wiring is complete, inspect NDJSON locally or load into the staging warehouse via:

```bash
bq load --source_format=NEWLINE_DELIMITED_JSON dataset.retention observability/latest/retention.ndjson
bq load --source_format=NEWLINE_DELIMITED_JSON dataset.geocoding observability/latest/geocoding.ndjson
```

## Alerts
Refer to `docs/OBS_ALERTS.md` for thresholds and on-call actions.

## Smoke tests
- `make smoke-pipeline` prints plan status, geocoding coverage, data sources, and summary counts.
- Use `--export-observability` to capture the results for logging/alerts.
