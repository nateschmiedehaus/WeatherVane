# WeatherVane Architecture Overview

This document is a map for new contributors. You should be able to glance at this file and
understand where everything lives, why it exists, and how to extend it without breaking
other pieces.

## High-Level Layout

```
apps/
  api/          # FastAPI service (health, plans, settings)
  worker/       # Prefect flows, ingestion, scheduling entrypoints
  web/          # Next.js frontend (landing + app shell)
shared/
  libs/         # Reusable helper libraries (connectors, storage, tagging, logging)
  schemas/      # Pydantic models shared between API and worker
  feature_store/# Weather cache + feature engineering utilities
storage/
  lake/         # Parquet snapshots (ingested data)
  metadata/     # Placeholder for relational dumps (if needed)
```

## Execution Path (Plan & Proof mode)
1. **Worker flow** (`apps/worker/flows/poc_pipeline.py`) orchestrates ingestion → features →
   modeling → simulation → report generation. Each Prefect task is intentionally tiny and
   documented so a junior engineer can edit it without scrolling for minutes.
2. **Ingestion** modules live under `apps/worker/ingestion`. Every ingestor returns an
   `IngestionSummary` with `path`, `row_count`, and `source`, keeping contracts simple.
3. **Storage** utilities (`shared/libs/storage/lake.py`) hide Polars/DuckDB usage behind a
   `LakeWriter`. You always write Parquet using the same method, so schema changes are easy.
4. **Weather cache** (`shared/feature_store/weather_cache.py`) stores upstream responses per
   geocell. The scaffold writes JSON now; swapping to Parquet later only requires edits there.
5. **API** surfaces read-only endpoints for health, plans, and automation defaults.
6. **Frontend** consumes API responses, renders Plan/Stories/Catalog/Automations views.

## Design Principles
- **Readability first:** modules are short and heavily commented. Complex logic is broken into
  helpers and dataclasses.
- **Predictable contracts:** ingestors always return `IngestionSummary`, flows pass around
  dicts with explicit keys, APIs use typed schemas.
- **Feature isolation:** weather cache, tagging, storage each live in their own modules.
  Replacing one implementation does not require touching others.
- **OSS stack:** everything runs on FastAPI, Prefect OSS, DuckDB/Polars, ONNX Runtime, etc.
- **No hidden side-effects:** flows write to `storage/lake/*` and return summaries; API remains
  read-only until a tenant enables pushes.

If something feels unclear, add a docstring or expand this document—future you (or the next
junior hire) will thank you.
