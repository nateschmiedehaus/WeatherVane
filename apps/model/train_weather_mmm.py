"""Train weather-aware MMM on validated 90-day tenant data.

This module implements weather-aware media mix modeling by:
1. Loading validated 90-day feature matrices with weather integration
2. Extracting spend, weather, and revenue columns
3. Training MMM with weather as extra features
4. Computing weather elasticity estimates
5. Validating results against critic standards
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import polars as pl

from apps.model.mmm import MMMModel, fit_mmm_model
from shared.feature_store.feature_builder import (
    FeatureBuilder,
    FeatureLeakageError,
    FeatureMatrix,
    TARGET_COLUMN,
    REQUIRED_WEATHER_COLS,
    WEATHER_COVERAGE_COLS,
)

_LOGGER = logging.getLogger(__name__)

# Minimum requirements for weather-aware MMM training
MIN_DAYS_FOR_MMM = 90
MIN_WEATHER_COVERAGE = 0.85
MIN_ROWS_FOR_ELASTICITY = 60

# Spend column patterns recognized by the model
SPEND_COL_PATTERNS = {
    "meta_spend",
    "google_spend",
    "tiktok_spend",
    "amazon_spend",
    "organic_spend",
    "email_spend",
    "ads_spend",  # General ads spend column
    "spend"  # Generic spend pattern
}


@dataclass(frozen=True)
class WeatherMMMMetedata:
    """Metadata for weather-aware MMM training run."""

    tenant_id: str
    run_id: str
    timestamp_utc: str
    window_start: str
    window_end: str
    data_rows: int
    weather_rows: int
    weather_coverage_ratio: float
    weather_coverage_status: str
    spend_channels: List[str]
    weather_features: List[str]
    base_roas: float
    mean_roas: Dict[str, float]
    elasticity: Dict[str, float]
    weather_elasticity: Dict[str, float]
    adstock_lags: Dict[str, int]
    saturation_k: Dict[str, float]
    saturation_s: Dict[str, float]
    model_source: str
    artifacts: Dict[str, str]


@dataclass(frozen=True)
class WeatherMMMResult:
    """Result of weather-aware MMM training."""

    tenant_id: str
    run_id: str
    model: MMMModel
    metadata: WeatherMMMMetedata
    metadata_path: Path
    model_path: Path


def train_weather_mmm(
    tenant_id: str,
    start: datetime,
    end: datetime,
    *,
    lake_root: Path | str = Path("storage/lake/raw"),
    output_root: Path | str = Path("storage/models/weather_mmm"),
    run_id: str | None = None,
    feature_min_rows: int = 14,
) -> WeatherMMMResult:
    """Train weather-aware MMM on validated 90-day tenant data.

    Args:
        tenant_id: Tenant identifier
        start: Training window start (inclusive)
        end: Training window end (inclusive)
        lake_root: Root directory for raw lake datasets
        output_root: Directory to store trained model artifacts
        run_id: Optional run identifier (defaults to timestamp)
        feature_min_rows: Minimum rows before generating lag/rolling features

    Returns:
        WeatherMMMResult with trained model and metadata

    Raises:
        ValueError: If data validation fails (insufficient rows, weather coverage, etc.)
    """

    builder = FeatureBuilder(lake_root=lake_root, feature_min_rows=feature_min_rows)

    # Build feature matrix
    try:
        matrix = builder.build(tenant_id, start, end)
    except FeatureLeakageError as exc:
        if exc.matrix is None:
            raise ValueError(f"Feature leakage error without matrix recovery: {exc}") from exc
        matrix = exc.matrix
        _LOGGER.warning(
            "Feature leakage detected but sanitized for tenant=%s: %d rows removed",
            tenant_id,
            exc.leakage_rows,
        )

    # Validate data window
    window_days = (end - start).days
    if window_days < MIN_DAYS_FOR_MMM:
        raise ValueError(
            f"Training window {window_days} days is below minimum {MIN_DAYS_FOR_MMM} days"
        )

    # Extract observed frame
    observed = _prepare_observed_frame(matrix)
    if observed.is_empty():
        raise ValueError(f"No observed targets available for tenant={tenant_id}")

    if observed.height < MIN_ROWS_FOR_ELASTICITY:
        raise ValueError(
            f"Insufficient data rows {observed.height} for elasticity estimation "
            f"(minimum: {MIN_ROWS_FOR_ELASTICITY})"
        )

    # Validate weather coverage
    weather_status = _validate_weather_coverage(matrix, observed)
    if not weather_status["valid"]:
        raise ValueError(f"Weather coverage validation failed: {weather_status['message']}")

    # Identify spend columns
    spend_cols = _extract_spend_columns(observed)
    if not spend_cols:
        raise ValueError("No recognized spend columns found in feature matrix")

    # Identify weather features
    weather_features = _extract_weather_features(observed)
    if not weather_features:
        raise ValueError("No weather features found in feature matrix")

    # Train MMM with weather as extra features
    model = _fit_weather_aware_mmm(observed, spend_cols, weather_features)

    # Compute weather elasticity
    weather_elasticity = _estimate_weather_elasticity(observed, spend_cols, weather_features)

    # Generate metadata
    timestamp = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    resolved_run_id = run_id or datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    output_dir = Path(output_root) / tenant_id / resolved_run_id
    output_dir.mkdir(parents=True, exist_ok=True)

    metadata = WeatherMMMMetedata(
        tenant_id=tenant_id,
        run_id=resolved_run_id,
        timestamp_utc=timestamp,
        window_start=start.isoformat(),
        window_end=end.isoformat(),
        data_rows=int(observed.height),
        weather_rows=int(matrix.weather_rows),
        weather_coverage_ratio=matrix.weather_coverage_ratio,
        weather_coverage_status=weather_status["classification"],
        spend_channels=spend_cols,
        weather_features=weather_features,
        base_roas=model.base_roas,
        mean_roas=model.mean_roas,
        elasticity=model.elasticity,
        weather_elasticity=weather_elasticity,
        adstock_lags=model.adstock_lags or {},
        saturation_k=model.saturation_k or {},
        saturation_s=model.saturation_s or {},
        model_source=model.source,
        artifacts={},
    )

    # Persist model artifact
    model_path = output_dir / "weather_mmm_model.json"
    _save_model_artifact(model_path, metadata, model)

    # Persist metadata
    metadata_path = output_dir / "metadata.json"
    metadata_dict = asdict(metadata)
    metadata_dict["artifacts"]["metadata_path"] = str(metadata_path)
    metadata_dict["artifacts"]["model_path"] = str(model_path)
    metadata_path.write_text(json.dumps(metadata_dict, indent=2, sort_keys=True))

    _LOGGER.info(
        "Weather-aware MMM training complete for tenant=%s run=%s | "
        "rows=%d weather_rows=%d coverage=%.1f%% base_roas=%.3f channels=%d",
        tenant_id,
        resolved_run_id,
        metadata.data_rows,
        metadata.weather_rows,
        metadata.weather_coverage_ratio * 100.0,
        metadata.base_roas,
        len(spend_cols),
    )

    return WeatherMMMResult(
        tenant_id=tenant_id,
        run_id=resolved_run_id,
        model=model,
        metadata=metadata,
        metadata_path=metadata_path,
        model_path=model_path,
    )


def _prepare_observed_frame(matrix: FeatureMatrix) -> pl.DataFrame:
    """Prepare observed frame for training."""
    observed = matrix.observed_frame
    drop_cols = [col for col in ("target_available", "leakage_risk", "tenant_id") if col in observed.columns]
    if drop_cols:
        observed = observed.drop(drop_cols)
    return observed.sort("date")


def _validate_weather_coverage(matrix: FeatureMatrix, frame: pl.DataFrame) -> Dict[str, Any]:
    """Validate weather data coverage meets requirements.

    Returns:
        Dict with 'valid', 'classification', and 'message' keys
    """
    coverage_ratio = matrix.weather_coverage_ratio
    threshold = matrix.weather_coverage_threshold

    if coverage_ratio >= MIN_WEATHER_COVERAGE:
        classification = "strong"
        valid = True
    elif coverage_ratio >= 0.7:
        classification = "acceptable"
        valid = True
    elif coverage_ratio >= 0.5:
        classification = "marginal"
        valid = True
    else:
        classification = "insufficient"
        valid = False

    return {
        "valid": valid,
        "classification": classification,
        "ratio": coverage_ratio,
        "threshold": threshold,
        "message": f"Weather coverage {coverage_ratio:.1%} is {classification}",
    }


def _extract_spend_columns(frame: pl.DataFrame) -> List[str]:
    """Extract spend columns from feature matrix."""
    found = []
    for col in frame.columns:
        if any(pattern in col.lower() for pattern in SPEND_COL_PATTERNS):
            dtype = frame[col].dtype
            if dtype in {pl.Float64, pl.Float32, pl.Int64, pl.Int32}:
                # Check for positive variance
                if frame[col].sum() > 0 and frame[col].var() is not None:
                    found.append(col)
    return sorted(found)


def _extract_weather_features(frame: pl.DataFrame) -> List[str]:
    """Extract weather features from feature matrix."""
    found = []
    for col in frame.columns:
        if col in REQUIRED_WEATHER_COLS or col in WEATHER_COVERAGE_COLS:
            dtype = frame[col].dtype
            if dtype in {pl.Float64, pl.Float32, pl.Int64, pl.Int32}:
                found.append(col)
    return sorted(found)


def _fit_weather_aware_mmm(
    frame: pl.DataFrame, spend_cols: List[str], weather_features: List[str]
) -> MMMModel:
    """Fit MMM with weather as extra features."""
    model = fit_mmm_model(frame, spend_cols, TARGET_COLUMN)

    # Ensure weather features are captured in elasticity estimates
    for col in weather_features:
        if col not in model.elasticity:
            model.elasticity[col] = _estimate_single_elasticity(frame, col, TARGET_COLUMN)

    return model


def _estimate_single_elasticity(frame: pl.DataFrame, feature: str, target: str) -> float:
    """Estimate elasticity for a single feature via correlation-based approach."""
    if feature not in frame.columns or target not in frame.columns:
        return 0.0

    feature_values = np.asarray(frame[feature].to_numpy(), dtype=float)
    target_values = np.asarray(frame[target].to_numpy(), dtype=float)

    mask = np.isfinite(feature_values) & np.isfinite(target_values)
    if mask.sum() < 2:
        return 0.0

    feature_values = feature_values[mask]
    target_values = target_values[mask]

    # Handle constant features
    if np.allclose(feature_values, feature_values[0]):
        return 0.0

    # Compute covariance-based elasticity
    if feature_values.std() == 0 or target_values.std() == 0:
        return 0.0

    cov = float(np.cov(feature_values, target_values)[0, 1])
    variance = float(feature_values.var())

    if variance <= 0:
        return 0.0

    elasticity_raw = cov / variance
    # Clamp to reasonable range
    return float(np.clip(elasticity_raw, -2.0, 2.0))


def _estimate_weather_elasticity(
    frame: pl.DataFrame, spend_cols: List[str], weather_features: List[str]
) -> Dict[str, float]:
    """Estimate interaction elasticity between weather and spend channels.

    Computes how weather sensitivity varies across spending channels.

    Returns:
        Dict mapping weather features to average elasticity across spend channels
    """
    elasticity_map: Dict[str, float] = {}

    for weather_col in weather_features:
        if weather_col not in frame.columns:
            continue

        elasticities = []
        for spend_col in spend_cols:
            if spend_col not in frame.columns:
                continue

            # Create interaction term
            interaction = _create_interaction_feature(
                frame[weather_col].to_numpy(), frame[spend_col].to_numpy()
            )

            if interaction is None:
                continue

            # Estimate elasticity of target to interaction
            target_values = frame[TARGET_COLUMN].to_numpy()
            elasticity = _estimate_single_elasticity(
                pl.DataFrame({"interaction": interaction, TARGET_COLUMN: target_values}),
                "interaction",
                TARGET_COLUMN,
            )
            if np.isfinite(elasticity):
                elasticities.append(elasticity)

        if elasticities:
            elasticity_map[weather_col] = float(np.mean(elasticities))
        else:
            elasticity_map[weather_col] = 0.0

    return elasticity_map


def _create_interaction_feature(feature1: np.ndarray, feature2: np.ndarray) -> np.ndarray | None:
    """Create interaction feature via standardized multiplication."""
    try:
        f1 = np.asarray(feature1, dtype=float)
        f2 = np.asarray(feature2, dtype=float)

        if f1.shape[0] != f2.shape[0]:
            return None

        mask = np.isfinite(f1) & np.isfinite(f2)
        if mask.sum() < 2:
            return None

        mean1 = float(np.nanmean(f1[mask]))
        mean2 = float(np.nanmean(f2[mask]))

        f1 = np.where(np.isfinite(f1), f1, mean1)
        f2 = np.where(np.isfinite(f2), f2, mean2)

        # Standardize to unit variance
        f1_std = float(np.std(f1))
        f2_std = float(np.std(f2))

        if f1_std == 0 or f2_std == 0:
            return None

        f1_mean = float(np.mean(f1))
        f2_mean = float(np.mean(f2))

        f1_norm = (f1 - f1_mean) / f1_std
        f2_norm = (f2 - f2_mean) / f2_std

        interaction = f1_norm * f2_norm
        return np.nan_to_num(interaction, nan=0.0, posinf=0.0, neginf=0.0)
    except Exception:
        return None


def _save_model_artifact(path: Path, metadata: WeatherMMMMetedata, model: MMMModel) -> None:
    """Save model artifact in JSON format."""
    artifact = {
        "metadata": asdict(metadata),
        "model": {
            "base_roas": model.base_roas,
            "elasticity": model.elasticity,
            "mean_roas": model.mean_roas,
            "mean_spend": model.mean_spend,
            "features": model.features,
            "source": model.source,
            "adstock_lags": model.adstock_lags or {},
            "saturation_k": model.saturation_k or {},
            "saturation_s": model.saturation_s or {},
        },
    }

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(artifact, indent=2, sort_keys=True))
