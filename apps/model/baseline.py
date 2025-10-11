"""Baseline + weather modelling utilities.

We train a weather-aware Generalised Additive Model (GAM) when pyGAM is available and
fall back to a deterministic linear regression otherwise. The GAM captures smooth
non-linear relationships for weather + marketing signals, along with limited
interactions, while respecting small-sample guardrails so that scaffolding tests can
continue to run without the optional dependency.
"""
from __future__ import annotations

import itertools
import subprocess
import sys
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, List, Sequence

import numpy as np
import polars as pl

LinearGAM: Any | None = None
s: Any | None = None
te: Any | None = None
_PYGAM_INITIALISED = False


def _ensure_pygam_loaded() -> None:
    """Attempt to import pyGAM in a crash-safe way.

    Some sandboxed environments ship partial pyGAM builds that segfault during import.
    We first probe the dependency in a subprocess so the main interpreter survives
    those failures and can fall back to linear regression.
    """
    global LinearGAM, s, te, _PYGAM_INITIALISED
    if _PYGAM_INITIALISED:
        return
    _PYGAM_INITIALISED = True
    try:
        result = subprocess.run(  # pragma: no cover - defensive subprocess probe
            [sys.executable, "-c", "import pygam"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=5,
        )
        if result.returncode != 0:
            return
        from pygam import LinearGAM as _LinearGAM, s as _s, te as _te
    except Exception:  # pragma: no cover - pyGAM missing or unsafe
        return
    LinearGAM = _LinearGAM
    s = _s
    te = _te


_ensure_pygam_loaded()


NUMERIC_DTYPES = {
    pl.Float64,
    pl.Float32,
    pl.Int64,
    pl.Int32,
    pl.Int16,
    pl.Int8,
    pl.UInt64,
    pl.UInt32,
    pl.UInt16,
    pl.UInt8,
}

WEATHER_KEYWORDS = ("temp", "precip", "humidity", "uv", "wind", "snow")
MARKETING_KEYWORDS = ("spend", "budget", "roas", "impression", "click", "promo")
MAX_INTERACTIONS = 3


@dataclass
class BaselineModel:
    coefficients: Dict[str, float]
    intercept: float
    features: List[str]
    target: str
    gam: Any | None = None

    def predict(self, frame: pl.DataFrame) -> pl.Series:
        if self.gam is not None and self.features:
            missing = [feature for feature in self.features if feature not in frame.columns]
            if missing:
                raise KeyError(f"Missing features required for prediction: {missing}")
            X = frame.select(self.features).to_numpy()

            preds = self.gam.predict(X)
            return pl.Series(name="prediction", values=np.asarray(preds))

        prediction = pl.lit(self.intercept)
        for feature, coef in self.coefficients.items():
            if feature in frame.columns:
                prediction = prediction + pl.col(feature) * coef
        return frame.select(prediction.alias("prediction")).to_series()


def fit_baseline_model(frame: pl.DataFrame, target: str, features: List[str]) -> BaselineModel:
    _ensure_pygam_loaded()
    if frame.is_empty():
        return BaselineModel(coefficients={}, intercept=0.0, features=[], target=target)

    usable_features = [feature for feature in features if feature in frame.columns]
    if not usable_features:
        intercept = _safe_mean(frame, target)
        return BaselineModel(coefficients={}, intercept=intercept, features=[], target=target)

    df = frame.select([target] + usable_features).drop_nulls()
    if df.is_empty():
        intercept = _safe_mean(frame, target)
        return BaselineModel(coefficients={}, intercept=intercept, features=[], target=target)

    cleaned_features = _filter_features(df, usable_features)
    if not cleaned_features:
        intercept = _safe_mean(df, target)
        return BaselineModel(coefficients={}, intercept=intercept, features=[], target=target)

    row_count = df.height

    if LinearGAM and s and te and row_count >= _min_gam_rows(len(cleaned_features)):
        gam = _fit_gam(df, target, cleaned_features)
        if gam is not None:
            return BaselineModel(
                coefficients={},
                intercept=float(gam.statistics_["intercept"] if "intercept" in gam.statistics_ else gam.coef_[0]),
                features=cleaned_features,
                target=target,
                gam=gam,
            )

    # Fallback: simple linear regression via numpy lstsq.
    y = df[target].to_numpy()
    if not cleaned_features:
        intercept = float(np.mean(y)) if len(y) else 0.0
        return BaselineModel(coefficients={}, intercept=intercept, features=[], target=target)

    X = np.column_stack([np.ones(len(df))] + [df[col].to_numpy() for col in cleaned_features])
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    intercept = float(coef[0])
    coefficients = {feature: float(value) for feature, value in zip(cleaned_features, coef[1:])}
    return BaselineModel(coefficients=coefficients, intercept=intercept, features=cleaned_features, target=target)



def evaluate_r2(model: BaselineModel, frame: pl.DataFrame) -> float:
    if frame.is_empty():
        return 0.0
    target = model.target
    if target not in frame.columns:
        return 0.0
    df = frame.select([target] + model.features).drop_nulls() if model.features else frame.select([target]).drop_nulls()
    if df.is_empty():
        return 0.0
    y = df[target].to_numpy()
    if model.gam is not None and model.features:
        preds = model.gam.predict(df.select(model.features).to_numpy())
    else:
        preds = np.full_like(y, model.intercept, dtype=float)
        for feature in model.features:
            preds = preds + model.coefficients.get(feature, 0.0) * df[feature].to_numpy()
    ss_tot = float(((y - y.mean()) ** 2).sum())
    ss_res = float(((y - preds) ** 2).sum())
    return float(1 - ss_res / ss_tot) if ss_tot else 0.0


def _min_gam_rows(feature_count: int) -> int:
    return max(24, feature_count * 4)


def _filter_features(df: pl.DataFrame, features: Sequence[str]) -> List[str]:
    cleaned: List[str] = []
    for feature in features:
        series = df.get_column(feature)
        if series.dtype not in NUMERIC_DTYPES:
            continue
        if series.null_count() >= df.height:
            continue
        if series.n_unique() <= 1:
            continue
        cleaned.append(feature)
    return cleaned


def _fit_gam(df: pl.DataFrame, target: str, features: Sequence[str]) -> LinearGAM | None:
    if LinearGAM is None or s is None:
        return None
    X = df.select(features).to_numpy()
    y = df[target].to_numpy()
    if not np.isfinite(X).all() or not np.isfinite(y).all():
        return None

    row_count = df.height
    lam_grid = np.logspace(-2, 2, num=4)
    weights = np.clip(np.abs(y), 1.0, None)

    def _fit_with(
        builder: Callable[[], LinearGAM],
        fitter: Callable[[LinearGAM], LinearGAM | None],
    ) -> LinearGAM | None:
        try:
            gam = builder()
        except Exception:  # pragma: no cover - builder failure
            return None
        try:
            result = fitter(gam)
        except Exception:  # pragma: no cover - fitting failure
            return None
        candidate = result or gam
        if candidate is None:
            return None
        try:
            # Accessing statistics_ lazily validates the fit without relying on private flags.
            candidate.statistics_
        except Exception:  # pragma: no cover - unfitted model
            return None
        return candidate

    strategies: List[Callable[[], LinearGAM | None]] = [
        lambda: _fit_with(
            lambda: _build_gam(features, row_count),
            lambda gam: gam.gridsearch(
                X,
                y,
                weights=weights,
                lam=lam_grid,
                progress=False,
            ),
        ),
        lambda: _fit_with(
            lambda: _build_gam(features, row_count),
            lambda gam: gam.fit(X, y, weights=weights),
        ),
        lambda: _fit_with(
            lambda: LinearGAM(max_iter=200),
            lambda gam: gam.gridsearch(
                X,
                y,
                weights=weights,
                lam=lam_grid,
                progress=False,
            ),
        ),
        lambda: _fit_with(
            lambda: LinearGAM(max_iter=200),
            lambda gam: gam.fit(X, y, weights=weights),
        ),
    ]

    for attempt in strategies:
        fitted = attempt()
        if fitted is not None:
            return fitted
    return None


def _build_gam(features: Sequence[str], row_count: int) -> LinearGAM:
    assert LinearGAM is not None and s is not None  # Guarded by caller.
    terms = []
    weather_indices: List[int] = []
    marketing_indices: List[int] = []
    for idx, name in enumerate(features):
        lowered = name.lower()
        is_weather = _matches_any(lowered, WEATHER_KEYWORDS)
        is_marketing = _matches_any(lowered, MARKETING_KEYWORDS)
        splines = _n_splines(row_count, 12 if is_weather else 8)
        terms.append(s(idx, n_splines=splines, spline_order=3))
        if is_weather:
            weather_indices.append(idx)
        if is_marketing:
            marketing_indices.append(idx)
    if te and weather_indices and marketing_indices:
        for weather_idx, marketing_idx in itertools.islice(
            itertools.product(weather_indices, marketing_indices),
            MAX_INTERACTIONS,
        ):
            terms.append(te(weather_idx, marketing_idx, n_splines=[5, 5], spline_order=[3, 3]))
    return LinearGAM(terms=terms, max_iter=200)


def _matches_any(text: str, keywords: Iterable[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def _n_splines(row_count: int, preferred: int) -> int:
    upper = max(6, min(preferred, row_count - 1))
    return max(4, upper)


def _safe_mean(frame: pl.DataFrame, column: str) -> float:
    if column not in frame.columns or frame[column].null_count() == frame.height:
        return 0.0
    return float(frame[column].fill_null(0.0).mean())
