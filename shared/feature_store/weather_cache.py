from __future__ import annotations

import asyncio
import heapq
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, Optional
from zoneinfo import ZoneInfo

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
    "timezone": "auto",
}

DAILY_FIELD_MAP = {
    "temperature_2m_mean": "temp_c",
    "temperature_2m_max": "temp_max_c",
    "temperature_2m_min": "temp_min_c",
    "apparent_temperature_mean": "apparent_temp_c",
    "precipitation_sum": "precip_mm",
    "precipitation_probability_max": "precip_probability",
    "relative_humidity_2m_mean": "humidity_mean",
    "windspeed_10m_max": "windspeed_max",
    "uv_index_max": "uv_index_max",
    "snowfall_sum": "snowfall_mm",
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
    timezone: str


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
            timezone_name = str(payload.get("timezone") or "UTC")
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
                timezone=timezone_name,
            )

        params = dict(DEFAULT_WEATHER_PARAMS)
        if extra_params:
            params.update(extra_params)
        try:
            response = await self._fetch_blended_payload(
                cell=cell,
                lat=lat,
                lon=lon,
                start=start,
                end=end,
                params=params,
            )
            self._cell_dir(cell).mkdir(parents=True, exist_ok=True)
            self._write_json(path, response)
            timezone_name = str(response.get("timezone") or params.get("timezone") or "UTC")
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
                timezone=timezone_name,
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

    async def _fetch_blended_payload(
        self,
        *,
        cell: str,
        lat: float,
        lon: float,
        start: date,
        end: date,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        params_with_range = dict(params)
        params_with_range.update(
            {
                "start_date": start.isoformat(),
                "end_date": end.isoformat(),
            }
        )

        forecast_payload = await self.connector.fetch_forecast(lat=lat, lon=lon, **params_with_range)
        timezone_value = forecast_payload.get("timezone")
        timezone_name = (
            str(timezone_value)
            if timezone_value not in (None, "", "auto")
            else "UTC"
        )
        utc_offset_seconds = int(forecast_payload.get("utc_offset_seconds") or 0)
        units = forecast_payload.get("daily_units") or {}

        local_today = self._local_today(timezone_name)
        historical_end_date = local_today - timedelta(days=1)
        archive_end = min(end, historical_end_date)

        frames: list[pl.DataFrame] = []
        archive_payload: dict[str, Any] | None = None
        if archive_end >= start:
            archive_params = dict(params)
            archive_params.update(
                {
                    "start_date": start.isoformat(),
                    "end_date": archive_end.isoformat(),
                }
            )
            archive_payload = await self.connector.fetch_archive(lat=lat, lon=lon, **archive_params)
            archive_timezone = archive_payload.get("timezone")
            if archive_timezone:
                if timezone_value in (None, "", "auto") and timezone_name == "UTC":
                    timezone_name = str(archive_timezone)
                elif archive_timezone != timezone_name:
                    raise ValueError(
                        f"Forecast timezone {timezone_name} does not match archive timezone {archive_timezone}"
                    )
            if not units:
                units = archive_payload.get("daily_units") or {}
            if not utc_offset_seconds:
                utc_offset_seconds = int(archive_payload.get("utc_offset_seconds") or 0)

            archive_frame = self._payload_to_frame(cell, lat, lon, archive_payload)
            archive_frame = self._filter_frame_range(archive_frame, start, archive_end)
            if not archive_frame.is_empty():
                frames.append(
                    archive_frame.with_columns(
                        pl.lit("observed").alias("observation_type"),
                        pl.lit(0).alias("__priority"),
                    )
                )

        forecast_start = max(start, local_today)
        forecast_frame = self._payload_to_frame(cell, lat, lon, forecast_payload)
        forecast_frame = self._filter_frame_range(forecast_frame, forecast_start, end)
        if not forecast_frame.is_empty():
            frames.append(
                forecast_frame.with_columns(
                    pl.lit("forecast").alias("observation_type"),
                    pl.lit(1).alias("__priority"),
                )
            )

        combined = self._combine_frames(frames)
        return self._frame_to_payload(
            combined,
            latitude=lat,
            longitude=lon,
            tz_name=timezone_name,
            utc_offset_seconds=utc_offset_seconds,
            units=units,
        )

    def _frame_to_payload(
        self,
        frame: pl.DataFrame,
        *,
        latitude: float,
        longitude: float,
        tz_name: str,
        utc_offset_seconds: int,
        units: dict[str, Any],
    ) -> dict[str, Any]:
        generated_at = datetime.now(timezone.utc).isoformat()

        if frame.is_empty():
            daily = {"time": [], "observation_type": []}
        else:
            if "observation_type" not in frame.columns:
                frame = frame.with_columns(pl.lit("observed").alias("observation_type"))
            frame = frame.sort(["date", "geohash"])
            dates = frame.get_column("date").to_list()
            daily = {
                "time": dates,
                "observation_type": frame.get_column("observation_type").to_list(),
            }
            for api_field, column_name in DAILY_FIELD_MAP.items():
                if column_name in frame.columns:
                    values = frame.get_column(column_name).to_list()
                    if api_field == "precipitation_probability_max":
                        values = [None if value is None else float(value) * 100 for value in values]
                    else:
                        values = [None if value is None else float(value) for value in values]
                else:
                    values = [None] * len(dates)
                daily[api_field] = values

        return {
            "latitude": latitude,
            "longitude": longitude,
            "timezone": tz_name,
            "utc_offset_seconds": utc_offset_seconds,
            "daily": daily,
            "daily_units": units or {},
            "generated_at": generated_at,
        }

    def _combine_frames(self, frames: list[pl.DataFrame]) -> pl.DataFrame:
        if not frames:
            return pl.DataFrame({"date": [], "geohash": []})

        combined = pl.concat(frames, how="vertical")
        if combined.is_empty():
            return combined.drop(["__priority"], strict=False)

        if "__priority" not in combined.columns:
            combined = combined.with_columns(pl.lit(0).alias("__priority"))
        if "observation_type" not in combined.columns:
            combined = combined.with_columns(pl.lit("observed").alias("observation_type"))

        combined = combined.sort(["date", "__priority"])
        combined = combined.unique(["date", "geohash"], keep="first")
        combined = combined.drop(["__priority"], strict=False)
        return combined.sort(["date", "geohash"])

    @staticmethod
    def _filter_frame_range(frame: pl.DataFrame, start: date, end: date) -> pl.DataFrame:
        if frame.is_empty():
            return frame
        if start > end:
            return frame.head(0)
        start_str = start.isoformat()
        end_str = end.isoformat()
        return frame.filter(pl.col("date").is_between(pl.lit(start_str), pl.lit(end_str)))

    @staticmethod
    def _local_today(timezone_name: str) -> date:
        try:
            tz = ZoneInfo(timezone_name)
        except Exception:
            return date.today()
        return datetime.now(tz).date()


    def prune(self, max_files_per_cell: int = 12) -> None:
        """Trim cached ranges per cell to avoid unbounded growth."""

        limit = max(0, int(max_files_per_cell))
        for cell_dir in self.root.iterdir():
            if not cell_dir.is_dir():
                continue
            timed_paths: list[tuple[float, Path]] = []
            for path in cell_dir.glob("*.json"):
                try:
                    mtime = path.stat().st_mtime
                except FileNotFoundError:
                    continue
                timed_paths.append((mtime, path))
            if not timed_paths:
                continue
            if limit == 0:
                stale_entries = timed_paths
            else:
                stale_count = len(timed_paths) - limit
                if stale_count <= 0:
                    continue
                stale_entries = heapq.nsmallest(stale_count, timed_paths, key=lambda item: item[0])
            for _, stale_path in stale_entries:
                stale_path.unlink(missing_ok=True)

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

        generated_at = str(payload.get("generated_at") or datetime.utcnow().replace(tzinfo=timezone.utc).isoformat())

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
            pl.lit(generated_at).alias("as_of_utc"),
        ])

        return frame.select([
            "date",
            "local_date",
            "local_datetime",
            "utc_datetime",
            "timezone",
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
            "observation_type",
            "as_of_utc",
        ])

    def _payload_to_frame(
        self,
        cell: str,
        lat: float,
        lon: float,
        payload: dict[str, Any],
    ) -> pl.DataFrame:
        daily = payload.get("daily") or {}
        dates = daily.get("time") or []
        if not dates:
            return pl.DataFrame(
                {
                    "date": [],
                    "local_date": [],
                    "local_datetime": [],
                    "utc_datetime": [],
                    "timezone": [],
                    "geohash": [],
                    "day_of_year": [],
                    "temp_c": [],
                    "temp_max_c": [],
                    "temp_min_c": [],
                    "apparent_temp_c": [],
                    "precip_mm": [],
                    "precip_probability": [],
                    "humidity_mean": [],
                    "windspeed_max": [],
                    "uv_index_max": [],
                    "snowfall_mm": [],
                    "observation_type": [],
                }
            )

        length = len(dates)
        tz_name = payload.get("timezone") or "UTC"
        try:
            tzinfo = ZoneInfo(tz_name)
        except Exception:  # pragma: no cover - fallback when timezone database lacks entry
            tzinfo = timezone.utc
            tz_name = "UTC"

        def series(name: str, default: float | None = None) -> list[float | None]:
            values = daily.get(name)
            if not values:
                return [default] * length
            return [self._as_float(values[i]) if i < len(values) else default for i in range(length)]

        local_datetimes = [
            datetime.combine(self._parse_date(raw_date), time.min, tzinfo=tzinfo) for raw_date in dates
        ]
        utc_datetimes = [local_dt.astimezone(timezone.utc) for local_dt in local_datetimes]

        precip_probabilities = [
            (value / 100.0) if value is not None else None for value in series("precipitation_probability_max")
        ]

        raw_observation = daily.get("observation_type") or []
        observation_types = [
            str(raw_observation[i]).lower() if i < len(raw_observation) and raw_observation[i] else "observed"
            for i in range(length)
        ]

        frame = pl.DataFrame(
            {
                "date": [dt.date().isoformat() for dt in utc_datetimes],
                "local_date": [dt.date().isoformat() for dt in local_datetimes],
                "local_datetime": [dt.isoformat() for dt in local_datetimes],
                "utc_datetime": [dt.isoformat() for dt in utc_datetimes],
                "timezone": [tz_name] * length,
                "geohash": [cell] * length,
                "day_of_year": [dt.timetuple().tm_yday for dt in local_datetimes],
                "temp_c": series("temperature_2m_mean"),
                "temp_max_c": series("temperature_2m_max"),
                "temp_min_c": series("temperature_2m_min"),
                "apparent_temp_c": series("apparent_temperature_mean"),
                "precip_mm": series("precipitation_sum", default=0.0),
                "precip_probability": precip_probabilities,
                "humidity_mean": series("relative_humidity_2m_mean"),
                "windspeed_max": series("windspeed_10m_max"),
                "uv_index_max": series("uv_index_max"),
                "snowfall_mm": series("snowfall_sum", default=0.0),
                "observation_type": observation_types,
            }
        )

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
            .rolling_mean(window_size=7, min_samples=3)
            .over("geohash")
            .alias("temp_roll7"),
            pl.col("precip_mm")
            .rolling_mean(window_size=7, min_samples=3)
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
            pl.len().alias("observations"),
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
    *,
    max_concurrency: int = 5,
) -> list[WeatherFetchResult]:
    coordinate_list = list(coordinates)
    if not coordinate_list:
        return []
    limit = max(1, max_concurrency)
    semaphore = asyncio.Semaphore(limit)

    async def _bounded_fetch(lat: float, lon: float) -> WeatherFetchResult:
        async with semaphore:
            return await cache.ensure_range(lat=lat, lon=lon, start=start, end=end)

    tasks = [asyncio.create_task(_bounded_fetch(lat, lon)) for lat, lon in coordinate_list]
    try:
        return await asyncio.gather(*tasks)
    except Exception:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
