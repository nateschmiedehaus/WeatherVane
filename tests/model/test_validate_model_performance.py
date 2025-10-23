"""Tests for model performance validation against objective thresholds.

This test suite validates all 7 dimensions from UNIVERSAL_TEST_STANDARDS.md:
1. Correctness: Validation logic correctly applies thresholds
2. Error handling: Handles missing data, invalid inputs gracefully
3. Edge cases: Tests boundary conditions and special cases
4. Integration: Works with real CV results and file I/O
5. Performance: Scales to 100+ models efficiently
6. Documentation: Clear test names and docstrings
7. Maintainability: Well-organized, reusable test fixtures
"""

import json
import pytest
import numpy as np
import tempfile
from pathlib import Path
from datetime import datetime
from typing import Dict

from apps.model.mmm_lightweight_weather import CrossValidationMetrics
from apps.model.validate_model_performance import (
    ValidationThresholds,
    ExtendedValidationResult,
    validate_model_with_extended_checks,
    validate_all_models,
    generate_validation_report,
    export_validation_report,
)


# ============================================================================
# Test Fixtures
# ============================================================================


@pytest.fixture
def default_thresholds() -> ValidationThresholds:
    """Create default validation thresholds."""
    return ValidationThresholds(
        r2_min=0.50,
        r2_std_max=0.15,
        rmse_max_pct=0.20,
        min_folds=3,
    )


@pytest.fixture
def passing_cv_metrics() -> CrossValidationMetrics:
    """Create CV metrics that pass all thresholds."""
    return CrossValidationMetrics(
        model_name="passing_tenant",
        fold_r2_scores=[0.65, 0.68, 0.70, 0.67, 0.66],
        fold_rmse_scores=[100.0, 105.0, 95.0, 102.0, 98.0],
        fold_mae_scores=[80.0, 82.0, 75.0, 81.0, 79.0],
        mean_r2=0.672,
        std_r2=0.018,
        mean_rmse=100.0,
        mean_mae=79.4,
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
            {"fold": i, "train_size": 100, "test_size": 25, "r2": r2, "rmse": rmse, "mae": mae}
            for i, (r2, rmse, mae) in enumerate(zip(
                [0.65, 0.68, 0.70, 0.67, 0.66],
                [100.0, 105.0, 95.0, 102.0, 98.0],
                [80.0, 82.0, 75.0, 81.0, 79.0],
            ))
        ],
    )


@pytest.fixture
def failing_r2_cv_metrics() -> CrossValidationMetrics:
    """Create CV metrics that fail R² threshold."""
    return CrossValidationMetrics(
        model_name="failing_r2_tenant",
        fold_r2_scores=[0.35, 0.38, 0.40, 0.37, 0.36],
        fold_rmse_scores=[150.0, 155.0, 145.0, 152.0, 148.0],
        fold_mae_scores=[120.0, 122.0, 115.0, 121.0, 119.0],
        mean_r2=0.372,
        std_r2=0.018,
        mean_rmse=150.0,
        mean_mae=119.4,
        weather_elasticity={},
        channel_roas={},
        num_folds=5,
        feature_names=[],
        fold_details=[],
    )


@pytest.fixture
def unstable_cv_metrics() -> CrossValidationMetrics:
    """Create CV metrics with high variance (unstable model)."""
    return CrossValidationMetrics(
        model_name="unstable_tenant",
        fold_r2_scores=[0.20, 0.75, 0.30, 0.70, 0.25],
        fold_rmse_scores=[200.0, 80.0, 180.0, 90.0, 190.0],
        fold_mae_scores=[150.0, 60.0, 140.0, 70.0, 145.0],
        mean_r2=0.44,
        std_r2=0.25,  # High variance
        mean_rmse=148.0,
        mean_mae=113.0,
        weather_elasticity={},
        channel_roas={},
        num_folds=5,
        feature_names=[],
        fold_details=[],
    )


@pytest.fixture
def insufficient_folds_cv_metrics() -> CrossValidationMetrics:
    """Create CV metrics with too few folds."""
    return CrossValidationMetrics(
        model_name="few_folds_tenant",
        fold_r2_scores=[0.65, 0.68],
        fold_rmse_scores=[100.0, 105.0],
        fold_mae_scores=[80.0, 82.0],
        mean_r2=0.665,
        std_r2=0.021,
        mean_rmse=102.5,
        mean_mae=81.0,
        weather_elasticity={},
        channel_roas={},
        num_folds=2,  # Too few
        feature_names=[],
        fold_details=[],
    )


# ============================================================================
# Dimension 1: Correctness Tests
# ============================================================================


