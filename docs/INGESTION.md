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
- For other connectors, implement exponential backoff or rate limiting if required.
- Store the raw `next_page_info` (or equivalent token) in your loop to avoid infinite paging.

## Meta Ads
- Graph API base URL is `https://graph.facebook.com/<graph_version>`.
- The connector follows `paging.cursors.after` (or parses `paging.next`) until exhausted.
- Automatic retries/backoff leverage the shared HTTP connector; plug in `AsyncRateLimiter` to stay under burst limits.
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
- Retries/backoff use the shared HTTP connector; add an async rate limiter to respect QPS caps.
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

## Geocoding validation
- Orders ingestion stores `ship_geohash` alongside the raw record and writes `geocoded_ratio` into the ingestion summary.
- Existing coordinates on the raw payload (e.g. Shopify shipping latitude/longitude) are normalised and re-encoded before falling back to a lookup, so we avoid redundant external geocoding calls.
- The helper `apps.worker.validation.geocoding.evaluate_geocoding_coverage` loads the latest orders snapshot, computes coverage, and persists a JSON report under `storage/metadata/state/geocoding/<tenant>.json`.
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
