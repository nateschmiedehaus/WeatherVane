#!/usr/bin/env python3
"""Train weather-aware MMM models on synthetic tenant data with k-fold cross-validation.

This script trains WeatherAwareMMM models on all 20 synthetic tenant datasets
with proper k-fold cross-validation (time-series aware) and validates against
objective thresholds (mean R² >= 0.50 across folds).

Usage:
    python scripts/train_mmm_synthetic_cv.py [--n-folds 5]
"""

import json
import logging
import argparse
from pathlib import Path
from typing import Dict, Any

from apps.model.mmm_lightweight_weather import TenantModelTrainer, CrossValidationMetrics

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
_LOGGER = logging.getLogger(__name__)


def serialize_cv_result(result: CrossValidationMetrics) -> Dict[str, Any]:
    """Serialize CrossValidationMetrics to JSON-compatible dict.

    Args:
        result: Cross-validation metrics object

    Returns:
        Dictionary with serializable values
    """
    import numpy as np

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
        "model_name": result.model_name,
        "num_folds": result.num_folds,
        "mean_r2": convert_value(result.mean_r2),
        "std_r2": convert_value(result.std_r2),
        "mean_rmse": convert_value(result.mean_rmse),
        "mean_mae": convert_value(result.mean_mae),
        "fold_r2_scores": convert_value(result.fold_r2_scores),
        "fold_rmse_scores": convert_value(result.fold_rmse_scores),
        "fold_mae_scores": convert_value(result.fold_mae_scores),
        "weather_elasticity": convert_value(result.weather_elasticity),
        "channel_roas": convert_value(result.channel_roas),
        "num_features": len(result.feature_names),
        "feature_names": result.feature_names,
        "fold_details": convert_value(result.fold_details),
    }


