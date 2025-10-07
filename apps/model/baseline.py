"""Baseline + weather modelling utilities.

The real implementation will train pyGAM/statsmodels models. For now we fit a simple
linear regression via Polars to keep the scaffolding testable. The API mirrors what the
future model service will return (coefficients, intercept, r2, etc.).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import polars as pl


@dataclass
class BaselineModel:
    coefficients: Dict[str, float]
    intercept: float
    features: List[str]
    target: str

    def predict(self, frame: pl.DataFrame) -> pl.Series:
        prediction = pl.lit(self.intercept)
        for feature, coef in self.coefficients.items():
            if feature in frame.columns:
                prediction = prediction + pl.col(feature) * coef
        return prediction


def fit_baseline_model(frame: pl.DataFrame, target: str, features: List[str]) -> BaselineModel:
    if frame.is_empty():
        return BaselineModel(coefficients={}, intercept=0.0, features=features, target=target)

    df = frame.select([target] + features).drop_nulls()
    if df.is_empty():
        return BaselineModel(coefficients={}, intercept=0.0, features=features, target=target)

    # Convert to numpy for the stub logistic. Production will use pyGAM/statsmodels.
    import numpy as np

    y = df[target].to_numpy()
    X = np.column_stack([np.ones(len(df))] + [df[col].to_numpy() for col in features])
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    intercept = float(coef[0])
    coefficients = {feature: float(value) for feature, value in zip(features, coef[1:])}
    # TODO(baseline): replace numpy lstsq with pyGAM/statsmodels once production models are added.
    return BaselineModel(coefficients=coefficients, intercept=intercept, features=features, target=target)



def evaluate_r2(model: BaselineModel, frame: pl.DataFrame) -> float:
    if frame.is_empty():
        return 0.0
    target = model.target
    if target not in frame.columns:
        return 0.0
    import numpy as np

    df = frame.select([target] + model.features).drop_nulls()
    if df.is_empty():
        return 0.0
    y = df[target].to_numpy()
    preds = np.array(model.intercept) + sum(model.coefficients.get(f, 0.0) * df[f].to_numpy() for f in model.features)
    ss_tot = float(((y - y.mean()) ** 2).sum())
    ss_res = float(((y - preds) ** 2).sum())
    return float(1 - ss_res / ss_tot) if ss_tot else 0.0
