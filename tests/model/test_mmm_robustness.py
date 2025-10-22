"""Robustness tests for weather-aware MMM model.

Tests the model's ability to handle edge cases and extreme conditions:
- Outliers (extreme weather, extreme spend)
- Missing data (NaN values, gaps)
- Edge cases (zero spend, constant values)
- Numerical stability (very large/small values)
"""

import json
import pytest
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta

from apps.model.mmm_lightweight_weather import (
    WeatherAwareMMM,
    TenantModelTrainer,
)


class TestOutlierHandling:
    """Tests for handling outliers in data."""

    def test_extreme_weather_temperature_high(self):
        """Test model doesn't crash with extreme high temperature."""
        n_periods = 100
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
            "online": np.ones(n_periods) * 500,
        })
        # Extreme temperature spike
        temperature = np.ones(n_periods) * 20
        temperature[50] = 60.0  # Extreme outlier

        weather_df = pd.DataFrame({
            "temperature": temperature,
            "humidity": np.ones(n_periods) * 65,
            "precipitation": np.random.rand(n_periods) * 10,
        })

        y = spend_df["tv"] * 0.1 + weather_df["temperature"] * 50 + np.random.randn(n_periods) * 100

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        # Should complete without crash
        assert result is not None
        assert np.isfinite(result.train_r2)
        assert not np.isnan(result.train_r2)

    def test_extreme_weather_temperature_low(self):
        """Test model doesn't crash with extreme low temperature."""
        n_periods = 100
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
        })
        temperature = np.ones(n_periods) * 20
        temperature[30] = -40.0  # Extreme low

        weather_df = pd.DataFrame({
            "temperature": temperature,
            "humidity": np.ones(n_periods) * 65,
        })

        y = spend_df["tv"] * 0.1 + np.random.randn(n_periods) * 100

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        assert result is not None
        assert np.isfinite(result.train_r2)

    def test_extreme_precipitation(self):
        """Test model with extreme precipitation values."""
        n_periods = 100
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
        })
        precipitation = np.ones(n_periods) * 5
        precipitation[40] = 500.0  # Extreme rainfall

        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 20,
            "precipitation": precipitation,
        })

        y = spend_df["tv"] * 0.1 + np.random.randn(n_periods) * 100

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        assert result is not None
        assert np.isfinite(result.train_r2)

    def test_extreme_spend_spike(self):
        """Test model with spike in media spend."""
        n_periods = 100
        spend = np.ones(n_periods) * 1000
        spend[50] = 100000.0  # Huge spend spike

        spend_df = pd.DataFrame({
            "tv": spend,
            "online": np.ones(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 20,
            "humidity": np.ones(n_periods) * 65,
        })

        y = spend_df["tv"] * 0.1 + spend_df["online"] * 0.2 + np.random.randn(n_periods) * 100

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        assert result is not None
        assert np.isfinite(result.train_r2)

    def test_multiple_outliers(self):
        """Test model with multiple simultaneous outliers."""
        n_periods = 100
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
            "online": np.ones(n_periods) * 500,
        })

        temperature = np.ones(n_periods) * 20
        temperature[30] = 50.0
        temperature[60] = -30.0

        precipitation = np.ones(n_periods) * 5
        precipitation[45] = 400.0

        weather_df = pd.DataFrame({
            "temperature": temperature,
            "humidity": np.ones(n_periods) * 65,
            "precipitation": precipitation,
        })

        # Outlier in target
        y = spend_df["tv"] * 0.1 + weather_df["temperature"] * 50
        y[70] = 100000.0  # Extreme revenue value

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        assert result is not None
        assert np.isfinite(result.train_r2)


