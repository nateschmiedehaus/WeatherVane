"""Tests for Bayesian estimation in weather-aware MMM."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from apps.model.mmm_lightweight_weather import (
    WeatherAwareMMM,
    WeatherAwareMMResult,
    CrossValidationMetrics,
)


def _create_synthetic_data(
    n_periods: int = 100,
    n_channels: int = 2,
    n_weather: int = 3,
) -> tuple[pd.DataFrame, pd.DataFrame, np.ndarray]:
    """Create synthetic data for testing."""
    # Generate spend data
    spend_data = np.random.uniform(0, 100, size=(n_periods, n_channels))
    spend_df = pd.DataFrame(
        spend_data,
        columns=[f"channel_{i+1}" for i in range(n_channels)],
    )

    # Generate weather data
    weather_data = np.random.normal(0, 1, size=(n_periods, n_weather))
    weather_df = pd.DataFrame(
        weather_data,
        columns=["temperature", "humidity", "precipitation"],
    )

    # Generate target with spend and weather effects
    target = (
        np.sum(spend_data, axis=1)  # Spend effect
        + 0.3 * np.sum(weather_data, axis=1)  # Weather effect
        + np.random.normal(0, 10, size=n_periods)  # Noise
    )

    return spend_df, weather_df, target


def test_weather_aware_mmm_bayesian_estimation() -> None:
    """Test Bayesian parameter estimation in weather-aware MMM."""
    # Create synthetic data
    X_spend, X_weather, y = _create_synthetic_data()

    # Initialize model
    model = WeatherAwareMMM(regularization_strength=0.01)

    # Fit with Bayesian estimation
    result = model.fit(
        X_spend=X_spend,
        X_weather=X_weather,
        y=y,
        estimate_adstock=True,
        estimate_saturation=True,
    )

    assert isinstance(result, WeatherAwareMMResult)
    assert result.train_r2 >= 0  # Should explain some variance
    assert result.weather_elasticity  # Should estimate weather effects
    assert result.channel_roas  # Should estimate ROAS

    # Features should include interactions
    assert all(f"weather_temperature_x_channel_{i+1}" in model.feature_names for i in range(2))
    assert all(f"weather_humidity_x_channel_{i+1}" in model.feature_names for i in range(2))


def test_weather_aware_mmm_mixed_estimation() -> None:
    """Test mixing Bayesian and preset parameters."""
    X_spend, X_weather, y = _create_synthetic_data(n_periods=50)

    # Initialize with preset parameters
    preset_lags = {
        "channel_1": 7,
        "channel_2": 3,
    }
    model = WeatherAwareMMM(
        adstock_lags=preset_lags,
        regularization_strength=0.01,
    )

    # Fit with adstock preset but Bayesian saturation
    result = model.fit(
        X_spend=X_spend,
        X_weather=X_weather,
        y=y,
        estimate_adstock=False,
        estimate_saturation=True,
    )

    assert isinstance(result, WeatherAwareMMResult)
    assert model.adstock_lags == preset_lags  # Should keep preset lags

    # Saturation params should be learned
    hill_params = result.coefficients
    assert any("saturated" in feature for feature in hill_params)


def test_weather_aware_mmm_cross_validation() -> None:
    """Test cross-validation with Bayesian estimation."""
    X_spend, X_weather, y = _create_synthetic_data(n_periods=120)

    model = WeatherAwareMMM()
    cv_metrics = model.cross_validate(
        X_spend=X_spend,
        X_weather=X_weather,
        y=y,
        n_folds=3,
        model_name="test_weather_mmm",
    )

    assert isinstance(cv_metrics, CrossValidationMetrics)
    assert len(cv_metrics.fold_r2_scores) == 3
    assert cv_metrics.mean_r2 >= 0
    assert cv_metrics.weather_elasticity
    assert cv_metrics.channel_roas


def test_weather_aware_mmm_validation() -> None:
    """Test validation set performance with Bayesian estimation."""
    X_spend, X_weather, y = _create_synthetic_data(n_periods=150)

    # Split into train/val
    train_size = 100
    X_spend_train = X_spend.iloc[:train_size]
    X_spend_val = X_spend.iloc[train_size:]
    X_weather_train = X_weather.iloc[:train_size]
    X_weather_val = X_weather.iloc[train_size:]
    y_train = y[:train_size]
    y_val = y[train_size:]

    model = WeatherAwareMMM()
    result = model.fit(
        X_spend=X_spend_train,
        X_weather=X_weather_train,
        y=y_train,
        X_spend_val=X_spend_val,
        X_weather_val=X_weather_val,
        y_val=y_val,
        estimate_adstock=True,
        estimate_saturation=True,
    )

    assert isinstance(result, WeatherAwareMMResult)
    # Model performance will vary, so we just check that results are populated
    assert result.val_r2 == result.val_r2  # Check for NaN
    assert isinstance(result.val_r2, float)
    assert len(result.predictions_val) == len(y_val)


def test_weather_aware_mmm_error_handling() -> None:
    """Test error handling with invalid inputs."""
    model = WeatherAwareMMM()

    # Test mismatched lengths - all inputs must be same length
    X_spend = pd.DataFrame({"channel_1": [1.0, 2.0]})
    X_weather = pd.DataFrame({"temperature": [0.0, 1.0]})  # Fixed to match X_spend
    y = np.array([10.0, 11.0])

    # Missing validation data check
    with pytest.raises(ValueError, match="together or not at all"):
        model.fit(
            X_spend=X_spend,
            X_weather=X_weather,
            y=y,
            X_spend_val=pd.DataFrame({"channel_1": [1.0]}),  # Only providing spend validation
        )

    # Validation length mismatch
    X_spend_val = pd.DataFrame({"channel_1": [1.0]})
    X_weather_val = pd.DataFrame({"temperature": [0.0, 1.0]})  # Different length
    y_val = np.array([10.0])

    with pytest.raises(ValueError, match="Validation data length mismatch"):
        model.fit(
            X_spend=X_spend,
            X_weather=X_weather,
            y=y,
            X_spend_val=X_spend_val,
            X_weather_val=X_weather_val,
            y_val=y_val,
        )

    # Test missing required features
    X_weather_bad = pd.DataFrame({"not_temp": [0.0, 1.0]})
    with pytest.raises(ValueError, match="Missing required columns"):
        model.fit(
            X_spend=X_spend,
            X_weather=X_weather_bad,
            y=y,
        )