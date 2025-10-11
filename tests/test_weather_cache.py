import asyncio
import json
from datetime import date
from pathlib import Path
from typing import Any

import polars as pl
import pytest

import geohash2  # type: ignore

from shared.feature_store.weather_cache import (
    WeatherCache,
    WeatherFetchResult,
    hydrate_weather_cells,
)
from shared.observability import metrics
from shared.validation.schemas import validate_weather_daily


class StubWeatherConnector:
    def __init__(self) -> None:
        self.forecast_calls: list[dict[str, Any]] = []
        self.archive_calls: list[dict[str, Any]] = []

    async def fetch_forecast(self, lat: float, lon: float, **params: Any) -> dict[str, Any]:
        self.forecast_calls.append({"lat": lat, "lon": lon, "params": params})
        return {
            "timezone": "America/Los_Angeles",
            "utc_offset_seconds": -28800,
            "daily_units": {
                "time": "iso8601",
                "temperature_2m_mean": "°C",
            },
            "daily": {
                "time": ["2024-01-02", "2024-01-03", "2024-01-04"],
                "temperature_2m_mean": [99, 14, 16],
                "temperature_2m_max": [101, 18, 20],
                "temperature_2m_min": [97, 10, 12],
                "apparent_temperature_mean": [98, 13, 15],
                "precipitation_sum": [0.1, 1.2, 0.0],
                "precipitation_probability_max": [20, 40, 10],
                "relative_humidity_2m_mean": [55, 60, 58],
                "windspeed_10m_max": [25, 30, 28],
                "uv_index_max": [6, 7, 5],
                "snowfall_sum": [0.0, 0.0, 0.0],
                "observation_type": ["forecast", "forecast", "forecast"],
            },
        }

    async def fetch_archive(self, lat: float, lon: float, **params: Any) -> dict[str, Any]:
        self.archive_calls.append({"lat": lat, "lon": lon, "params": params})
        return {
            "timezone": "America/Los_Angeles",
            "utc_offset_seconds": -28800,
            "daily": {
                "time": ["2024-01-01", "2024-01-02"],
                "temperature_2m_mean": [10, 12],
                "temperature_2m_max": [12, 15],
                "temperature_2m_min": [8, 9],
                "apparent_temperature_mean": [9, 11],
                "precipitation_sum": [1.0, 2.5],
                "precipitation_probability_max": [60, 80],
                "relative_humidity_2m_mean": [70, 75],
                "windspeed_10m_max": [30, 40],
                "uv_index_max": [5, 7],
                "snowfall_sum": [0.0, 0.2],
                "observation_type": ["archive", "archive"],
            },
        }


