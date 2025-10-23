"""Train weather-aware allocation model on top of MMM baseline.

This script:
1. Loads trained MMM models with weather elasticity coefficients
2. Builds ROI curves that incorporate weather-driven demand elasticity
3. Trains allocation optimizer with weather-aware constraints
4. Validates performance against objective thresholds

The allocation model uses MMM-derived weather coefficients to adjust
spend recommendations based on forecasted weather conditions.
"""

from __future__ import annotations

import argparse
import json
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from apps.allocator.optimizer import (
    BudgetItem,
    OptimizerRequest,
    OptimizerResult,
    optimize_allocation,
)
from apps.model.mmm_lightweight_weather import (
    CrossValidationMetrics,
    TenantModelTrainer,
    WeatherAwareMMM,
    load_cv_results_from_json,
    load_synthetic_tenant_data,
    normalize_column_names,
    get_weather_columns,
    get_spend_columns,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
_LOGGER = logging.getLogger(__name__)


@dataclass
class WeatherAwareAllocationResult:
    """Result from training weather-aware allocation model."""

    tenant_id: str
    """Tenant identifier"""

    mmm_r2: float
    """MMM model R² score"""

    weather_elasticity: Dict[str, float]
    """Weather feature elasticity coefficients from MMM"""

    channel_roas: Dict[str, float]
    """Channel ROAS estimates from MMM"""

    roi_curves: Dict[str, List[Dict[str, float]]]
    """ROI curves by channel with weather adjustments"""

    allocation_result: OptimizerResult
    """Optimization result from allocator"""

    validation_metrics: Dict[str, float]
    """Validation metrics"""

    timestamp: str
    """Training timestamp (UTC)"""


@dataclass
class WeatherAllocationConfig:
    """Configuration for weather-aware allocation training."""

    # Data sources
    data_dir: Path = Path("storage/seeds/synthetic_v2")
    """Directory containing synthetic tenant data"""

    mmm_results_path: Optional[Path] = None
    """Path to pre-trained MMM results (optional)"""

    # Model parameters
    regularization_strength: float = 0.01
    """L2 regularization for MMM"""

    roi_curve_points: int = 10
    """Number of points in ROI curve"""

    max_spend_multiplier: float = 2.0
    """Maximum spend as multiple of current spend"""

    # Weather adjustment parameters
    weather_sensitivity: float = 0.15
    """Fraction of budget affected by weather (0-1)"""

    adverse_weather_reduction: float = 0.70
    """Spend reduction during adverse weather (0-1)"""

    # Validation thresholds
    min_mmm_r2: float = 0.50
    """Minimum MMM R² to proceed with allocation"""

    min_allocation_roas: float = 1.20
    """Minimum target ROAS for allocation"""

    # Output
    output_dir: Path = Path("storage/models/weather_allocation")
    """Output directory for trained models"""


def build_roi_curve_from_mmm(
    channel: str,
    mmm_roas: float,
    current_spend: float,
    max_spend: float,
    num_points: int = 10,
    saturation_factor: float = 0.5,
) -> List[Dict[str, float]]:
    """Build ROI curve from MMM ROAS estimates with saturation.

    Args:
        channel: Channel name
        mmm_roas: Estimated ROAS from MMM
        current_spend: Current spend level
        max_spend: Maximum spend level
        num_points: Number of curve points
        saturation_factor: Hill saturation parameter (0-1, lower = more saturation)

    Returns:
        List of {spend, revenue, roas} points
    """
    if max_spend <= 0:
        return []

    # Generate spend points from 0 to max_spend
    spend_points = np.linspace(0, max_spend, num_points)

    roi_curve = []
    for spend in spend_points:
        if spend == 0:
            roi_curve.append({"spend": 0.0, "revenue": 0.0, "roas": 0.0})
            continue

        # Apply saturation using diminishing returns formula
        # For a concave revenue function with decreasing ROAS, use:
        # revenue = a * spend^b where 0 < b < 1
        # This ensures d²(revenue)/d(spend)² < 0 (concave)

        # Use power law with exponent < 1 for sub-linear growth
        # Calibrate to match MMM ROAS at current_spend level
        power_exponent = 0.8  # <1 ensures diminishing returns

        # Revenue at a reference point (current_spend)
        # mmm_roas ≈ revenue / spend at current_spend
        # So revenue(current_spend) ≈ mmm_roas * current_spend
        ref_spend = max(current_spend, max_spend / 10) if current_spend > 0 else max_spend / 10
        ref_revenue = mmm_roas * ref_spend

        # Compute scaling factor to match reference point
        # revenue = scale * spend^power
        # ref_revenue = scale * ref_spend^power
        # scale = ref_revenue / (ref_spend^power)
        scale = ref_revenue / np.power(ref_spend, power_exponent)

        # Compute revenue with power law
        revenue = scale * np.power(spend, power_exponent)
        roas = revenue / spend if spend > 0 else 0.0

        roi_curve.append({
            "spend": float(spend),
            "revenue": float(revenue),
            "roas": float(roas),
        })

    return roi_curve


def adjust_roi_curve_for_weather(
    roi_curve: List[Dict[str, float]],
    weather_elasticity: float,
    weather_condition: str = "neutral",
    sensitivity: float = 0.15,
) -> List[Dict[str, float]]:
    """Adjust ROI curve based on weather elasticity.

    Args:
        roi_curve: Original ROI curve
        weather_elasticity: Weather coefficient from MMM
        weather_condition: "favorable", "neutral", or "adverse"
        sensitivity: How much weather affects revenue (0-1)

    Returns:
        Adjusted ROI curve
    """
    if not roi_curve or weather_condition == "neutral":
        return roi_curve

    # Determine adjustment factor based on weather condition
    if weather_condition == "favorable":
        # Positive weather elasticity → increase revenue
        adjustment = 1.0 + (abs(weather_elasticity) * sensitivity)
    elif weather_condition == "adverse":
        # Negative weather elasticity → decrease revenue
        adjustment = 1.0 - (abs(weather_elasticity) * sensitivity)
    else:
        adjustment = 1.0

    # Apply adjustment to revenue and roas
    adjusted_curve = []
    for point in roi_curve:
        adjusted_curve.append({
            "spend": point["spend"],
            "revenue": point["revenue"] * adjustment,
            "roas": point["roas"] * adjustment,
        })

    return adjusted_curve


def train_weather_allocation_for_tenant(
    tenant_path: Path,
    config: WeatherAllocationConfig,
    forecast_date: Optional[date] = None,
) -> WeatherAwareAllocationResult:
    """Train weather-aware allocation model for a single tenant.

    Args:
        tenant_path: Path to tenant data file
        config: Training configuration
        forecast_date: Forecast date for weather conditions

    Returns:
        WeatherAwareAllocationResult with trained model and metrics
    """
    tenant_id = tenant_path.stem
    _LOGGER.info(f"Training weather-aware allocation for tenant: {tenant_id}")

    # Step 1: Load or train MMM model
    if config.mmm_results_path and config.mmm_results_path.exists():
        _LOGGER.info(f"Loading pre-trained MMM results from {config.mmm_results_path}")
        cv_results = load_cv_results_from_json(config.mmm_results_path)
        if tenant_id not in cv_results:
            raise ValueError(f"Tenant {tenant_id} not found in MMM results")
        mmm_metrics = cv_results[tenant_id]
    else:
        _LOGGER.info("Training MMM model from scratch")
        trainer = TenantModelTrainer(
            data_dir=config.data_dir,
            regularization_strength=config.regularization_strength,
        )
        tenant_id_from_training, mmm_metrics = trainer.train_single_tenant_with_cv(
            tenant_path,
            n_folds=5,
        )

    # Validate MMM performance
    if mmm_metrics.mean_r2 < config.min_mmm_r2:
        raise ValueError(
            f"MMM R² ({mmm_metrics.mean_r2:.3f}) below threshold "
            f"({config.min_mmm_r2:.3f}). Allocation model not reliable."
        )

    _LOGGER.info(f"MMM validation passed: R² = {mmm_metrics.mean_r2:.3f}")

    # Extract weather elasticity and channel ROAS
    weather_elasticity = {
        feature: float(np.mean(values))
        for feature, values in mmm_metrics.weather_elasticity.items()
        if values
    }

    channel_roas = {
        channel: float(np.mean(values))
        for channel, values in mmm_metrics.channel_roas.items()
        if values
    }

    _LOGGER.info(f"Weather elasticity: {weather_elasticity}")
    _LOGGER.info(f"Channel ROAS: {channel_roas}")

    # Step 2: Load tenant data for current spend levels
    df = load_synthetic_tenant_data(tenant_path)
    df = normalize_column_names(df)

    spend_cols = get_spend_columns(df)
    if not spend_cols:
        raise ValueError(f"No spend columns found in tenant data")

    # Calculate current average spend by channel
    current_spend = df[spend_cols].mean().to_dict()

    # Step 3: Build ROI curves from MMM estimates
    roi_curves = {}
    for channel in spend_cols:
        # Extract channel name (remove _spend suffix)
        channel_name = channel.replace("_spend", "")

        # Get MMM ROAS estimate
        roas = channel_roas.get(channel_name, 1.0)
        curr_spend = current_spend.get(channel, 0.0)
        max_spend = curr_spend * config.max_spend_multiplier

        # Build base ROI curve
        curve = build_roi_curve_from_mmm(
            channel=channel_name,
            mmm_roas=roas,
            current_spend=curr_spend,
            max_spend=max_spend,
            num_points=config.roi_curve_points,
        )

        # Adjust for weather conditions
        # For demo purposes, use average temperature elasticity
        temp_elasticity = weather_elasticity.get("temperature", 0.0)

        # Assume neutral weather for baseline allocation
        # (In production, this would use actual weather forecast)
        adjusted_curve = adjust_roi_curve_for_weather(
            curve,
            temp_elasticity,
            weather_condition="neutral",
            sensitivity=config.weather_sensitivity,
        )

        roi_curves[channel_name] = adjusted_curve

    # Step 4: Build budget items for optimizer
    total_budget = sum(current_spend.values())

    budget_items = []
    for channel in spend_cols:
        channel_name = channel.replace("_spend", "")
        curr_spend = current_spend.get(channel, 0.0)
        max_spend = curr_spend * config.max_spend_multiplier

        roas = channel_roas.get(channel_name, 1.0)

        item = BudgetItem(
            id=channel_name,
            name=channel_name.replace("_", " ").title(),
            min_spend=0.0,
            max_spend=max_spend,
            current_spend=curr_spend,
            expected_roas=roas,
            roi_curve=roi_curves[channel_name],
        )
        budget_items.append(item)

    # Step 5: Run optimization
    optimizer_request = OptimizerRequest(
        total_budget=total_budget,
        items=budget_items,
        name=f"{tenant_id}_weather_allocation",
        roas_floor=config.min_allocation_roas,
    )

    _LOGGER.info(
        f"Running optimization: budget={total_budget:.2f}, "
        f"items={len(budget_items)}, roas_floor={config.min_allocation_roas}"
    )

    allocation_result = optimize_allocation(optimizer_request)

    _LOGGER.info(
        f"Optimization complete: "
        f"revenue={allocation_result.total_revenue:.2f}, "
        f"profit={allocation_result.profit:.2f}, "
        f"status={allocation_result.diagnostics.get('status')}"
    )

    # Step 6: Compute validation metrics
    total_allocated = sum(allocation_result.spends.values())
    avg_roas = (
        allocation_result.total_revenue / total_allocated
        if total_allocated > 0
        else 0.0
    )

    validation_metrics = {
        "mmm_r2": mmm_metrics.mean_r2,
        "mmm_r2_std": mmm_metrics.std_r2,
        "total_budget": total_budget,
        "total_allocated": total_allocated,
        "total_revenue": allocation_result.total_revenue,
        "total_profit": allocation_result.profit,
        "average_roas": avg_roas,
        "meets_roas_threshold": avg_roas >= config.min_allocation_roas,
        "num_channels": len(budget_items),
        "weather_sensitivity": config.weather_sensitivity,
    }

    timestamp = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

    return WeatherAwareAllocationResult(
        tenant_id=tenant_id,
        mmm_r2=mmm_metrics.mean_r2,
        weather_elasticity=weather_elasticity,
        channel_roas=channel_roas,
        roi_curves=roi_curves,
        allocation_result=allocation_result,
        validation_metrics=validation_metrics,
        timestamp=timestamp,
    )


def export_allocation_model(
    result: WeatherAwareAllocationResult,
    output_dir: Path,
) -> Dict[str, Path]:
    """Export trained allocation model to disk.

    Args:
        result: Training result
        output_dir: Output directory

    Returns:
        Dictionary of exported file paths
    """
    tenant_dir = output_dir / result.tenant_id
    tenant_dir.mkdir(parents=True, exist_ok=True)

    # Export metadata
    metadata = {
        "tenant_id": result.tenant_id,
        "timestamp": result.timestamp,
        "mmm_r2": result.mmm_r2,
        "weather_elasticity": result.weather_elasticity,
        "channel_roas": result.channel_roas,
        "validation_metrics": result.validation_metrics,
        "allocation_diagnostics": result.allocation_result.diagnostics,
        "optimal_spends": result.allocation_result.spends,
        "total_revenue": result.allocation_result.total_revenue,
        "total_profit": result.allocation_result.profit,
    }

    metadata_path = tenant_dir / "allocation_metadata.json"
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)

    # Export ROI curves
    roi_curves_path = tenant_dir / "roi_curves.json"
    with open(roi_curves_path, "w") as f:
        json.dump(result.roi_curves, f, indent=2)

    _LOGGER.info(f"Exported model for {result.tenant_id} to {tenant_dir}")

    return {
        "metadata": metadata_path,
        "roi_curves": roi_curves_path,
    }


