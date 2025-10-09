"""Utilities for assembling modelling design matrices from lake snapshots."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict

import polars as pl

from shared.libs.storage.lake import LakeWriter, read_parquet
from shared.validation.schemas import validate_feature_matrix
from shared.data_context.models import DatasetProfile, build_profile_from_polars

REQUIRED_WEATHER_COLS = {
    "temp_c",
    "precip_mm",
    "temp_anomaly",
    "precip_anomaly",
    "temp_roll7",
    "precip_roll7",
}


@dataclass
class FeatureMatrix:
    frame: pl.DataFrame
    orders_rows: int
    ads_rows: int
    promo_rows: int
    weather_rows: int
    profiles: Dict[str, DatasetProfile]


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

        join_on_geo = (
            "geohash" in orders_daily.columns
            and "geohash" in weather_daily.columns
            and not orders_daily.get_column("geohash").is_null().all()
            and not weather_daily.get_column("geohash").is_null().all()
        )

        if not orders_daily.is_empty():
            if join_on_geo:
                frame = orders_daily.join(weather_daily, on=["date", "geohash"], how="left")
            else:
                frame = orders_daily.join(weather_daily, on=["date"], how="left")
        else:
            frame = weather_daily

        frame = frame.with_columns(pl.col("date").cast(pl.Utf8))

        ads_join = ads_daily.drop([col for col in ["geohash"] if col in ads_daily.columns])
        promos_join = promos_daily.drop([col for col in ["geohash"] if col in promos_daily.columns])

        frame = frame.join(ads_join, on="date", how="full", suffix="_ads")
        if "date_ads" in frame.columns:
            frame = frame.drop("date_ads")
        frame = frame.join(promos_join, on="date", how="full", suffix="_promo")
        if "date_promo" in frame.columns:
            frame = frame.drop("date_promo")
        frame = frame.sort("date").fill_null(0)
        start_str = start.date().isoformat()
        end_str = end.date().isoformat()
        frame = frame.filter(pl.col("date").is_between(pl.lit(start_str), pl.lit(end_str)))

        missing = [col for col in REQUIRED_WEATHER_COLS if col not in frame.columns]
        if missing:
            raise ValueError(f"Weather features missing from matrix: {missing}")

        validate_feature_matrix(frame)
        profiles: Dict[str, DatasetProfile] = {}
        try:
            profiles["orders"] = build_profile_from_polars("orders", orders)
            ads_combined = pl.concat([df for df in (ads_meta, ads_google) if not df.is_empty()], how="vertical") if (not ads_meta.is_empty() or not ads_google.is_empty()) else pl.DataFrame([])
            profiles["ads"] = build_profile_from_polars("ads", ads_combined)
            profiles["promos"] = build_profile_from_polars("promos", promos)
            profiles["weather"] = build_profile_from_polars("weather", weather)
        except Exception:  # pragma: no cover - profiling is best-effort
            profiles = {}

        return FeatureMatrix(
            frame=frame,
            orders_rows=int(orders.height),
            ads_rows=int(ads_meta.height + ads_google.height),
            promo_rows=int(promos.height),
            weather_rows=int(weather.height),
            profiles=profiles,
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
                .with_columns(pl.lit("GLOBAL").alias("geohash"))
            )
        if not google.is_empty():
            frames.append(
                google.with_columns(pl.col("date").alias("date"))
                .group_by("date")
                .agg([
                    pl.col("spend").sum().alias("google_spend"),
                    pl.col("conversions").sum().alias("google_conversions"),
                ])
                .with_columns(pl.lit("GLOBAL").alias("geohash"))
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
            .with_columns(pl.lit("GLOBAL").alias("geohash"))
        )

    def _promos_daily(self, promos: pl.DataFrame) -> pl.DataFrame:
        if promos.is_empty():
            return pl.DataFrame({"date": [], "geohash": [], "promos_sent": []})
        col = "send_date" if "send_date" in promos.columns else "scheduled_at"
        return (
            promos
            .with_columns(pl.col(col).str.slice(0, 10).alias("date"))
            .group_by("date")
            .agg(pl.len().alias("promos_sent"))
            .with_columns(pl.lit("GLOBAL").alias("geohash"))
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
                "temp_roll7": [],
                "precip_roll7": [],
            })
        missing = REQUIRED_WEATHER_COLS - set(weather.columns)
        if missing:
            raise ValueError(f"Weather dataset missing columns: {missing}")
        frame = weather.with_columns(
            pl.col("date").str.strptime(pl.Date, strict=False).alias("date"),
        )
        frame = frame.sort(["geohash", "date"])
        frame = frame.with_columns(
            pl.col("temp_c")
            .rolling_mean(window_size=7, min_samples=3)
            .over("geohash")
            .alias("temp_roll7"),
            pl.col("precip_mm")
            .rolling_mean(window_size=7, min_samples=3)
            .over("geohash")
            .alias("precip_roll7"),
        )
        frame = frame.with_columns(pl.col("date").cast(pl.Utf8))
        return frame
