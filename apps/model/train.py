from __future__ import annotations

import argparse
import json
import math
import os
import pickle
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

import numpy as np
import polars as pl
from loguru import logger

from apps.model.baseline import (
    BaselineModel,
    LinearGAM,
    WEATHER_KEYWORDS,
    evaluate_r2,
    fit_baseline_model,
)
from shared.feature_store.feature_builder import (
    FeatureBuilder,
    FeatureLeakageError,
    FeatureMatrix,
    TARGET_COLUMN,
)
from shared.services.data_quality import run_data_quality_validation, DataQualityConfig

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
class BaselineTrainingResult:
    tenant_id: str
    run_id: str
    model: BaselineModel
    model_path: Path
    metadata_path: Path
    metadata: Dict[str, Any]


@dataclass(frozen=True)
class BaselineEvaluation:
    train_metrics: Dict[str, float]
    holdout_metrics: Dict[str, float]
    influences: List[Dict[str, float]]
    weather_fit: Dict[str, Any]
    gam_reason: str
    gam_min_rows: int

    @property
    def gam_used(self) -> bool:
        return self.gam_reason == "gam"


def evaluate_baseline_run(
    model: BaselineModel,
    train_frame: pl.DataFrame,
    holdout_frame: pl.DataFrame,
    *,
    target: str,
) -> BaselineEvaluation:
    train_metrics = _compute_metrics(model, train_frame, target)
    holdout_metrics = _compute_metrics(model, holdout_frame, target)
    influences = _rank_features(model, train_frame)
    weather_fit = _summarize_weather_fit(influences)

    total_rows = train_frame.height + holdout_frame.height
    feature_count = len(model.features)
    gam_min_rows = max(24, feature_count * 4) if feature_count else 24

    if model.gam is None:
        if feature_count == 0:
            gam_reason = "no_features"
        elif total_rows < gam_min_rows:
            gam_reason = "insufficient_rows"
        elif LinearGAM is None:
            gam_reason = "pygam_unavailable"
        else:
            gam_reason = "fallback_linear"
    else:
        gam_reason = "gam"

    return BaselineEvaluation(
        train_metrics=train_metrics,
        holdout_metrics=holdout_metrics,
        influences=influences,
        weather_fit=weather_fit,
        gam_reason=gam_reason,
        gam_min_rows=gam_min_rows,
    )


