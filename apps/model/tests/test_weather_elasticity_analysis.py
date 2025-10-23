"""Test weather sensitivity elasticity estimation implementation."""
from __future__ import annotations

import polars as pl
import pytest
from datetime import date, timedelta
import numpy as np

from apps.model.weather_elasticity_analysis import (
    WeatherBand,
    WeatherElasticityReport,
    ChannelWeatherSensitivity,
    estimate_weather_elasticity,
    _estimate_elasticity,
    _create_weather_bands,
    _compute_weather_elasticity,
    _analyze_channel_sensitivities,
)

def test_estimate_elasticity_basic():
    """Test basic elasticity estimation."""
    x = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    y = np.array([2.0, 4.0, 6.0, 8.0, 10.0])
    elasticity = _estimate_elasticity(x, y)
    assert abs(elasticity - 2.0) < 0.01  # Perfect linear relationship

def test_estimate_elasticity_no_relationship():
    """Test elasticity estimation with no relationship."""
    x = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    y = np.array([5.0, 5.0, 5.0, 5.0, 5.0])
    elasticity = _estimate_elasticity(x, y)
    assert abs(elasticity) < 0.01  # No relationship

def test_estimate_elasticity_invalid_input():
    """Test elasticity estimation with invalid input."""
    x = np.array([1.0, 2.0])
    y = np.array([1.0, 2.0, 3.0])
    elasticity = _estimate_elasticity(x, y)
    assert elasticity == 0.0  # Different lengths return 0

def test_create_weather_bands():
    """Test weather band creation."""
    frame = pl.DataFrame({
        "date": ["2025-01-01"] * 100,
        "temp_c": np.linspace(0, 30, 100),
        "revenue": np.random.normal(100, 10, 100),
    })
    weather_cols = ["temp_c"]
    bands = _create_weather_bands("temperature", frame, weather_cols, "revenue")

    assert len(bands) == 4  # Four bands expected
    assert all(isinstance(b, WeatherBand) for b in bands)
    assert all(0.7 <= b.elasticity_multiplier <= 1.3 for b in bands)

def test_compute_weather_elasticity():
    """Test weather elasticity computation."""
    frame = pl.DataFrame({
        "date": ["2025-01-01"] * 100,
        "spend": np.random.normal(100, 10, 100),
        "temp_c": np.random.normal(20, 5, 100),
        "revenue": np.random.normal(200, 20, 100),
    })
    mean, std = _compute_weather_elasticity(
        frame,
        spend_cols=["spend"],
        weather_cols=["temp_c"],
        revenue_col="revenue"
    )
    assert isinstance(mean, float)
    assert isinstance(std, float)
    assert -2.0 <= mean <= 2.0  # Within reasonable bounds

def test_analyze_channel_sensitivities():
    """Test channel sensitivity analysis."""
    frame = pl.DataFrame({
        "date": ["2025-01-01"] * 100,
        "channel1": np.random.normal(100, 10, 100),
        "channel2": np.random.normal(150, 15, 100),
        "temp_c": np.random.normal(20, 5, 100),
        "precip_mm": np.random.normal(5, 2, 100),
        "revenue": np.random.normal(300, 30, 100),
    })

    sensitivities = _analyze_channel_sensitivities(
        frame,
        spend_cols=["channel1", "channel2"],
        weather_cols=["temp_c", "precip_mm"],
        revenue_col="revenue"
    )

    assert len(sensitivities) == 2
    assert all(isinstance(s, ChannelWeatherSensitivity) for s in sensitivities.values())
    assert all(-2.0 <= s.base_elasticity <= 2.0 for s in sensitivities.values())

def test_full_estimation_empty_frame():
    """Test elasticity estimation with empty frame."""
    frame = pl.DataFrame({
        "date": [],
        "spend": [],
        "temp_c": [],
        "revenue": [],
    })

    report = estimate_weather_elasticity(
        frame,
        spend_cols=["spend"],
        weather_cols=["temp_c"],
        revenue_col="revenue",
        tenant_id="test"
    )

    assert isinstance(report, WeatherElasticityReport)
    assert report.base_elasticity == 0.0
    assert report.weather_elasticity_mean == 0.0
    assert report.r_squared == 0.0

def test_full_estimation_typical_case():
    """Test full elasticity estimation with typical data."""
    # Generate synthetic time series data
    num_days = 100
    dates = [date(2025, 1, 1) + timedelta(days=i) for i in range(num_days)]

    # Simulate weather impact on revenue
    temp_base = np.sin(np.linspace(0, 4*np.pi, num_days)) * 10 + 20  # Seasonal pattern
    temp_noise = np.random.normal(0, 2, num_days)
    temperature = temp_base + temp_noise

    # Simulate spend and revenue with weather sensitivity
    base_spend = np.random.normal(100, 10, num_days)
    weather_effect = 0.3 * (temperature - temperature.mean()) / temperature.std()
    revenue = 2 * base_spend + weather_effect * 50 + np.random.normal(0, 20, num_days)

    frame = pl.DataFrame({
        "date": [d.isoformat() for d in dates],
        "spend": base_spend,
        "temp_c": temperature,
        "revenue": revenue,
    })

    report = estimate_weather_elasticity(
        frame,
        spend_cols=["spend"],
        weather_cols=["temp_c"],
        revenue_col="revenue",
        tenant_id="test"
    )

    assert isinstance(report, WeatherElasticityReport)
    assert 0.0 <= report.r_squared <= 1.0
    assert -2.0 <= report.temperature_elasticity <= 2.0
    assert len(report.channel_sensitivities) == 1
    assert report.data_rows == num_days

def test_full_estimation_high_weather_impact():
    """Test elasticity estimation with significant weather impact."""
    num_days = 100
    dates = [date(2025, 1, 1) + timedelta(days=i) for i in range(num_days)]

    # Strong weather effect
    temp_base = np.sin(np.linspace(0, 4*np.pi, num_days)) * 15 + 20
    temperature = temp_base + np.random.normal(0, 2, num_days)

    # Revenue strongly dependent on temperature
    base_spend = np.random.normal(100, 10, num_days)
    weather_effect = 0.8 * (temperature - temperature.mean()) / temperature.std()
    revenue = base_spend + weather_effect * 100 + np.random.normal(0, 10, num_days)

    frame = pl.DataFrame({
        "date": [d.isoformat() for d in dates],
        "spend": base_spend,
        "temp_c": temperature,
        "revenue": revenue,
    })

    report = estimate_weather_elasticity(
        frame,
        spend_cols=["spend"],
        weather_cols=["temp_c"],
        revenue_col="revenue",
        tenant_id="test"
    )

    assert abs(report.weather_elasticity_mean) > 0.5  # Strong weather impact
    assert "SIGNIFICANT" in report.summary  # Should recommend weather-based allocation