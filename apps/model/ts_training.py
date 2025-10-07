"""Time-series training utilities for WeatherVane models.

This module centralises temporal validation so every supervised learner respects
chronology and leakage checks. Production models will likely wrap pyGAM, LightGBM,
and other learners here. For now we provide a LightGBM regressor baseline.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Sequence

import numpy as np
import polars as pl
from sklearn.model_selection import TimeSeriesSplit

try:  # LightGBM is optional during scaffolding; raise guidance if missing.
    from lightgbm import LGBMRegressor
except ImportError as exc:  # pragma: no cover - informing developers at runtime.
    raise ImportError(
        "lightgbm is required for ts_training. Install with `pip install lightgbm`."
    ) from exc

GAP_DAYS = 7
CV_SPLITS = 5
HOLDOUT_WEEKS = 8


@dataclass
class FitResult:
    model: LGBMRegressor
    cv_scores: List[float]
    holdout_r2: float
    features: List[str]
    target: str


def _ensure_sorted(frame: pl.DataFrame, date_col: str) -> pl.DataFrame:
    if date_col not in frame.columns:
        raise KeyError(f"Date column `{date_col}` not found in feature matrix")
    if not frame[date_col].is_sorted().all():
        raise ValueError("Feature matrix must be sorted chronologically by date column")
    return frame


def fit_timeseries(
    frame: pl.DataFrame,
    date_col: str,
    target: str,
    features: Sequence[str],
    categorical: Iterable[str] | None = None,
    seed: int = 42,
) -> FitResult:
    """Fit a LightGBM regressor with blocked time-series CV and holdout evaluation."""

    if frame.is_empty():
        raise ValueError("Feature matrix is empty; cannot train models")

    frame = _ensure_sorted(frame, date_col)
    categorical = set(categorical or [])

    # Prepare holdout split (last HOLDOUT_WEEKS weeks).
    max_date = frame[date_col].max()
    cutoff = max_date - np.timedelta64(HOLDOUT_WEEKS * 7, "D")
    train = frame.filter(pl.col(date_col) < cutoff)
    holdout = frame.filter(pl.col(date_col) >= cutoff)

    if train.is_empty() or holdout.is_empty():
        raise ValueError("Insufficient history for holdout evaluation; collect more data")

    X = train.select(features).to_numpy()
    y = train[target].to_numpy()

    model = LGBMRegressor(
        objective="regression",
        n_estimators=600,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=0.1,
        random_state=seed,
    )

    tscv = TimeSeriesSplit(n_splits=CV_SPLITS, gap=GAP_DAYS)
    cv_scores: List[float] = []

    for train_idx, val_idx in tscv.split(X):
        model.fit(X[train_idx], y[train_idx], categorical_feature=list(categorical), verbose=False)
        cv_scores.append(float(model.score(X[val_idx], y[val_idx])))

    model.fit(X, y, categorical_feature=list(categorical), verbose=False)

    X_holdout = holdout.select(features).to_numpy()
    y_holdout = holdout[target].to_numpy()
    holdout_r2 = float(model.score(X_holdout, y_holdout))

    return FitResult(
        model=model,
        cv_scores=cv_scores,
        holdout_r2=holdout_r2,
        features=list(features),
        target=target,
    )
