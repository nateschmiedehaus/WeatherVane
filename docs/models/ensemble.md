# Multi-Horizon Ensemble Forecasting

WeatherVane blends multiple forecasters to project future revenue across the next
week of decision windows. The ensemble is optimised for scaffolding environments:
it reuses the leakage-screened feature matrix produced by `FeatureBuilder`, keeps
the time-series validation split aligned with `ts_training.fit_timeseries`, and
produces quantile projections that downstream allocators can safely consume.

## Components

- **Baseline model** – The GAM/linear baseline captures smooth relationships
  between weather + marketing signals and near-term revenue.
- **Time-series regressor** – Imports the LightGBM-or-fallback estimator from
  `ts_training` and respects the blocked holdout window defined there.
- **Naive reference** – A conservative mean forecast stabilises the blend when
  data is sparse or covariates are noisy.

Weights are derived from holdout RMSE; when the ensemble detects insufficient
holdout coverage it gracefully falls back to equal weighting.

## Residual sampling & quantiles

Residuals from the observed window are bootstrapped to generate forecast
distributions. Longer horizons inflate residual variance with a √h scale factor,
mirroring the increasing uncertainty embedded in weather and marketing plans.
The output includes `p10`, `p50`, and `p90` quantiles per day, enabling allocators
to make risk-aware decisions without running bespoke scenario samplers.

## Artifacts & wiring

- Prefect task `generate_ensemble_forecast` produces the ensemble payload and
  writes it to `experiments/forecast/ensemble_metrics.json`.
- Downstream consumers (dashboards, allocators, reporting) can subscribe to that
  artifact or inspect the task result returned in the PoC flow output.

The artifact captures component weights, residual diagnostics, and horizon-level
MAE/RMSE so QA reviewers can quickly assess robustness before shipping.