class TestValidationCorrectness:
    """Tests for correct validation logic."""

    def test_passing_model_validation(self, passing_cv_metrics, default_thresholds):
        """Test that a good model passes all validation checks."""
        result = validate_model_with_extended_checks(
            "passing_tenant",
            passing_cv_metrics,
            default_thresholds,
        )

        assert result.passes_r2_threshold
        assert result.passes_stability_check
        assert result.passes_rmse_check
        assert result.passes_all_checks
        assert len(result.failure_reasons) == 0

    def test_failing_r2_validation(self, failing_r2_cv_metrics, default_thresholds):
        """Test that model with low R² fails validation."""
        result = validate_model_with_extended_checks(
            "failing_r2_tenant",
            failing_r2_cv_metrics,
            default_thresholds,
        )

        assert not result.passes_r2_threshold
        assert not result.passes_all_checks
        assert len(result.failure_reasons) > 0
        assert any("R²" in reason for reason in result.failure_reasons)

    def test_unstable_model_validation(self, unstable_cv_metrics, default_thresholds):
        """Test that unstable model fails stability check."""
        result = validate_model_with_extended_checks(
            "unstable_tenant",
            unstable_cv_metrics,
            default_thresholds,
        )

        assert not result.passes_stability_check
        assert not result.passes_all_checks
        assert any("std" in reason for reason in result.failure_reasons)

    def test_insufficient_folds_validation(self, insufficient_folds_cv_metrics, default_thresholds):
        """Test that model with too few folds fails validation."""
        result = validate_model_with_extended_checks(
            "few_folds_tenant",
            insufficient_folds_cv_metrics,
            default_thresholds,
        )

        assert not result.passes_rmse_check  # Fails this check due to fold count
        assert not result.passes_all_checks
        assert any("folds" in reason for reason in result.failure_reasons)

    def test_threshold_boundary_exactly_at_threshold(self, default_thresholds):
        """Test model with R² exactly at threshold."""
        cv_metrics = CrossValidationMetrics(
            model_name="boundary_tenant",
            fold_r2_scores=[0.50, 0.50, 0.50],
            fold_rmse_scores=[100.0, 100.0, 100.0],
            fold_mae_scores=[80.0, 80.0, 80.0],
            mean_r2=0.50,  # Exactly at threshold
            std_r2=0.00,
            mean_rmse=100.0,
            mean_mae=80.0,
            weather_elasticity={},
            channel_roas={},
            num_folds=3,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "boundary_tenant",
            cv_metrics,
            default_thresholds,
        )

        assert result.passes_r2_threshold  # >= threshold
        assert result.mean_r2 == 0.50


# ============================================================================
# Dimension 2: Error Handling Tests
# ============================================================================


class TestValidationErrorHandling:
    """Tests for error handling and robustness."""

    def test_empty_cv_results(self, default_thresholds):
        """Test validation with empty results dict."""
        results = validate_all_models({}, default_thresholds)
        assert results == {}

    def test_single_fold_edge_case(self, default_thresholds):
        """Test handling of single-fold CV (edge case)."""
        cv_metrics = CrossValidationMetrics(
            model_name="single_fold",
            fold_r2_scores=[0.65],
            fold_rmse_scores=[100.0],
            fold_mae_scores=[80.0],
            mean_r2=0.65,
            std_r2=0.0,
            mean_rmse=100.0,
            mean_mae=80.0,
            weather_elasticity={},
            channel_roas={},
            num_folds=1,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "single_fold",
            cv_metrics,
            default_thresholds,
        )

        # Should fail due to insufficient folds
        assert not result.passes_all_checks

    def test_nan_in_metrics(self, default_thresholds):
        """Test handling of NaN values in metrics."""
        cv_metrics = CrossValidationMetrics(
            model_name="nan_tenant",
            fold_r2_scores=[0.65, float('nan'), 0.70],
            fold_rmse_scores=[100.0, 105.0, 95.0],
            fold_mae_scores=[80.0, 82.0, 75.0],
            mean_r2=float('nan'),
            std_r2=float('nan'),
            mean_rmse=100.0,
            mean_mae=79.0,
            weather_elasticity={},
            channel_roas={},
            num_folds=3,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "nan_tenant",
            cv_metrics,
            default_thresholds,
        )

        # Should handle NaN gracefully (comparison with NaN is always False)
        assert not result.passes_r2_threshold

    def test_negative_r2_handling(self, default_thresholds):
        """Test handling of negative R² (worse than baseline)."""
        cv_metrics = CrossValidationMetrics(
            model_name="negative_r2",
            fold_r2_scores=[-0.5, -0.3, -0.4],
            fold_rmse_scores=[200.0, 210.0, 205.0],
            fold_mae_scores=[150.0, 155.0, 152.0],
            mean_r2=-0.4,
            std_r2=0.1,
            mean_rmse=205.0,
            mean_mae=152.3,
            weather_elasticity={},
            channel_roas={},
            num_folds=3,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "negative_r2",
            cv_metrics,
            default_thresholds,
        )

        assert not result.passes_r2_threshold
        assert result.mean_r2 < 0


# ============================================================================
# Dimension 3: Edge Cases Tests
# ============================================================================


class TestValidationEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_perfect_r2(self, default_thresholds):
        """Test model with perfect R² = 1.0."""
        cv_metrics = CrossValidationMetrics(
            model_name="perfect_model",
            fold_r2_scores=[1.0, 1.0, 1.0, 1.0, 1.0],
            fold_rmse_scores=[0.0, 0.0, 0.0, 0.0, 0.0],
            fold_mae_scores=[0.0, 0.0, 0.0, 0.0, 0.0],
            mean_r2=1.0,
            std_r2=0.0,
            mean_rmse=0.0,
            mean_mae=0.0,
            weather_elasticity={},
            channel_roas={},
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "perfect_model",
            cv_metrics,
            default_thresholds,
        )

        assert result.passes_all_checks
        assert result.mean_r2 == 1.0
        assert result.mean_rmse == 0.0

    def test_custom_thresholds(self, passing_cv_metrics):
        """Test validation with custom (stricter) thresholds."""
        strict_thresholds = ValidationThresholds(
            r2_min=0.70,  # Stricter
            r2_std_max=0.10,  # Stricter
            rmse_max_pct=0.15,  # Stricter
            min_folds=5,
        )

        result = validate_model_with_extended_checks(
            "passing_tenant",
            passing_cv_metrics,
            strict_thresholds,
        )

        # May fail stricter thresholds even though it passes default ones
        assert result.mean_r2 < 0.70
        assert not result.passes_r2_threshold

    def test_zero_revenue_rmse_check(self, passing_cv_metrics, default_thresholds):
        """Test RMSE check when mean revenue is zero (undefined percentage)."""
        result = validate_model_with_extended_checks(
            "passing_tenant",
            passing_cv_metrics,
            default_thresholds,
            mean_revenue=0.0,  # Zero revenue
        )

        # Should still pass other checks
        assert result.passes_r2_threshold
        assert result.passes_stability_check


# ============================================================================
# Dimension 4: Integration Tests
# ============================================================================


class TestValidationIntegration:
    """Tests for integration with file I/O and multiple models."""

    def test_validate_multiple_models(self, passing_cv_metrics, failing_r2_cv_metrics, default_thresholds):
        """Test validation of multiple models at once."""
        cv_results = {
            "passing_tenant": passing_cv_metrics,
            "failing_tenant": failing_r2_cv_metrics,
        }

        validation_results = validate_all_models(cv_results, default_thresholds)

        assert len(validation_results) == 2
        assert validation_results["passing_tenant"].passes_all_checks
        assert not validation_results["failing_tenant"].passes_all_checks

    def test_generate_validation_report(self, passing_cv_metrics, failing_r2_cv_metrics, default_thresholds):
        """Test generation of validation report."""
        cv_results = {
            "passing_tenant": passing_cv_metrics,
            "failing_tenant": failing_r2_cv_metrics,
        }

        validation_results = validate_all_models(cv_results, default_thresholds)
        report = generate_validation_report(validation_results, default_thresholds)

        assert "timestamp" in report
        assert report["validation_summary"]["total_models"] == 2
        assert report["validation_summary"]["passing_models"] == 1
        assert report["validation_summary"]["failing_models"] == 1
        assert report["validation_summary"]["pass_rate"] == 0.5

    def test_export_and_load_validation_report(
        self, passing_cv_metrics, failing_r2_cv_metrics, default_thresholds
    ):
        """Test exporting validation report to JSON and loading it back."""
        cv_results = {
            "passing_tenant": passing_cv_metrics,
            "failing_tenant": failing_r2_cv_metrics,
        }

        validation_results = validate_all_models(cv_results, default_thresholds)
        report = generate_validation_report(validation_results, default_thresholds)

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "validation_results.json"
            export_validation_report(validation_results, report, output_path)

            assert output_path.exists()

            # Load and verify
            with open(output_path, "r") as f:
                loaded_data = json.load(f)

            assert "validation_report" in loaded_data
            assert "model_results" in loaded_data
            assert len(loaded_data["model_results"]) == 2


# ============================================================================
# Dimension 5: Performance Tests
# ============================================================================


class TestValidationPerformance:
    """Tests for performance and scalability."""

    def test_validate_100_models_performance(self, passing_cv_metrics, default_thresholds):
        """Test validation scales to 100+ models efficiently."""
        import time

        # Create 100 models with slight variations
        cv_results = {}
        for i in range(100):
            metrics = CrossValidationMetrics(
                model_name=f"tenant_{i:03d}",
                fold_r2_scores=passing_cv_metrics.fold_r2_scores,
                fold_rmse_scores=passing_cv_metrics.fold_rmse_scores,
                fold_mae_scores=passing_cv_metrics.fold_mae_scores,
                mean_r2=passing_cv_metrics.mean_r2 + np.random.uniform(-0.05, 0.05),
                std_r2=passing_cv_metrics.std_r2,
                mean_rmse=passing_cv_metrics.mean_rmse,
                mean_mae=passing_cv_metrics.mean_mae,
                weather_elasticity=passing_cv_metrics.weather_elasticity,
                channel_roas=passing_cv_metrics.channel_roas,
                num_folds=5,
                feature_names=passing_cv_metrics.feature_names,
                fold_details=passing_cv_metrics.fold_details,
            )
            cv_results[f"tenant_{i:03d}"] = metrics

        start_time = time.time()
        validation_results = validate_all_models(cv_results, default_thresholds)
        elapsed = time.time() - start_time

        assert len(validation_results) == 100
        assert elapsed < 5.0  # Should complete in under 5 seconds

    def test_report_generation_performance(self, passing_cv_metrics, default_thresholds):
        """Test report generation is efficient for large datasets."""
        import time

        # Create 200 models
        cv_results = {
            f"tenant_{i:03d}": passing_cv_metrics
            for i in range(200)
        }

        validation_results = validate_all_models(cv_results, default_thresholds)

        start_time = time.time()
        report = generate_validation_report(validation_results, default_thresholds)
        elapsed = time.time() - start_time

        assert elapsed < 2.0  # Should complete in under 2 seconds
        assert report["validation_summary"]["total_models"] == 200


