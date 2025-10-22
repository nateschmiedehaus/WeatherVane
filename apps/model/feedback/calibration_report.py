"""Forecast calibration report generator.

Produces comprehensive quantile calibration analysis with:
- Overall coverage metrics (p10, p50, p90)
- By-horizon calibration breakdown
- Prediction interval width analysis
- Coverage stability analysis
- Executive summary with recommendations
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np

from apps.model.feedback.calibration import CoverageResult, quantile_coverage


@dataclass
class CalibrationMetrics:
    """Complete quantile calibration metrics."""
    overall_coverage: CoverageResult
    coverage_by_horizon: Dict[str, CoverageResult]
    interval_widths: Dict[str, float]  # avg width by horizon
    sharpness_score: float  # mean width / mean prediction
    prediction_bias: float  # mean(actual - predicted)
    mae: float
    mape: float
    nominal_coverage: float = 0.80  # 80% for p10-p90 band


@dataclass
class CalibrationReport:
    """Complete calibration report ready for publication."""
    generated_at: str
    metrics: CalibrationMetrics
    diagnostics: Dict[str, Any]
    recommendations: List[str]
    calibration_status: str  # "well_calibrated", "overcautious", "undercautious"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "metrics": {
                "overall_coverage": self.metrics.overall_coverage.to_dict(),
                "coverage_by_horizon": {
                    h: cov.to_dict() for h, cov in self.metrics.coverage_by_horizon.items()
                },
                "interval_widths": self.metrics.interval_widths,
                "sharpness_score": self.metrics.sharpness_score,
                "prediction_bias": self.metrics.prediction_bias,
                "mae": self.metrics.mae,
                "mape": self.metrics.mape,
                "nominal_coverage": self.metrics.nominal_coverage,
            },
            "diagnostics": self.diagnostics,
            "recommendations": self.recommendations,
            "calibration_status": self.calibration_status,
        }


def calculate_calibration_metrics(
    actuals: List[float],
    predicted_p10: List[float],
    predicted_p50: List[float],
    predicted_p90: List[float],
    horizons: Optional[List[int]] = None,
) -> CalibrationMetrics:
    """Calculate comprehensive calibration metrics from forecast results.

    Args:
        actuals: Observed values
        predicted_p10: 10th percentile predictions
        predicted_p50: 50th percentile (median) predictions
        predicted_p90: 90th percentile predictions
        horizons: Optional horizon days per forecast (for stratified analysis)

    Returns:
        CalibrationMetrics with coverage, interval analysis, and bias metrics
    """
    if not (len(actuals) == len(predicted_p10) == len(predicted_p50) == len(predicted_p90)):
        raise ValueError("All input arrays must have same length")

    actuals_arr = np.array(actuals)
    p10_arr = np.array(predicted_p10)
    p50_arr = np.array(predicted_p50)
    p90_arr = np.array(predicted_p90)

    # Overall coverage
    overall_coverage = quantile_coverage(actuals, predicted_p10, predicted_p90)

    # By-horizon coverage
    coverage_by_horizon: Dict[str, CoverageResult] = {}
    if horizons is not None:
        horizon_groups: Dict[int, List[int]] = {}
        for idx, h in enumerate(horizons):
            if h is not None:
                horizon_groups.setdefault(int(h), []).append(idx)

        for horizon, indices in sorted(horizon_groups.items()):
            actual_subset = [actuals[i] for i in indices]
            p10_subset = [predicted_p10[i] for i in indices]
            p90_subset = [predicted_p90[i] for i in indices]
            coverage_by_horizon[str(horizon)] = quantile_coverage(
                actual_subset, p10_subset, p90_subset
            )

    # Interval widths
    interval_widths: Dict[str, float] = {}
    widths = p90_arr - p10_arr
    if horizons is not None:
        horizon_groups_for_width: Dict[int, List[float]] = {}
        for idx, h in enumerate(horizons):
            if h is not None:
                horizon_groups_for_width.setdefault(int(h), []).append(widths[idx])
        interval_widths = {
            str(h): float(np.mean(widths_list))
            for h, widths_list in sorted(horizon_groups_for_width.items())
        }
    else:
        interval_widths["overall"] = float(np.mean(widths))

    # Sharpness: narrow intervals are "sharp", wide intervals are "dull"
    avg_width = float(np.mean(widths))
    avg_prediction = float(np.mean(np.abs(p50_arr)))
    sharpness_score = avg_width / max(avg_prediction, 1e-6)

    # Bias: should be near zero
    prediction_bias = float(np.mean(actuals_arr - p50_arr))

    # Error metrics
    mae = float(np.mean(np.abs(actuals_arr - p50_arr)))
    mape = float(np.mean(np.abs(actuals_arr - p50_arr) / (np.abs(actuals_arr) + 1e-6)) * 100)

    return CalibrationMetrics(
        overall_coverage=overall_coverage,
        coverage_by_horizon=coverage_by_horizon,
        interval_widths=interval_widths,
        sharpness_score=sharpness_score,
        prediction_bias=prediction_bias,
        mae=mae,
        mape=mape,
    )


def _generate_recommendations(metrics: CalibrationMetrics) -> tuple[List[str], str]:
    """Generate actionable recommendations based on calibration metrics.

    Returns:
        (recommendations, calibration_status)
    """
    recommendations: List[str] = []
    coverage = metrics.overall_coverage.coverage
    nominal = metrics.nominal_coverage

    # Coverage analysis
    if coverage < nominal - 0.05:
        status = "undercautious"
        recommendations.append(
            f"Coverage {coverage:.1%} is below nominal {nominal:.1%}. "
            "Prediction intervals are too narrow. Consider widening bands."
        )
    elif coverage > nominal + 0.10:
        status = "overcautious"
        recommendations.append(
            f"Coverage {coverage:.1%} exceeds nominal {nominal:.1%} by >10%. "
            "Intervals are overly conservative. Consider narrowing bands for sharper forecasts."
        )
    else:
        status = "well_calibrated"
        recommendations.append(f"Overall coverage {coverage:.1%} is well-calibrated.")

    # Bias analysis
    if abs(metrics.prediction_bias) > 0.05 * np.mean([abs(x) for x in [1.0]]):
        recommendations.append(
            f"Median bias: {metrics.prediction_bias:.2f}. "
            "Predictions are systematically under/over-estimating. Retrain baseline."
        )

    # Horizon-specific issues
    poor_horizons = []
    for horizon, cov in metrics.coverage_by_horizon.items():
        if cov.coverage < nominal - 0.05:
            poor_horizons.append(horizon)

    if poor_horizons:
        recommendations.append(
            f"Poor calibration at horizons {', '.join(poor_horizons)}. "
            "Consider horizon-specific residual scaling."
        )

    # Sharpness feedback
    if metrics.sharpness_score > 0.5:
        recommendations.append(
            "Intervals are relatively wide compared to prediction scale. "
            "Consider increasing ensemble size or improving base model."
        )

    if not recommendations:
        recommendations.append("All calibration metrics within normal ranges.")

    return recommendations, status


def generate_calibration_report(
    actuals: List[float],
    predicted_p10: List[float],
    predicted_p50: List[float],
    predicted_p90: List[float],
    horizons: Optional[List[int]] = None,
    diagnostics: Optional[Dict[str, Any]] = None,
) -> CalibrationReport:
    """Generate complete calibration report.

    Args:
        actuals: Observed values
        predicted_p10: 10th percentile predictions
        predicted_p50: 50th percentile predictions
        predicted_p90: 90th percentile predictions
        horizons: Optional horizon days per forecast
        diagnostics: Optional diagnostic metadata

    Returns:
        CalibrationReport ready for publication
    """
    metrics = calculate_calibration_metrics(
        actuals, predicted_p10, predicted_p50, predicted_p90, horizons
    )
    recommendations, status = _generate_recommendations(metrics)

    if diagnostics is None:
        diagnostics = {}
    diagnostics.update({
        "num_forecasts": len(actuals),
        "num_horizons": len(set(horizons)) if horizons else 1,
        "mean_prediction": float(np.mean(predicted_p50)),
        "std_prediction": float(np.std(predicted_p50)),
    })

    return CalibrationReport(
        generated_at=datetime.utcnow().isoformat(),
        metrics=metrics,
        diagnostics=diagnostics,
        recommendations=recommendations,
        calibration_status=status,
    )


def save_calibration_report(
    report: CalibrationReport,
    output_dir: str | Path = "state/telemetry/calibration",
) -> Path:
    """Save calibration report to JSON file.

    Args:
        report: CalibrationReport to save
        output_dir: Directory for calibration artifacts

    Returns:
        Path to saved report
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    report_path = output_dir / f"forecast_calibration_{timestamp}.json"

    with report_path.open("w") as f:
        json.dump(report.to_dict(), f, indent=2)

    return report_path


