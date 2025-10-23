# Ingestion Playbook

This guide explains how to add or modify ingestion tasks. The goals:
- Every source looks the same (easy to read, easy to debug)
- Junior engineers can copy/paste an existing pattern
- The Prefect flow remains clean and declarative

## Core Concepts

| Component | Location | Responsibility |
| --- | --- | --- |
| `BaseIngestor`, `IngestionSummary` | `apps/worker/ingestion/base.py` | Shared helpers and return type (path + row count + source + metadata) |
| Connector wrappers | `shared/libs/connectors` | Handle raw HTTP/gRPC calls (pagination, retries, OAuth refresh) |
| Ingester modules | `apps/worker/ingestion/<source>.py` | Normalise records and store Parquet snapshots |
| Storage utilities | `shared/libs/storage/lake.py` | Write/read Parquet via Polars (single entry point) |
| Prefect flows | `apps/worker/flows/*.py` | Call ingestors, log summaries, feed modelling tasks |

## Adding a New Ingester

1. Create `apps/worker/ingestion/<source>.py`.
   - Import `BaseIngestor`, `IngestionSummary`, and the relevant connector/config.
   - Normalise API responses into flat dictionaries (no nested JSON in Parquet).
   - Call `self._write_records(dataset, rows, source=...)` to persist results.
   - Return `IngestionSummary`.
2. Write tests under `tests/test_<source>_ingestion.py` using stub connectors.
   - Verify the ingestor writes Parquet and returns the correct row count.
3. Update Prefect flow (`poc_pipeline.py`) to call the new ingestor.
   - Keep the task wrapper small; it should focus on logging and returning summaries.
4. Document any required environment variables in this file and `docs/STACK.md` if needed.
5. Persist incremental state using `JsonStateStore` when the source supports cursors (for example `updated_at_min`).

## Environment Variables (Shopify example)
```
SHOPIFY_SHOP_DOMAIN=<my-shop.myshopify.com>
SHOPIFY_ACCESS_TOKEN=<admin api token>
SHOPIFY_API_VERSION=2024-04  # optional
# Optional, used for OAuth token refresh
SHOPIFY_CLIENT_ID=<oauth client id>
SHOPIFY_CLIENT_SECRET=<oauth client secret>
SHOPIFY_REFRESH_TOKEN=<oauth refresh token>
```
If an environment variable is missing, the task deliberately falls back to stub data for local
prototyping. This behaviour is visible in the logs and the returned `source` field.

## Pagination & Rate Limits
- `DEFAULT_PAGE_LIMIT` keeps requests small; adjust if Shopify introduces new limits.
- `WeatherConnector`, `ShopifyConnector`, `MetaAdsConnector`, and `GoogleAdsConnector` enable `AsyncRateLimiter` by default (5 rps for Open-Meteo, 2 rps with 40-token burst for Shopify, 10 rps for Meta, 5 rps for Google Ads). Override `rate_limit_per_second`/`rate_limit_capacity` on each `ConnectorConfig` if partners approve higher quotas.
- Store the raw `next_page_info` (or equivalent token) in your loop to avoid infinite paging.

## Meta Ads
- Graph API base URL is `https://graph.facebook.com/<graph_version>`.
- The connector follows `paging.cursors.after` (or parses `paging.next`) until exhausted.
- Automatic retries/backoff leverage the shared HTTP connector; the default `AsyncRateLimiter` keeps traffic under a conservative 10 req/s burst 20 policy so we avoid surprises during initial roll-outs.
- On HTTP 401 the connector exchanges the short-lived token using `app_id`/`app_secret` and updates headers transparently.

Environment variables:

```
META_ACCESS_TOKEN=<short-lived or long-lived token>
META_APP_ID=<facebook app id>
META_APP_SECRET=<facebook app secret>
META_GRAPH_VERSION=v19.0
```

Persist the refreshed token to your secrets store if you want subsequent runs to reuse it; otherwise
the connector refreshes in-memory whenever Meta invalidates the token.

