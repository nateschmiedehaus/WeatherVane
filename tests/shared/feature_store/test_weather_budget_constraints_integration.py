import asyncio
from datetime import date, timedelta
from pathlib import Path

import pytest

from shared.feature_store.weather_budget_constraints import (
    WeatherBudgetConstraint,
    calculate_weather_budget_multiplier,
)
from shared.feature_store.weather_cache import WeatherCache
from shared.libs.connectors import WeatherConfig


@pytest.fixture
def weather_cache(tmp_path):
    """Create a WeatherCache instance with temporary storage."""
    return WeatherCache(root=tmp_path / "weather_cache")


@pytest.mark.asyncio
async def test_budget_constraints_with_real_weather(weather_cache):
    """Test budget constraints using real weather data."""
    # Test location: New York City
    lat, lon = 40.7128, -74.0060
    today = date.today()
    start_date = today - timedelta(days=5)
    end_date = today + timedelta(days=5)

    # Fetch weather data
    result = await weather_cache.ensure_range(
        lat=lat,
        lon=lon,
        start=start_date,
        end=end_date,
    )

    # Test basic constraints
    multiplier = calculate_weather_budget_multiplier(
        weather_frame=result.frame,
        target_date=today,
        min_temp_c=0.0,
        max_temp_c=30.0,
        precipitation_threshold_mm=10.0,
        heatwave_sensitive=True,
        cold_sensitive=True,
    )
    assert 0.5 <= multiplier <= 2.0, f"Budget multiplier {multiplier} outside valid range"

    # Test with custom constraints
    custom_constraint = WeatherBudgetConstraint(min_budget_multiplier=0.8, max_budget_multiplier=1.2)
    multiplier = calculate_weather_budget_multiplier(
        weather_frame=result.frame,
        target_date=today,
        min_temp_c=0.0,
        max_temp_c=30.0,
        precipitation_threshold_mm=10.0,
        base_constraint=custom_constraint,
    )
    assert 0.8 <= multiplier <= 1.2, f"Budget multiplier {multiplier} outside custom range"


@pytest.mark.asyncio
async def test_budget_constraints_across_locations(weather_cache):
    """Test budget constraints for multiple locations."""
    # Test multiple cities
    locations = [
        (40.7128, -74.0060),  # New York
        (34.0522, -118.2437),  # Los Angeles
        (51.5074, -0.1278),   # London
    ]
    today = date.today()

    tasks = []
    for lat, lon in locations:
        tasks.append(weather_cache.ensure_range(
            lat=lat,
            lon=lon,
            start=today,
            end=today,
        ))

    results = await asyncio.gather(*tasks)

    for result in results:
        multiplier = calculate_weather_budget_multiplier(
            weather_frame=result.frame,
            target_date=today,
            min_temp_c=0.0,
            max_temp_c=30.0,
            precipitation_threshold_mm=10.0,
        )
        assert 0.5 <= multiplier <= 2.0, f"Budget multiplier {multiplier} outside valid range"


@pytest.mark.asyncio
async def test_seasonal_budget_adjustments(weather_cache):
    """Test budget adjustments across different seasons."""
    # Test New York across different seasons
    lat, lon = 40.7128, -74.0060

    # Sample dates from different seasons
    seasonal_dates = [
        date(2025, 1, 15),  # Winter
        date(2025, 4, 15),  # Spring
        date(2025, 7, 15),  # Summer
        date(2025, 10, 15), # Fall
    ]

    for test_date in seasonal_dates:
        result = await weather_cache.ensure_range(
            lat=lat,
            lon=lon,
            start=test_date,
            end=test_date + timedelta(days=1),
        )

        multiplier = calculate_weather_budget_multiplier(
            weather_frame=result.frame,
            target_date=test_date,
            min_temp_c=0.0,
            max_temp_c=30.0,
            precipitation_threshold_mm=10.0,
            heatwave_sensitive=True,
            cold_sensitive=True,
        )
        assert 0.5 <= multiplier <= 2.0, \
            f"Budget multiplier {multiplier} outside valid range for {test_date.strftime('%B')}"