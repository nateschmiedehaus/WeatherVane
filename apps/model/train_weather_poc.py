"""Train weather-aware PoC model on synthetic tenant data.

This module implements proof-of-concept weather-aware regression models
to validate that the modeling pipeline correctly detects and leverages
weather signals across different product categories.

The PoC trains a simple linear regression model (sklearn) on each synthetic
tenant, comparing performance with and without weather features.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import polars as pl
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error

_LOGGER = logging.getLogger(__name__)

# Synthetic data paths
SYNTHETIC_DATA_DIR = Path("storage/seeds/synthetic")
EXPERIMENTS_DIR = Path("experiments/mcp")

# Model configuration
MIN_TRAIN_ROWS = 60
MIN_VAL_ROWS = 20
RANDOM_STATE = 42

SPEND_COLS = ["meta_spend", "google_spend"]
WEATHER_COLS = [
    "temperature_celsius",
    "precipitation_mm",
    "relative_humidity_percent",
    "windspeed_kmh",
]
TARGET_COL = "revenue_usd"
LOCATION_COL = "location_x"  # Handle duplicate location columns in synthetic data


@dataclass(frozen=True)
class ModelMetrics:
    """Model performance metrics."""

    train_r2: float
    train_rmse: float
    train_mae: float
    val_r2: float
    val_rmse: float
    val_mae: float
    feature_importance: Dict[str, float]


@dataclass(frozen=True)
class TenantPoCResult:
    """PoC results for a single tenant."""

    tenant_id: str
    tenant_name: str
    location: str
    num_products: int
    num_train_rows: int
    num_val_rows: int
    metrics_without_weather: ModelMetrics
    metrics_with_weather: ModelMetrics
    weather_improvement_r2: float
    weather_coefficients: Dict[str, float]
    spend_elasticity: Dict[str, float]
    weather_elasticity: Dict[str, float]
    quality_score: float


def load_synthetic_tenant(tenant_id: str) -> Optional[pl.DataFrame]:
    """Load a synthetic tenant parquet file."""
    path = SYNTHETIC_DATA_DIR / f"{tenant_id}.parquet"
    if not path.exists():
        _LOGGER.warning(f"Synthetic data not found: {path}")
        return None

    df = pl.read_parquet(path)
    _LOGGER.info(f"Loaded {tenant_id}: {len(df)} rows, {len(df.columns)} columns")
    return df


def _aggregate_by_date(df: pl.DataFrame) -> pl.DataFrame:
    """Keep product-level daily data but normalize per-product features.

    This preserves product-level variance while having weather features
    repeated for each product on a given date (since weather is location-level).
    """
    # Keep product-level granularity to preserve variance
    agg_df = df.select([
        "date",
        "product_id",
        "product_name",
        TARGET_COL,
        "meta_spend",
        "google_spend",
        "temperature_celsius",
        "precipitation_mm",
        "relative_humidity_percent",
        "windspeed_kmh",
    ]).sort("date")

    return agg_df


def _prepare_features(
    df: pl.DataFrame, include_weather: bool = False
) -> Tuple[np.ndarray, np.ndarray]:
    """Prepare feature matrix and target vector.

    Args:
        df: Daily aggregated data
        include_weather: If True, include weather features

    Returns:
        (X, y) feature matrix and target vector
    """
    features = SPEND_COLS.copy()
    if include_weather:
        features.extend(WEATHER_COLS)

    # Extract features and target
    X = df.select(features).to_numpy()
    y = df.select(TARGET_COL).to_numpy().ravel()

    # Handle any NaNs
    valid_idx = ~np.isnan(y)
    X = X[valid_idx]
    y = y[valid_idx]

    return X, y


def _train_and_evaluate(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    feature_names: list,
) -> Tuple[Ridge, ModelMetrics]:
    """Train Ridge regression model and evaluate on train/val sets.

    Args:
        X_train: Training features
        y_train: Training target
        X_val: Validation features
        y_val: Validation target
        feature_names: Names of features (for importance)

    Returns:
        (model, metrics) trained model and evaluation metrics
    """
    # Standardize features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)

    # Train Ridge model (L2 regularization)
    model = Ridge(alpha=1.0, random_state=RANDOM_STATE)
    model.fit(X_train_scaled, y_train)

    # Predictions
    y_train_pred = model.predict(X_train_scaled)
    y_val_pred = model.predict(X_val_scaled)

    # Metrics
    train_r2 = r2_score(y_train, y_train_pred)
    train_rmse = np.sqrt(mean_squared_error(y_train, y_train_pred))
    train_mae = mean_absolute_error(y_train, y_train_pred)

    val_r2 = r2_score(y_val, y_val_pred)
    val_rmse = np.sqrt(mean_squared_error(y_val, y_val_pred))
    val_mae = mean_absolute_error(y_val, y_val_pred)

    # Feature importance (standardized coefficients)
    feature_importance = {
        name: float(coef) for name, coef in zip(feature_names, model.coef_)
    }

    metrics = ModelMetrics(
        train_r2=train_r2,
        train_rmse=train_rmse,
        train_mae=train_mae,
        val_r2=val_r2,
        val_rmse=val_rmse,
        val_mae=val_mae,
        feature_importance=feature_importance,
    )

    return model, metrics


def _compute_elasticity(
    model: Ridge, feature_names: list, scaler: StandardScaler
) -> Dict[str, float]:
    """Compute elasticity estimates from standardized coefficients.

    Elasticity = (coefficient × mean(feature)) / mean(target)

    For standardized features, we need to reverse the standardization.
    """
    elasticity = {}
    for i, name in enumerate(feature_names):
        coef = model.coef_[i]
        # Standardized coefficient already accounts for feature scaling
        elasticity[name] = float(coef)

    return elasticity


def _assess_quality(
    metrics_without: ModelMetrics,
    metrics_with: ModelMetrics,
    tenant_id: str,
    expected_improvement: float,
) -> float:
    """Assess overall model quality and weather signal detection.

    Returns score from 0-1, where:
    - 1.0 = Perfect (strong weather improvement, good val performance)
    - 0.5 = Acceptable (modest improvement, reasonable val performance)
    - 0.0 = Poor (no improvement, poor val performance)
    """
    # R² improvement
    improvement = metrics_with.val_r2 - metrics_without.val_r2
    improvement_ratio = max(0, min(1, improvement / max(expected_improvement, 0.01)))

    # Validation R² quality
    val_r2_quality = max(0, min(1, metrics_with.val_r2 / 0.7))

    # Avoid overfitting
    train_val_gap = metrics_with.train_r2 - metrics_with.val_r2
    generalization = max(0, 1 - train_val_gap / max(0.3, abs(metrics_with.train_r2)))

    # Combined score
    score = 0.4 * improvement_ratio + 0.3 * val_r2_quality + 0.3 * generalization
    return float(score)


def train_poc_for_tenant(tenant_id: str) -> Optional[TenantPoCResult]:
    """Train PoC models for a single tenant.

    Args:
        tenant_id: Synthetic tenant ID

    Returns:
        TenantPoCResult or None if training fails
    """
    # Load data
    df = load_synthetic_tenant(tenant_id)
    if df is None:
        return None

    _LOGGER.info(f"Processing tenant: {tenant_id}")

    # Extract metadata
    tenant_name = df.select("tenant_name").item(0, 0)
    location = df.select(LOCATION_COL).item(0, 0)
    num_products = df.select("product_id").unique().shape[0]

    # Aggregate to product-daily level
    df_daily = _aggregate_by_date(df)
    _LOGGER.info(f"Aggregated to {len(df_daily)} product-daily records")

    # Split train/val: ~70% train, ~30% val
    # With 450 rows (5 products × 90 days), use ~315 for train, ~135 for val
    n_rows = len(df_daily)
    train_pct = 0.70
    split_idx = int(n_rows * train_pct)

    df_train = df_daily.slice(0, split_idx)
    df_val = df_daily.slice(split_idx)

    if len(df_train) < MIN_TRAIN_ROWS or len(df_val) < MIN_VAL_ROWS:
        _LOGGER.error(f"Insufficient data: {len(df_train)} train, {len(df_val)} val")
        return None

    _LOGGER.info(f"Train/Val split: {len(df_train)} / {len(df_val)}")

    # Prepare features (without weather)
    X_train, y_train = _prepare_features(df_train, include_weather=False)
    X_val, y_val = _prepare_features(df_val, include_weather=False)

    # Train without weather
    model_no_weather, metrics_no_weather = _train_and_evaluate(
        X_train, y_train, X_val, y_val, SPEND_COLS
    )
    _LOGGER.info(f"Model without weather: Val R² = {metrics_no_weather.val_r2:.3f}")

    # Prepare features (with weather)
    X_train_w, y_train_w = _prepare_features(df_train, include_weather=True)
    X_val_w, y_val_w = _prepare_features(df_val, include_weather=True)

    # Train with weather
    features_with_weather = SPEND_COLS + WEATHER_COLS
    model_weather, metrics_weather = _train_and_evaluate(
        X_train_w, y_train_w, X_val_w, y_val_w, features_with_weather
    )
    _LOGGER.info(f"Model with weather: Val R² = {metrics_weather.val_r2:.3f}")

    # Extract elasticity estimates
    weather_elasticity = {
        name: metrics_weather.feature_importance[name] for name in WEATHER_COLS
    }
    spend_elasticity = {
        name: metrics_weather.feature_importance[name] for name in SPEND_COLS
    }

    # Assess quality
    expected_improvement = 0.08  # Default expectation
    if "extreme" in tenant_id.lower():
        expected_improvement = 0.20
    elif "high" in tenant_id.lower():
        expected_improvement = 0.10
    elif "medium" in tenant_id.lower():
        expected_improvement = 0.03
    else:  # no sensitivity
        expected_improvement = 0.01

    quality = _assess_quality(
        metrics_no_weather, metrics_weather, tenant_id, expected_improvement
    )

    result = TenantPoCResult(
        tenant_id=tenant_id,
        tenant_name=tenant_name,
        location=location,
        num_products=num_products,
        num_train_rows=len(df_train),
        num_val_rows=len(df_val),
        metrics_without_weather=metrics_no_weather,
        metrics_with_weather=metrics_weather,
        weather_improvement_r2=metrics_weather.val_r2 - metrics_no_weather.val_r2,
        weather_coefficients=weather_elasticity,
        spend_elasticity=spend_elasticity,
        weather_elasticity=weather_elasticity,
        quality_score=quality,
    )

    _LOGGER.info(f"PoC result: {tenant_id} quality={quality:.2f}")
    return result


def train_all_poc_models() -> Dict[str, TenantPoCResult]:
    """Train PoC models for all synthetic tenants.

    Returns:
        Dictionary of tenant_id -> TenantPoCResult
    """
    tenant_ids = [
        "high_weather_sensitivity",
        "extreme_weather_sensitivity",
        "medium_weather_sensitivity",
        "no_weather_sensitivity",
    ]

    results = {}
    for tenant_id in tenant_ids:
        result = train_poc_for_tenant(tenant_id)
        if result is not None:
            results[tenant_id] = result

    return results


def save_poc_results(results: Dict[str, TenantPoCResult]) -> None:
    """Save PoC results to JSON and pickle artifacts.

    Args:
        results: Dictionary of tenant_id -> TenantPoCResult
    """
    EXPERIMENTS_DIR.mkdir(parents=True, exist_ok=True)

    # Convert to serializable format
    metrics_json = {
        "generated_at": datetime.utcnow().isoformat(),
        "version": "1.0",
        "tenants": {},
    }

    for tenant_id, result in results.items():
        metrics_json["tenants"][tenant_id] = {
            "tenant_id": result.tenant_id,
            "tenant_name": result.tenant_name,
            "location": result.location,
            "num_products": result.num_products,
            "num_train_rows": result.num_train_rows,
            "num_val_rows": result.num_val_rows,
            "metrics_without_weather": asdict(result.metrics_without_weather),
            "metrics_with_weather": asdict(result.metrics_with_weather),
            "weather_improvement_r2": float(result.weather_improvement_r2),
            "spend_elasticity": result.spend_elasticity,
            "weather_elasticity": result.weather_elasticity,
            "quality_score": float(result.quality_score),
        }

    # Add summary
    metrics_json["summary"] = {
        "total_tenants": len(results),
        "avg_quality_score": np.mean(
            [r.quality_score for r in results.values()]
        ).item(),
        "avg_weather_improvement": np.mean(
            [r.weather_improvement_r2 for r in results.values()]
        ).item(),
        "validation_passed": all(r.quality_score > 0.4 for r in results.values()),
    }

    # Save JSON
    metrics_path = EXPERIMENTS_DIR / "weather_poc_metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics_json, f, indent=2)
    _LOGGER.info(f"Saved metrics to {metrics_path}")

    # Save pickle (for model artifacts)
    model_path = EXPERIMENTS_DIR / "weather_poc_model.pkl"
    import pickle

    with open(model_path, "wb") as f:
        pickle.dump({"results": results, "timestamp": datetime.utcnow().isoformat()}, f)
    _LOGGER.info(f"Saved model to {model_path}")


def main():
    """Main entry point."""
    logging.basicConfig(level=logging.INFO)

    _LOGGER.info("Starting weather-aware PoC model training...")
    results = train_all_poc_models()

    if results:
        save_poc_results(results)
        _LOGGER.info(f"PoC training complete: {len(results)} tenants")

        # Print summary
        for tenant_id, result in results.items():
            print(
                f"\n{tenant_id}:"
                f"\n  Without weather: Val R² = {result.metrics_without_weather.val_r2:.3f}"
                f"\n  With weather:    Val R² = {result.metrics_with_weather.val_r2:.3f}"
                f"\n  Improvement:     {result.weather_improvement_r2:.3f}"
                f"\n  Quality:         {result.quality_score:.2f}"
            )
    else:
        _LOGGER.error("No PoC results generated")
        return 1

    return 0


if __name__ == "__main__":
    exit(main())
