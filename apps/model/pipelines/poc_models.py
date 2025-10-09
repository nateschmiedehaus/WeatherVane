"""High-level modelling pipeline used by the PoC flow."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import numpy as np
import polars as pl

from apps.model.baseline import BaselineModel, fit_baseline_model, evaluate_r2
from apps.model.mmm import MMMModel, fit_mmm_model
from apps.model.ts_training import FitResult, fit_timeseries


@dataclass
class ModelBundle:
    baseline: BaselineModel
    mmm: MMMModel
    diagnostics: Dict[str, float]
    quantiles: Dict[str, Dict[str, float]]
    timeseries: FitResult | None


def train_poc_models(matrix: Dict[str, list], target: str = "net_revenue") -> ModelBundle:
    frame = pl.DataFrame(matrix)
    if frame.is_empty():
        empty_model = BaselineModel(coefficients={}, intercept=0.0, features=[], target=target)
        return ModelBundle(
            baseline=empty_model,
            mmm=MMMModel(base_roas=0.0, elasticity={}, mean_roas={}, mean_spend={}, features=[]),
            diagnostics={
                "row_count": 0.0,
                "feature_columns": 0.0,
                "baseline_r2": 0.0,
                "timeseries_r2": 0.0,
                "average_roas": 0.0,
                "cv_mean": 0.0,
                "holdout_r2": 0.0,
                "mae": 0.0,
                "rmse": 0.0,
                "bias": 0.0,
                "prediction_std": 0.0,
                "quantile_width": 0.0,
            },
            quantiles={"expected_revenue": {"p10": 1.0, "p50": 1.0, "p90": 1.0}},
            timeseries=None,
        )

    feature_cols = [
        col
        for col in frame.columns
        if col != target and frame[col].dtype in (pl.Float64, pl.Float32, pl.Int64, pl.Int32)
    ]
    baseline = fit_baseline_model(frame, target=target, features=feature_cols)

    ts_frame = frame.select(["date"] + feature_cols + [target])
    ts_result = fit_timeseries(ts_frame, "date", target, feature_cols)
    ts_features = frame.select(feature_cols)
    ts_predictions = ts_result.model.predict(ts_features.to_numpy())

    spend_cols = [col for col in frame.columns if "spend" in col]
    mmm = fit_mmm_model(frame, spend_cols=spend_cols, revenue_col=target)

    actuals = frame[target].to_numpy()
    residuals = actuals - ts_predictions

    with np.errstate(divide="ignore", invalid="ignore"):
        prediction_safe = np.where(np.abs(ts_predictions) < 1e-6, 1.0, ts_predictions)
        ratio_residuals = residuals / prediction_safe
    distribution = np.clip(1.0 + ratio_residuals, 0.0, None)
    q10 = float(np.quantile(distribution, 0.10))
    q50 = float(np.quantile(distribution, 0.50))
    q90 = float(np.quantile(distribution, 0.90))

    mae = float(np.mean(np.abs(residuals)))
    rmse = float(np.sqrt(np.mean(residuals ** 2)))
    bias = float(np.mean(residuals))
    quantile_width = q90 - q10
    prediction_std = float(np.std(ts_predictions))
    timeseries_r2 = float(ts_result.model.score(ts_features.to_numpy(), actuals))

    diagnostics = {
        "row_count": float(frame.height),
        "feature_columns": float(len(feature_cols)),
        "baseline_r2": evaluate_r2(baseline, frame),
        "timeseries_r2": timeseries_r2,
        "average_roas": mmm.base_roas,
        "cv_mean": float(np.mean(ts_result.cv_scores) if ts_result.cv_scores else 0.0),
        "holdout_r2": ts_result.holdout_r2,
        "mae": mae,
        "rmse": rmse,
        "bias": bias,
        "prediction_std": prediction_std,
        "quantile_width": quantile_width,
    }
    quantiles = {"expected_revenue": {"p10": q10, "p50": q50, "p90": q90}}
    return ModelBundle(
        baseline=baseline,
        mmm=mmm,
        diagnostics=diagnostics,
        quantiles=quantiles,
        timeseries=ts_result,
    )