@pytest.mark.asyncio
async def test_weather_cache_round_trips(monkeypatch, tmp_path: Path):
    metrics_dir = metrics.configure_run(base_dir=str(tmp_path / "metrics"), ensure_clean=True)
    cache = WeatherCache(root=tmp_path, connector=StubWeatherConnector(), precision=5)
    monkeypatch.setattr(
        WeatherCache,
        "_local_today",
        staticmethod(lambda timezone_name: date(2024, 1, 3)),
    )

    start = date(2024, 1, 1)
    end = date(2024, 1, 4)

    result1 = await cache.ensure_range(37.77, -122.42, start, end)
    assert result1.source == "upstream"
    assert result1.cell == geohash2.encode(37.77, -122.42, 5)
    assert result1.frame.shape[0] == 4
    assert result1.timezone == "America/Los_Angeles"
    assert result1.frame.get_column("date").to_list() == [
        "2024-01-01",
        "2024-01-02",
        "2024-01-03",
        "2024-01-04",
    ]
    jan_two = result1.frame.filter(pl.col("date") == "2024-01-02")
    assert jan_two.shape[0] == 1
    # Historical archive values should take precedence over forecast duplicates
    assert jan_two.get_column("temp_c")[0] == 12
    assert set(result1.frame.get_column("observation_type").to_list()) == {"observed", "forecast"}
    validate_weather_daily(result1.frame)
    expected_cols = {
        "date",
        "local_date",
        "local_datetime",
        "utc_datetime",
        "timezone",
        "geohash",
        "temp_c",
        "temp_max_c",
        "temp_min_c",
        "apparent_temp_c",
        "precip_mm",
        "precip_probability",
        "humidity_mean",
        "windspeed_max",
        "uv_index_max",
        "snowfall_mm",
        "temp_anomaly",
        "precip_anomaly",
        "temp_roll7",
        "precip_roll7",
        "temp_c_lag1",
        "precip_mm_lag1",
        "uv_index_lag1",
        "precip_probability_lag1",
        "humidity_lag1",
        "freeze_flag",
        "heatwave_flag",
        "snow_event_flag",
        "high_wind_flag",
        "uv_alert_flag",
        "high_precip_prob_flag",
        "observation_type",
        "as_of_utc",
    }
    assert expected_cols.issubset(set(result1.frame.columns))
    assert result1.frame["temp_anomaly"].abs().max() > 0

    connector: StubWeatherConnector = cache.connector  # type: ignore[assignment]
    assert len(connector.archive_calls) == 1
    assert len(connector.forecast_calls) == 1
    forecast_params = connector.forecast_calls[0]["params"]
    assert forecast_params["timezone"] == "auto"
    assert forecast_params["start_date"] == start.isoformat()
    assert forecast_params["end_date"] == end.isoformat()

    result2 = await cache.ensure_range(37.77, -122.42, start, end)
    assert result2.source == "cache"
    assert result2.cell == result1.cell
    assert result2.frame["temp_anomaly"].abs().max() < 1e-6
    assert result2.frame["precip_anomaly"].abs().max() < 1e-6
    assert "temp_roll7" in result2.frame.columns
    assert "precip_roll7" in result2.frame.columns
    validate_weather_daily(result2.frame)

    climo_path = tmp_path / result1.cell / "climatology.parquet"
    assert climo_path.exists()

    metrics_file = metrics_dir / "metrics.jsonl"
    assert metrics_file.exists()
    lines = [line for line in metrics_file.read_text(encoding="utf-8").strip().splitlines() if line.strip()]
    assert len(lines) >= 2
    outcomes = [json.loads(line)["tags"]["outcome"] for line in lines]
    assert "miss" in outcomes
    assert "hit" in outcomes

    metrics.reset_run_directory()


@pytest.mark.asyncio
async def test_hydrate_weather_cells_uses_bounded_concurrency():
    start = date(2024, 1, 1)
    end = date(2024, 1, 2)

    class StubCache:
        def __init__(self) -> None:
            self.calls: list[tuple[float, float]] = []
            self.inflight = 0
            self.max_inflight = 0

        async def ensure_range(
            self,
            *,
            lat: float,
            lon: float,
            start: date,
            end: date,
        ) -> WeatherFetchResult:
            self.calls.append((lat, lon))
            self.inflight += 1
            self.max_inflight = max(self.max_inflight, self.inflight)
            try:
                await asyncio.sleep(0.01)
            finally:
                self.inflight -= 1
            frame = pl.DataFrame({"date": [start.isoformat()]})
            return WeatherFetchResult(
                cell="abcde",
                start=start,
                end=end,
                latitude=lat,
                longitude=lon,
                frame=frame,
                source="stub",
                timezone="UTC",
            )

    cache = StubCache()
    coords = [(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)]

    results = await hydrate_weather_cells(cache, coords, start, end, max_concurrency=2)

    assert len(results) == len(coords)
    assert cache.max_inflight == 2
    assert set(cache.calls) == set(coords)
    for result, (lat, lon) in zip(results, coords, strict=True):
        assert result.latitude == lat
        assert result.longitude == lon
