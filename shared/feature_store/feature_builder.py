"""Utilities for assembling modelling design matrices from lake snapshots."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import polars as pl
from polars import selectors as cs

from shared.libs.storage.lake import LakeWriter, read_parquet
from shared.validation.schemas import validate_feature_matrix
from shared.data_context.models import DatasetProfile, build_profile_from_polars
from shared.feature_store.feature_generators import LagRollingFeatureGenerator

REQUIRED_WEATHER_COLS = {
    "temp_c",
    "precip_mm",
    "temp_anomaly",
    "precip_anomaly",
    "temp_roll7",
    "precip_roll7",
}

WEATHER_COVERAGE_COLS = {
    "temp_c",
    "precip_mm",
    "temp_anomaly",
    "precip_anomaly",
}

TARGET_COLUMN = "net_revenue"


class FeatureLeakageError(RuntimeError):
    """Raised when the feature matrix contains potential label leakage."""

    def __init__(
        self,
        tenant_id: str,
        start: datetime,
        end: datetime,
        *,
        leakage_rows: int,
        leakage_dates: List[str],
        forward_rows: int,
        forward_dates: List[str],
        forecast_rows: int,
        forecast_dates: List[str],
        matrix: "FeatureMatrix | None" = None,
    ) -> None:
        self.tenant_id = tenant_id
        self.start = start
        self.end = end
        self.leakage_rows = leakage_rows
        self.leakage_dates = leakage_dates
        self.forward_rows = forward_rows
        self.forward_dates = forward_dates
        self.forecast_rows = forecast_rows
        self.forecast_dates = forecast_dates
        self.matrix = matrix
        summary = (
            f"Potential leakage detected for tenant={tenant_id} "
            f"window=[{start.date().isoformat()}, {end.date().isoformat()}]: "
            f"total_rows={leakage_rows}, forward_rows={forward_rows}, forecast_rows={forecast_rows}, "
            f"dates={leakage_dates}"
        )
        super().__init__(summary)

    def as_dict(self) -> Dict[str, List[str] | int | str]:
        return {
            "tenant_id": self.tenant_id,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "leakage_rows": self.leakage_rows,
            "leakage_dates": list(self.leakage_dates),
            "forward_leakage_rows": self.forward_rows,
            "forward_leakage_dates": list(self.forward_dates),
            "forecast_leakage_rows": self.forecast_rows,
            "forecast_leakage_dates": list(self.forecast_dates),
            "sanitized_rows": self.matrix.frame.height if self.matrix else None,
        }


@dataclass
class FeatureMatrix:
    frame: pl.DataFrame
    observed_frame: pl.DataFrame
    orders_rows: int
    ads_rows: int
    promo_rows: int
    weather_rows: int
    observed_rows: int
    latest_observed_date: str | None
    profiles: Dict[str, DatasetProfile]
    leakage_risk_rows: int
    leakage_risk_dates: List[str]
    forward_leakage_rows: int
    forward_leakage_dates: List[str]
    forecast_leakage_rows: int
    forecast_leakage_dates: List[str]
    join_mode: str
    geocoded_order_ratio: Optional[float]
    weather_missing_rows: int
    weather_missing_records: List[Dict[str, Optional[str]]]


class FeatureBuilder:
    def __init__(
        self,
        lake_root: Path | str = Path("storage/lake/raw"),
        feature_seed: int = 2024,
        feature_min_rows: int = 14,
    ) -> None:
        self.writer = LakeWriter(root=lake_root)
        self.feature_min_rows = max(feature_min_rows, 1)
        self.feature_generator = LagRollingFeatureGenerator(
            LagRollingFeatureGenerator.default_specs(),
            date_col="date",
            group_cols=["geohash"],
            seed=feature_seed,
        )

    def build(self, tenant_id: str, start: datetime, end: datetime) -> FeatureMatrix:
        orders = self._load_latest(f"{tenant_id}_shopify_orders")
        ads_meta = self._load_latest(f"{tenant_id}_meta_ads")
        ads_google = self._load_latest(f"{tenant_id}_google_ads")
        promos = self._load_latest(f"{tenant_id}_promos")
        weather = self._load_latest(f"{tenant_id}_weather_daily")

        geocoded_order_ratio: Optional[float] = None
        if not orders.is_empty() and "ship_geohash" in orders.columns:
            total_orders = float(orders.height)
            if total_orders > 0:
                geocoded = orders.filter(pl.col("ship_geohash").is_not_null()).height
                geocoded_order_ratio = geocoded / total_orders

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

        join_mode = "date_geohash" if join_on_geo else "date_only"

        if not join_on_geo and not weather_daily.is_empty():
            weather_daily = self._aggregate_weather_by_date(weather_daily)

        if not orders_daily.is_empty():
            if join_on_geo:
                frame = orders_daily.join(weather_daily, on=["date", "geohash"], how="left")
            else:
                frame = orders_daily.join(weather_daily, on=["date"], how="left")
        else:
            frame = weather_daily

        if not join_on_geo:
            if "geohash_right" in frame.columns:
                frame = frame.with_columns(
                    pl.when(
                        pl.col("geohash").is_null()
                        | (pl.col("geohash").cast(pl.Utf8).str.len_bytes() == 0)
                    )
                    .then(pl.col("geohash_right"))
                    .otherwise(pl.col("geohash"))
                    .alias("geohash")
                ).drop("geohash_right")
            elif "geohash" in frame.columns:
                frame = frame.with_columns(
                    pl.when(
                        pl.col("geohash").is_null()
                        | (pl.col("geohash").cast(pl.Utf8).str.len_bytes() == 0)
                    )
                    .then(pl.lit("GLOBAL"))
                    .otherwise(pl.col("geohash"))
                    .alias("geohash")
                )
            else:
                frame = frame.with_columns(pl.lit("GLOBAL").alias("geohash"))

        if TARGET_COLUMN not in frame.columns:
            frame = frame.with_columns(pl.lit(None, dtype=pl.Float64).alias(TARGET_COLUMN))

        frame = frame.with_columns(pl.col("date").cast(pl.Utf8))

        ads_join = ads_daily.drop([col for col in ["geohash"] if col in ads_daily.columns])
        promos_join = promos_daily.drop([col for col in ["geohash"] if col in promos_daily.columns])

        frame = frame.join(ads_join, on="date", how="full", suffix="_ads")
        if "date_ads" in frame.columns:
            frame = (
                frame.with_columns(
                    pl.when(pl.col("date").is_null())
                    .then(pl.col("date_ads"))
                    .otherwise(pl.col("date"))
                    .alias("date")
                )
                .drop("date_ads")
            )
        frame = frame.join(promos_join, on="date", how="full", suffix="_promo")
        if "date_promo" in frame.columns:
            frame = (
                frame.with_columns(
                    pl.when(pl.col("date").is_null())
                    .then(pl.col("date_promo"))
                    .otherwise(pl.col("date"))
                    .alias("date")
                )
                .drop("date_promo")
            )
        if join_mode == "date_only":
            if "geohash" in frame.columns:
                frame = frame.with_columns(
                    pl.when(
                        pl.col("geohash").is_null()
                        | (pl.col("geohash").cast(pl.Utf8).str.len_bytes() == 0)
                    )
                    .then(pl.lit("GLOBAL"))
                    .otherwise(pl.col("geohash"))
                    .alias("geohash")
                )
            else:
                frame = frame.with_columns(pl.lit("GLOBAL").alias("geohash"))
        frame = frame.sort("date")
        start_str = start.date().isoformat()
        end_str = end.date().isoformat()
        frame = frame.filter(pl.col("date").is_between(pl.lit(start_str), pl.lit(end_str)))

        frame = frame.with_columns(
            pl.col(TARGET_COLUMN).is_not_null().alias("target_available"),
        )

        missing = [col for col in REQUIRED_WEATHER_COLS if col not in frame.columns]
        if missing:
            raise ValueError(f"Weather features missing from matrix: {missing}")

        weather_missing_records: List[Dict[str, Optional[str]]] = []
        weather_missing_rows = 0
        if frame.height > 0:
            coverage_checks = [pl.col(col).is_null() for col in WEATHER_COVERAGE_COLS if col in frame.columns]
            missing_weather_expr = pl.any_horizontal(coverage_checks) if coverage_checks else pl.lit(False)
            weather_missing_frame = frame.filter(missing_weather_expr)
            weather_missing_rows = int(weather_missing_frame.height)
            if weather_missing_rows > 0:
                capture_cols = ["date"]
                if "geohash" in weather_missing_frame.columns:
                    capture_cols.append("geohash")
                weather_missing_records = (
                    weather_missing_frame.select([pl.col(column) for column in capture_cols])
                    .unique(maintain_order=True)
                    .to_dicts()
                )

        if frame.width > 0:
            frame = frame.with_columns(cs.numeric().fill_null(0))

        forward_looking_columns = [
            column
            for column in frame.columns
            if column.endswith("_spend")
            or column.endswith("_conversions")
            or column == "promos_sent"
        ]
        forward_signal_expr = (
            pl.lit(False)
            if not forward_looking_columns
            else pl.any_horizontal(
                [
                    pl.col(column).cast(pl.Float64).fill_null(0.0).abs() > 0.0
                    for column in forward_looking_columns
                ]
            )
        )
        forward_leakage_expr = (~pl.col("target_available")) & forward_signal_expr
        forecast_leakage_expr = (
            pl.col("observation_type")
            .cast(pl.Utf8)
            .str.to_lowercase()
            .eq("forecast")
            & pl.col("target_available")
            if "observation_type" in frame.columns
            else pl.lit(False)
        )
        frame = frame.with_columns(
            [
                forward_leakage_expr.alias("_forward_leakage"),
                forecast_leakage_expr.alias("_forecast_leakage"),
            ]
        )
        frame = frame.with_columns(
            (pl.col("_forward_leakage") | pl.col("_forecast_leakage")).alias("leakage_risk")
        )

        forward_leakage_frame = frame.filter(pl.col("_forward_leakage"))
        forward_leakage_rows = int(forward_leakage_frame.height)
        forward_leakage_dates = (
            forward_leakage_frame.select(pl.col("date"))
            .unique(maintain_order=True)["date"]
            .to_list()
            if forward_leakage_rows > 0
            else []
        )

        forecast_leakage_frame = frame.filter(pl.col("_forecast_leakage"))
        forecast_leakage_rows = int(forecast_leakage_frame.height)
        forecast_leakage_dates = (
            forecast_leakage_frame.select(pl.col("date"))
            .unique(maintain_order=True)["date"]
            .to_list()
            if forecast_leakage_rows > 0
            else []
        )

        frame = frame.drop(["_forward_leakage", "_forecast_leakage"])

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

        leakage_rows = frame.filter(pl.col("leakage_risk"))
        leakage_risk_rows = int(leakage_rows.height)
        leakage_risk_dates = (
            leakage_rows.select(pl.col("date"))
            .unique(maintain_order=True)["date"]
            .to_list()
            if leakage_risk_rows > 0
            else []
        )

        frame = frame.filter(~pl.col("leakage_risk")) if leakage_risk_rows > 0 else frame
        if frame.height >= self.feature_min_rows:
            frame = self.feature_generator.transform(frame)
        observed_frame = frame.filter(pl.col("target_available"))
        observed_rows = int(observed_frame.height)
        max_observed_date = observed_frame["date"].max() if observed_rows > 0 else None
        latest_observed_date = str(max_observed_date) if isinstance(max_observed_date, str) else max_observed_date
        matrix = FeatureMatrix(
            frame=frame,
            observed_frame=observed_frame,
            orders_rows=int(orders.height),
            ads_rows=int(ads_meta.height + ads_google.height),
            promo_rows=int(promos.height),
            weather_rows=int(weather.height),
            observed_rows=observed_rows,
            latest_observed_date=latest_observed_date,
            profiles=profiles,
            leakage_risk_rows=leakage_risk_rows,
            leakage_risk_dates=[str(date) for date in leakage_risk_dates],
            forward_leakage_rows=forward_leakage_rows,
            forward_leakage_dates=[str(date) for date in forward_leakage_dates],
            forecast_leakage_rows=forecast_leakage_rows,
            forecast_leakage_dates=[str(date) for date in forecast_leakage_dates],
            join_mode=join_mode,
            geocoded_order_ratio=geocoded_order_ratio,
            weather_missing_rows=weather_missing_rows,
            weather_missing_records=[
                {"date": record.get("date"), "geohash": record.get("geohash")}
                for record in weather_missing_records
            ],
        )
        if leakage_risk_rows > 0:
            raise FeatureLeakageError(
                tenant_id,
                start,
                end,
            leakage_rows=leakage_risk_rows,
                leakage_dates=[str(date) for date in leakage_risk_dates],
                forward_rows=forward_leakage_rows,
                forward_dates=matrix.forward_leakage_dates,
                forecast_rows=forecast_leakage_rows,
                forecast_dates=matrix.forecast_leakage_dates,
                matrix=matrix,
            )
        return matrix

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
        has_geohash = "ship_geohash" in orders.columns
        frame = orders.with_columns(
            [
                pl.col("created_at").str.slice(0, 10).alias("date"),
                (pl.col("ship_geohash") if has_geohash else pl.lit(None)).alias("geohash"),
            ]
        )
        group_cols = ["date", "geohash"] if has_geohash else ["date"]
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

    def _aggregate_weather_by_date(self, weather: pl.DataFrame) -> pl.DataFrame:
        if weather.is_empty():
            return weather

        numeric_columns = [
            column
            for column in weather.select(cs.numeric()).columns
            if column not in {"date", "day_of_year"}
        ]
        aggregations = [pl.col(column).mean().alias(column) for column in numeric_columns]

        if "day_of_year" in weather.columns:
            aggregations.append(pl.col("day_of_year").first().alias("day_of_year"))

        for column in ("local_date", "local_datetime", "utc_datetime", "timezone"):
            if column in weather.columns:
                aggregations.append(pl.col(column).first().alias(column))

        if "as_of_utc" in weather.columns:
            aggregations.append(pl.col("as_of_utc").max().alias("as_of_utc"))

        if "observation_type" in weather.columns:
            obs_lower = pl.col("observation_type").cast(pl.Utf8).str.to_lowercase()
            aggregations.extend(
                [
                    obs_lower.first().alias("_obs_first"),
                    obs_lower.n_unique().alias("_obs_unique"),
                    obs_lower.eq("forecast").any().alias("_obs_has_forecast"),
                    obs_lower.eq("observed").any().alias("_obs_has_observed"),
                ]
            )

        aggregated = weather.group_by("date").agg(aggregations)

        if "observation_type" in weather.columns:
            aggregated = aggregated.with_columns(
                pl.when(pl.col("_obs_has_forecast") & pl.col("_obs_has_observed"))
                .then(pl.lit("mixed"))
                .when(pl.col("_obs_has_forecast"))
                .then(pl.lit("forecast"))
                .when(pl.col("_obs_unique") == 0)
                .then(pl.lit(None, dtype=pl.Utf8))
                .otherwise(pl.col("_obs_first"))
                .alias("observation_type")
            ).drop(
                ["_obs_first", "_obs_unique", "_obs_has_forecast", "_obs_has_observed"],
                strict=False,
            )

        aggregated = aggregated.with_columns(pl.lit("GLOBAL").alias("geohash"))
        ordered_columns = ["date", "geohash"] + [
            column for column in aggregated.columns if column not in {"date", "geohash"}
        ]
        return aggregated.select(ordered_columns)
