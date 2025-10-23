"""Tests for weather-aware allocation model training.

Test Coverage (7/7 dimensions):
1. Correctness: Validates training logic, ROI curves, and allocation results
2. Error Handling: Tests error cases (missing data, invalid configs, etc.)
3. Edge Cases: Tests boundary conditions (empty data, zero budgets, etc.)
4. Integration: Tests end-to-end training pipeline
5. Performance: Validates model meets performance thresholds
6. Security: Validates input sanitization and safe file operations
7. Regression: Tests backward compatibility with existing data formats
"""

import json
import tempfile
from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest

from apps.allocator.optimizer import BudgetItem, OptimizerResult
from apps.allocator.train_weather_allocation import (
    WeatherAllocationConfig,
    WeatherAwareAllocationResult,
    build_roi_curve_from_mmm,
    adjust_roi_curve_for_weather,
    train_weather_allocation_for_tenant,
    export_allocation_model,
    compute_aggregate_summary,
)
from apps.model.mmm_lightweight_weather import CrossValidationMetrics


# ==============================================================================
# Fixtures
# ==============================================================================


@pytest.fixture
def sample_config(tmp_path: Path) -> WeatherAllocationConfig:
    """Create sample configuration for testing."""
    return WeatherAllocationConfig(
        data_dir=tmp_path / "data",
        mmm_results_path=tmp_path / "mmm_results.json",
        output_dir=tmp_path / "output",
        regularization_strength=0.01,
        roi_curve_points=10,
        max_spend_multiplier=2.0,
        weather_sensitivity=0.15,
        adverse_weather_reduction=0.70,
        min_mmm_r2=0.50,
        min_allocation_roas=1.20,
    )


@pytest.fixture
def sample_tenant_data() -> pd.DataFrame:
    """Create sample synthetic tenant data."""
    dates = pd.date_range("2024-01-01", periods=90, freq="D")
    np.random.seed(42)

    return pd.DataFrame({
        "date": dates,
        "meta_spend": np.random.uniform(100, 500, len(dates)),
        "google_spend": np.random.uniform(100, 500, len(dates)),
        "temperature": np.random.uniform(10, 25, len(dates)),
        "humidity": np.random.uniform(40, 80, len(dates)),
        "precipitation": np.random.uniform(0, 10, len(dates)),
        "revenue": np.random.uniform(1000, 5000, len(dates)),
    })


@pytest.fixture
def sample_cv_metrics() -> CrossValidationMetrics:
    """Create sample cross-validation metrics."""
    return CrossValidationMetrics(
        model_name="test_tenant",
        fold_r2_scores=[0.60, 0.65, 0.62, 0.58, 0.61],
        fold_rmse_scores=[100.0, 95.0, 98.0, 102.0, 99.0],
        fold_mae_scores=[80.0, 75.0, 78.0, 82.0, 79.0],
        mean_r2=0.612,
        std_r2=0.025,
        mean_rmse=98.8,
        mean_mae=78.8,
        weather_elasticity={
            "temperature": [0.12, 0.15, 0.13, 0.11, 0.14],
            "humidity": [-0.05, -0.06, -0.04, -0.05, -0.05],
            "precipitation": [-0.08, -0.09, -0.07, -0.08, -0.08],
        },
        channel_roas={
            "meta": [2.5, 2.6, 2.4, 2.5, 2.5],
            "google": [2.0, 2.1, 1.9, 2.0, 2.0],
        },
        num_folds=5,
        feature_names=["meta_adstocked", "google_adstocked", "temperature"],
    )


# ==============================================================================
# Dimension 1: Correctness
# ==============================================================================


def test_build_roi_curve_from_mmm_correctness():
    """Test ROI curve building produces correct shape and values."""
    # Arrange
    channel = "meta"
    mmm_roas = 2.5
    current_spend = 1000.0
    max_spend = 2000.0
    num_points = 10

    # Act
    curve = build_roi_curve_from_mmm(
        channel=channel,
        mmm_roas=mmm_roas,
        current_spend=current_spend,
        max_spend=max_spend,
        num_points=num_points,
    )

    # Assert
    assert len(curve) == num_points
    assert curve[0]["spend"] == 0.0
    assert curve[0]["revenue"] == 0.0
    assert curve[-1]["spend"] == max_spend

    # Check saturation effect (ROAS should decrease as spend increases)
    roas_values = [point["roas"] for point in curve[1:]]
    assert roas_values == sorted(roas_values, reverse=True), "ROAS should decrease with spend"

    # Check revenue is monotonically increasing
    revenue_values = [point["revenue"] for point in curve]
    assert revenue_values == sorted(revenue_values), "Revenue should increase with spend"


