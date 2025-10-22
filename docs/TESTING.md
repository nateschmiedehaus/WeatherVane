# Testing & Simulation Guide

## Unit Tests
Run `pytest` from the repository root. Tests cover storage, ingestion, tagging, feature
building, and settings endpoints. New modules should follow the pattern of creating stub
connectors + temporary Parquet files.

## Synthetic Data
The helper `shared.libs.testing.synthetic.seed_synthetic_tenant` writes a complete set of
mock snapshots (orders, ads, promos, weather) into a lake directory. Use it when developing
feature builders or running local experiments without hitting real APIs.

Example usage:
```python
from pathlib import Path
from shared.libs.testing.synthetic import seed_synthetic_tenant

lake_root = Path("/tmp/lake")
seed_synthetic_tenant(lake_root, tenant_id="demo", days=14)
```

## Internal PoC Simulation
The Prefect PoC flow already falls back to stub data when API credentials are absent. For
integration testing, seed synthetic data first, then run:
```
python apps/worker/run.py demo --start 2024-01-01 --end 2024-01-14
```
The flow will read the synthetic Parquet files, build a feature matrix, and produce a Plan
& Proof report summary.

Keep synthetic datasets lightweight but representative—small daily horizons are sufficient
for regression tests and CI.


## Advanced Synthetic Scenarios
- Use `WeatherShock` to simulate heatwaves/storms: `seed_synthetic_tenant(..., shocks=[WeatherShock(0,2,temp_delta=5)])`.
- Multiple geos are supported via the `geos` argument.
- Pass a `scenario` from `DEFAULT_BRAND_SCENARIOS` to `seed_synthetic_tenant` for targeted behaviour (e.g., extreme snow affinity or heat-driven demand).
- `seed_synthetic_tenant` now pulls observed weather from the real Open-Meteo archive stored at `storage/seeds/open_meteo/chicago_il_daily.parquet` when available, falling back to the procedural generator if the cache is missing.
- Call `seed_synthetic_brand_portfolio(lake_root)` (defaults to 3×365 days) to emit five brand archetypes with distinct weather sensitivities, product mixes, and marketing intensities; the helper returns tenant IDs and aligns data around `SYNTHETIC_ANCHOR_DATE`.
- Remember that ad platform reporting limits the geo precision you can validate against: Meta Insights exposes only country/region/DMA breakdowns (city/ZIP performance must come from first-party orders), whereas Google Ads lets you query `segments.geo_target_city`, `segments.geo_target_postal_code`, etc. Seeded datasets should reflect the granularity actually available in downstream reporting.
- Refresh Open-Meteo caches with `python scripts/weather/fetch_open_meteo.py --output storage/seeds/open_meteo`; it defaults to the brand scenario geos and pulls ~3 years of daily history per location.
- Use `scripts/weather/us_top20_metros.json` with the same fetcher (`--config scripts/weather/us_top20_metros.json --skip-defaults`) to pre-seed the top U.S. metros for prospect demos.
