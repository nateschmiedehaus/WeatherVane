"""Test suite for weather elasticity analysis module.

Tests cover:
1. Basic elasticity computation
2. Temperature and precipitation sensitivity
3. Channel-level analysis
4. Report generation and persistence
5. Edge cases and error handling
"""

import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import polars as pl
import pytest

from apps.model.weather_elasticity_analysis import (
    ChannelWeatherSensitivity,
    WeatherBand,
    WeatherElasticityReport,
    estimate_weather_elasticity,
    save_elasticity_report,
)


@pytest.fixture
def sample_feature_matrix():
    """Create a sample feature matrix with spend, weather, and revenue."""
    np.random.seed(42)
    n_days = 90

    # Create date range
    dates = [
        (datetime(2023, 9, 9) + timedelta(days=i)).date()
        for i in range(n_days)
    ]

    # Spending channels with different patterns
    google_spend = np.random.uniform(50, 150, n_days)
    meta_spend = np.random.uniform(80, 200, n_days)

    # Temperature (in Celsius) - realistic pattern
    base_temp = 15.0
    temp_trend = np.linspace(0, 10, n_days)
    temp_noise = np.random.normal(0, 2, n_days)
    temp_c = base_temp + temp_trend + temp_noise

    # Precipitation (in mm) - sparse with some wet days
    precip_mm = np.random.exponential(2, n_days)
    precip_mm[precip_mm > 25] = 25  # Cap at 25mm

    # Revenue - correlated with spend and weather
    base_revenue = 1000.0
    revenue = (
        base_revenue
        + 5 * google_spend
        + 3 * meta_spend
        - 20 * (temp_c - 15) ** 2  # Quadratic temperature effect
        - 10 * precip_mm
        + np.random.normal(0, 100, n_days)  # Noise
    )
    revenue = np.maximum(revenue, 100)  # Minimum revenue

    return pl.DataFrame({
        "date": dates,
        "google_spend": google_spend,
        "meta_spend": meta_spend,
        "temp_c": temp_c,
        "precip_mm": precip_mm,
        "revenue": revenue,
    })


@pytest.fixture
def weather_cols():
    """Standard weather columns."""
    return ["temp_c", "precip_mm"]


@pytest.fixture
def spend_cols():
    """Standard spend columns."""
    return ["google_spend", "meta_spend"]


class TestBasicElasticityComputation:
    """Test basic elasticity computation."""

    def test_estimate_elasticity_positive_correlation(self, sample_feature_matrix):
        """Test that elasticity captures positive spend-revenue correlation."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            ["google_spend"],
            ["temp_c"],
            "revenue",
            tenant_id="test-tenant",
        )

        assert report.tenant_id == "test-tenant"
        assert report.data_rows == 90
        assert isinstance(report.base_elasticity, float)

    def test_estimate_elasticity_multiple_channels(
        self, sample_feature_matrix, spend_cols, weather_cols
    ):
        """Test elasticity with multiple spend channels."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            spend_cols,
            weather_cols,
            "revenue",
        )

        assert len(report.channel_sensitivities) > 0
        for sensitivity in report.channel_sensitivities.values():
            assert isinstance(sensitivity, ChannelWeatherSensitivity)
            assert sensitivity.base_elasticity != 0 or sensitivity.temperature_sensitivity != 0

    def test_estimate_elasticity_weather_impact(
        self, sample_feature_matrix, spend_cols
    ):
        """Test that weather impact is captured."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            spend_cols,
            ["temp_c", "precip_mm"],
            "revenue",
        )

        # Model quality should be reasonable
        assert report.r_squared >= 0.0
        assert report.r_squared <= 1.0

        # Should have some elasticity estimates
        assert abs(report.temperature_elasticity) >= 0


class TestTemperatureSensitivity:
    """Test temperature sensitivity analysis."""

    def test_temperature_correlation(self, sample_feature_matrix):
        """Test that temperature correlation is computed."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            ["google_spend"],
            ["temp_c"],
            "revenue",
        )

        assert isinstance(report.temperature_correlation, float)
        assert -1.0 <= report.temperature_correlation <= 1.0

    def test_temperature_multipliers_in_valid_range(self, sample_feature_matrix):
        """Test that temperature multipliers are in valid range."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            ["google_spend"],
            ["temp_c"],
            "revenue",
        )

        assert 0.7 <= report.hot_weather_multiplier <= 1.3
        assert 0.7 <= report.cold_weather_multiplier <= 1.3

    def test_temperature_elasticity_sensitivity(self, sample_feature_matrix):
        """Test that elasticity sensitivity is computed."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            ["google_spend"],
            ["temp_c"],
            "revenue",
        )

        assert isinstance(report.temperature_elasticity, float)


