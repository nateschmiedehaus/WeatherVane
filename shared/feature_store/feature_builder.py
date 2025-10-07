"""Utilities for assembling modelling design matrices from lake snapshots."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import polars as pl

from shared.libs.storage.lake import LakeWriter, read_parquet

REQUIRED_WEATHER_COLS = {"temp_c", "precip_mm", "temp_anomaly", "precip_anomaly"}


@dataclass
class FeatureMatrix:
    frame: pl.DataFrame
    orders_rows: int
    ads_rows: int
    promo_rows: int
    weather_rows: int


class FeatureBuilder:
    def __init__(self, lake_root: Path | str = Path("storage/lake/raw")) -> None:
        self.writer = LakeWriter(root=lake_root)

    def build(self, tenant_id: str, start: datetime, end: datetime) -> FeatureMatrix:
        orders = self._load_latest(f"{tenant_id}_shopify_orders")
        ads_meta = self._load_latest(f"{tenant_id}_meta_ads")
        ads_google = self._load_latest(f"{tenant_id}_google_ads")
        promos = self._load_latest(f"{tenant_id}_promos")
        weather = self._load_latest(f"{tenant_id}_weather_daily")

        orders_daily = self._orders_daily(orders)
        ads_daily = self._ads_daily(ads_meta, ads_google)
        promos_daily = self._promos_daily(promos)
        weather_daily = self._weather_daily(weather)

        join_keys = ["date", "geohash"] if "geohash" in orders_daily.columns and "geohash" in weather_daily.columns else ["date"]

        frame = (
            orders_daily.join(ads_daily, on=join_keys, how="outer")
            .join(promos_daily, on=join_keys, how="outer")
            .join(weather_daily, on=join_keys, how="left")
            .sort("date")
            .fill_null(0)
        )
        frame = frame.filter(pl.col("date").is_between(start.date().isoformat(), end.date().isoformat()))

        missing = [col for col in REQUIRED_WEATHER_COLS if col not in frame.columns]
        if missing:
            raise ValueError(f"Weather features missing from matrix: {missing}")

        return FeatureMatrix(
            frame=frame,
            orders_rows=int(orders.height),
            ads_rows=int(ads_meta.height + ads_google.height),
            promo_rows=int(promos.height),
            weather_rows=int(weather.height),
        )

    def _load_latest(self, dataset: str) -> pl.DataFrame:
        path = self.writer.latest(dataset)
        if not path:
            return pl.DataFrame([])
        return read_parquet(path)

    def _orders_daily(self, orders: pl.DataFrame) -> pl.DataFrame:
        if orders.is_empty():
            return pl.DataFrame({"date": [], "geohash": [], "net_revenue": []})
        if "created_at" not in orders.columns:
            raise ValueError("orders dataset missing `created_at`")
        frame = orders.with_columns([
            pl.col("created_at").str.slice(0, 10).alias("date"),
            pl.col("ship_geohash").alias("geohash"),
        ])
        group_cols = ["date", "geohash"] if "ship_geohash" in orders.columns else ["date"]
        return frame.group_by(group_cols).agg(pl.col("net_revenue").sum())

    def _ads_daily(self, meta: pl.DataFrame, google: pl.DataFrame) -> pl.DataFrame:
        frames = []
        if not meta.is_empty():
            frames.append(
                meta.with_columns(pl.col("date").alias("date"))
                .group_by("date")
                .agg([
                    pl.col("spend").sum().alias("meta_spend"),
                    pl.col("conversions").sum().alias("meta_conversions"),
                ])
            )
        if not google.is_empty():
            frames.append(
                google.with_columns(pl.col("date").alias("date"))
                .group_by("date")
                .agg([
                    pl.col("spend").sum().alias("google_spend"),
                    pl.col("conversions").sum().alias("google_conversions"),
                ])
            )
        if not frames:
            return pl.DataFrame({
                "date": [],
                "geohash": [],
                "meta_spend": [],
                "meta_conversions": [],
                "google_spend": [],
                "google_conversions": [],
            })
        return (
            pl.concat(frames, how="align")
            .group_by("date")
            .agg([
                pl.col("meta_spend").sum(),
                pl.col("meta_conversions").sum(),
                pl.col("google_spend").sum(),
                pl.col("google_conversions").sum(),
            ])
            .with_columns(pl.lit(None).alias("geohash"))
        )

    def _promos_daily(self, promos: pl.DataFrame) -> pl.DataFrame:
        if promos.is_empty():
            return pl.DataFrame({"date": [], "geohash": [], "promos_sent": []})
        col = "send_date" if "send_date" in promos.columns else "scheduled_at"
        return (
            promos
            .with_columns(pl.col(col).str.slice(0, 10).alias("date"))
            .group_by("date")
            .agg(pl.count().alias("promos_sent"))
            .with_columns(pl.lit(None).alias("geohash"))
        )

    def _weather_daily(self, weather: pl.DataFrame) -> pl.DataFrame:
        if weather.is_empty():
            return pl.DataFrame({
                "date": [],
                "geohash": [],
                "temp_c": [],
                "precip_mm": [],
                "temp_anomaly": [],
                "precip_anomaly": [],
            })
        missing = REQUIRED_WEATHER_COLS - set(weather.columns)
        if missing:
            raise ValueError(f"Weather dataset missing columns: {missing}")
        return weather
