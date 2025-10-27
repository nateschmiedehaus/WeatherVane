"""Feature store utilities for assembling modelling design matrices."""

from __future__ import annotations

import glob
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Dict, List, Mapping, Optional, Sequence, Tuple

import polars as pl

from shared.data_context.models import DatasetProfile, build_profile_from_polars
from shared.libs.storage.lake import read_parquet

TARGET_COLUMN = "net_revenue"

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

DMA_MIN_GEOCODED_RATIO = 0.55
DMA_MIN_WEATHER_COVERAGE = 0.85
STATE_MIN_GEOCODED_RATIO = 0.25
STATE_MIN_WEATHER_COVERAGE = 0.70


class FeatureLeakageError(Exception):
    """Raised when feature leakage is detected in the training data."""

    def __init__(
        self,
        *,
        tenant_id: str,
        forward_rows: int,
        forecast_rows: int,
        leakage_dates: Sequence[str],
        forward_dates: Sequence[str],
        forecast_dates: Sequence[str],
        matrix: "FeatureMatrix",
    ) -> None:  # pragma: no cover - signature only, body defined after FeatureMatrix
        self.tenant_id = tenant_id
        self.forward_rows = forward_rows
        self.forecast_rows = forecast_rows
        self.leakage_rows = forward_rows + forecast_rows
        self.leakage_dates = list(leakage_dates)
        self.forward_dates = list(forward_dates)
        self.forecast_dates = list(forecast_dates)
        self.matrix = matrix
        super().__init__(
            f"Feature leakage detected for tenant {tenant_id}: "
            f"{self.leakage_rows} rows ({forward_rows} forward, {forecast_rows} forecast)."
        )


@dataclass
class FeatureMatrix:
    """Collection of feature engineering outputs."""

    frame: pl.DataFrame
    observed_frame: pl.DataFrame
    orders_rows: int
    ads_rows: int
    promo_rows: int
    weather_rows: int
    observed_rows: int
    weather_missing_rows: int
    weather_missing_records: List[Dict[str, str]]
    leakage_risk_rows: int
    leakage_risk_dates: List[str]
    forward_leakage_rows: int
    forward_leakage_dates: List[str]
    forecast_leakage_rows: int
    forecast_leakage_dates: List[str]
    weather_coverage_ratio: float
    weather_coverage_threshold: float
    geocoded_order_ratio: Optional[float]
    join_mode: str
    geography_level: str
    geography_fallback_reason: Optional[str]
    unique_geohash_count: int
    latest_observed_date: Optional[str]
    weather_guardrail_triggered: bool
    profiles: Dict[str, DatasetProfile] = field(default_factory=dict)


