"""Tests for baseline comparison models."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd
import pytest

from apps.model.baseline_comparison import (
    BaselineMetrics,
    BaselineComparisonResult,
    NaiveBaseline,
    SeasonalBaseline,
    LinearBaseline,
    compute_metrics,
    compare_baselines_for_tenant,
    export_baseline_results,
)


class TestNaiveBaseline:
    """Tests for NaiveBaseline model."""

    def test_fit_mean(self):
        """Test fitting with mean method."""
        y_train = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        model = NaiveBaseline(method="mean")
        model.fit(y_train)

        assert model.forecast_value == 3.0

    def test_fit_median(self):
        """Test fitting with median method."""
        y_train = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        model = NaiveBaseline(method="median")
        model.fit(y_train)

        assert model.forecast_value == 3.0

    def test_predict(self):
        """Test prediction generates constant forecast."""
        y_train = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        model = NaiveBaseline(method="mean")
        model.fit(y_train)

        y_test = np.array([10.0, 20.0, 30.0])
        predictions = model.predict(y_test)

        assert len(predictions) == len(y_test)
        assert np.all(predictions == 3.0)

    def test_predict_before_fit_raises(self):
        """Test that predict before fit raises error."""
        model = NaiveBaseline(method="mean")
        y_test = np.array([1.0, 2.0, 3.0])

        with pytest.raises(ValueError, match="not fitted"):
            model.predict(y_test)

    def test_invalid_method_raises(self):
        """Test that invalid method raises error."""
        model = NaiveBaseline(method="invalid")
        y_train = np.array([1.0, 2.0, 3.0])

        with pytest.raises(ValueError, match="Unknown method"):
            model.fit(y_train)


class TestSeasonalBaseline:
    """Tests for SeasonalBaseline model."""

    def test_fit_basic(self):
        """Test basic seasonal fitting."""
        # Create synthetic seasonal data
        seasonal_pattern = np.array([10, 20, 15, 5])
        y_train = np.tile(seasonal_pattern, 10)  # Repeat 10 times

        model = SeasonalBaseline(seasonal_period=4)
        model.fit(y_train)

        assert len(model.seasonal_indices) == 4
        assert model.trend_mean is not None

    def test_predict_length(self):
        """Test that predictions have correct length."""
        y_train = np.random.randn(100)
        model = SeasonalBaseline(seasonal_period=52)
        model.fit(y_train)

        predictions = model.predict(20)
        assert len(predictions) == 20

    def test_predict_uses_seasonal_pattern(self):
        """Test that predictions follow seasonal pattern."""
        seasonal_pattern = np.array([100, 200, 150])
        y_train = np.tile(seasonal_pattern, 20)

        model = SeasonalBaseline(seasonal_period=3)
        model.fit(y_train)

        predictions = model.predict(9)
        # Should repeat the seasonal pattern 3 times
        expected = np.tile(seasonal_pattern, 3)
        np.testing.assert_allclose(predictions, expected, rtol=0.1)

    def test_predict_before_fit_raises(self):
        """Test that predict before fit raises error."""
        model = SeasonalBaseline(seasonal_period=4)

        with pytest.raises(ValueError, match="not fitted"):
            model.predict(10)


class TestLinearBaseline:
    """Tests for LinearBaseline model."""

    def test_fit_basic(self):
        """Test basic linear regression fitting."""
        X_train = np.array([[1, 2], [2, 3], [3, 4], [4, 5]])
        y_train = np.array([5, 8, 11, 14])  # y = 1*X1 + 2*X2 + 1

        model = LinearBaseline()
        model.fit(X_train, y_train, feature_names=["feature_1", "feature_2"])

        assert model.model is not None
        assert len(model.feature_names) == 2

    def test_predict(self):
        """Test linear regression prediction."""
        X_train = np.array([[1, 0], [2, 0], [3, 0], [4, 0]])
        y_train = np.array([1, 2, 3, 4])

        model = LinearBaseline()
        model.fit(X_train, y_train)

        X_test = np.array([[5, 0], [6, 0]])
        predictions = model.predict(X_test)

        assert len(predictions) == 2
        # Should be close to linear relationship
        assert predictions[1] > predictions[0]

    def test_predict_before_fit_raises(self):
        """Test that predict before fit raises error."""
        model = LinearBaseline()
        X_test = np.array([[1, 2], [3, 4]])

        with pytest.raises(ValueError, match="not fitted"):
            model.predict(X_test)

    def test_fit_with_regularization(self):
        """Test fitting with different regularization strengths."""
        X_train = np.random.randn(100, 5)
        y_train = np.random.randn(100)

        model_weak = LinearBaseline(regularization_strength=0.0001)
        model_strong = LinearBaseline(regularization_strength=100.0)

        model_weak.fit(X_train, y_train)
        model_strong.fit(X_train, y_train)

        # Both should fit successfully
        assert model_weak.model is not None
        assert model_strong.model is not None


class TestMetricsComputation:
    """Tests for metrics computation."""

    def test_compute_metrics_perfect_predictions(self):
        """Test metrics for perfect predictions."""
        y_true = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        y_pred = np.array([1.0, 2.0, 3.0, 4.0, 5.0])

        metrics = compute_metrics(y_true, y_pred)

        assert metrics["r2"] == pytest.approx(1.0)
        assert metrics["rmse"] == pytest.approx(0.0, abs=1e-10)
        assert metrics["mae"] == pytest.approx(0.0, abs=1e-10)
        assert metrics["mape"] == pytest.approx(0.0, abs=1e-10)

    def test_compute_metrics_constant_predictions(self):
        """Test metrics for constant predictions."""
        y_true = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
        y_pred = np.array([3.0, 3.0, 3.0, 3.0, 3.0])  # Mean value

        metrics = compute_metrics(y_true, y_pred)

        # Constant at mean should have R² = 0
        assert metrics["r2"] == pytest.approx(0.0)
        assert metrics["rmse"] > 0
        assert metrics["mae"] > 0

    def test_compute_metrics_mape_with_zeros(self):
        """Test MAPE computation handles zeros correctly."""
        y_true = np.array([0.0, 10.0, 20.0, 30.0])
        y_pred = np.array([1.0, 10.0, 20.0, 30.0])

        metrics = compute_metrics(y_true, y_pred)

        # MAPE should be computed only on non-zero values
        assert metrics["mape"] >= 0.0
        assert metrics["mape"] < float("inf")


class TestBaselineComparison:
    """Tests for complete baseline comparison."""

    def test_compare_baselines_for_tenant(self):
        """Test full baseline comparison on synthetic data."""
        # Create synthetic time series with trend and seasonality
        np.random.seed(42)
        dates = pd.date_range("2020-01-01", periods=200, freq="D")

        # Synthetic data with trend and seasonality
        trend = np.linspace(100, 120, 200)
        seasonality = 10 * np.sin(np.linspace(0, 8 * np.pi, 200))
        noise = np.random.randn(200) * 2
        revenue = trend + seasonality + noise

        spend_meta = 100 + np.random.randn(200) * 20
        spend_google = 50 + np.random.randn(200) * 10

        df = pd.DataFrame({
            "date": dates,
            "revenue": revenue,
            "meta_spend": spend_meta,
            "google_spend": spend_google,
        })

        result = compare_baselines_for_tenant(
            tenant_name="test_tenant",
            df=df,
            target_col="revenue",
            spend_cols=["meta_spend", "google_spend"],
            test_size=0.2,
            val_size=0.1,
        )

        # Check structure
        assert result.tenant_name == "test_tenant"
        assert len(result.baseline_metrics) == 3
        assert "naive" in result.baseline_metrics
        assert "seasonal" in result.baseline_metrics
        assert "linear" in result.baseline_metrics

        # Check metrics exist
        for baseline_name, metrics in result.baseline_metrics.items():
            assert metrics.model_type == baseline_name
            assert metrics.test_r2 is not None
            assert metrics.test_mape is not None
            assert metrics.rmse > 0

        # Best baseline should be one of the three
        assert result.best_baseline in ["naive", "seasonal", "linear"]

    def test_compare_baselines_missing_spend_columns(self):
        """Test comparison when spend columns are missing."""
        dates = pd.date_range("2020-01-01", periods=100, freq="D")
        df = pd.DataFrame({
            "date": dates,
            "revenue": np.random.randn(100) + 100,
        })

        result = compare_baselines_for_tenant(
            tenant_name="test_tenant",
            df=df,
            target_col="revenue",
            spend_cols=["meta_spend", "google_spend"],
        )

        # Should fallback gracefully
        assert "linear" in result.baseline_metrics
        assert result.baseline_metrics["linear"] is not None


class TestBaselineResultsExport:
    """Tests for exporting baseline results."""

    def test_export_baseline_results(self, tmp_path):
        """Test exporting baseline results to JSON."""
        result = BaselineComparisonResult(
            tenant_name="test_tenant",
            baseline_metrics={
                "naive": BaselineMetrics(
                    model_type="naive",
                    train_r2=0.1,
                    val_r2=0.08,
                    test_r2=0.05,
                    train_mape=0.25,
                    val_mape=0.30,
                    test_mape=0.35,
                    mean_absolute_error=10.0,
                    rmse=12.0,
                ),
                "linear": BaselineMetrics(
                    model_type="linear",
                    train_r2=0.3,
                    val_r2=0.28,
                    test_r2=0.25,
                    train_mape=0.15,
                    val_mape=0.18,
                    test_mape=0.20,
                    mean_absolute_error=8.0,
                    rmse=10.0,
                    feature_names=["meta_spend", "google_spend"],
                ),
            },
            best_baseline="linear",
        )

        output_path = tmp_path / "baselines.json"
        export_baseline_results([result], output_path)

        assert output_path.exists()

        with open(output_path) as f:
            exported = json.load(f)

        assert exported["total_tenants"] == 1
        assert "test_tenant" in exported["baselines_by_tenant"]
        assert exported["best_baseline_counts"]["linear"] == 1


@pytest.fixture
def sample_comparison_result() -> BaselineComparisonResult:
    """Create sample baseline comparison result."""
    return BaselineComparisonResult(
        tenant_name="sample_tenant",
        baseline_metrics={
            "naive": BaselineMetrics(
                model_type="naive",
                train_r2=0.1,
                val_r2=0.08,
                test_r2=0.05,
                train_mape=0.4,
                val_mape=0.45,
                test_mape=0.50,
                mean_absolute_error=15.0,
                rmse=18.0,
            ),
            "seasonal": BaselineMetrics(
                model_type="seasonal",
                train_r2=0.25,
                val_r2=0.22,
                test_r2=0.20,
                train_mape=0.25,
                val_mape=0.30,
                test_mape=0.35,
                mean_absolute_error=12.0,
                rmse=14.0,
            ),
            "linear": BaselineMetrics(
                model_type="linear",
                train_r2=0.35,
                val_r2=0.32,
                test_r2=0.30,
                train_mape=0.15,
                val_mape=0.18,
                test_mape=0.20,
                mean_absolute_error=8.0,
                rmse=10.0,
                feature_names=["meta_spend", "google_spend"],
            ),
        },
        mmm_metrics={
            "test_r2": 0.50,
            "test_mape": 0.15,
            "mean_r2": 0.52,
            "passes_threshold": True,
        },
        best_baseline="linear",
    )


def test_baseline_comparison_result_structure(sample_comparison_result):
    """Test BaselineComparisonResult structure."""
    result = sample_comparison_result

    assert result.tenant_name == "sample_tenant"
    assert len(result.baseline_metrics) == 3
    assert result.mmm_metrics is not None
    assert result.mmm_metrics["test_mape"] < 0.20