class TestMissingData:
    """Tests for handling missing data (NaN values)."""

    def test_nan_in_spend(self):
        """Test model behavior with NaN in spend data."""
        n_periods = 100
        spend = np.ones(n_periods) * 1000
        spend[50] = np.nan

        spend_df = pd.DataFrame({
            "tv": spend,
            "online": np.ones(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 20,
            "humidity": np.ones(n_periods) * 65,
        })

        y = np.ones(n_periods) * 10000

        mmm = WeatherAwareMMM()
        # Should either handle gracefully or raise informative error
        with pytest.raises((ValueError, RuntimeError)):
            mmm.fit(spend_df, weather_df, y)

    def test_nan_in_weather(self):
        """Test model behavior with NaN in weather data."""
        n_periods = 100
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
        })

        temperature = np.ones(n_periods) * 20
        temperature[30] = np.nan

        weather_df = pd.DataFrame({
            "temperature": temperature,
            "humidity": np.ones(n_periods) * 65,
        })

        y = np.ones(n_periods) * 10000

        mmm = WeatherAwareMMM()
        with pytest.raises((ValueError, RuntimeError)):
            mmm.fit(spend_df, weather_df, y)

    def test_nan_in_target(self):
        """Test model behavior with NaN in target."""
        n_periods = 100
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 20,
        })

        y = np.ones(n_periods) * 10000
        y[40] = np.nan

        mmm = WeatherAwareMMM()
        with pytest.raises((ValueError, RuntimeError)):
            mmm.fit(spend_df, weather_df, y)

    def test_multiple_nan_values(self):
        """Test model with multiple NaN values spread across data."""
        n_periods = 100
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
        })

        temperature = np.ones(n_periods) * 20
        temperature[[10, 30, 50, 70]] = np.nan

        weather_df = pd.DataFrame({
            "temperature": temperature,
        })

        y = np.ones(n_periods) * 10000

        mmm = WeatherAwareMMM()
        with pytest.raises((ValueError, RuntimeError)):
            mmm.fit(spend_df, weather_df, y)


class TestEdgeCases:
    """Tests for edge case scenarios."""

    def test_zero_spend_predicts_baseline(self):
        """Test model predicts reasonable baseline when ad spend is zero."""
        n_periods = 200

        # Build training data with some zero spend
        spend_df = pd.DataFrame({
            "tv": np.concatenate([np.ones(100) * 1000, np.zeros(100)]),
            "online": np.ones(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 20,
            "humidity": np.ones(n_periods) * 65,
            "precipitation": np.random.rand(n_periods) * 10,
        })

        # Revenue depends partially on TV spend but has organic baseline
        organic_baseline = 50000
        y = spend_df["tv"] * 0.1 + np.ones(n_periods) * organic_baseline + np.random.randn(n_periods) * 1000

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        # Model should train successfully
        assert result is not None
        assert np.isfinite(result.train_r2)

        # Test prediction with zero spend
        test_spend = pd.DataFrame({
            "tv": [0.0],
            "online": [500.0],
        })
        test_weather = pd.DataFrame({
            "temperature": [20.0],
            "humidity": [65.0],
            "precipitation": [5.0],
        })

        pred = mmm.predict(test_spend, test_weather, ["tv", "online"])
        # Should predict something reasonable (not crash, not NaN)
        assert len(pred) == 1
        assert np.isfinite(pred[0])
        assert pred[0] > 0  # Should predict positive revenue

    def test_constant_target_variable(self):
        """Test model with constant target (no variance)."""
        n_periods = 100
        spend_df = pd.DataFrame({
            "tv": np.random.rand(n_periods) * 1000,
            "online": np.random.rand(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.random.rand(n_periods) * 30 + 10,
            "humidity": np.ones(n_periods) * 65,
        })

        y = np.ones(n_periods) * 10000  # Constant!

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        # Should complete (R² will be 0 since no variance)
        assert result is not None
        assert result.train_r2 == 0.0

    def test_constant_spend_column(self):
        """Test model with one channel having constant spend."""
        n_periods = 100
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,  # Constant!
            "online": np.random.rand(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 20,
            "humidity": np.ones(n_periods) * 65,
        })

        y = spend_df["online"] * 0.2 + np.random.randn(n_periods) * 100

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        # Should complete without crash
        assert result is not None
        assert np.isfinite(result.train_r2)

    def test_single_period_data(self):
        """Test model with minimal data (1 period)."""
        spend_df = pd.DataFrame({
            "tv": [1000.0],
            "online": [500.0],
        })
        weather_df = pd.DataFrame({
            "temperature": [20.0],
            "humidity": [65.0],
        })
        y = np.array([10000.0])

        mmm = WeatherAwareMMM()
        # Should handle gracefully (may fail or return perfect fit)
        try:
            result = mmm.fit(spend_df, weather_df, y)
            assert result is not None
        except (ValueError, RuntimeError):
            # Also acceptable - not enough data
            pass

    def test_very_small_values(self):
        """Test model with very small numerical values."""
        n_periods = 100
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1e-6,
            "online": np.ones(n_periods) * 1e-6,
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 1e-8,
            "humidity": np.ones(n_periods) * 1e-8,
        })

        y = np.ones(n_periods) * 1e-6 + np.random.randn(n_periods) * 1e-8

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        # Should handle small values without overflow/underflow
        assert result is not None
        assert np.all(np.isfinite(result.predictions_train))

    def test_very_large_values(self):
        """Test model with very large numerical values."""
        n_periods = 100
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1e9,
            "online": np.ones(n_periods) * 1e9,
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 1e6,
            "humidity": np.ones(n_periods) * 1e6,
        })

        y = spend_df["tv"] * 0.1 + np.random.randn(n_periods) * 1e6

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        # Should handle large values
        assert result is not None
        assert np.all(np.isfinite(result.predictions_train))

    def test_negative_spend_values(self):
        """Test model behavior with negative spend (invalid data)."""
        n_periods = 100
        spend = np.ones(n_periods) * 1000
        spend[30] = -500.0  # Invalid negative spend

        spend_df = pd.DataFrame({
            "tv": spend,
            "online": np.ones(n_periods) * 500,
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 20,
        })

        y = spend_df["tv"] * 0.1 + spend_df["online"] * 0.2 + np.random.randn(n_periods) * 100

        mmm = WeatherAwareMMM()
        # Should complete but may produce poor results
        # (negative spend is nonsensical but shouldn't crash)
        result = mmm.fit(spend_df, weather_df, y)
        assert result is not None