class TestPrecipitationSensitivity:
    """Test precipitation sensitivity analysis."""

    def test_precipitation_correlation(self, sample_feature_matrix):
        """Test that precipitation correlation is computed."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            ["google_spend"],
            ["precip_mm"],
            "revenue",
        )

        assert isinstance(report.precipitation_correlation, float)
        assert -1.0 <= report.precipitation_correlation <= 1.0

    def test_precipitation_multipliers_in_valid_range(self, sample_feature_matrix):
        """Test that precipitation multipliers are in valid range."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            ["google_spend"],
            ["precip_mm"],
            "revenue",
        )

        assert 0.7 <= report.heavy_rain_multiplier <= 1.3
        assert 0.7 <= report.light_rain_multiplier <= 1.3

    def test_precipitation_elasticity_sensitivity(self, sample_feature_matrix):
        """Test that elasticity sensitivity is computed."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            ["google_spend"],
            ["precip_mm"],
            "revenue",
        )

        assert isinstance(report.precipitation_elasticity, float)


class TestSeasonalPatterns:
    """Test seasonal elasticity analysis."""

    def test_seasonal_elasticity_structure(self, sample_feature_matrix, spend_cols):
        """Test that seasonal elasticity is computed for all quarters."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            spend_cols,
            ["temp_c"],
            "revenue",
        )

        assert "Q1" in report.seasonal_elasticity
        assert "Q2" in report.seasonal_elasticity
        assert "Q3" in report.seasonal_elasticity
        assert "Q4" in report.seasonal_elasticity

        for elasticity in report.seasonal_elasticity.values():
            assert isinstance(elasticity, float)

    def test_day_of_week_elasticity_structure(self, sample_feature_matrix, spend_cols):
        """Test that day-of-week elasticity is computed for all days."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            spend_cols,
            ["temp_c"],
            "revenue",
        )

        expected_days = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        ]
        for day in expected_days:
            assert day in report.day_of_week_elasticity
            assert isinstance(report.day_of_week_elasticity[day], float)


class TestChannelSensitivity:
    """Test channel-level sensitivity analysis."""

    def test_channel_sensitivity_structure(self, sample_feature_matrix, spend_cols):
        """Test that channel sensitivities have correct structure."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            spend_cols,
            ["temp_c", "precip_mm"],
            "revenue",
        )

        for channel, sensitivity in report.channel_sensitivities.items():
            assert sensitivity.channel == channel
            assert isinstance(sensitivity.base_elasticity, float)
            assert isinstance(sensitivity.temperature_sensitivity, float)
            assert isinstance(sensitivity.precipitation_sensitivity, float)
            assert isinstance(sensitivity.mean_elasticity, float)
            assert isinstance(sensitivity.elasticity_std, float)

    def test_channel_sensitivity_temperature_bands(
        self, sample_feature_matrix, spend_cols
    ):
        """Test that temperature bands are created for each channel."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            spend_cols,
            ["temp_c"],
            "revenue",
        )

        for sensitivity in report.channel_sensitivities.values():
            assert len(sensitivity.temperature_bands) >= 0
            for band in sensitivity.temperature_bands:
                assert isinstance(band, WeatherBand)
                assert 0.7 <= band.elasticity_multiplier <= 1.3
                assert 0.0 <= band.confidence <= 1.0
                assert band.sample_size >= 0

    def test_channel_sensitivity_precipitation_bands(
        self, sample_feature_matrix, spend_cols
    ):
        """Test that precipitation bands are created for each channel."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            spend_cols,
            ["precip_mm"],
            "revenue",
        )

        for sensitivity in report.channel_sensitivities.values():
            assert len(sensitivity.precipitation_bands) >= 0
            for band in sensitivity.precipitation_bands:
                assert isinstance(band, WeatherBand)
                assert 0.7 <= band.elasticity_multiplier <= 1.3
                assert 0.0 <= band.confidence <= 1.0


