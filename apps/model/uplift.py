"""
Causal uplift modelling using a two-model approach with incremental lift validation.

This module trains separate regressors for treatment and control cohorts, estimates
uplift on a validation split, and surfaces diagnostics that help determine whether the
model captures meaningful incremental lift. Reports can be persisted for downstream
audits (e.g., experiments/causal/uplift_report.json).
"""
from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Mapping, Sequence

import json
import math

import numpy as np
import polars as pl
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_squared_error
from sklearn.model_selection import train_test_split


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


@dataclass(frozen=True)
class UpliftModelConfig:
    treatment_col: str = "treatment"
    target_col: str = "net_revenue"
    feature_cols: Sequence[str] | None = None
    test_size: float = 0.25
    random_state: int = 2024
    min_group_size: int = 20
    n_estimators: int = 300
    max_depth: int | None = 6
    min_samples_leaf: int = 4
    top_k_percentiles: Sequence[float] = (0.1, 0.25)


@dataclass(frozen=True)
class UpliftTrainingResult:
    config: UpliftModelConfig
    feature_names: List[str]
    treatment_model: Any
    control_model: Any
    dataset: Dict[str, float | int]
    metrics: Dict[str, Dict[str, float]]
    segments: Dict[str, Dict[str, float]]
    feature_importance: Dict[str, float]
    validation_preview: List[Dict[str, float]]

    def to_report(self) -> Dict[str, Any]:
        return {
            "generated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
            "config": _as_jsonable_config(self.config),
            "dataset": self.dataset,
            "metrics": self.metrics,
            "segments": self.segments,
            "feature_importance": self.feature_importance,
            "validation_preview": self.validation_preview,
        }


def train_uplift_model(
    frame: pl.DataFrame,
    config: UpliftModelConfig | None = None,
) -> UpliftTrainingResult:
    """
    Train uplift model using a two-model approach (treatment/control regressors).
    """
    cfg = config or UpliftModelConfig()
    if frame.is_empty():
        raise ValueError("Uplift dataset is empty")

    for column in (cfg.treatment_col, cfg.target_col):
        if column not in frame.columns:
            raise ValueError(f"Required column '{column}' missing from dataset")

    prepared = _prepare_frame(frame, cfg)
    if prepared.height < 4:
        raise ValueError("Uplift training requires at least four observations after cleaning")

    feature_cols = [
        column
        for column in prepared.columns
        if column not in {cfg.treatment_col, cfg.target_col}
    ]
    if not feature_cols and cfg.feature_cols:
        feature_cols = list(cfg.feature_cols)

    feature_cols = _filter_features(prepared, feature_cols)
    if not feature_cols:
        feature_cols = []

    target = prepared[cfg.target_col].to_numpy()
    treatment = prepared[cfg.treatment_col].to_numpy()

    if len({value for value in treatment}) < 2:
        raise ValueError("Uplift training requires both treatment and control observations")

    indices = np.arange(prepared.height)
    train_idx, valid_idx = train_test_split(
        indices,
        test_size=cfg.test_size,
        stratify=treatment,
        random_state=cfg.random_state,
    )

    X = prepared.select(feature_cols).to_numpy() if feature_cols else np.zeros((prepared.height, 1))
    X_train = X[train_idx]
    X_valid = X[valid_idx]
    y_train = target[train_idx]
    y_valid = target[valid_idx]
    t_train = treatment[train_idx]
    t_valid = treatment[valid_idx]

    treatment_model = _fit_group_model(
        X_train[t_train == 1],
        y_train[t_train == 1],
        cfg,
        feature_count=len(feature_cols),
    )
    control_model = _fit_group_model(
        X_train[t_train == 0],
        y_train[t_train == 0],
        cfg,
        feature_count=len(feature_cols),
    )

    predictions = _compute_predictions(
        treatment_model,
        control_model,
        X_train,
        X_valid,
    )

    metrics = _compute_metrics(
        cfg,
        y_train=y_train,
        y_valid=y_valid,
        t_train=t_train,
        t_valid=t_valid,
        train_preds=predictions["train"],
        valid_preds=predictions["valid"],
    )

    segments = _segment_metrics(
        cfg,
        y_valid=y_valid,
        t_valid=t_valid,
        valid_preds=predictions["valid"],
    )

    importance = _combine_feature_importances(
        treatment_model,
        control_model,
        feature_cols if feature_cols else ["bias"],
    )

    preview = _validation_preview(
        cfg,
        feature_cols,
        prepared,
        valid_idx,
        predictions["valid"],
        max_rows=10,
    )

    dataset_info: Dict[str, float | int] = {
        "rows_total": int(prepared.height),
        "rows_train": int(len(train_idx)),
        "rows_validation": int(len(valid_idx)),
        "feature_columns": int(len(feature_cols)),
        "treatment_share": _clean_float(float(treatment.mean())),
    }

    return UpliftTrainingResult(
        config=cfg,
        feature_names=feature_cols,
        treatment_model=treatment_model,
        control_model=control_model,
        dataset=dataset_info,
        metrics=metrics,
        segments=segments,
        feature_importance=importance,
        validation_preview=preview,
    )


