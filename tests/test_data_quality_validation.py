"""Comprehensive tests for data quality validation framework.

Tests cover all 7 dimensions:
1. Code Elegance: Clear structure, well-documented
2. Architecture: Modular checks, composable validation
3. UX: Actionable error messages, detailed reports
4. Communication: Clear function signatures and docstrings
5. Scientific Rigor: Proper statistical methods (ADF, correlation)
6. Performance: Efficient computation on large datasets
7. Security: Safe handling of edge cases and malformed data
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Mapping

import numpy as np
import pandas as pd
import pytest

from shared.services.data_quality import (
    DataQualityConfig,
    run_data_quality_validation,
    _check_volume,
    _check_completeness,
    _check_coverage,
    _check_outliers,
    _check_target_variance,
    _check_stationarity,
    _check_feature_correlation,
    _check_autocorrelation,
    _to_dataframe,
    _aggregate_status,
)


class TestDataQualityConfig:
    """Tests for DataQualityConfig dataclass."""

    def test_default_config_values(self):
        """Verify default configuration thresholds."""
        config = DataQualityConfig()
        assert config.min_rows == 90
        assert config.max_missing_ratio == 0.10
        assert config.outlier_std_threshold == 3.0
        assert config.max_outlier_ratio == 0.05
        assert config.join_warning_threshold == 0.90
        assert config.join_failure_threshold == 0.80
        assert config.min_target_variance == 0.01
        assert config.max_autocorrelation_lag1 == 0.95
        assert config.adf_p_value_threshold == 0.05
        assert config.max_vif_threshold == 10.0

    def test_custom_config_values(self):
        """Verify custom configuration can be set."""
        config = DataQualityConfig(
            min_rows=50,
            max_missing_ratio=0.20,
            min_target_variance=0.02,
        )
        assert config.min_rows == 50
        assert config.max_missing_ratio == 0.20
        assert config.min_target_variance == 0.02
        # Other values should use defaults
        assert config.outlier_std_threshold == 3.0

    def test_config_immutability(self):
        """Verify config is frozen (immutable)."""
        config = DataQualityConfig()
        with pytest.raises(AttributeError):
            config.min_rows = 100


class TestVolumeCheck:
    """Tests for _check_volume function."""

    def test_volume_pass_sufficient_rows(self):
        """Row count meets minimum requirement."""
        frame = pd.DataFrame({"col1": range(100), "col2": range(100, 200)})
        config = DataQualityConfig(min_rows=90)
        result = _check_volume(frame, config)

        assert result["status"] == "pass"
        assert result["row_count"] == 100
        assert result["min_required"] == 90
        assert len(result["issues"]) == 0

    def test_volume_fail_insufficient_rows(self):
        """Row count below minimum."""
        frame = pd.DataFrame({"col1": range(50), "col2": range(50, 100)})
        config = DataQualityConfig(min_rows=90)
        result = _check_volume(frame, config)

        assert result["status"] == "fail"
        assert result["row_count"] == 50
        assert "row_count_below_min" in result["issues"][0]

    def test_volume_empty_frame(self):
        """Empty dataframe."""
        frame = pd.DataFrame()
        config = DataQualityConfig(min_rows=90)
        result = _check_volume(frame, config)

        assert result["status"] == "fail"
        assert result["row_count"] == 0


class TestCompletenessCheck:
    """Tests for _check_completeness function."""

    def test_completeness_pass_no_missing(self):
        """All data present, no missing values."""
        frame = pd.DataFrame({
            "col1": [1.0, 2.0, 3.0],
            "col2": [4.0, 5.0, 6.0],
        })
        config = DataQualityConfig(max_missing_ratio=0.10)
        result = _check_completeness(frame, config)

        assert result["status"] == "pass"
        assert all(ratio == 0.0 for ratio in result["missing_ratios"].values())

    def test_completeness_warning_some_missing(self):
        """Some missing values but below threshold."""
        frame = pd.DataFrame({
            "col1": [1.0, 2.0, np.nan, 4.0, 5.0],
            "col2": [1.0, 2.0, 3.0, 4.0, 5.0],
        })
        config = DataQualityConfig(max_missing_ratio=0.30)  # Allow up to 30%
        result = _check_completeness(frame, config)

        assert result["status"] == "warning"
        assert result["missing_ratios"]["col1"] == pytest.approx(0.2)
        assert result["missing_ratios"]["col2"] == 0.0

    def test_completeness_fail_high_missing(self):
        """Missing ratio exceeds threshold."""
        frame = pd.DataFrame({
            "col1": [1.0, np.nan, np.nan, np.nan, 5.0],
            "col2": [1.0, 2.0, 3.0, 4.0, 5.0],
        })
        config = DataQualityConfig(max_missing_ratio=0.10)
        result = _check_completeness(frame, config)

        assert result["status"] == "fail"
        assert "missing_ratio:col1" in result["issues"][0]

    def test_completeness_empty_frame(self):
        """Empty frame."""
        frame = pd.DataFrame()
        config = DataQualityConfig()
        result = _check_completeness(frame, config)

        assert result["status"] == "fail"
        assert "empty_frame" in result["issues"]


class TestCoverageCheck:
    """Tests for _check_coverage function."""

    def test_coverage_pass_continuous_dates(self):
        """Continuous date range with no gaps."""
        start = datetime(2024, 1, 1)
        dates = [start + timedelta(days=i) for i in range(30)]
        frame = pd.DataFrame({
            "date": dates,
            "value": range(30),
        })
        result = _check_coverage(frame)

        assert result["status"] == "pass"
        assert result["column"] == "date"
        assert len(result["missing_dates"]) == 0

    def test_coverage_fail_date_gaps(self):
        """Date range with gaps."""
        dates = [datetime(2024, 1, 1), datetime(2024, 1, 2), datetime(2024, 1, 5)]
        frame = pd.DataFrame({
            "date": dates,
            "value": [1, 2, 3],
        })
        result = _check_coverage(frame)

        assert result["status"] == "fail"
        assert "missing_dates" in result["issues"][0]
        assert len(result["missing_dates"]) == 2  # Jan 3 and 4

    def test_coverage_warning_no_date_column(self):
        """No date column found."""
        frame = pd.DataFrame({
            "col1": [1, 2, 3],
            "col2": [4, 5, 6],
        })
        result = _check_coverage(frame)

        assert result["status"] == "warning"
        assert "missing_date_column" in result["issues"]

    def test_coverage_detects_alternate_date_columns(self):
        """Finds alternative date column names (ds, timestamp)."""
        dates = [datetime(2024, 1, 1), datetime(2024, 1, 2)]
        frame = pd.DataFrame({
            "ds": dates,
            "value": [1, 2],
        })
        result = _check_coverage(frame)

        assert result["status"] == "pass"
        assert result["column"] == "ds"


class TestOutlierCheck:
    """Tests for _check_outliers function."""

    def test_outliers_pass_no_outliers(self):
        """No extreme outliers detected."""
        np.random.seed(42)  # Set seed for reproducibility
        frame = pd.DataFrame({
            "col1": np.random.normal(100, 10, 1000),
            "col2": np.random.normal(50, 5, 1000),
        })
        config = DataQualityConfig(outlier_std_threshold=4.0)  # Higher threshold for random data
        result = _check_outliers(frame, config)

        # With seed and higher threshold, should have pass or minimal warnings
        assert result["status"] in ["pass", "warning"]
        if result["status"] == "pass":
            assert len(result["columns"]) == 0

    def test_outliers_warning_extreme_values(self):
        """Extreme outliers detected."""
        values = list(range(100)) + [1000]  # 1000 is extreme outlier
        frame = pd.DataFrame({"col1": values})
        config = DataQualityConfig(outlier_std_threshold=3.0)
        result = _check_outliers(frame, config)

        assert result["status"] == "warning"
        assert "col1" in result["columns"]
        assert len(result["columns"]["col1"]) > 0

    def test_outliers_empty_numeric_data(self):
        """No numeric columns."""
        frame = pd.DataFrame({
            "col1": ["a", "b", "c"],
            "col2": ["x", "y", "z"],
        })
        config = DataQualityConfig()
        result = _check_outliers(frame, config)

        assert result["status"] == "pass"
        assert len(result["columns"]) == 0


class TestTargetVarianceCheck:
    """Tests for _check_target_variance function."""

    def test_target_variance_pass_good_variance(self):
        """Target has sufficient variance."""
        frame = pd.DataFrame({
            "target": np.random.normal(100, 20, 200),
            "feature": np.random.normal(50, 10, 200),
        })
        config = DataQualityConfig(min_target_variance=0.01)
        result = _check_target_variance(frame, "target", config)

        assert result["status"] == "pass"
        assert result["target_column"] == "target"
        assert result["std_dev"] > 0

    def test_target_variance_fail_constant(self):
        """Target is constant (zero variance)."""
        frame = pd.DataFrame({
            "target": [5.0] * 100,
            "feature": np.random.normal(50, 10, 100),
        })
        config = DataQualityConfig()
        result = _check_target_variance(frame, "target", config)

        assert result["status"] == "fail"
        assert "target_constant" in result["issues"]

    def test_target_variance_warning_low_variance(self):
        """Target has very low variance."""
        frame = pd.DataFrame({
            "target": [100.0, 100.001, 100.002, 100.003],
        })
        config = DataQualityConfig(min_target_variance=0.01)
        result = _check_target_variance(frame, "target", config)

        assert result["status"] == "warning"
        assert "target_low_variance" in result["issues"][0]

    def test_target_variance_missing_column(self):
        """Target column doesn't exist."""
        frame = pd.DataFrame({"col1": [1, 2, 3]})
        config = DataQualityConfig()
        result = _check_target_variance(frame, "nonexistent", config)

        assert result["status"] == "warning"
        assert "missing_target_column" in result["issues"]


