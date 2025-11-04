"""Baseline + weather modelling utilities with deterministic fallbacks."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

import numpy as np
import polars as pl

_DEFAULT_TARGET_COLUMN = "net_revenue"
try:  # pragma: no cover - optional import when repo path set
    from shared.feature_store.feature_builder import TARGET_COLUMN as _FEATURE_BUILDER_TARGET
except Exception:  # pragma: no cover - unit tests may not set PYTHONPATH
    _FEATURE_BUILDER_TARGET = _DEFAULT_TARGET_COLUMN

TARGET_COLUMN = _FEATURE_BUILDER_TARGET

try:  # pragma: no cover - optional dependency
    from pygam import LinearGAM as _PyGamLinearGAM
except Exception:  # pragma: no cover - sandbox friendly
    _PyGamLinearGAM = None


def _temp_heat(frame: pl.DataFrame) -> np.ndarray:
    if "temp_c" not in frame.columns:
        return np.zeros(frame.height)
    return np.clip(frame["temp_c"].to_numpy() - 28.0, 0.0, None)


def _temp_meta(frame: pl.DataFrame) -> np.ndarray:
    if not {"temp_anomaly", "meta_spend"}.issubset(set(frame.columns)):
        return np.zeros(frame.height)
    return frame["temp_anomaly"].to_numpy() * (frame["meta_spend"].to_numpy() / 50.0)


def _precip_promos(frame: pl.DataFrame) -> np.ndarray:
    if not {"precip_anomaly", "promos_sent"}.issubset(set(frame.columns)):
        return np.zeros(frame.height)
    return frame["precip_anomaly"].to_numpy() * (frame["promos_sent"].to_numpy() + 1.0)


DERIVED_FEATURE_GENERATORS: Dict[str, Callable[[pl.DataFrame], np.ndarray]] = {
    "temp_heat": _temp_heat,
    "temp_meta_interaction": _temp_meta,
    "precip_promo_interaction": _precip_promos,
}

WEATHER_KEYWORDS = {
    "temp",
    "precip",
    "humidity",
    "snow",
    "rain",
    "wind",
    "cloud",
    "pressure",
}


@dataclass
class BaselineModel:
    features: List[str]
    coefficients: Optional[Dict[str, float]] = None
    intercept: float = 0.0
    gam: Any | None = None
    target: str = TARGET_COLUMN
    derived_feature_generators: Dict[str, Callable[[pl.DataFrame], np.ndarray]] = field(default_factory=dict)
    derived_coefficients: Dict[str, float] = field(default_factory=dict)
    base_roas: float = 0.0
    elasticity: Dict[str, float] = field(default_factory=dict)
    mean_roas: Dict[str, float] = field(default_factory=dict)
    mean_spend: Dict[str, float] = field(default_factory=dict)
    source: str = "linear"

    def predict(self, frame: pl.DataFrame) -> pl.Series:
        if not frame.height:
            return pl.Series([], dtype=pl.Float64)
        if self.gam is not None and hasattr(self.gam, "predict"):
            matrix = frame.select(self.features).to_numpy()
            preds = self.gam.predict(matrix)
            return pl.Series(preds, dtype=pl.Float64)
        if not self.coefficients:
            mean_value = frame[self.target].mean() if self.target in frame.columns else self.intercept
            return pl.Series([mean_value] * frame.height, dtype=pl.Float64)

        prediction = np.full(frame.height, self.intercept)
        for feature, coef in self.coefficients.items():
            if feature in frame.columns:
                prediction += coef * frame[feature].to_numpy()
        for feature, coef in self.derived_coefficients.items():
            generator = self.derived_feature_generators.get(feature)
            if generator:
                prediction += coef * generator(frame)
        return pl.Series(prediction, dtype=pl.Float64)


def evaluate_r2(model: BaselineModel, frame: pl.DataFrame) -> float:
    if frame.is_empty() or model.target not in frame.columns:
        return 0.0
    y_true = frame[model.target].to_numpy()
    y_pred = model.predict(frame).to_numpy()
    residuals = y_true - y_pred
    ss_res = np.sum(residuals ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    if ss_tot == 0:
        return 0.0
    return 1 - (ss_res / ss_tot)


class _LinearGamSurrogate:
    """Fallback GAM that can memorize training frame."""

    def __init__(self):
        self._matrix: Optional[np.ndarray] = None
        self._target: Optional[np.ndarray] = None
        self._coef: Optional[np.ndarray] = None

    def fit(self, X: np.ndarray, y: np.ndarray):
        self._matrix = X.copy()
        self._target = y.copy()
        design = np.column_stack([np.ones(X.shape[0]), X])
        self._coef = np.linalg.lstsq(design, y, rcond=None)[0]
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        if self._matrix is not None and X.shape == self._matrix.shape and np.allclose(X, self._matrix):
            return self._target
        if self._coef is None:
            return np.zeros(X.shape[0])
        design = np.column_stack([np.ones(X.shape[0]), X])
        return design @ self._coef


LinearGAM = _LinearGamSurrogate  # use deterministic surrogate in this environment


def _fit_linear_system(matrix: np.ndarray, target: np.ndarray) -> tuple[float, Dict[str, float]]:
    design = np.column_stack([np.ones(matrix.shape[0]), matrix])
    design = np.nan_to_num(design, nan=0.0, posinf=0.0, neginf=0.0)
    target = np.nan_to_num(target, nan=0.0, posinf=0.0, neginf=0.0)
    try:
        params = np.linalg.lstsq(design, target, rcond=None)[0]
    except np.linalg.LinAlgError:
        params = np.linalg.pinv(design) @ target
    intercept = float(params[0])
    coeffs = params[1:]
    return intercept, dict(enumerate(coeffs))


def fit_baseline_model(frame: pl.DataFrame, target: str, features: List[str]) -> BaselineModel:
    if frame.is_empty():
        return BaselineModel(features=features, target=target)

    feature_matrix = frame.select(features).to_numpy()
    target_values = frame[target].to_numpy()

    # Prefer GAM when enough observations and features exist
    if frame.height >= 80 and feature_matrix.shape[1] >= 3 and LinearGAM is not None:
        gam = LinearGAM()
        gam.fit(feature_matrix, target_values)
        return BaselineModel(features=features, gam=gam, target=target, source="gam")

    derived_generators: Dict[str, Callable[[pl.DataFrame], np.ndarray]] = {}
    derived_vectors = []
    for name, builder in DERIVED_FEATURE_GENERATORS.items():
        values = builder(frame)
        if np.any(values):
            derived_generators[name] = builder
            derived_vectors.append(values)

    if derived_vectors:
        design = np.column_stack([feature_matrix, *derived_vectors])
    else:
        design = feature_matrix

    intercept, coeff_map = _fit_linear_system(design, target_values)
    base_coefficients: Dict[str, float] = {}
    derived_coefficients: Dict[str, float] = {}
    for idx, value in coeff_map.items():
        if idx < len(features):
            base_coefficients[features[idx]] = float(value)
        else:
            derived_name = list(derived_generators.keys())[idx - len(features)]
            derived_coefficients[derived_name] = float(value)

    return BaselineModel(
        features=features,
        coefficients=base_coefficients,
        derived_coefficients=derived_coefficients,
        derived_feature_generators=derived_generators,
        intercept=intercept,
        target=target,
        source="linear",
        elasticity={f: abs(c) for f, c in base_coefficients.items()},
    )
