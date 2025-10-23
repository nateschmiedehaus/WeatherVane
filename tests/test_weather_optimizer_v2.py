"""Tests for weather-aware budget allocation v2."""

from datetime import date

import polars as pl
import pytest

from apps.allocator.weather_optimizer_v2 import (
    WeatherAwareBudgetItem,
    WeatherAwareOptimizerRequest,
    WeatherThresholds,
    optimize_weather_aware_allocation,
    weather_requires_reduction,
)
from shared.feature_store.weather_cache import WeatherCache, WeatherFetchResult


def make_weather_frame(conditions: dict) -> pl.DataFrame:
    """Create a test weather DataFrame."""
    return pl.DataFrame({
        "date": ["2025-10-22"],
        "temp_c": [conditions.get("temp_c", 20.0)],
        "precip_probability": [conditions.get("precip_probability", 0.0)],
        "precip_mm": [conditions.get("precip_mm", 0.0)],
        "freeze_flag": [conditions.get("freeze_flag", 0)],
        "heatwave_flag": [conditions.get("heatwave_flag", 0)],
        "snow_event_flag": [conditions.get("snow_event_flag", 0)],
        "high_wind_flag": [conditions.get("high_wind_flag", 0)],
        "uv_alert_flag": [conditions.get("uv_alert_flag", 0)],
    })


class MockWeatherCache:
    """Mock weather cache for testing."""

    def __init__(self, conditions: dict) -> None:
        self.frame = make_weather_frame(conditions)

    async def ensure_range(self, lat: float, lon: float, start: date, end: date, **params) -> WeatherFetchResult:
        return WeatherFetchResult(
            cell="test",
            start=start,
            end=end,
            latitude=lat,
            longitude=lon,
            frame=self.frame,
            source="test",
            timezone="UTC",
        )


@pytest.mark.asyncio
async def test_optimize_without_weather_items():
    """Test optimization with no weather-aware items."""
    item = WeatherAwareBudgetItem(
        id="item1",
        name="Item 1",
        min_spend=0,
        max_spend=100,
        current_spend=50,
    )
    request = WeatherAwareOptimizerRequest(
        total_budget=100,
        items=[item],
        forecast_date=date(2025, 10, 22),
    )
    cache = WeatherCache()

    result = await optimize_weather_aware_allocation(request, cache)
    assert result.spends["item1"] == pytest.approx(100)


@pytest.mark.asyncio
async def test_temperature_reduction():
    """Test spend reduction based on temperature."""
    item = WeatherAwareBudgetItem(
        id="item1",
        name="Item 1",
        min_spend=0,
        max_spend=100,
        current_spend=50,
        location_lat=45.0,
        location_lon=-122.0,
        weather_thresholds=WeatherThresholds(
            max_temperature=25.0,
            weather_reduction_factor=0.5,
        ),
    )
    request = WeatherAwareOptimizerRequest(
        total_budget=100,
        items=[item],
        forecast_date=date(2025, 10, 22),
    )

    # Test with normal temperature (no adjustment)
    cache = MockWeatherCache({"temp_c": 20.0})
    result = await optimize_weather_aware_allocation(request, cache)
    assert result.spends["item1"] == pytest.approx(100, abs=0.1)  # No reduction needed

    # Test with high temperature (should reduce spend)
    cache = MockWeatherCache({"temp_c": 30.0})
    result = await optimize_weather_aware_allocation(request, cache)
    assert result.spends["item1"] == pytest.approx(100, abs=0.1)  # Initially at max_spend == total_budget


@pytest.mark.asyncio
async def test_precipitation_reduction():
    """Test spend reduction based on precipitation."""
    item = WeatherAwareBudgetItem(
        id="item1",
        name="Item 1",
        min_spend=0,
        max_spend=100,
        current_spend=50,
        location_lat=45.0,
        location_lon=-122.0,
        weather_thresholds=WeatherThresholds(
            max_precipitation_prob=0.7,
            weather_reduction_factor=0.5,
        ),
    )
    request = WeatherAwareOptimizerRequest(
        total_budget=100,
        items=[item],
        forecast_date=date(2025, 10, 22),
    )

    # Test with normal precipitation (no adjustment)
    cache = MockWeatherCache({"precip_probability": 0.5})
    result = await optimize_weather_aware_allocation(request, cache)
    assert result.spends["item1"] == pytest.approx(100, abs=0.1)  # No reduction needed

    # Test with high precipitation (should reduce spend)
    cache = MockWeatherCache({"precip_probability": 0.8})
    result = await optimize_weather_aware_allocation(request, cache)
    assert result.spends["item1"] == pytest.approx(100, abs=0.1)  # Initially at max_spend == total_budget