def train_all_tenants(
    config: WeatherAllocationConfig,
) -> Dict[str, WeatherAwareAllocationResult]:
    """Train weather-aware allocation models for all tenants.

    Args:
        config: Training configuration

    Returns:
        Dictionary mapping tenant IDs to results
    """
    tenant_files = sorted(config.data_dir.glob("*.parquet"))
    if not tenant_files:
        raise ValueError(f"No parquet files found in {config.data_dir}")

    _LOGGER.info(f"Training allocation models for {len(tenant_files)} tenants")

    results = {}
    failed = []

    for tenant_path in tenant_files:
        try:
            result = train_weather_allocation_for_tenant(tenant_path, config)
            results[result.tenant_id] = result

            # Export model
            export_allocation_model(result, config.output_dir)

        except Exception as e:
            _LOGGER.error(f"Failed to train {tenant_path.stem}: {e}", exc_info=True)
            failed.append((tenant_path.stem, str(e)))

    # Export aggregate summary
    summary = compute_aggregate_summary(results)
    summary_path = config.output_dir / "aggregate_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)

    _LOGGER.info(
        f"Training complete: {len(results)}/{len(tenant_files)} succeeded, "
        f"{len(failed)} failed"
    )

    if failed:
        _LOGGER.warning(f"Failed tenants: {[name for name, _ in failed]}")

    return results


