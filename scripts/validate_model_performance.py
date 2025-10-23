#!/usr/bin/env python3
"""Validate model performance against objective thresholds.

This script loads cross-validation results from the training process and
validates them against the R² >= 0.50 threshold specified in T-MLR-2.4.

Usage:
    python scripts/validate_model_performance.py \
        --input state/analytics/mmm_training_results_cv.json \
        --output state/analytics/mmm_validation_results.json \
        --threshold 0.50
"""

import argparse
import json
import logging
import sys
from pathlib import Path

from apps.model.mmm_lightweight_weather import (
    load_cv_results_from_json,
    validate_models_against_thresholds,
    summarize_validation_results,
    export_validation_results,
)

_LOGGER = logging.getLogger(__name__)


def main():
    """Run model validation."""
    parser = argparse.ArgumentParser(
        description="Validate weather-aware MMM models against R² thresholds"
    )
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Path to cross-validation results JSON file",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Path to output validation results JSON file",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.50,
        help="R² threshold for passing (default: 0.50)",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    # Setup logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    try:
        # Load CV results
        _LOGGER.info(f"Loading CV results from {args.input}")
        cv_results = load_cv_results_from_json(args.input)
        _LOGGER.info(f"Loaded {len(cv_results)} model results")

        # Validate models
        _LOGGER.info(f"Validating models against R² >= {args.threshold}")
        validation_results = validate_models_against_thresholds(
            cv_results, r2_threshold=args.threshold
        )

        # Summarize results
        summary = summarize_validation_results(validation_results)
        _LOGGER.info(f"Validation complete: {summary['passing_models']}/{summary['total_models']} models passed")

        # Export results
        _LOGGER.info(f"Exporting validation results to {args.output}")
        export_validation_results(validation_results, args.output)

        # Print summary
        print("\n" + "=" * 80)
        print("MODEL VALIDATION SUMMARY")
        print("=" * 80)
        print(f"Total models:        {summary['total_models']}")
        print(f"Passing models:      {summary['passing_models']}")
        print(f"Failing models:      {summary['failing_models']}")
        print(f"Pass rate:           {summary['pass_rate']:.1%}")
        print(f"R² threshold:        {summary['threshold']:.2f}")
        print(f"\nR² Statistics (all models):")
        print(f"  Mean:              {summary['mean_r2_all']:.4f}")
        print(f"  Std Dev:           {summary['std_r2_all']:.4f}")
        print(f"  Min:               {summary['min_r2']:.4f}")
        print(f"  Max:               {summary['max_r2']:.4f}")

        if summary["passing_model_names"]:
            print(f"\nPassing models ({len(summary['passing_model_names'])}):")
            for name in summary["passing_model_names"]:
                r2 = validation_results[name].mean_r2
                print(f"  - {name:30} R² = {r2:.4f}")

        if summary["failing_model_names"]:
            print(f"\nFailing models ({len(summary['failing_model_names'])}):")
            for name in summary["failing_model_names"]:
                r2 = validation_results[name].mean_r2
                print(f"  - {name:30} R² = {r2:.4f}")

        print(f"\nResults exported to: {args.output}")
        print("=" * 80 + "\n")

        # Return exit code based on pass rate
        if summary["pass_rate"] >= 0.50:
            _LOGGER.info("SUCCESS: At least 50% of models passed validation")
            return 0
        else:
            _LOGGER.warning(f"WARNING: Only {summary['pass_rate']:.1%} of models passed")
            return 1

    except Exception as e:
        _LOGGER.error(f"Validation failed: {e}", exc_info=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