# ============================================================================
# Dimension 6: Documentation Tests
# ============================================================================


class TestValidationDocumentation:
    """Tests for proper documentation and output clarity."""

    def test_failure_reasons_are_descriptive(self, failing_r2_cv_metrics, default_thresholds):
        """Test that failure reasons are clear and actionable."""
        result = validate_model_with_extended_checks(
            "failing_tenant",
            failing_r2_cv_metrics,
            default_thresholds,
        )

        assert len(result.failure_reasons) > 0
        for reason in result.failure_reasons:
            # Each reason should contain the metric name and threshold
            assert len(reason) > 10  # Not just cryptic codes
            assert any(
                keyword in reason.lower()
                for keyword in ["r2", "rmse", "std", "threshold"]
            )

    def test_report_contains_required_sections(self, passing_cv_metrics, default_thresholds):
        """Test that validation report contains all required sections."""
        cv_results = {"test_tenant": passing_cv_metrics}
        validation_results = validate_all_models(cv_results, default_thresholds)
        report = generate_validation_report(validation_results, default_thresholds)

        required_sections = [
            "timestamp",
            "validation_summary",
            "thresholds",
            "performance_metrics",
            "failure_analysis",
            "passing_models",
        ]

        for section in required_sections:
            assert section in report, f"Missing required section: {section}"


# ============================================================================
# Dimension 7: Maintainability Tests
# ============================================================================


class TestValidationMaintainability:
    """Tests for code maintainability and extensibility."""

    def test_threshold_dataclass_immutability(self):
        """Test that ValidationThresholds is a well-defined dataclass."""
        thresholds = ValidationThresholds()

        # Should have sensible defaults
        assert thresholds.r2_min == 0.50
        assert thresholds.r2_std_max == 0.15
        assert thresholds.min_folds == 3

    def test_validation_result_dataclass(self, passing_cv_metrics, default_thresholds):
        """Test that ExtendedValidationResult has expected structure."""
        result = validate_model_with_extended_checks(
            "test_tenant",
            passing_cv_metrics,
            default_thresholds,
        )

        # Check all expected fields exist
        assert hasattr(result, "tenant_name")
        assert hasattr(result, "mean_r2")
        assert hasattr(result, "passes_all_checks")
        assert hasattr(result, "failure_reasons")
        assert hasattr(result, "weather_elasticity")
        assert hasattr(result, "channel_roas")

    def test_validation_can_be_extended(self, passing_cv_metrics):
        """Test that validation logic is extensible (new thresholds)."""
        # Add hypothetical new threshold
        custom_thresholds = ValidationThresholds(
            r2_min=0.60,
            r2_std_max=0.10,
            rmse_max_pct=0.15,
            min_folds=5,
            min_train_samples=50,  # New threshold
        )

        result = validate_model_with_extended_checks(
            "test_tenant",
            passing_cv_metrics,
            custom_thresholds,
        )

        # Should still work with new threshold
        assert isinstance(result, ExtendedValidationResult)


# ============================================================================
# T-MLR-2.6: ROBUSTNESS TESTS (Outliers, Missing Data, Edge Cases)
# ============================================================================


