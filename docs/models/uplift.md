# Causal Uplift Modelling

## Overview

WeatherVane now ships a causal uplift modelling module (`apps/model/uplift.py`) that estimates incremental lift between treatment and control cohorts using a two-model approach. Separate regressors are trained for treated and untreated observations, enabling us to predict the counterfactual outcome for every row and compute uplift as the difference between those predictions.

## Data Requirements

- Numeric outcome column (defaults to `net_revenue`).
- Binary treatment indicator column (defaults to `treatment`).
- One or more numerical feature columns; non-numeric or single-valued columns are automatically excluded.
- Enough rows per cohort (the model falls back to a mean regressor when fewer than 20 samples exist or when no usable features remain).

The training entry point accepts a Polars `DataFrame` and handles cleaning (dropping rows with missing treatment/target values and casting to numeric types).

## Training & Validation

1. Split the cleaned dataset into training and validation sets using stratified sampling on the treatment flag.
2. Fit RandomForest regressors for the treatment and control cohorts independently (falling back to a `DummyRegressor` when data is sparse).
3. Generate predictions for both counterfactual outcomes on train and validation splits.

The module reports:

- Observed ATE (difference in actual means) for train/validation.
- Predicted ATE (mean predicted uplift) for train/validation.
- Cohort RMSE for train/validation.
- Qini AUC (uplift curve area minus randomized baseline).
- Segment level metrics for configurable top-percentile slices (top 10% and 25% by default).

Validation previews contain sample rows with treatment flag, actual outcome, predicted treatment/control values, predicted uplift, and up to the first three feature values for fast debugging.

## Artifact & CLI

Running the synthetic harness (`python tools/generate_sample_uplift_report.py`) materialises a deterministic report at `experiments/causal/uplift_report.json`. This artifact powers causal QA and can be regenerated for bespoke datasets via:

```bash
PYTHONPATH=.deps:. python tools/generate_sample_uplift_report.py
```

The JSON payload includes configuration, dataset statistics, performance metrics, key segment summaries, and sample validation records.
