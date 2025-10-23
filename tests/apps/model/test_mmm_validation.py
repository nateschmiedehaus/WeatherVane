"""Comprehensive tests for model performance validation against objective thresholds.

Tests cover:
1. Validation threshold logic (pass/fail determination)
2. Summary statistics computation
3. Result export functionality
4. Edge cases (empty results, negative R², etc.)
5. JSON serialization/deserialization
6. Aggregate metrics computation
7. Cross-validation metrics handling

Reference: T-MLR-2.4 (Validate model performance against objective thresholds)
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Dict

import numpy as np
import pytest

from apps.model.mmm_lightweight_weather import (
    CrossValidationMetrics,
    ModelValidationResult,
    validate_models_against_thresholds,
    summarize_validation_results,
    export_validation_results,
    load_cv_results_from_json,
)


# Fixtures

@pytest.fixture
def sample_cv_metrics_passing() -> CrossValidationMetrics:
    """Create CV metrics for a model that passes threshold."""
    return CrossValidationMetrics(
        model_name="test_passing_model",
        fold_r2_scores=[0.55, 0.60, 0.58, 0.62, 0.59],
        fold_rmse_scores=[100.0, 95.0, 98.0, 92.0, 97.0],
        fold_mae_scores=[80.0, 75.0, 78.0, 72.0, 77.0],
        mean_r2=0.588,
        std_r2=0.025,
        mean_rmse=96.4,
        mean_mae=76.4,
        weather_elasticity={
            "temperature": [0.15, 0.18, 0.16, 0.17, 0.16],
            "humidity": [-0.10, -0.12, -0.11, -0.11, -0.10],
            "precipitation": [0.08, 0.09, 0.08, 0.09, 0.08],
        },
        channel_roas={
            "meta_spend": [2.5, 2.6, 2.5, 2.7, 2.6],
            "google_spend": [1.8, 1.9, 1.8, 1.9, 1.8],
        },
        num_folds=5,
        feature_names=["temperature", "humidity", "precipitation", "meta_spend", "google_spend"],
        fold_details=[
            {"fold": i, "train_size": 100, "test_size": 20, "r2": r2, "rmse": rmse, "mae": mae}
            for i, (r2, rmse, mae) in enumerate(
                zip([0.55, 0.60, 0.58, 0.62, 0.59], [100.0, 95.0, 98.0, 92.0, 97.0], [80.0, 75.0, 78.0, 72.0, 77.0])
            )
        ],
    )


@pytest.fixture
def sample_cv_metrics_failing() -> CrossValidationMetrics:
    """Create CV metrics for a model that fails threshold."""
    return CrossValidationMetrics(
        model_name="test_failing_model",
        fold_r2_scores=[0.15, 0.20, 0.18, 0.22, 0.19],
        fold_rmse_scores=[200.0, 190.0, 195.0, 185.0, 192.0],
        fold_mae_scores=[150.0, 140.0, 145.0, 135.0, 142.0],
        mean_r2=0.188,
        std_r2=0.025,
        mean_rmse=192.4,
        mean_mae=142.4,
        weather_elasticity={
            "temperature": [0.05, 0.06, 0.05, 0.06, 0.05],
            "humidity": [-0.03, -0.04, -0.03, -0.04, -0.03],
            "precipitation": [0.02, 0.03, 0.02, 0.03, 0.02],
        },
        channel_roas={
            "meta_spend": [1.2, 1.3, 1.2, 1.3, 1.2],
            "google_spend": [0.9, 1.0, 0.9, 1.0, 0.9],
        },
        num_folds=5,
        feature_names=["temperature", "humidity", "precipitation", "meta_spend", "google_spend"],
        fold_details=[
            {"fold": i, "train_size": 100, "test_size": 20, "r2": r2, "rmse": rmse, "mae": mae}
            for i, (r2, rmse, mae) in enumerate(
                zip([0.15, 0.20, 0.18, 0.22, 0.19], [200.0, 190.0, 195.0, 185.0, 192.0], [150.0, 140.0, 145.0, 135.0, 142.0])
            )
        ],
    )


@pytest.fixture
def sample_cv_results(
    sample_cv_metrics_passing: CrossValidationMetrics,
    sample_cv_metrics_failing: CrossValidationMetrics,
) -> Dict[str, CrossValidationMetrics]:
    """Create dict of CV results with both passing and failing models."""
    return {
        "passing_model": sample_cv_metrics_passing,
        "failing_model": sample_cv_metrics_failing,
    }


# Tests: validate_models_against_thresholds

def test_validate_passing_model(sample_cv_metrics_passing: CrossValidationMetrics):
    """Test validation correctly identifies passing model."""
    cv_results = {"test_model": sample_cv_metrics_passing}
    validation_results = validate_models_against_thresholds(cv_results, r2_threshold=0.50)

    assert len(validation_results) == 1
    result = validation_results["test_model"]

    assert isinstance(result, ModelValidationResult)
    assert result.tenant_name == "test_model"
    assert result.mean_r2 == pytest.approx(0.588, abs=0.001)
    assert result.passes_threshold is True
    assert result.r2_threshold == 0.50
    assert result.num_folds == 5


def test_validate_failing_model(sample_cv_metrics_failing: CrossValidationMetrics):
    """Test validation correctly identifies failing model."""
    cv_results = {"test_model": sample_cv_metrics_failing}
    validation_results = validate_models_against_thresholds(cv_results, r2_threshold=0.50)

    assert len(validation_results) == 1
    result = validation_results["test_model"]

    assert result.tenant_name == "test_model"
    assert result.mean_r2 == pytest.approx(0.188, abs=0.001)
    assert result.passes_threshold is False


def test_validate_mixed_models(sample_cv_results: Dict[str, CrossValidationMetrics]):
    """Test validation with both passing and failing models."""
    validation_results = validate_models_against_thresholds(sample_cv_results, r2_threshold=0.50)

    assert len(validation_results) == 2
    assert validation_results["passing_model"].passes_threshold is True
    assert validation_results["failing_model"].passes_threshold is False


def test_validate_custom_threshold():
    """Test validation with custom R² threshold."""
    cv_metrics = CrossValidationMetrics(
        model_name="test_model",
        fold_r2_scores=[0.45, 0.48, 0.46, 0.49, 0.47],
        fold_rmse_scores=[100.0] * 5,
        fold_mae_scores=[80.0] * 5,
        mean_r2=0.47,
        std_r2=0.015,
        mean_rmse=100.0,
        mean_mae=80.0,
        weather_elasticity={},
        channel_roas={},
        num_folds=5,
        feature_names=[],
        fold_details=[],
    )

    # Fails with 0.50 threshold
    results_high = validate_models_against_thresholds({"test": cv_metrics}, r2_threshold=0.50)
    assert results_high["test"].passes_threshold is False

    # Passes with 0.40 threshold
    results_low = validate_models_against_thresholds({"test": cv_metrics}, r2_threshold=0.40)
    assert results_low["test"].passes_threshold is True


def test_validate_boundary_case():
    """Test validation at exact threshold boundary."""
    cv_metrics = CrossValidationMetrics(
        model_name="boundary_model",
        fold_r2_scores=[0.50, 0.50, 0.50, 0.50, 0.50],
        fold_rmse_scores=[100.0] * 5,
        fold_mae_scores=[80.0] * 5,
        mean_r2=0.50,
        std_r2=0.0,
        mean_rmse=100.0,
        mean_mae=80.0,
        weather_elasticity={},
        channel_roas={},
        num_folds=5,
        feature_names=[],
        fold_details=[],
    )

    results = validate_models_against_thresholds({"test": cv_metrics}, r2_threshold=0.50)
    # At boundary, should pass (>= threshold)
    assert results["test"].passes_threshold is True


def test_validate_negative_r2():
    """Test validation handles negative R² scores."""
    cv_metrics = CrossValidationMetrics(
        model_name="negative_model",
        fold_r2_scores=[-0.05, -0.03, -0.04, -0.02, -0.03],
        fold_rmse_scores=[300.0] * 5,
        fold_mae_scores=[250.0] * 5,
        mean_r2=-0.034,
        std_r2=0.01,
        mean_rmse=300.0,
        mean_mae=250.0,
        weather_elasticity={},
        channel_roas={},
        num_folds=5,
        feature_names=[],
        fold_details=[],
    )

    results = validate_models_against_thresholds({"test": cv_metrics}, r2_threshold=0.50)
    assert results["test"].passes_threshold is False
    assert results["test"].mean_r2 < 0


def test_validate_empty_results():
    """Test validation with empty results dict."""
    validation_results = validate_models_against_thresholds({}, r2_threshold=0.50)
    assert len(validation_results) == 0


def test_weather_elasticity_aggregation(sample_cv_metrics_passing: CrossValidationMetrics):
    """Test weather elasticity is correctly averaged across folds."""
    cv_results = {"test": sample_cv_metrics_passing}
    validation_results = validate_models_against_thresholds(cv_results)

    result = validation_results["test"]
    assert "temperature" in result.weather_elasticity
    assert "humidity" in result.weather_elasticity
    assert "precipitation" in result.weather_elasticity

    # Check averages
    assert result.weather_elasticity["temperature"] == pytest.approx(0.164, abs=0.01)
    assert result.weather_elasticity["humidity"] == pytest.approx(-0.108, abs=0.01)
    assert result.weather_elasticity["precipitation"] == pytest.approx(0.084, abs=0.01)


def test_channel_roas_aggregation(sample_cv_metrics_passing: CrossValidationMetrics):
    """Test channel ROAS is correctly averaged across folds."""
    cv_results = {"test": sample_cv_metrics_passing}
    validation_results = validate_models_against_thresholds(cv_results)

    result = validation_results["test"]
    assert "meta_spend" in result.channel_roas
    assert "google_spend" in result.channel_roas

    # Check averages
    assert result.channel_roas["meta_spend"] == pytest.approx(2.58, abs=0.1)
    assert result.channel_roas["google_spend"] == pytest.approx(1.84, abs=0.1)


# Tests: summarize_validation_results

def test_summarize_validation_results(sample_cv_results: Dict[str, CrossValidationMetrics]):
    """Test summary statistics computation."""
    validation_results = validate_models_against_thresholds(sample_cv_results)
    summary = summarize_validation_results(validation_results)

    assert summary["total_models"] == 2
    assert summary["passing_models"] == 1
    assert summary["failing_models"] == 1
    assert summary["pass_rate"] == 0.5
    assert summary["threshold"] == 0.5

    # Check R² statistics
    assert "mean_r2_all" in summary
    assert "std_r2_all" in summary
    assert "min_r2" in summary
    assert "max_r2" in summary

    # Check model lists
    assert "passing_model_names" in summary
    assert "failing_model_names" in summary
    assert "passing_model" in summary["passing_model_names"]
    assert "failing_model" in summary["failing_model_names"]


def test_summarize_all_passing():
    """Test summary when all models pass."""
    cv_metrics = CrossValidationMetrics(
        model_name="model",
        fold_r2_scores=[0.60] * 5,
        fold_rmse_scores=[100.0] * 5,
        fold_mae_scores=[80.0] * 5,
        mean_r2=0.60,
        std_r2=0.0,
        mean_rmse=100.0,
        mean_mae=80.0,
        weather_elasticity={},
        channel_roas={},
        num_folds=5,
        feature_names=[],
        fold_details=[],
    )

    validation_results = validate_models_against_thresholds({"model": cv_metrics})
    summary = summarize_validation_results(validation_results)

    assert summary["pass_rate"] == 1.0
    assert summary["passing_models"] == 1
    assert summary["failing_models"] == 0
    assert len(summary["failing_model_names"]) == 0


def test_summarize_all_failing():
    """Test summary when all models fail."""
    cv_metrics = CrossValidationMetrics(
        model_name="model",
        fold_r2_scores=[0.20] * 5,
        fold_rmse_scores=[100.0] * 5,
        fold_mae_scores=[80.0] * 5,
        mean_r2=0.20,
        std_r2=0.0,
        mean_rmse=100.0,
        mean_mae=80.0,
        weather_elasticity={},
        channel_roas={},
        num_folds=5,
        feature_names=[],
        fold_details=[],
    )

    validation_results = validate_models_against_thresholds({"model": cv_metrics})
    summary = summarize_validation_results(validation_results)

    assert summary["pass_rate"] == 0.0
    assert summary["passing_models"] == 0
    assert summary["failing_models"] == 1
    assert len(summary["passing_model_names"]) == 0


def test_summarize_empty():
    """Test summary with empty validation results."""
    summary = summarize_validation_results({})
    assert summary == {}


def test_summarize_mean_r2_passing():
    """Test mean R² computation for passing models only."""
    cv_high = CrossValidationMetrics(
        model_name="high",
        fold_r2_scores=[0.70] * 5,
        fold_rmse_scores=[100.0] * 5,
        fold_mae_scores=[80.0] * 5,
        mean_r2=0.70,
        std_r2=0.0,
        mean_rmse=100.0,
        mean_mae=80.0,
        weather_elasticity={},
        channel_roas={},
        num_folds=5,
        feature_names=[],
        fold_details=[],
    )

    cv_low = CrossValidationMetrics(
        model_name="low",
        fold_r2_scores=[0.10] * 5,
        fold_rmse_scores=[200.0] * 5,
        fold_mae_scores=[150.0] * 5,
        mean_r2=0.10,
        std_r2=0.0,
        mean_rmse=200.0,
        mean_mae=150.0,
        weather_elasticity={},
        channel_roas={},
        num_folds=5,
        feature_names=[],
        fold_details=[],
    )

    validation_results = validate_models_against_thresholds({"high": cv_high, "low": cv_low})
    summary = summarize_validation_results(validation_results)

    # Mean R² for passing models should only include "high"
    assert summary["mean_r2_passing"] == pytest.approx(0.70, abs=0.01)
    # Mean R² for all should be average of both
    assert summary["mean_r2_all"] == pytest.approx(0.40, abs=0.01)


# Tests: export_validation_results

def test_export_validation_results(sample_cv_results: Dict[str, CrossValidationMetrics]):
    """Test validation results export to JSON."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "validation_results.json"

        validation_results = validate_models_against_thresholds(sample_cv_results)
        export_validation_results(validation_results, output_path)

        # Verify file was created
        assert output_path.exists()

        # Verify JSON content
        with open(output_path, "r") as f:
            data = json.load(f)

        assert "summary" in data
        assert "results" in data
        assert len(data["results"]) == 2

        # Verify summary content
        assert data["summary"]["total_models"] == 2
        assert data["summary"]["passing_models"] == 1
        assert data["summary"]["pass_rate"] == 0.5

        # Verify individual results
        assert "passing_model" in data["results"]
        assert "failing_model" in data["results"]
        assert data["results"]["passing_model"]["passes_threshold"] is True
        assert data["results"]["failing_model"]["passes_threshold"] is False