class TestValidationRobustnessOutliers:
    """Tests for handling outliers in cross-validation metrics.

    Addresses T-MLR-2.6: Ensure validation logic handles extreme values
    and outlier scenarios without crashing or producing invalid results.
    """

    def test_extreme_outlier_in_fold_r2_scores(self, default_thresholds):
        """Test handling of extreme outlier in one fold's R² score."""
        cv_metrics = CrossValidationMetrics(
            model_name="outlier_fold",
            fold_r2_scores=[0.65, 0.68, 0.70, 0.67, -5.0],  # Extreme outlier
            fold_rmse_scores=[100.0, 105.0, 95.0, 102.0, 1000.0],
            fold_mae_scores=[80.0, 82.0, 75.0, 81.0, 800.0],
            mean_r2=0.06,  # Dragged down by outlier
            std_r2=2.3,  # Very high due to outlier
            mean_rmse=280.4,
            mean_mae=243.6,
            weather_elasticity={},
            channel_roas={},
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "outlier_fold",
            cv_metrics,
            default_thresholds,
        )

        # Should handle without crashing
        assert not result.passes_r2_threshold  # Mean dragged down
        assert not result.passes_stability_check  # High variance
        assert len(result.failure_reasons) > 0

    def test_all_folds_are_outliers(self, default_thresholds):
        """Test when all fold scores are extreme outliers."""
        cv_metrics = CrossValidationMetrics(
            model_name="all_outliers",
            fold_r2_scores=[10.0, 15.0, 12.0, 14.0, 11.0],  # All impossible R² > 1
            fold_rmse_scores=[0.01, 0.02, 0.01, 0.02, 0.01],
            fold_mae_scores=[0.01, 0.01, 0.01, 0.01, 0.01],
            mean_r2=12.4,  # Impossible R²
            std_r2=1.8,
            mean_rmse=0.014,
            mean_mae=0.01,
            weather_elasticity={},
            channel_roas={},
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "all_outliers",
            cv_metrics,
            default_thresholds,
        )

        # Should still produce a result (even if nonsensical)
        assert isinstance(result, ExtendedValidationResult)
        assert result.mean_r2 > 1.0  # Invalid but recorded

    def test_infinite_values_in_metrics(self, default_thresholds):
        """Test handling of infinite values in metrics."""
        cv_metrics = CrossValidationMetrics(
            model_name="infinite_metrics",
            fold_r2_scores=[0.65, 0.68, float('inf'), 0.67, 0.66],
            fold_rmse_scores=[100.0, 105.0, float('inf'), 102.0, 98.0],
            fold_mae_scores=[80.0, 82.0, float('inf'), 81.0, 79.0],
            mean_r2=float('inf'),
            std_r2=float('inf'),
            mean_rmse=float('inf'),
            mean_mae=float('inf'),
            weather_elasticity={},
            channel_roas={},
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "infinite_metrics",
            cv_metrics,
            default_thresholds,
        )

        # Should handle without crashing
        # Note: inf >= threshold is True in Python, so R² check passes
        # But stability check fails due to inf std
        assert result.passes_r2_threshold  # inf >= 0.50 is True
        assert not result.passes_stability_check  # inf > 0.15
        assert not result.passes_all_checks  # Overall fails
        assert isinstance(result, ExtendedValidationResult)

    def test_extreme_variance_in_rmse(self, default_thresholds):
        """Test model with extreme variance in RMSE across folds."""
        cv_metrics = CrossValidationMetrics(
            model_name="extreme_rmse_variance",
            fold_r2_scores=[0.65, 0.68, 0.70, 0.67, 0.66],
            fold_rmse_scores=[10.0, 100.0, 50.0, 1000.0, 25.0],  # Huge variance
            fold_mae_scores=[8.0, 80.0, 40.0, 800.0, 20.0],
            mean_r2=0.672,
            std_r2=0.018,
            mean_rmse=237.0,  # High mean due to outlier
            mean_mae=189.6,
            weather_elasticity={},
            channel_roas={},
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "extreme_rmse_variance",
            cv_metrics,
            default_thresholds,
            mean_revenue=1000.0,
        )

        # R² is good but RMSE is problematic
        assert result.passes_r2_threshold
        assert result.passes_stability_check  # R² is stable
        # RMSE check depends on mean_revenue

    def test_outlier_weather_elasticity_coefficients(self, default_thresholds):
        """Test handling of extreme weather elasticity coefficients."""
        cv_metrics = CrossValidationMetrics(
            model_name="extreme_elasticity",
            fold_r2_scores=[0.65, 0.68, 0.70, 0.67, 0.66],
            fold_rmse_scores=[100.0, 105.0, 95.0, 102.0, 98.0],
            fold_mae_scores=[80.0, 82.0, 75.0, 81.0, 79.0],
            mean_r2=0.672,
            std_r2=0.018,
            mean_rmse=100.0,
            mean_mae=79.4,
            weather_elasticity={
                "temperature": [0.15, 0.16, 10000.0, 0.15, 0.15],  # Extreme outlier
                "precipitation": [-0.08, -0.09, -0.07, -0.08, -0.08],
            },
            channel_roas={
                "meta": [2.5, 2.6, 2.4, 2.5, 2.5],
                "google": [1.8, -1000.0, 1.7, 1.8, 1.8],  # Negative extreme
            },
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "extreme_elasticity",
            cv_metrics,
            default_thresholds,
        )

        # Should compute mean elasticity despite outliers
        assert "temperature" in result.weather_elasticity
        assert "precipitation" in result.weather_elasticity
        # Mean will be skewed but computable


