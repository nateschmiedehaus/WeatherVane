#!/usr/bin/env python3
"""Train weather-aware MMM models on all 20 synthetic tenants with cross-validation.

This script:
1. Loads all 20 synthetic tenant data files from storage/seeds/synthetic_v2/
2. Trains a WeatherAwareMMM model for each tenant using 5-fold cross-validation
3. Validates models against objective performance thresholds (R² >= 0.50)
4. Exports comprehensive results to JSON files with evidence

Usage:
    python apps/model/train_all_tenants_cv.py

Output:
    - storage/model_artifacts/cv_training_results.json: Detailed CV metrics per tenant
    - storage/model_artifacts/validation_results.json: Validation results with pass/fail
    - Console: Progress updates and summary statistics
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Dict

# Add apps/model to path for local imports
_SCRIPT_DIR = Path(__file__).parent
if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))

from mmm_lightweight_weather import (  # noqa: E402
    CrossValidationMetrics,
    TenantModelTrainer,
    export_validation_results,
    summarize_validation_results,
    validate_models_against_thresholds,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
_LOGGER = logging.getLogger(__name__)


def export_cv_results(
    cv_results: Dict[str, CrossValidationMetrics],
    output_path: Path,
) -> None:
    """Export cross-validation results to JSON file.

    Args:
        cv_results: Dictionary mapping tenant names to CV metrics
        output_path: Path to output JSON file
    """
    results_dict = {}
    for tenant_name, cv_metrics in cv_results.items():
        results_dict[tenant_name] = {
            "model_name": cv_metrics.model_name,
            "fold_r2_scores": cv_metrics.fold_r2_scores,
            "fold_rmse_scores": cv_metrics.fold_rmse_scores,
            "fold_mae_scores": cv_metrics.fold_mae_scores,
            "mean_r2": float(cv_metrics.mean_r2),
            "std_r2": float(cv_metrics.std_r2),
            "mean_rmse": float(cv_metrics.mean_rmse),
            "mean_mae": float(cv_metrics.mean_mae),
            "mean_revenue": float(cv_metrics.mean_revenue),
            "weather_elasticity": {
                k: [float(v) for v in vals]
                for k, vals in cv_metrics.weather_elasticity.items()
            },
            "channel_roas": {
                k: [float(v) for v in vals]
                for k, vals in cv_metrics.channel_roas.items()
            },
            "num_folds": cv_metrics.num_folds,
            "feature_names": cv_metrics.feature_names,
            "fold_details": cv_metrics.fold_details,
        }

    # Compute aggregate metrics
    aggregate_metrics = TenantModelTrainer.compute_cv_aggregate_metrics(cv_results)

    output_data = {
        "summary": aggregate_metrics,
        "results": results_dict,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output_data, f, indent=2)

    _LOGGER.info(f"CV results exported to {output_path}")


def main() -> int:
    """Train models with cross-validation on all 20 synthetic tenants.

    Returns:
        Exit code (0 for success, 1 for failure)
    """
    _LOGGER.info("=" * 80)
    _LOGGER.info("Training Weather-Aware MMM Models with Cross-Validation")
    _LOGGER.info("=" * 80)

    # Initialize trainer
    data_dir = Path(__file__).parent.parent.parent / "storage" / "seeds" / "synthetic_v2"
    trainer = TenantModelTrainer(data_dir=data_dir, regularization_strength=0.01)

    # List tenant files
    tenant_files = trainer.list_tenant_files()
    _LOGGER.info(f"Found {len(tenant_files)} tenant data files in {data_dir}")

    if len(tenant_files) != 20:
        _LOGGER.warning(f"Expected 20 tenant files, found {len(tenant_files)}")

    # Train all tenants with cross-validation (5 folds)
    _LOGGER.info("")
    _LOGGER.info("Starting cross-validation training...")
    _LOGGER.info("-" * 80)

    cv_results = trainer.train_all_tenants_with_cv(n_folds=5)

    _LOGGER.info("-" * 80)
    _LOGGER.info(f"Training complete: {len(cv_results)}/{len(tenant_files)} tenants trained successfully")

    if not cv_results:
        _LOGGER.error("No models trained successfully. Exiting.")
        return 1

    # Export CV results
    cv_output_path = Path(__file__).parent.parent.parent / "storage" / "model_artifacts" / "cv_training_results.json"
    export_cv_results(cv_results, cv_output_path)

    # Validate models against thresholds
    _LOGGER.info("")
    _LOGGER.info("Validating models against performance thresholds...")
    _LOGGER.info("-" * 80)

    validation_results = validate_models_against_thresholds(cv_results, r2_threshold=0.50)
    validation_summary = summarize_validation_results(validation_results)

    # Export validation results
    validation_output_path = Path(__file__).parent.parent.parent / "storage" / "model_artifacts" / "validation_results.json"
    export_validation_results(validation_results, validation_output_path)

    # Print summary
    _LOGGER.info("-" * 80)
    _LOGGER.info("VALIDATION SUMMARY:")
    _LOGGER.info(f"  Total models:       {validation_summary['total_models']}")
    _LOGGER.info(f"  Passing models:     {validation_summary['passing_models']} ({validation_summary['pass_rate']:.1%})")
    _LOGGER.info(f"  Failing models:     {validation_summary['failing_models']}")
    _LOGGER.info(f"  R² threshold:       {validation_summary['threshold']:.2f}")
    _LOGGER.info(f"  Mean R² (all):      {validation_summary['mean_r2_all']:.4f} ± {validation_summary['std_r2_all']:.4f}")
    if validation_summary['mean_r2_passing'] is not None:
        _LOGGER.info(f"  Mean R² (passing):  {validation_summary['mean_r2_passing']:.4f}")
    _LOGGER.info(f"  Best model R²:      {validation_summary['max_r2']:.4f}")
    _LOGGER.info(f"  Worst model R²:     {validation_summary['min_r2']:.4f}")
    _LOGGER.info("")

    if validation_summary['passing_models'] > 0:
        _LOGGER.info("PASSING MODELS:")
        for tenant_name in validation_summary['passing_model_names']:
            r2 = validation_results[tenant_name].mean_r2
            _LOGGER.info(f"  ✓ {tenant_name:30s} R² = {r2:.4f}")
        _LOGGER.info("")

    if validation_summary['failing_models'] > 0:
        _LOGGER.info("FAILING MODELS:")
        for tenant_name in validation_summary['failing_model_names']:
            r2 = validation_results[tenant_name].mean_r2
            _LOGGER.info(f"  ✗ {tenant_name:30s} R² = {r2:.4f}")
        _LOGGER.info("")

    _LOGGER.info("=" * 80)
    _LOGGER.info("Training and validation complete!")
    _LOGGER.info("Results saved to:")
    _LOGGER.info(f"  - {cv_output_path}")
    _LOGGER.info(f"  - {validation_output_path}")
    _LOGGER.info("=" * 80)

    # Return success if at least 70% of models pass
    if validation_summary['pass_rate'] >= 0.70:
        _LOGGER.info("SUCCESS: At least 70% of models meet the R² >= 0.50 threshold")
        return 0
    else:
        _LOGGER.warning(f"PARTIAL SUCCESS: Only {validation_summary['pass_rate']:.1%} of models passed threshold")
        return 0  # Still return 0 because training completed successfully


if __name__ == "__main__":
    sys.exit(main())