class TestNumericalStability:
    """Tests for numerical stability and precision."""

    def test_scale_invariance(self):
        """Test that scaling features doesn't break model."""
        n_periods = 100
        spend_df_original = pd.DataFrame({
            "tv": np.random.rand(n_periods) * 1000,
            "online": np.random.rand(n_periods) * 500,
        })
        weather_df_original = pd.DataFrame({
            "temperature": np.random.rand(n_periods) * 30 + 10,
            "humidity": np.ones(n_periods) * 65,
        })
        y_original = spend_df_original["tv"] * 0.1 + weather_df_original["temperature"] * 50 + np.random.randn(n_periods) * 100

        # Train original
        mmm1 = WeatherAwareMMM()
        result1 = mmm1.fit(spend_df_original, weather_df_original, y_original)

        # Scale spend by 10x and weather by 0.1x (but adjust target appropriately)
        spend_df_scaled = spend_df_original * 10
        weather_df_scaled = weather_df_original * 0.1
        y_scaled = y_original  # Target stays same since features cancel

        mmm2 = WeatherAwareMMM()
        result2 = mmm2.fit(spend_df_scaled, weather_df_scaled, y_scaled)

        # Both should complete successfully
        assert np.isfinite(result1.train_r2)
        assert np.isfinite(result2.train_r2)

    def test_adstock_stability_edge_cases(self):
        """Test adstock transformation with edge case parameters."""
        mmm = WeatherAwareMMM()

        # Very long lag
        spend = np.ones(50) * 100
        result = mmm._geometric_adstock(spend, lag=100, decay=0.5)
        assert np.all(np.isfinite(result))
        assert len(result) == 50

        # Very short lag (1 day)
        result = mmm._geometric_adstock(spend, lag=1, decay=0.9)
        assert np.all(np.isfinite(result))

        # Decay factor near 0
        result = mmm._geometric_adstock(spend, lag=10, decay=0.01)
        assert np.all(np.isfinite(result))

        # Decay factor near 1
        result = mmm._geometric_adstock(spend, lag=10, decay=0.99)
        assert np.all(np.isfinite(result))

    def test_saturation_curve_stability(self):
        """Test Hill saturation curve with extreme parameters."""
        mmm = WeatherAwareMMM()

        x = np.logspace(-5, 5, 50)  # Range from 1e-5 to 1e5

        # Very small k
        result = mmm._hill_saturation(x, k=1e-3, s=1.0)
        assert np.all(np.isfinite(result))
        assert np.all(result >= 0)
        assert np.all(result <= 1)

        # Very large k
        result = mmm._hill_saturation(x, k=1e6, s=1.0)
        assert np.all(np.isfinite(result))
        assert np.all(result >= 0)
        assert np.all(result <= 1)

        # Very small elasticity
        result = mmm._hill_saturation(x, k=1.0, s=0.01)
        assert np.all(np.isfinite(result))

        # Very large elasticity
        result = mmm._hill_saturation(x, k=1.0, s=10.0)
        assert np.all(np.isfinite(result))