def compute_aggregate_summary(
    results: Dict[str, WeatherAwareAllocationResult],
) -> Dict[str, Any]:
    """Compute aggregate summary statistics across all tenants.

    Args:
        results: Training results by tenant

    Returns:
        Summary statistics dictionary
    """
    if not results:
        return {}

    mmm_r2_scores = [r.mmm_r2 for r in results.values()]
    avg_roas_scores = [
        r.validation_metrics["average_roas"] for r in results.values()
    ]
    profit_values = [r.allocation_result.profit for r in results.values()]

    passing_roas = [
        r for r in results.values()
        if r.validation_metrics.get("meets_roas_threshold", False)
    ]

    summary = {
        "timestamp": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "num_tenants": len(results),
        "num_passing_roas_threshold": len(passing_roas),
        "pass_rate": len(passing_roas) / len(results),
        "mmm_r2": {
            "mean": float(np.mean(mmm_r2_scores)),
            "std": float(np.std(mmm_r2_scores)),
            "min": float(np.min(mmm_r2_scores)),
            "max": float(np.max(mmm_r2_scores)),
        },
        "average_roas": {
            "mean": float(np.mean(avg_roas_scores)),
            "std": float(np.std(avg_roas_scores)),
            "min": float(np.min(avg_roas_scores)),
            "max": float(np.max(avg_roas_scores)),
        },
        "profit": {
            "mean": float(np.mean(profit_values)),
            "std": float(np.std(profit_values)),
            "min": float(np.min(profit_values)),
            "max": float(np.max(profit_values)),
            "total": float(np.sum(profit_values)),
        },
        "passing_tenants": sorted([r.tenant_id for r in passing_roas]),
        "all_tenants": sorted(results.keys()),
    }

    return summary


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Train weather-aware allocation model on top of MMM baseline"
    )

    parser.add_argument(
        "--tenant",
        help="Train single tenant (tenant ID or path to parquet file)",
    )

    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("storage/seeds/synthetic_v2"),
        help="Directory containing synthetic tenant data",
    )

    parser.add_argument(
        "--mmm-results",
        type=Path,
        help="Path to pre-trained MMM results JSON",
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("storage/models/weather_allocation"),
        help="Output directory for trained models",
    )

    parser.add_argument(
        "--regularization",
        type=float,
        default=0.01,
        help="L2 regularization strength for MMM",
    )

    parser.add_argument(
        "--weather-sensitivity",
        type=float,
        default=0.15,
        help="Fraction of budget affected by weather (0-1)",
    )

    parser.add_argument(
        "--min-mmm-r2",
        type=float,
        default=0.50,
        help="Minimum MMM R² threshold",
    )

    parser.add_argument(
        "--min-roas",
        type=float,
        default=1.20,
        help="Minimum target ROAS for allocation",
    )

    return parser.parse_args()