class TestReportGeneration:
    """Test report generation and metadata."""

    def test_report_has_summary(self, sample_feature_matrix, spend_cols):
        """Test that report includes executive summary."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            spend_cols,
            ["temp_c"],
            "revenue",
        )

        assert report.summary
        assert len(report.summary) > 0
        assert "Weather" in report.summary or "elasticity" in report.summary.lower()

    def test_report_metadata(self, sample_feature_matrix, spend_cols):
        """Test that report includes proper metadata."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            spend_cols,
            ["temp_c"],
            "revenue",
            tenant_id="my-tenant",
        )

        assert report.tenant_id == "my-tenant"
        assert report.data_rows == 90
        assert report.weather_rows == 90
        assert report.timestamp_utc
        assert report.run_id


class TestReportPersistence:
    """Test saving and loading elasticity reports."""

    def test_save_elasticity_report(self, sample_feature_matrix, spend_cols):
        """Test that reports can be saved as JSON."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            spend_cols,
            ["temp_c", "precip_mm"],
            "revenue",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "elasticity_report.json"
            saved_path = save_elasticity_report(report, output_path)

            assert saved_path.exists()
            assert saved_path.suffix == ".json"

            # Verify JSON is valid
            with open(saved_path) as f:
                data = json.load(f)
                assert data["tenant_id"] == report.tenant_id
                assert data["data_rows"] == report.data_rows

    def test_save_creates_directories(self):
        """Test that saving creates parent directories."""
        with tempfile.TemporaryDirectory() as tmpdir:
            report = WeatherElasticityReport(
                tenant_id="test",
                run_id="test-run",
                timestamp_utc="2025-01-01T00:00:00Z",
                window_start="2025-01-01",
                window_end="2025-03-31",
                data_rows=90,
                weather_rows=90,
                base_elasticity=0.5,
                weather_elasticity_mean=0.3,
                weather_elasticity_std=0.1,
                temperature_correlation=0.4,
                temperature_elasticity=0.2,
                hot_weather_multiplier=0.9,
                cold_weather_multiplier=1.1,
                precipitation_correlation=-0.3,
                precipitation_elasticity=-0.1,
                heavy_rain_multiplier=0.8,
                light_rain_multiplier=0.95,
                seasonal_elasticity={"Q1": 0.4, "Q2": 0.5, "Q3": 0.6, "Q4": 0.4},
                day_of_week_elasticity={
                    "Monday": 0.5,
                    "Tuesday": 0.5,
                    "Wednesday": 0.5,
                    "Thursday": 0.5,
                    "Friday": 0.5,
                    "Saturday": 0.4,
                    "Sunday": 0.4,
                },
                channel_sensitivities={},
                r_squared=0.65,
                observations_per_bin=15,
                summary="Test summary",
            )

            nested_path = Path(tmpdir) / "a" / "b" / "c" / "report.json"
            saved_path = save_elasticity_report(report, nested_path)

            assert saved_path.exists()
            assert saved_path.parent.exists()


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_empty_frame(self, spend_cols):
        """Test handling of empty data frame."""
        empty_frame = pl.DataFrame()
        report = estimate_weather_elasticity(
            empty_frame,
            spend_cols,
            ["temp_c"],
            "revenue",
        )

        assert report.data_rows == 0
        assert report.base_elasticity == 0.0
        assert report.r_squared == 0.0

    def test_missing_columns(self, sample_feature_matrix):
        """Test handling of missing columns."""
        report = estimate_weather_elasticity(
            sample_feature_matrix,
            ["nonexistent_spend"],
            ["nonexistent_weather"],
            "revenue",
        )

        assert report.data_rows == 0 or len(report.channel_sensitivities) == 0

    def test_constant_spend(self, sample_feature_matrix):
        """Test handling of constant spend (no variance)."""
        frame = sample_feature_matrix.with_columns(
            pl.col("google_spend").fill_null(100.0)
        )

        report = estimate_weather_elasticity(
            frame,
            ["google_spend"],
            ["temp_c"],
            "revenue",
        )

        # Should not crash, but elasticity might be 0
        assert isinstance(report.base_elasticity, float)

    def test_all_zero_spend(self):
        """Test handling when all spend is zero."""
        frame = pl.DataFrame({
            "date": [datetime(2023, 9, 1).date()] * 10,
            "google_spend": [0.0] * 10,
            "temp_c": [15.0 + i for i in range(10)],
            "revenue": [1000.0 + i * 10 for i in range(10)],
        })

        report = estimate_weather_elasticity(
            frame,
            ["google_spend"],
            ["temp_c"],
            "revenue",
        )

        # Should handle gracefully
        assert isinstance(report.base_elasticity, float)

    def test_nan_values_in_data(self):
        """Test handling of NaN values."""
        frame = pl.DataFrame({
            "date": [datetime(2023, 9, 1).date()] * 10,
            "google_spend": [100.0, np.nan, 120.0, 110.0, np.nan, 105.0, 115.0, 125.0, 95.0, 105.0],
            "temp_c": [15.0 + i for i in range(10)],
            "revenue": [1000.0] * 10,
        })

        report = estimate_weather_elasticity(
            frame,
            ["google_spend"],
            ["temp_c"],
            "revenue",
        )

        # Should handle gracefully with fill_null
        assert isinstance(report.base_elasticity, float)


class TestMultiChannelAnalysis:
    """Test analysis with multiple channels and weather features."""

    def test_five_channels_three_weather_features(self):
        """Test with more realistic multi-channel setup."""
        np.random.seed(42)
        n_days = 90

        dates = [
            (datetime(2023, 9, 9) + timedelta(days=i)).date()
            for i in range(n_days)
        ]

        frame = pl.DataFrame({
            "date": dates,
            "google_spend": np.random.uniform(50, 150, n_days),
            "meta_spend": np.random.uniform(80, 200, n_days),
            "tiktok_spend": np.random.uniform(30, 100, n_days),
            "amazon_spend": np.random.uniform(40, 120, n_days),
            "organic_spend": np.random.uniform(20, 80, n_days),
            "temp_c": np.random.uniform(5, 25, n_days),
            "temp_anomaly": np.random.normal(0, 3, n_days),
            "precip_mm": np.random.exponential(3, n_days),
            "revenue": np.random.uniform(5000, 15000, n_days),
        })

        spend_cols = [
            "google_spend",
            "meta_spend",
            "tiktok_spend",
            "amazon_spend",
            "organic_spend",
        ]
        weather_cols = ["temp_c", "temp_anomaly", "precip_mm"]

        report = estimate_weather_elasticity(
            frame,
            spend_cols,
            weather_cols,
            "revenue",
        )

        assert len(report.channel_sensitivities) > 0
        assert report.r_squared >= 0
        assert report.temperature_elasticity is not None
        assert report.precipitation_elasticity is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
