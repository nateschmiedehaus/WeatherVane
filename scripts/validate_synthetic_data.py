#!/usr/bin/env python
"""Validate synthetic datasets against weather elasticity analysis.

This script:
1. Loads generated synthetic data
2. Runs weather elasticity estimation
3. Compares estimated elasticity with ground truth
4. Generates validation report

Usage:
    python scripts/validate_synthetic_data.py --tenant demo_tenant_1
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path

import polars as pl
import numpy as np

from apps.model.weather_elasticity_analysis import estimate_weather_elasticity
from shared.feature_store.feature_builder import FeatureBuilder

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
_LOGGER = logging.getLogger(__name__)


def load_synthetic_metadata(tenant_dir: Path) -> dict:
    """Load metadata from synthetic dataset.

    Args:
        tenant_dir: Tenant directory containing metadata JSON

    Returns:
        Metadata dictionary
    """
    metadata_files = list(tenant_dir.glob("metadata_*.json"))
    if not metadata_files:
        raise FileNotFoundError(f"No metadata found in {tenant_dir}")

    # Use the most recent metadata file
    metadata_file = sorted(metadata_files)[-1]
    return json.loads(metadata_file.read_text())


def load_synthetic_data(tenant_dir: Path) -> tuple:
    """Load all synthetic data tables for a tenant.

    Args:
        tenant_dir: Tenant directory

    Returns:
        Tuple of (orders, weather, meta_ads, google_ads, klaviyo)
    """
    parquet_files = {f.stem.split("_")[0]: f for f in tenant_dir.glob("*_*.parquet")}

    orders = pl.read_parquet(parquet_files["shopify"])
    weather = pl.read_parquet(parquet_files["weather"])
    meta_ads = pl.read_parquet(parquet_files["meta"])
    google_ads = pl.read_parquet(parquet_files["google"])
    klaviyo = pl.read_parquet(parquet_files["klaviyo"])

    return orders, weather, meta_ads, google_ads, klaviyo


def prepare_elasticity_matrix(
    orders: pl.DataFrame,
    weather: pl.DataFrame,
    meta_ads: pl.DataFrame,
    google_ads: pl.DataFrame,
) -> pl.DataFrame:
    """Prepare feature matrix for elasticity estimation.

    Args:
        orders: Shopify orders
        weather: Weather data
        meta_ads: Meta Ads spend
        google_ads: Google Ads spend

    Returns:
        Feature matrix for elasticity analysis
    """
    # Aggregate orders to daily revenue
    daily_orders = (
        orders.with_columns(pl.col("date").cast(pl.Date))
        .group_by("date")
        .agg(
            pl.col("net_revenue").sum().alias("net_revenue"),
            pl.col("quantity").sum().alias("order_quantity"),
        )
        .sort("date")
    )

    # Aggregate ads to daily spend
    daily_meta = (
        meta_ads.with_columns(pl.col("date").cast(pl.Date))
        .group_by("date")
        .agg(pl.col("spend").sum().alias("meta_spend"))
        .sort("date")
    )

    daily_google = (
        google_ads.with_columns(pl.col("date").cast(pl.Date))
        .group_by("date")
        .agg(pl.col("spend").sum().alias("google_spend"))
        .sort("date")
    )

    # Join all
    matrix = (
        daily_orders.join(weather, on="date", how="left")
        .join(daily_meta, on="date", how="left")
        .join(daily_google, on="date", how="left")
        .sort("date")
    )

    return matrix


def validate_tenant(
    tenant_id: str,
    lake_root: Path = Path("storage/lake/raw"),
) -> dict:
    """Validate synthetic dataset for a single tenant.

    Args:
        tenant_id: Tenant identifier
        lake_root: Data lake root directory

    Returns:
        Validation report dictionary
    """
    tenant_dir = lake_root / tenant_id

    if not tenant_dir.exists():
        raise FileNotFoundError(f"Tenant directory not found: {tenant_dir}")

    _LOGGER.info(f"Loading synthetic data for {tenant_id}...")
    metadata = load_synthetic_metadata(tenant_dir)
    orders, weather, meta_ads, google_ads, klaviyo = load_synthetic_data(tenant_dir)

    _LOGGER.info(f"Preparing elasticity matrix...")
    matrix = prepare_elasticity_matrix(orders, weather, meta_ads, google_ads)

    # Ensure we have required columns
    spend_cols = ["meta_spend", "google_spend"]
    weather_cols = ["temp_c", "precip_mm", "temp_anomaly", "precip_anomaly"]
    revenue_col = "net_revenue"

    # Handle null values
    matrix = matrix.drop_nulls(subset=spend_cols + weather_cols + [revenue_col])

    if matrix.is_empty():
        _LOGGER.error("No valid data after dropping nulls")
        return {
            "tenant_id": tenant_id,
            "status": "failed",
            "error": "No valid data",
        }

    _LOGGER.info(f"Running elasticity estimation...")
    report = estimate_weather_elasticity(
        frame=matrix,
        spend_cols=spend_cols,
        weather_cols=weather_cols,
        revenue_col=revenue_col,
        tenant_id=tenant_id,
    )

    # Compare with ground truth
    ground_truth = metadata["elasticity_ground_truth"]
    estimated_temp = report.temperature_elasticity
    estimated_precip = report.precipitation_elasticity
    truth_temp = ground_truth["temperature_elasticity"]
    truth_precip = ground_truth["precipitation_elasticity"]

    # Compute errors
    temp_error = abs(estimated_temp - truth_temp)
    precip_error = abs(estimated_precip - truth_precip)
    temp_error_pct = (
        100 * temp_error / max(abs(truth_temp), 0.01)
        if abs(truth_temp) > 0
        else 0
    )
    precip_error_pct = (
        100 * precip_error / max(abs(truth_precip), 0.01)
        if abs(truth_precip) > 0
        else 0
    )

    validation_result = {
        "tenant_id": tenant_id,
        "status": "success",
        "num_days": metadata["num_days"],
        "num_observations": matrix.height,
        "ground_truth": {
            "temperature_elasticity": truth_temp,
            "precipitation_elasticity": truth_precip,
            "mean_elasticity": ground_truth["mean_elasticity"],
        },
        "estimated": {
            "temperature_elasticity": float(estimated_temp),
            "precipitation_elasticity": float(estimated_precip),
            "mean_elasticity": float(
                np.mean([abs(estimated_temp), abs(estimated_precip)])
            ),
            "r_squared": float(report.r_squared),
        },
        "errors": {
            "temperature_elasticity_abs": float(temp_error),
            "temperature_elasticity_pct": float(temp_error_pct),
            "precipitation_elasticity_abs": float(precip_error),
            "precipitation_elasticity_pct": float(precip_error_pct),
        },
        "weather_coverage": {
            "data_rows": report.data_rows,
            "weather_rows": report.weather_rows,
            "coverage_ratio": float(report.weather_rows / max(1, report.data_rows)),
        },
        "summary": report.summary,
    }

    return validation_result


def main() -> int:
    """Validate all or specific tenants."""
    parser = argparse.ArgumentParser(description="Validate synthetic datasets")
    parser.add_argument(
        "--tenant",
        type=str,
        help="Specific tenant to validate (default: all)",
    )
    parser.add_argument(
        "--lake-root",
        type=str,
        default="storage/lake/raw",
        help="Data lake root directory",
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Output file for validation report (JSON)",
    )

    args = parser.parse_args()

    lake_root = Path(args.lake_root)
    tenants = [args.tenant] if args.tenant else [
        "demo_tenant_1",
        "demo_tenant_2",
        "demo_tenant_3",
        "demo_tenant_4",
    ]

    all_results = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "results": {},
    }

    for tenant_id in tenants:
        _LOGGER.info(f"Validating {tenant_id}...")
        try:
            result = validate_tenant(tenant_id, lake_root)
            all_results["results"][tenant_id] = result

            if result["status"] == "success":
                _LOGGER.info(
                    f"✅ {tenant_id}: "
                    f"temp_error={result['errors']['temperature_elasticity_pct']:.1f}%, "
                    f"precip_error={result['errors']['precipitation_elasticity_pct']:.1f}%, "
                    f"r²={result['estimated']['r_squared']:.3f}"
                )
            else:
                _LOGGER.error(f"❌ {tenant_id}: {result.get('error', 'unknown error')}")

        except Exception as e:
            _LOGGER.error(f"❌ {tenant_id}: {e}", exc_info=True)
            all_results["results"][tenant_id] = {
                "tenant_id": tenant_id,
                "status": "failed",
                "error": str(e),
            }

    # Save report if requested
    if args.output:
        output_path = Path(args.output)
        output_path.write_text(json.dumps(all_results, indent=2))
        _LOGGER.info(f"Validation report saved to {output_path}")

    # Print summary
    success_count = sum(
        1 for r in all_results["results"].values() if r.get("status") == "success"
    )
    _LOGGER.info(f"✅ Validation complete: {success_count}/{len(tenants)} tenants passed")

    return 0 if success_count == len(tenants) else 1


if __name__ == "__main__":
    exit(main())