def train_baseline(
    tenant_id: str,
    start: datetime,
    end: datetime,
    *,
    lake_root: Path | str = Path("storage/lake/raw"),
    output_root: Path | str = Path("storage/models/baseline"),
    run_id: str | None = None,
    feature_min_rows: int = 14,
    skip_data_quality_check: bool = False,
) -> BaselineTrainingResult:
    """Train and persist the weather-aware baseline model for a tenant.

    Args:
        tenant_id: Tenant identifier
        start: Training window start date
        end: Training window end date
        lake_root: Root directory for raw data
        output_root: Directory for model outputs
        run_id: Optional run identifier (defaults to timestamp)
        feature_min_rows: Minimum rows before feature engineering
        skip_data_quality_check: If False, runs data quality validation before training

    Returns:
        BaselineTrainingResult with trained model and metadata
    """

    builder = FeatureBuilder(lake_root=lake_root, feature_min_rows=feature_min_rows)
    leakage_info: Dict[str, Any] = {
        "status": "clean",
        "removed_rows": 0,
        "forward_leakage_rows": 0,
        "forecast_leakage_rows": 0,
        "leakage_dates": [],
        "forward_leakage_dates": [],
        "forecast_leakage_dates": [],
    }

    try:
        matrix = builder.build(tenant_id, start, end)
    except FeatureLeakageError as exc:
        if exc.matrix is None:
            raise
        matrix = exc.matrix
        leakage_info.update(
            {
                "status": "sanitized",
                "message": str(exc),
                "removed_rows": exc.leakage_rows,
                "forward_leakage_rows": exc.forward_rows,
                "forecast_leakage_rows": exc.forecast_rows,
                "leakage_dates": exc.leakage_dates,
                "forward_leakage_dates": exc.forward_dates,
                "forecast_leakage_dates": exc.forecast_dates,
            }
        )

    observed = _prepare_observed_frame(matrix)
    if observed.is_empty():
        raise ValueError(f"No observed targets available for tenant={tenant_id}")

    # Convert to pandas for data quality checks
    pandas_frame = observed.to_pandas()

    # Run data quality validation before training
    if not skip_data_quality_check:
        dq_config = DataQualityConfig()
        dq_report = run_data_quality_validation(
            tenant_id=tenant_id,
            window=(start, end),
            design_matrix=pandas_frame.to_dict("list"),
            metadata={
                "feature_rows": matrix.orders_rows,
                "ads_rows": matrix.ads_rows,
                "promo_rows": matrix.promo_rows,
                "weather_rows": matrix.weather_rows,
            },
            output_path=Path(output_root) / tenant_id / "data_quality_report.json",
            config=dq_config,
            target_column=TARGET_COLUMN,
            date_column="date" if "date" in observed.columns else None,
        )
        # Log data quality results
        logger.info(
            "Data quality validation for tenant=%s | status=%s | issues=%d",
            tenant_id,
            dq_report.get("status"),
            len(dq_report.get("issues", [])),
        )

    features = _candidate_features(observed)

    train_frame, holdout_frame = _split_train_holdout(observed)
    model = fit_baseline_model(train_frame, target=TARGET_COLUMN, features=features)

    evaluation = evaluate_baseline_run(
        model,
        train_frame,
        holdout_frame,
        target=TARGET_COLUMN,
    )

    timestamp = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    resolved_run_id = run_id or datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    output_dir = Path(output_root) / tenant_id / resolved_run_id
    output_dir.mkdir(parents=True, exist_ok=True)

    model_path = output_dir / "baseline_model.pkl"
    with model_path.open("wb") as fh:
        pickle.dump(model, fh)

    diagnostics_path = None
    if not holdout_frame.is_empty():
        diagnostics = holdout_frame.with_columns(
            model.predict(holdout_frame).alias("prediction")
        )
        diagnostics_path = output_dir / "holdout_diagnostics.parquet"
        diagnostics.write_parquet(diagnostics_path, compression="zstd")

    metadata = {
        "tenant_id": tenant_id,
        "run_id": resolved_run_id,
        "timestamp_utc": timestamp,
        "window": {"start": start.isoformat(), "end": end.isoformat()},
        "data": {
            "observed_rows": int(observed.height),
            "train_rows": int(train_frame.height),
            "holdout_rows": int(holdout_frame.height),
            "feature_columns": len(model.features),
            "orders_rows": matrix.orders_rows,
            "ads_rows": matrix.ads_rows,
            "promo_rows": matrix.promo_rows,
            "weather_rows": matrix.weather_rows,
            "latest_observed_target_date": matrix.latest_observed_date,
        },
        "features": list(model.features),
        "top_features": evaluation.influences,
        "weather_fit": evaluation.weather_fit,
        "gam": {
            "used": evaluation.gam_used,
            "reason": evaluation.gam_reason,
            "min_required_rows": evaluation.gam_min_rows,
        },
        "training": evaluation.train_metrics,
        "holdout": evaluation.holdout_metrics,
        "leakage_guardrail": {
            **leakage_info,
            "leakage_risk_rows": matrix.leakage_risk_rows,
            "forward_leakage_rows_matrix": matrix.forward_leakage_rows,
            "forecast_leakage_rows_matrix": matrix.forecast_leakage_rows,
        },
        "artifacts": {
            "model_path": str(model_path),
            "holdout_diagnostics": str(diagnostics_path) if diagnostics_path else None,
        },
    }

    metadata_path = output_dir / "metadata.json"
    metadata_path.write_text(json.dumps(metadata, indent=2, sort_keys=True))

    logger.info(
        "Baseline training complete for tenant=%s run=%s | rows=%d gam=%s r2=%.3f holdout_r2=%.3f",
        tenant_id,
        resolved_run_id,
        metadata["data"]["observed_rows"],
        metadata["gam"]["reason"],
        metadata["training"]["r2"],
        metadata["holdout"]["r2"],
    )

    return BaselineTrainingResult(
        tenant_id=tenant_id,
        run_id=resolved_run_id,
        model=model,
        model_path=model_path,
        metadata_path=metadata_path,
        metadata=metadata,
    )


def _prepare_observed_frame(matrix: FeatureMatrix) -> pl.DataFrame:
    observed = matrix.observed_frame
    drop_cols = [col for col in ("target_available", "leakage_risk", "tenant_id") if col in observed.columns]
    if drop_cols:
        observed = observed.drop(drop_cols)
    return observed.sort("date")


def _candidate_features(frame: pl.DataFrame) -> List[str]:
    return [
        column
        for column, dtype in frame.schema.items()
        if column != TARGET_COLUMN and dtype in NUMERIC_DTYPES
    ]


