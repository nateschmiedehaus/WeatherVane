"""Causal uplift modelling utilities with doubly robust validation."""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from math import sqrt
from pathlib import Path
from statistics import NormalDist
from typing import Callable, Sequence

import numpy as np
import polars as pl
from sklearn.base import ClassifierMixin, RegressorMixin, clone
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import LogisticRegression


@dataclass(frozen=True)
class IncrementalLiftReport:
    """Summary statistics describing incremental lift validation."""

    predicted_ate: float
    observed_ate: float
    ate_stderr: float
    conf_low: float
    conf_high: float
    p_value: float
    normalized_qini: float
    uplift_by_decile: list[dict[str, float]]
    sample_size: int

    def to_dict(self) -> dict[str, float | list[dict[str, float]]]:
        return asdict(self)


@dataclass
class CausalUpliftModel:
    """Two-model uplift estimator with a shared propensity model."""

    treatment_model: RegressorMixin
    control_model: RegressorMixin
    propensity_model: ClassifierMixin
    feature_columns: list[str]
    treatment_column: str
    target_column: str
    propensity_clip: float = 0.02

    def _prepare_features(self, frame: pl.DataFrame) -> np.ndarray:
        return frame.select(self.feature_columns).to_numpy()

    def _predict_components(self, frame: pl.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        features = self._prepare_features(frame)
        mu_treated = self.treatment_model.predict(features)
        mu_control = self.control_model.predict(features)
        propensities_full = self.propensity_model.predict_proba(features)[:, 1]
        clip = self.propensity_clip
        propensities = np.clip(propensities_full, clip, 1.0 - clip)
        return mu_treated, mu_control, propensities

    def predict_uplift(self, frame: pl.DataFrame) -> pl.Series:
        """Return predicted uplift (treatment - control) for each row."""

        mu_treated, mu_control, _ = self._predict_components(frame)
        uplift = mu_treated - mu_control
        return pl.Series("predicted_uplift", uplift)

    def predict_propensity(self, frame: pl.DataFrame) -> pl.Series:
        """Return the estimated treatment propensity for each row."""

        _, _, propensity = self._predict_components(frame)
        return pl.Series("propensity", propensity)

    def predict_outcomes(self, frame: pl.DataFrame) -> tuple[pl.Series, pl.Series]:
        """Return the potential outcomes under treatment and control."""

        mu_treated, mu_control, _ = self._predict_components(frame)
        return pl.Series("mu1", mu_treated), pl.Series("mu0", mu_control)


def fit_causal_uplift(
    frame: pl.DataFrame,
    *,
    features: Sequence[str] | None = None,
    treatment_column: str = "treatment",
    target_column: str = "net_revenue",
    propensity_estimator: ClassifierMixin | None = None,
    outcome_estimator: RegressorMixin | Callable[[], RegressorMixin] | None = None,
    min_group_size: int = 25,
    propensity_clip: float = 0.02,
) -> CausalUpliftModel:
    """Train a two-model uplift estimator with a shared propensity score."""

    if frame.is_empty():
        raise ValueError("Training frame is empty")
    if not (0.0 < propensity_clip < 0.5):
        raise ValueError("propensity_clip must lie in (0, 0.5)")

    if features is None:
        excluded = {treatment_column, target_column}
        feature_columns = [col for col in frame.columns if col not in excluded]
    else:
        feature_columns = list(features)

    required = set(feature_columns) | {treatment_column, target_column}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Training frame missing required columns: {sorted(missing)}")

    clean = frame.drop_nulls(subset=list(required))
    if clean.is_empty():
        raise ValueError("No rows remain after dropping nulls")

    treatment_series = clean.get_column(treatment_column)
    treatment_array = _as_binary(treatment_series)
    if treatment_array.sum() == 0 or treatment_array.sum() == len(treatment_array):
        raise ValueError("Both treatment and control observations are required")

    treated_mask = treatment_array == 1
    control_mask = ~treated_mask
    if treated_mask.sum() < min_group_size or control_mask.sum() < min_group_size:
        raise ValueError("Insufficient rows in treatment or control group")

    X = clean.select(feature_columns).to_numpy()
    y = clean.get_column(target_column).to_numpy()

    prop_model = _clone_classifier(propensity_estimator)
    prop_model.fit(X, treatment_array)

    treat_model = _build_outcome_estimator(outcome_estimator)
    control_model = _build_outcome_estimator(outcome_estimator)

    X_t = X[treated_mask]
    y_t = y[treated_mask]
    X_c = X[control_mask]
    y_c = y[control_mask]

    treat_model.fit(X_t, y_t)
    control_model.fit(X_c, y_c)

    return CausalUpliftModel(
        treatment_model=treat_model,
        control_model=control_model,
        propensity_model=prop_model,
        feature_columns=feature_columns,
        treatment_column=treatment_column,
        target_column=target_column,
        propensity_clip=propensity_clip,
    )


def validate_incremental_lift(
    model: CausalUpliftModel,
    frame: pl.DataFrame,
) -> IncrementalLiftReport:
    """Validate incremental lift using a doubly robust estimator."""

    required = set(model.feature_columns) | {model.treatment_column, model.target_column}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Validation frame missing required columns: {sorted(missing)}")

    clean = frame.drop_nulls(subset=list(required))
    if clean.is_empty():
        raise ValueError("Validation frame is empty after dropping nulls")

    treatment = _as_binary(clean.get_column(model.treatment_column))
    outcome = clean.get_column(model.target_column).to_numpy()

    mu1, mu0, propensity = model._predict_components(clean)
    tau_hat = mu1 - mu0

    dr = _doubly_robust_estimator(outcome, treatment, mu1, mu0, propensity)
    observed_ate = float(np.mean(dr))
    ate_stderr = float(np.std(dr, ddof=1) / sqrt(len(dr))) if len(dr) > 1 else 0.0

    if ate_stderr > 0:
        z_score = observed_ate / ate_stderr
        p_value = 2 * (1 - NormalDist().cdf(abs(z_score)))
    else:
        p_value = 1.0

    z_critical = 1.96
    conf_low = observed_ate - z_critical * ate_stderr
    conf_high = observed_ate + z_critical * ate_stderr

    uplift_by_decile = _uplift_deciles(tau_hat, dr, treatment, propensity)
    normalized_qini = _normalized_qini_curve(dr, tau_hat)

    return IncrementalLiftReport(
        predicted_ate=float(np.mean(tau_hat)),
        observed_ate=observed_ate,
        ate_stderr=ate_stderr,
        conf_low=float(conf_low),
        conf_high=float(conf_high),
        p_value=float(p_value),
        normalized_qini=float(normalized_qini),
        uplift_by_decile=uplift_by_decile,
        sample_size=clean.height,
    )


def _clone_classifier(estimator: ClassifierMixin | None) -> ClassifierMixin:
    if estimator is None:
        return LogisticRegression(max_iter=1000, class_weight="balanced")
    return clone(estimator)


def _build_outcome_estimator(
    estimator: RegressorMixin | Callable[[], RegressorMixin] | None,
) -> RegressorMixin:
    if callable(estimator):
        return estimator()
    if estimator is None:
        return GradientBoostingRegressor(
            random_state=42,
            learning_rate=0.05,
            max_depth=3,
            n_estimators=300,
            subsample=0.8,
        )
    return clone(estimator)


def _as_binary(series: pl.Series) -> np.ndarray:
    if series.dtype == pl.Boolean:
        return series.to_numpy().astype(int)
    if series.dtype.is_integer() or series.dtype.is_float():
        values = series.to_numpy()
        uniques = np.unique(values)
        if uniques.size > 2:
            raise ValueError("Treatment column must be binary")
        return (values > 0).astype(int)
    values = series.cast(pl.Utf8).to_list()
    categories = sorted({value for value in values})
    if len(categories) != 2:
        raise ValueError("Treatment column must have exactly two categories")
    mapping = {categories[0]: 0, categories[1]: 1}
    return np.array([mapping[value] for value in values], dtype=int)


def _doubly_robust_estimator(
    outcome: np.ndarray,
    treatment: np.ndarray,
    mu1: np.ndarray,
    mu0: np.ndarray,
    propensity: np.ndarray,
) -> np.ndarray:
    treated_term = treatment * (outcome - mu1) / propensity
    control_term = (1 - treatment) * (outcome - mu0) / (1 - propensity)
    return mu1 - mu0 + treated_term - control_term


def _uplift_deciles(
    tau_hat: np.ndarray,
    dr: np.ndarray,
    treatment: np.ndarray,
    propensity: np.ndarray,
) -> list[dict[str, float]]:
    n = len(tau_hat)
    if n == 0:
        return []

    order = np.argsort(tau_hat)[::-1]
    deciles: list[dict[str, float]] = []
    for decile in range(10):
        start = int(decile * n / 10)
        end = int((decile + 1) * n / 10)
        if start == end:
            continue
        idx = order[start:end]
        deciles.append(
            {
                "decile": float(decile + 1),
                "count": float(len(idx)),
                "mean_predicted_uplift": float(np.mean(tau_hat[idx])),
                "mean_dr_uplift": float(np.mean(dr[idx])),
                "treatment_fraction": float(np.mean(treatment[idx])),
                "mean_propensity": float(np.mean(propensity[idx])),
            }
        )
    return deciles


def _normalized_qini_curve(dr: np.ndarray, tau_hat: np.ndarray) -> float:
    if len(dr) == 0:
        return 0.0

    order = np.argsort(tau_hat)[::-1]
    optimal = np.argsort(dr)[::-1]

    cumulative_model = np.cumsum(dr[order])
    cumulative_best = np.cumsum(dr[optimal])
    cumulative_random = np.linspace(0.0, float(np.sum(dr)), num=len(dr), endpoint=True)

    x_axis = np.arange(1, len(dr) + 1)
    area_model = _trapezoid(cumulative_model, x_axis)
    area_best = _trapezoid(cumulative_best, x_axis)
    area_random = _trapezoid(cumulative_random, x_axis)

    denominator = area_best - area_random
    if denominator <= 0:
        return 0.0
    return (area_model - area_random) / denominator


def _trapezoid(values: np.ndarray, x_axis: np.ndarray) -> float:
    integrate = getattr(np, "trapezoid", np.trapz)
    return float(integrate(values, x_axis))


def uplift_report_to_frame(report: IncrementalLiftReport) -> pl.DataFrame:
    """Return a small DataFrame representation of decile metrics."""

    return pl.DataFrame(report.uplift_by_decile)


def summarise_report(report: IncrementalLiftReport) -> dict[str, float]:
    """Flatten the headline statistics from a report."""

    return {
        "predicted_ate": report.predicted_ate,
        "observed_ate": report.observed_ate,
        "ate_stderr": report.ate_stderr,
        "conf_low": report.conf_low,
        "conf_high": report.conf_high,
        "p_value": report.p_value,
        "normalized_qini": report.normalized_qini,
        "sample_size": float(report.sample_size),
    }


def generate_synthetic_dataset(
    *,
    rows: int = 2000,
    seed: int = 42,
) -> pl.DataFrame:
    """Create a synthetic uplift dataset used for smoke testing."""

    rng = np.random.default_rng(seed)
    temp_anomaly = rng.normal(loc=0.0, scale=1.0, size=rows)
    precipitation = rng.gamma(shape=2.0, scale=1.2, size=rows)
    promo_intensity = rng.binomial(n=3, p=0.4, size=rows)
    weekday = rng.integers(0, 7, size=rows)

    base = 120.0 + 4.0 * promo_intensity + 2.0 * temp_anomaly - 1.2 * precipitation
    logits = -0.2 + 0.6 * temp_anomaly - 0.3 * (weekday >= 5).astype(float) + 0.25 * promo_intensity
    propensity = 1.0 / (1.0 + np.exp(-logits))

    treatment = rng.binomial(1, propensity)
    heterogeneous_effect = 2.0 + 0.8 * temp_anomaly + 0.6 * (weekday == 5)
    noise = rng.normal(scale=3.5, size=rows)
    outcome = base + treatment * heterogeneous_effect + noise

    return pl.DataFrame(
        {
            "net_revenue": outcome,
            "treatment": treatment,
            "temp_anomaly": temp_anomaly,
            "precipitation": precipitation,
            "promo_intensity": promo_intensity.astype(float),
            "weekday": weekday.astype(float),
        }
    )


def compute_synthetic_report() -> IncrementalLiftReport:
    """Train and validate uplift modelling on the synthetic dataset."""

    frame = generate_synthetic_dataset()
    model = fit_causal_uplift(frame, target_column="net_revenue", treatment_column="treatment")
    return validate_incremental_lift(model, frame)


def save_report_as_json(report: IncrementalLiftReport, path: str) -> None:
    """Persist an uplift report (including deciles) to JSON."""

    payload = {
        "headline": summarise_report(report),
        "deciles": report.uplift_by_decile,
    }
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, indent=2))
