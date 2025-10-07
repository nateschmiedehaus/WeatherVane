"""Utilities for assembling modelling design matrices from lake snapshots."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

import polars as pl

from shared.libs.storage.lake import LakeWriter, read_parquet


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
        weather = self._load_latest(f"{tenant_id}_weather_cells")

        orders_daily = self._orders_daily(orders)
        ads_daily = self._ads_daily(ads_meta, ads_google)
        promos_daily = self._promos_daily(promos)

        frame = (
            orders_daily.join(ads_daily, on="date", how="outer")
            .join(promos_daily, on="date", how="outer")
            .sort("date")
            .fill_null(0)
        )
        frame = frame.filter(pl.col("date").is_between(start.date().isoformat(), end.date().isoformat()))

        return FeatureMatrix(
            frame=frame,
            orders_rows=orders.height,
            ads_rows=ads_meta.height + ads_google.height,
            promo_rows=promos.height,
            weather_rows=weather.height,
        )

    def _load_latest(self, dataset: str) -> pl.DataFrame:
        path = self.writer.latest(dataset)
        if not path:
            return pl.DataFrame([])
        return read_parquet(path)

    def _orders_daily(self, orders: pl.DataFrame) -> pl.DataFrame:
        if orders.is_empty():
            return pl.DataFrame({"date": [], "net_revenue": []})
        if "order_date" in orders.columns:
            orders = orders.rename({"order_date": "created_at"})
        return (
            orders
            .with_columns(pl.col("created_at").str.slice(0, 10).alias("date"))
            .group_by("date")
            .agg(pl.col("net_revenue").sum())
        )

    def _ads_daily(self, meta: pl.DataFrame, google: pl.DataFrame) -> pl.DataFrame:
        frames: list[pl.DataFrame] = []
        if not meta.is_empty():
            frames.append(
                meta
                .with_columns(pl.col("date").alias("date"), pl.lit("meta").alias("channel"))
                .group_by("date")
                .agg(pl.col("spend").sum().alias("meta_spend"), pl.col("conversions").sum().alias("meta_conversions"))
            )
        if not google.is_empty():
            frames.append(
                google
                .with_columns(pl.col("date").alias("date"), pl.lit("google").alias("channel"))
                .group_by("date")
                .agg(pl.col("spend").sum().alias("google_spend"), pl.col("conversions").sum().alias("google_conversions"))
            )
        if not frames:
            return pl.DataFrame({"date": [], "meta_spend": [], "meta_conversions": [], "google_spend": [], "google_conversions": []})
        combined = pl.concat(frames, how="vertical_relaxed")
        return combined.group_by("date").agg([
            pl.col("meta_spend").sum(),
            pl.col("meta_conversions").sum(),
            pl.col("google_spend").sum(),
            pl.col("google_conversions").sum(),
        ])

    def _promos_daily(self, promos: pl.DataFrame) -> pl.DataFrame:
        if promos.is_empty():
            return pl.DataFrame({"date": [], "promos_sent": []})
        col = "send_date" if "send_date" in promos.columns else "scheduled_at"
        return (
            promos
            .with_columns(pl.col(col).str.slice(0, 10).alias("date"))
            .group_by("date")
            .agg(pl.count().alias("promos_sent"))
        )