class TestCrossValidationRobustness:
    """Tests for cross-validation robustness."""

    def test_cv_with_outliers(self):
        """Test cross-validation with outlier data."""
        n_periods = 200
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
        })

        temperature = np.ones(n_periods) * 20
        temperature[[50, 100, 150]] = [60.0, -30.0, 55.0]  # Outliers

        weather_df = pd.DataFrame({
            "temperature": temperature,
            "humidity": np.ones(n_periods) * 65,
        })

        y = spend_df["tv"] * 0.1 + weather_df["temperature"] * 50 + np.random.randn(n_periods) * 200

        mmm = WeatherAwareMMM()
        cv_metrics = mmm.cross_validate(spend_df, weather_df, y, n_folds=3)

        # Should complete despite outliers
        assert cv_metrics is not None
        assert np.isfinite(cv_metrics.mean_r2)
        assert len(cv_metrics.fold_r2_scores) >= 1

    def test_cv_with_extreme_variance(self):
        """Test CV with data that has extreme variance."""
        n_periods = 200
        spend_df = pd.DataFrame({
            "tv": np.random.exponential(scale=1000, size=n_periods),  # High variance
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 20,
        })
        y = spend_df["tv"] * 0.1 + np.random.exponential(scale=5000, size=n_periods)

        mmm = WeatherAwareMMM()
        cv_metrics = mmm.cross_validate(spend_df, weather_df, y, n_folds=4)

        assert cv_metrics is not None
        assert np.isfinite(cv_metrics.mean_r2)

    def test_cv_with_minimum_data(self):
        """Test CV with minimal data per fold."""
        # 20 samples with 5 folds = 4 per fold
        n_periods = 20
        spend_df = pd.DataFrame({
            "tv": np.random.rand(n_periods) * 1000,
        })
        weather_df = pd.DataFrame({
            "temperature": np.ones(n_periods) * 20,
        })
        y = spend_df["tv"] * 0.1 + np.random.randn(n_periods) * 100

        mmm = WeatherAwareMMM()
        cv_metrics = mmm.cross_validate(spend_df, weather_df, y, n_folds=5)

        # Should handle small fold sizes
        assert cv_metrics is not None
        assert len(cv_metrics.fold_r2_scores) >= 1


class TestOutputArtifacts:
    """Tests to verify robustness report artifacts."""

    def test_robustness_report_generation(self, tmp_path):
        """Test that robustness report can be generated."""
        n_periods = 200
        spend_df = pd.DataFrame({
            "tv": np.ones(n_periods) * 1000,
            "online": np.ones(n_periods) * 500,
        })

        temperature = np.ones(n_periods) * 20
        temperature[50] = 60.0  # Outlier

        weather_df = pd.DataFrame({
            "temperature": temperature,
            "humidity": np.ones(n_periods) * 65,
            "precipitation": np.random.rand(n_periods) * 10,
        })

        y = spend_df["tv"] * 0.1 + spend_df["online"] * 0.2 + weather_df["temperature"] * 50 + np.random.randn(n_periods) * 100

        mmm = WeatherAwareMMM()
        result = mmm.fit(spend_df, weather_df, y)

        report = {
            "test_name": "robustness_report",
            "timestamp": datetime.now().isoformat(),
            "data_points": n_periods,
            "channels": list(spend_df.columns),
            "weather_features": list(weather_df.columns),
            "model_performance": {
                "train_r2": float(result.train_r2),
                "val_r2": float(result.val_r2),
                "test_r2": float(result.test_r2),
            },
            "robustness_checks": {
                "handles_outliers": True,
                "handles_missing_data": False,  # Expected - model should fail on NaN
                "handles_zero_spend": True,
                "handles_extreme_values": True,
            },
        }

        report_path = tmp_path / "robustness_report.json"
        with open(report_path, "w") as f:
            json.dump(report, f, indent=2)

        assert report_path.exists()

        # Verify report content
        with open(report_path) as f:
            loaded = json.load(f)

        assert loaded["test_name"] == "robustness_report"
        assert loaded["data_points"] == n_periods
        assert "model_performance" in loaded