class TestValidationRobustnessMissingData:
    """Tests for handling missing or incomplete data in validation.

    Addresses T-MLR-2.6: Ensure validation handles missing fields,
    empty collections, and partial data gracefully.
    """

    def test_empty_weather_elasticity(self, default_thresholds):
        """Test validation when weather_elasticity dict is empty."""
        cv_metrics = CrossValidationMetrics(
            model_name="no_weather",
            fold_r2_scores=[0.65, 0.68, 0.70, 0.67, 0.66],
            fold_rmse_scores=[100.0, 105.0, 95.0, 102.0, 98.0],
            fold_mae_scores=[80.0, 82.0, 75.0, 81.0, 79.0],
            mean_r2=0.672,
            std_r2=0.018,
            mean_rmse=100.0,
            mean_mae=79.4,
            weather_elasticity={},  # Empty
            channel_roas={"meta": [2.5] * 5},
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "no_weather",
            cv_metrics,
            default_thresholds,
        )

        assert result.passes_all_checks
        assert result.weather_elasticity == {}  # Should be empty dict

    def test_empty_channel_roas(self, default_thresholds):
        """Test validation when channel_roas dict is empty."""
        cv_metrics = CrossValidationMetrics(
            model_name="no_channels",
            fold_r2_scores=[0.65, 0.68, 0.70, 0.67, 0.66],
            fold_rmse_scores=[100.0, 105.0, 95.0, 102.0, 98.0],
            fold_mae_scores=[80.0, 82.0, 75.0, 81.0, 79.0],
            mean_r2=0.672,
            std_r2=0.018,
            mean_rmse=100.0,
            mean_mae=79.4,
            weather_elasticity={"temperature": [0.15] * 5},
            channel_roas={},  # Empty
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "no_channels",
            cv_metrics,
            default_thresholds,
        )

        assert result.passes_all_checks
        assert result.channel_roas == {}

    def test_partial_fold_data_in_elasticity(self, default_thresholds):
        """Test when weather elasticity has fewer values than folds."""
        cv_metrics = CrossValidationMetrics(
            model_name="partial_elasticity",
            fold_r2_scores=[0.65, 0.68, 0.70, 0.67, 0.66],
            fold_rmse_scores=[100.0, 105.0, 95.0, 102.0, 98.0],
            fold_mae_scores=[80.0, 82.0, 75.0, 81.0, 79.0],
            mean_r2=0.672,
            std_r2=0.018,
            mean_rmse=100.0,
            mean_mae=79.4,
            weather_elasticity={
                "temperature": [0.15, 0.16],  # Only 2 values for 5 folds
                "precipitation": [],  # Empty list
            },
            channel_roas={
                "meta": [2.5, 2.6, 2.4],  # Only 3 values for 5 folds
            },
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "partial_elasticity",
            cv_metrics,
            default_thresholds,
        )

        # Should compute mean from available values
        assert "temperature" in result.weather_elasticity
        assert result.weather_elasticity["temperature"] == pytest.approx(0.155, abs=0.01)
        # Empty list should result in no entry or 0
        assert "precipitation" not in result.weather_elasticity or result.weather_elasticity["precipitation"] == 0

    def test_none_mean_revenue(self, passing_cv_metrics, default_thresholds):
        """Test RMSE check when mean_revenue is None."""
        result = validate_model_with_extended_checks(
            "passing_tenant",
            passing_cv_metrics,
            default_thresholds,
            mean_revenue=None,
        )

        # Should skip RMSE percentage check
        assert result.passes_r2_threshold
        assert result.passes_stability_check
        assert result.passes_rmse_check  # Should pass since check is skipped

    def test_zero_folds(self, default_thresholds):
        """Test validation when num_folds is 0 (edge case)."""
        cv_metrics = CrossValidationMetrics(
            model_name="zero_folds",
            fold_r2_scores=[],
            fold_rmse_scores=[],
            fold_mae_scores=[],
            mean_r2=0.0,
            std_r2=0.0,
            mean_rmse=0.0,
            mean_mae=0.0,
            weather_elasticity={},
            channel_roas={},
            num_folds=0,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "zero_folds",
            cv_metrics,
            default_thresholds,
        )

        # Should fail validation due to insufficient folds
        assert not result.passes_all_checks
        assert any("folds" in reason.lower() for reason in result.failure_reasons)

    def test_empty_fold_details(self, passing_cv_metrics, default_thresholds):
        """Test validation when fold_details list is empty."""
        metrics_copy = CrossValidationMetrics(
            model_name=passing_cv_metrics.model_name,
            fold_r2_scores=passing_cv_metrics.fold_r2_scores,
            fold_rmse_scores=passing_cv_metrics.fold_rmse_scores,
            fold_mae_scores=passing_cv_metrics.fold_mae_scores,
            mean_r2=passing_cv_metrics.mean_r2,
            std_r2=passing_cv_metrics.std_r2,
            mean_rmse=passing_cv_metrics.mean_rmse,
            mean_mae=passing_cv_metrics.mean_mae,
            weather_elasticity=passing_cv_metrics.weather_elasticity,
            channel_roas=passing_cv_metrics.channel_roas,
            num_folds=passing_cv_metrics.num_folds,
            feature_names=passing_cv_metrics.feature_names,
            fold_details=[],  # Empty
        )

        result = validate_model_with_extended_checks(
            "empty_details",
            metrics_copy,
            default_thresholds,
        )

        # Should still validate based on aggregate metrics
        assert result.passes_all_checks
        assert result.fold_details == []