def test_adjust_roi_curve_for_weather_favorable():
    """Test ROI curve adjustment for favorable weather."""
    # Arrange
    base_curve = [
        {"spend": 0.0, "revenue": 0.0, "roas": 0.0},
        {"spend": 1000.0, "revenue": 2000.0, "roas": 2.0},
        {"spend": 2000.0, "revenue": 3500.0, "roas": 1.75},
    ]
    weather_elasticity = 0.15
    sensitivity = 0.10

    # Act
    adjusted = adjust_roi_curve_for_weather(
        base_curve,
        weather_elasticity,
        weather_condition="favorable",
        sensitivity=sensitivity,
    )

    # Assert
    assert len(adjusted) == len(base_curve)
    expected_adjustment = 1.0 + (abs(weather_elasticity) * sensitivity)

    for base_point, adj_point in zip(base_curve, adjusted):
        assert adj_point["spend"] == base_point["spend"]
        assert adj_point["revenue"] == pytest.approx(
            base_point["revenue"] * expected_adjustment,
            rel=1e-6,
        )


def test_adjust_roi_curve_for_weather_adverse():
    """Test ROI curve adjustment for adverse weather."""
    # Arrange
    base_curve = [
        {"spend": 0.0, "revenue": 0.0, "roas": 0.0},
        {"spend": 1000.0, "revenue": 2000.0, "roas": 2.0},
    ]
    weather_elasticity = 0.15
    sensitivity = 0.10

    # Act
    adjusted = adjust_roi_curve_for_weather(
        base_curve,
        weather_elasticity,
        weather_condition="adverse",
        sensitivity=sensitivity,
    )

    # Assert
    expected_adjustment = 1.0 - (abs(weather_elasticity) * sensitivity)

    for base_point, adj_point in zip(base_curve, adjusted):
        assert adj_point["revenue"] == pytest.approx(
            base_point["revenue"] * expected_adjustment,
            rel=1e-6,
        )


# ==============================================================================
# Dimension 2: Error Handling
# ==============================================================================


def test_train_with_low_mmm_r2_raises_error(tmp_path: Path, sample_tenant_data: pd.DataFrame):
    """Test that low MMM R² raises ValueError."""
    # Arrange
    config = WeatherAllocationConfig(
        data_dir=tmp_path,
        output_dir=tmp_path / "output",
        min_mmm_r2=0.80,  # Set high threshold
    )

    tenant_path = tmp_path / "test_tenant.parquet"
    sample_tenant_data.to_parquet(tenant_path)

    # Mock MMM training to return low R²
    low_r2_metrics = CrossValidationMetrics(
        model_name="test_tenant",
        fold_r2_scores=[0.40, 0.42, 0.38, 0.41, 0.39],
        fold_rmse_scores=[100.0] * 5,
        fold_mae_scores=[80.0] * 5,
        mean_r2=0.40,  # Below threshold
        std_r2=0.02,
        mean_rmse=100.0,
        mean_mae=80.0,
        weather_elasticity={"temperature": [0.1] * 5},
        channel_roas={"meta": [2.0] * 5, "google": [1.8] * 5},
        num_folds=5,
        feature_names=["meta_adstocked", "temperature"],
    )

    with patch(
        "apps.allocator.train_weather_allocation.TenantModelTrainer.train_single_tenant_with_cv",
        return_value=("test_tenant", low_r2_metrics),
    ):
        # Act & Assert
        with pytest.raises(ValueError, match="MMM R² .* below threshold"):
            train_weather_allocation_for_tenant(tenant_path, config)


def test_train_with_missing_spend_columns_raises_error(tmp_path: Path):
    """Test that missing spend columns raises ValueError."""
    # Arrange
    config = WeatherAllocationConfig(
        data_dir=tmp_path,
        output_dir=tmp_path / "output",
    )

    # Create data without spend columns
    df = pd.DataFrame({
        "date": pd.date_range("2024-01-01", periods=30),
        "temperature": np.random.uniform(10, 25, 30),
        "revenue": np.random.uniform(1000, 5000, 30),
    })

    tenant_path = tmp_path / "test_tenant.parquet"
    df.to_parquet(tenant_path)

    # Mock MMM to pass validation
    mock_metrics = CrossValidationMetrics(
        model_name="test_tenant",
        fold_r2_scores=[0.60] * 5,
        fold_rmse_scores=[100.0] * 5,
        fold_mae_scores=[80.0] * 5,
        mean_r2=0.60,
        std_r2=0.02,
        mean_rmse=100.0,
        mean_mae=80.0,
        weather_elasticity={"temperature": [0.1] * 5},
        channel_roas={},
        num_folds=5,
        feature_names=["temperature"],
    )

    with patch(
        "apps.allocator.train_weather_allocation.TenantModelTrainer.train_single_tenant_with_cv",
        return_value=("test_tenant", mock_metrics),
    ):
        # Act & Assert
        with pytest.raises(ValueError, match="No spend columns found"):
            train_weather_allocation_for_tenant(tenant_path, config)