## Google Ads
- REST endpoint base: `https://googleads.googleapis.com/<version>/customers/{cid}/googleAds:search`.
- Requests are POST with GAQL queries; the connector handles `nextPageToken` pagination and yields rows via `search_iter`.
- Retries/backoff use the shared HTTP connector; the default `AsyncRateLimiter` keeps requests to five per second with a modest burst until we negotiate higher quotas.
- On HTTP 401 the connector exchanges the refresh token for a new access token (`oauth2.googleapis.com/token`) and updates headers.

Environment variables / secrets:

```
GOOGLE_ADS_DEVELOPER_TOKEN=<developer token>
GOOGLE_ADS_CLIENT_ID=<oauth client id>
GOOGLE_ADS_CLIENT_SECRET=<oauth client secret>
GOOGLE_ADS_REFRESH_TOKEN=<oauth refresh token>
GOOGLE_ADS_LOGIN_CUSTOMER_ID=<manager customer id, optional>
GOOGLE_ADS_ACCESS_TOKEN=<optional bootstrap access token>
GOOGLE_ADS_API_VERSION=v14
```

For local smoke tests you can omit `GOOGLE_ADS_ACCESS_TOKEN`; the connector will immediately refresh using the
refresh token. Persist refreshed tokens centrally if you want to avoid repeated token exchanges across runs.

## Klaviyo Promos
- `PromoIngestor.ingest_campaigns` persists a cursor via `JsonStateStore` (`state/klaviyo/<tenant>_promos.json`) so follow-up runs filter with `greater-than(updated_at, <cursor>)` while still bounding the window by the requested `start_date`/`end_date`.
- Normalised rows now expose `updated_at`, and the ingestion metadata includes a `checkpoint` string that mirrors the stored cursor. Dashboards can lean on this to spot ingestion drift without parsing raw Parquet.
- Regression coverage lives in `tests/test_incremental_ingestion.py`, which exercises the dedupe path, verifies checkpoint persistence, and asserts the connector filter includes the cursor guard.

## Geocoding validation
- Orders ingestion stores `ship_geohash` alongside the raw record and writes `geocoded_ratio` into the ingestion summary.
- Existing coordinates on the raw payload (e.g. Shopify shipping latitude/longitude) are normalised and re-encoded before falling back to a lookup, so we avoid redundant external geocoding calls.
- The helper `apps.worker.validation.geocoding.evaluate_geocoding_coverage` loads the latest orders snapshot, computes coverage, and persists a JSON report under `storage/metadata/state/geocoding/<tenant>.json`.
- Run `python -m apps.worker.maintenance.geocoding_coverage --lake-root storage/lake/raw --summary-root storage/metadata/state --fail-on-warning` to evaluate coverage for every tenant and surface any below-threshold ratios during CI or local smoke checks.
- Coverage results bubble into the PoC pipeline response (`geocoding_validation`) and inform context tags (e.g. `geo.partial`, `geo.missing`).
- Default threshold is 0.8; adjust per tenant if you expect higher sparsity.

## Why Parquet + LakeWriter?
- Every ingestor writes via `LakeWriter.write_records(dataset, rows)`.
- Datasets live under `storage/lake/raw/<tenant_dataset>/<timestamp>.parquet`.
- Downstream tasks always load the **latest** snapshot for modelling.

## Quick Recipe for a New Source
```python
@dataclass
class MySourceIngestor(BaseIngestor):
    connector: MySourceConnector

    async def ingest(self, tenant_id: str) -> IngestionSummary:
        payloads = await self.connector.fetch(...)
        rows = [self._normalise(item) for item in payloads]
        metrics = {"geocoded_ratio": 0.94}
        return self._write_records(
            f"{tenant_id}_mysource",
            rows,
            source="mysource_api",
            metadata=metrics,
        )
```

Keep things boring and explicit—future contributors will have a much easier time.


