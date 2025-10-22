"""Train weather-aware PoC models on synthetic tenant data.

This module trains ridge regression models with engineered weather features
for each synthetic tenant. We compare performance with and without weather
signals to confirm that the synthetic data encodes the expected elasticities.
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import polars as pl
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import StandardScaler

_LOGGER = logging.getLogger(__name__)

SYNTHETIC_DATA_DIR = Path("storage/seeds/synthetic")
EXPERIMENTS_DIR = Path("experiments/mcp")

MIN_TRAIN_ROWS = 45
MIN_VAL_ROWS = 20
VALIDATION_DAYS = 30

SPEND_BASE_COLS = ["meta_spend", "google_spend"]
WEATHER_BASE_COLS = [
    "temperature_celsius",
    "precipitation_mm",
    "relative_humidity_percent",
    "windspeed_kmh",
]
TARGET_COL = "revenue_usd"
LOCATION_COL = "location_x"

LAG_CONFIG: Dict[str, Sequence[int]] = {
    # REDUCED: Only 1-day lags for small PoC (prevents overfitting on 53 training rows)
    "meta_spend": [1],
    "google_spend": [1],
    "total_spend": [1],
    "temperature_celsius": [1],
    "precipitation_mm": [1],
}

ROLLING_MEAN_CONFIG: Dict[str, Sequence[int]] = {
    # REDUCED: Only 3-day rolling average (simpler patterns for small data)
    "meta_spend": [3],
    "google_spend": [3],
    "total_spend": [3],
    "temperature_celsius": [3],
    "precipitation_mm": [3],
}

INTERACTION_PAIRS: Sequence[Tuple[str, str]] = (
    # REDUCED: Only key interactions to preserve signal
    ("meta_spend", "temperature_celsius"),
    ("google_spend", "precipitation_mm"),
)

QUADRATIC_WEATHER: Sequence[str] = (
    # REDUCED: Only temperature quadratic
    "temperature_celsius",
)


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


def _combine_features(*feature_lists: Sequence[str]) -> List[str]:
    combined: List[str] = []
    seen = set()
    for feature_list in feature_lists:
        for feature in feature_list:
            if feature in seen:
                continue
            combined.append(feature)
            seen.add(feature)
    return combined


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
    """Aggregate product-level records into daily totals."""
    if df.schema.get("date") == pl.Utf8:
        df = df.with_columns(pl.col("date").str.strptime(pl.Date, strict=False))

    aggregated = (
        df.group_by("date", maintain_order=True)
        .agg(
            [
                pl.col(TARGET_COL).sum().alias(TARGET_COL),
                pl.col("meta_spend").sum().alias("meta_spend"),
                pl.col("google_spend").sum().alias("google_spend"),
                pl.col("units_sold").sum().alias("units_sold"),
                pl.col("temperature_celsius").mean().alias("temperature_celsius"),
                pl.col("precipitation_mm").mean().alias("precipitation_mm"),
                pl.col("relative_humidity_percent")
                .mean()
                .alias("relative_humidity_percent"),
                pl.col("windspeed_kmh").mean().alias("windspeed_kmh"),
            ]
        )
        .sort("date")
    )
    return aggregated


def _engineer_features(daily_df: pl.DataFrame) -> Tuple[pl.DataFrame, Dict[str, List[str]]]:
    """Engineer lag, rolling, and interaction features for modeling."""
    df = daily_df.with_row_count("day_index").with_columns(
        [
            (pl.col("meta_spend") + pl.col("google_spend")).alias("total_spend"),
            (pl.col("meta_spend") - pl.col("google_spend")).alias("spend_balance"),
            pl.col("day_index").cast(pl.Float64),
        ]
    )

    period = max(1, daily_df.height)
    angle = pl.col("day_index") * (2 * np.pi / float(period))
    df = df.with_columns(
        [
            angle.sin().alias("sin_day_of_period"),
            angle.cos().alias("cos_day_of_period"),
        ]
    )

    time_features = ["sin_day_of_period", "cos_day_of_period", "day_index"]
    spend_features = ["meta_spend", "google_spend", "total_spend", "spend_balance"]
    weather_features = list(WEATHER_BASE_COLS)

    lag_expressions: List[pl.Expr] = []
    rolling_expressions: List[pl.Expr] = []
    interaction_expressions: List[pl.Expr] = []
    quadratic_expressions: List[pl.Expr] = []

    for column, lags in LAG_CONFIG.items():
        for lag in lags:
            feature_name = f"{column}_lag_{lag}"
            lag_expressions.append(pl.col(column).shift(lag).alias(feature_name))
            if column in {"meta_spend", "google_spend", "total_spend", "spend_balance"}:
                spend_features.append(feature_name)
            else:
                weather_features.append(feature_name)

    for column, windows in ROLLING_MEAN_CONFIG.items():
        for window in windows:
            feature_name = f"{column}_rolling_avg_{window}"
            rolling_expressions.append(
                pl.col(column).rolling_mean(window_size=window).shift(1).alias(feature_name)
            )
            if column in {"meta_spend", "google_spend", "total_spend", "spend_balance"}:
                spend_features.append(feature_name)
            else:
                weather_features.append(feature_name)

    for column in QUADRATIC_WEATHER:
        feature_name = f"{column}_squared"
        quadratic_expressions.append((pl.col(column) ** 2).alias(feature_name))
        weather_features.append(feature_name)

    for left, right in INTERACTION_PAIRS:
        feature_name = f"{left}_x_{right}"
        interaction_expressions.append((pl.col(left) * pl.col(right)).alias(feature_name))
        weather_features.append(feature_name)

    df = df.with_columns(lag_expressions + rolling_expressions + quadratic_expressions + interaction_expressions)

    feature_columns = _combine_features(time_features, spend_features, weather_features)
    feature_df = df.drop_nulls(subset=[TARGET_COL] + feature_columns)
    feature_groups = {
        "time": time_features,
        "spend": spend_features,
        "weather": weather_features,
    }
    return feature_df, feature_groups


def _split_train_validation(df: pl.DataFrame) -> Tuple[pl.DataFrame, pl.DataFrame]:
    """Split engineered features into train and validation segments."""
    total_rows = df.height
    if total_rows <= MIN_TRAIN_ROWS + MIN_VAL_ROWS:
        raise ValueError(
            f"Insufficient rows after feature engineering: {total_rows} (min required "
            f"{MIN_TRAIN_ROWS + MIN_VAL_ROWS})"
        )

    max_val_size = min(VALIDATION_DAYS, total_rows - MIN_TRAIN_ROWS)
    val_size = max(MIN_VAL_ROWS, max_val_size)
    train_size = total_rows - val_size
    if train_size < MIN_TRAIN_ROWS:
        raise ValueError("Not enough rows to satisfy training minimum after split")

    train_df = df.slice(0, train_size)
    val_df = df.tail(val_size)
    return train_df, val_df


def _prepare_features(df: pl.DataFrame, feature_names: Sequence[str]) -> Tuple[np.ndarray, np.ndarray]:
    """Extract numpy matrices for modeling."""
    X = df.select(list(feature_names)).to_numpy()
    y = df.select(TARGET_COL).to_numpy().ravel()
    return X, y


def _train_and_evaluate(
    X_train: np.ndarray,
    y_train: np.ndarray,
    X_val: np.ndarray,
    y_val: np.ndarray,
    feature_names: Sequence[str],
) -> Tuple[RidgeCV, ModelMetrics, StandardScaler, np.ndarray, np.ndarray]:
    """Train RidgeCV model and evaluate on train/validation splits."""
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)

    cv_folds = max(2, min(5, len(X_train_scaled)))
    model = RidgeCV(alphas=np.logspace(-2, 2, num=9), cv=cv_folds)
    model.fit(X_train_scaled, y_train)

    y_train_pred = model.predict(X_train_scaled)
    y_val_pred = model.predict(X_val_scaled)

    train_r2 = r2_score(y_train, y_train_pred)
    train_rmse = float(np.sqrt(mean_squared_error(y_train, y_train_pred)))
    train_mae = float(mean_absolute_error(y_train, y_train_pred))

    val_r2 = r2_score(y_val, y_val_pred)
    val_rmse = float(np.sqrt(mean_squared_error(y_val, y_val_pred)))
    val_mae = float(mean_absolute_error(y_val, y_val_pred))

    feature_importance: Dict[str, float] = {}
    for idx, name in enumerate(feature_names):
        scale = float(scaler.scale_[idx]) if scaler.scale_[idx] != 0 else 1.0
        feature_importance[name] = float(model.coef_[idx] / scale)

    metrics = ModelMetrics(
        train_r2=float(train_r2),
        train_rmse=train_rmse,
        train_mae=train_mae,
        val_r2=float(val_r2),
        val_rmse=val_rmse,
        val_mae=val_mae,
        feature_importance=feature_importance,
    )
    return model, metrics, scaler, X_train_scaled, X_val_scaled


def _compute_elasticity(
    model: RidgeCV,
    scaler: StandardScaler,
    feature_names: Sequence[str],
    y_train: np.ndarray,
) -> Dict[str, float]:
    """Compute elasticity estimates in original feature space."""
    if y_train.size == 0:
        return {name: 0.0 for name in feature_names}

    target_mean = float(np.mean(y_train))
    if target_mean == 0:
        return {name: 0.0 for name in feature_names}

    elasticity: Dict[str, float] = {}
    for idx, name in enumerate(feature_names):
        scale = float(scaler.scale_[idx]) if scaler.scale_[idx] != 0 else None
        feature_mean = float(scaler.mean_[idx])
        if scale is None or scale == 0:
            elasticity[name] = 0.0
            continue
        coef_original = float(model.coef_[idx] / scale)
        elasticity[name] = coef_original * feature_mean / target_mean
    return elasticity


def _assess_quality(
    metrics_without: ModelMetrics,
    metrics_with: ModelMetrics,
    tenant_id: str,
    expected_improvement: float,
) -> float:
    """Assess overall model quality and weather signal detection."""
    improvement = metrics_with.val_r2 - metrics_without.val_r2
    if expected_improvement <= 0:
        expected_improvement = 0.01
    improvement_ratio = max(0.0, min(1.0, improvement / expected_improvement))

    val_r2_quality = max(0.0, min(1.0, metrics_with.val_r2 / 0.7))
    train_val_gap = metrics_with.train_r2 - metrics_with.val_r2
    generalization = 1.0 - max(0.0, train_val_gap) / max(0.3, abs(metrics_with.train_r2) + 1e-6)
    generalization = max(0.0, min(1.0, generalization))

    score = 0.4 * improvement_ratio + 0.3 * val_r2_quality + 0.3 * generalization
    _LOGGER.debug(
        "Quality assessment for %s | improvement=%.3f ratio=%.3f val_r2=%.3f generalization=%.3f score=%.3f",
        tenant_id,
        improvement,
        improvement_ratio,
        metrics_with.val_r2,
        generalization,
        score,
    )
    return float(score)


def train_poc_for_tenant(tenant_id: str) -> Optional[TenantPoCResult]:
    """Train PoC models for a single tenant."""
    df = load_synthetic_tenant(tenant_id)
    if df is None or df.is_empty():
        return None

    tenant_name = df.select("tenant_name").item(0, 0)
    location = df.select(LOCATION_COL).item(0, 0)
    num_products = df.select("product_id").n_unique()

    daily_df = _aggregate_by_date(df)
    features_df, feature_groups = _engineer_features(daily_df)

    try:
        train_df, val_df = _split_train_validation(features_df)
    except ValueError as exc:
        _LOGGER.error("Unable to split train/validation for %s: %s", tenant_id, exc)
        return None

    time_features = feature_groups["time"]
    spend_features = feature_groups["spend"]
    weather_features = feature_groups["weather"]

    without_weather_features = _combine_features(time_features, spend_features)
    with_weather_features = _combine_features(time_features, spend_features, weather_features)

    X_train_no_weather, y_train_no_weather = _prepare_features(train_df, without_weather_features)
    X_val_no_weather, y_val_no_weather = _prepare_features(val_df, without_weather_features)

    (
        model_no_weather,
        metrics_no_weather,
        scaler_no_weather,
        _,
        _,
    ) = _train_and_evaluate(
        X_train_no_weather,
        y_train_no_weather,
        X_val_no_weather,
        y_val_no_weather,
        without_weather_features,
    )

    X_train_weather, y_train_weather = _prepare_features(train_df, with_weather_features)
    X_val_weather, y_val_weather = _prepare_features(val_df, with_weather_features)

    (
        model_weather,
        metrics_weather,
        scaler_weather,
        _,
        _,
    ) = _train_and_evaluate(
        X_train_weather,
        y_train_weather,
        X_val_weather,
        y_val_weather,
        with_weather_features,
    )

    elasticity = _compute_elasticity(
        model_weather,
        scaler_weather,
        with_weather_features,
        y_train_weather,
    )

    weather_elasticity = {
        name: float(elasticity.get(name, 0.0)) for name in weather_features if name in elasticity
    }
    spend_elasticity = {
        name: float(elasticity.get(name, 0.0)) for name in spend_features if name in elasticity
    }

    weather_improvement = metrics_weather.val_r2 - metrics_no_weather.val_r2

    if "extreme" in tenant_id.lower():
        expected_improvement = 0.25
    elif "high" in tenant_id.lower():
        expected_improvement = 0.15
    elif "medium" in tenant_id.lower():
        expected_improvement = 0.08
    else:
        expected_improvement = 0.02

    quality = _assess_quality(metrics_no_weather, metrics_weather, tenant_id, expected_improvement)

    weather_coefficients = {
        name: metrics_weather.feature_importance.get(name, 0.0) for name in weather_features
    }

    result = TenantPoCResult(
        tenant_id=tenant_id,
        tenant_name=tenant_name,
        location=location,
        num_products=int(num_products),
        num_train_rows=train_df.height,
        num_val_rows=val_df.height,
        metrics_without_weather=metrics_no_weather,
        metrics_with_weather=metrics_weather,
        weather_improvement_r2=float(weather_improvement),
        weather_coefficients=weather_coefficients,
        spend_elasticity=spend_elasticity,
        weather_elasticity=weather_elasticity,
        quality_score=quality,
    )

    _LOGGER.info(
        "PoC result %s | train=%d val=%d | val_r2(no_weather)=%.3f val_r2(weather)=%.3f "
        "improvement=%.3f quality=%.2f",
        tenant_id,
        train_df.height,
        val_df.height,
        metrics_no_weather.val_r2,
        metrics_weather.val_r2,
        weather_improvement,
        quality,
    )
    return result


def train_all_poc_models() -> Dict[str, TenantPoCResult]:
    """Train PoC models for all synthetic tenants."""
    tenant_ids = [
        "high_weather_sensitivity",
        "extreme_weather_sensitivity",
        "medium_weather_sensitivity",
        "no_weather_sensitivity",
    ]

    results: Dict[str, TenantPoCResult] = {}
    for tenant_id in tenant_ids:
        result = train_poc_for_tenant(tenant_id)
        if result is not None:
            results[tenant_id] = result
    return results


def save_poc_results(results: Dict[str, TenantPoCResult]) -> None:
    """Save PoC results to JSON and pickle artifacts."""
    EXPERIMENTS_DIR.mkdir(parents=True, exist_ok=True)

    metrics_json: Dict[str, Any] = {
        "generated_at": datetime.utcnow().isoformat(),
        "version": "2.0",
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

    quality_scores = [r.quality_score for r in results.values()]
    improvements = [r.weather_improvement_r2 for r in results.values()]
    metrics_json["summary"] = {
        "total_tenants": len(results),
        "avg_quality_score": float(np.mean(quality_scores)) if quality_scores else 0.0,
        "avg_weather_improvement": float(np.mean(improvements)) if improvements else 0.0,
        "validation_passed": all(r.quality_score > 0.4 for r in results.values()),
    }

    metrics_path = EXPERIMENTS_DIR / "weather_poc_metrics.json"
    with metrics_path.open("w") as outfile:
        json.dump(metrics_json, outfile, indent=2)
    _LOGGER.info("Saved metrics to %s", metrics_path)

    model_path = EXPERIMENTS_DIR / "weather_poc_model.pkl"
    import pickle

    with model_path.open("wb") as outfile:
        pickle.dump({"results": results, "timestamp": datetime.utcnow().isoformat()}, outfile)
    _LOGGER.info("Saved model artifacts to %s", model_path)


def main() -> int:
    """Main entry point."""
    logging.basicConfig(level=logging.INFO)

    _LOGGER.info("Starting weather-aware PoC model training...")
    results = train_all_poc_models()
    if not results:
        _LOGGER.error("No PoC results generated")
        return 1

    save_poc_results(results)
    _LOGGER.info("PoC training complete for %d tenants", len(results))

    for tenant_id, result in results.items():
        print(
            f"\n{tenant_id}:"
            f"\n  Without weather: Val R² = {result.metrics_without_weather.val_r2:.3f}"
            f"\n  With weather:    Val R² = {result.metrics_with_weather.val_r2:.3f}"
            f"\n  Improvement:     {result.weather_improvement_r2:.3f}"
            f"\n  Quality:         {result.quality_score:.2f}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
