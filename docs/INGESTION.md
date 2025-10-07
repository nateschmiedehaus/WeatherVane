# Ingestion Playbook

This guide explains how to add or modify ingestion tasks. The goals:
- Every source looks the same (easy to read, easy to debug)
- Junior engineers can copy/paste an existing pattern
- The Prefect flow remains clean and declarative

## Core Concepts

| Component | Location | Responsibility |
| --- | --- | --- |
| `BaseIngestor`, `IngestionSummary` | `apps/worker/ingestion/base.py` | Shared helpers and return type (path + row count + source) |
| Connector wrappers | `shared/libs/connectors` | Handle raw HTTP/gRPC calls |
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

## Environment Variables (Shopify example)
```
SHOPIFY_SHOP_DOMAIN=<my-shop.myshopify.com>
SHOPIFY_ACCESS_TOKEN=<admin api token>
SHOPIFY_API_VERSION=2024-04  # optional
```
If an environment variable is missing, the task deliberately falls back to stub data for local
prototyping. This behaviour is visible in the logs and the returned `source` field.

## Pagination & Rate Limits
- `DEFAULT_PAGE_LIMIT` keeps requests small; adjust if Shopify introduces new limits.
- For other connectors, implement exponential backoff or rate limiting if required.
- Store the raw `next_page_info` (or equivalent token) in your loop to avoid infinite paging.

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
        return self._write_records(f"{tenant_id}_mysource", rows, source="mysource_api")
```

Keep things boring and explicit—future contributors will have a much easier time.