def main():
    """Train MMM models with cross-validation on all synthetic tenants."""
    parser = argparse.ArgumentParser(
        description="Train weather-aware MMM with k-fold cross-validation"
    )
    parser.add_argument(
        "--n-folds",
        type=int,
        default=5,
        help="Number of folds for cross-validation (default: 5)",
    )
    args = parser.parse_args()

    n_folds = args.n_folds

    _LOGGER.info("=" * 80)
    _LOGGER.info("T-MLR-2.3: Train models on all 20 synthetic tenants with cross-validation")
    _LOGGER.info("=" * 80)
    _LOGGER.info(f"Configuration: {n_folds}-fold cross-validation")

    # Initialize trainer
    trainer = TenantModelTrainer()
    _LOGGER.info(f"Data directory: {trainer.data_dir}")

    # List tenant files
    tenant_files = trainer.list_tenant_files()
    _LOGGER.info(f"Found {len(tenant_files)} tenant files to train on")

    if not tenant_files:
        _LOGGER.error(f"No parquet files found in {trainer.data_dir}")
        return 1

    # Train all tenants with cross-validation
    _LOGGER.info("\n" + "=" * 80)
    _LOGGER.info(f"Starting cross-validation training on all {len(tenant_files)} tenants...")
    _LOGGER.info("=" * 80)

    results = trainer.train_all_tenants_with_cv(n_folds=n_folds)

    # Compute aggregate metrics
    _LOGGER.info("\n" + "=" * 80)
    _LOGGER.info("Cross-Validation Training Complete - Aggregate Metrics")
    _LOGGER.info("=" * 80)

    metrics = trainer.compute_cv_aggregate_metrics(results)

    # Display summary
    _LOGGER.info(f"Total Tenants Trained: {metrics['num_tenants']}")
    _LOGGER.info(f"Folds per Tenant: {metrics['num_folds']}")
    _LOGGER.info(
        f"Mean R² Across Tenants: {metrics['mean_r2_across_tenants']:.4f} ± {metrics['std_r2_across_tenants']:.4f}"
    )
    _LOGGER.info(f"Mean RMSE Across Tenants: {metrics['mean_rmse_across_tenants']:.4f}")
    _LOGGER.info(f"Mean MAE Across Tenants: {metrics['mean_mae_across_tenants']:.4f}")
    _LOGGER.info(f"Best Tenant R²: {metrics['best_tenant_r2']:.4f}")
    _LOGGER.info(f"Worst Tenant R²: {metrics['worst_tenant_r2']:.4f}")
    _LOGGER.info(f"Passing Models (Mean R² >= 0.50): {metrics['num_passing']}/{metrics['num_tenants']}")
    _LOGGER.info(f"Pass Rate: {metrics['pass_rate']:.1%}")

    # Display per-tenant results
    _LOGGER.info("\n" + "=" * 80)
    _LOGGER.info("Per-Tenant Cross-Validation Results")
    _LOGGER.info("=" * 80)
    _LOGGER.info(
        f"{'Tenant':<30} {'Mean R²':>10} {'Std R²':>10} {'RMSE':>10} {'Status':>10}"
    )
    _LOGGER.info("-" * 72)

    for tenant_name, result in sorted(results.items()):
        status = "PASS" if result.mean_r2 >= 0.50 else "FAIL"
        _LOGGER.info(
            f"{tenant_name:<30} {result.mean_r2:>10.4f} {result.std_r2:>10.4f} "
            f"{result.mean_rmse:>10.4f} {status:>10}"
        )

    # Display fold-wise metrics for first tenant (as example)
    if results:
        first_tenant = list(results.keys())[0]
        first_result = results[first_tenant]
        _LOGGER.info("\n" + "=" * 80)
        _LOGGER.info(f"Fold-wise metrics example ({first_tenant}):")
        _LOGGER.info("=" * 80)
        _LOGGER.info(
            f"{'Fold':<10} {'Train Size':>12} {'Test Size':>12} {'R²':>10} {'RMSE':>10}"
        )
        _LOGGER.info("-" * 54)
        for fold_detail in first_result.fold_details:
            _LOGGER.info(
                f"{fold_detail['fold']:<10} "
                f"{fold_detail['train_size']:>12} "
                f"{fold_detail['test_size']:>12} "
                f"{fold_detail['r2']:>10.4f} {fold_detail['rmse']:>10.4f}"
            )

    # Save results to JSON
    output_file = Path("state/analytics/mmm_training_results_cv.json")
    output_file.parent.mkdir(parents=True, exist_ok=True)

    output_data = {
        "summary": metrics,
        "configuration": {
            "n_folds": n_folds,
            "strategy": "time_series_aware",
        },
        "results": {name: serialize_cv_result(result) for name, result in results.items()},
    }

    with open(output_file, "w") as f:
        json.dump(output_data, f, indent=2)

    _LOGGER.info(f"\nDetailed results saved to {output_file}")

    # Check if we meet the objective criteria
    _LOGGER.info("\n" + "=" * 80)
    _LOGGER.info("Objective Criteria Evaluation")
    _LOGGER.info("=" * 80)

    passing = metrics["num_passing"]
    total = metrics["num_tenants"]
    target_rate = 0.80  # 80% of tenants should reach mean R² >= 0.50

    _LOGGER.info(f"Target: {target_rate:.0%} of tenants with mean R² >= 0.50")
    _LOGGER.info(f"Achieved: {metrics['pass_rate']:.1%} ({passing}/{total})")
    _LOGGER.info(
        f"Overall Mean R²: {metrics['mean_r2_across_tenants']:.4f} "
        f"(min: {metrics['worst_tenant_r2']:.4f}, max: {metrics['best_tenant_r2']:.4f})"
    )

    if metrics["pass_rate"] >= target_rate:
        _LOGGER.info("✓ OBJECTIVE MET")
        return 0
    else:
        _LOGGER.warning("✗ OBJECTIVE NOT MET - Consider model tuning or feature engineering")
        return 1


if __name__ == "__main__":
    exit(main())