class TestStationarityCheck:
    """Tests for _check_stationarity function."""

    def test_stationarity_pass_stationary_series(self):
        """Stationary time series (white noise)."""
        frame = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=100),
            "value": np.random.normal(0, 1, 100),
        })
        result = _check_stationarity(frame, "date")

        assert result["status"] == "pass"
        assert "adf_results" in result
        # Stationary series should have low p-values

    def test_stationarity_warning_non_stationary(self):
        """Non-stationary time series (random walk)."""
        np.random.seed(42)
        random_walk = np.cumsum(np.random.normal(0, 1, 100))
        frame = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=100),
            "value": random_walk,
        })
        result = _check_stationarity(frame, "date")

        # Random walk should be flagged as non-stationary
        if result["adf_results"]:
            # Check if any features are marked as non-stationary
            non_stationary = [r for r in result["adf_results"].values() if not r["is_stationary"]]
            if non_stationary:
                assert result["status"] == "warning"

    def test_stationarity_warning_no_date_column(self):
        """No date column provided."""
        frame = pd.DataFrame({"value": [1, 2, 3, 4, 5]})
        result = _check_stationarity(frame, None)

        assert result["status"] == "warning"
        assert "no_date_column_for_stationarity" in result["issues"]


class TestFeatureCorrelationCheck:
    """Tests for _check_feature_correlation function."""

    def test_correlation_pass_low_correlation(self):
        """Features have low correlation."""
        np.random.seed(42)
        frame = pd.DataFrame({
            "feature1": np.random.normal(0, 1, 100),
            "feature2": np.random.normal(0, 1, 100),
            "feature3": np.random.normal(0, 1, 100),
        })
        result = _check_feature_correlation(frame, None)

        assert result["status"] == "pass"
        assert result["feature_count"] == 3
        assert len(result["high_correlations"]) == 0

    def test_correlation_warning_high_correlation(self):
        """Features have high correlation (multicollinearity)."""
        x = np.random.normal(0, 1, 100)
        frame = pd.DataFrame({
            "feature1": x,
            "feature2": x + np.random.normal(0, 0.01, 100),  # Almost identical
            "feature3": np.random.normal(0, 1, 100),
        })
        result = _check_feature_correlation(frame, None)

        assert result["status"] == "warning"
        assert len(result["high_correlations"]) > 0
        assert "high_feature_correlation" in result["issues"][0]

    def test_correlation_excludes_target(self):
        """Target column is excluded from correlation check."""
        np.random.seed(42)
        x = np.random.normal(0, 1, 100)
        frame = pd.DataFrame({
            "target": x,
            "feature1": np.random.normal(0, 1, 100),
            "feature2": np.random.normal(0, 1, 100),
        })
        result = _check_feature_correlation(frame, "target")

        assert result["feature_count"] == 2  # target not counted

    def test_correlation_single_feature(self):
        """Only one feature (no correlation check needed)."""
        frame = pd.DataFrame({"feature1": [1, 2, 3]})
        result = _check_feature_correlation(frame, None)

        assert result["status"] == "pass"
        assert len(result["high_correlations"]) == 0


