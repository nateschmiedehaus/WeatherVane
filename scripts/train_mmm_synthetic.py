#!/usr/bin/env python3
"""Train weather-aware MMM models on all 20 synthetic tenants with cross-validation.

Task: T-MLR-2.3 - Train models on all 20 synthetic tenants with cross-validation

This script:
1. Loads all synthetic tenant data from storage/seeds/synthetic_v2/
2. Trains WeatherAwareMMM models on each tenant with train/val/test splits
3. Performs 5-fold cross-validation for robustness assessment
4. Aggregates metrics across all tenants
5. Exports results to state/analytics/mmm_training_results.json

Usage:
    python scripts/train_mmm_synthetic.py
"""

import json
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

import numpy as np

from apps.model.mmm_lightweight_weather import (
    TenantModelTrainer,
    WeatherAwareMMResult,
    CrossValidationMetrics,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
_LOGGER = logging.getLogger(__name__)


def serialize_cv_result(cv_metrics: CrossValidationMetrics) -> Dict[str, Any]:
    """Serialize CrossValidationMetrics to JSON-compatible dict.

    Args:
        cv_metrics: Cross-validation metrics object

    Returns:
        Dictionary with serializable values
    """

    def convert_value(val):
        """Convert numpy types to Python natives."""
        if isinstance(val, np.ndarray):
            return val.tolist()
        elif isinstance(val, (np.integer, np.floating)):
            return float(val)
        elif isinstance(val, dict):
            return {k: convert_value(v) for k, v in val.items()}
        elif isinstance(val, list):
            return [convert_value(v) for v in val]
        else:
            return val

    return {
        "model_name": cv_metrics.model_name,
        "num_folds": cv_metrics.num_folds,
        "mean_r2": convert_value(cv_metrics.mean_r2),
        "std_r2": convert_value(cv_metrics.std_r2),
        "mean_rmse": convert_value(cv_metrics.mean_rmse),
        "mean_mae": convert_value(cv_metrics.mean_mae),
        "mean_revenue": convert_value(cv_metrics.mean_revenue),
        "fold_r2_scores": [float(x) for x in cv_metrics.fold_r2_scores],
        "fold_rmse_scores": [float(x) for x in cv_metrics.fold_rmse_scores],
        "fold_mae_scores": [float(x) for x in cv_metrics.fold_mae_scores],
        "weather_elasticity": convert_value(cv_metrics.weather_elasticity),
        "channel_roas": convert_value(cv_metrics.channel_roas),
        "fold_details": cv_metrics.fold_details,
    }


def main():
    """Train MMM models on all synthetic tenants with cross-validation (T-MLR-2.3)."""
    _LOGGER.info("=" * 80)
    _LOGGER.info("T-MLR-2.3: Train Models on All 20 Synthetic Tenants")
    _LOGGER.info("=" * 80)

    # Initialize trainer
    trainer = TenantModelTrainer()
    _LOGGER.info(f"Data directory: {trainer.data_dir}")

    # List tenant files
    tenant_files = trainer.list_tenant_files()
    _LOGGER.info(f"Found {len(tenant_files)} tenant files to train on")

    if not tenant_files:
        _LOGGER.error(f"No parquet files found in {trainer.data_dir}")
        return 1

    if len(tenant_files) < 20:
        _LOGGER.warning(
            f"Expected 20 tenants, found {len(tenant_files)}. "
            "Proceeding with available data."
        )

    # Train all tenants with cross-validation
    _LOGGER.info("\n" + "=" * 80)
    _LOGGER.info("Starting cross-validated training on all tenants (5 folds)...")
    _LOGGER.info("=" * 80)

    n_folds = 5
    cv_results = trainer.train_all_tenants_with_cv(n_folds=n_folds)

    # Compute aggregate metrics
    _LOGGER.info("\n" + "=" * 80)
    _LOGGER.info("Cross-Validation Complete - Aggregate Metrics")
    _LOGGER.info("=" * 80)

    aggregate_metrics = trainer.compute_cv_aggregate_metrics(cv_results)

    # Display summary
    _LOGGER.info(f"Total Tenants Trained: {aggregate_metrics['num_tenants']}")
    _LOGGER.info(f"Cross-validation Folds: {aggregate_metrics['num_folds']}")
    _LOGGER.info(
        f"Mean R² (across folds): {aggregate_metrics['mean_r2_across_tenants']:.4f} ± "
        f"{aggregate_metrics['std_r2_across_tenants']:.4f}"
    )
    _LOGGER.info(f"Mean RMSE: {aggregate_metrics['mean_rmse_across_tenants']:.4f}")
    _LOGGER.info(f"Mean MAE: {aggregate_metrics['mean_mae_across_tenants']:.4f}")
    _LOGGER.info(
        f"Best Tenant R²: {aggregate_metrics['best_tenant_r2']:.4f}"
    )
    _LOGGER.info(
        f"Worst Tenant R²: {aggregate_metrics['worst_tenant_r2']:.4f}"
    )
    _LOGGER.info(
        f"Passing Models (R² >= 0.50): {aggregate_metrics['num_passing']}/{aggregate_metrics['num_tenants']}"
    )
    _LOGGER.info(f"Pass Rate: {aggregate_metrics['pass_rate']:.1%}")

    # Display per-tenant results
    _LOGGER.info("\n" + "=" * 80)
    _LOGGER.info("Per-Tenant Cross-Validation Results")
    _LOGGER.info("=" * 80)
    _LOGGER.info(
        f"{'Tenant':<30} {'Mean R²':>10} {'Std R²':>10} {'RMSE':>10} {'Status':>10}"
    )
    _LOGGER.info("-" * 72)

    for tenant_name, cv_metrics in sorted(cv_results.items()):
        status = "PASS" if cv_metrics.mean_r2 >= 0.50 else "FAIL"
        _LOGGER.info(
            f"{tenant_name:<30} {cv_metrics.mean_r2:>10.4f} {cv_metrics.std_r2:>10.4f} "
            f"{cv_metrics.mean_rmse:>10.2f} {status:>10}"
        )

    # Save results to JSON
    output_file = Path("state/analytics/mmm_training_results.json")
    output_file.parent.mkdir(parents=True, exist_ok=True)

    output_data = {
        "task": "T-MLR-2.3",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "description": "Train models on all 20 synthetic tenants with cross-validation",
        "config": {
            "n_folds": n_folds,
            "num_tenants": len(cv_results),
        },
        "aggregate_metrics": aggregate_metrics,
        "results": {
            name: serialize_cv_result(cv_metrics)
            for name, cv_metrics in cv_results.items()
        },
    }

    with open(output_file, "w") as f:
        json.dump(output_data, f, indent=2)

    _LOGGER.info(f"\nDetailed results saved to {output_file}")
    _LOGGER.info(f"File size: {output_file.stat().st_size / 1024:.1f} KB")

    # Check if we meet the objective criteria
    _LOGGER.info("\n" + "=" * 80)
    _LOGGER.info("Objective Criteria Evaluation")
    _LOGGER.info("=" * 80)

    target_mean_r2 = 0.40  # Mean R² across all tenants should be >= 0.40
    target_pass_rate = 0.50  # At least 50% of tenants should achieve R² >= 0.50

    _LOGGER.info(f"Target: Mean R² >= {target_mean_r2:.2f}")
    _LOGGER.info(
        f"Achieved: {aggregate_metrics['mean_r2_across_tenants']:.4f}"
    )
    mean_r2_ok = (
        aggregate_metrics["mean_r2_across_tenants"] >= target_mean_r2
    )

    _LOGGER.info(f"\nTarget: Pass rate >= {target_pass_rate:.0%} with R² >= 0.50")
    _LOGGER.info(
        f"Achieved: {aggregate_metrics['pass_rate']:.1%} "
        f"({aggregate_metrics['num_passing']}/{aggregate_metrics['num_tenants']})"
    )
    pass_rate_ok = aggregate_metrics["pass_rate"] >= target_pass_rate

    if mean_r2_ok and pass_rate_ok:
        _LOGGER.info("\n✓ OBJECTIVE MET - All criteria satisfied")
        return 0
    else:
        if not mean_r2_ok:
            _LOGGER.warning("  ✗ Mean R² below target")
        if not pass_rate_ok:
            _LOGGER.warning("  ✗ Pass rate below target")
        _LOGGER.warning("✗ OBJECTIVE NOT MET - Consider model tuning")
        return 1


if __name__ == "__main__":
    sys.exit(main())