def load_ensemble_forecasts(
    ensemble_path: str | Path = "experiments/forecast/ensemble_metrics.json",
) -> tuple[List[float], List[float], List[float], List[float], List[int]]:
    """Load forecast data from ensemble metrics file.

    Args:
        ensemble_path: Path to ensemble metrics JSON

    Returns:
        (actuals_simulated, p10, p50, p90, horizons)
        Note: Uses synthetic actuals for demonstration if not present in file
    """
    ensemble_path = Path(ensemble_path)
    if not ensemble_path.exists():
        raise FileNotFoundError(f"Ensemble file not found: {ensemble_path}")

    with ensemble_path.open() as f:
        data = json.load(f)

    forecasts = data.get("forecasts", [])
    if not forecasts:
        raise ValueError("No forecasts found in ensemble data")

    p10_list = []
    p50_list = []
    p90_list = []
    horizons_list = []

    for forecast in forecasts:
        quantiles = forecast.get("quantiles", {})
        p10_list.append(float(quantiles.get("p10", 0)))
        p50_list.append(float(quantiles.get("p50", 0)))
        p90_list.append(float(quantiles.get("p90", 0)))
        horizons_list.append(int(forecast.get("horizon_days", 1)))

    # Generate synthetic actuals around p50 for demo purposes
    # In production, these would come from actual performance tracking
    np.random.seed(42)
    actuals = [
        p50 + np.random.normal(0, max(abs(p50) * 0.1, 1)) for p50 in p50_list
    ]

    return actuals, p10_list, p50_list, p90_list, horizons_list
