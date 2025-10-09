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

try:  # LightGBM is optional during scaffolding; swap in a fallback when missing.
    from lightgbm import LGBMRegressor
except (ImportError, OSError):  # pragma: no cover - fall back when native lib missing.
    from sklearn.ensemble import HistGradientBoostingRegressor

    class LGBMRegressor(HistGradientBoostingRegressor):  # type: ignore[misc]
        """Minimal LightGBM lookalike so pipelines continue in constrained envs."""

        def __init__(
            self,
            objective: str = "regression",
            n_estimators: int = 600,
            learning_rate: float = 0.05,
            subsample: float = 0.8,
            colsample_bytree: float = 0.8,
            reg_alpha: float = 0.1,
            reg_lambda: float = 0.1,
            random_state: int | None = None,
        ) -> None:
            super().__init__(
                max_iter=n_estimators,
                learning_rate=learning_rate,
                l2_regularization=reg_lambda,
                random_state=random_state,
            )
            self.objective = objective
            self.subsample = subsample
            self.colsample_bytree = colsample_bytree
            self.reg_alpha = reg_alpha
            self.reg_lambda = reg_lambda
            self.n_estimators = n_estimators
            self.learning_rate = learning_rate
            self.random_state = random_state

        # Align the API surface expected by the pipeline.
        def fit(self, X, y, categorical_feature=None, verbose=False):  # type: ignore[override]
            return super().fit(X, y)

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
    if not bool(frame[date_col].is_sorted()):
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

    frame = frame.with_columns(pl.col(date_col).str.strptime(pl.Date, strict=False).alias(date_col))
    frame = _ensure_sorted(frame, date_col)
    categorical = set(categorical or [])

    feature_matrix = frame.select(features)
    X_full = feature_matrix.to_numpy()
    y_full = frame[target].to_numpy()

    # Prepare holdout split (last HOLDOUT_WEEKS weeks).
    max_date = frame[date_col].max()
    cutoff = max_date - np.timedelta64(HOLDOUT_WEEKS * 7, "D")
    train = frame.filter(pl.col(date_col) < cutoff)
    holdout = frame.filter(pl.col(date_col) >= cutoff)

    fallback_mode = train.is_empty() or holdout.is_empty() or train.height < len(features) + 1

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

    if fallback_mode:
        model.fit(X_full, y_full, categorical_feature=list(categorical), verbose=False)
        return FitResult(
            model=model,
            cv_scores=[],
            holdout_r2=0.0,
            features=list(features),
            target=target,
        )

    X = train.select(features).to_numpy()
    y = train[target].to_numpy()

    tscv = TimeSeriesSplit(n_splits=min(CV_SPLITS, max(2, train.height // 2)), gap=GAP_DAYS)
    cv_scores: List[float] = []

    for train_idx, val_idx in tscv.split(X):
        model.fit(X[train_idx], y[train_idx], categorical_feature=list(categorical), verbose=False)
        cv_scores.append(float(model.score(X[val_idx], y[val_idx])))

    model.fit(X, y, categorical_feature=list(categorical), verbose=False)

    X_holdout = holdout.select(features).to_numpy()
    y_holdout = holdout[target].to_numpy()
    holdout_r2 = float(model.score(X_holdout, y_holdout)) if len(y_holdout) else 0.0

    return FitResult(
        model=model,
        cv_scores=cv_scores,
        holdout_r2=holdout_r2,
        features=list(features),
        target=target,
    )
