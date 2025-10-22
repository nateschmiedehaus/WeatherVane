#!/usr/bin/env python
"""Download Open-Meteo archive data for a set of geographies.

This helper is intended for seeding regression fixtures and local caches so Autopilot
has historical weather data on disk while other teams wire the remaining pipelines.
"""
from __future__ import annotations

import argparse
import json
import math
import textwrap
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable, List, Sequence

import geohash2  # type: ignore
import polars as pl
import requests

# Ensure repository root is present on sys.path when executed as a script
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))


ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
DEFAULT_DAILY_FIELDS = [
    "temperature_2m_max",
    "temperature_2m_min",
    "temperature_2m_mean",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "precipitation_sum",
    "precipitation_hours",
    "precipitation_probability_max",
    "rain_sum",
    "snowfall_sum",
    "windspeed_10m_max",
    "windgusts_10m_max",
    "relative_humidity_2m_mean",
    "shortwave_radiation_sum",
    "uv_index_max",
]


@dataclass(frozen=True)
class GeoTarget:
    name: str
    latitude: float
    longitude: float

    @property
    def slug(self) -> str:
        cleaned = self.name.strip().lower().replace(" ", "-")
        return "".join(char for char in cleaned if char.isalnum() or char in ("-", "_"))

    def geohash(self, precision: int = 7) -> str:
        return geohash2.encode(self.latitude, self.longitude, precision)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch Open-Meteo archive data for the demo brand geos (or custom list)."
    )
    parser.add_argument(
        "--output",
        default="storage/seeds/open_meteo",
        help="Directory where parquet files will be written (default: storage/seeds/open_meteo).",
    )
    parser.add_argument(
        "--start",
        type=_parse_date,
        help="Optional start date (YYYY-MM-DD). Defaults to end - days + 1.",
    )
    parser.add_argument(
        "--end",
        type=_parse_date,
        help="Optional end date (YYYY-MM-DD). Defaults to today (UTC).",
    )
    parser.add_argument(
        "--days",
        type=int,
        default=1095,
        help="Number of days of history to fetch when --start is omitted (default: 1095 ≈ 3 years).",
    )
    parser.add_argument(
        "--timezone",
        default="UTC",
        help="Timezone parameter passed to Open-Meteo (default: UTC).",
    )
    parser.add_argument(
        "--skip-defaults",
        action="store_true",
        help="Do not include the default brand scenario geographies.",
    )
    parser.add_argument(
        "--geo",
        action="append",
        nargs=3,
        metavar=("NAME", "LAT", "LON"),
        help="Additional geo target to download (repeatable). Example: --geo 'Austin TX' 30.2672 -97.7431",
    )
    parser.add_argument(
        "--config",
        type=Path,
        help="Optional JSON file with an array of {\"name\": str, \"lat\": float, \"lon\": float}.",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=0.0,
        help="Optional delay between requests to avoid rate limits (e.g., 0.5 or 1.0).",
    )
    parser.add_argument(
        "--max-attempts",
        type=int,
        default=8,
        help="Maximum attempts per request when hitting rate limits (default: 8).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing parquet files instead of skipping.",
    )
    return parser.parse_args()


def _parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def _load_default_targets() -> List[GeoTarget]:
    """Derive targets from the brand scenarios so synthetic seeds, demo flows,
    and Autopilot share the same geographies."""
    from shared.libs.testing.synthetic import DEFAULT_BRAND_SCENARIOS, DEFAULT_GEOS  # type: ignore

    targets: list[GeoTarget] = []
    seen: set[tuple[float, float]] = set()
    for scenario in DEFAULT_BRAND_SCENARIOS:
        coords: Iterable[tuple[float, float]]
        if scenario.geo_overrides:
            coords = scenario.geo_overrides
        else:
            coords = DEFAULT_GEOS

        for index, (lat, lon) in enumerate(coords):
            rounded = (_round_coord(lat), _round_coord(lon))
            if rounded in seen:
                continue
            seen.add(rounded)
            name = f"{scenario.tenant_id}-{index}"
            targets.append(GeoTarget(name=name, latitude=lat, longitude=lon))
    return targets


def _round_coord(value: float, places: int = 4) -> float:
    return round(value, places)


