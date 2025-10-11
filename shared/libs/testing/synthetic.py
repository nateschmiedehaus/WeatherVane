"""Synthetic data helpers for tests and local experimentation."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

import geohash2  # type: ignore
import polars as pl

from shared.libs.storage.lake import LakeWriter


@dataclass
class WeatherShock:
    start_day: int
    end_day: int
    temp_delta: float = 0.0
    rain_mm: float = 0.0

    def applies(self, day_index: int) -> bool:
        return self.start_day <= day_index <= self.end_day


DEFAULT_GEOS = [(37.7749, -122.4194), (40.7128, -74.0060)]


def seed_synthetic_tenant(
    lake_root: Path | str,
    tenant_id: str,
    days: int = 7,
    geos: Iterable[tuple[float, float]] | None = None,
    shocks: Iterable[WeatherShock] | None = None,
) -> None:
    geos = list(geos or DEFAULT_GEOS)
    shocks = list(shocks or [])

    writer = LakeWriter(root=lake_root)
    today = datetime(2024, 1, 7)

    orders_rows = []
    ads_meta_rows = []
    ads_google_rows = []
    promos_rows = []
    weather_rows = []

    for i in range(days):
        day = today - timedelta(days=i)
        date_str = day.strftime("%Y-%m-%d")

        temp_bonus = 0.0
        rain_bonus = 0.0
        multiplier = 1.0
        for shock in shocks:
            if shock.applies(i):
                temp_bonus += shock.temp_delta
                rain_bonus += shock.rain_mm
                multiplier += shock.temp_delta * 0.02

        orders_rows.append({
            "tenant_id": tenant_id,
            "created_at": f"{date_str}T00:00:00Z",
            "net_revenue": float(120 + i * 4 + temp_bonus * 3),
            "ship_latitude": geos[0][0],
            "ship_longitude": geos[0][1],
            "ship_geohash": geohash2.encode(geos[0][0], geos[0][1], 5),
        })

        ads_meta_rows.append({
            "tenant_id": tenant_id,
            "date": date_str,
            "channel": "meta",
            "spend": float((25 + i) * multiplier),
            "conversions": float(2 + i * 0.1),
        })

        ads_google_rows.append({
            "tenant_id": tenant_id,
            "date": date_str,
            "channel": "google",
            "spend": float(18 + i * 0.6),
            "conversions": float(1.2 + i * 0.07 * multiplier),
        })

        promos_rows.append({
            "tenant_id": tenant_id,
            "send_date": f"{date_str}T12:00:00Z",
            "campaign_id": f"promo-{i}",
            "discount_pct": float(10 if i % 3 == 0 else 0),
        })

        for lat, lon in geos:
            gh = geohash2.encode(lat, lon, 5)
            base_temp = 18 + i + lat * 0.05
            base_precip = (i % 2) * 2
            weather_rows.append({
                "tenant_id": tenant_id,
                "date": date_str,
                "geohash": gh,
                "temp_c": float(base_temp + temp_bonus),
                "precip_mm": float(base_precip + rain_bonus),
            })

    weather_df = pl.DataFrame(weather_rows)
    if not weather_df.is_empty():
        weather_df = weather_df.with_columns([
            (pl.col("temp_c") - pl.col("temp_c").mean().over("geohash")).alias("temp_anomaly"),
            (pl.col("precip_mm") - pl.col("precip_mm").mean().over("geohash")).alias("precip_anomaly"),
            pl.col("temp_c")
            .rolling_mean(window_size=7, min_samples=1)
            .over("geohash")
            .alias("temp_roll7"),
            pl.col("precip_mm")
            .rolling_mean(window_size=7, min_samples=1)
            .over("geohash")
            .alias("precip_roll7"),
        ])
        weather_rows = weather_df.to_dicts()

    writer.write_records(f"{tenant_id}_shopify_orders", orders_rows)
    writer.write_records(f"{tenant_id}_meta_ads", ads_meta_rows)
    writer.write_records(f"{tenant_id}_google_ads", ads_google_rows)
    writer.write_records(f"{tenant_id}_promos", promos_rows)
    writer.write_records(f"{tenant_id}_weather_daily", weather_rows)
