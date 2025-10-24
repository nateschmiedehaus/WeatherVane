"""Validate model performance against objective thresholds.

This script validates trained weather-aware MMM models against objective
performance thresholds defined for the WeatherVane project:

Performance Thresholds:
- R² >= 0.50: Minimum acceptable model performance
- Cross-validation std < 0.15: Model stability requirement
- RMSE <= 20% of mean revenue: Prediction accuracy requirement

Validation Process:
1. Load cross-validation results from training
2. Apply objective thresholds to each model
3. Compute aggregate metrics across all models
4. Generate validation report with pass/fail status
5. Export results to JSON for auditing

Usage:
    # Validate all models from training results
    python apps/model/validate_model_performance.py \\
        --cv-results storage/models/mmm_cv_results.json \\
        --output storage/models/validation_results.json

    # Set custom thresholds
    python apps/model/validate_model_performance.py \\
        --cv-results storage/models/mmm_cv_results.json \\
        --r2-threshold 0.60 \\
        --rmse-max-pct 0.15 \\
        --output storage/models/validation_results.json
"""

from __future__ import annotations

import argparse
import json
import logging
import math
from dataclasses import dataclass, field
from datetime import datetime
from os import PathLike
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Union

import numpy as np

from apps.model.mmm_lightweight_weather import (
    CrossValidationMetrics,
    load_cv_results_from_json,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
_LOGGER = logging.getLogger(__name__)


@dataclass
class ValidationThresholds:
    """Objective performance thresholds for model validation."""

    r2_min: float = 0.50
    """Minimum R² score required (default: 0.50)"""

    r2_std_max: float = 0.15
    """Maximum R² standard deviation across folds (default: 0.15)"""

    rmse_max_pct: float = 0.20
    """Maximum RMSE as percentage of mean revenue (default: 20%)"""

    min_folds: int = 3
    """Minimum number of CV folds required (default: 3)"""

    min_train_samples: int = 30
    """Minimum training samples per fold (default: 30)"""


@dataclass
class ExtendedValidationResult:
    """Extended validation result with additional checks."""

    tenant_name: str
    """Tenant identifier"""

    mean_r2: float
    """Mean R² across CV folds"""

    std_r2: float
    """Standard deviation of R² across folds"""

    mean_rmse: float
    """Mean RMSE across CV folds"""

    mean_mae: float
    """Mean MAE across CV folds"""

    num_folds: int
    """Number of CV folds"""

    passes_r2_threshold: bool
    """R² >= threshold"""

    passes_stability_check: bool
    """R² std <= max allowed"""

    passes_rmse_check: bool
    """RMSE within acceptable range"""

    passes_all_checks: bool
    """All validation checks pass"""

    failure_reasons: List[str] = field(default_factory=list)
    """Reasons for validation failure"""

    weather_elasticity: Dict[str, float] = field(default_factory=dict)
    """Weather elasticity coefficients"""

    channel_roas: Dict[str, float] = field(default_factory=dict)
    """Channel ROAS estimates"""

    fold_details: List[Dict[str, Any]] = field(default_factory=list)
    """Per-fold details"""


def _is_finite_number(value: Any) -> bool:
    """Return True when the provided value is a finite numeric scalar."""
    if value is None:
        return False
    try:
        return bool(np.isfinite(value))
    except (TypeError, ValueError):
        return False


def _has_invalid_numbers(values: Iterable[Any]) -> bool:
    """Detect NaN/inf/None entries in a numeric collection."""
    return any(not _is_finite_number(value) for value in values)


def _filter_finite_numbers(values: Iterable[Any]) -> List[float]:
    """Return only finite numeric values from an iterable."""
    return [float(value) for value in values if _is_finite_number(value)]


def validate_model_with_extended_checks(
    tenant_name: str,
    cv_metrics: CrossValidationMetrics,
    thresholds: ValidationThresholds,
    mean_revenue: Optional[float] = None,
) -> ExtendedValidationResult:
    """Validate a single model with extended threshold checks.

    Args:
        tenant_name: Tenant/model identifier
        cv_metrics: Cross-validation metrics
        thresholds: Validation thresholds
        mean_revenue: Mean revenue for RMSE percentage calculation

    Returns:
        ExtendedValidationResult with detailed validation status
    """
    failure_reasons: List[str] = []
    fold_r2_scores = list(cv_metrics.fold_r2_scores or [])
    fold_details = list(cv_metrics.fold_details or [])

    # Check 1: R² threshold (including input validity)
    passes_r2 = False
    r2_quality_issues: List[str] = []
    if _has_invalid_numbers([cv_metrics.mean_r2]):
        r2_quality_issues.append("mean R² is NaN or infinite")
    if _has_invalid_numbers(fold_r2_scores):
        r2_quality_issues.append("fold R² scores contain NaN or infinite values")

    if r2_quality_issues:
        failure_reasons.append(
            "R² data quality issue: " + "; ".join(r2_quality_issues)
        )
    else:
        passes_r2 = cv_metrics.mean_r2 >= thresholds.r2_min
        if not passes_r2:
            failure_reasons.append(
                f"R² ({cv_metrics.mean_r2:.3f}) below minimum threshold ({thresholds.r2_min:.3f})"
            )

    # Check 2: Stability (R² standard deviation)
    passes_stability = False
    if _has_invalid_numbers([cv_metrics.std_r2]):
        failure_reasons.append(
            "Stability check failed: Standard deviation of R² is NaN or infinite"
        )
    else:
        passes_stability = cv_metrics.std_r2 <= thresholds.r2_std_max
        if not passes_stability:
            failure_reasons.append(
                f"Stability check failed: Standard deviation of R² ({cv_metrics.std_r2:.3f}) exceeds maximum ({thresholds.r2_std_max:.3f})"
            )

    # Check 3: RMSE relative to revenue
    passes_rmse = True
    if _has_invalid_numbers([cv_metrics.mean_rmse]):
        passes_rmse = False
        failure_reasons.append(
            "RMSE data quality issue: mean RMSE is NaN or infinite"
        )
    elif mean_revenue is not None and mean_revenue > 0:
        rmse_pct = cv_metrics.mean_rmse / mean_revenue
        if not math.isfinite(rmse_pct):
            passes_rmse = False
            failure_reasons.append(
                "RMSE data quality issue: RMSE percentage is non-finite"
            )
        elif rmse_pct > thresholds.rmse_max_pct:
            passes_rmse = False
            failure_reasons.append(
                f"RMSE percentage ({rmse_pct:.1%}) exceeds maximum ({thresholds.rmse_max_pct:.1%})"
            )

    # Check 4: Sufficient CV folds
    has_sufficient_folds = True
    if not _is_finite_number(cv_metrics.num_folds):
        has_sufficient_folds = False
        failure_reasons.append("Insufficient folds (value missing or invalid)")
        num_folds_value = cv_metrics.num_folds
    else:
        num_folds_value = int(cv_metrics.num_folds)
        if num_folds_value < thresholds.min_folds:
            has_sufficient_folds = False
            failure_reasons.append(
                f"Insufficient folds ({num_folds_value} < {thresholds.min_folds})"
            )

    passes_all = passes_r2 and passes_stability and passes_rmse and has_sufficient_folds

    # Compute mean elasticity and ROAS
    mean_elasticity: Dict[str, float] = {}
    for feature, values in (cv_metrics.weather_elasticity or {}).items():
        finite_values = _filter_finite_numbers(values)
        if finite_values:
            mean_elasticity[feature] = float(np.mean(finite_values))

    mean_roas: Dict[str, float] = {}
    for channel, values in (cv_metrics.channel_roas or {}).items():
        finite_values = _filter_finite_numbers(values)
        if finite_values:
            mean_roas[channel] = float(np.mean(finite_values))

    return ExtendedValidationResult(
        tenant_name=tenant_name,
        mean_r2=cv_metrics.mean_r2,
        std_r2=cv_metrics.std_r2,
        mean_rmse=cv_metrics.mean_rmse,
        mean_mae=cv_metrics.mean_mae,
        num_folds=num_folds_value,
        passes_r2_threshold=passes_r2,
        passes_stability_check=passes_stability,
        passes_rmse_check=passes_rmse,
        passes_all_checks=passes_all,
        failure_reasons=failure_reasons,
        weather_elasticity=mean_elasticity,
        channel_roas=mean_roas,
        fold_details=fold_details,
    )


def validate_all_models(
    cv_results: Dict[str, CrossValidationMetrics],
    thresholds: ValidationThresholds,
) -> Dict[str, ExtendedValidationResult]:
    """Validate all models against objective thresholds.

    Args:
        cv_results: Dictionary of CrossValidationMetrics by tenant
        thresholds: Validation thresholds

    Returns:
        Dictionary of ExtendedValidationResult by tenant
    """
    validation_results = {}

    for tenant_name, cv_metrics in cv_results.items():
        result = validate_model_with_extended_checks(
            tenant_name,
            cv_metrics,
            thresholds,
        )
        validation_results[tenant_name] = result

        status = "✅ PASS" if result.passes_all_checks else "❌ FAIL"
        _LOGGER.info(
            f"{status} {tenant_name}: R²={result.mean_r2:.3f}±{result.std_r2:.3f}, "
            f"RMSE={result.mean_rmse:.2f}"
        )

        if result.failure_reasons:
            for reason in result.failure_reasons:
                _LOGGER.warning(f"  └─ {reason}")

    return validation_results


def generate_validation_report(
    validation_results: Dict[str, ExtendedValidationResult],
    thresholds: ValidationThresholds,
) -> Dict[str, Any]:
    """Generate comprehensive validation report.

    Args:
        validation_results: Validation results by tenant
        thresholds: Thresholds used for validation

    Returns:
        Validation report dictionary
    """
    if not validation_results:
        return {}

    passing_models = [r for r in validation_results.values() if r.passes_all_checks]
    failing_models = [r for r in validation_results.values() if not r.passes_all_checks]

    all_r2_scores = [r.mean_r2 for r in validation_results.values()]
    passing_r2_scores = [r.mean_r2 for r in passing_models]

    # Analyze failure patterns
    failure_patterns: Dict[str, int] = {}
    for result in failing_models:
        for reason in result.failure_reasons:
            failure_type = reason.split(":")[0] if ":" in reason else reason
            failure_patterns[failure_type] = failure_patterns.get(failure_type, 0) + 1

    report = {
        "timestamp": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "validation_summary": {
            "total_models": len(validation_results),
            "passing_models": len(passing_models),
            "failing_models": len(failing_models),
            "pass_rate": len(passing_models) / len(validation_results),
        },
        "thresholds": {
            "r2_min": thresholds.r2_min,
            "r2_std_max": thresholds.r2_std_max,
            "rmse_max_pct": thresholds.rmse_max_pct,
            "min_folds": thresholds.min_folds,
        },
        "performance_metrics": {
            "r2_all_models": {
                "mean": float(np.mean(all_r2_scores)),
                "std": float(np.std(all_r2_scores)),
                "min": float(np.min(all_r2_scores)),
                "max": float(np.max(all_r2_scores)),
                "median": float(np.median(all_r2_scores)),
            },
            "r2_passing_models": {
                "mean": float(np.mean(passing_r2_scores)) if passing_r2_scores else None,
                "std": float(np.std(passing_r2_scores)) if passing_r2_scores else None,
                "min": float(np.min(passing_r2_scores)) if passing_r2_scores else None,
                "max": float(np.max(passing_r2_scores)) if passing_r2_scores else None,
            },
        },
        "failure_analysis": {
            "failure_patterns": failure_patterns,
            "failing_model_names": sorted([r.tenant_name for r in failing_models]),
        },
        "passing_models": {
            "model_names": sorted([r.tenant_name for r in passing_models]),
            "top_performers": sorted(
                [(r.tenant_name, r.mean_r2) for r in passing_models],
                key=lambda x: x[1],
                reverse=True,
            )[:5],
        },
    }

    return report


def export_validation_report(
    validation_results: Dict[str, ExtendedValidationResult],
    report: Dict[str, Any],
    output_path: Union[str, Path, PathLike[str]],
) -> None:
    """Export validation report to JSON.

    Args:
        validation_results: Validation results by tenant
        report: Validation report summary
        output_path: Output file path
    """
    output_path = Path(output_path)

    # Convert ExtendedValidationResult to dicts
    results_dict = {}
    for tenant_name, result in validation_results.items():
        results_dict[tenant_name] = {
            "tenant_name": result.tenant_name,
            "mean_r2": float(result.mean_r2),
            "std_r2": float(result.std_r2),
            "mean_rmse": float(result.mean_rmse),
            "mean_mae": float(result.mean_mae),
            "num_folds": result.num_folds,
            "passes_r2_threshold": result.passes_r2_threshold,
            "passes_stability_check": result.passes_stability_check,
            "passes_rmse_check": result.passes_rmse_check,
            "passes_all_checks": result.passes_all_checks,
            "failure_reasons": result.failure_reasons,
            "weather_elasticity": result.weather_elasticity,
            "channel_roas": result.channel_roas,
            "fold_details": result.fold_details,
        }

    output_data = {
        "validation_report": report,
        "model_results": results_dict,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(output_data, f, indent=2)

    _LOGGER.info(f"Validation report exported to {output_path}")


def print_validation_summary(
    validation_results: Dict[str, ExtendedValidationResult],
    report: Dict[str, Any],
) -> None:
    """Print validation summary to console.

    Args:
        validation_results: Validation results by tenant
        report: Validation report
    """
    print("\n" + "=" * 80)
    print("MODEL PERFORMANCE VALIDATION REPORT")
    print("=" * 80)

    summary = report["validation_summary"]
    print(f"\nTotal Models: {summary['total_models']}")
    print(f"Passing: {summary['passing_models']} ({summary['pass_rate']:.1%})")
    print(f"Failing: {summary['failing_models']}")

    thresholds = report["thresholds"]
    print("\nValidation Thresholds:")
    print(f"  R² minimum: {thresholds['r2_min']:.2f}")
    print(f"  R² std maximum: {thresholds['r2_std_max']:.2f}")
    print(f"  RMSE max % of revenue: {thresholds['rmse_max_pct']:.1%}")
    print(f"  Minimum CV folds: {thresholds['min_folds']}")

    metrics = report["performance_metrics"]["r2_all_models"]
    print("\nPerformance (All Models):")
    print(f"  R² mean: {metrics['mean']:.3f} ± {metrics['std']:.3f}")
    print(f"  R² range: [{metrics['min']:.3f}, {metrics['max']:.3f}]")
    print(f"  R² median: {metrics['median']:.3f}")

    if report["failure_analysis"]["failure_patterns"]:
        print("\nFailure Patterns:")
        for pattern, count in report["failure_analysis"]["failure_patterns"].items():
            print(f"  {pattern}: {count} models")

    print("\nTop Performers:")
    for tenant_name, r2 in report["passing_models"]["top_performers"]:
        result = validation_results[tenant_name]
        print(f"  {tenant_name}: R²={r2:.3f}±{result.std_r2:.3f}")

    if report["failure_analysis"]["failing_model_names"]:
        print("\nFailing Models:")
        for tenant_name in report["failure_analysis"]["failing_model_names"][:10]:
            result = validation_results[tenant_name]
            print(f"  {tenant_name}: R²={result.mean_r2:.3f} - {', '.join(result.failure_reasons)}")
            if len(report["failure_analysis"]["failing_model_names"]) > 10:
                print(f"  ... and {len(report['failure_analysis']['failing_model_names']) - 10} more")
                break

    print("\n" + "=" * 80)


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Validate model performance against objective thresholds"
    )

    parser.add_argument(
        "--cv-results",
        type=Path,
        required=True,
        help="Path to cross-validation results JSON",
    )

    parser.add_argument(
        "--output",
        type=Path,
        default=Path("storage/models/validation_results.json"),
        help="Output path for validation report",
    )

    parser.add_argument(
        "--r2-threshold",
        type=float,
        default=0.50,
        help="Minimum R² threshold (default: 0.50)",
    )

    parser.add_argument(
        "--r2-std-max",
        type=float,
        default=0.15,
        help="Maximum R² standard deviation (default: 0.15)",
    )

    parser.add_argument(
        "--rmse-max-pct",
        type=float,
        default=0.20,
        help="Maximum RMSE as percentage of revenue (default: 0.20)",
    )

    parser.add_argument(
        "--min-folds",
        type=int,
        default=3,
        help="Minimum number of CV folds (default: 3)",
    )

    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress console output",
    )

    return parser.parse_args()