def _load_custom_targets(args: argparse.Namespace) -> List[GeoTarget]:
    targets: list[GeoTarget] = []
    if args.geo:
        for name, lat_str, lon_str in args.geo:
            targets.append(GeoTarget(name=name, latitude=float(lat_str), longitude=float(lon_str)))
    if args.config:
        payload = json.loads(args.config.read_text(encoding="utf-8"))
        for entry in payload:
            targets.append(
                GeoTarget(
                    name=str(entry["name"]),
                    latitude=float(entry["lat"]),
                    longitude=float(entry["lon"]),
                )
            )
    deduped: dict[tuple[float, float], GeoTarget] = {}
    for target in targets:
        key = (_round_coord(target.latitude), _round_coord(target.longitude))
        if key not in deduped:
            deduped[key] = target
    return list(deduped.values())


def _resolve_targets(args: argparse.Namespace) -> List[GeoTarget]:
    targets: list[GeoTarget] = []
    if not args.skip_defaults:
        targets.extend(_load_default_targets())
    targets.extend(_load_custom_targets(args))
    if not targets:
        raise SystemExit("No geographies provided; use defaults or --geo/--config.")
    targets.sort(key=lambda item: item.slug)
    return targets


def _compute_window(args: argparse.Namespace) -> tuple[date, date]:
    end = args.end or datetime.utcnow().date()
    if args.start:
        start = args.start
    else:
        start = end - timedelta(days=args.days - 1)
    if start > end:
        raise SystemExit("Start date must be on or before end date.")
    return start, end


def fetch_daily_series(
    target: GeoTarget,
    start: date,
    end: date,
    timezone: str,
    daily_fields: Sequence[str] = DEFAULT_DAILY_FIELDS,
    *,
    base_backoff: float = 1.0,
    max_attempts: int = 6,
) -> pl.DataFrame:
    params = {
        "latitude": target.latitude,
        "longitude": target.longitude,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "timezone": timezone,
        "daily": ",".join(daily_fields),
    }
    attempt = 0
    while True:
        attempt += 1
        response = requests.get(ARCHIVE_URL, params=params, timeout=45)
        if response.status_code == 429 and attempt < max_attempts:
            sleep_for = base_backoff * attempt
            print(f"   hit 429 rate limit; sleeping {sleep_for:.1f}s before retry")
            time.sleep(sleep_for)
            continue
        response.raise_for_status()
        break
    payload = response.json()
    daily = payload.get("daily")
    if not daily:
        raise RuntimeError(f"No daily payload returned for {target.name}: {payload}")
    rows = len(daily.get("time", []))
    if rows == 0:
        raise RuntimeError(f"No rows returned for {target.name} between {start} and {end}")

    data: dict[str, list] = {}
    for key, values in daily.items():
        if len(values) != rows:
            raise RuntimeError(f"Field {key} length mismatch for {target.name}")
        data[key] = values

    frame = pl.DataFrame(data)
    frame = frame.with_columns(
        pl.lit(target.slug).alias("location_slug"),
        pl.lit(target.name).alias("location_name"),
        pl.lit(float(target.latitude)).alias("latitude"),
        pl.lit(float(target.longitude)).alias("longitude"),
        pl.lit(target.geohash()).alias("geohash"),
    )
    return frame


def write_parquet(frame: pl.DataFrame, output_root: Path, slug: str) -> Path:
    output_root.mkdir(parents=True, exist_ok=True)
    path = output_root / f"{slug}.parquet"
    frame.write_parquet(path, compression="zstd")
    return path


def main() -> None:
    args = _parse_args()
    targets = _resolve_targets(args)
    start, end = _compute_window(args)
    output_root = Path(args.output)

    print(
        textwrap.dedent(
            f"""
            Fetching Open-Meteo archive data
              window: {start.isoformat()} → {end.isoformat()}
              timezone: {args.timezone}
              targets: {len(targets)}
              output directory: {output_root}
            """
        ).strip()
    )

    for target in targets:
        print(f"→ {target.name} ({target.latitude:.4f}, {target.longitude:.4f})")
        slug = target.slug
        output_path = output_root / f"{slug}.parquet"
        if output_path.exists() and not args.force:
            print(f"   skipping {slug}, file exists (use --force to overwrite)")
            continue
        frame = fetch_daily_series(
            target,
            start=start,
            end=end,
            timezone=args.timezone,
            base_backoff=max(args.sleep_seconds, 1.0),
            max_attempts=args.max_attempts,
        )
        path = write_parquet(frame, output_root=output_root, slug=slug)
        print(f"   wrote {frame.height} rows to {path}")
        if args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)


if __name__ == "__main__":
    main()
