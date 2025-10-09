"""Baseline + weather modelling utilities.

The real implementation will train pyGAM/statsmodels models. For now we fit a simple
linear regression via Polars to keep the scaffolding testable. The API mirrors what the
future model service will return (coefficients, intercept, r2, etc.).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

import polars as pl

try:  # pragma: no cover - optional dependency
    from pygam import LinearGAM
except Exception:  # pragma: no cover - optional dependency not installed
    LinearGAM = None


@dataclass
class BaselineModel:
    coefficients: Dict[str, float]
    intercept: float
    features: List[str]
    target: str
    gam: Any | None = None

    def predict(self, frame: pl.DataFrame) -> pl.Series:
        if self.gam is not None and self.features:
            X = frame.select(self.features).to_numpy()
            import numpy as np

            preds = self.gam.predict(X)
            return pl.Series(name="prediction", values=np.asarray(preds))

        prediction = pl.lit(self.intercept)
        for feature, coef in self.coefficients.items():
            if feature in frame.columns:
                prediction = prediction + pl.col(feature) * coef
        return frame.select(prediction.alias("prediction")).to_series()


def fit_baseline_model(frame: pl.DataFrame, target: str, features: List[str]) -> BaselineModel:
    if frame.is_empty():
        return BaselineModel(coefficients={}, intercept=0.0, features=features, target=target)

    df = frame.select([target] + features).drop_nulls()
    if df.is_empty():
        return BaselineModel(coefficients={}, intercept=0.0, features=features, target=target)

    if LinearGAM and features:
        try:
            X = df.select(features).to_numpy()
            y = df[target].to_numpy()
            gam = LinearGAM().fit(X, y)
            return BaselineModel(
                coefficients={},
                intercept=float(gam.statistics_["intercept"] if "intercept" in gam.statistics_ else gam.coef_[0]),
                features=features,
                target=target,
                gam=gam,
            )
        except Exception:  # pragma: no cover - fallback to linear regression
            pass

    # Fallback: simple linear regression via numpy lstsq.
    import numpy as np

    y = df[target].to_numpy()
    X = np.column_stack([np.ones(len(df))] + [df[col].to_numpy() for col in features])
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    intercept = float(coef[0])
    coefficients = {feature: float(value) for feature, value in zip(features, coef[1:])}
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
    if model.gam is not None and model.features:
        preds = model.gam.predict(df.select(model.features).to_numpy())
    else:
        preds = np.array(model.intercept) + sum(
            model.coefficients.get(f, 0.0) * df[f].to_numpy() for f in model.features
        )
    ss_tot = float(((y - y.mean()) ** 2).sum())
    ss_res = float(((y - preds) ** 2).sum())
    return float(1 - ss_res / ss_tot) if ss_tot else 0.0