def write_uplift_report(result: UpliftTrainingResult, path: Path | str) -> Path:
    report = result.to_report()
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True))
    return output_path


def _prepare_frame(frame: pl.DataFrame, cfg: UpliftModelConfig) -> pl.DataFrame:
    columns = (
        list(cfg.feature_cols)
        if cfg.feature_cols is not None
        else [
            column
            for column, dtype in frame.schema.items()
            if dtype in NUMERIC_DTYPES or column in {cfg.treatment_col, cfg.target_col}
        ]
    )
    subset = frame.select([col for col in columns if col in frame.columns])
    subset = subset.drop_nulls(subset=[cfg.target_col, cfg.treatment_col])
    if subset.is_empty():
        raise ValueError("No rows remain after dropping null treatment/target values")
    subset = subset.with_columns(
        pl.col(cfg.treatment_col).cast(pl.Int8),
        pl.col(cfg.target_col).cast(pl.Float64),
    )
    return subset


def _filter_features(frame: pl.DataFrame, features: Sequence[str]) -> List[str]:
    cleaned: List[str] = []
    for feature in features:
        if feature not in frame.columns:
            continue
        series = frame.get_column(feature)
        if series.dtype not in NUMERIC_DTYPES:
            continue
        if series.null_count() >= frame.height:
            continue
        if series.n_unique() <= 1:
            continue
        cleaned.append(feature)
    return cleaned


def _fit_group_model(
    X: np.ndarray,
    y: np.ndarray,
    cfg: UpliftModelConfig,
    *,
    feature_count: int,
) -> Any:
    if X.size == 0 or feature_count == 0:
        model = DummyRegressor(strategy="mean")
        model.fit(np.zeros((len(y), 1)), y)
        return model

    if len(y) < max(cfg.min_group_size, cfg.min_samples_leaf * 2):
        model = DummyRegressor(strategy="mean")
        model.fit(np.zeros((len(y), 1)), y)
        return model

    model = RandomForestRegressor(
        n_estimators=cfg.n_estimators,
        max_depth=cfg.max_depth,
        min_samples_leaf=cfg.min_samples_leaf,
        random_state=cfg.random_state,
        n_jobs=-1,
    )
    model.fit(X, y)
    return model


def _compute_predictions(
    treatment_model: Any,
    control_model: Any,
    X_train: np.ndarray,
    X_valid: np.ndarray,
) -> Dict[str, Dict[str, np.ndarray]]:
    train_pred_t = treatment_model.predict(X_train)
    train_pred_c = control_model.predict(X_train)
    valid_pred_t = treatment_model.predict(X_valid)
    valid_pred_c = control_model.predict(X_valid)
    return {
        "train": {
            "treatment": np.asarray(train_pred_t),
            "control": np.asarray(train_pred_c),
            "uplift": np.asarray(train_pred_t) - np.asarray(train_pred_c),
        },
        "valid": {
            "treatment": np.asarray(valid_pred_t),
            "control": np.asarray(valid_pred_c),
            "uplift": np.asarray(valid_pred_t) - np.asarray(valid_pred_c),
        },
    }


def _compute_metrics(
    cfg: UpliftModelConfig,
    *,
    y_train: np.ndarray,
    y_valid: np.ndarray,
    t_train: np.ndarray,
    t_valid: np.ndarray,
    train_preds: Mapping[str, np.ndarray],
    valid_preds: Mapping[str, np.ndarray],
) -> Dict[str, Dict[str, float]]:
    return {
        "training": {
            "rows": int(len(y_train)),
            "actual_ate": _lift(y_train, t_train),
            "predicted_ate": _clean_float(float(train_preds["uplift"].mean())),
            "rmse_treatment": _rmse(train_preds["treatment"], y_train, t_train, 1),
            "rmse_control": _rmse(train_preds["control"], y_train, t_train, 0),
        },
        "validation": {
            "rows": int(len(y_valid)),
            "actual_ate": _lift(y_valid, t_valid),
            "predicted_ate": _clean_float(float(valid_preds["uplift"].mean())),
            "rmse_treatment": _rmse(valid_preds["treatment"], y_valid, t_valid, 1),
            "rmse_control": _rmse(valid_preds["control"], y_valid, t_valid, 0),
            "qini_auc": _qini_auc(y_valid, t_valid, valid_preds["uplift"]),
        },
    }