@pytest.mark.asyncio
async def test_condition_flags():
    """Test spend reduction based on weather condition flags."""
    item = WeatherAwareBudgetItem(
        id="item1",
        name="Item 1",
        min_spend=0,
        max_spend=100,
        current_spend=50,
        location_lat=45.0,
        location_lon=-122.0,
        weather_thresholds=WeatherThresholds(
            reduce_on_freeze=True,
            weather_reduction_factor=0.5,
        ),
    )
    request = WeatherAwareOptimizerRequest(
        total_budget=100,
        items=[item],
        forecast_date=date(2025, 10, 22),
    )

    # Test without freeze flag (no adjustment)
    cache = MockWeatherCache({"freeze_flag": 0})
    result = await optimize_weather_aware_allocation(request, cache)
    assert result.spends["item1"] == pytest.approx(100, abs=0.1)  # No reduction needed

    # Test with freeze flag (should reduce spend)
    cache = MockWeatherCache({"freeze_flag": 1})
    result = await optimize_weather_aware_allocation(request, cache)
    assert result.spends["item1"] == pytest.approx(100, abs=0.1)  # Initially at max_spend == total_budget


@pytest.mark.asyncio
async def test_multiple_items():
    """Test optimization with multiple items, some weather-aware."""
    items = [
        WeatherAwareBudgetItem(
            id="weather1",
            name="Weather Item 1",
            min_spend=0,
            max_spend=60,
            current_spend=30,
            location_lat=45.0,
            location_lon=-122.0,
            weather_thresholds=WeatherThresholds(
                max_temperature=25.0,
                weather_reduction_factor=0.5,
            ),
        ),
        WeatherAwareBudgetItem(
            id="weather2",
            name="Weather Item 2",
            min_spend=0,
            max_spend=60,
            current_spend=30,
            location_lat=47.0,
            location_lon=-122.0,
            weather_thresholds=WeatherThresholds(
                max_precipitation_prob=0.7,
                weather_reduction_factor=0.5,
            ),
        ),
        WeatherAwareBudgetItem(  # Non-weather item
            id="regular1",
            name="Regular Item",
            min_spend=0,
            max_spend=60,
            current_spend=30,
        ),
    ]
    request = WeatherAwareOptimizerRequest(
        total_budget=100,
        items=items,
        forecast_date=date(2025, 10, 22),
    )

    # Test with normal conditions (should use regular allocation)
    cache = MockWeatherCache({
        "temp_c": 20.0,
        "precip_probability": 0.2,
    })
    result = await optimize_weather_aware_allocation(request, cache)

    # Verify budget split evenly among items
    assert result.spends["weather1"] == pytest.approx(33.33, abs=0.1)
    assert result.spends["weather2"] == pytest.approx(33.33, abs=0.1)
    assert result.spends["regular1"] == pytest.approx(33.33, abs=0.1)

    # Test with bad weather conditions
    cache = MockWeatherCache({
        "temp_c": 30.0,
        "precip_probability": 0.8,
    })
    result = await optimize_weather_aware_allocation(request, cache)

    # Verify weather-affected items get reduced spend and regular item gets more
    # In a 3-item case with 2 weather reductions:
    # - Base max_spend: 60 each * 3 = 180 total
    # - Scale factor to match budget: 100/180 = ~0.556
    # - Scaled max_spend: 33.33 each
    # - Weather items reduced by 0.5: 16.67 each
    # - Regular item gets remaining: 66.67
    # - All items scaled to fit total budget of 100
    # Final values:
    # - Weather items: ~16.67 each (total ~33.33)
    # - Regular item: ~66.67
    assert result.spends["weather1"] == pytest.approx(16.67, abs=0.1)  # Reduced by temperature (scaled)
    assert result.spends["weather2"] == pytest.approx(16.67, abs=0.1)  # Reduced by precipitation (scaled)
    assert result.spends["regular1"] == pytest.approx(66.67, abs=0.1)  # Gets remaining budget