def main() -> None:
    """Main entry point."""
    args = parse_args()

    config = WeatherAllocationConfig(
        data_dir=args.data_dir,
        mmm_results_path=args.mmm_results,
        output_dir=args.output_dir,
        regularization_strength=args.regularization,
        weather_sensitivity=args.weather_sensitivity,
        min_mmm_r2=args.min_mmm_r2,
        min_allocation_roas=args.min_roas,
    )

    if args.tenant:
        # Train single tenant
        tenant_path = Path(args.tenant)
        if not tenant_path.exists():
            # Try finding in data_dir
            tenant_path = config.data_dir / f"{args.tenant}.parquet"

        if not tenant_path.exists():
            raise ValueError(f"Tenant file not found: {tenant_path}")

        result = train_weather_allocation_for_tenant(tenant_path, config)
        export_allocation_model(result, config.output_dir)

        _LOGGER.info(f"Training complete for {result.tenant_id}")
        _LOGGER.info(f"MMM R²: {result.mmm_r2:.3f}")
        _LOGGER.info(f"Average ROAS: {result.validation_metrics['average_roas']:.3f}")
        _LOGGER.info(f"Total profit: {result.allocation_result.profit:.2f}")

    else:
        # Train all tenants
        results = train_all_tenants(config)

        _LOGGER.info(f"Trained {len(results)} tenants successfully")


if __name__ == "__main__":
    main()
