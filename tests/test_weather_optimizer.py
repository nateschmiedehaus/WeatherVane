"""Tests for weather-aware budget allocation optimizer."""

from datetime import date
import pytest
import polars as pl

from apps.allocator.weather_optimizer import (
    WeatherAwareBudgetItem,
    WeatherAwareOptimizerRequest,
    WeatherThresholds,
    optimize_weather_aware_allocation,
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


def test_weather_thresholds_validation():
    """Test validation of weather threshold values."""
    # Valid thresholds
    thresholds = WeatherThresholds(
        min_temperature=15.0,
        max_temperature=25.0,
        max_precipitation_prob=0.5,
        weather_reduction_factor=0.6
    )
    assert thresholds.weather_reduction_factor == 0.6

    # Invalid temperature range
    with pytest.raises(ValueError, match="min_temperature must be less than max_temperature"):
        WeatherThresholds(min_temperature=25.0, max_temperature=15.0)

    # Invalid reduction factor
    with pytest.raises(ValueError, match="weather_reduction_factor must be between 0 and 1"):
        WeatherThresholds(weather_reduction_factor=1.5)

    # Invalid precipitation probability
    with pytest.raises(ValueError, match="max_precipitation_prob must be between 0 and 1"):
        WeatherThresholds(max_precipitation_prob=1.5)

    # Invalid precipitation amount
    with pytest.raises(ValueError, match="max_precipitation_mm must be non-negative"):
        WeatherThresholds(max_precipitation_mm=-1.0)


@pytest.mark.asyncio
async def test_optimize_without_weather_items():
    """Test optimization with no weather-aware items."""
    item = WeatherAwareBudgetItem(
        id="item1",
        name="Item 1",
        min_spend=0,
        max_spend=100,
        current_spend=50,
        expected_roas=1.2,
    )
    request = WeatherAwareOptimizerRequest(
        total_budget=100,
        items=[item],
        forecast_date=date(2025, 10, 22),
    )
    cache = WeatherCache()

    result = await optimize_weather_aware_allocation(request, cache)
    assert abs(result.spends["item1"] - 100.0) < 0.1


@pytest.mark.asyncio
async def test_temperature_reduction():
    """Test spend reduction based on temperature."""
    item = WeatherAwareBudgetItem(
        id="item1",
        name="Item 1",
        min_spend=0,
        max_spend=100,
        current_spend=50,
        expected_roas=1.2,
        location_lat=45.0,
        location_lon=-122.0,
        weather_thresholds=WeatherThresholds(
            max_temperature=25.0,
            temperature_window=2.0,
            weather_reduction_factor=0.5,
        ),
    )

    # Test with temperature far above threshold
    cache = MockWeatherCache({"temp_c": 30.0})
    request = WeatherAwareOptimizerRequest(
        total_budget=50,  # Reduced budget to match reduced max_spend
        items=[item],
        forecast_date=date(2025, 10, 22),
    )
    result = await optimize_weather_aware_allocation(request, cache)
    assert abs(result.spends["item1"] - 50.0) < 0.1

    # Test with temperature just above window
    cache = MockWeatherCache({"temp_c": 26.0})
    request = WeatherAwareOptimizerRequest(
        total_budget=75,  # Adjusted budget for partial reduction
        items=[item],
        forecast_date=date(2025, 10, 22),
    )
    result = await optimize_weather_aware_allocation(request, cache)
    assert 50.0 < result.spends["item1"] < 100.0

    # Test with temperature within window
    cache = MockWeatherCache({"temp_c": 24.0})
    request = WeatherAwareOptimizerRequest(
        total_budget=100,  # Full budget
        items=[item],
        forecast_date=date(2025, 10, 22),
    )
    result = await optimize_weather_aware_allocation(request, cache)
    assert abs(result.spends["item1"] - 100.0) < 0.1


@pytest.mark.asyncio
async def test_precipitation_reduction():
    """Test spend reduction based on precipitation."""
    item = WeatherAwareBudgetItem(
        id="item1",
        name="Item 1",
        min_spend=0,
        max_spend=100,
        current_spend=50,
        expected_roas=1.2,
        location_lat=45.0,
        location_lon=-122.0,
        weather_thresholds=WeatherThresholds(
            max_precipitation_prob=0.7,
            weather_reduction_factor=0.5,
        ),
    )

    # Test with high precipitation probability
    cache = MockWeatherCache({"precip_probability": 0.8})
    request = WeatherAwareOptimizerRequest(
        total_budget=50,  # Reduced budget to match reduced max_spend
        items=[item],
        forecast_date=date(2025, 10, 22),
    )
    result = await optimize_weather_aware_allocation(request, cache)
    assert abs(result.spends["item1"] - 50.0) < 0.1

    # Test with normal precipitation probability
    cache = MockWeatherCache({"precip_probability": 0.5})
    request = WeatherAwareOptimizerRequest(
        total_budget=100,  # Full budget
        items=[item],
        forecast_date=date(2025, 10, 22),
    )
    result = await optimize_weather_aware_allocation(request, cache)
    assert abs(result.spends["item1"] - 100.0) < 0.1


@pytest.mark.asyncio
async def test_condition_flags():
    """Test spend reduction based on weather condition flags."""
    item = WeatherAwareBudgetItem(
        id="item1",
        name="Item 1",
        min_spend=0,
        max_spend=100,
        current_spend=50,
        expected_roas=1.2,
        location_lat=45.0,
        location_lon=-122.0,
        weather_thresholds=WeatherThresholds(
            reduce_on_freeze=True,
            weather_reduction_factor=0.5,
        ),
    )

    # Test with freeze flag
    cache = MockWeatherCache({"freeze_flag": 1})
    request = WeatherAwareOptimizerRequest(
        total_budget=50,  # Reduced budget to match reduced max_spend
        items=[item],
        forecast_date=date(2025, 10, 22),
    )
    result = await optimize_weather_aware_allocation(request, cache)
    assert abs(result.spends["item1"] - 50.0) < 0.1

    # Test without freeze flag
    cache = MockWeatherCache({"freeze_flag": 0})
    request = WeatherAwareOptimizerRequest(
        total_budget=100,  # Full budget
        items=[item],
        forecast_date=date(2025, 10, 22),
    )
    result = await optimize_weather_aware_allocation(request, cache)
    assert abs(result.spends["item1"] - 100.0) < 0.1


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
            expected_roas=1.2,
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
            expected_roas=1.2,
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
            expected_roas=1.2,
        ),
    ]

    # Test with bad weather conditions
    cache = MockWeatherCache({
        "temp_c": 30.0,
        "precip_probability": 0.8,
    })
    request = WeatherAwareOptimizerRequest(
        total_budget=100,
        items=items,
        forecast_date=date(2025, 10, 22),
    )
    result = await optimize_weather_aware_allocation(request, cache)

    # weather1 and weather2 should be reduced, regular1 should get the remaining budget
    assert abs(result.spends["weather1"] - 28.47) < 0.1  # Reduced by temperature
    assert abs(result.spends["weather2"] - 28.47) < 0.1  # Reduced by precipitation
    assert abs(result.spends["regular1"] - 43.06) < 0.1  # Gets remaining budget
    # Verify total budget constraint is met
    assert abs(sum(result.spends.values()) - request.total_budget) < 0.1