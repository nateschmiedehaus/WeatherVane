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
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Dict, Optional

from apps.model.mmm_lightweight_weather import CrossValidationMetrics
from apps.model.validate_model_performance import (
    ValidationThresholds,
    ExtendedValidationResult,
    validate_model_with_extended_checks,
    validate_all_models,
    generate_validation_report,
    export_validation_report,
)


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
            {"fold": i, "train_size": 100, "test_size": 25, "r2": r2, "rmse": rmse}
            for i, (r2, rmse) in enumerate(zip(
                [0.65, 0.68, 0.70, 0.67, 0.66],
                [100.0, 105.0, 95.0, 102.0, 98.0],
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
        assert any("Standard deviation" in reason for reason in result.failure_reasons)

    def test_insufficient_folds_validation(self, insufficient_folds_cv_metrics, default_thresholds):
        """Test that model with too few folds fails validation."""
        result = validate_model_with_extended_checks(
            "few_folds_tenant",
            insufficient_folds_cv_metrics,
            default_thresholds,
        )

        assert not result.passes_all_checks
        assert any("folds" in reason for reason in result.failure_reasons)


class TestValidationErrorHandling:
    """Tests for error handling and robustness."""

    def test_empty_cv_results(self, default_thresholds):
        """Test validation with empty results dict."""
        results = validate_all_models({}, default_thresholds)
        assert results == {}

    def test_single_fold_edge_case(self, default_thresholds):
        """Test handling of single-fold CV."""
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
            mean_r2=float('nan'),  # NaN should fail validation
            std_r2=float('nan'),   # NaN should fail validation
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

        # Should handle NaN gracefully
        assert not result.passes_r2_threshold


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

    def test_negative_r2(self, default_thresholds):
        """Test handling of negative R² values."""
        cv_metrics = CrossValidationMetrics(
            model_name="negative_r2_tenant",
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
            "negative_r2_tenant",
            cv_metrics,
            default_thresholds,
        )

        assert not result.passes_r2_threshold
        assert result.mean_r2 < 0


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

    def test_export_and_load_validation_report(self, passing_cv_metrics, failing_r2_cv_metrics, default_thresholds):
        """Test exporting validation report to JSON and loading it back."""
        cv_results = {
            "passing_tenant": passing_cv_metrics,
            "failing_tenant": failing_r2_cv_metrics,
        }

        validation_results = validate_all_models(cv_results, default_thresholds)
        report = generate_validation_report(validation_results, default_thresholds)

        with TemporaryDirectory() as tmp_dir:
            output_path = f"{tmp_dir}/validation_results.json"
            export_validation_report(validation_results, report, output_path)

            with open(output_path) as f:
                loaded_data = json.load(f)

            assert "validation_report" in loaded_data
            assert "model_results" in loaded_data
            assert len(loaded_data["model_results"]) == 2