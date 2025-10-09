from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Iterable, Optional

import geohash2  # type: ignore
import polars as pl

from shared.libs.connectors import WeatherConfig, WeatherConnector
from shared.observability import metrics

DAILY_VARIABLES = [
    "temperature_2m_mean",
    "temperature_2m_max",
    "temperature_2m_min",
    "apparent_temperature_mean",
    "relative_humidity_2m_mean",
    "windspeed_10m_max",
    "uv_index_max",
    "precipitation_sum",
    "precipitation_probability_max",
    "snowfall_sum",
]

DEFAULT_WEATHER_PARAMS = {
    "daily": ",".join(DAILY_VARIABLES),
    "timezone": "UTC",
}


def make_geocell(lat: float, lon: float, precision: int = 5) -> str:
    """Encode a latitude/longitude pair into a geohash cell."""

    return geohash2.encode(lat, lon, precision)


@dataclass
class WeatherFetchResult:
    cell: str
    start: date
    end: date
    latitude: float
    longitude: float
    frame: pl.DataFrame
    source: str


class WeatherCache:
    """Filesystem-backed cache for weather responses with climatology tracking."""

    def __init__(
        self,
        root: Path | str = Path("storage/lake/weather"),
        connector: Optional[WeatherConnector] = None,
        precision: int = 5,
    ) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.connector = connector or WeatherConnector(WeatherConfig())
        self.precision = precision

    def _cell_dir(self, cell: str) -> Path:
        return self.root / cell

    def _range_path(self, cell: str, start: date, end: date) -> Path:
        return self._cell_dir(cell) / f"{start.isoformat()}__{end.isoformat()}.json"

    async def ensure_range(
        self,
        lat: float,
        lon: float,
        start: date,
        end: date,
        extra_params: Optional[dict[str, Any]] = None,
    ) -> WeatherFetchResult:
        cell = make_geocell(lat, lon, precision=self.precision)
        path = self._range_path(cell, start, end)
        started_at = datetime.utcnow()
        if path.exists():
            payload = self._load_json(path)
            frame = self._prepare_frame(cell, lat, lon, payload, update_climatology=False)
            self._emit_fetch_metric(
                cell=cell,
                outcome="hit",
                source="cache",
                duration_seconds=(datetime.utcnow() - started_at).total_seconds(),
                row_count=int(frame.height),
                lat=lat,
                lon=lon,
            )
            return WeatherFetchResult(
                cell=cell,
                start=start,
                end=end,
                latitude=lat,
                longitude=lon,
                frame=frame,
                source="cache",
            )

        params = dict(DEFAULT_WEATHER_PARAMS)
        if extra_params:
            params.update(extra_params)
        params.update({
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
        })
        try:
            response = await self.connector.fetch(lat=lat, lon=lon, **params)
            self._cell_dir(cell).mkdir(parents=True, exist_ok=True)
            self._write_json(path, response)
            frame = self._prepare_frame(cell, lat, lon, response, update_climatology=True)
            self._emit_fetch_metric(
                cell=cell,
                outcome="miss",
                source="upstream",
                duration_seconds=(datetime.utcnow() - started_at).total_seconds(),
                row_count=int(frame.height),
                lat=lat,
                lon=lon,
            )
            return WeatherFetchResult(
                cell=cell,
                start=start,
                end=end,
                latitude=lat,
                longitude=lon,
                frame=frame,
                source="upstream",
            )
        except Exception:
            self._emit_fetch_metric(
                cell=cell,
                outcome="error",
                source="upstream",
                duration_seconds=(datetime.utcnow() - started_at).total_seconds(),
                row_count=None,
                lat=lat,
                lon=lon,
            )
            raise

    def prune(self, max_files_per_cell: int = 12) -> None:
        """Trim cached ranges per cell to avoid unbounded growth."""

        for cell_dir in self.root.iterdir():
            if not cell_dir.is_dir():
                continue
            files = sorted(cell_dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            for stale in files[max_files_per_cell:]:
                stale.unlink(missing_ok=True)

    def _prepare_frame(
        self,
        cell: str,
        lat: float,
        lon: float,
        payload: dict[str, Any],
        *,
        update_climatology: bool,
    ) -> pl.DataFrame:
        frame = self._payload_to_frame(cell, lat, lon, payload)
        if frame.is_empty():
            return frame

        climatology = self._load_climatology(cell)
        frame = self._apply_climatology(frame, climatology)

        if update_climatology:
            self._update_climatology(cell, frame)

        frame = frame.with_columns([
            pl.col("temp_c").shift(1).over("geohash").alias("temp_c_lag1"),
            pl.col("precip_mm").shift(1).over("geohash").alias("precip_mm_lag1"),
            pl.col("uv_index_max").shift(1).over("geohash").alias("uv_index_lag1"),
            pl.col("precip_probability").shift(1).over("geohash").alias("precip_probability_lag1"),
            pl.col("humidity_mean").shift(1).over("geohash").alias("humidity_lag1"),
            (pl.col("temp_c") <= 0).cast(pl.Int8).alias("freeze_flag"),
            (pl.col("temp_c") >= 30).cast(pl.Int8).alias("heatwave_flag"),
            (pl.col("snowfall_mm") > 0).cast(pl.Int8).alias("snow_event_flag"),
            (pl.col("windspeed_max") >= 50).cast(pl.Int8).alias("high_wind_flag"),
            (pl.col("uv_index_max") >= 7).cast(pl.Int8).alias("uv_alert_flag"),
            (pl.col("precip_probability").fill_null(0.0) >= 0.7).cast(pl.Int8).alias("high_precip_prob_flag"),
        ])

        return frame.select([
            "date",
            "geohash",
            "day_of_year",
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
        ])

    def _payload_to_frame(self, cell: str, lat: float, lon: float, payload: dict[str, Any]) -> pl.DataFrame:
        daily = payload.get("daily") or {}
        dates = daily.get("time") or []
        if not dates:
            return pl.DataFrame({
                "date": [],
                "geohash": [],
                "temp_c": [],
                "precip_mm": [],
                "day_of_year": [],
            })

        length = len(dates)

        def series(name: str, default: float | None = None) -> list[float | None]:
            values = daily.get(name)
            if not values:
                return [default] * length
            return [self._as_float(values[i]) if i < len(values) else default for i in range(length)]

        date_objs = [self._parse_date(dates[i]) for i in range(length)]

        frame = pl.DataFrame({
            "date": [value.isoformat() for value in date_objs],
            "geohash": [cell] * length,
            "day_of_year": [value.timetuple().tm_yday for value in date_objs],
            "temp_c": series("temperature_2m_mean"),
            "temp_max_c": series("temperature_2m_max"),
            "temp_min_c": series("temperature_2m_min"),
            "apparent_temp_c": series("apparent_temperature_mean"),
            "precip_mm": series("precipitation_sum", default=0.0),
            "precip_probability": [
                (self._as_float(v) / 100.0) if v is not None else None
                for v in series("precipitation_probability_max")
            ],
            "humidity_mean": series("relative_humidity_2m_mean"),
            "windspeed_max": series("windspeed_10m_max"),
            "uv_index_max": series("uv_index_max"),
            "snowfall_mm": series("snowfall_sum", default=0.0),
        })

        return frame

    def _apply_climatology(self, frame: pl.DataFrame, climatology: pl.DataFrame) -> pl.DataFrame:
        if frame.is_empty():
            return frame

        temp_default = self._safe_mean(frame["temp_c"], 0.0)
        precip_default = self._safe_mean(frame["precip_mm"], 0.0)

        if not climatology.is_empty():
            denom = pl.when(pl.col("observations") == 0).then(1).otherwise(pl.col("observations"))
            climo_means = climatology.with_columns([
                (pl.col("temp_sum") / denom).alias("temp_climo"),
                (pl.col("precip_sum") / denom).alias("precip_climo"),
            ]).select(["day_of_year", "temp_climo", "precip_climo"])
            frame = frame.join(climo_means, on="day_of_year", how="left")
            frame = frame.with_columns([
                pl.col("temp_climo").fill_null(temp_default).alias("temp_climo"),
                pl.col("precip_climo").fill_null(precip_default).alias("precip_climo"),
            ])
        else:
            frame = frame.with_columns([
                pl.lit(temp_default).alias("temp_climo"),
                pl.lit(precip_default).alias("precip_climo"),
            ])

        frame = frame.with_columns([
            (pl.col("temp_c") - pl.col("temp_climo")).alias("temp_anomaly"),
            (pl.col("precip_mm") - pl.col("precip_climo")).alias("precip_anomaly"),
        ])

        frame = frame.sort(["geohash", "day_of_year"])
        frame = frame.with_columns([
            pl.col("temp_c")
            .rolling_mean(window_size=7, min_periods=3)
            .over("geohash")
            .alias("temp_roll7"),
            pl.col("precip_mm")
            .rolling_mean(window_size=7, min_periods=3)
            .over("geohash")
            .alias("precip_roll7"),
        ])

        return frame

    def _emit_fetch_metric(
        self,
        *,
        cell: str,
        outcome: str,
        source: str,
        duration_seconds: float,
        row_count: Optional[int],
        lat: float,
        lon: float,
    ) -> None:
        payload = {
            "cell": cell,
            "duration_seconds": round(duration_seconds, 3),
            "row_count": int(row_count) if row_count is not None else -1,
            "latitude": round(lat, 5),
            "longitude": round(lon, 5),
        }
        metrics.emit(
            "weather.cache_fetch",
            payload,
            tags={
                "outcome": outcome,
                "source": source,
            },
        )

    def _update_climatology(self, cell: str, frame: pl.DataFrame) -> None:
        if frame.is_empty():
            return

        additions = frame.group_by("day_of_year").agg([
            pl.col("temp_c").sum().alias("temp_sum"),
            pl.col("precip_mm").sum().alias("precip_sum"),
            pl.count().alias("observations"),
        ])

        existing = self._load_climatology(cell)
        if existing.is_empty():
            updated = additions
        else:
            existing = existing.rename({
                "temp_sum": "temp_sum_existing",
                "precip_sum": "precip_sum_existing",
                "observations": "observations_existing",
            })
            updated = additions.join(existing, on="day_of_year", how="outer")
            updated = updated.with_columns([
                (pl.col("temp_sum").fill_null(0.0) + pl.col("temp_sum_existing").fill_null(0.0)).alias("temp_sum"),
                (pl.col("precip_sum").fill_null(0.0) + pl.col("precip_sum_existing").fill_null(0.0)).alias("precip_sum"),
                (pl.col("observations").fill_null(0) + pl.col("observations_existing").fill_null(0)).alias("observations"),
            ]).select(["day_of_year", "temp_sum", "precip_sum", "observations"])

        self._write_climatology(cell, updated)

    def _climatology_path(self, cell: str) -> Path:
        return self._cell_dir(cell) / "climatology.parquet"

    def _load_climatology(self, cell: str) -> pl.DataFrame:
        path = self._climatology_path(cell)
        if path.exists():
            return pl.read_parquet(path)
        return pl.DataFrame({
            "day_of_year": [],
            "temp_sum": [],
            "precip_sum": [],
            "observations": [],
        })

    def _write_climatology(self, cell: str, frame: pl.DataFrame) -> None:
        path = self._climatology_path(cell)
        path.parent.mkdir(parents=True, exist_ok=True)
        frame.write_parquet(path)

    def _parse_date(self, raw: Any) -> date:
        if isinstance(raw, date):
            return raw
        if isinstance(raw, datetime):
            return raw.date()
        if not isinstance(raw, str):
            raise ValueError("Unsupported date payload from weather provider")
        text = raw.strip()
        try:
            return datetime.fromisoformat(text).date()
        except ValueError:
            if "T" not in text:
                try:
                    return datetime.fromisoformat(f"{text}T00:00:00").date()
                except ValueError as exc:  # pragma: no cover - defensive
                    raise ValueError(f"Invalid weather date string: {text}") from exc
            raise

    @staticmethod
    def _as_float(value: Any) -> float:
        if value is None:
            return 0.0
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    @staticmethod
    def _safe_mean(series: pl.Series, fallback: float) -> float:
        value = series.mean()
        if value is None:
            return fallback
        value = float(value)
        if value != value:  # NaN check
            return fallback
        return value

    def _load_json(self, path: Path) -> dict[str, Any]:
        import json

        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)

    def _write_json(self, path: Path, payload: dict[str, Any]) -> None:
        import json

        with path.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh)


async def hydrate_weather_cells(
    cache: WeatherCache,
    coordinates: Iterable[tuple[float, float]],
    start: date,
    end: date,
) -> list[WeatherFetchResult]:
    results: list[WeatherFetchResult] = []
    for lat, lon in coordinates:
        result = await cache.ensure_range(lat=lat, lon=lon, start=start, end=end)
        results.append(result)
    return results
