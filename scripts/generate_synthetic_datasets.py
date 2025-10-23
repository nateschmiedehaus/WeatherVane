#!/usr/bin/env python
"""Generate synthetic multi-tenant datasets for weather elasticity validation.

This script creates realistic datasets for all 4 simulated tenants with:
- Shopify product sales with weather-driven demand
- Meta and Google Ads spend patterns
- Klaviyo email engagement events
- Weather data from Open-Meteo (archived)
- Ground truth weather elasticity coefficients

Usage:
    python scripts/generate_synthetic_datasets.py --start-date 2024-01-01 --end-date 2024-12-31
"""

from __future__ import annotations

import argparse
import logging
import json
from datetime import date, datetime
from pathlib import Path

from apps.model.synthetic_data_generator import (
    SyntheticDataGenerator,
    SYNTHETIC_TENANTS,
)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
_LOGGER = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate synthetic multi-tenant datasets"
    )
    parser.add_argument(
        "--start-date",
        type=str,
        default="2024-01-01",
        help="Training window start date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end-date",
        type=str,
        default="2024-12-31",
        help="Training window end date (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="storage/lake/raw",
        help="Output directory for data lake",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate generated data quality",
    )
    return parser.parse_args()


def validate_datasets(output_dir: Path) -> bool:
    """Validate generated datasets for quality.

    Args:
        output_dir: Root data lake directory

    Returns:
        True if all validations pass, False otherwise
    """
    _LOGGER.info("Starting data quality validation...")
    all_valid = True

    for tenant_id in SYNTHETIC_TENANTS.keys():
        tenant_dir = output_dir / tenant_id

        if not tenant_dir.exists():
            _LOGGER.error(f"Tenant directory not found: {tenant_dir}")
            all_valid = False
            continue

        # Check for required files
        parquet_files = list(tenant_dir.glob("*.parquet"))
        if len(parquet_files) < 5:
            _LOGGER.error(
                f"Tenant {tenant_id}: Expected 5 parquet files, found {len(parquet_files)}"
            )
            all_valid = False

        # Check metadata
        metadata_files = list(tenant_dir.glob("*.json"))
        if len(metadata_files) < 1:
            _LOGGER.error(f"Tenant {tenant_id}: No metadata file found")
            all_valid = False
        else:
            try:
                metadata_file = metadata_files[0]
                metadata = json.loads(metadata_file.read_text())

                # Validate elasticity ground truth
                if "elasticity_ground_truth" not in metadata:
                    _LOGGER.error(
                        f"Tenant {tenant_id}: No elasticity_ground_truth in metadata"
                    )
                    all_valid = False
                else:
                    elasticity = metadata["elasticity_ground_truth"]
                    _LOGGER.info(
                        f"Tenant {tenant_id}: "
                        f"temperature_elasticity={elasticity.get('temperature_elasticity', 'N/A')}, "
                        f"precipitation_elasticity={elasticity.get('precipitation_elasticity', 'N/A')}"
                    )

            except json.JSONDecodeError as e:
                _LOGGER.error(f"Tenant {tenant_id}: Invalid JSON in metadata: {e}")
                all_valid = False

    return all_valid


def main() -> int:
    """Generate synthetic datasets."""
    args = parse_args()

    try:
        # Parse dates
        start_date = datetime.strptime(args.start_date, "%Y-%m-%d").date()
        end_date = datetime.strptime(args.end_date, "%Y-%m-%d").date()
    except ValueError as e:
        _LOGGER.error(f"Invalid date format: {e}")
        return 1

    output_dir = Path(args.output_dir)

    # Generate datasets
    _LOGGER.info(f"Generating synthetic datasets for period {start_date} to {end_date}...")
    _LOGGER.info(f"Output directory: {output_dir}")

    generator = SyntheticDataGenerator(random_seed=args.seed)

    try:
        datasets = generator.generate_all_tenants(
            start_date=start_date,
            end_date=end_date,
            output_dir=output_dir,
        )

        _LOGGER.info(f"✅ Successfully generated {len(datasets)} tenant datasets")

        # Print summary
        for tenant_id, dataset in datasets.items():
            _LOGGER.info(
                f"  {tenant_id}: {dataset.num_days} days, "
                f"{dataset.shopify_orders.height} orders, "
                f"elasticity={dataset.elasticity_ground_truth.get('mean_elasticity', 'N/A'):.3f}"
            )

        # Validate if requested
        if args.validate:
            _LOGGER.info("Running data quality validation...")
            if validate_datasets(output_dir):
                _LOGGER.info("✅ All validation checks passed")
                return 0
            else:
                _LOGGER.error("❌ Some validation checks failed")
                return 1

        return 0

    except Exception as e:
        _LOGGER.error(f"Failed to generate synthetic datasets: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    exit(main())