def test_export_creates_parent_dirs():
    """Test export creates parent directories if needed."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "nested" / "dirs" / "results.json"

        cv_metrics = CrossValidationMetrics(
            model_name="test",
            fold_r2_scores=[0.60] * 5,
            fold_rmse_scores=[100.0] * 5,
            fold_mae_scores=[80.0] * 5,
            mean_r2=0.60,
            std_r2=0.0,
            mean_rmse=100.0,
            mean_mae=80.0,
            weather_elasticity={},
            channel_roas={},
            num_folds=5,
            feature_names=[],
            fold_details=[],
        )

        validation_results = validate_models_against_thresholds({"test": cv_metrics})
        export_validation_results(validation_results, output_path)

        assert output_path.exists()
        assert output_path.parent.exists()


def test_export_json_serialization():
    """Test all validation result fields are JSON serializable."""
    cv_metrics = CrossValidationMetrics(
        model_name="test",
        fold_r2_scores=[0.60] * 5,
        fold_rmse_scores=[100.0] * 5,
        fold_mae_scores=[80.0] * 5,
        mean_r2=0.60,
        std_r2=0.0,
        mean_rmse=100.0,
        mean_mae=80.0,
        weather_elasticity={"temp": [0.15] * 5},
        channel_roas={"meta": [2.0] * 5},
        num_folds=5,
        feature_names=["temp", "meta"],
        fold_details=[{"fold": i, "r2": 0.60} for i in range(5)],
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "results.json"

        validation_results = validate_models_against_thresholds({"test": cv_metrics})
        export_validation_results(validation_results, output_path)

        # Should not raise any JSON serialization errors
        with open(output_path, "r") as f:
            data = json.load(f)

        # Verify nested structures are preserved
        assert "weather_elasticity" in data["results"]["test"]
        assert "channel_roas" in data["results"]["test"]
        assert "fold_details" in data["results"]["test"]


# Tests: load_cv_results_from_json

def test_load_cv_results_roundtrip():
    """Test CV results can be saved and loaded."""
    cv_metrics = CrossValidationMetrics(
        model_name="test_model",
        fold_r2_scores=[0.55, 0.60, 0.58],
        fold_rmse_scores=[100.0, 95.0, 98.0],
        fold_mae_scores=[80.0, 75.0, 78.0],
        mean_r2=0.58,
        std_r2=0.02,
        mean_rmse=97.67,
        mean_mae=77.67,
        weather_elasticity={"temperature": [0.15, 0.16, 0.15]},
        channel_roas={"meta_spend": [2.5, 2.6, 2.5]},
        num_folds=3,
        feature_names=["temperature", "meta_spend"],
        fold_details=[
            {"fold": 0, "r2": 0.55, "rmse": 100.0, "mae": 80.0},
            {"fold": 1, "r2": 0.60, "rmse": 95.0, "mae": 75.0},
            {"fold": 2, "r2": 0.58, "rmse": 98.0, "mae": 78.0},
        ],
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        # Export validation results (which includes CV data)
        output_path = Path(tmpdir) / "cv_results.json"
        validation_results = validate_models_against_thresholds({"test": cv_metrics})
        export_validation_results(validation_results, output_path)

        # Manually create a CV results file in the expected format
        cv_results_path = Path(tmpdir) / "cv_training_results.json"
        cv_data = {
            "results": {
                "test_model": {
                    "model_name": "test_model",
                    "fold_r2_scores": [0.55, 0.60, 0.58],
                    "fold_rmse_scores": [100.0, 95.0, 98.0],
                    "fold_mae_scores": [80.0, 75.0, 78.0],
                    "mean_r2": 0.58,
                    "std_r2": 0.02,
                    "mean_rmse": 97.67,
                    "mean_mae": 77.67,
                    "weather_elasticity": {"temperature": [0.15, 0.16, 0.15]},
                    "channel_roas": {"meta_spend": [2.5, 2.6, 2.5]},
                    "num_folds": 3,
                    "feature_names": ["temperature", "meta_spend"],
                    "fold_details": [
                        {"fold": 0, "r2": 0.55, "rmse": 100.0, "mae": 80.0},
                        {"fold": 1, "r2": 0.60, "rmse": 95.0, "mae": 75.0},
                        {"fold": 2, "r2": 0.58, "rmse": 98.0, "mae": 78.0},
                    ],
                }
            }
        }

        with open(cv_results_path, "w") as f:
            json.dump(cv_data, f)

        # Load back
        loaded_results = load_cv_results_from_json(cv_results_path)

        assert len(loaded_results) == 1
        assert "test_model" in loaded_results

        loaded = loaded_results["test_model"]
        assert loaded.model_name == "test_model"
        assert loaded.mean_r2 == pytest.approx(0.58, abs=0.01)
        assert loaded.num_folds == 3
        assert len(loaded.fold_r2_scores) == 3
        assert "temperature" in loaded.weather_elasticity


# Integration tests

def test_full_validation_pipeline():
    """Test complete validation pipeline from CV results to export."""
    # Create mock CV results for multiple models
    models = {}
    for i, r2 in enumerate([0.75, 0.55, 0.30, 0.65, 0.20]):
        models[f"model_{i}"] = CrossValidationMetrics(
            model_name=f"model_{i}",
            fold_r2_scores=[r2] * 5,
            fold_rmse_scores=[100.0] * 5,
            fold_mae_scores=[80.0] * 5,
            mean_r2=r2,
            std_r2=0.01,
            mean_rmse=100.0,
            mean_mae=80.0,
            weather_elasticity={"temperature": [0.1] * 5},
            channel_roas={"meta": [2.0] * 5},
            num_folds=5,
            feature_names=["temperature", "meta"],
            fold_details=[],
        )

    # Validate
    validation_results = validate_models_against_thresholds(models, r2_threshold=0.50)

    # Should have 3 passing (0.75, 0.55, 0.65) and 2 failing (0.30, 0.20)
    assert len(validation_results) == 5

    passing_count = sum(1 for r in validation_results.values() if r.passes_threshold)
    failing_count = sum(1 for r in validation_results.values() if not r.passes_threshold)

    assert passing_count == 3
    assert failing_count == 2

    # Summarize
    summary = summarize_validation_results(validation_results)
    assert summary["pass_rate"] == 0.6

    # Export
    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = Path(tmpdir) / "results.json"
        export_validation_results(validation_results, output_path)

        # Verify export
        with open(output_path, "r") as f:
            data = json.load(f)

        assert data["summary"]["total_models"] == 5
        assert data["summary"]["passing_models"] == 3
        assert data["summary"]["failing_models"] == 2


# Edge case tests

def test_very_high_r2():
    """Test validation with unrealistically high R² (near 1.0)."""
    cv_metrics = CrossValidationMetrics(
        model_name="perfect_model",
        fold_r2_scores=[0.98, 0.99, 0.98, 0.99, 0.98],
        fold_rmse_scores=[10.0] * 5,
        fold_mae_scores=[8.0] * 5,
        mean_r2=0.984,
        std_r2=0.005,
        mean_rmse=10.0,
        mean_mae=8.0,
        weather_elasticity={},
        channel_roas={},
        num_folds=5,
        feature_names=[],
        fold_details=[],
    )

    results = validate_models_against_thresholds({"test": cv_metrics})
    assert results["test"].passes_threshold is True
    assert results["test"].mean_r2 > 0.95


def test_high_variance_across_folds():
    """Test model with high variance in R² across folds."""
    cv_metrics = CrossValidationMetrics(
        model_name="unstable_model",
        fold_r2_scores=[0.10, 0.80, 0.20, 0.70, 0.30],
        fold_rmse_scores=[100.0] * 5,
        fold_mae_scores=[80.0] * 5,
        mean_r2=0.42,
        std_r2=0.30,  # High variance
        mean_rmse=100.0,
        mean_mae=80.0,
        weather_elasticity={},
        channel_roas={},
        num_folds=5,
        feature_names=[],
        fold_details=[],
    )

    results = validate_models_against_thresholds({"test": cv_metrics})
    # Mean is below threshold despite some high fold scores
    assert results["test"].passes_threshold is False
    assert results["test"].mean_r2 < 0.50
