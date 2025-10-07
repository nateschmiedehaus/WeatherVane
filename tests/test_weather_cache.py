from datetime import date
from pathlib import Path

import polars as pl
import pytest

from shared.feature_store.weather_cache import WeatherCache
from shared.libs.connectors.weather import WeatherConnector


class StubWeatherConnector(WeatherConnector):
    def __init__(self):
        pass

    async def fetch(self, lat: float, lon: float, **params):  # type: ignore[override]
        return {
            "daily": {
                "time": ["2024-01-01", "2024-01-02"],
                "temperature_2m_mean": [10, 12],
                "precipitation_sum": [1.0, 2.5],
            }
        }


@pytest.mark.asyncio
async def test_weather_cache_round_trips(tmp_path: Path):
    cache = WeatherCache(root=tmp_path, connector=StubWeatherConnector(), precision=5)

    start = date(2024, 1, 1)
    end = date(2024, 1, 3)

    result1 = await cache.ensure_range(37.77, -122.42, start, end)
    assert result1.source == "upstream"
    assert result1.frame.shape == (2, 4)

    result2 = await cache.ensure_range(37.77, -122.42, start, end)
    assert result2.source == "cache"
    assert result2.frame.frame_equal(result1.frame)
