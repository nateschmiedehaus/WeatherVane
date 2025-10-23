# Demo Brand Playbook

Living guidance for the full-fidelity synthetic tenant that powers the WeatherVane proof-of-concept. This document anchors how we assemble realistic multi-connector data, exercise the ML/MMM stack, and keep the fixture aligned with critic feedback. Update it whenever schemas, critics, or validation steps change.

## Why this exists
- Prospects and reviewers expect to see a believable brand with end-to-end weather-aware modelling, not toy CSVs.
- Critics (allocator, modeling, data-quality, design) require a reproducible dataset to validate changes before we touch production tenants.
- A nightly automated run gives early warning when connectors, feature engineering, or MMM outputs drift.

## Audience
- Product & solutions teams running demos or proofs.
- Modeling, data, and platform engineers maintaining the pipeline.
- Critics and reviewers looking for canonical evidence of model health.

## Outcomes we must hit
1. **Realistic lake** – Complete dataset coverage for weather (Open-Meteo archive + forecast), Shopify commerce, Meta Ads, Google Ads, Klaviyo messaging, promotions, and metadata for a named demo brand.
2. **Automated pipeline** – Single entrypoint that seeds/refreshes data, trains baseline + MMM models, runs allocator, and publishes diagnostics.
3. **Deterministic artifacts** – Reuseable outputs (Parquet/JSON) stored under `state/artifacts/demo_brand/` with run metadata for regression comparison.
4. **Test signal** – Pytest/Prefect checks fail loudly when schemas drift or MMM KPIs fall below guardrails.
5. **Critic-ready** – Clear hooks for allocator/model/data critics to comment and for follow-up tasks to loop into the roadmap.

## Data inventory and schema coverage
| Source | Dataset path | Schema reference | Notes |
| --- | --- | --- | --- |
| Open-Meteo (observed + forecast) | `lake/demo_brand_weather_daily/`, `lake/demo_brand_weather_hourly/` | `docs/api/open_meteo.md`, production weather schemas | Pull historical weather and next-7-day forecast for the demo geos. Cache raw JSON under `storage/seeds/open_meteo/` and materialise normalized Parquet. |
| Shopify (orders, products, inventory, discounts) | `lake/demo_brand_shopify_orders/`, `..._products/`, `..._inventory/`, `..._discounts/` | `shared/connectors/shopify/schemas/*.json` | Use anonymised real exports where possible; otherwise synthesise via `shared.libs.testing.synthetic` extended to respect production column names. |
| Meta Ads | `lake/demo_brand_meta_ads/`, `lake/demo_brand_meta_campaigns/` | `shared/connectors/meta/schemas/*.json` | Cover spend, impressions, clicks, conversions, creative metadata (placements, objective). Include weather multipliers in commentary fields for allocator demos. |
| Google Ads (Search) | `lake/demo_brand_google_ads/`, `..._ad_groups/` | `shared/connectors/google/schemas/*.json` | Mirror cost/impression/click conversions with keyword-level granularity where available. |
| Klaviyo | `lake/demo_brand_klaviyo_campaigns/`, `..._flows/` | `shared/connectors/klaviyo/schemas/*.json` | Simulate sends, opens, clicks, attributed revenue to show owned-channel impact and control for promo uplift. |
| Promotions & pricing | `lake/demo_brand_promos/`, `lake/demo_brand_price_events/` | `shared/libs/testing/synthetic.py`, forthcoming `docs/PRICING.md` | Encode discount campaigns, coupon codes, price overrides. Feed into causal controls. |
| Metadata (holidays, store info) | `lake/demo_brand_metadata_events/` | `shared/feature_store/calendars.py` | Ensure holiday flags and store attributes align with feature builder expectations. |

> **Tip:** When production schemas change, regenerate Parquet fixtures with the same folder names so downstream code keeps working.

## Data build blueprint
1. **Seed weather archives**
   - Script: `python scripts/demo_brand/build_weather_archive.py --geo-file docs/demo_brand/geos.json`.
   - Fetch historical daily/hourly weather from Open-Meteo for the last 2 years plus rolling 14-day forecast.
   - Store raw API responses under `storage/seeds/open_meteo/<geohash>/` and normalized Parquet under `tmp/demo_brand/lake/`.
2. **Generate commerce + marketing data**
   - Extend `shared.libs.testing.synthetic.seed_synthetic_tenant` with optional payload overrides:
     - `shopify_orders_template.json` for revenue distribution.
     - `meta_ads_template.json`, `google_ads_template.json`, `klaviyo_template.json` seeded from anonymised aggregates.
   - Command: `python scripts/demo_brand/build_connectors.py --tenant demo-brand --output tmp/demo_brand/lake`.
   - Enforce column validation via `shared.validation.schemas.validate_dataset_records`.
3. **Reconcile catalog + taxonomy**
   - Script merges Shopify product taxonomy with marketing channel metadata to power MMM feature selection.
   - Publish summary to `state/artifacts/demo_brand/catalog_snapshot.json`.
4. **Persist lake snapshot**
   - Copy final Parquet files into `state/artifacts/demo_brand/lake/<run_id>/`.
   - Record manifest: dataset name, row counts, schema hash, checksum.