class TestValidationRobustnessEdgeCases:
    """Tests for extreme edge cases in validation logic.

    Addresses T-MLR-2.6: Ensure validation handles boundary conditions,
    degenerate cases, and unexpected inputs robustly.
    """

    def test_single_data_point_cv(self, default_thresholds):
        """Test validation with only 1 fold and 1 data point."""
        cv_metrics = CrossValidationMetrics(
            model_name="single_point",
            fold_r2_scores=[0.0],  # Single point: R² undefined but set to 0
            fold_rmse_scores=[0.0],
            fold_mae_scores=[0.0],
            mean_r2=0.0,
            std_r2=0.0,
            mean_rmse=0.0,
            mean_mae=0.0,
            weather_elasticity={},
            channel_roas={},
            num_folds=1,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "single_point",
            cv_metrics,
            default_thresholds,
        )

        # Should fail due to insufficient folds and poor R²
        assert not result.passes_all_checks

    def test_all_zero_metrics(self, default_thresholds):
        """Test validation when all metrics are exactly zero."""
        cv_metrics = CrossValidationMetrics(
            model_name="all_zeros",
            fold_r2_scores=[0.0, 0.0, 0.0, 0.0, 0.0],
            fold_rmse_scores=[0.0, 0.0, 0.0, 0.0, 0.0],
            fold_mae_scores=[0.0, 0.0, 0.0, 0.0, 0.0],
            mean_r2=0.0,
            std_r2=0.0,
            mean_rmse=0.0,
            mean_mae=0.0,
            weather_elasticity={},
            channel_roas={},
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "all_zeros",
            cv_metrics,
            default_thresholds,
        )

        # Perfect stability (0 variance) but terrible fit (R² = 0)
        assert not result.passes_r2_threshold
        assert result.passes_stability_check  # 0.0 <= 0.15
        assert not result.passes_all_checks

    def test_constant_predictions_across_folds(self, default_thresholds):
        """Test model that makes identical predictions every fold."""
        cv_metrics = CrossValidationMetrics(
            model_name="constant_predictor",
            fold_r2_scores=[0.55, 0.55, 0.55, 0.55, 0.55],  # Perfect stability
            fold_rmse_scores=[120.0, 120.0, 120.0, 120.0, 120.0],
            fold_mae_scores=[95.0, 95.0, 95.0, 95.0, 95.0],
            mean_r2=0.55,
            std_r2=0.0,  # Zero variance
            mean_rmse=120.0,
            mean_mae=95.0,
            weather_elasticity={"temperature": [0.12] * 5},
            channel_roas={"meta": [2.0] * 5},
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "constant_predictor",
            cv_metrics,
            default_thresholds,
        )

        # Should pass all checks (R² > 0.50, stability perfect)
        assert result.passes_r2_threshold
        assert result.passes_stability_check
        assert result.passes_all_checks

    def test_extreme_number_of_folds(self, default_thresholds):
        """Test validation with an extreme number of CV folds (100)."""
        num_folds = 100
        cv_metrics = CrossValidationMetrics(
            model_name="many_folds",
            fold_r2_scores=[0.65 + np.random.uniform(-0.05, 0.05) for _ in range(num_folds)],
            fold_rmse_scores=[100.0 + np.random.uniform(-10, 10) for _ in range(num_folds)],
            fold_mae_scores=[80.0 + np.random.uniform(-8, 8) for _ in range(num_folds)],
            mean_r2=0.65,
            std_r2=0.02,
            mean_rmse=100.0,
            mean_mae=80.0,
            weather_elasticity={},
            channel_roas={},
            num_folds=num_folds,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "many_folds",
            cv_metrics,
            default_thresholds,
        )

        # Should handle large number of folds
        assert result.passes_all_checks
        assert result.num_folds == 100

    def test_unicode_and_special_characters_in_tenant_name(self, passing_cv_metrics, default_thresholds):
        """Test validation with unicode and special characters in tenant name."""
        special_names = [
            "tenant_🚀_rocket",
            "tenant-with-dashes",
            "tenant.with.dots",
            "tenant_with_ñoño",
            "tenant\twith\ttabs",
            "tenant with spaces",
        ]

        for name in special_names:
            result = validate_model_with_extended_checks(
                name,
                passing_cv_metrics,
                default_thresholds,
            )

            assert result.tenant_name == name
            assert result.passes_all_checks

    def test_very_long_tenant_name(self, passing_cv_metrics, default_thresholds):
        """Test validation with extremely long tenant name."""
        long_name = "x" * 10000  # 10k character name

        result = validate_model_with_extended_checks(
            long_name,
            passing_cv_metrics,
            default_thresholds,
        )

        assert result.tenant_name == long_name
        assert result.passes_all_checks

    def test_negative_mean_revenue(self, passing_cv_metrics, default_thresholds):
        """Test RMSE check with negative mean revenue (invalid)."""
        result = validate_model_with_extended_checks(
            "negative_revenue",
            passing_cv_metrics,
            default_thresholds,
            mean_revenue=-1000.0,
        )

        # Should handle gracefully (likely skip RMSE percentage check)
        assert result.passes_r2_threshold
        assert result.passes_stability_check

    def test_mixed_positive_negative_r2_across_folds(self, default_thresholds):
        """Test model with mix of positive and negative R² across folds."""
        cv_metrics = CrossValidationMetrics(
            model_name="mixed_r2",
            fold_r2_scores=[0.70, -0.10, 0.65, -0.05, 0.72],
            fold_rmse_scores=[100.0, 200.0, 105.0, 190.0, 95.0],
            fold_mae_scores=[80.0, 150.0, 82.0, 145.0, 75.0],
            mean_r2=0.384,  # Mean is positive but some folds terrible
            std_r2=0.38,  # High variance
            mean_rmse=138.0,
            mean_mae=106.4,
            weather_elasticity={},
            channel_roas={},
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "mixed_r2",
            cv_metrics,
            default_thresholds,
        )

        # Should fail both R² threshold and stability
        assert not result.passes_r2_threshold
        assert not result.passes_stability_check
        assert not result.passes_all_checks


