"""Tests for forecast calibration report generation."""

import json
import pytest
from pathlib import Path
from tempfile import TemporaryDirectory

from apps.model.feedback.calibration_report import (
    calculate_calibration_metrics,
    generate_calibration_report,
    save_calibration_report,
    load_ensemble_forecasts,
    _generate_recommendations,
)


def test_calculate_calibration_metrics_perfect():
    """Test calibration metrics with perfect predictions."""
    actuals = [100.0, 110.0, 120.0]
    p10 = [95.0, 105.0, 115.0]
    p50 = [100.0, 110.0, 120.0]
    p90 = [105.0, 115.0, 125.0]

    metrics = calculate_calibration_metrics(actuals, p10, p50, p90)

    assert metrics.overall_coverage.coverage == 1.0  # All actuals within bands
    assert metrics.prediction_bias == pytest.approx(0.0, abs=1e-6)
    assert metrics.mae == pytest.approx(0.0, abs=1e-6)


def test_calculate_calibration_metrics_with_horizons():
    """Test calibration metrics with horizon stratification."""
    actuals = [100.0, 110.0, 120.0, 130.0]
    p10 = [95.0, 105.0, 115.0, 125.0]
    p50 = [100.0, 110.0, 120.0, 130.0]
    p90 = [105.0, 115.0, 125.0, 135.0]
    horizons = [1, 1, 7, 7]

    metrics = calculate_calibration_metrics(actuals, p10, p50, p90, horizons)

    assert len(metrics.coverage_by_horizon) == 2
    assert "1" in metrics.coverage_by_horizon
    assert "7" in metrics.coverage_by_horizon
    assert metrics.coverage_by_horizon["1"].coverage == 1.0
    assert metrics.coverage_by_horizon["7"].coverage == 1.0


def test_calculate_calibration_metrics_undercalibrated():
    """Test metrics when predictions are too narrow (undercautious)."""
    actuals = [100.0, 150.0, 50.0]
    p10 = [95.0, 145.0, 95.0]  # Too narrow
    p50 = [100.0, 150.0, 100.0]
    p90 = [105.0, 155.0, 105.0]

    metrics = calculate_calibration_metrics(actuals, p10, p50, p90)

    # Last actual (50) falls outside band [95, 105]
    assert metrics.overall_coverage.coverage < 1.0
    assert metrics.overall_coverage.outside > 0


def test_calculate_calibration_metrics_overcalibrated():
    """Test metrics when predictions are too wide (overcautious)."""
    actuals = [100.0, 110.0]
    p10 = [50.0, 60.0]  # Very wide
    p50 = [100.0, 110.0]
    p90 = [150.0, 160.0]

    metrics = calculate_calibration_metrics(actuals, p10, p50, p90)

    assert metrics.overall_coverage.coverage == 1.0
    assert metrics.sharpness_score > 0.3  # Wide intervals


def test_generate_recommendations_well_calibrated():
    """Test recommendations for well-calibrated forecasts."""
    # Create actuals that are mostly within the bands but not all, achieving ~82% coverage
    actuals = [100.0, 110.0, 120.0, 50.0]  # Last one slightly outside
    p10 = [95.0, 105.0, 115.0, 95.0]
    p50 = [100.0, 110.0, 120.0, 100.0]
    p90 = [105.0, 115.0, 125.0, 105.0]

    metrics = calculate_calibration_metrics(actuals, p10, p50, p90)
    recommendations, status = _generate_recommendations(metrics)

    assert status == "well_calibrated"
    assert len(recommendations) > 0


def test_generate_recommendations_undercautious():
    """Test recommendations when undercautious (coverage too low)."""
    actuals = [100.0, 200.0, 150.0]
    p10 = [95.0, 105.0, 145.0]
    p50 = [100.0, 110.0, 150.0]
    p90 = [105.0, 115.0, 155.0]

    metrics = calculate_calibration_metrics(actuals, p10, p50, p90)
    recommendations, status = _generate_recommendations(metrics)

    assert status == "undercautious"
    assert any("narrow" in r.lower() for r in recommendations)


