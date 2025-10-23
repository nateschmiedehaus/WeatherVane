#!/usr/bin/env python3
"""Backtest generator for weather-aware vs control model comparison.

This module:
1. Loads synthetic tenant data
2. Trains control (non-weather) and weather-aware baseline models
3. Generates point forecasts and prediction intervals
4. Outputs structured JSON for backtest_evaluator.py consumption

The workflow is:
- Split data: train (80%) for model training, holdout (20%) for backtesting
- Train control baseline on non-weather features only
- Train weather-aware baseline on all features including weather
- Generate forecasts and confidence intervals on holdout set
- Aggregate results into backtest records
"""

from __future__ import annotations

import argparse
import json
import pickle
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import polars as pl
from loguru import logger

from apps.model.baseline import BaselineModel, fit_baseline_model, evaluate_r2


# Target column name (synchronized with feature_builder)
TARGET_COLUMN = "revenue_usd"

# Weather feature keywords for filtering
WEATHER_FEATURES = {
    "temperature_celsius",
    "precipitation_mm",
    "windspeed_kmh",
    "relative_humidity_percent",
}


@dataclass(frozen=True)
class BacktestConfig:
    """Configuration for backtest generation."""

    train_fraction: float = 0.8
    holdout_fraction: float = 0.2
    confidence_level: float = 0.9  # 80% prediction interval (p10-p90)
    output_root: Path = Path("experiments/weather/backtests")
    data_root: Path = Path("storage/seeds/synthetic")


@dataclass(frozen=True)
class TenantBacktestRecord:
    """Single backtest observation to be serialized to JSON."""

    timestamp: str
    actual: float
    weather_p50: float
    weather_p10: Optional[float]
    weather_p90: Optional[float]
    control_p50: float
    control_p10: Optional[float]
    control_p90: Optional[float]
    horizon_days: int = 1