def _segment_metrics(
    cfg: UpliftModelConfig,
    *,
    y_valid: np.ndarray,
    t_valid: np.ndarray,
    valid_preds: Mapping[str, np.ndarray],
) -> Dict[str, Dict[str, float]]:
    uplift = valid_preds["uplift"]
    if uplift.size == 0:
        return {}

    order = np.argsort(uplift)[::-1]
    uplift_sorted = uplift[order]
    y_sorted = y_valid[order]
    t_sorted = t_valid[order]

    segments: Dict[str, Dict[str, float]] = {}
    total = uplift.size
    for percentile in cfg.top_k_percentiles:
        if percentile <= 0 or percentile > 1:
            continue
        count = max(int(total * percentile), 1)
        subset_y = y_sorted[:count]
        subset_t = t_sorted[:count]
        actual_lift = _lift(subset_y, subset_t)
        predicted = float(uplift_sorted[:count].mean()) if count else 0.0
        treatment_share = float(subset_t.mean()) if count else 0.0
        segments[f"top_{int(percentile * 100)}"] = {
            "population_share": _clean_float(count / total),
            "sample_size": int(count),
            "actual_lift": actual_lift,
            "predicted_uplift": _clean_float(predicted),
            "treatment_share": _clean_float(treatment_share),
        }
    return segments


def _combine_feature_importances(
    treatment_model: Any,
    control_model: Any,
    features: Sequence[str],
) -> Dict[str, float]:
    importance: Dict[str, float] = {}
    treatment_importance = getattr(treatment_model, "feature_importances_", None)
    control_importance = getattr(control_model, "feature_importances_", None)
    if treatment_importance is None and control_importance is None:
        return {feature: 0.0 for feature in features}

    for idx, feature in enumerate(features):
        treat_score = float(treatment_importance[idx]) if treatment_importance is not None else 0.0
        ctrl_score = float(control_importance[idx]) if control_importance is not None else 0.0
        importance[feature] = _clean_float((treat_score + ctrl_score) / 2.0)
    return importance


def _validation_preview(
    cfg: UpliftModelConfig,
    features: Sequence[str],
    frame: pl.DataFrame,
    valid_idx: np.ndarray,
    valid_preds: Mapping[str, np.ndarray],
    *,
    max_rows: int,
) -> List[Dict[str, float]]:
    if not len(valid_idx):
        return []
    rows: List[Dict[str, float]] = []
    columns = list(features[:3])
    treatment_series = frame.get_column(cfg.treatment_col)
    target_series = frame.get_column(cfg.target_col)
    feature_series = {feature: frame.get_column(feature) for feature in columns}
    for position, row_idx in enumerate(valid_idx[:max_rows]):
        row = int(row_idx)
        record: Dict[str, float] = {
            "treatment": _clean_float(float(treatment_series[row])),
            "actual": _clean_float(float(target_series[row])),
            "pred_treatment": _clean_float(float(valid_preds["treatment"][position])),
            "pred_control": _clean_float(float(valid_preds["control"][position])),
            "pred_uplift": _clean_float(float(valid_preds["uplift"][position])),
        }
        for feature, series in feature_series.items():
            record[f"feature::{feature}"] = _clean_float(float(series[row]))
        rows.append(record)
    return rows


def _lift(values: np.ndarray, treatment: np.ndarray) -> float:
    treated = values[treatment == 1]
    control = values[treatment == 0]
    if treated.size == 0 or control.size == 0:
        return 0.0
    return _clean_float(float(treated.mean() - control.mean()))


def _rmse(predictions: np.ndarray, actuals: np.ndarray, treatment: np.ndarray, group: int) -> float:
    mask = treatment == group
    if not mask.any():
        return 0.0
    return _clean_float(float(math.sqrt(mean_squared_error(actuals[mask], predictions[mask]))))


def _qini_auc(values: np.ndarray, treatment: np.ndarray, uplift: np.ndarray) -> float:
    if uplift.size == 0:
        return 0.0
    order = np.argsort(uplift)[::-1]
    sorted_treatment = treatment[order]
    sorted_values = values[order]
    cum_treat = np.cumsum(sorted_treatment)
    cum_control = np.cumsum(1 - sorted_treatment)
    cum_y_treat = np.cumsum(sorted_values * sorted_treatment)
    cum_y_control = np.cumsum(sorted_values * (1 - sorted_treatment))
    with np.errstate(divide="ignore", invalid="ignore"):
        avg_treat = np.divide(cum_y_treat, cum_treat, where=cum_treat > 0)
        avg_control = np.divide(cum_y_control, cum_control, where=cum_control > 0)
    incremental = np.nan_to_num(avg_treat - avg_control)
    x = np.linspace(0, 1, incremental.size)
    integrate = getattr(np, "trapezoid", np.trapz)
    model_area = float(integrate(incremental, x))
    baseline = _lift(values, treatment)
    random_curve = baseline * x
    baseline_area = float(integrate(random_curve, x))
    return _clean_float(model_area - baseline_area)


def _clean_float(value: float) -> float:
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return 0.0


def _as_jsonable_config(config: UpliftModelConfig) -> Dict[str, Any]:
    payload = asdict(config)
    payload["top_k_percentiles"] = [float(p) for p in config.top_k_percentiles]
    return payload