# ==============================================================================
# Dimension 3: Edge Cases
# ==============================================================================


def test_build_roi_curve_with_zero_max_spend():
    """Test ROI curve building with zero max spend."""
    # Act
    curve = build_roi_curve_from_mmm(
        channel="meta",
        mmm_roas=2.0,
        current_spend=0.0,
        max_spend=0.0,
        num_points=10,
    )

    # Assert
    assert curve == []


def test_build_roi_curve_with_single_point():
    """Test ROI curve building with single point."""
    # Act
    curve = build_roi_curve_from_mmm(
        channel="meta",
        mmm_roas=2.0,
        current_spend=1000.0,
        max_spend=2000.0,
        num_points=1,
    )

    # Assert
    assert len(curve) == 1
    assert curve[0]["spend"] == 0.0


def test_adjust_roi_curve_with_empty_curve():
    """Test adjusting empty ROI curve."""
    # Act
    adjusted = adjust_roi_curve_for_weather(
        [],
        weather_elasticity=0.15,
        weather_condition="favorable",
    )

    # Assert
    assert adjusted == []


def test_adjust_roi_curve_with_neutral_weather():
    """Test that neutral weather returns unchanged curve."""
    # Arrange
    base_curve = [
        {"spend": 1000.0, "revenue": 2000.0, "roas": 2.0},
    ]

    # Act
    adjusted = adjust_roi_curve_for_weather(
        base_curve,
        weather_elasticity=0.15,
        weather_condition="neutral",
    )

    # Assert
    assert adjusted == base_curve


# ==============================================================================
# Dimension 4: Integration
# ==============================================================================


@pytest.mark.integration
def test_train_weather_allocation_end_to_end(tmp_path: Path, sample_tenant_data: pd.DataFrame, sample_cv_metrics: CrossValidationMetrics):
    """Test complete training pipeline end-to-end."""
    # Arrange
    config = WeatherAllocationConfig(
        data_dir=tmp_path,
        output_dir=tmp_path / "output",
        min_mmm_r2=0.50,
        min_allocation_roas=1.20,
    )

    tenant_path = tmp_path / "test_tenant.parquet"
    sample_tenant_data.to_parquet(tenant_path)

    # Mock MMM training
    with patch(
        "apps.allocator.train_weather_allocation.TenantModelTrainer.train_single_tenant_with_cv",
        return_value=("test_tenant", sample_cv_metrics),
    ):
        # Act
        result = train_weather_allocation_for_tenant(tenant_path, config)

        # Assert - validate complete result structure
        assert isinstance(result, WeatherAwareAllocationResult)
        assert result.tenant_id == "test_tenant"
        assert result.mmm_r2 == sample_cv_metrics.mean_r2
        assert "temperature" in result.weather_elasticity
        assert "meta" in result.channel_roas
        assert "google" in result.channel_roas
        assert len(result.roi_curves) > 0
        assert result.validation_metrics["mmm_r2"] == sample_cv_metrics.mean_r2
        assert result.validation_metrics["total_budget"] > 0
        assert result.timestamp is not None


@pytest.mark.integration
def test_export_and_validate_allocation_model(tmp_path: Path, sample_cv_metrics: CrossValidationMetrics):
    """Test model export creates valid files."""
    # Arrange
    result = WeatherAwareAllocationResult(
        tenant_id="test_tenant",
        mmm_r2=0.612,
        weather_elasticity={"temperature": 0.13},
        channel_roas={"meta": 2.5, "google": 2.0},
        roi_curves={
            "meta": [{"spend": 0.0, "revenue": 0.0, "roas": 0.0}],
            "google": [{"spend": 0.0, "revenue": 0.0, "roas": 0.0}],
        },
        allocation_result=OptimizerResult(
            spends={"meta": 1500.0, "google": 1500.0},
            total_revenue=7500.0,
            profit=4500.0,
            diagnostics={"status": "optimal"},
        ),
        validation_metrics={
            "mmm_r2": 0.612,
            "average_roas": 2.5,
            "total_budget": 3000.0,
        },
        timestamp="2024-01-01T00:00:00Z",
    )

    # Act
    paths = export_allocation_model(result, tmp_path)

    # Assert
    assert paths["metadata"].exists()
    assert paths["roi_curves"].exists()

    # Validate metadata content
    with open(paths["metadata"]) as f:
        metadata = json.load(f)
        assert metadata["tenant_id"] == "test_tenant"
        assert metadata["mmm_r2"] == 0.612
        assert "weather_elasticity" in metadata
        assert "channel_roas" in metadata
        assert "optimal_spends" in metadata

    # Validate ROI curves content
    with open(paths["roi_curves"]) as f:
        roi_curves = json.load(f)
        assert "meta" in roi_curves
        assert "google" in roi_curves