## Model and allocator pipeline
1. **Plan scope (optional)**
   - `make demo-plan DEMO_TENANT=demo-brand DEMO_LAKE_ROOT=state/artifacts/demo_brand/lake/latest DEMO_PLAN_OUTPUT=state/artifacts/demo_brand/demo_plan.json`
   - Outputs recommended history window, hero product/category, and outstanding connector tasks.
2. **Train baseline + MMM**
   - `make demo-ml DEMO_TENANT=demo-brand DEMO_PLAN=state/artifacts/demo_brand/demo_plan.json DEMO_OUTPUT=state/artifacts/demo_brand/run_<timestamp>`
   - Runs `scripts/minimal_ml_demo.py`: seeds lake (if needed), invokes `apps.model.train.train_baseline`, builds MMM scenario via `apps.model.mmm.MMMModel`, and solves allocator recommendations.
3. **Produce diagnostics**
   - Collect metadata:
     - Baseline metrics (`metadata.json`, R², MAE, leakage guardrails).
     - MMM outputs (channel recommendations, weather multipliers).
     - Allocator diff summary (per-channel spend deltas, ROAS, context tags).
   - Persist consolidated report to `state/artifacts/demo_brand/run_<timestamp>/summary.json`.
4. **Visual proof (optional)**
   - Generate UI snapshots with demo tenant toggled to sample data mode.
   - Store under `state/artifacts/demo_brand/screenshots/<timestamp>/`.

## Validation & regression safety
- **Unit tests**
  - `pytest tests/test_model_pipeline.py` – verifies feature builder + baseline + MMM bundle works with synthetic lake.
  - `pytest tests/test_marketing_mix_solver.py` – ensures allocator logic respects constraints and ROAS floors.
- **Synthetic invariants**
  - Add `tests/demo_brand/test_demo_brand_datasets.py` (TODO) to assert schema hashes and row counts for each dataset.
- **Integration run**
  - `bash tools/wvo_mcp/scripts/run_integrity_tests.sh` – must include the demo brand scenario before sign-off.
- **Nightly Prefect flow (planned)**
  - Flow name: `demo_brand.full_stack`.
  - Steps: refresh weather archive → rebuild lake → train baseline/MMM → run allocator → upload artifacts → notify critics if guardrails fail.
- **Guardrails**
  - Baseline holdout R² >= 0.45 (tune once dataset finalizes).
  - MMM recommendation profit delta within ±5% of expected baseline.
  - Weather feature coverage: no nulls on primary geos, lag features populated.

## Critic integration & change log
- **Critic hooks**
  - `critic:modeling` checks metadata JSON for regression, auto-files tasks when guardrails breached.
  - `critic:data_quality` scans schema manifest for drift.
  - `critic:allocator` reviews MMM recommendation diffs.
  - `critic:design` validates demo-mode UI screenshots.
- **Responding to feedback**
  1. Log critic decision in `state/context.md` under “Demo Brand”.
  2. Update this playbook with action items and owner.
  3. If roadmap scope changes, sync with `docs/ROADMAP.md` Phase 0 item “Full-fidelity demo brand”.
- **Update ledger (append entries below)**
  - `2025-10-22` – Initial playbook drafted; pipeline gaps flagged for weather archive + Klaviyo fixtures.

## Operational runbook
- **Manual refresh**
  1. `make demo-plan ...`
  2. `make demo-ml ...`
  3. Inspect `summary.json` and MMM diagnostics.
  4. Run `bash tools/wvo_mcp/scripts/run_integrity_tests.sh`.
  5. Upload artifacts to shared demo storage if needed.
- **Scheduling**
  - Configure MCP autopilot to trigger Prefect flow nightly at 02:00 UTC.
  - Store run status in `state/artifacts/demo_brand/run_history.jsonl`.
- **Rollback**
  - Revert to previous lake snapshot by switching `DEMO_PLAN` to last known good manifest.
  - Delete partial runs in `state/artifacts/demo_brand` only after ensuring no critic investigations rely on them.

## Backlog to unblock automation
1. Write `scripts/demo_brand/build_weather_archive.py` and `scripts/demo_brand/build_connectors.py`.
2. Extend `seed_synthetic_tenant` to cover Klaviyo + richer schema matching.
3. Add pytest suite for dataset manifests (schema hash + row count assertions).
4. Prefect flow orchestration + MCP autopilot wiring.
5. UI harness to capture demo screenshots with new dataset.

## FAQ
- **Why Open-Meteo?** Free historical/forecast API with liberal terms; matches production feature expectations (temperature, precipitation, UV, wind, anomaly flags).
- **Can we swap in real anonymised data?** Yes—replace template JSONs in `storage/seeds/demo_brand/` and rerun build scripts; manifests will capture checksum changes.
- **How do we extend to new connectors?** Add schema template under `storage/seeds/<connector>/`, update build script to emit Parquet matching production naming, document in the table above, and bump guardrail tests.

Keep this document evergreen. When in doubt, update the playbook first, then implement the change so every contributor knows the expected state of the demo brand pipeline.