## Weather Cache
- Weather fetches are keyed by tenant shipping geohashes (derived from order-level geocoding).
- Daily metrics stored under `storage/lake/weather/<geohash>/...json` with a running climatology in `climatology.parquet`.
- Anomalies are computed against day-of-year climatology so downstream models receive stationarised weather deltas.
- Rolling seven-day means (`temp_roll7`, `precip_roll7`) provide smoother signals for multi-geo aggregation.
- Feature builder expects columns `temp_c`, `precip_mm`, `temp_anomaly`, `precip_anomaly`, `temp_roll7`, `precip_roll7`.
- Schema validation runs via `shared.validation.schemas`.
- Joining weather to the modelling matrix now emits `experiments/features/weather_join_validation.json`, which captures join mode, leakage guardrail status, and any cells missing weather coverage.
- Use the weather coverage validation CLI (`docs/weather/coverage.md`) to audit join health, leakage guardrails, and geocoding ratios before enabling allocator automation.

### Open-Meteo Daily Weather

`WeatherCache.ensure_range` produces frames validated against `shared/contracts/weather_daily.schema.json`.

| Field | Type | Notes |
| --- | --- | --- |
| `date` | string | UTC calendar date used for joins with other datasets |
| `local_date` | string | Local (timezone-aware) calendar date returned by Open-Meteo |
| `local_datetime` | string | Local midnight timestamp with timezone offset |
| `utc_datetime` | string | UTC timestamp corresponding to local midnight |
| `timezone` | string | IANA timezone identifier (e.g. `America/Los_Angeles`) |
| `geohash` | string | Precision `5` cell linking back to tenant geo |
| `temp_c`, `precip_mm` | number | Primary signals used downstream |
| `temp_anomaly`, `precip_anomaly` | number | Deviations vs climatology |
| `temp_roll7`, `precip_roll7` | number/null | Rolling seven-day means (null for the warmup window) |
| `*_lag1` columns | number/null | Previous-day values for leading indicators |
| `freeze_flag`, `heatwave_flag`, `snow_event_flag`, `high_wind_flag`, `uv_alert_flag`, `high_precip_prob_flag` | integer | Binary threshold events used in downstream feature builders |
| `observation_type` | string | `observed`, `forecast`, or `stub` provenance tag |
| `as_of_utc` | string | Timestamp when WeatherVane generated the blended row |

Daily frames keep additional context columns (`temp_max_c`, `humidity_mean`, `uv_index_max`, etc.) so feature engineering can remain declarative.

## Data Quality Monitoring & Alerts
- `orchestrate_ingestion_flow` now calls `apps.worker.monitoring.update_dq_monitoring` after persisting the data-quality report. The helper appends a bounded history of run snapshots to `state/dq_monitoring.json` with per-dataset severity, alert codes, and rolling metrics (row counts, geocoded ratio).
- Alert heuristics flag missing datasets, zero-row snapshots, geocoding regressions, large row-count drops, and sustained periods with no new rows (rolling streak + median-based drop checks). The monitoring payload surfaces an overall severity (`ok`, `warning`, `critical`) plus dataset-specific alert lists so operations dashboards and context tags can escalate quickly.
- Defaults now bias toward weather-model readiness: warning at >=20% row-count drops (`row_count_drop_warning=0.8`), critical at >=40% (`row_count_drop_critical=0.6`), and geocoding ratios falling below 0.88/0.75 trigger warning/critical (`geocoded_ratio_warning=0.88`, `geocoded_ratio_critical=0.75`). Override `MonitoringThresholds` when a tenant demands looser guardrails.
- History retention defaults to 90 runs and trims automatically; adjust by passing `max_history` or custom `MonitoringThresholds` when calling `update_dq_monitoring` from bespoke flows or one-off scripts.
- Tests live under `tests/apps/test_dq_monitoring.py` alongside the ingestion flow regression in `tests/test_ingestion_flow.py`. Update or extend them when introducing new alert types or thresholds.