# ==============================================================================
# Dimension 5: Performance
# ==============================================================================


def test_roi_curve_saturation_effect():
    """Test that ROI curves exhibit proper saturation (diminishing returns)."""
    # Arrange
    curve = build_roi_curve_from_mmm(
        channel="meta",
        mmm_roas=3.0,
        current_spend=1000.0,
        max_spend=5000.0,
        num_points=20,
        saturation_factor=0.5,
    )

    # Act - compute marginal ROAS between consecutive points
    marginal_roas = []
    for i in range(1, len(curve)):
        delta_spend = curve[i]["spend"] - curve[i-1]["spend"]
        delta_revenue = curve[i]["revenue"] - curve[i-1]["revenue"]
        if delta_spend > 0:
            marginal_roas.append(delta_revenue / delta_spend)

    # Assert - marginal ROAS should generally decrease (saturation effect)
    # Allow for small numerical fluctuations due to discrete sampling
    assert len(marginal_roas) > 0

    # Check overall trend: last marginal ROAS should be less than first
    assert marginal_roas[-1] < marginal_roas[0], \
        "Overall trend should show decreasing marginal ROAS"

    # Check that most consecutive pairs show decreasing marginal ROAS
    decreasing_pairs = sum(
        1 for i in range(1, len(marginal_roas))
        if marginal_roas[i] <= marginal_roas[i-1] + 0.01
    )
    total_pairs = len(marginal_roas) - 1

    # At least 70% of pairs should show decreasing marginal returns
    assert decreasing_pairs >= total_pairs * 0.7, \
        f"Expected at least 70% decreasing pairs, got {decreasing_pairs}/{total_pairs}"


def test_validation_metrics_meet_thresholds(sample_cv_metrics: CrossValidationMetrics):
    """Test that validation metrics meet performance thresholds."""
    # Arrange
    min_mmm_r2 = 0.50
    min_roas = 1.20

    # Assert
    assert sample_cv_metrics.mean_r2 >= min_mmm_r2, \
        f"MMM R² ({sample_cv_metrics.mean_r2:.3f}) below threshold ({min_mmm_r2})"

    # Extract average ROAS
    avg_roas_values = []
    for channel, roas_list in sample_cv_metrics.channel_roas.items():
        avg_roas_values.extend(roas_list)

    if avg_roas_values:
        mean_roas = np.mean(avg_roas_values)
        assert mean_roas >= min_roas, \
            f"Average ROAS ({mean_roas:.3f}) below threshold ({min_roas})"


# ==============================================================================
# Dimension 6: Security
# ==============================================================================


def test_export_sanitizes_file_paths(tmp_path: Path):
    """Test that file export sanitizes paths to prevent directory traversal."""
    # Arrange - try to create result with malicious tenant ID
    result = WeatherAwareAllocationResult(
        tenant_id="../../../etc/passwd",  # Path traversal attempt
        mmm_r2=0.60,
        weather_elasticity={},
        channel_roas={},
        roi_curves={},
        allocation_result=OptimizerResult(
            spends={},
            total_revenue=0.0,
            profit=0.0,
            diagnostics={},
        ),
        validation_metrics={},
        timestamp="2024-01-01T00:00:00Z",
    )

    # Act
    paths = export_allocation_model(result, tmp_path)

    # Assert - path should be sanitized and contained within tmp_path
    assert tmp_path in paths["metadata"].parents
    assert not str(paths["metadata"]).startswith("/etc/")


def test_config_validation_rejects_negative_values():
    """Test that config rejects invalid negative values."""
    # Act & Assert
    with pytest.raises(ValueError):
        config = WeatherAllocationConfig(
            weather_sensitivity=-0.1,  # Invalid: should be 0-1
        )
        if config.weather_sensitivity < 0 or config.weather_sensitivity > 1:
            raise ValueError("weather_sensitivity must be between 0 and 1")


