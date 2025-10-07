# WeatherVane Free / OSS Stack Blueprint

This document captures the recommended zero-license stack and operating posture for WeatherVane. It backs the decisions in `agent.md` and `README.md`, and helps engineers keep instrumentation neutral so experiments are not skewed.

## Default Operating Mode
- **Read-only Plan & Proof**: ingest, model, simulate, and report without touching live ad budgets.
- **Assist** and **Autopilot** remain opt-in. Assist requires approvals; Autopilot honours ramp caps, ROAS floors, CPA ceilings, and change windows.
- PoC report is the primary “conversion engine” before any live pushes.

## Data Sources
| Domain | Source | Notes |
| --- | --- | --- |
| Weather forecast/history | Open-Meteo | No key, global coverage. Cache by geohash. |
| Climatology | ERA5 (Copernicus) | Use anomalies versus normals; fetch only tenant regions. |
| AQI/Pollen | OpenAQ, Open-Meteo pollen | Optional but free; unify schema. |
| Commerce | Shopify Admin API | Orders, products, metafields, inventory, webhooks. |
| Promos | Klaviyo API | Campaigns, flows, discount metadata. |
| Ads | Meta Marketing API, Google Ads API | Read-only by default; later write scopes. |

## Modeling & Analytics
- Baseline + weather sensitivity: `pyGAM` or `statsmodels` GAM, optionally LightGBM (monotonic).
- Media mix: `Robyn` (Meta) or `LightweightMMM` (Google/JAX). Use `DoWhy`/`EconML` for double-ML checks.
- Feature pipeline: DuckDB + Polars on Parquet (Delta-rs optional).
- Optimization: `cvxpy` (concave curves, CVaR, ramp caps) or fallback linear solvers.
- Inference: export to ONNX and serve via ONNX Runtime (quantized INT8 for CPU efficiency).

## Orchestration
- **Prefect OSS** (or Dagster OSS) handles flows. Example daily DAG:
  1. `ingest_shopify`
  2. `ingest_ads`
  3. `ingest_weather`
  4. `build_features`
  5. `fit_models`
  6. `simulate_counterfactuals`
  7. `allocate_budget`
  8. `generate_poc_report`

- All tasks run with read-only credentials unless push mode is enabled.

## Frontend & Visualization
- UI stack: Next.js + Tailwind + shadcn/ui + Framer Motion (respect reduced motion).
- Maps: MapLibre GL with cached OpenStreetMap tiles.
- Charts: Apache ECharts.
- Typography and aesthetics follow WeatherVane brand guidelines (see `README.md`).

## Tagging & Asset Intelligence
- Text embeddings: `sentence-transformers` (all-MiniLM-L6-v2).
- Image heuristics: CLIP/SigLIP public checkpoints.
- Round-trip Shopify metafields for weather/season tags, plus internal tagging table for ads.

## Security & Governance
- Postgres metadata store for tenants, connections, guardrails, approvals, audit log.
- OAuth least-privilege; store aggregated geo only (no PII).
- Immutable audit trail for every proposed/pushed change.
- Data residency: optional S3/GCS bucket per region; MinIO for dev.

## Optional Enhancements (still free)
- Conformal prediction (MAPIE/CQR) to wrap uplift estimates with valid bands.
- cvxpylayers for differentiable optimization loops (future research mode).
- delta-rs for ACID/time-travel on Parquet for auditability.

Keep this stack as the default reference when building new modules or evaluating dependencies; escalate before introducing paid or heavy operational services.
