"""Multi-horizon ensemble forecasting utilities.

The ensemble blends deterministic baselines with leakage-aware time-series models
and samples calibrated residuals to produce forecast distributions across future
horizons. It is designed to operate on the feature matrices produced by
FeatureBuilder plus weather cache rows, keeping scaffolding environments aligned
with production guardrails.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Sequence

import numpy as np
import polars as pl

from apps.model.baseline import BaselineModel, fit_baseline_model
from apps.model.ts_training import HOLDOUT_WEEKS, FitResult, fit_timeseries

DEFAULT_HORIZON_DAYS = 7
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


def _to_datetime64(value: Any) -> np.datetime64:
    if isinstance(value, np.datetime64):
        return value
    if isinstance(value, str):
        return np.datetime64(value)
    return np.datetime64(value, "D")


@dataclass
class ForecastPoint:
    date: str
    horizon_days: int
    prediction: float
    quantiles: Dict[str, float]
    components: Dict[str, float]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "date": self.date,
            "horizon_days": self.horizon_days,
            "prediction": self.prediction,
            "quantiles": dict(self.quantiles),
            "components": dict(self.components),
        }


@dataclass
class EnsembleResult:
    forecasts: List[ForecastPoint]
    metrics: Dict[str, Any]
    diagnostics: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "forecasts": [forecast.to_dict() for forecast in self.forecasts],
            "metrics": dict(self.metrics),
            "diagnostics": dict(self.diagnostics),
        }


def run_multi_horizon_ensemble(
    design_matrix: Mapping[str, Sequence[Any]] | pl.DataFrame,
    weather_rows: Sequence[Mapping[str, Any]] | None = None,
    *,
    date_col: str = "date",
    target: str = "net_revenue",
    horizon_days: int = DEFAULT_HORIZON_DAYS,
    ensemble_size: int = 400,
    seed: int | None = 42,
) -> EnsembleResult:
    """Build a leakage-aware forecast ensemble for multiple future horizons."""
    frame = _coerce_frame(design_matrix, date_col=date_col)
    if frame.is_empty() or target not in frame.columns:
        return EnsembleResult(forecasts=[], metrics=_empty_metrics(), diagnostics=_empty_diagnostics(frame))

    observed = frame.filter(pl.col(target).is_not_null())
    if observed.is_empty():
        return EnsembleResult(forecasts=[], metrics=_empty_metrics(), diagnostics=_empty_diagnostics(frame))

    features = _infer_features(frame, target=target, date_col=date_col)
    baseline = fit_baseline_model(observed, target=target, features=list(features))

    ts_input = observed.select([date_col] + list(features) + [target])
    timeseries_result = fit_timeseries(ts_input, date_col, target, features)

    forecast_frame = _extend_with_weather_forecast(
        frame=observed,
        full_frame=frame,
        weather_rows=weather_rows,
        date_col=date_col,
        target=target,
        horizon_days=horizon_days,
    )
    if forecast_frame.height <= observed.height:
        return EnsembleResult(forecasts=[], metrics=_empty_metrics(), diagnostics=_empty_diagnostics(frame))

    component_predictions = _predict_components(
        baseline=baseline,
        timeseries_result=timeseries_result,
        frame=forecast_frame,
        features=list(features),
        target=target,
    )

    weights = _derive_component_weights(component_predictions, observed, target)
    ensemble_pred = _weighted_sum(component_predictions, weights)

    residuals = _compute_residuals(ensemble_pred[: observed.height], observed[target])
    if residuals.size == 0:
        residuals = np.array([0.0])

    rng = np.random.default_rng(seed)
    forecasts = _build_forecasts(
        forecast_frame=forecast_frame,
        observed_count=observed.height,
        ensemble_pred=ensemble_pred,
        component_predictions=component_predictions,
        residuals=residuals,
        weights=weights,
        horizon_days=horizon_days,
        date_col=date_col,
        rng=rng,
        ensemble_size=ensemble_size,
    )

    holdout_metrics = _compute_holdout_metrics(
        forecast_frame=forecast_frame,
        observed_rows=observed.height,
        ensemble_pred=ensemble_pred,
        target=target,
        date_col=date_col,
        timeseries_result=timeseries_result,
        horizon_days=horizon_days,
    )

    diagnostics = _build_diagnostics(
        frame=frame,
        features=features,
        baseline=baseline,
        timeseries_result=timeseries_result,
        residuals=residuals,
    )

    metrics = dict(holdout_metrics)
    metrics["component_weights"] = weights
    metrics["residual_std"] = float(np.std(residuals))
    metrics["ensemble_size"] = int(ensemble_size)
    metrics["observed_rows"] = int(observed.height)
    metrics["forecast_rows"] = int(forecast_frame.height - observed.height)

    return EnsembleResult(forecasts=forecasts, metrics=metrics, diagnostics=diagnostics)


def save_ensemble_metrics_as_json(result: EnsembleResult | Mapping[str, Any], path: str | Path) -> None:
    """Persist ensemble forecasts/metrics to disk."""
    path_obj = Path(path)
    path_obj.parent.mkdir(parents=True, exist_ok=True)
    payload = result.to_dict() if isinstance(result, EnsembleResult) else dict(result)
    with path_obj.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)


def _coerce_frame(
    data: Mapping[str, Sequence[Any]] | pl.DataFrame,
    *,
    date_col: str,
) -> pl.DataFrame:
    if isinstance(data, pl.DataFrame):
        frame = data.clone()
    else:
        frame = pl.DataFrame(data)
    if date_col not in frame.columns:
        raise KeyError(f"Feature matrix missing required date column `{date_col}`")
    frame = frame.with_columns(
        pl.col(date_col).str.strptime(pl.Date, strict=False).alias(date_col),
    )
    return frame.sort(date_col)


def _infer_features(
    frame: pl.DataFrame,
    *,
    target: str,
    date_col: str,
) -> List[str]:
    features: List[str] = []
    for column in frame.columns:
        if column in {target, date_col, "target_available"}:
            continue
        dtype = frame[column].dtype
        if dtype in NUMERIC_DTYPES:
            features.append(column)
    return features


def _extend_with_weather_forecast(
    *,
    frame: pl.DataFrame,
    full_frame: pl.DataFrame,
    weather_rows: Sequence[Mapping[str, Any]] | None,
    date_col: str,
    target: str,
    horizon_days: int,
) -> pl.DataFrame:
    if frame.is_empty():
        return frame

    latest = frame.sort(date_col).tail(1)
    latest_row = latest.to_dicts()[0]
    latest_date = _to_datetime64(latest_row[date_col])
    template_value = latest_row.get(date_col)

    weather_lookup = _build_weather_lookup(weather_rows, date_col)
    future_rows: List[MutableMapping[str, Any]] = []

    def _coerce_future_value(future_np: np.datetime64) -> Any:
        if isinstance(template_value, np.datetime64):
            return future_np.astype(template_value.dtype)  # type: ignore[arg-type]
        if isinstance(template_value, datetime):
            return future_np.astype("datetime64[us]").tolist()
        if isinstance(template_value, date):
            return future_np.astype("datetime64[D]").tolist()
        if isinstance(template_value, str):
            return np.datetime_as_string(future_np, unit="D")
        return future_np.astype("datetime64[D]").tolist()

    for offset in range(1, max(horizon_days, 0) + 1):
        future_date = latest_date + np.timedelta64(offset, "D")
        future_key = str(np.datetime_as_string(future_date, unit="D"))
        row: MutableMapping[str, Any] = dict(latest_row)
        row[date_col] = _coerce_future_value(future_date)
        row[target] = None
        if "target_available" in row:
            row["target_available"] = False
        forecast_overrides = weather_lookup.get(future_key, {})
        for column, value in forecast_overrides.items():
            if column in row:
                row[column] = value
        future_rows.append(row)

    if not future_rows:
        return full_frame.sort(date_col)
    future_df = pl.DataFrame(future_rows)
    cast_expressions: List[pl.Expr] = []
    for column, dtype in full_frame.schema.items():
        if column not in future_df.columns:
            continue
        current_dtype = future_df[column].dtype
        if current_dtype != dtype:
            cast_expressions.append(pl.col(column).cast(dtype, strict=False).alias(column))
    if cast_expressions:
        future_df = future_df.with_columns(cast_expressions)
    combined = pl.concat([full_frame, future_df], how="align")
    return combined.sort(date_col)


def _build_weather_lookup(
    weather_rows: Sequence[Mapping[str, Any]] | None,
    date_col: str,
) -> Dict[str, Dict[str, float]]:
    if not weather_rows:
        return {}
    df = pl.DataFrame(weather_rows)
    if df.is_empty() or date_col not in df.columns:
        return {}
    if "observation_type" in df.columns:
        df = df.filter(pl.col("observation_type").str.to_lowercase() == "forecast")
    if df.is_empty():
        return {}
    numeric_cols = [
        column for column in df.columns if df[column].dtype in NUMERIC_DTYPES
    ]
    if not numeric_cols:
        return {}
    aggregated = df.group_by(date_col).agg(
        [pl.col(column).mean().alias(column) for column in numeric_cols]
    )
    lookup: Dict[str, Dict[str, float]] = {}
    for record in aggregated.to_dicts():
        key = record.pop(date_col)
        if isinstance(key, np.datetime64):
            key = np.datetime_as_string(key, unit="D")
        lookup[str(key)] = {column: float(value) for column, value in record.items()}
    return lookup


def _predict_components(
    *,
    baseline: BaselineModel,
    timeseries_result: FitResult,
    frame: pl.DataFrame,
    features: Sequence[str],
    target: str,
) -> Dict[str, np.ndarray]:
    feature_frame = frame.select(features)
    baseline_series = baseline.predict(feature_frame)
    baseline_pred = baseline_series.to_numpy().astype(float)

    ts_pred = timeseries_result.model.predict(feature_frame.to_numpy()).astype(float)

    if frame[target].null_count() >= frame.height:
        observed_avg = 0.0
    else:
        observed_avg = float(
            frame.filter(pl.col(target).is_not_null()).select(pl.col(target)).mean().item()
        )
    naive_pred = np.full(frame.height, observed_avg, dtype=float)
    return {
        "baseline": baseline_pred,
        "timeseries": ts_pred,
        "naive_mean": naive_pred,
    }


def _derive_component_weights(
    predictions: Mapping[str, np.ndarray],
    observed: pl.DataFrame,
    target: str,
) -> Dict[str, float]:
    if observed.is_empty():
        return {name: 1.0 / len(predictions) for name in predictions}

    target_values = observed[target].to_numpy().astype(float)
    weights: Dict[str, float] = {}
    total = 0.0
    for name, values in predictions.items():
        if len(values) < observed.height:
            continue
        residual = target_values - values[: observed.height]
        rmse = float(math.sqrt(np.mean(residual**2))) if residual.size else float("inf")
        if rmse <= 0 or not np.isfinite(rmse):
            rmse = 1.0
        weight = 1.0 / rmse
        weights[name] = weight
        total += weight

    if not weights or total <= 0:
        return {name: 1.0 / len(predictions) for name in predictions}

    return {name: weight / total for name, weight in weights.items()}


def _weighted_sum(
    predictions: Mapping[str, np.ndarray],
    weights: Mapping[str, float],
) -> np.ndarray:
    total = None
    for name, values in predictions.items():
        weight = weights.get(name, 0.0)
        contribution = values * weight
        total = contribution if total is None else total + contribution
    if total is None:
        raise ValueError("No predictions available to blend")
    return total


def _compute_residuals(
    predicted: np.ndarray,
    actual: pl.Series,
) -> np.ndarray:
    actual_values = actual.to_numpy().astype(float)
    count = min(len(predicted), len(actual_values))
    if count == 0:
        return np.array([])
    return actual_values[:count] - predicted[:count]


def _build_forecasts(
    *,
    forecast_frame: pl.DataFrame,
    observed_count: int,
    ensemble_pred: np.ndarray,
    component_predictions: Mapping[str, np.ndarray],
    residuals: np.ndarray,
    weights: Mapping[str, float],
    horizon_days: int,
    date_col: str,
    rng: np.random.Generator,
    ensemble_size: int,
) -> List[ForecastPoint]:
    future_slice = forecast_frame[observed_count:]
    if future_slice.is_empty():
        return []

    last_observed_date = _to_datetime64(forecast_frame[date_col][observed_count - 1])

    forecasts: List[ForecastPoint] = []
    max_horizon = max(horizon_days, 1)
    res_len = residuals.size
    res_indices = np.arange(res_len)

    for idx, row in enumerate(future_slice.iter_rows(named=True)):
        prediction = float(ensemble_pred[observed_count + idx])
        components = {}
        for name, values in component_predictions.items():
            if observed_count + idx < len(values):
                components[name] = float(values[observed_count + idx])
            elif len(values):
                components[name] = float(values[-1])
            else:
                components[name] = 0.0
        date_value = _to_datetime64(row[date_col])
        horizon = int((date_value - last_observed_date) / np.timedelta64(1, "D"))
        horizon = max(1, min(horizon, max_horizon))
        scale = math.sqrt(max(horizon, 1))
        sample_idx = rng.choice(res_indices, size=ensemble_size, replace=True)
        samples = prediction + residuals[sample_idx] * scale
        quantiles = {
            "p10": float(np.quantile(samples, 0.10)),
            "p50": float(np.quantile(samples, 0.50)),
            "p90": float(np.quantile(samples, 0.90)),
        }
        forecasts.append(
            ForecastPoint(
                date=str(np.datetime_as_string(date_value, unit="D")),
                horizon_days=horizon,
                prediction=prediction,
                quantiles=quantiles,
                components=dict(components),
            )
        )
    return forecasts


def _compute_holdout_metrics(
    *,
    forecast_frame: pl.DataFrame,
    observed_rows: int,
    ensemble_pred: np.ndarray,
    target: str,
    date_col: str,
    timeseries_result: FitResult,
    horizon_days: int,
) -> Dict[str, Any]:
    if observed_rows == 0:
        return _empty_metrics()

    observed = forecast_frame.head(observed_rows)
    max_date = _to_datetime64(observed[date_col].max())
    cutoff = max_date - np.timedelta64(HOLDOUT_WEEKS * 7, "D")
    dates_series = observed[date_col]
    holdout_indices = [
        idx
        for idx, value in enumerate(dates_series)
        if _to_datetime64(value) >= cutoff and observed[target][idx] is not None
    ]
    if not holdout_indices:
        return {
            "overall": {
                "mae": 0.0,
                "rmse": 0.0,
                "mape": 0.0,
                "bias": 0.0,
            },
            "by_horizon": {},
            "cv_mean": float(np.mean(timeseries_result.cv_scores) if timeseries_result.cv_scores else 0.0),
            "holdout_r2": float(timeseries_result.holdout_r2),
            "holdout_rows": 0,
        }

    holdout_pred = ensemble_pred[holdout_indices]
    holdout_actual = observed[target][holdout_indices].to_numpy().astype(float)
    residual = holdout_actual - holdout_pred
    mae = float(np.mean(np.abs(residual))) if residual.size else 0.0
    rmse = float(math.sqrt(np.mean(residual**2))) if residual.size else 0.0
    with np.errstate(divide="ignore", invalid="ignore"):
        mape = float(np.mean(np.abs(residual / np.where(holdout_actual == 0, 1.0, holdout_actual)))) if residual.size else 0.0
    bias = float(np.mean(residual)) if residual.size else 0.0

    train_end_date = cutoff - np.timedelta64(1, "D")
    horizon_metrics: Dict[str, Dict[str, float]] = {}
    for idx, actual_value in zip(holdout_indices, holdout_actual):
        date_value = _to_datetime64(observed[date_col][idx])
        horizon = int((date_value - train_end_date) / np.timedelta64(1, "D"))
        horizon = max(1, min(horizon, horizon_days))
        key = str(horizon)
        metrics = horizon_metrics.setdefault(
            key,
            {
                "count": 0,
                "mae": 0.0,
                "rmse": 0.0,
                "bias": 0.0,
            },
        )
        diff = actual_value - ensemble_pred[idx]
        metrics["count"] += 1
        metrics["mae"] += abs(diff)
        metrics["rmse"] += diff**2
        metrics["bias"] += diff

    for key, metrics in horizon_metrics.items():
        count = max(metrics.pop("count"), 1)
        metrics["mae"] = float(metrics["mae"] / count)
        metrics["rmse"] = float(math.sqrt(metrics["rmse"] / count))
        metrics["bias"] = float(metrics["bias"] / count)

    return {
        "overall": {
            "mae": mae,
            "rmse": rmse,
            "mape": mape,
            "bias": bias,
        },
        "by_horizon": horizon_metrics,
        "cv_mean": float(np.mean(timeseries_result.cv_scores) if timeseries_result.cv_scores else 0.0),
        "holdout_r2": float(timeseries_result.holdout_r2),
        "holdout_rows": len(holdout_indices),
    }


def _build_diagnostics(
    *,
    frame: pl.DataFrame,
    features: Iterable[str],
    baseline: BaselineModel,
    timeseries_result: FitResult,
    residuals: np.ndarray,
) -> Dict[str, Any]:
    return {
        "row_count": int(frame.height),
        "feature_columns": list(features),
        "baseline_has_gam": baseline.gam is not None,
        "timeseries_cv_scores": list(timeseries_result.cv_scores),
        "residual_mean": float(np.mean(residuals)) if residuals.size else 0.0,
        "residual_std": float(np.std(residuals)) if residuals.size else 0.0,
    }


def _empty_metrics() -> Dict[str, Any]:
    return {
        "overall": {
            "mae": 0.0,
            "rmse": 0.0,
            "mape": 0.0,
            "bias": 0.0,
        },
        "by_horizon": {},
        "cv_mean": 0.0,
        "holdout_r2": 0.0,
        "holdout_rows": 0,
    }


def _empty_diagnostics(frame: pl.DataFrame) -> Dict[str, Any]:
    return {
        "row_count": int(frame.height),
        "feature_columns": [],
        "baseline_has_gam": False,
        "timeseries_cv_scores": [],
        "residual_mean": 0.0,
        "residual_std": 0.0,
    }


__all__ = [
    "EnsembleResult",
    "ForecastPoint",
    "run_multi_horizon_ensemble",
    "save_ensemble_metrics_as_json",
]