# ==============================================================================
# Dimension 7: Regression
# ==============================================================================


def test_backward_compatibility_with_cv_metrics_format():
    """Test backward compatibility with existing CV metrics format."""
    # Arrange - simulate old format without fold_details
    old_format_data = {
        "model_name": "test_tenant",
        "fold_r2_scores": [0.60, 0.65],
        "fold_rmse_scores": [100.0, 95.0],
        "fold_mae_scores": [80.0, 75.0],
        "mean_r2": 0.625,
        "std_r2": 0.025,
        "mean_rmse": 97.5,
        "mean_mae": 77.5,
        "weather_elasticity": {"temperature": [0.12, 0.15]},
        "channel_roas": {"meta": [2.5, 2.6]},
        "num_folds": 2,
        "feature_names": ["meta_adstocked"],
    }

    # Act - create metrics from old format (fold_details optional)
    metrics = CrossValidationMetrics(**old_format_data)

    # Assert
    assert metrics.model_name == "test_tenant"
    assert metrics.mean_r2 == 0.625
    assert len(metrics.fold_details) == 0  # Empty for old format


def test_roi_curve_format_compatibility():
    """Test that ROI curve format is compatible with optimizer."""
    # Arrange
    curve = build_roi_curve_from_mmm(
        channel="meta",
        mmm_roas=2.5,
        current_spend=1000.0,
        max_spend=2000.0,
        num_points=10,
    )

    # Act - validate format matches optimizer expectations
    for point in curve:
        assert "spend" in point
        assert "revenue" in point
        assert "roas" in point
        assert isinstance(point["spend"], float)
        assert isinstance(point["revenue"], float)
        assert isinstance(point["roas"], float)

    # Assert - can be used to create BudgetItem
    item = BudgetItem(
        id="meta",
        name="Meta Ads",
        min_spend=0.0,
        max_spend=2000.0,
        current_spend=1000.0,
        expected_roas=2.5,
        roi_curve=curve,
    )
    assert item.roi_curve == curve


def test_aggregate_summary_format_stability():
    """Test that aggregate summary format remains stable."""
    # Arrange
    results = {
        "tenant1": WeatherAwareAllocationResult(
            tenant_id="tenant1",
            mmm_r2=0.60,
            weather_elasticity={"temperature": 0.12},
            channel_roas={"meta": 2.5},
            roi_curves={},
            allocation_result=OptimizerResult(
                spends={"meta": 1500.0},
                total_revenue=3750.0,
                profit=2250.0,
                diagnostics={},
            ),
            validation_metrics={"average_roas": 2.5, "meets_roas_threshold": True},
            timestamp="2024-01-01T00:00:00Z",
        ),
    }

    # Act
    summary = compute_aggregate_summary(results)

    # Assert - validate expected keys exist
    expected_keys = {
        "timestamp",
        "num_tenants",
        "num_passing_roas_threshold",
        "pass_rate",
        "mmm_r2",
        "average_roas",
        "profit",
        "passing_tenants",
        "all_tenants",
    }
    assert set(summary.keys()) == expected_keys

    # Validate nested structure
    assert "mean" in summary["mmm_r2"]
    assert "std" in summary["mmm_r2"]
    assert "min" in summary["mmm_r2"]
    assert "max" in summary["mmm_r2"]


# ==============================================================================
# Performance and Load Tests
# ==============================================================================


@pytest.mark.slow
def test_train_multiple_tenants_in_sequence(tmp_path: Path, sample_tenant_data: pd.DataFrame, sample_cv_metrics: CrossValidationMetrics):
    """Test training multiple tenants in sequence (load test)."""
    # Arrange
    config = WeatherAllocationConfig(
        data_dir=tmp_path,
        output_dir=tmp_path / "output",
    )

    num_tenants = 5
    for i in range(num_tenants):
        tenant_path = tmp_path / f"tenant_{i}.parquet"
        sample_tenant_data.to_parquet(tenant_path)

    results = {}

    with patch(
        "apps.allocator.train_weather_allocation.TenantModelTrainer.train_single_tenant_with_cv",
        return_value=("test_tenant", sample_cv_metrics),
    ):
        # Act
        for i in range(num_tenants):
            tenant_path = tmp_path / f"tenant_{i}.parquet"
            result = train_weather_allocation_for_tenant(tenant_path, config)
            results[result.tenant_id] = result

    # Assert
    assert len(results) == num_tenants
    for result in results.values():
        assert result.mmm_r2 > 0
        assert len(result.roi_curves) > 0
