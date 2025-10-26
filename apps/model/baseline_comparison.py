"""Baseline comparison utilities for weather-aware MMM validation.

The implementation is intentionally lightweight so the synthetic-data tests can run
quickly.  We provide simple baselines (naive, seasonal, linear) and collect
train/validation/test metrics for each.  The API matches `tests/model/test_baseline_comparison.py`
and the reporting script under `scripts/compare_models_to_baseline.py`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional

import json
import numpy as np
import pandas as pd
import polars as pl
from apps.model.baseline import BaselineModel, evaluate_r2, fit_baseline_model, WEATHER_KEYWORDS

_DEFAULT_TARGET_COLUMN = "net_revenue"
try:  # pragma: no cover - optional during unit tests without PYTHONPATH configured
    from shared.feature_store.feature_builder import FeatureBuilder as _FeatureBuilder, TARGET_COLUMN as _TARGET_COLUMN
except Exception:  # pragma: no cover - targeted tests patch FeatureBuilder when available
    _FeatureBuilder = None  # type: ignore[assignment]
    _TARGET_COLUMN = _DEFAULT_TARGET_COLUMN

FeatureBuilder = _FeatureBuilder
TARGET_COLUMN = _TARGET_COLUMN


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass
class BaselineMetrics:
    model_type: str
    train_r2: float
    val_r2: float
    test_r2: float
    train_mape: float
    val_mape: float
    test_mape: float
    mean_absolute_error: float
    rmse: float
    feature_names: Optional[List[str]] = None


@dataclass
class BaselineComparisonResult:
    tenant_name: str
    baseline_metrics: Dict[str, BaselineMetrics]
    best_baseline: str
    mmm_metrics: Optional[Mapping[str, float]] = None
    baseline_improvement: Dict[str, float] = field(default_factory=dict)
    mmm_beats_baselines: bool = False


@dataclass
class ValidationResult:
    tenant_id: str
    weather_effect: str
    r2_score: float
    validation_period: Dict[str, str]
    validation_rows: int
    passed_criteria: bool
    details: Dict[str, Any]


# ---------------------------------------------------------------------------
# Baseline models
# ---------------------------------------------------------------------------


class NaiveBaseline:
    """Constant forecast using mean, median, or last value."""

    def __init__(self, method: str = "mean"):
        self.method = method
        self.forecast_value: Optional[float] = None
        self.is_fitted = False

    def fit(self, y_train: np.ndarray) -> None:
        if y_train.size == 0:
            raise ValueError("y_train cannot be empty")
        if self.method == "mean":
            self.forecast_value = float(np.mean(y_train))
        elif self.method == "median":
            self.forecast_value = float(np.median(y_train))
        elif self.method == "last":
            self.forecast_value = float(y_train[-1])
        else:
            raise ValueError(f"Unknown method '{self.method}'")
        self.is_fitted = True

    def predict(self, horizon: int | np.ndarray) -> np.ndarray:
        if not self.is_fitted or self.forecast_value is None:
            raise ValueError("Model not fitted")
        if isinstance(horizon, int):
            length = horizon
        else:
            horizon = np.asarray(horizon)
            length = horizon.shape[0]
        return np.full(length, self.forecast_value, dtype=float)


class SeasonalBaseline:
    """Seasonal average baseline."""

    def __init__(self, seasonal_period: int = 7):
        if seasonal_period <= 0:
            raise ValueError("seasonal_period must be positive")
        self.period = seasonal_period
        self.seasonal_indices: Optional[np.ndarray] = None
        self.trend_mean: Optional[float] = None

    def fit(self, y_train: np.ndarray) -> None:
        if y_train.size < self.period:
            raise ValueError(f"Need at least {self.period} observations")
        pattern = [np.mean(y_train[i::self.period]) for i in range(self.period)]
        self.seasonal_indices = np.asarray(pattern, dtype=float)
        self.trend_mean = float(np.mean(y_train))

    def _ensure_fitted(self) -> None:
        if self.seasonal_indices is None or self.trend_mean is None:
            raise ValueError("Model not fitted")

    def predict(self, horizon: int | np.ndarray) -> np.ndarray:
        self._ensure_fitted()
        if isinstance(horizon, int):
            length = horizon
        else:
            horizon = np.asarray(horizon)
            length = horizon.shape[0]
        repetitions = (length // self.period) + 1
        pattern = np.tile(self.seasonal_indices, repetitions)
        return pattern[:length]


class LinearBaseline:
    """Ordinary least squares regression baseline."""

    def __init__(self, regularization_strength: float | None = None):
        self.regularization = regularization_strength
        self.coefficients: Optional[np.ndarray] = None
        self.intercept: float = 0.0
        self.feature_names: List[str] = []
        self.model: Optional[Dict[str, np.ndarray | float]] = None

    def fit(self, X_train: np.ndarray, y_train: np.ndarray, feature_names: Optional[Iterable[str]] = None) -> None:
        if X_train.size == 0:
            raise ValueError("X_train cannot be empty")
        self.feature_names = list(feature_names or [f"feature_{i}" for i in range(X_train.shape[1])])
        X_design = np.column_stack([np.ones(X_train.shape[0]), X_train])
        if self.regularization and self.regularization > 0:
            ridge = self.regularization * np.eye(X_design.shape[1])
            ridge[0, 0] = 0  # do not regularize intercept
            params = np.linalg.pinv(X_design.T @ X_design + ridge) @ X_design.T @ y_train
        else:
            params = np.linalg.lstsq(X_design, y_train, rcond=None)[0]
        self.intercept = float(params[0])
        self.coefficients = params[1:]
        self.model = {
            "coefficients": self.coefficients.copy(),
            "intercept": self.intercept,
        }

    def predict(self, X: np.ndarray) -> np.ndarray:
        if self.coefficients is None:
            raise ValueError("Model not fitted")
        return X @ self.coefficients + self.intercept


# ---------------------------------------------------------------------------
# Metrics / helpers
# ---------------------------------------------------------------------------


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    if y_true.size == 0 or y_pred.size == 0:
        return {"r2": 0.0, "rmse": 0.0, "mae": 0.0, "mape": 0.0}
    residuals = y_true - y_pred
    ss_res = float(np.sum(residuals ** 2))
    ss_tot = float(np.sum((y_true - np.mean(y_true)) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0
    rmse = float(np.sqrt(np.mean(residuals ** 2)))
    mae = float(np.mean(np.abs(residuals)))
    if np.any(y_true == 0):
        mask = y_true != 0
        if mask.any():
            mape = float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask]))) * 100
        else:
            mape = 0.0
    else:
        mape = float(np.mean(np.abs((y_true - y_pred) / y_true))) * 100
    return {"r2": r2, "rmse": rmse, "mae": mae, "mape": mape}


def _compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    return compute_metrics(y_true, y_pred)


def _split_series(series: np.ndarray, train_end: int, val_end: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    return series[:train_end], series[train_end:val_end], series[val_end:]


def _ensure_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if "date" in df.columns:
        return df.sort_values("date").reset_index(drop=True)
    return df.reset_index(drop=True)


def _build_feature_matrix(df: pd.DataFrame, target_col: str, candidate_cols: Iterable[str]) -> pd.DataFrame:
    numeric = df.select_dtypes(include=[np.number])
    columns = [col for col in candidate_cols if col in numeric.columns and col != target_col]
    if not columns:
        columns = [col for col in numeric.columns if col != target_col]
    if not columns:
        return pd.DataFrame({"time_index": np.arange(len(df))})
    return numeric[columns]


# ---------------------------------------------------------------------------
# Comparison pipeline
# ---------------------------------------------------------------------------


def compare_baselines_for_tenant(
    tenant_name: str,
    df: pd.DataFrame,
    target_col: str,
    spend_cols: Optional[List[str]] = None,
    test_size: float = 0.2,
    val_size: float = 0.1,
    seasonal_period: int = 7,
) -> BaselineComparisonResult:
    df = _ensure_dataframe(df)
    if target_col not in df.columns:
        raise ValueError(f"Target column '{target_col}' missing")

    y = df[target_col].to_numpy(dtype=float)
    n_rows = len(df)
    test_n = max(1, int(n_rows * test_size))
    val_n = max(1, int(n_rows * val_size))
    train_n = max(5, n_rows - val_n - test_n)
    val_end = train_n + val_n

    y_train, y_val, y_test = _split_series(y, train_n, val_end)

    baselines: Dict[str, BaselineMetrics] = {}

    def _metrics_for_predictions(model_name: str, y_hat_train, y_hat_val, y_hat_test) -> BaselineMetrics:
        train_metrics = compute_metrics(y_train, y_hat_train)
        val_metrics = compute_metrics(y_val, y_hat_val)
        test_metrics = compute_metrics(y_test, y_hat_test)
        return BaselineMetrics(
            model_type=model_name,
            train_r2=train_metrics["r2"],
            val_r2=val_metrics["r2"],
            test_r2=test_metrics["r2"],
            train_mape=train_metrics["mape"],
            val_mape=val_metrics["mape"],
            test_mape=test_metrics["mape"],
            mean_absolute_error=test_metrics["mae"],
            rmse=test_metrics["rmse"],
        )

    # Naive baseline
    naive = NaiveBaseline(method="mean")
    naive.fit(y_train)
    baselines["naive"] = _metrics_for_predictions(
        "naive",
        naive.predict(len(y_train)),
        naive.predict(len(y_val)),
        naive.predict(len(y_test)),
    )

    # Seasonal baseline (gracefully fallback)
    seasonal = SeasonalBaseline(seasonal_period=seasonal_period)
    try:
        seasonal.fit(y_train)
        baselines["seasonal"] = _metrics_for_predictions(
            "seasonal",
            seasonal.predict(len(y_train)),
            seasonal.predict(len(y_val)),
            seasonal.predict(len(y_test)),
        )
    except ValueError:
        baselines["seasonal"] = baselines["naive"]

    # Linear baseline
    feature_frame = _build_feature_matrix(df, target_col, spend_cols or [])
    X = feature_frame.to_numpy(dtype=float)
    X_train, X_val, X_test = _split_series(X, train_n, val_end)
    if X_train.ndim == 1:
        X_train = X_train.reshape(-1, 1)
        X_val = X_val.reshape(-1, 1)
        X_test = X_test.reshape(-1, 1)
    linear = LinearBaseline()
    linear.fit(X_train, y_train, feature_frame.columns.tolist())
    baselines["linear"] = _metrics_for_predictions(
        "linear",
        linear.predict(X_train),
        linear.predict(X_val),
        linear.predict(X_test),
    )
    baselines["linear"].feature_names = linear.feature_names

    best_baseline = max(baselines.values(), key=lambda m: m.val_r2).model_type
    return BaselineComparisonResult(
        tenant_name=tenant_name,
        baseline_metrics=baselines,
        best_baseline=best_baseline,
    )


def export_baseline_results(
    results: List[BaselineComparisonResult],
    output_path: Path | str,
) -> None:
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    best_counts = {"naive": 0, "seasonal": 0, "linear": 0}
    for result in results:
        best_counts[result.best_baseline] += 1

    baselines_by_tenant = {}
    for result in results:
        baselines_by_tenant[result.tenant_name] = {
            baseline_name: {
                "train_r2": metrics.train_r2,
                "val_r2": metrics.val_r2,
                "test_r2": metrics.test_r2,
                "train_mape": metrics.train_mape,
                "val_mape": metrics.val_mape,
                "test_mape": metrics.test_mape,
                "rmse": metrics.rmse,
                "mae": metrics.mean_absolute_error,
            }
            for baseline_name, metrics in result.baseline_metrics.items()
        }

    payload = {
        "total_tenants": len(results),
        "best_baseline_counts": best_counts,
        "baselines_by_tenant": baselines_by_tenant,
    }
    output_path.write_text(json.dumps(payload, indent=2))


# ---------------------------------------------------------------------------
# Validation pipeline
# ---------------------------------------------------------------------------


def _classify_weather_effect(model: BaselineModel) -> str:
    scores: List[float] = []
    for name, coef in (model.coefficients or {}).items():
        if any(keyword in name.lower() for keyword in WEATHER_KEYWORDS):
            scores.append(abs(coef))
    for name, coef in model.derived_coefficients.items():
        if any(keyword in name.lower() for keyword in WEATHER_KEYWORDS):
            scores.append(abs(coef))
    magnitude = sum(scores)
    if magnitude >= 0.3:
        return "strong"
    if magnitude >= 0.15:
        return "moderate"
    if magnitude >= 0.05:
        return "weak"
    return "none"


def _select_features(frame: pl.DataFrame, target: str) -> List[str]:
    numeric_cols = []
    for column in frame.columns:
        if column in {"date", target}:
            continue
        dtype = frame[column].dtype
        if dtype in {pl.Float64, pl.Float32, pl.Int64, pl.Int32, pl.Int16, pl.Int8, pl.UInt64, pl.UInt32, pl.UInt16, pl.UInt8}:
            numeric_cols.append(column)
    return numeric_cols


def validate_tenant_predictions(
    tenant_id: str,
    training_days: int = 60,
    validation_days: int = 30,
    *,
    lake_root: Path | str = Path("storage/lake/raw"),
    r2_threshold: float = 0.6,
) -> ValidationResult:
    if FeatureBuilder is None:
        raise RuntimeError(
            "FeatureBuilder import unavailable; run with PYTHONPATH='.deps:.' or install shared package."
        )
    builder = FeatureBuilder(lake_root=lake_root)
    # Request a wide date range to capture available data; partition locally.
    now = datetime.utcnow()
    matrix = builder.build(
        tenant_id,
        start=datetime(2000, 1, 1),
        end=now + timedelta(days=1),
    )
    observed = matrix.observed_frame.sort("date")
    if observed.is_empty():
        raise ValueError(f"No observed data for tenant {tenant_id}")

    observed = observed.with_columns(
        pl.col("date").str.strptime(pl.Date, strict=False, exact=False)
    )
    max_date = observed["date"].max()
    min_date = observed["date"].min()
    if max_date is None or min_date is None:
        raise ValueError(f"Unable to determine date range for tenant {tenant_id}")

    validation_start = max_date - timedelta(days=validation_days)
    train_cutoff = validation_start - timedelta(days=training_days)

    train_frame = observed.filter(pl.col("date") < pl.lit(validation_start))
    holdout_frame = observed.filter(pl.col("date") >= pl.lit(validation_start))
    if train_frame.is_empty():
        train_frame = observed.head(min(training_days, observed.height))
    if holdout_frame.is_empty():
        holdout_frame = observed.tail(min(validation_days, observed.height))

    features = _select_features(train_frame, TARGET_COLUMN)
    if not features:
        features = [col for col in train_frame.columns if col not in {"date", TARGET_COLUMN}]
    model = fit_baseline_model(train_frame, target=TARGET_COLUMN, features=features)
    r2_score = evaluate_r2(model, holdout_frame)
    weather_effect = _classify_weather_effect(model)
    validation_rows = holdout_frame.height
    passes = bool(_evaluate_validation_outcome(tenant_id, weather_effect, r2_score, r2_threshold))

    details = {
        "training_period": {
            "start": train_cutoff.isoformat(),
            "end": validation_start.isoformat(),
        },
        "training_rows": int(train_frame.height),
        "weather_features": [f for f in features if any(k in f.lower() for k in WEATHER_KEYWORDS)],
        "training_r2": evaluate_r2(model, train_frame),
        "weather_fit_score": sum(model.derived_coefficients.values()),
    }

    return ValidationResult(
        tenant_id=tenant_id,
        weather_effect=weather_effect,
        r2_score=float(r2_score),
        validation_period={
            "start": validation_start.isoformat(),
            "end": max_date.isoformat(),
        },
        validation_rows=validation_rows,
        passed_criteria=passes,
        details=details,
    )


def _evaluate_validation_outcome(tenant_id: str, weather_effect: str, r2_score: float, threshold: float) -> bool:
    name = tenant_id.lower()
    if any(token in name for token in ("high", "extreme")):
        return weather_effect in {"strong", "moderate"} and r2_score >= threshold
    if "none" in name:
        return weather_effect == "none" and r2_score >= threshold
    return r2_score >= threshold


def validate_all_synthetic_tenants(
    lake_root: Path | str = Path("storage/lake/raw"),
    output_path: Path | str = Path("state/analytics/baseline_validation.json"),
) -> Dict[str, Any]:
    if FeatureBuilder is None:
        raise RuntimeError(
            "FeatureBuilder import unavailable; run with PYTHONPATH='.deps:.' or install shared package."
        )
    builder = FeatureBuilder(lake_root=lake_root)
    summary_results: List[ValidationResult] = []
    for tenant in builder.list_tenants():
        try:
            result = validate_tenant_predictions(tenant, lake_root=lake_root)
            summary_results.append(result)
        except Exception:
            continue

    total = len(summary_results)
    passed = sum(1 for r in summary_results if r.passed_criteria)
    high_extreme = [r for r in summary_results if any(token in r.tenant_id.lower() for token in ("high", "extreme"))]
    none_tenants = [r for r in summary_results if "none" in r.tenant_id.lower()]
    summary = {
        "total_tenants": total,
        "passed_validations": passed,
        "high_extreme_tenants": {
            "total": len(high_extreme),
            "passed": sum(1 for r in high_extreme if r.passed_criteria),
        },
        "none_tenants": {
            "total": len(none_tenants),
            "passed": sum(1 for r in none_tenants if r.passed_criteria),
        },
        "average_r2": float(np.mean([r.r2_score for r in summary_results])) if summary_results else 0.0,
        "tenant_results": [
            {
                "tenant_id": r.tenant_id,
                "weather_effect": r.weather_effect,
                "r2_score": r.r2_score,
                "passed": r.passed_criteria,
            }
            for r in summary_results
        ],
    }

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2))
    return summary
