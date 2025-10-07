import asyncio
from datetime import date
from pathlib import Path

import pytest

from shared.feature_store.weather_cache import WeatherCache, make_geocell


class StubWeatherConnector:
    def __init__(self) -> None:
        self.calls: list[tuple[float, float]] = []

    async def fetch(self, lat: float, lon: float, **params):
        self.calls.append((lat, lon))
        return {"lat": lat, "lon": lon, "params": params}


@pytest.mark.asyncio
async def test_weather_cache_round_trips(tmp_path: Path):
    connector = StubWeatherConnector()
    cache = WeatherCache(root=tmp_path, connector=connector)

    start = date(2024, 1, 1)
    end = date(2024, 1, 7)

    result1 = await cache.ensure_range(37.77, -122.42, start, end)
    assert result1.source == "upstream"
    assert connector.calls == [(37.77, -122.42)]

    result2 = await cache.ensure_range(37.76, -122.43, start, end)
    assert result2.source == "cache"
    # Rounding to 0.1 precision means the second call hits the same cache file.
    assert connector.calls == [(37.77, -122.42)]


def test_make_geocell_precision():
    assert make_geocell(37.7749, -122.4194, precision=2) == "37.77_-122.42"