def _split_train_holdout(frame: pl.DataFrame, holdout_min: int = 14, frac: float = 0.2) -> Tuple[pl.DataFrame, pl.DataFrame]:
    total = frame.height
    if total <= 2:
        return frame, frame.clear()
    holdout = max(int(total * frac), holdout_min if total > holdout_min else 1)
    if holdout >= total:
        holdout = max(1, total // 3)
    train_rows = max(total - holdout, 1)
    if train_rows == total:
        return frame, frame.clear()
    train_frame = frame.head(train_rows)
    holdout_frame = frame.tail(total - train_rows)
    return train_frame, holdout_frame


def _compute_metrics(model: BaselineModel, frame: pl.DataFrame, target: str) -> Dict[str, float]:
    if frame.is_empty():
        return {
            "rows": 0,
            "r2": 0.0,
            "mae": 0.0,
            "rmse": 0.0,
            "bias": 0.0,
            "mean_prediction": 0.0,
            "std_prediction": 0.0,
        }
    preds = model.predict(frame).to_numpy()
    actuals = frame[target].to_numpy()
    residuals = actuals - preds
    mae = float(np.mean(np.abs(residuals)))
    rmse = float(np.sqrt(np.mean(residuals ** 2)))
    bias = float(np.mean(residuals))
    mean_prediction = float(np.mean(preds))
    std_prediction = float(np.std(preds))
    r2_raw = evaluate_r2(model, frame)
    r2_value = _clean_float(r2_raw)
    r2_value = max(0.0, min(1.0, r2_value))
    rows = len(actuals)
    return {
        "rows": int(rows),
        "r2": r2_value,
        "mae": _clean_float(mae),
        "rmse": _clean_float(rmse),
        "bias": _clean_float(bias),
        "mean_prediction": _clean_float(mean_prediction),
        "std_prediction": _clean_float(std_prediction),
    }


def _rank_features(model: BaselineModel, frame: pl.DataFrame, limit: int = 8) -> List[Dict[str, float]]:
    if frame.is_empty() or not model.features:
        return []

    rankings: List[Tuple[str, float]] = []
    if model.gam is None and model.coefficients:
        for feature in model.features:
            if feature not in model.coefficients or feature not in frame.columns:
                continue
            values = frame[feature].to_numpy()
            if values.size == 0:
                continue
            std = float(np.std(values))
            if not math.isfinite(std) or std == 0.0:
                continue
            influence = abs(model.coefficients[feature]) * std
            rankings.append((feature, influence))
    else:
        preds = model.predict(frame).to_numpy()
        for feature in model.features:
            if feature not in frame.columns:
                continue
            values = frame[feature].to_numpy()
            if values.size == 0:
                continue
            if np.allclose(values, values[0]):
                continue
            corr = np.corrcoef(values, preds)[0, 1]
            if not np.isfinite(corr):
                continue
            rankings.append((feature, float(abs(corr))))

    rankings.sort(key=lambda item: item[1], reverse=True)
    top = rankings[:limit]
    return [{"feature": name, "influence": _clean_float(score)} for name, score in top]


def _is_weather_feature(name: str) -> bool:
    lowered = name.lower()
    return any(keyword in lowered for keyword in WEATHER_KEYWORDS)


def _weather_fit_payload(score: float, weather_features: List[Dict[str, float]]) -> Dict[str, Any]:
    if score >= 0.45:
        classification = "strong"
        message = "Weather signals dominate observed revenue."
    elif score >= 0.25:
        classification = "moderate"
        message = "Weather contributes meaningfully alongside other drivers."
    elif score >= 0.1:
        classification = "weak"
        message = "Weather impact is limited; treat recommendations with caution."
    else:
        classification = "none"
        message = "Weather impact negligible; WeatherVane is not a fit for this brand."
    return {
        "score": round(score, 3),
        "classification": classification,
        "message": message,
        "weather_features": weather_features[:3],
    }


def _summarize_weather_fit(influences: List[Dict[str, float]]) -> Dict[str, Any]:
    if not influences:
        return _weather_fit_payload(0.0, [])
    weather_influences = [item for item in influences if _is_weather_feature(item["feature"])]
    total = sum(item["influence"] for item in influences) or 1.0
    weather_sum = sum(item["influence"] for item in weather_influences)
    score = max(0.0, min(1.0, weather_sum / total))
    return _weather_fit_payload(score, weather_influences)


def _clean_float(value: float) -> float:
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return 0.0


def _parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train WeatherVane baseline (GAM) model")
    parser.add_argument("tenant", help="Tenant identifier to train")
    parser.add_argument(
        "--start",
        type=_parse_date,
        help="Start date (YYYY-MM-DD). Defaults to end - lookback-days.",
    )
    parser.add_argument(
        "--end",
        type=_parse_date,
        help="End date (YYYY-MM-DD). Defaults to today (UTC).",
    )
    parser.add_argument(
        "--lookback-days",
        type=int,
        default=365,
        help="Window length when --start is omitted.",
    )
    parser.add_argument(
        "--lake-root",
        default=os.getenv("STORAGE_LAKE_ROOT", "storage/lake/raw"),
        help="Root directory for raw lake datasets.",
    )
    parser.add_argument(
        "--output-root",
        default=os.getenv("BASELINE_OUTPUT_ROOT", "storage/models/baseline"),
        help="Directory to store trained model artifacts.",
    )
    parser.add_argument(
        "--run-id",
        help="Optional run identifier (defaults to timestamp).",
    )
    parser.add_argument(
        "--feature-min-rows",
        type=int,
        default=14,
        help="Minimum rows required before generating lag/rolling features.",
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def _parse_date(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d")


def train(argv: Iterable[str] | None = None) -> BaselineTrainingResult:
    args = _parse_args(argv)
    end = args.end or datetime.utcnow()
    start = args.start or (end - timedelta(days=int(args.lookback_days)))
    return train_baseline(
        tenant_id=args.tenant,
        start=start,
        end=end,
        lake_root=args.lake_root,
        output_root=args.output_root,
        run_id=args.run_id,
        feature_min_rows=int(args.feature_min_rows),
    )


if __name__ == "__main__":
    train()
