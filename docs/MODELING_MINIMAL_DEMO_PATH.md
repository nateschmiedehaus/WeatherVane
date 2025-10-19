# Minimal ML Demo Path

This guide describes how to exercise the WeatherVane modeling stack on a lightweight synthetic dataset. The script and tests below run end-to-end in seconds, making them safe for demos or CI smoke checks on constrained hardware.

By default the demo seeds one product/category focused on a single geo (San Francisco, CA). Optional flags let you widen or shift that scope without touching any other tooling.

## Quickstart

```bash
# Seeds 14 days of synthetic data for a single product/geo, trains the baseline model, and runs a marketing mix solve.
make demo-ml
```

Artifacts land under `tmp/demo_ml/`:

- `tmp/demo_ml/lake/` – synthetic Shopify/ads/weather/parquet snapshots.
- `tmp/demo_ml/models/<tenant>/...` – baseline model pickle + metadata.
- Console output summarises ROAS recommendations from a toy MMM scenario.

The demo script automatically disables optional heavy dependencies (`WEATHERVANE_ENABLE_SCIPY=0`, `PYGAM_DISABLE=1`) so it can run on laptops without SciPy/pyGAM.

## Automated brand scoping

When live connector data exists for a tenant, generate a brand-specific demo plan that highlights the minimum viable proof-of-concept:

```bash
# Analyse available datasets and recommend scope/tasks
make demo-plan DEMO_TENANT=brand-x DEMO_LAKE_ROOT=/path/to/storage/lake/raw DEMO_PLAN_OUTPUT=tmp/brand_x_plan.json

# Run the demo using the generated plan (auto-selects geo/product/history)
make demo-ml DEMO_TENANT=brand-x DEMO_PLAN=tmp/brand_x_plan.json
```

`demo-plan` inspects Shopify orders, products, ads, promos, and weather feeds to determine:

- Suggested history window (days/years) and geo focus, based on revenue coverage.
- Top product/category to showcase in the walkthrough.
- Missing connectors and data prerequisites, surfaced as a prioritized task list.

If core signals are absent, the plan explicitly lists the integrations Autopilot must complete before running the brand proof. Autopilot can then execute “fill the gaps” (connector wiring) followed by the `demo-ml` run with the same plan file, giving prospects a self-serve proof with minimal human labor.

## What the demo covers

1. **Synthetic data seeding** via `shared.libs.testing.synthetic.seed_synthetic_tenant`, optionally injecting a small weather shock.
2. **Baseline training** by calling `apps.model.train.train_baseline` with the synthetic lake as input.
3. **Allocator walkthrough** using a static `MMMModel` + `solve_marketing_mix` to produce channel recommendations without invoking any optional solvers.

## Recommended follow-up checks

Run these tests to validate the same minimal pipeline under pytest:

```bash
# Baseline training and feature store smoke
pytest tests/model/test_model_pipeline.py::test_model_pipeline

# Marketing-mix solver heuristics on synthetic scenarios
pytest tests/test_marketing_mix_solver.py
```

Both tests rely on the synthetic helpers and finish quickly (<10s on an M1 Air).

## Customisation tips

- Change the tenant or history window with Makefile variables:

  ```bash
  make demo-ml DEMO_TENANT=tenant-x DEMO_DAYS=21
  ```

- Or specify years instead of days (e.g., 3-year history):

  ```bash
  make demo-ml DEMO_YEARS=3
  ```

- Focus on a specific geo or product label:

  ```bash
  make demo-ml DEMO_GEO_LAT=34.0522 DEMO_GEO_LON=-118.2437 DEMO_PRODUCT=prod-123 DEMO_CATEGORY="cold-weather"
  ```

- Consume the autoplan output directly:

  ```bash
  make demo-plan DEMO_TENANT=brand-x DEMO_PLAN_OUTPUT=tmp/brand_x_plan.json
  make demo-ml DEMO_TENANT=brand-x DEMO_PLAN=tmp/brand_x_plan.json
  ```

- Run the script directly to enable the optional weather shock preview:

  ```bash
  PYTHONPATH=. python scripts/minimal_ml_demo.py --seed-weather-shock
  ```
  or via Makefile: `make demo-ml DEMO_SEED_WEATHER_SHOCK=1`.

- Clean up demo artifacts with `rm -rf tmp/demo_ml`.

Keep this flow lean—if you add new required features to the main pipeline, update `scripts/minimal_ml_demo.py` so the demo still exercises the critical path without high compute demands.
