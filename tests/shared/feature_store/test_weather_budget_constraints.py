from datetime import date

import polars as pl
import pytest

from shared.feature_store.weather_budget_constraints import (
    WeatherBudgetConstraint,
    calculate_weather_budget_multiplier,
)


@pytest.fixture
def sample_weather_frame():
    """Create a sample weather dataframe for testing."""
    return pl.DataFrame({
        "date": ["2025-10-23", "2025-10-24"],
        "temp_c": [25.0, 35.0],
        "precip_mm": [5.0, 50.0],
        "heatwave_flag": [0, 1],
        "freeze_flag": [0, 0],
    })


def test_empty_weather_frame():
    """Test behavior with empty weather frame."""
    empty_frame = pl.DataFrame()
    result = calculate_weather_budget_multiplier(
        empty_frame,
        target_date=date(2025, 10, 23)
    )
    assert result == 1.0


def test_missing_target_date(sample_weather_frame):
    """Test behavior when target date is not in the frame."""
    result = calculate_weather_budget_multiplier(
        sample_weather_frame,
        target_date=date(2025, 10, 25)  # Date not in frame
    )
    assert result == 1.0


def test_temperature_constraints(sample_weather_frame):
    """Test temperature-based budget constraints."""
    result = calculate_weather_budget_multiplier(
        sample_weather_frame,
        target_date=date(2025, 10, 23),
        min_temp_c=30.0,  # Above current temp
        max_temp_c=40.0
    )
    assert result == 0.8  # Should reduce budget due to cold weather

    result = calculate_weather_budget_multiplier(
        sample_weather_frame,
        target_date=date(2025, 10, 24),  # Hot day
        min_temp_c=20.0,
        max_temp_c=30.0  # Below current temp
    )
    assert result == 0.8  # Should reduce budget due to hot weather


def test_precipitation_constraints(sample_weather_frame):
    """Test precipitation-based budget constraints."""
    result = calculate_weather_budget_multiplier(
        sample_weather_frame,
        target_date=date(2025, 10, 24),  # Rainy day
        precipitation_threshold_mm=30.0
    )
    assert result == 0.7  # Should reduce budget due to rain


def test_heatwave_constraints(sample_weather_frame):
    """Test heatwave-based budget constraints."""
    result = calculate_weather_budget_multiplier(
        sample_weather_frame,
        target_date=date(2025, 10, 24),  # Heatwave day
        heatwave_sensitive=True
    )
    assert result == 0.6  # Should reduce budget due to heatwave


def test_combined_constraints(sample_weather_frame):
    """Test multiple constraints combined."""
    result = calculate_weather_budget_multiplier(
        sample_weather_frame,
        target_date=date(2025, 10, 24),
        max_temp_c=30.0,
        precipitation_threshold_mm=30.0,
        heatwave_sensitive=True
    )
    # Multiple reductions: 0.8 (temp) * 0.7 (rain) * 0.6 (heatwave)
    assert result == 0.5  # Should hit minimum multiplier


def test_custom_budget_constraints():
    """Test custom budget constraint ranges."""
    constraint = WeatherBudgetConstraint(min_budget_multiplier=0.8, max_budget_multiplier=1.5)
    frame = pl.DataFrame({
        "date": ["2025-10-23"],
        "temp_c": [40.0],
        "precip_mm": [100.0],
        "heatwave_flag": [1],
        "freeze_flag": [0],
    })

    result = calculate_weather_budget_multiplier(
        frame,
        target_date=date(2025, 10, 23),
        max_temp_c=30.0,
        precipitation_threshold_mm=30.0,
        heatwave_sensitive=True,
        base_constraint=constraint
    )
    assert result == 0.8  # Should be capped at min_budget_multiplier