def load_tenant_data(
    tenant_id: str, data_root: Path = Path("storage/seeds/synthetic")
) -> pl.DataFrame:
    """Load synthetic tenant data from parquet.

    Args:
        tenant_id: Tenant identifier (e.g., "high_weather_sensitivity")
        data_root: Root directory containing parquet files

    Returns:
        Polars DataFrame with daily aggregated metrics

    Raises:
        FileNotFoundError: If tenant data file not found
        ValueError: If data is empty or missing required columns
    """
    file_path = data_root / f"{tenant_id}.parquet"
    if not file_path.exists():
        raise FileNotFoundError(f"Tenant data not found: {file_path}")

    # Load and validate
    df = pl.read_parquet(file_path)
    if df.is_empty():
        raise ValueError(f"No data for tenant {tenant_id}")

    # Validate required columns before aggregation
    required = [TARGET_COLUMN, "temperature_celsius"]
    missing = [col for col in required if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Aggregate to daily level - only aggregate columns that exist
    agg_specs = [
        pl.col("revenue_usd").sum() if "revenue_usd" in df.columns else None,
        pl.col("units_sold").sum() if "units_sold" in df.columns else None,
        pl.col("meta_spend").sum() if "meta_spend" in df.columns else None,
        pl.col("google_spend").sum() if "google_spend" in df.columns else None,
        pl.col("email_sends").sum() if "email_sends" in df.columns else None,
        pl.col("email_opens").sum() if "email_opens" in df.columns else None,
        pl.col("email_clicks").sum() if "email_clicks" in df.columns else None,
        pl.col("temperature_celsius").first(),
        pl.col("precipitation_mm").first() if "precipitation_mm" in df.columns else None,
        pl.col("windspeed_kmh").first() if "windspeed_kmh" in df.columns else None,
        pl.col("relative_humidity_percent").first() if "relative_humidity_percent" in df.columns else None,
    ]
    agg_specs = [spec for spec in agg_specs if spec is not None]

    daily = df.group_by("date").agg(*agg_specs).sort("date")

    return daily


def _split_train_holdout(
    frame: pl.DataFrame, train_fraction: float = 0.8
) -> Tuple[pl.DataFrame, pl.DataFrame]:
    """Split data into train and holdout sets.

    Args:
        frame: Input dataframe
        train_fraction: Fraction of data for training (default 0.8)

    Returns:
        Tuple of (train_frame, holdout_frame)
    """
    n_rows = frame.height
    n_train = max(1, int(n_rows * train_fraction))
    n_train = min(n_train, n_rows - 1)  # Ensure at least 1 holdout sample

    train_frame = frame.head(n_train)
    holdout_frame = frame.tail(n_rows - n_train)

    logger.info(
        "Split data: train=%d rows, holdout=%d rows",
        train_frame.height,
        holdout_frame.height,
    )

    return train_frame, holdout_frame


def _get_control_features(all_features: List[str]) -> List[str]:
    """Extract non-weather features for control model.

    Args:
        all_features: All available numeric features

    Returns:
        List of feature names excluding weather columns
    """
    return [f for f in all_features if f not in WEATHER_FEATURES]


def _get_weather_features(all_features: List[str]) -> List[str]:
    """Extract weather features.

    Args:
        all_features: All available numeric features

    Returns:
        List of weather feature names
    """
    return [f for f in all_features if f in WEATHER_FEATURES]


def _candidate_features(frame: pl.DataFrame) -> List[str]:
    """Get all numeric feature columns.

    Args:
        frame: Input dataframe

    Returns:
        List of numeric column names (excluding target and dates)
    """
    exclude = {TARGET_COLUMN, "date"}
    candidates = []
    for col_name, dtype in frame.schema.items():
        if col_name not in exclude and dtype in {
            pl.Float64,
            pl.Float32,
            pl.Int64,
            pl.Int32,
        }:
            candidates.append(col_name)
    return candidates


def generate_prediction_intervals(
    predictions: np.ndarray,
    actuals: np.ndarray,
    confidence: float = 0.9,
) -> Tuple[np.ndarray, np.ndarray]:
    """Generate prediction intervals using residual-based bootstrap.

    Args:
        predictions: Model predictions
        actuals: Actual target values
        confidence: Confidence level (e.g., 0.9 for 90% CI)

    Returns:
        Tuple of (lower_bound, upper_bound) arrays
    """
    residuals = actuals - predictions
    z_score = np.abs(np.percentile(np.abs(residuals), confidence * 100))

    lower = predictions - z_score
    upper = predictions + z_score

    return lower, upper


def generate_tenant_backtest(
    tenant_id: str,
    *,
    config: BacktestConfig = BacktestConfig(),
) -> List[TenantBacktestRecord]:
    """Generate backtest records for a single tenant.

    Workflow:
    1. Load tenant data
    2. Split train/holdout
    3. Train control (non-weather) baseline
    4. Train weather-aware baseline
    5. Generate predictions and intervals on holdout
    6. Return structured records

    Args:
        tenant_id: Tenant identifier
        config: Backtest configuration

    Returns:
        List of TenantBacktestRecord objects

    Raises:
        FileNotFoundError: If tenant data not found
        ValueError: If data validation fails
    """
    logger.info("Starting backtest generation for tenant=%s", tenant_id)

    # Load and prepare data
    daily = load_tenant_data(tenant_id, config.data_root)
    train_frame, holdout_frame = _split_train_holdout(daily, config.train_fraction)

    if holdout_frame.is_empty():
        raise ValueError(f"No holdout data for tenant {tenant_id}")

    # Get feature candidates
    all_features = _candidate_features(train_frame)
    control_features = _get_control_features(all_features)
    weather_features = _get_weather_features(all_features)

    logger.info(
        "Features: all=%d control=%d weather=%d",
        len(all_features),
        len(control_features),
        len(weather_features),
    )

    # Train models
    logger.info("Training control (non-weather) baseline...")
    control_model = fit_baseline_model(
        train_frame, target=TARGET_COLUMN, features=control_features
    )

    logger.info("Training weather-aware baseline...")
    weather_model = fit_baseline_model(
        train_frame, target=TARGET_COLUMN, features=all_features
    )

    # Generate predictions on holdout
    control_preds = control_model.predict(holdout_frame).to_numpy()
    weather_preds = weather_model.predict(holdout_frame).to_numpy()
    actuals = holdout_frame[TARGET_COLUMN].to_numpy()

    # Generate prediction intervals
    control_lower, control_upper = generate_prediction_intervals(
        control_preds, actuals, config.confidence_level
    )
    weather_lower, weather_upper = generate_prediction_intervals(
        weather_preds, actuals, config.confidence_level
    )

    # Build backtest records
    dates = holdout_frame["date"].to_list()
    records: List[TenantBacktestRecord] = []

    for i in range(len(actuals)):
        record = TenantBacktestRecord(
            timestamp=str(dates[i]),
            actual=float(actuals[i]),
            weather_p50=float(weather_preds[i]),
            weather_p10=float(weather_lower[i]),
            weather_p90=float(weather_upper[i]),
            control_p50=float(control_preds[i]),
            control_p10=float(control_lower[i]),
            control_p90=float(control_upper[i]),
            horizon_days=1,
        )
        records.append(record)

    logger.info(
        "Generated %d backtest records for tenant=%s",
        len(records),
        tenant_id,
    )

    return records


def save_backtest_records(
    tenant_id: str,
    records: List[TenantBacktestRecord],
    output_root: Path = Path("experiments/weather/backtests"),
) -> Path:
    """Save backtest records to JSON file.

    Args:
        tenant_id: Tenant identifier
        records: List of backtest records
        output_root: Root directory for output

    Returns:
        Path to written file
    """
    output_root.mkdir(parents=True, exist_ok=True)

    # Prepare JSON payload
    payload = {
        "tenant_id": tenant_id,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "record_count": len(records),
        "records": [
            {
                "timestamp": r.timestamp,
                "actual": r.actual,
                "weather": {
                    "p50": r.weather_p50,
                    "p10": r.weather_p10,
                    "p90": r.weather_p90,
                },
                "control": {
                    "p50": r.control_p50,
                    "p10": r.control_p10,
                    "p90": r.control_p90,
                },
                "horizon_days": r.horizon_days,
            }
            for r in records
        ],
    }

    output_path = output_root / f"{tenant_id}.json"
    output_path.write_text(json.dumps(payload, indent=2))

    logger.info("Saved backtest records to %s", output_path)
    return output_path


def generate_all_tenant_backtests(
    tenant_ids: Sequence[str],
    *,
    config: BacktestConfig = BacktestConfig(),
) -> Dict[str, Path]:
    """Generate backtests for multiple tenants.

    Args:
        tenant_ids: List of tenant identifiers
        config: Backtest configuration

    Returns:
        Mapping of tenant_id -> output file path
    """
    results = {}

    for tenant_id in tenant_ids:
        try:
            records = generate_tenant_backtest(tenant_id, config=config)
            output_path = save_backtest_records(tenant_id, records, config.output_root)
            results[tenant_id] = output_path
        except Exception as exc:
            logger.error("Failed to generate backtest for tenant=%s: %s", tenant_id, exc)

    return results


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate weather backtest datasets for top tenants"
    )
    parser.add_argument(
        "tenants",
        nargs="*",
        default=[
            "high_weather_sensitivity",
            "extreme_weather_sensitivity",
            "medium_weather_sensitivity",
            "no_weather_sensitivity",
        ],
        help="Tenant IDs to backtest (defaults to all synthetic tenants)",
    )
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("experiments/weather/backtests"),
        help="Output directory for backtest JSON files",
    )
    parser.add_argument(
        "--data-root",
        type=Path,
        default=Path("storage/seeds/synthetic"),
        help="Input directory containing tenant parquet files",
    )
    parser.add_argument(
        "--train-fraction",
        type=float,
        default=0.8,
        help="Fraction of data for training (0.0-1.0)",
    )
    parser.add_argument(
        "--confidence-level",
        type=float,
        default=0.9,
        help="Confidence level for prediction intervals (0.0-1.0)",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    """Main entry point."""
    args = _parse_args(argv)

    config = BacktestConfig(
        train_fraction=args.train_fraction,
        confidence_level=args.confidence_level,
        output_root=args.output_root,
        data_root=args.data_root,
    )

    logger.info("Starting backtest generation with config: %s", config)

    try:
        results = generate_all_tenant_backtests(args.tenants, config=config)
        logger.info("Successfully generated %d backtest datasets", len(results))

        for tenant_id, path in results.items():
            logger.info("  %s -> %s", tenant_id, path)

        return 0
    except Exception as exc:
        logger.error("Backtest generation failed: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
