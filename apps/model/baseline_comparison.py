"""Validate PoC model predictions on hold-out data."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Union

import numpy as np
from loguru import logger

from apps.model.baseline import evaluate_r2
from apps.model.train import train_baseline
from shared.feature_store.feature_builder import FeatureBuilder


@dataclass
class BaselineMetrics:
    """Metrics for a baseline model evaluation."""
    r2_score: float
    rmse: float
    mae: float
    mape: float
    model_name: str
    evaluation_period: Dict[str, str]


@dataclass
class BaselineComparisonResult:
    """Results from comparing multiple baseline models."""
    tenant_id: str
    best_model: str
    metrics_by_model: Dict[str, Dict[str, float]]
    comparison_period: Dict[str, str]
    passed_criteria: bool
    details: Dict[str, Any]


class NaiveBaseline:
    """Naive baseline model that predicts mean or last value."""

    def __init__(self, strategy: str = "mean"):
        """Initialize naive baseline.

        Args:
            strategy: Either 'mean' for constant mean prediction or 'last' for last value
        """
        self.strategy = strategy
        self.value = None
        self.is_fitted = False

    def fit(self, y: np.ndarray) -> None:
        """Fit the baseline model.

        Args:
            y: Training target values
        """
        if self.strategy == "mean":
            self.value = float(np.mean(y))
        elif self.strategy == "last":
            self.value = float(y[-1])
        else:
            raise ValueError(f"Unknown strategy: {self.strategy}")
        self.is_fitted = True

    def predict(self, X: Optional[np.ndarray] = None) -> np.ndarray:
        """Make predictions.

        Args:
            X: Feature matrix (ignored for naive baseline)

        Returns:
            Array of constant predictions
        """
        if not self.is_fitted:
            raise ValueError("Model must be fitted before prediction")
        if X is None:
            raise ValueError("Feature matrix X is required for prediction")
        return np.full(X.shape[0], self.value)


class SeasonalBaseline:
    """Seasonal baseline model that captures periodic patterns."""

    def __init__(self, period: int = 7):
        """Initialize seasonal baseline.

        Args:
            period: Seasonality period (e.g., 7 for weekly patterns)
        """
        self.period = period
        self.seasonal_pattern = None
        self.is_fitted = False

    def fit(self, y: np.ndarray) -> None:
        """Fit the seasonal baseline.

        Args:
            y: Training target values (should be at least period * 2 long)
        """
        if len(y) < self.period:
            raise ValueError(f"Need at least {self.period} observations for seasonal baseline")

        # Calculate seasonal pattern as mean for each position in cycle
        self.seasonal_pattern = np.array([
            np.mean(y[i::self.period]) for i in range(self.period)
        ])
        self.is_fitted = True

    def predict(self, n_periods: int) -> np.ndarray:
        """Make seasonal predictions.

        Args:
            n_periods: Number of periods to predict

        Returns:
            Array of seasonally-adjusted predictions
        """
        if not self.is_fitted:
            raise ValueError("Model must be fitted before prediction")
        repetitions = (n_periods // self.period) + 1
        predictions = np.tile(self.seasonal_pattern, repetitions)
        return predictions[:n_periods]


class LinearBaseline:
    """Linear regression baseline model."""

    def __init__(self):
        """Initialize linear baseline."""
        self.coefficients = None
        self.intercept = None
        self.is_fitted = False

    def fit(self, X: np.ndarray, y: np.ndarray) -> None:
        """Fit the linear baseline.

        Args:
            X: Feature matrix (n_samples, n_features)
            y: Target values
        """
        # Simple least squares solution
        X_with_intercept = np.column_stack([np.ones(X.shape[0]), X])
        params = np.linalg.lstsq(X_with_intercept, y, rcond=None)[0]
        self.intercept = float(params[0])
        self.coefficients = params[1:]
        self.is_fitted = True

    def predict(self, X: np.ndarray) -> np.ndarray:
        """Make linear predictions.

        Args:
            X: Feature matrix (n_samples, n_features)

        Returns:
            Array of predictions
        """
        if not self.is_fitted:
            raise ValueError("Model must be fitted before prediction")
        return X @ self.coefficients + self.intercept


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
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
        mask = y_true != 0
        mape = float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask]))) * 100 if np.sum(mask) > 0 else 0.0
    else:
        mape = float(np.mean(np.abs((y_true - y_pred) / y_true))) * 100

    return {
        "r2": float(r2),
        "rmse": rmse,
        "mae": mae,
        "mape": mape,
    }


def compare_baselines_for_tenant(
    tenant_id: str,
    training_days: int = 60,
    validation_days: int = 30,
    lake_root: Union[Path, str] = Path("storage/lake/raw"),
) -> BaselineComparisonResult:
    """Compare multiple baseline models for a tenant.

    Args:
        tenant_id: Tenant ID to evaluate
        training_days: Number of days for training
        validation_days: Number of days for validation
        lake_root: Root directory for data lake

    Returns:
        BaselineComparisonResult with comparison metrics
    """
    # Setup dates
    end = datetime.utcnow()
    validation_start = end - timedelta(days=validation_days)
    train_start = validation_start - timedelta(days=training_days)

    # Train model
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
        raise ValueError(f"No validation data for tenant {tenant_id}")

    # Get validation metrics
    model = training_result.model
    r2_score = evaluate_r2(model, validation_frame)

    metrics = compute_metrics(
        validation_frame.select(validation_frame.columns[0]).to_numpy().flatten(),
        np.full(validation_frame.height, 0.0)
    )

    return BaselineComparisonResult(
        tenant_id=tenant_id,
        best_model="training_baseline",
        metrics_by_model={
            "training_baseline": metrics,
        },
        comparison_period={
            "start": validation_start.isoformat(),
            "end": end.isoformat(),
        },
        passed_criteria=r2_score >= 0.6,
        details={
            "r2_score": r2_score,
            "training_period": {
                "start": train_start.isoformat(),
                "end": validation_start.isoformat(),
            },
        }
    )


def export_baseline_results(
    results: List[BaselineComparisonResult],
    output_path: Union[Path, str] = Path("state/analytics/baseline_comparison.json"),
) -> None:
    """Export baseline comparison results to JSON.

    Args:
        results: List of comparison results
        output_path: Where to save the results
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    data = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "results": [
            {
                "tenant_id": r.tenant_id,
                "best_model": r.best_model,
                "metrics_by_model": r.metrics_by_model,
                "comparison_period": r.comparison_period,
                "passed_criteria": r.passed_criteria,
                "details": r.details,
            }
            for r in results
        ],
    }

    output_path.write_text(json.dumps(data, indent=2))
    logger.info(f"Baseline results exported to {output_path}")


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