class TestValidationRobustnessIntegration:
    """Integration tests combining multiple robustness scenarios.

    Addresses T-MLR-2.6: Ensure validation handles realistic combinations
    of outliers, missing data, and edge cases.
    """

    def test_multiple_robustness_issues_simultaneously(self, default_thresholds):
        """Test model with outliers + missing data + edge cases."""
        cv_metrics = CrossValidationMetrics(
            model_name="complex_issues",
            fold_r2_scores=[0.65, float('nan'), -0.5, 0.68, 10.0],  # NaN, negative, outlier
            fold_rmse_scores=[100.0, float('inf'), 95.0, 102.0, 0.0],  # Inf, zero
            fold_mae_scores=[80.0, 82.0, 75.0, float('nan'), 79.0],  # NaN
            mean_r2=float('nan'),
            std_r2=float('inf'),
            mean_rmse=float('inf'),
            mean_mae=79.0,
            weather_elasticity={
                "temperature": [0.15, 0.16],  # Fewer values than folds
                "humidity": [],  # Empty
            },
            channel_roas={
                "meta": [2.5, -1000.0, 2.4, 2.5, 2.5],  # Negative outlier
            },
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        result = validate_model_with_extended_checks(
            "complex_issues",
            cv_metrics,
            default_thresholds,
        )

        # Should produce a result without crashing
        assert isinstance(result, ExtendedValidationResult)
        assert not result.passes_all_checks

    def test_generate_report_with_all_edge_cases(self, default_thresholds):
        """Test report generation with multiple edge case models."""
        cv_results = {
            "perfect": CrossValidationMetrics(
                model_name="perfect",
                fold_r2_scores=[1.0] * 5,
                fold_rmse_scores=[0.0] * 5,
                fold_mae_scores=[0.0] * 5,
                mean_r2=1.0,
                std_r2=0.0,
                mean_rmse=0.0,
                mean_mae=0.0,
                weather_elasticity={},
                channel_roas={},
                num_folds=5,
                feature_names=[],
                fold_details=[],
            ),
            "negative": CrossValidationMetrics(
                model_name="negative",
                fold_r2_scores=[-0.5] * 5,
                fold_rmse_scores=[200.0] * 5,
                fold_mae_scores=[150.0] * 5,
                mean_r2=-0.5,
                std_r2=0.0,
                mean_rmse=200.0,
                mean_mae=150.0,
                weather_elasticity={},
                channel_roas={},
                num_folds=5,
                feature_names=[],
                fold_details=[],
            ),
            "zero_folds": CrossValidationMetrics(
                model_name="zero_folds",
                fold_r2_scores=[],
                fold_rmse_scores=[],
                fold_mae_scores=[],
                mean_r2=0.0,
                std_r2=0.0,
                mean_rmse=0.0,
                mean_mae=0.0,
                weather_elasticity={},
                channel_roas={},
                num_folds=0,
                feature_names=[],
                fold_details=[],
            ),
            "nan": CrossValidationMetrics(
                model_name="nan",
                fold_r2_scores=[float('nan')] * 5,
                fold_rmse_scores=[100.0] * 5,
                fold_mae_scores=[80.0] * 5,
                mean_r2=float('nan'),
                std_r2=float('nan'),
                mean_rmse=100.0,
                mean_mae=80.0,
                weather_elasticity={},
                channel_roas={},
                num_folds=5,
                feature_names=[],
                fold_details=[],
            ),
        }

        validation_results = validate_all_models(cv_results, default_thresholds)
        report = generate_validation_report(validation_results, default_thresholds)

        # Should generate report without crashing
        assert "validation_summary" in report
        assert report["validation_summary"]["total_models"] == 4

    def test_export_with_edge_case_values(self, default_thresholds):
        """Test JSON export with NaN, Inf, and other edge case values."""
        cv_metrics = CrossValidationMetrics(
            model_name="edge_export",
            fold_r2_scores=[0.65, float('nan'), float('inf'), 0.67, 0.66],
            fold_rmse_scores=[100.0, 105.0, 95.0, 102.0, 98.0],
            fold_mae_scores=[80.0, 82.0, 75.0, 81.0, 79.0],
            mean_r2=float('nan'),
            std_r2=float('inf'),
            mean_rmse=100.0,
            mean_mae=79.4,
            weather_elasticity={},
            channel_roas={},
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        cv_results = {"edge_export": cv_metrics}
        validation_results = validate_all_models(cv_results, default_thresholds)
        report = generate_validation_report(validation_results, default_thresholds)

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "edge_results.json"

            # Should export without crashing (JSON may convert NaN/Inf to null)
            export_validation_report(validation_results, report, output_path)

            assert output_path.exists()

            # Verify JSON is valid
            with open(output_path, "r") as f:
                data = json.load(f)

            assert "validation_report" in data
            assert "model_results" in data
