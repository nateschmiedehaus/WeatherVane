"""Tests for model validation alignment with critic requirements.

This test suite validates the T-MLR critic requirements for modeling:
1. ModelingReality_v2 critic - validates R² > 0.50 and RMSE < 20%
2. Academic rigor critic - validates test coverage and methods
3. Quality metrics for ML tasks
"""

import pytest
from pathlib import Path
from dataclasses import asdict

from apps.model.mmm_lightweight_weather import CrossValidationMetrics
from apps.model.validate_model_performance import (
    ValidationThresholds,
    validate_model_with_extended_checks,
)

# Test fixtures
@pytest.fixture
def mlr_thresholds() -> ValidationThresholds:
    """Create validation thresholds matching T-MLR requirements."""
    return ValidationThresholds(
        r2_min=0.50,  # Required by ModelingReality_v2 critic
        r2_std_max=0.15,  # Required for stability
        rmse_max_pct=0.20,  # Required by ModelingReality_v2 critic
        min_folds=3,  # Required by AcademicRigor critic
    )

@pytest.fixture
def strong_cv_metrics() -> CrossValidationMetrics:
    """Create CV metrics that strongly pass all critic thresholds."""
    return CrossValidationMetrics(
        model_name="strong_metrics",
        fold_r2_scores=[0.75, 0.78, 0.76, 0.77, 0.74],  # Well above 0.50
        fold_rmse_scores=[90.0, 92.0, 91.0, 89.0, 93.0],  # Low RMSE
        fold_mae_scores=[70.0, 72.0, 71.0, 69.0, 73.0],
        mean_r2=0.76,  # Strong R²
        std_r2=0.015,  # Very stable
        mean_rmse=91.0,
        mean_mae=71.0,
        weather_elasticity={
            "temperature": [0.15, 0.16, 0.14, 0.15, 0.15],
            "precipitation": [-0.08, -0.09, -0.07, -0.08, -0.08],
        },
        channel_roas={
            "meta": [2.5, 2.6, 2.4, 2.5, 2.5],
            "google": [1.8, 1.9, 1.7, 1.8, 1.8],
        },
        num_folds=5,
        feature_names=["meta_spend", "google_spend", "temperature"],
        fold_details=[
            {
                "fold": i,
                "train_size": 100,
                "test_size": 25,
                "feature_importance": {"temperature": 0.3, "spend": 0.7},
            }
            for i in range(5)
        ],
    )

@pytest.fixture
def borderline_cv_metrics() -> CrossValidationMetrics:
    """Create CV metrics that barely pass critic thresholds."""
    return CrossValidationMetrics(
        model_name="borderline_metrics",
        fold_r2_scores=[0.51, 0.49, 0.50, 0.52, 0.48],  # Around 0.50
        fold_rmse_scores=[115.0, 120.0, 118.0, 117.0, 119.0],  # Higher RMSE
        fold_mae_scores=[90.0, 95.0, 93.0, 92.0, 94.0],
        mean_r2=0.50,  # At threshold
        std_r2=0.015,  # Still stable
        mean_rmse=117.8,
        mean_mae=92.8,
        weather_elasticity={},
        channel_roas={},
        num_folds=5,
        feature_names=[],
        fold_details=[],
    )

def test_strong_model_passes_all_critics(strong_cv_metrics, mlr_thresholds):
    """Test that strong model passes all critic requirements."""
    result = validate_model_with_extended_checks(
        "strong_metrics",
        strong_cv_metrics,
        mlr_thresholds,
    )

    assert result.passes_r2_threshold  # ModelingReality_v2 requirement
    assert result.passes_stability_check  # AcademicRigor requirement
    assert result.mean_r2 >= 0.70  # Well above threshold
    assert len(result.failure_reasons) == 0  # No critic failures

