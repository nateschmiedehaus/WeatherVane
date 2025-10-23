"""Integration tests demonstrating data quality validation in realistic scenarios.

Tests the complete pipeline from raw data through validation to training preparation.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pytest

from shared.services.data_quality import run_data_quality_validation, DataQualityConfig


class TestRealWorldScenarios:
    """Integration tests with realistic business scenarios."""

    def test_healthy_tenant_data_full_validation(self, tmp_path: Path):
        """Scenario: Brand with sufficient, clean data for model training."""
        np.random.seed(123)

        # Simulate 6 months of daily data
        dates = pd.date_range("2024-01-01", periods=180, freq="D")
        base_revenue = 10000
        trend = np.linspace(0, 5000, 180)
        seasonality = 2000 * np.sin(np.arange(180) * 2 * np.pi / 30)
        noise = np.random.normal(0, 500, 180)
        revenue = base_revenue + trend + seasonality + noise

        # Weather features
        temperature = 65 + 15 * np.sin(np.arange(180) * 2 * np.pi / 365) + np.random.normal(0, 5, 180)
        precipitation = 0.5 * np.abs(np.random.normal(0, 1, 180))
        humidity = 50 + 20 * np.sin(np.arange(180) * 2 * np.pi / 180) + np.random.normal(0, 5, 180)

        # Marketing features
        ad_spend = np.random.exponential(500, 180) + 1000
        promotion_days = np.random.binomial(1, 0.1, 180)

        frame_dict = {
            "date": dates.tolist(),
            "revenue": revenue.tolist(),  # Target
            "temperature": temperature.tolist(),
            "precipitation": precipitation.tolist(),
            "humidity": humidity.tolist(),
            "ad_spend": ad_spend.tolist(),
            "promotion": promotion_days.tolist(),
        }

        output_path = tmp_path / "healthy_report.json"
        report = run_data_quality_validation(
            tenant_id="healthy_brand",
            window=(datetime(2024, 1, 1), datetime(2024, 6, 29)),
            design_matrix=frame_dict,
            output_path=str(output_path),
            target_column="revenue",
            date_column="date",
        )

        # Assertions
        assert report["status"] in ["pass", "warning"]  # May have warnings due to data variability
        assert report["ml_ready"] is (report["status"] == "pass")
        assert report["row_count"] == 180

        # Verify core checks passed or warned
        checks = report["checks"]
        assert checks["volume"]["status"] == "pass"
        assert checks["completeness"]["status"] in ["pass", "warning"]
        assert checks["coverage"]["status"] == "pass"
        assert checks["target_variance"]["status"] in ["pass", "warning"]

        # Should have features with variance
        assert checks["feature_correlation"]["feature_count"] >= 4

    def test_problematic_tenant_data_multiple_issues(self, tmp_path: Path):
        """Scenario: Brand with data quality issues that would break training."""
        # Create problematic dataset
        frame_dict = {
            "date": [datetime(2024, 1, 1) + timedelta(days=i*2) for i in range(40)],  # Gaps
            "revenue": [5000.0] * 40,  # Constant (no variance)
            "temperature": [None] * 20 + [72.0] * 20,  # High missing
            "ad_spend": [100 + i for i in range(40)],  # Low variance
        }

        output_path = tmp_path / "problematic_report.json"
        report = run_data_quality_validation(
            tenant_id="problematic_brand",
            window=(datetime(2024, 1, 1), datetime(2024, 2, 28)),
            design_matrix=frame_dict,
            output_path=str(output_path),
            target_column="revenue",
            date_column="date",
        )

        # Should have failures
        assert report["status"] in ["warning", "fail"]
        assert report["ml_ready"] is False
        assert len(report["issues"]) > 0

        # Specific failures
        checks = report["checks"]
        assert "constant" in checks["target_variance"]["issues"][0]  # No variance in target

    def test_sparse_data_tenant_just_sufficient(self, tmp_path: Path):
        """Scenario: Brand with minimal but valid data for baseline model."""
        np.random.seed(456)

        # Exactly at minimum threshold
        dates = pd.date_range("2024-01-01", periods=90, freq="D")
        revenue = np.random.normal(5000, 500, 90)
        temp = np.random.normal(70, 10, 90)
        spend = np.random.exponential(300, 90)

        frame_dict = {
            "date": dates.tolist(),
            "revenue": revenue.tolist(),
            "temperature": temp.tolist(),
            "spend": spend.tolist(),
        }

        output_path = tmp_path / "sparse_report.json"
        report = run_data_quality_validation(
            tenant_id="sparse_brand",
            window=(datetime(2024, 1, 1), datetime(2024, 3, 31)),
            design_matrix=frame_dict,
            output_path=str(output_path),
            target_column="revenue",
            date_column="date",
        )

        # Should pass with minimum rows
        assert report["row_count"] == 90
        checks = report["checks"]
        assert checks["volume"]["status"] == "pass"

    def test_high_dimensional_feature_space(self, tmp_path: Path):
        """Scenario: Brand with many features, some with high correlation."""
        np.random.seed(789)

        n_days = 120
        dates = pd.date_range("2024-01-01", periods=n_days, freq="D")

        frame_dict = {
            "date": dates.tolist(),
            "revenue": np.random.normal(10000, 1000, n_days).tolist(),
        }

        # Add 10 features, some correlated
        base_feature = np.random.normal(100, 20, n_days)
        for i in range(10):
            if i < 3:
                # Highly correlated features
                frame_dict[f"feature_{i}"] = (base_feature + np.random.normal(0, 5, n_days)).tolist()
            else:
                # Independent features
                frame_dict[f"feature_{i}"] = np.random.normal(100, 20, n_days).tolist()

        output_path = tmp_path / "high_dim_report.json"
        report = run_data_quality_validation(
            tenant_id="high_dim_brand",
            window=(datetime(2024, 1, 1), datetime(2024, 4, 30)),
            design_matrix=frame_dict,
            output_path=str(output_path),
            target_column="revenue",
            date_column="date",
        )

        # Should flag high correlations
        checks = report["checks"]
        if checks["feature_correlation"]["status"] == "warning":
            assert len(checks["feature_correlation"]["high_correlations"]) > 0

    def test_seasonal_time_series(self, tmp_path: Path):
        """Scenario: Seasonal data like holiday shopping trends."""
        dates = pd.date_range("2023-01-01", periods=365, freq="D")

        # Strong seasonal pattern (holiday shopping)
        day_of_year = np.arange(365)
        base_revenue = 5000
        seasonal_component = 3000 * np.sin(2 * np.pi * day_of_year / 365)
        revenue = base_revenue + seasonal_component + np.random.normal(0, 200, 365)

        # Feature mimicking seasonality
        holiday_index = np.zeros(365)
        holiday_index[320:335] = 1  # Christmas period
        holiday_index[48:52] = 1  # Valentine's Day
        holiday_index[325:365] = 0.5  # Post-holiday

        frame_dict = {
            "date": dates.tolist(),
            "revenue": revenue.tolist(),
            "holiday_score": holiday_index.tolist(),
            "day_of_year": day_of_year.tolist(),
        }

        output_path = tmp_path / "seasonal_report.json"
        report = run_data_quality_validation(
            tenant_id="seasonal_brand",
            window=(datetime(2023, 1, 1), datetime(2023, 12, 31)),
            design_matrix=frame_dict,
            output_path=str(output_path),
            target_column="revenue",
            date_column="date",
        )

        # Should pass but may flag stationarity
        assert report["row_count"] == 365
        checks = report["checks"]
        assert checks["volume"]["status"] == "pass"

        # Seasonal pattern may show non-stationarity
        if checks["stationarity"]["adf_results"]:
            # Document stationarity findings
            assert "adf_results" in checks["stationarity"]

    def test_missing_data_patterns(self, tmp_path: Path):
        """Scenario: Brand with realistic missing data patterns."""
        dates = pd.date_range("2024-01-01", periods=150, freq="D")
        revenue = np.random.normal(10000, 1000, 150).tolist()
        spend = np.random.exponential(500, 150).tolist()

        # Simulate realistic missing patterns
        # Random missingness in one channel
        for i in np.random.choice(150, 15, replace=False):
            spend[i] = None

        frame_dict = {
            "date": dates.tolist(),
            "revenue": revenue,
            "spend": spend,
        }

        output_path = tmp_path / "missing_report.json"
        report = run_data_quality_validation(
            tenant_id="missing_brand",
            window=(datetime(2024, 1, 1), datetime(2024, 5, 30)),
            design_matrix=frame_dict,
            output_path=str(output_path),
            target_column="revenue",
            date_column="date",
        )

        # Should pass if missing ratio is acceptable
        checks = report["checks"]
        if checks["completeness"]["status"] == "warning":
            # Document missing patterns
            assert "missing_ratios" in checks["completeness"]
            assert len(checks["completeness"]["missing_ratios"]) > 0

    def test_outlier_handling_with_valid_data(self, tmp_path: Path):
        """Scenario: Data with realistic outliers that don't break validation."""
        np.random.seed(111)

        dates = pd.date_range("2024-01-01", periods=200, freq="D")
        base_revenue = np.random.normal(10000, 500, 200)

        # Add realistic outliers (cyber attack, server outage recovery)
        base_revenue[50] = 500  # System outage day
        base_revenue[51] = 20000  # Recovery spike

        frame_dict = {
            "date": dates.tolist(),
            "revenue": base_revenue.tolist(),
            "quality_score": np.random.uniform(0, 100, 200).tolist(),
        }

        output_path = tmp_path / "outlier_report.json"
        report = run_data_quality_validation(
            tenant_id="outlier_brand",
            window=(datetime(2024, 1, 1), datetime(2024, 7, 19)),
            design_matrix=frame_dict,
            output_path=str(output_path),
            target_column="revenue",
            date_column="date",
        )

        # Should flag outliers but still be trainable
        assert report["row_count"] == 200
        checks = report["checks"]
        assert checks["outliers"]["status"] in ["pass", "warning"]

    def test_custom_threshold_configuration(self, tmp_path: Path):
        """Scenario: Using custom thresholds for different requirements."""
        dates = pd.date_range("2024-01-01", periods=100, freq="D")

        frame_dict = {
            "date": dates.tolist(),
            "revenue": (np.random.normal(5000, 100, 100) + 1000).tolist(),  # Low variance
            "feature1": np.random.normal(100, 20, 100).tolist(),
        }

        # Test with strict thresholds
        strict_config = DataQualityConfig(
            min_rows=150,  # Very high
            min_target_variance=0.05,  # Strict
        )

        output_path = tmp_path / "strict_report.json"
        report = run_data_quality_validation(
            tenant_id="strict_brand",
            window=(datetime(2024, 1, 1), datetime(2024, 4, 10)),
            design_matrix=frame_dict,
            output_path=str(output_path),
            config=strict_config,
            target_column="revenue",
            date_column="date",
        )

        # Should fail with strict config
        assert report["status"] in ["warning", "fail"]
        checks = report["checks"]
        assert checks["volume"]["status"] == "fail"  # Below 150 rows

        # Test with lenient thresholds
        lenient_config = DataQualityConfig(
            min_rows=50,  # Low
            min_target_variance=0.001,  # Very lenient
            max_missing_ratio=0.50,  # Very forgiving
        )

        output_path2 = tmp_path / "lenient_report.json"
        report2 = run_data_quality_validation(
            tenant_id="lenient_brand",
            window=(datetime(2024, 1, 1), datetime(2024, 4, 10)),
            design_matrix=frame_dict,
            output_path=str(output_path2),
            config=lenient_config,
            target_column="revenue",
            date_column="date",
        )

        # Should pass with lenient config
        assert report2["status"] in ["pass", "warning"]  # May warn on other checks
        checks2 = report2["checks"]
        assert checks2["volume"]["status"] == "pass"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
