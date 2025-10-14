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

GAP_DAYS = 7
CV_SPLITS = 5
HOLDOUT_WEEKS = 8


def _probe_import(module: str) -> bool:
    import subprocess
    import sys

    try:
        result = subprocess.run(
            [sys.executable, "-c", f"import {module}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=5,
        )
    except Exception:
        return False
    return result.returncode == 0


_HAS_SKLEARN = _probe_import("sklearn")

if _HAS_SKLEARN:  # pragma: no cover - exercised when sklearn is available
    from sklearn.dummy import DummyRegressor as _SkDummyRegressor
    from sklearn.model_selection import TimeSeriesSplit as _SkTimeSeriesSplit
else:
    _SkDummyRegressor = None
    _SkTimeSeriesSplit = None

try:  # pragma: no cover - exercised when lightgbm is available
    if _probe_import("lightgbm"):
        from lightgbm import LGBMRegressor as _RealLGBMRegressor  # type: ignore[misc]
    else:
        _RealLGBMRegressor = None
except Exception:  # pragma: no cover - missing native lightgbm
    _RealLGBMRegressor = None


class _FallbackDummyRegressor:
    """Simple mean predictor used when sklearn is unavailable."""

    def __init__(self) -> None:
        self._mean = 0.0

    def fit(self, X, y, **_: object) -> "_FallbackDummyRegressor":
        values = np.asarray(y, dtype=float)
        self._mean = float(values.mean()) if values.size else 0.0
        return self

    def predict(self, X) -> np.ndarray:
        X = np.asarray(X)
        length = X.shape[0] if X.ndim > 0 else 1
        return np.full(length, self._mean, dtype=float)

    def score(self, X, y) -> float:
        targets = np.asarray(y, dtype=float)
        if targets.size == 0:
            return 0.0
        preds = self.predict(X)
        ss_tot = float(((targets - targets.mean()) ** 2).sum())
        if ss_tot == 0:
            return 0.0
        ss_res = float(((targets - preds) ** 2).sum())
        return 1.0 - ss_res / ss_tot


class _FallbackTimeSeriesSplit:
    """Lightweight time-series splitter mirroring sklearn API."""

    def __init__(self, n_splits: int, gap: int = 0) -> None:
        self.n_splits = max(1, int(n_splits))
        self.gap = max(0, int(gap))

    def split(self, X):
        X = np.asarray(X)
        n_samples = len(X)
        if n_samples < 2:
            return
        fold_size = max(1, n_samples // (self.n_splits + 1))
        for idx in range(self.n_splits):
            train_end = fold_size * (idx + 1)
            if train_end <= 0:
                continue
            test_start = min(train_end + self.gap, n_samples)
            test_end = min(test_start + fold_size, n_samples)
            if test_start >= test_end:
                continue
            yield np.arange(train_end), np.arange(test_start, test_end)


class _FallbackLinearRegressor:
    """Minimal linear regressor used when LightGBM is unavailable."""

    def __init__(
        self,
        objective: str = "regression",
        n_estimators: int = 200,
        learning_rate: float = 0.05,
        subsample: float = 0.8,
        colsample_bytree: float = 0.8,
        reg_alpha: float = 0.1,
        reg_lambda: float = 0.1,
        random_state: int | None = None,
    ) -> None:
        self.objective = objective
        self.learning_rate = learning_rate
        self.subsample = subsample
        self.colsample_bytree = colsample_bytree
        self.reg_alpha = reg_alpha
        self.reg_lambda = reg_lambda
        self.random_state = random_state
        self._coef = np.array([], dtype=float)
        self._intercept = 0.0

    def fit(self, X, y, categorical_feature=None, verbose=False):  # type: ignore[override]
        features = np.asarray(X, dtype=float)
        targets = np.asarray(y, dtype=float)
        if features.ndim == 1:
            features = features.reshape(-1, 1)
        if features.size == 0 or targets.size == 0:
            self._coef = np.zeros(features.shape[1] if features.ndim == 2 else 0, dtype=float)
            self._intercept = float(targets.mean()) if targets.size else 0.0
            return self
        design = np.column_stack([np.ones(features.shape[0]), features])
        coef, *_ = np.linalg.lstsq(design, targets, rcond=None)
        self._intercept = float(coef[0])
        self._coef = np.asarray(coef[1:], dtype=float)
        return self

    def predict(self, X) -> np.ndarray:
        features = np.asarray(X, dtype=float)
        if features.ndim == 1:
            features = features.reshape(-1, 1)
        if self._coef.size == 0:
            return np.full(features.shape[0], self._intercept, dtype=float)
        return np.asarray(self._intercept + features @ self._coef, dtype=float)

    def score(self, X, y) -> float:
        targets = np.asarray(y, dtype=float)
        if targets.size == 0:
            return 0.0
        preds = self.predict(X)
        ss_tot = float(((targets - targets.mean()) ** 2).sum())
        if ss_tot == 0:
            return 0.0
        ss_res = float(((targets - preds) ** 2).sum())
        return 1.0 - ss_res / ss_tot


DummyRegressor = _SkDummyRegressor or _FallbackDummyRegressor
TimeSeriesSplit = _SkTimeSeriesSplit or _FallbackTimeSeriesSplit
LGBMRegressor = _RealLGBMRegressor or _FallbackLinearRegressor


@dataclass
class FitResult:
    model: LGBMRegressor
    cv_scores: List[float]
    holdout_r2: float
    features: List[str]
    target: str


def _normalise_date_column(frame: pl.DataFrame, date_col: str) -> pl.DataFrame:
    if date_col not in frame.columns:
        raise KeyError(f"Date column `{date_col}` not found in feature matrix")

    dtype = frame.get_column(date_col).dtype
    string_like = {pl.Utf8}
    # Polars renamed Utf8 -> String in newer versions; guard for both.
    if hasattr(pl, "String"):
        string_like.add(pl.String)  # type: ignore[arg-type]

    if dtype in string_like:
        return frame.with_columns(
            pl.col(date_col).str.strptime(pl.Date, strict=False).alias(date_col)
        )

    return frame.with_columns(pl.col(date_col).cast(pl.Date, strict=False).alias(date_col))


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

    frame = _normalise_date_column(frame, date_col)
    frame = _ensure_sorted(frame, date_col)
    categorical = set(categorical or [])

    feature_matrix = frame.select(features)
    X_full = feature_matrix.to_numpy()
    y_full = frame[target].to_numpy()

    # Prepare holdout split (last HOLDOUT_WEEKS weeks).
    max_date = frame[date_col].max()
    if not isinstance(max_date, np.datetime64):
        max_date = np.datetime64(max_date)
    cutoff = max_date - np.timedelta64(HOLDOUT_WEEKS * 7, "D")
    train = frame.filter(pl.col(date_col) < cutoff)
    holdout = frame.filter(pl.col(date_col) >= cutoff)

    fallback_mode = train.is_empty() or holdout.is_empty() or train.height < len(features) + 1

    if fallback_mode:
        dummy = DummyRegressor(strategy="mean") if _HAS_SKLEARN else DummyRegressor()
        return FitResult(
            model=dummy.fit(X_full, y_full),
            cv_scores=[],
            holdout_r2=0.0,
            features=list(features),
            target=target,
        )

    model = LGBMRegressor(
        objective="regression",
        n_estimators=200,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        reg_alpha=0.1,
        reg_lambda=0.1,
        random_state=seed,
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
