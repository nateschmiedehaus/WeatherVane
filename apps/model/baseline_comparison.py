"""Validate PoC model predictions on hold-out data."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any

import numpy as np
import polars as pl
from loguru import logger

from apps.model.baseline import evaluate_r2
from apps.model.train import train_baseline
from shared.feature_store.feature_builder import FeatureBuilder


@dataclass
class ValidationResult:
    """Results of model validation on synthetic tenants."""
    tenant_id: str
    weather_effect: str  # 'strong', 'moderate', 'weak', 'none'
    r2_score: float
    validation_period: Dict[str, str]  # start/end dates
    validation_rows: int
    passed_criteria: bool
    details: Dict[str, Any]


def validate_tenant_predictions(
    tenant_id: str,
    training_days: int = 60,
    validation_days: int = 30,
    lake_root: Path | str = Path("storage/lake/raw"),
    r2_threshold: float = 0.6,
) -> ValidationResult:
    """Validate model predictions for a single tenant.

    Args:
        tenant_id: Tenant ID to validate
        training_days: Number of days to use for training
        validation_days: Number of days to hold out for validation
        lake_root: Root directory for data lake
        r2_threshold: Minimum R² score required on validation set

    Returns:
        ValidationResult with validation metrics and pass/fail status
    """
    # Setup dates for training and validation windows
    end = datetime.utcnow()
    validation_start = end - timedelta(days=validation_days)
    train_start = validation_start - timedelta(days=training_days)

    # Train model on initial period
    training_result = train_baseline(
        tenant_id=tenant_id,
        start=train_start,
        end=validation_start,
        lake_root=lake_root,
    )

    # Load validation data
    builder = FeatureBuilder(lake_root=lake_root)
    validation_matrix = builder.build(tenant_id, validation_start, end)
    validation_frame = validation_matrix.observed_frame.sort("date")

    if validation_frame.is_empty():
        raise ValueError(f"No validation data available for tenant {tenant_id}")

    # Get model predictions and calculate R²
    model = training_result.model
    r2_score = evaluate_r2(model, validation_frame)
    weather_effect = training_result.metadata["weather_fit"]["classification"]

    # Determine if validation criteria are met
    criteria_passed = False

    # Tenant-specific criteria
    if "extreme" in tenant_id.lower() or "high" in tenant_id.lower():
        criteria_passed = (
            weather_effect in ("strong", "moderate")
            and r2_score >= r2_threshold
        )
    elif "none" in tenant_id.lower():
        criteria_passed = (
            weather_effect == "none"
            and r2_score >= r2_threshold
        )
    else:
        criteria_passed = r2_score >= r2_threshold

    return ValidationResult(
        tenant_id=tenant_id,
        weather_effect=weather_effect,
        r2_score=r2_score,
        validation_period={
            "start": validation_start.isoformat(),
            "end": end.isoformat(),
        },
        validation_rows=validation_frame.height,
        passed_criteria=criteria_passed,
        details={
            "training_period": {
                "start": train_start.isoformat(),
                "end": validation_start.isoformat(),
            },
            "training_rows": training_result.metadata["data"]["train_rows"],
            "weather_fit_score": training_result.metadata["weather_fit"]["score"],
            "weather_features": training_result.metadata["features"],
            "training_r2": training_result.metadata["training"]["r2"],
        }
    )


def validate_all_synthetic_tenants(
    lake_root: Path | str = Path("storage/lake/raw"),
    output_path: Path | str = Path("state/analytics/baseline_comparison_detailed.json"),
) -> Dict[str, Any]:
    """Validate model predictions across all synthetic tenants.

    Runs validation for each tenant type and generates a summary report.

    Args:
        lake_root: Root directory for data lake
        output_path: Where to save detailed validation results

    Returns:
        Dictionary with validation summary statistics
    """
    results: List[ValidationResult] = []

    # Find all synthetic tenants
    builder = FeatureBuilder(lake_root=lake_root)
    tenant_ids = builder.list_tenants()
    synthetic_tenants = [t for t in tenant_ids if "synthetic" in t.lower()]

    for tenant_id in synthetic_tenants:
        try:
            result = validate_tenant_predictions(tenant_id, lake_root=lake_root)
            results.append(result)
        except Exception as e:
            logger.warning(f"Validation failed for tenant {tenant_id}: {e}")
            continue

    # Generate summary statistics
    total_tenants = len(results)
    passed_validations = len([r for r in results if r.passed_criteria])

    high_extreme_tenants = [r for r in results
        if "extreme" in r.tenant_id.lower() or "high" in r.tenant_id.lower()]
    none_tenants = [r for r in results if "none" in r.tenant_id.lower()]

    high_extreme_passed = len([r for r in high_extreme_tenants
        if r.weather_effect in ("strong", "moderate") and r.passed_criteria])
    none_passed = len([r for r in none_tenants
        if r.weather_effect == "none" and r.passed_criteria])

    summary = {
        "timestamp_utc": datetime.utcnow().isoformat() + "Z",
        "total_tenants": total_tenants,
        "passed_validations": passed_validations,
        "high_extreme_tenants": {
            "total": len(high_extreme_tenants),
            "passed": high_extreme_passed,
        },
        "none_tenants": {
            "total": len(none_tenants),
            "passed": none_passed,
        },
        "average_r2": sum(r.r2_score for r in results) / total_tenants if results else 0.0,
        "tenant_results": [
            {
                "tenant_id": r.tenant_id,
                "weather_effect": r.weather_effect,
                "r2_score": r.r2_score,
                "validation_period": r.validation_period,
                "validation_rows": r.validation_rows,
                "passed_criteria": r.passed_criteria,
                "details": r.details,
            }
            for r in results
        ],
    }

    # Save detailed results
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2))

    logger.info(
        f"Validation complete: {passed_validations}/{total_tenants} tenants passed "
        f"(high/extreme: {high_extreme_passed}/{len(high_extreme_tenants)}, "
        f"none: {none_passed}/{len(none_tenants)})"
    )

    return summary


def _compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    """Compute regression metrics.

    Args:
        y_true: Ground truth values
        y_pred: Predicted values

    Returns:
        Dictionary with R², RMSE, MAE, MAPE metrics
    """
    # R² Score
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

    # RMSE
    rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))

    # MAE
    mae = float(np.mean(np.abs(y_true - y_pred)))

    # MAPE - only if y_true doesn't contain zeros
    if np.any(y_true == 0):
        # Use MAPE only on non-zero values
        mask = y_true != 0
        mape = float(mean_absolute_percentage_error(
            y_true[mask], y_pred[mask]
        )) if np.sum(mask) > 0 else 0.0
    else:
        mape = float(mean_absolute_percentage_error(y_true, y_pred))

    return {
        "r2": float(r2),
        "rmse": rmse,
        "mae": mae,
        "mape": mape,
    }


def mean_absolute_percentage_error(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Calculate mean absolute percentage error (MAPE)."""
    return float(np.mean(np.abs((y_true - y_pred) / y_true))) * 100.0