"""High-level modelling pipeline used by the PoC flow."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import numpy as np
import polars as pl

from apps.model.baseline import BaselineModel, fit_baseline_model, evaluate_r2
from apps.model.mmm import MMMModel, fit_mmm_model
from apps.model.ts_training import fit_timeseries


@dataclass
class ModelBundle:
    baseline: BaselineModel
    mmm: MMMModel
    diagnostics: Dict[str, float]
    quantiles: Dict[str, Dict[str, float]]


def train_poc_models(matrix: Dict[str, list], target: str = "net_revenue") -> ModelBundle:
    frame = pl.DataFrame(matrix)
    if frame.is_empty():
        empty_model = BaselineModel(coefficients={}, intercept=0.0, features=[], target=target)
        return ModelBundle(
            baseline=empty_model,
            mmm=MMMModel(base_roas=0.0, elasticity={}, features=[]),
            diagnostics={"row_count": 0.0, "feature_columns": 0.0, "baseline_r2": 0.0, "average_roas": 0.0},
            quantiles={"expected_revenue": {"p10": 0.0, "p50": 0.0, "p90": 0.0}},
        )

    feature_cols = [
        col
        for col in frame.columns
        if col != target and frame[col].dtype in (pl.Float64, pl.Float32, pl.Int64, pl.Int32)
    ]
    baseline = fit_baseline_model(frame, target=target, features=feature_cols)

    ts_result = fit_timeseries(frame.select(["date"] + feature_cols + [target]), "date", target, feature_cols)

    spend_cols = [col for col in frame.columns if "spend" in col]
    mmm = fit_mmm_model(frame, spend_cols=spend_cols, revenue_col=target)

    preds = baseline.predict(frame).to_numpy()
    q10 = float(np.quantile(preds, 0.10))
    q50 = float(np.quantile(preds, 0.50))
    q90 = float(np.quantile(preds, 0.90))

    diagnostics = {
        "row_count": float(frame.height),
        "feature_columns": float(len(feature_cols)),
        "baseline_r2": evaluate_r2(baseline, frame),
        "average_roas": mmm.base_roas,
        "cv_mean": float(np.mean(ts_result.cv_scores) if ts_result.cv_scores else 0.0),
        "holdout_r2": ts_result.holdout_r2,
    }
    quantiles = {"expected_revenue": {"p10": q10, "p50": q50, "p90": q90}}
    return ModelBundle(baseline=baseline, mmm=mmm, diagnostics=diagnostics, quantiles=quantiles)