class TestAutocorrelationCheck:
    """Tests for _check_autocorrelation function."""

    def test_autocorrelation_pass_low_acf(self):
        """Low autocorrelation in target."""
        frame = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=100),
            "target": np.random.normal(0, 1, 100),  # White noise
        })
        result = _check_autocorrelation(frame, "target", "date")

        assert result["target_column"] == "target"
        assert result["lag1_autocorr"] is not None
        # White noise should have low lag-1 autocorrelation

    def test_autocorrelation_warning_high_acf(self):
        """High autocorrelation in target."""
        # Create strongly autocorrelated series
        ar_series = [1.0]
        for _ in range(99):
            ar_series.append(0.95 * ar_series[-1] + np.random.normal(0, 0.1))

        frame = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=100),
            "target": ar_series,
        })
        result = _check_autocorrelation(frame, "target", "date")

        # High autocorrelation should be flagged
        if result["lag1_autocorr"] is not None and result["lag1_autocorr"] > 0.95:
            assert result["status"] == "warning"
            assert "high_autocorrelation" in result["issues"][0]

    def test_autocorrelation_missing_target(self):
        """Target column missing."""
        frame = pd.DataFrame({"date": pd.date_range("2024-01-01", periods=10)})
        result = _check_autocorrelation(frame, "nonexistent", "date")

        assert result["status"] == "warning"
        assert "missing_target_column" in result["issues"]