def main() -> int:
    """Main entry point."""
    args = parse_args()

    if not args.cv_results.exists():
        _LOGGER.error(f"CV results file not found: {args.cv_results}")
        return 1

    _LOGGER.info(f"Loading cross-validation results from {args.cv_results}")
    cv_results = load_cv_results_from_json(args.cv_results)

    if not cv_results:
        _LOGGER.error("No cross-validation results loaded")
        return 1

    _LOGGER.info(f"Loaded {len(cv_results)} model results")

    # Define validation thresholds
    thresholds = ValidationThresholds(
        r2_min=args.r2_threshold,
        r2_std_max=args.r2_std_max,
        rmse_max_pct=args.rmse_max_pct,
        min_folds=args.min_folds,
    )

    _LOGGER.info(
        f"Validating models against thresholds: "
        f"R²>={thresholds.r2_min}, std<={thresholds.r2_std_max}"
    )

    # Validate all models
    validation_results = validate_all_models(cv_results, thresholds)

    # Generate report
    report = generate_validation_report(validation_results, thresholds)

    # Export to JSON
    export_validation_report(validation_results, report, args.output)

    # Print summary
    if not args.quiet:
        print_validation_summary(validation_results, report)

    # Return exit code based on pass rate
    pass_rate = report["validation_summary"]["pass_rate"]
    if pass_rate == 1.0:
        _LOGGER.info("✅ All models passed validation")
        return 0
    elif pass_rate >= 0.8:
        _LOGGER.warning(f"⚠️  {pass_rate:.1%} models passed validation")
        return 0
    else:
        _LOGGER.error(f"❌ Only {pass_rate:.1%} models passed validation")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
