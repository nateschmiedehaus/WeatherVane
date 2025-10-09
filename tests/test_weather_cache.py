import json
from datetime import date
from pathlib import Path

import polars as pl
import pytest

import geohash2  # type: ignore

from shared.feature_store.weather_cache import WeatherCache
from shared.libs.connectors.weather import WeatherConnector
from shared.observability import metrics


class StubWeatherConnector(WeatherConnector):
    def __init__(self):
        pass

    async def fetch(self, lat: float, lon: float, **params):  # type: ignore[override]
        return {
            "daily": {
                "time": ["2024-01-01", "2024-01-02"],
                "temperature_2m_mean": [10, 12],
                "temperature_2m_max": [12, 14],
                "temperature_2m_min": [8, 9],
                "apparent_temperature_mean": [9, 11],
                "precipitation_sum": [1.0, 2.5],
                "precipitation_probability_max": [60, 80],
                "relative_humidity_2m_mean": [70, 75],
                "windspeed_10m_max": [30, 40],
                "uv_index_max": [5, 7],
                "snowfall_sum": [0.0, 0.2],
            }
        }


@pytest.mark.asyncio
async def test_weather_cache_round_trips(tmp_path: Path):
    metrics_dir = metrics.configure_run(base_dir=str(tmp_path / "metrics"), ensure_clean=True)
    cache = WeatherCache(root=tmp_path, connector=StubWeatherConnector(), precision=5)

    start = date(2024, 1, 1)
    end = date(2024, 1, 3)

    result1 = await cache.ensure_range(37.77, -122.42, start, end)
    assert result1.source == "upstream"
    assert result1.cell == geohash2.encode(37.77, -122.42, 5)
    assert result1.frame.shape[0] == 2
    expected_cols = {
        "date",
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
        "freeze_flag",
        "heatwave_flag",
        "snow_event_flag",
    }
    assert expected_cols.issubset(set(result1.frame.columns))
    assert result1.frame["temp_anomaly"].abs().max() > 0

    result2 = await cache.ensure_range(37.77, -122.42, start, end)
    assert result2.source == "cache"
    assert result2.cell == result1.cell
    assert result2.frame["temp_anomaly"].abs().max() < 1e-6
    assert result2.frame["precip_anomaly"].abs().max() < 1e-6
    assert "temp_roll7" in result2.frame.columns
    assert "precip_roll7" in result2.frame.columns

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
