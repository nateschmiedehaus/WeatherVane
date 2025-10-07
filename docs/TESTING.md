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