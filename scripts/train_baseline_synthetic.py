#!/usr/bin/env python3
"""Train baseline weather-aware models on synthetic tenant data."""
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

import polars as pl

from apps.model.train import train_baseline

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
_LOGGER = logging.getLogger(__name__)

# Synthetic tenant sensitivity profiles
TENANTS = [
    "high_weather_sensitivity",
    "no_weather_sensitivity",
    "medium_weather_sensitivity",
    "extreme_weather_sensitivity",
]

def debug_frame(frame: pl.DataFrame, name: str):
    """Print debug info about a frame."""
    _LOGGER.info(f"\nDEBUG {name}:")
    _LOGGER.info(f"Shape: {frame.shape}")
    _LOGGER.info(f"Columns: {frame.columns}")
    if frame.height > 0:
        _LOGGER.info("Schema:")
        for col, dtype in frame.schema.items():
            _LOGGER.info(f"  {col}: {dtype}")
        _LOGGER.info("\nFirst row:")
        _LOGGER.info(frame.head(1))

def preprocess_raw_data(raw_path: Path, tenant_id: str, output_dir: Path):
    """Convert raw parquet data into the expected lake format."""
    # Load raw data
    df = pl.read_parquet(raw_path / f"{tenant_id}.parquet")
    df = df.with_columns(pl.col("date").str.strptime(pl.Date, strict=False))

    # Create daily orders table with scope
    orders = (
        df.select([
            pl.col("date").cast(pl.Utf8),
            "product_id",
            (pl.col("revenue_usd") - pl.col("cogs_usd")).alias("net_revenue"),
            pl.lit("GLOBAL").alias("geo_scope"),
            pl.lit("global").alias("geo_level"),
            pl.lit(tenant_id).alias("tenant_id"),
        ])
        .group_by(["date", "tenant_id", "geo_scope", "geo_level"])
        .agg([
            pl.col("net_revenue").sum().alias("net_revenue")
        ])
        .with_columns([
            pl.col("net_revenue").fill_null(0.0),
            pl.col("date").alias("created_at"),
            pl.lit(None).cast(pl.Utf8).alias("geohash"),
            pl.lit(None).cast(pl.Utf8).alias("state_abbr"),
            pl.lit(None).cast(pl.Utf8).alias("dma_code"),
            pl.lit(None).cast(pl.Utf8).alias("dma_name"),
        ])
        .sort("date")
    )
    debug_frame(orders, "orders")

    # Create daily ads table
    ads = (
        df.select([
            pl.col("date").cast(pl.Utf8),
            "meta_spend",
            "email_purchases",
        ])
        .group_by("date")
        .agg([
            pl.col("meta_spend").sum().alias("spend"),
            pl.col("email_purchases").sum().alias("conversions"),
        ])
        .with_columns([
            pl.col("spend").fill_null(0.0),
            pl.col("conversions").fill_null(0),
        ])
    )
    debug_frame(ads, "ads")

    # Create daily weather table with required features
    weather = (
        df.select([
            pl.col("date").cast(pl.Utf8),
            "temperature_celsius",
            "precipitation_mm",
        ])
        .unique(subset="date", maintain_order=True)
        .sort("date")
        .with_columns([
            pl.lit("GLOBAL").alias("geo_scope"),
            pl.lit("global").alias("geo_level"),
            pl.col("temperature_celsius").alias("temp_c"),
            pl.col("precipitation_mm").alias("precip_mm"),
            pl.col("temperature_celsius").rolling_mean(7, min_samples=3).alias("temp_roll7"),
            pl.col("precipitation_mm").rolling_mean(7, min_samples=3).alias("precip_roll7"),
            # Use simple 7-day differences as anomalies for synthetic data
            (pl.col("temperature_celsius") - pl.col("temperature_celsius").rolling_mean(7, min_samples=3)).alias("temp_anomaly"),
            (pl.col("precipitation_mm") - pl.col("precipitation_mm").rolling_mean(7, min_samples=3)).alias("precip_anomaly"),
        ])
        .select([
            "date",
            "geo_scope",
            "geo_level",
            "temp_c",
            "precip_mm",
            "temp_roll7",
            "precip_roll7",
            "temp_anomaly",
            "precip_anomaly",
        ])
        .with_columns([
            pl.all().exclude(["date", "geo_scope", "geo_level"]).fill_null(0.0)
        ])
    )
    debug_frame(weather, "weather")

    # Create output directories and save
    lake_dir = output_dir / tenant_id
    lake_dir.mkdir(parents=True, exist_ok=True)

    orders.write_parquet(lake_dir / f"{tenant_id}_shopify_orders.parquet")
    ads.write_parquet(lake_dir / f"{tenant_id}_meta_ads.parquet")  # Use the same for both Meta and Google
    ads.write_parquet(lake_dir / f"{tenant_id}_google_ads.parquet")
    weather.write_parquet(lake_dir / f"{tenant_id}_weather_daily.parquet")
    # Empty promos for now
    pl.DataFrame({
        "date": weather["date"],
        "promos_sent": pl.Series(None, dtype=pl.Int64).extend_constant(0, weather.height),
    }).write_parquet(lake_dir / f"{tenant_id}_promos.parquet")

    return {
        "dates": orders["date"].n_unique(),
        "order_rows": orders.height,
        "total_revenue": orders["net_revenue"].sum(),
    }

def train_all_tenants():
    """Train baseline models for all synthetic tenants."""
    raw_path = Path("storage/seeds/synthetic")
    lake_path = Path("storage/lake/synthetic")
    output_root = Path("storage/models/synthetic_baseline")

    results = {}
    start = datetime(2024, 1, 1)
    end = datetime(2024, 6, 30)  # 180 days

    for tenant_id in TENANTS:
        _LOGGER.info(f"\nPreprocessing data for {tenant_id}...")
        stats = preprocess_raw_data(raw_path, tenant_id, lake_path)
        _LOGGER.info(f"✓ Processed {stats['order_rows']} rows spanning {stats['dates']} dates")
        _LOGGER.info(f"✓ Total revenue: ${stats['total_revenue']:,.2f}")

        _LOGGER.info(f"\nTraining model for {tenant_id}...")
        result = train_baseline(
            tenant_id=tenant_id,
            start=start,
            end=end,
            lake_root=lake_path,
            output_root=output_root,
            run_id="poc_baseline",
            feature_min_rows=14,
            skip_data_quality_check=True  # Skip for synthetic data
        )

        results[tenant_id] = {
            "weather_fit": result.metadata["weather_fit"],
            "features": result.metadata["features"],
            "top_features": result.metadata["top_features"],
            "training": result.metadata["training"],
            "holdout": result.metadata["holdout"],
            "model_path": str(result.model_path),
            "data_stats": stats,
        }
        _LOGGER.info(f"✓ Model trained: R² = {result.metadata['training']['r2']:.3f}")
        _LOGGER.info(f"✓ Weather correlation: {result.metadata['weather_fit']['classification']}")

    # Save results summary
    output_file = Path("state/analytics/mmm_baseline_results.json")
    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(results, indent=2))
    _LOGGER.info(f"\n✓ Results saved to {output_file}")

    # Validate correlations
    _LOGGER.info("\nWeather sensitivity validation:")
    _LOGGER.info("-" * 40)
    for tenant_id, result in results.items():
        weather_fit = result["weather_fit"]
        _LOGGER.info(
            f"{tenant_id:25} {weather_fit['classification']:>10} "
            f"(score: {weather_fit['score']:.3f})"
        )

if __name__ == "__main__":
    train_all_tenants()