class FeatureBuilder:
    """Build feature matrices from raw data."""

    def __init__(self, lake_root: Path | str = Path("storage/lake/raw"), feature_min_rows: int = 14) -> None:
        self.lake_root = Path(lake_root)
        self.feature_min_rows = max(feature_min_rows, 1)
        self._dataset_cache: Dict[str, Tuple[float, pl.DataFrame]] = {}

    # Public -----------------------------------------------------------------

    def list_tenants(self) -> List[str]:
        tenant_dirs = glob.glob(str(self.lake_root / "*"))
        return [Path(entry).name.split("_")[0] for entry in tenant_dirs if Path(entry).is_dir()]

    def build(self, tenant_id: str, start: datetime, end: datetime) -> FeatureMatrix:
        start_date = start.date()
        end_date = end.date()
        if start_date > end_date:
            raise ValueError("start must be before end")

        orders = self._load_latest(tenant_id, "shopify_orders", drop_null_revenue=True)
        ads_meta = self._load_latest(tenant_id, "meta_ads")
        ads_google = self._load_latest(tenant_id, "google_ads")
        promos = self._load_latest(tenant_id, "promos")
        weather = self._load_latest(tenant_id, "weather_daily")

        orders_rows = int(orders.height)
        ads_rows = int(ads_meta.height + ads_google.height)
        promo_rows = int(promos.height)
        weather_rows = int(weather.height)

        start_str = start_date.isoformat()
        end_str = end_date.isoformat()

        orders_daily = self._clip_window(self._orders_daily(orders), start_str, end_str)
        geocoded_ratio = self._geocoded_ratio(orders_daily)
        unique_geohash_count = (
            int(orders_daily.get_column("geohash").n_unique()) if "geohash" in orders_daily.columns else 0
        )

        meta_daily = self._clip_window(self._ads_daily(ads_meta, prefix="meta"), start_str, end_str)
        google_daily = self._clip_window(self._ads_daily(ads_google, prefix="google"), start_str, end_str)
        promos_daily = self._clip_window(self._promos_daily(promos), start_str, end_str)
        weather_daily = self._clip_window(self._weather_daily(weather), start_str, end_str)
        weather_dates = weather_daily.get_column("date").to_list() if not weather_daily.is_empty() else []
        min_weather_date = min(weather_dates) if weather_dates else None
        weather_coverage_ratio = self._weather_coverage_ratio(weather_daily)
        dma_weather_coverage = self._dma_weather_coverage(weather_daily, start_date, end_date)

        join_mode, geography_level, fallback_reason, coverage_threshold = self._resolve_join_mode(
            geocoded_ratio,
            weather_coverage_ratio,
            orders_rows,
            dma_weather_coverage,
            orders_daily.get_column("geohash").drop_nulls().unique().to_list() if "geohash" in orders_daily.columns else [],
        )

        keys = self._build_key_frame(start_date, end_date, orders_daily, weather_daily, join_mode)
        order_agg = self._aggregate_orders(orders_daily, join_mode)
        weather_agg = self._aggregate_weather(weather_daily, join_mode)

        frame = (
            keys.join(order_agg, on=["date", "geo_scope"], how="left")
            .join(meta_daily, on="date", how="left")
            .join(google_daily, on="date", how="left")
            .join(promos_daily, on="date", how="left")
            .join(weather_agg, on=["date", "geo_scope"], how="left")
        )

        frame = self._finalize_columns(frame, geography_level)

        observed_dates = frame.filter(pl.col("target_available")).get_column("date").to_list()
        min_observed_date = min(observed_dates) if observed_dates else None
        max_observed_date = max(observed_dates) if observed_dates else None
        candidate_starts = [d for d in [min_observed_date, min_weather_date] if d is not None]
        clip_start = max(candidate_starts) if candidate_starts else None
        if clip_start:
            frame = frame.filter(pl.col("target_available") | (pl.col("date") >= clip_start))

        weather_columns_present = [col for col in REQUIRED_WEATHER_COLS if col in frame.columns]
        if weather_columns_present:
            weather_available_expr = ~pl.any_horizontal([pl.col(col).is_null() for col in weather_columns_present])
        else:
            weather_available_expr = pl.lit(False)
        frame = frame.with_columns(weather_available_expr.alias("_has_weather"))
        frame = frame.filter(pl.col("target_available") | pl.col("_has_weather"))

        weather_missing_rows, weather_missing_records = self._record_weather_gaps(frame)
        frame = self._with_lag_features(frame)

        leakage, flagged_frame = self._detect_leakage(frame, max_observed_date)
        safe_frame = flagged_frame.filter(~pl.col("_leakage_flag")).drop("_leakage_flag")
        safe_frame = safe_frame.drop("_has_weather")
        observed_frame = safe_frame.filter(pl.col("target_available"))
        observed_rows = int(observed_frame.height)
        latest_observed_date = max_observed_date if observed_rows else None

        profiles = self._profiles_map(
            orders,
            ads_meta,
            ads_google,
            promos,
            weather,
        )

        matrix = FeatureMatrix(
            frame=safe_frame,
            observed_frame=observed_frame,
            orders_rows=orders_rows,
            ads_rows=ads_rows,
            promo_rows=promo_rows,
            weather_rows=weather_rows,
            observed_rows=observed_rows,
            weather_missing_rows=weather_missing_rows,
            weather_missing_records=weather_missing_records,
            leakage_risk_rows=leakage.total_rows,
            leakage_risk_dates=leakage.all_dates,
            forward_leakage_rows=leakage.forward_rows,
            forward_leakage_dates=leakage.forward_dates,
            forecast_leakage_rows=leakage.forecast_rows,
            forecast_leakage_dates=leakage.forecast_dates,
            weather_coverage_ratio=weather_coverage_ratio,
            weather_coverage_threshold=coverage_threshold,
            geocoded_order_ratio=geocoded_ratio,
            join_mode=join_mode,
            geography_level=geography_level,
            geography_fallback_reason=fallback_reason,
            unique_geohash_count=unique_geohash_count,
            latest_observed_date=latest_observed_date,
            weather_guardrail_triggered=weather_missing_rows > 0,
            profiles=profiles,
        )

        if leakage.total_rows > 0:
            raise FeatureLeakageError(
                tenant_id=tenant_id,
                forward_rows=leakage.forward_rows,
                forecast_rows=leakage.forecast_rows,
                leakage_dates=leakage.all_dates,
                forward_dates=leakage.forward_dates,
                forecast_dates=leakage.forecast_dates,
                matrix=matrix,
            )

        return matrix

    # Internal helpers -------------------------------------------------------

    def _load_latest(self, tenant_id: str, dataset: str, *, drop_null_revenue: bool = False) -> pl.DataFrame:
        dataset_dir = self.lake_root / f"{tenant_id}_{dataset}"
        latest_file: Optional[Path] = None
        newest_mtime = float("-inf")
        if dataset_dir.exists():
            for candidate in dataset_dir.glob("*.parquet"):
                try:
                    mtime = candidate.stat().st_mtime
                except FileNotFoundError:
                    continue
                if mtime > newest_mtime:
                    newest_mtime = mtime
                    latest_file = candidate

        if latest_file is None:
            legacy_dir = self.lake_root / tenant_id / f"{tenant_id}_{dataset}" / "features"
            if legacy_dir.exists():
                candidate = legacy_dir / f"{tenant_id}_{dataset}_latest.parquet"
                if candidate.exists():
                    latest_file = candidate
                    newest_mtime = candidate.stat().st_mtime

        if latest_file is None:
            fixture_dir = self.lake_root / tenant_id / dataset / "features"
            if fixture_dir.exists():
                candidate = fixture_dir / f"{tenant_id}_{dataset}_latest.parquet"
                if candidate.exists():
                    latest_file = candidate
                    newest_mtime = candidate.stat().st_mtime

        if latest_file is None:
            return pl.DataFrame([])

        cached = self._dataset_cache.get(str(latest_file))
        if cached and cached[0] == newest_mtime:
            frame = cached[1].clone()
        else:
            frame = read_parquet(latest_file)
            self._dataset_cache[str(latest_file)] = (newest_mtime, frame.clone())

        if drop_null_revenue and TARGET_COLUMN in frame.columns:
            frame = frame.filter(pl.col(TARGET_COLUMN).is_not_null())
        return frame

    def _clip_window(self, frame: pl.DataFrame, start: str, end: str, column: str = "date") -> pl.DataFrame:
        if frame.is_empty() or column not in frame.columns:
            return frame
        return frame.filter((pl.col(column) >= start) & (pl.col(column) <= end))

    def _orders_daily(self, orders: pl.DataFrame) -> pl.DataFrame:
        if orders.is_empty():
            return pl.DataFrame(
                {
                    "date": pl.Series([], dtype=pl.Utf8),
                    "geohash": pl.Series([], dtype=pl.Utf8),
                    TARGET_COLUMN: pl.Series([], dtype=pl.Float64),
                }
            )
        geohash_expr = (
            pl.col("ship_geohash").cast(pl.Utf8) if "ship_geohash" in orders.columns else pl.lit(None)
        ).alias("geohash")
        return orders.with_columns(
            pl.col("created_at").str.slice(0, 10).alias("date"),
            geohash_expr,
        )

    def _ads_daily(self, ads: pl.DataFrame, *, prefix: str) -> pl.DataFrame:
        if ads.is_empty():
            return pl.DataFrame(
                {
                    "date": pl.Series([], dtype=pl.Utf8),
                    f"{prefix}_spend": pl.Series([], dtype=pl.Float64),
                    f"{prefix}_conversions": pl.Series([], dtype=pl.Float64),
                }
            )
        return ads.group_by("date").agg(
            [
                pl.col("spend").sum().alias(f"{prefix}_spend"),
                pl.col("conversions").sum().alias(f"{prefix}_conversions"),
            ]
        )

    def _promos_daily(self, promos: pl.DataFrame) -> pl.DataFrame:
        if promos.is_empty():
            return pl.DataFrame({
                "date": pl.Series([], dtype=pl.Utf8),
                "promos_sent": pl.Series([], dtype=pl.Float64),
            })
        date_col = "send_date" if "send_date" in promos.columns else "scheduled_at"
        return (
            promos.with_columns(pl.col(date_col).str.slice(0, 10).alias("date"))
            .group_by("date")
            .agg(pl.len().alias("promos_sent"))
        )

    def _weather_daily(self, weather: pl.DataFrame) -> pl.DataFrame:
        if weather.is_empty():
            data: Dict[str, pl.Series] = {
                "date": pl.Series([], dtype=pl.Utf8),
                "geohash": pl.Series([], dtype=pl.Utf8),
            }
            for column in REQUIRED_WEATHER_COLS:
                data[column] = pl.Series([], dtype=pl.Float64)
            return pl.DataFrame(data)
        missing = REQUIRED_WEATHER_COLS - set(weather.columns)
        if missing:
            raise ValueError(f"Weather dataset missing columns: {sorted(missing)}")
        return weather

    def _build_key_frame(
        self,
        start: date,
        end: date,
        orders: pl.DataFrame,
        weather: pl.DataFrame,
        join_mode: str,
    ) -> pl.DataFrame:
        dates = pl.date_range(start, end, interval="1d", eager=True).dt.strftime("%Y-%m-%d")
        calendar = pl.DataFrame({"date": dates})
        if join_mode == "date_dma":
            if "geohash" in orders.columns:
                order_keys = (
                    orders.select(["date", "geohash"]).drop_nulls().unique().rename({"geohash": "geo_scope"})
                )
            else:
                order_keys = pl.DataFrame({"date": [], "geo_scope": []})
            if "geohash" in weather.columns:
                weather_keys = (
                    weather.select(["date", "geohash"]).drop_nulls().unique().rename({"geohash": "geo_scope"})
                )
            else:
                weather_keys = pl.DataFrame({"date": [], "geo_scope": []})
            if order_keys.is_empty() and weather_keys.is_empty():
                return calendar.with_columns(pl.lit("GLOBAL").alias("geo_scope"))
            return pl.concat([order_keys, weather_keys], how="diagonal").unique()
        scope = "STATE" if join_mode == "date_state" else "GLOBAL"
        return calendar.with_columns(pl.lit(scope).alias("geo_scope"))

    def _aggregate_orders(self, orders: pl.DataFrame, join_mode: str) -> pl.DataFrame:
        if orders.is_empty():
            return pl.DataFrame(
                {
                    "date": pl.Series([], dtype=pl.Utf8),
                    "geo_scope": pl.Series([], dtype=pl.Utf8),
                    TARGET_COLUMN: pl.Series([], dtype=pl.Float64),
                    "order_count": pl.Series([], dtype=pl.UInt32),
                }
            )
        if join_mode == "date_dma":
            grouped = (
                orders.group_by(["date", "geohash"])
                .agg(
                    [
                        pl.col(TARGET_COLUMN).sum().alias(TARGET_COLUMN),
                        pl.len().alias("order_count"),
                    ]
                )
                .rename({"geohash": "geo_scope"})
            )
        else:
            grouped = (
                orders.group_by("date")
                .agg(
                    [
                        pl.col(TARGET_COLUMN).sum().alias(TARGET_COLUMN),
                        pl.len().alias("order_count"),
                    ]
                )
                .with_columns(pl.lit("STATE" if join_mode == "date_state" else "GLOBAL").alias("geo_scope"))
            )
        return grouped

    def _aggregate_weather(self, weather: pl.DataFrame, join_mode: str) -> pl.DataFrame:
        if weather.is_empty():
            data: Dict[str, pl.Series] = {
                "date": pl.Series([], dtype=pl.Utf8),
                "geo_scope": pl.Series([], dtype=pl.Utf8),
            }
            for column in REQUIRED_WEATHER_COLS:
                data[column] = pl.Series([], dtype=pl.Float64)
            data["observation_flag"] = pl.Series([], dtype=pl.Boolean)
            return pl.DataFrame(data)

        extra_weather_cols = {"temp_c_lag1", "precip_mm_lag1", "snowfall_mm"}
        numeric_cols = [col for col in (REQUIRED_WEATHER_COLS | extra_weather_cols) if col in weather.columns]

        aggregations = [pl.col(col).mean().alias(col) for col in numeric_cols]
        if "observation_type" in weather.columns:
            obs_expr = (
                pl.col("observation_type")
                .str.to_lowercase()
                .eq("forecast")
                .any()
                .alias("observation_flag")
            )
        else:
            obs_expr = pl.lit(False).alias("observation_flag")

        if join_mode == "date_dma":
            agg = weather.group_by(["date", "geohash"]).agg(aggregations + [obs_expr]).rename({"geohash": "geo_scope"})
        else:
            agg = (
                weather.group_by("date")
                .agg(aggregations + [obs_expr])
                .with_columns(pl.lit("STATE" if join_mode == "date_state" else "GLOBAL").alias("geo_scope"))
            )
        return agg

    def _finalize_columns(self, frame: pl.DataFrame, geo_level: str) -> pl.DataFrame:
        numeric_defaults = {
            TARGET_COLUMN: 0.0,
            "meta_spend": 0.0,
            "meta_conversions": 0.0,
            "google_spend": 0.0,
            "google_conversions": 0.0,
            "promos_sent": 0.0,
            "snowfall_mm": 0.0,
        }
        if TARGET_COLUMN in frame.columns:
            frame = frame.with_columns(pl.col(TARGET_COLUMN).alias("_raw_target"))
            target_available_expr = pl.col("_raw_target").is_not_null()
        else:
            frame = frame.with_columns(pl.lit(None).alias("_raw_target"))
            target_available_expr = pl.lit(False)

        for column, default in numeric_defaults.items():
            if column not in frame.columns:
                frame = frame.with_columns(pl.lit(default).alias(column))
            else:
                frame = frame.with_columns(pl.col(column).fill_null(default))

        frame = frame.with_columns(
            pl.col("geo_scope").fill_null("GLOBAL"),
            target_available_expr.alias("target_available"),
            pl.lit(geo_level).alias("geo_level"),
            pl.col("observation_flag").fill_null(False).alias("has_forecast_observation"),
            pl.lit(False).alias("leakage_risk"),
        )
        if "observation_flag" in frame.columns:
            frame = frame.drop("observation_flag")
        frame = frame.drop("_raw_target")

        frame = frame.with_columns(
            pl.col("date").str.strptime(pl.Date, strict=False, exact=False).alias("_date"),
        ).sort(["geo_scope", "_date"])
        return frame

    def _with_lag_features(self, frame: pl.DataFrame) -> pl.DataFrame:
        lag_targets = [
            (TARGET_COLUMN, "net_revenue"),
            ("meta_spend", "meta_spend"),
            ("google_spend", "google_spend"),
            ("temp_c", "temp_c"),
            ("precip_mm", "precip_mm"),
        ]
        rolling_window = max(2, min(7, self.feature_min_rows))
        exprs = []
        for column, prefix in lag_targets:
            if column not in frame.columns:
                continue
            exprs.append(pl.col(column).shift(1).over("geo_scope").alias(f"{prefix}_lag1"))
            exprs.append(
                pl.col(column)
                .rolling_mean(window_size=rolling_window, min_samples=1)
                .over("geo_scope")
                .alias(f"{prefix}_roll7")
            )
        exprs.append(pl.col("promos_sent").shift(1).over("geo_scope").alias("promos_sent_lag1"))
        frame = frame.with_columns(exprs)
        frame = frame.with_columns(
            pl.col("_date").dt.strftime("%Y-%m-%d").alias("date"),
            pl.col("geo_scope"),
            pl.col("geo_level"),
        ).drop("_date")
        return frame

    def _geocoded_ratio(self, orders: pl.DataFrame) -> Optional[float]:
        if orders.is_empty() or "geohash" not in orders.columns:
            return None
        series = orders.get_column("geohash")
        if series.null_count() >= orders.height:
            return None
        total = float(orders.height)
        geocoded = float(orders.filter(pl.col("geohash").is_not_null()).height)
        return geocoded / total if total else None

    def _weather_coverage_ratio(self, frame: pl.DataFrame) -> float:
        if frame.is_empty():
            return 0.0
        mask = pl.Series([True] * frame.height)
        for column in WEATHER_COVERAGE_COLS:
            if column in frame.columns:
                mask = mask & frame[column].is_not_null()
        covered_rows = int(mask.sum())
        return max(0.0, min(1.0, covered_rows / frame.height if frame.height else 0.0))

    def _dma_weather_coverage(self, weather: pl.DataFrame, start: date, end: date) -> Dict[str, float]:
        if weather.is_empty() or "geohash" not in weather.columns:
            return {}
        start_iso = start.isoformat()
        end_iso = end.isoformat()
        window = (
            weather.filter((pl.col("date") >= start_iso) & (pl.col("date") <= end_iso))
            .drop_nulls("geohash")
        )
        if window.is_empty():
            return {}
        total_days = max(1, (end - start).days + 1)
        coverage = (
            window.group_by("geohash")
            .agg(pl.col("date").n_unique().alias("date_count"))
            .with_columns((pl.col("date_count") / total_days).clip(0.0, 1.0).alias("ratio"))
        )
        return {row["geohash"]: float(row["ratio"]) for row in coverage.select(["geohash", "ratio"]).to_dicts()}

    def _resolve_join_mode(
        self,
        geocoded_ratio: Optional[float],
        weather_ratio: float,
        orders_rows: int,
        dma_weather_coverage: Mapping[str, float],
        order_geos: Sequence[str],
    ) -> Tuple[str, str, Optional[str], float]:
        insufficient_dma = False
        if order_geos:
            if dma_weather_coverage:
                min_ratio = min(dma_weather_coverage.get(geo, 0.0) for geo in order_geos)
                insufficient_dma = min_ratio < DMA_MIN_WEATHER_COVERAGE
            else:
                insufficient_dma = True

        if orders_rows and geocoded_ratio is not None:
            if (
                geocoded_ratio >= DMA_MIN_GEOCODED_RATIO
                and weather_ratio >= DMA_MIN_WEATHER_COVERAGE
                and not insufficient_dma
            ):
                return "date_dma", "dma", None, DMA_MIN_WEATHER_COVERAGE
            if geocoded_ratio >= STATE_MIN_GEOCODED_RATIO and weather_ratio >= STATE_MIN_WEATHER_COVERAGE:
                reason = (
                    "dma_weather_coverage_below_0.85"
                    if insufficient_dma or weather_ratio < DMA_MIN_WEATHER_COVERAGE
                    else "dma_geocoded_ratio_below_threshold"
                )
                return "date_state", "state", reason, STATE_MIN_WEATHER_COVERAGE
        reason = "state_level_unavailable" if (geocoded_ratio or 0.0) < STATE_MIN_GEOCODED_RATIO else "state_weather_coverage_below_threshold"
        return "date_global", "global", reason, 0.0

    def _record_weather_gaps(self, frame: pl.DataFrame) -> Tuple[int, List[Dict[str, str]]]:
        weather_cols = [col for col in REQUIRED_WEATHER_COLS if col in frame.columns]
        if not weather_cols:
            return frame.height, [
                {"date": row["date"], "geo_scope": row["geo_scope"]}
                for row in frame.select(["date", "geo_scope"]).to_dicts()
            ]
        mask = None
        for column in weather_cols:
            column_mask = pl.col(column).is_null()
            mask = column_mask if mask is None else (mask | column_mask)
        missing_rows = frame.filter(mask) if mask is not None else pl.DataFrame([])
        records = missing_rows.select(["date", "geo_scope"]).to_dicts() if not missing_rows.is_empty() else []
        return int(missing_rows.height), records

    def _detect_leakage(self, frame: pl.DataFrame, max_observed: Optional[str]) -> Tuple["_LeakageInfo", pl.DataFrame]:
        has_weather = pl.col("_has_weather") if "_has_weather" in frame.columns else pl.lit(False)
        if max_observed is None:
            forward_mask = pl.lit(False)
        else:
            forward_mask = (~pl.col("target_available")) & has_weather & (pl.col("date") > pl.lit(max_observed))
        forecast_mask = pl.col("has_forecast_observation") & pl.col("target_available")
        flagged = frame.with_columns((forward_mask | forecast_mask).alias("_leakage_flag"))

        forward_dates = flagged.filter(forward_mask).select("date").to_series().to_list()
        forecast_dates = flagged.filter(forecast_mask).select("date").to_series().to_list()
        forward_unique = sorted(set(forward_dates))
        forecast_unique = sorted(set(forecast_dates))
        info = _LeakageInfo(
            forward_rows=len(forward_unique),
            forecast_rows=len(forecast_unique),
            forward_dates=forward_unique,
            forecast_dates=forecast_unique,
        )
        return info, flagged

    def _profiles_map(
        self,
        orders: pl.DataFrame,
        ads_meta: pl.DataFrame,
        ads_google: pl.DataFrame,
        promos: pl.DataFrame,
        weather: pl.DataFrame,
    ) -> Dict[str, DatasetProfile]:
        profiles: Dict[str, DatasetProfile] = {}
        try:
            ads_frame = (
                pl.concat([ads_meta, ads_google], how="diagonal")
                if not (ads_meta.is_empty() and ads_google.is_empty())
                else pl.DataFrame()
            )
            profiles["orders"] = build_profile_from_polars("orders", orders)
            profiles["ads"] = build_profile_from_polars("ads", ads_frame)
            profiles["promos"] = build_profile_from_polars("promos", promos)
            profiles["weather"] = build_profile_from_polars("weather", weather)
        except Exception:
            return {}
        return profiles


@dataclass
class _LeakageInfo:
    forward_rows: int
    forecast_rows: int
    forward_dates: List[str]
    forecast_dates: List[str]

    @property
    def total_rows(self) -> int:
        return self.forward_rows + self.forecast_rows

    @property
    def all_dates(self) -> List[str]:
        return sorted(set(self.forward_dates + self.forecast_dates))
