# Weather-Aware Baseline GAM

## Objective
The baseline model provides fast, explainable revenue forecasts that respond to weather volatility and marketing inputs. It anchors downstream allocators and benchmarking dashboards by capturing:
- Smooth non-linear responses to temperature and precipitation anomalies.
- Interactions between weather shifts and paid spend.
- Seasonality encoded in the feature store’s lag/rolling generators.
- Guardrails to avoid leakage, overfitting, and brittle coefficients when data is sparse.

## Data Contract
Input matrices come from `shared.feature_store.FeatureBuilder` and must contain at minimum:
- `net_revenue` target.
- Weather columns: `temp_c`, `temp_anomaly`, `temp_roll7`, `precip_mm`, `precip_anomaly`, `precip_roll7`.
- Marketing intensity columns such as `*_spend`, `*_conversions`, or promo counts.
We drop rows with nulls across the selected features and filter out degenerate columns (non-numeric or single unique value) before fitting.

## Modelling Stack
1. **Primary learner – pyGAM LinearGAM**
   - Uses additive smoothers for every numeric feature (`s()` terms).
   - Weather signals receive higher spline capacity (up to 12 knots) to let the model capture threshold effects (e.g., heat domes, rain-outs).
   - Up to three tensor interaction terms (`te()`) couple weather and marketing spend so we can model scenario-dependent ROAS shifts.
   - Regularisation (`λ`) is tuned using a small log-spaced grid via `gam.gridsearch` with absolute-revenue weights (`|y|` clipped to ≥1) to stabilise heteroskedastic tenants.
   - If grid search struggles (e.g., collinear features), we retry with direct `gam.fit` and finally with a vanilla `LinearGAM` instance before conceding to the linear fallback.
   - Iterations capped at 200 to keep training deterministic in CI.
2. **Fallback – deterministic linear regression**
   - Engaged when pyGAM is unavailable or the dataset is too small (< `max(24, 4 * feature_count)` rows).
   - Solved with `numpy.linalg.lstsq` to maintain compatibility with legacy scaffolding tests.
   - Reverts to an intercept-only mean model when no usable features remain.

## Evaluation Utilities
`evaluate_r2` recomputes R² on any Polars frame by replaying the GAM or linear coefficients. For GAMs we call `gam.predict` directly; the fallback path reconstructs predictions from the stored intercept and coefficients. Both branches drop rows with null targets to protect telemetry jobs.

## Operational Considerations
- **Feature hygiene:** We explicitly require numeric dtypes and ≥2 distinct values per feature. This protects the GAM solver from singular basis matrices and keeps the linear fallback stable.
- **Leakage mitigation:** The upstream feature builder strips forecast/forward-looking rows. The baseline’s guardrails assume that invariant.
- **Explainability:** pyGAM supports partial dependence and marginal effects out of the box; we retain the fitted `gam` object in `BaselineModel` so future services can expose those diagnostics (e.g., via `gam.partial_dependence`).
- **Runtime:** The grid search and smoothers complete in <1s for typical 6–12 month daily slices in local testing. If longer runs arise, queue them with the heavy-job infra before productionising.

## Training Pipeline
Run the dedicated trainer to fit and persist tenant-specific baselines:

```bash
python -m apps.model.train TENANT_ID --end 2024-01-31 --lookback-days 365
```

Key flags:
- `--start/--end` – override lookback window (defaults to `end=today`, `start=end-lookback`).
- `--lake-root` – alternate storage mount when replaying experiments.
- `--output-root` – where to persist `baseline_model.pkl`, `metadata.json`, and optional `holdout_diagnostics.parquet`.
- `--run-id` – stable identifier for reproducible reruns.

Artifacts captured under `storage/models/baseline/<tenant>/<run-id>/`:
- `baseline_model.pkl` – pickled `BaselineModel` retaining the fitted GAM for downstream scoring.
- `metadata.json` – diagnostics payload (window, guardrail status, training/holdout metrics, feature influence rankings, GAM usage reason).
- `holdout_diagnostics.parquet` – optional per-row holdout frame with predictions/residuals for monitoring.

Evaluation protocol:
- Deterministic chronological split (80/20 with ≥14-day holdout) computed on leakage-sanitised observations.
- Metrics reported for training + holdout: R², MAE, RMSE, bias, and prediction spread.
- Feature influence derived from absolute correlation between predictions and each retained regressor to spotlight weather vs. marketing drivers.
- Guardrail metadata surfaces forward/forecast leakage removals so causal reviewers can audit drops before allocator hand-off.

## Next Steps
1. Export marginal effects + confidence bands for UI and allocator introspection.
2. Layer in hierarchical pooling (geo × category) once tenant coverage broadens.
3. Extend interaction search to include humidity, wind, and promo cadence, gated by causal reviews.