def test_generate_recommendations_overcautious():
    """Test recommendations when overcautious (coverage too high)."""
    actuals = [100.0, 110.0]
    p10 = [0.0, 0.0]
    p50 = [100.0, 110.0]
    p90 = [500.0, 500.0]

    metrics = calculate_calibration_metrics(actuals, p10, p50, p90)
    recommendations, status = _generate_recommendations(metrics)

    assert status == "overcautious"
    assert any("conservative" in r.lower() for r in recommendations)


def test_generate_calibration_report():
    """Test complete calibration report generation."""
    actuals = [100.0, 110.0, 120.0, 130.0]
    p10 = [95.0, 105.0, 115.0, 125.0]
    p50 = [100.0, 110.0, 120.0, 130.0]
    p90 = [105.0, 115.0, 125.0, 135.0]
    horizons = [1, 1, 7, 7]

    report = generate_calibration_report(
        actuals, p10, p50, p90, horizons, diagnostics={"dataset": "test"}
    )

    assert report.calibration_status in ["well_calibrated", "undercautious", "overcautious"]
    assert len(report.recommendations) > 0
    assert report.diagnostics["dataset"] == "test"
    assert report.diagnostics["num_forecasts"] == 4
    assert report.diagnostics["num_horizons"] == 2


def test_save_calibration_report():
    """Test saving calibration report to JSON."""
    actuals = [100.0, 110.0]
    p10 = [95.0, 105.0]
    p50 = [100.0, 110.0]
    p90 = [105.0, 115.0]

    report = generate_calibration_report(actuals, p10, p50, p90)

    with TemporaryDirectory() as tmpdir:
        output_path = save_calibration_report(report, output_dir=tmpdir)

        assert output_path.exists()
        with open(output_path) as f:
            data = json.load(f)

        assert "metrics" in data
        assert "recommendations" in data
        assert "calibration_status" in data
        assert data["metrics"]["overall_coverage"]["coverage"] == 1.0


def test_load_ensemble_forecasts():
    """Test loading forecast data from ensemble metrics."""
    # Create temporary ensemble metrics file
    ensemble_data = {
        "forecasts": [
            {
                "date": "2024-01-01",
                "horizon_days": 1,
                "prediction": 100.0,
                "quantiles": {"p10": 95.0, "p50": 100.0, "p90": 105.0},
                "components": {},
            },
            {
                "date": "2024-01-08",
                "horizon_days": 7,
                "prediction": 110.0,
                "quantiles": {"p10": 105.0, "p50": 110.0, "p90": 115.0},
                "components": {},
            },
        ]
    }

    with TemporaryDirectory() as tmpdir:
        ensemble_path = Path(tmpdir) / "ensemble.json"
        with open(ensemble_path, "w") as f:
            json.dump(ensemble_data, f)

        actuals, p10, p50, p90, horizons = load_ensemble_forecasts(ensemble_path)

        assert len(actuals) == 2
        assert len(p10) == 2
        assert p10[0] == 95.0
        assert p50[0] == 100.0
        assert p90[0] == 105.0
        assert horizons[0] == 1
        assert horizons[1] == 7


def test_load_ensemble_forecasts_missing_file():
    """Test error handling for missing ensemble file."""
    with pytest.raises(FileNotFoundError):
        load_ensemble_forecasts("/nonexistent/path/ensemble.json")


def test_report_to_dict():
    """Test report serialization."""
    actuals = [100.0, 110.0]
    p10 = [95.0, 105.0]
    p50 = [100.0, 110.0]
    p90 = [105.0, 115.0]

    report = generate_calibration_report(actuals, p10, p50, p90)
    report_dict = report.to_dict()

    assert "generated_at" in report_dict
    assert "metrics" in report_dict
    assert "diagnostics" in report_dict
    assert "recommendations" in report_dict
    assert "calibration_status" in report_dict

    # Check nested structure
    metrics = report_dict["metrics"]
    assert "overall_coverage" in metrics
    assert "coverage_by_horizon" in metrics
    assert "interval_widths" in metrics