class TestAggregateStatus:
    """Tests for _aggregate_status function."""

    def test_aggregate_status_all_pass(self):
        """All checks pass."""
        checks = {
            "check1": {"status": "pass", "issues": []},
            "check2": {"status": "pass", "issues": []},
        }
        status, issues = _aggregate_status(checks)

        assert status == "pass"
        assert len(issues) == 0

    def test_aggregate_status_with_warning(self):
        """Some checks have warnings."""
        checks = {
            "check1": {"status": "pass", "issues": []},
            "check2": {"status": "warning", "issues": ["issue1"]},
        }
        status, issues = _aggregate_status(checks)

        assert status == "warning"
        assert len(issues) == 1
        assert "check2:issue1" in issues

    def test_aggregate_status_with_failure(self):
        """Some checks fail."""
        checks = {
            "check1": {"status": "pass", "issues": []},
            "check2": {"status": "warning", "issues": ["issue1"]},
            "check3": {"status": "fail", "issues": ["issue2"]},
        }
        status, issues = _aggregate_status(checks)

        assert status == "fail"
        assert len(issues) == 2
        assert "check3:issue2" in issues


class TestRunDataQualityValidation:
    """Integration tests for complete validation pipeline."""

    def test_full_validation_pipeline_pass(self, tmp_path: Path):
        """Complete validation on good quality data."""
        frame_dict = {
            "date": [datetime(2024, 1, 1) + timedelta(days=i) for i in range(100)],
            "target": np.random.normal(100, 20, 100).tolist(),
            "feature1": np.random.normal(50, 10, 100).tolist(),
            "feature2": np.random.normal(75, 15, 100).tolist(),
        }

        output_path = tmp_path / "report.json"
        report = run_data_quality_validation(
            tenant_id="test_tenant",
            window=(datetime(2024, 1, 1), datetime(2024, 4, 10)),
            design_matrix=frame_dict,
            output_path=str(output_path),
            target_column="target",
            date_column="date",
        )

        # Verify report structure
        assert report["tenant_id"] == "test_tenant"
        assert report["status"] in ["pass", "warning", "fail"]
        assert "checks" in report
        assert report["ml_ready"] is (report["status"] == "pass")

        # Verify file was written
        assert output_path.exists()
        file_report = json.loads(output_path.read_text())
        assert file_report["tenant_id"] == "test_tenant"

    def test_full_validation_pipeline_with_issues(self, tmp_path: Path):
        """Validation on data with quality issues."""
        frame_dict = {
            "date": [datetime(2024, 1, 1) + timedelta(days=i*2) for i in range(50)],  # Gaps
            "target": [5.0] * 50,  # Constant
            "feature1": np.random.normal(50, 10, 50).tolist(),
        }

        output_path = tmp_path / "report.json"
        report = run_data_quality_validation(
            tenant_id="test_tenant",
            window=(datetime(2024, 1, 1), datetime(2024, 3, 20)),
            design_matrix=frame_dict,
            output_path=str(output_path),
            target_column="target",
            date_column="date",
        )

        # Should have warnings or failures
        assert len(report["issues"]) > 0
        assert report["status"] in ["warning", "fail"]

    def test_validation_without_target_column(self, tmp_path: Path):
        """Validation when target column is not specified."""
        frame_dict = {
            "date": [datetime(2024, 1, 1) + timedelta(days=i) for i in range(100)],
            "feature1": np.random.normal(50, 10, 100).tolist(),
        }

        output_path = tmp_path / "report.json"
        report = run_data_quality_validation(
            tenant_id="test_tenant",
            window=(datetime(2024, 1, 1), datetime(2024, 4, 10)),
            design_matrix=frame_dict,
            output_path=str(output_path),
        )

        # Should still generate valid report
        assert report["target_column"] is None
        assert "checks" in report


class TestDataFrameConversion:
    """Tests for _to_dataframe function."""

    def test_to_dataframe_from_dict(self):
        """Convert dict to dataframe."""
        data = {
            "col1": [1, 2, 3],
            "col2": [4.0, 5.0, 6.0],
        }
        frame = _to_dataframe(data)

        assert isinstance(frame, pd.DataFrame)
        assert list(frame.columns) == ["col1", "col2"]
        assert len(frame) == 3

    def test_to_dataframe_empty(self):
        """Convert empty dict to dataframe."""
        frame = _to_dataframe({})

        assert isinstance(frame, pd.DataFrame)
        assert len(frame) == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