def test_borderline_model_barely_passes_critics(borderline_cv_metrics, mlr_thresholds):
    """Test that borderline model just barely passes critics."""
    result = validate_model_with_extended_checks(
        "borderline_metrics",
        borderline_cv_metrics,
        mlr_thresholds,
    )

    assert result.passes_r2_threshold  # >= 0.50
    assert result.passes_stability_check  # std < 0.15
    assert result.mean_r2 == pytest.approx(0.50)  # At threshold
    assert len(result.failure_reasons) == 0  # Still passes

def test_insufficient_folds_fails_academic_rigor(strong_cv_metrics, mlr_thresholds):
    """Test that model fails academic rigor with insufficient folds."""
    metrics = CrossValidationMetrics(
        **{
            **asdict(strong_cv_metrics),
            "fold_r2_scores": [0.75, 0.78],
            "fold_rmse_scores": [90.0, 92.0],
            "fold_mae_scores": [70.0, 72.0],
            "num_folds": 2,  # Below min_folds requirement
        }
    )

    result = validate_model_with_extended_checks(
        "insufficient_folds",
        metrics,
        mlr_thresholds,
    )

    assert not result.passes_all_checks
    assert any("folds" in reason for reason in result.failure_reasons)

def test_unstable_model_fails_academic_rigor(strong_cv_metrics, mlr_thresholds):
    """Test that model with high variance fails academic rigor."""
    metrics = CrossValidationMetrics(
        **{
            **asdict(strong_cv_metrics),
            "fold_r2_scores": [0.95, 0.35, 0.90, 0.40, 0.85],  # High variance
            "mean_r2": 0.69,  # Good mean but unstable
            "std_r2": 0.28,  # Above threshold
        }
    )

    result = validate_model_with_extended_checks(
        "unstable_model",
        metrics,
        mlr_thresholds,
    )

    assert not result.passes_stability_check
    assert any("stability" in reason.lower() for reason in result.failure_reasons)

def test_high_rmse_fails_modeling_reality(strong_cv_metrics, mlr_thresholds):
    """Test that model fails ModelingReality_v2 with high RMSE."""
    metrics = CrossValidationMetrics(
        **{
            **asdict(strong_cv_metrics),
            "fold_rmse_scores": [250.0, 245.0, 255.0, 248.0, 252.0],  # High RMSE
            "mean_rmse": 250.0,
        }
    )

    result = validate_model_with_extended_checks(
        "high_rmse",
        metrics,
        mlr_thresholds,
        mean_revenue=1000.0,  # RMSE is 25% of mean
    )

    assert not result.passes_rmse_check
    assert any("RMSE" in reason for reason in result.failure_reasons)

def test_r2_below_threshold_fails_modeling_reality(strong_cv_metrics, mlr_thresholds):
    """Test that model fails ModelingReality_v2 with R² below 0.50."""
    metrics = CrossValidationMetrics(
        **{
            **asdict(strong_cv_metrics),
            "fold_r2_scores": [0.45, 0.48, 0.46, 0.47, 0.44],
            "mean_r2": 0.46,
            "std_r2": 0.015,  # Still stable
        }
    )

    result = validate_model_with_extended_checks(
        "low_r2",
        metrics,
        mlr_thresholds,
    )

    assert not result.passes_r2_threshold
    assert any("R²" in reason for reason in result.failure_reasons)

def test_validation_report_includes_critic_thresholds(strong_cv_metrics, mlr_thresholds, tmp_path):
    """Test that validation report documents critic threshold requirements."""
    from apps.model.validate_model_performance import (
        validate_all_models,
        generate_validation_report,
        export_validation_report,
    )

    cv_results = {"strong": strong_cv_metrics}
    validation_results = validate_all_models(cv_results, mlr_thresholds)
    report = generate_validation_report(validation_results, mlr_thresholds)

    assert "thresholds" in report
    assert report["thresholds"]["r2_min"] == 0.50
    assert report["thresholds"]["r2_std_max"] == 0.15
    assert report["thresholds"]["rmse_max_pct"] == 0.20
    assert report["thresholds"]["min_folds"] == 3

    # Export and verify
    output_path = tmp_path / "validation_results.json"
    export_validation_report(validation_results, report, output_path)
    assert output_path.exists()