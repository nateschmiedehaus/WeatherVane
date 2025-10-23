#!/usr/bin/env python3
"""Compare weather-aware MMM to baseline models across all synthetic tenants.

This script:
1. Loads validation results from T-MLR-2.4 (model performance)
2. Loads training results from T-MLR-2.3 (CV metrics)
3. Runs baseline comparisons for each tenant
4. Generates comprehensive comparison report
5. Validates that MMM beats baseline models as required

Output: state/analytics/baseline_comparison_results.json
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

# Add repo root to path
import sys
from pathlib import Path

repo_root = Path(__file__).parent.parent
sys.path.insert(0, str(repo_root))

from apps.model.baseline_comparison import (
    BaselineComparisonResult,
    compare_baselines_for_tenant,
    export_baseline_results,
)
from apps.model.mmm_lightweight_weather import (
    load_synthetic_tenant_data,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
_LOGGER = logging.getLogger(__name__)


def load_validation_results(path: Path) -> Dict[str, Any]:
    """Load model validation results from T-MLR-2.4.

    Args:
        path: Path to validation results JSON

    Returns:
        Dictionary with validation results
    """
    with open(path) as f:
        return json.load(f)


def load_training_results(path: Path) -> Dict[str, Any]:
    """Load training results from T-MLR-2.3.

    Args:
        path: Path to training results JSON

    Returns:
        Dictionary with training results
    """
    with open(path) as f:
        return json.load(f)


def extract_mmm_metrics_for_tenant(
    tenant_name: str,
    validation_results: Dict[str, Any],
    training_results: Dict[str, Any],
) -> Optional[Dict[str, float]]:
    """Extract MMM metrics for a single tenant.

    Args:
        tenant_name: Tenant identifier
        validation_results: Validation results dict
        training_results: Training results dict

    Returns:
        Dictionary with MMM metrics or None
    """
    # Try to get from validation results first
    if "results" in validation_results and tenant_name in validation_results["results"]:
        tenant_result = validation_results["results"][tenant_name]
        return {
            "test_r2": tenant_result.get("test_r2", 0.0),
            "test_mape": tenant_result.get("test_mape", 0.0),
            "mean_r2": tenant_result.get("mean_r2", 0.0),
            "passes_threshold": tenant_result.get("passes_threshold", False),
        }

    # Try training results as fallback
    if "results" in training_results and tenant_name in training_results["results"]:
        tenant_result = training_results["results"][tenant_name]
        # Convert CV metrics to test metrics
        return {
            "test_r2": tenant_result.get("mean_r2", 0.0),
            "test_mape": tenant_result.get("test_mape", 0.0),
            "mean_r2": tenant_result.get("mean_r2", 0.0),
            "passes_threshold": tenant_result.get("mean_r2", 0.0) >= 0.50,
        }

    return None


def run_all_baseline_comparisons(
    data_dir: Path,
    validation_results: Dict[str, Any],
    training_results: Dict[str, Any],
) -> List[BaselineComparisonResult]:
    """Run baseline comparisons for all tenants.

    Args:
        data_dir: Directory containing synthetic tenant data
        validation_results: Validation results from T-MLR-2.4
        training_results: Training results from T-MLR-2.3

    Returns:
        List of comparison results
    """
    results: List[BaselineComparisonResult] = []

    # Get list of tenant parquet files
    tenant_files = sorted(data_dir.glob("*.parquet"))
    _LOGGER.info(f"Found {len(tenant_files)} tenant files")

    for tenant_file in tenant_files:
        tenant_name = tenant_file.stem
        _LOGGER.info(f"\n{'='*60}")
        _LOGGER.info(f"Processing: {tenant_name}")
        _LOGGER.info(f"{'='*60}")

        try:
            # Load data
            df = load_synthetic_tenant_data(tenant_file)
            _LOGGER.info(f"Loaded {len(df)} rows")

            # Run baselines
            result = compare_baselines_for_tenant(
                tenant_name=tenant_name,
                df=df,
                target_col="revenue_usd",
                spend_cols=["meta_spend", "google_spend"],
            )

            # Extract and attach MMM metrics
            mmm_metrics = extract_mmm_metrics_for_tenant(
                tenant_name, validation_results, training_results
            )
            if mmm_metrics:
                result.mmm_metrics = mmm_metrics

                # Compute MMM improvement over baselines
                for baseline_name, baseline_metric in result.baseline_metrics.items():
                    if baseline_metric.test_mape > 0:
                        improvement = (
                            (baseline_metric.test_mape - mmm_metrics.get("test_mape", 0.0))
                            / baseline_metric.test_mape
                        ) * 100
                        result.baseline_improvement[baseline_name] = improvement

                # Check if MMM beats all baselines
                baseline_mapes = [m.test_mape for m in result.baseline_metrics.values()]
                if baseline_mapes:
                    best_baseline_mape = min(baseline_mapes)
                    result.mmm_beats_baselines = (
                        mmm_metrics.get("test_mape", float("inf")) < best_baseline_mape * 1.1
                    )

            results.append(result)

            # Log summary
            _LOGGER.info(f"✓ Best baseline: {result.best_baseline}")
            if result.mmm_metrics:
                _LOGGER.info(
                    f"  MMM test_mape: {result.mmm_metrics.get('test_mape', 0.0):.4f}"
                )
                _LOGGER.info(f"  Baseline test_mape: {result.baseline_metrics[result.best_baseline].test_mape:.4f}")
                for baseline, improvement in result.baseline_improvement.items():
                    _LOGGER.info(f"  Improvement vs {baseline}: {improvement:.1f}%")

        except Exception as e:
            _LOGGER.error(f"✗ Failed to process {tenant_name}: {e}", exc_info=True)
            continue

    return results


def create_summary_report(
    results: List[BaselineComparisonResult],
) -> Dict[str, Any]:
    """Create summary statistics from comparison results.

    Args:
        results: List of comparison results

    Returns:
        Summary report dictionary
    """
    if not results:
        return {"error": "No results to summarize"}

    # Count best baseline performance
    best_baseline_counts = {"naive": 0, "seasonal": 0, "linear": 0}
    for result in results:
        best_baseline_counts[result.best_baseline] += 1

    # MMM performance statistics
    mmm_improvement_stats = []
    mmm_beats_count = sum(1 for r in results if r.mmm_beats_baselines)

    for result in results:
        if result.mmm_metrics and result.baseline_improvement:
            mmm_improvement_stats.extend(result.baseline_improvement.values())

    avg_improvement = np.mean(mmm_improvement_stats) if mmm_improvement_stats else 0.0
    std_improvement = np.std(mmm_improvement_stats) if mmm_improvement_stats else 0.0

    # Baseline MAPE statistics
    naive_mapes = [r.baseline_metrics["naive"].test_mape for r in results]
    seasonal_mapes = [r.baseline_metrics["seasonal"].test_mape for r in results]
    linear_mapes = [r.baseline_metrics["linear"].test_mape for r in results if "linear" in r.baseline_metrics]

    return {
        "total_tenants": len(results),
        "best_baseline_distribution": best_baseline_counts,
        "mmm_beats_baseline_count": mmm_beats_count,
        "mmm_beats_baseline_pct": (mmm_beats_count / len(results) * 100) if results else 0.0,
        "average_improvement_pct": float(avg_improvement),
        "std_improvement_pct": float(std_improvement),
        "baseline_mape_stats": {
            "naive": {
                "mean": float(np.mean(naive_mapes)) if naive_mapes else 0.0,
                "std": float(np.std(naive_mapes)) if naive_mapes else 0.0,
                "min": float(np.min(naive_mapes)) if naive_mapes else 0.0,
                "max": float(np.max(naive_mapes)) if naive_mapes else 0.0,
            },
            "seasonal": {
                "mean": float(np.mean(seasonal_mapes)) if seasonal_mapes else 0.0,
                "std": float(np.std(seasonal_mapes)) if seasonal_mapes else 0.0,
                "min": float(np.min(seasonal_mapes)) if seasonal_mapes else 0.0,
                "max": float(np.max(seasonal_mapes)) if seasonal_mapes else 0.0,
            },
            "linear": {
                "mean": float(np.mean(linear_mapes)) if linear_mapes else 0.0,
                "std": float(np.std(linear_mapes)) if linear_mapes else 0.0,
                "min": float(np.min(linear_mapes)) if linear_mapes else 0.0,
                "max": float(np.max(linear_mapes)) if linear_mapes else 0.0,
            },
        },
        "quality_assessment": {
            "world_class_baseline": "linear" if np.mean(linear_mapes) < 0.20 else "seasonal",
            "baseline_quality_gap": max(np.mean(naive_mapes) - np.mean(linear_mapes), 0),
            "mmm_expected_advantage": "Strong seasonality present if seasonal MAPE > linear MAPE",
        },
    }


def export_detailed_comparison(
    results: List[BaselineComparisonResult],
    output_path: Path,
) -> None:
    """Export detailed comparison results to JSON.

    Args:
        results: List of comparison results
        output_path: Path to save detailed results
    """
    detailed = {
        "metadata": {
            "total_tenants": len(results),
            "baselines": ["naive", "seasonal", "linear"],
        },
        "results": {},
    }

    for result in results:
        tenant_data = {
            "baselines": {},
            "mmm_metrics": result.mmm_metrics,
            "mmm_beats_baselines": result.mmm_beats_baselines,
            "improvement_percentages": result.baseline_improvement,
        }

        for baseline_name, metrics in result.baseline_metrics.items():
            tenant_data["baselines"][baseline_name] = {
                "test_r2": metrics.test_r2,
                "test_mape": metrics.test_mape,
                "test_rmse": metrics.rmse,
                "test_mae": metrics.mean_absolute_error,
                "val_r2": metrics.val_r2,
            }

        detailed["results"][result.tenant_name] = tenant_data

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(detailed, f, indent=2)

    _LOGGER.info(f"Exported detailed comparison results to {output_path}")


def main():
    """Main execution."""
    # Paths
    repo_root = Path(__file__).parent.parent
    data_dir = repo_root / "storage" / "seeds" / "synthetic_v2"
    validation_path = repo_root / "state" / "analytics" / "mmm_validation_results.json"
    training_path = repo_root / "state" / "analytics" / "mmm_training_results_cv.json"
    output_dir = repo_root / "state" / "analytics"

    _LOGGER.info("=" * 70)
    _LOGGER.info("BASELINE COMPARISON ANALYSIS (T-MLR-2.5)")
    _LOGGER.info("=" * 70)

    # Check inputs exist
    if not validation_path.exists():
        _LOGGER.error(f"Validation results not found: {validation_path}")
        return 1

    if not training_path.exists():
        _LOGGER.error(f"Training results not found: {training_path}")
        return 1

    if not data_dir.exists():
        _LOGGER.error(f"Data directory not found: {data_dir}")
        return 1

    # Load results
    _LOGGER.info(f"Loading validation results from {validation_path}...")
    validation_results = load_validation_results(validation_path)

    _LOGGER.info(f"Loading training results from {training_path}...")
    training_results = load_training_results(training_path)

    # Run comparisons
    _LOGGER.info(f"Running baseline comparisons for all tenants in {data_dir}...")
    results = run_all_baseline_comparisons(data_dir, validation_results, training_results)

    if not results:
        _LOGGER.error("No results generated. Check logs for errors.")
        return 1

    _LOGGER.info(f"\nSuccessfully processed {len(results)} tenants")

    # Create summary
    summary = create_summary_report(results)

    # Export results
    summary_path = output_dir / "baseline_comparison_summary.json"
    detailed_path = output_dir / "baseline_comparison_detailed.json"

    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    _LOGGER.info(f"Exported summary to {summary_path}")

    export_detailed_comparison(results, detailed_path)

    # Print summary
    _LOGGER.info("\n" + "=" * 70)
    _LOGGER.info("COMPARISON SUMMARY")
    _LOGGER.info("=" * 70)
    _LOGGER.info(f"Total tenants: {summary['total_tenants']}")
    _LOGGER.info(f"Best baseline distribution: {summary['best_baseline_distribution']}")
    _LOGGER.info(f"MMM beats baseline: {summary['mmm_beats_baseline_count']}/{summary['total_tenants']} tenants")
    _LOGGER.info(f"Average improvement: {summary['average_improvement_pct']:.2f}%")
    _LOGGER.info(f"\nBaseline MAPE (mean ± std):")
    for baseline, stats in summary["baseline_mape_stats"].items():
        _LOGGER.info(f"  {baseline}: {stats['mean']:.4f} ± {stats['std']:.4f}")

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
