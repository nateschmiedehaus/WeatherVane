"""Feature store utilities for assembling modelling design matrices."""
from __future__ import annotations

import os
import glob
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import polars as pl


class FeatureLeakageError(Exception):
    """Raised when feature leakage is detected in the training data."""
    pass


# Constants
TARGET_COLUMN = "net_revenue"

REQUIRED_WEATHER_COLS = {
    "temp_c",
    "precip_mm",
    "temp_anomaly",
    "precip_anomaly",
    "temp_roll7",
    "precip_roll7",
    "weather_elasticity",  # Added for elasticity estimation
}

WEATHER_COVERAGE_COLS = {
    "temp_c",
    "precip_mm",
    "temp_anomaly",
    "precip_anomaly",
    "weather_elasticity",  # Added for elasticity estimation
}


@dataclass
class FeatureMatrix:
    """Collection of feature engineering outputs."""
    frame: pl.DataFrame
    observed_frame: pl.DataFrame
    orders_rows: int
    ads_rows: int
    promo_rows: int
    weather_rows: int
    leakage_risk_rows: int
    leakage_risk_dates: List[str]
    forward_leakage_rows: int
    forward_leakage_dates: List[str]
    forecast_leakage_rows: int
    forecast_leakage_dates: List[str]
    weather_coverage_ratio: float
    weather_coverage_threshold: float
    latest_observed_date: Optional[str]


class FeatureBuilder:
    """Build feature matrices from raw data."""

    def __init__(self, lake_root: Path | str = Path("storage/lake/raw"), feature_min_rows: int = 14) -> None:
        """Initialize feature builder.

        Args:
            lake_root: Root directory for data lake
            feature_min_rows: Minimum rows before generating lag/rolling features
        """
        self.lake_root = Path(lake_root)
        self.feature_min_rows = max(feature_min_rows, 1)

    def list_tenants(self) -> List[str]:
        """List available tenant IDs."""
        tenant_dirs = glob.glob(str(self.lake_root / "*"))
        return [os.path.basename(d) for d in tenant_dirs if os.path.isdir(d)]

    def build(self, tenant_id: str, start: datetime, end: datetime) -> FeatureMatrix:
        """Build feature matrix for a tenant.

        Args:
            tenant_id: Tenant identifier
            start: Training window start date
            end: Training window end date

        Returns:
            FeatureMatrix with combined features
        """
        start_str = start.date().isoformat()
        end_str = end.date().isoformat()

        # Load latest datasets
        orders = self._load_latest(tenant_id, "shopify_orders", drop_null_revenue=True)
        ads_meta = self._load_latest(tenant_id, "meta_ads")
        ads_google = self._load_latest(tenant_id, "google_ads")
        promos = self._load_latest(tenant_id, "promos")
        weather = self._load_latest(tenant_id, "weather_daily")

        # Generate daily features
        orders_daily = self._orders_daily(orders)
        ads_daily = self._ads_daily(ads_meta, ads_google)
        promos_daily = self._promos_daily(promos)
        weather_daily = self._weather_daily(weather)

        if not orders_daily.is_empty():
            frame = orders_daily.join(weather_daily, on="date", how="left")
        else:
            frame = weather_daily

        if frame.is_empty():
            frame = pl.DataFrame({"date": [], "geohash": []})

        frame = frame.with_columns(pl.lit("GLOBAL").cast(pl.Utf8).alias("geo_scope"))

        # Add missing columns
        if TARGET_COLUMN not in frame.columns:
            frame = frame.with_columns(pl.lit(None, dtype=pl.Float64).alias(TARGET_COLUMN))

        # Add ads and promos data
        frame = frame.join(ads_daily, on="date", how="left")
        frame = frame.join(promos_daily, on="date", how="left")

        # Fill nulls with zeros for numeric columns
        numeric_cols = frame.select(pl.col([col for col in frame.columns if frame[col].dtype in {pl.Float64, pl.Int64}])).columns
        for col in numeric_cols:
            frame = frame.with_columns(pl.col(col).fill_null(0))

        # Filter date range
        frame = frame.filter(pl.col("date").is_between(pl.lit(start_str), pl.lit(end_str)))

        # Add target availability flag
        frame = frame.with_columns(
            pl.col(TARGET_COLUMN).is_not_null().alias("target_available"),
        )

        # Validate required features
        missing_weather = [col for col in REQUIRED_WEATHER_COLS if col not in frame.columns]
        if missing_weather:
            raise ValueError(f"Weather features missing from matrix: {missing_weather}")

        # Calculate weather coverage
        weather_coverage_ratio = self._weather_coverage_ratio(frame)

        # Filter observed rows and handle leakage
        observed_frame = frame.filter(pl.col("target_available"))
        observed_rows = observed_frame.height
        latest_observed = observed_frame["date"].max() if observed_rows > 0 else None

        # Detect potential leakage
        forward_frame = frame.filter((~pl.col("target_available")) & pl.col("ads_spend").gt(0))
        forward_leakage_rows = int(forward_frame.height)
        forward_leakage_dates = forward_frame.select("date").unique()["date"].to_list() if forward_leakage_rows > 0 else []

        # Detect forecast leakage
        forecast_frame = frame.filter(pl.col("target_available"))  # Mock implementation
        forecast_leakage_rows = 0
        forecast_leakage_dates: List[str] = []

        return FeatureMatrix(
            frame=frame,
            observed_frame=observed_frame,
            orders_rows=int(orders.height),
            ads_rows=int(ads_meta.height + ads_google.height),
            promo_rows=int(promos.height),
            weather_rows=int(weather.height),
            leakage_risk_rows=forward_leakage_rows + forecast_leakage_rows,
            leakage_risk_dates=forward_leakage_dates + forecast_leakage_dates,
            forward_leakage_rows=forward_leakage_rows,
            forward_leakage_dates=forward_leakage_dates,
            forecast_leakage_rows=forecast_leakage_rows,
            forecast_leakage_dates=forecast_leakage_dates,
            weather_coverage_ratio=weather_coverage_ratio,
            weather_coverage_threshold=0.85,
            latest_observed_date=str(latest_observed) if latest_observed else None,
        )

    def _load_latest(self, tenant_id: str, dataset: str, drop_null_revenue: bool = False) -> pl.DataFrame:
        """Load latest version of a dataset."""
        dataset_dir = self.lake_root / tenant_id / f"{tenant_id}_{dataset}" / "features"
        if not dataset_dir.exists():
            return pl.DataFrame([])

        latest_file = dataset_dir / f"{tenant_id}_{dataset}_latest.parquet"
        if not latest_file.exists():
            return pl.DataFrame([])

        frame = pl.read_parquet(latest_file)
        if drop_null_revenue and TARGET_COLUMN in frame.columns:
            frame = frame.filter(pl.col(TARGET_COLUMN).is_not_null())
        return frame

    def _orders_daily(self, orders: pl.DataFrame) -> pl.DataFrame:
        """Aggregate orders to daily level."""
        if orders.is_empty():
            return pl.DataFrame({"date": [], TARGET_COLUMN: []})
        if "created_at" not in orders.columns:
            raise ValueError("orders dataset missing `created_at`")

        frame = orders.with_columns(pl.col("created_at").str.slice(0, 10).alias("date"))
        return frame.group_by("date").agg(pl.col(TARGET_COLUMN).sum())

    def _ads_daily(self, meta: pl.DataFrame, google: pl.DataFrame) -> pl.DataFrame:
        """Combine and aggregate ads to daily level."""
        if meta.is_empty() and google.is_empty():
            return pl.DataFrame({
                "date": [],
                "ads_spend": pl.Series([], dtype=pl.Float64),
                "ads_conversions": pl.Series([], dtype=pl.Float64),
            })

        frames = []
        if not meta.is_empty():
            frames.append(
                meta.with_columns(
                    pl.col("spend").alias("ads_spend"),
                    pl.col("conversions").alias("ads_conversions"),
                )
            )
        if not google.is_empty():
            frames.append(
                google.with_columns(
                    pl.col("spend").alias("ads_spend"),
                    pl.col("conversions").alias("ads_conversions"),
                )
            )

        combined = pl.concat(frames) if frames else pl.DataFrame([])
        if combined.is_empty():
            return pl.DataFrame({
                "date": [],
                "ads_spend": pl.Series([], dtype=pl.Float64),
                "ads_conversions": pl.Series([], dtype=pl.Float64),
            })

        return combined.group_by("date").agg([
            pl.col("ads_spend").sum(),
            pl.col("ads_conversions").sum(),
        ])

    def _promos_daily(self, promos: pl.DataFrame) -> pl.DataFrame:
        """Aggregate promos to daily level."""
        if promos.is_empty():
            return pl.DataFrame({"date": [], "promos_sent": []})
        date_col = "send_date" if "send_date" in promos.columns else "scheduled_at"
        return (
            promos
            .with_columns(pl.col(date_col).str.slice(0, 10).alias("date"))
            .group_by("date")
            .agg(pl.len().alias("promos_sent"))
        )

    def _weather_daily(self, weather: pl.DataFrame) -> pl.DataFrame:
        """Clean and normalize weather data."""
        if weather.is_empty():
            return pl.DataFrame({
                "date": [],
                "temp_c": [],
                "precip_mm": [],
                "temp_anomaly": [],
                "precip_anomaly": [],
                "temp_roll7": [],
                "precip_roll7": [],
                "weather_elasticity": [],
            })

        if "orders_frame" not in self.__dict__:
            self.orders_frame = None

        frame = weather.clone()
        if self.orders_frame is not None and not self.orders_frame.is_empty():
            # Calculate elasticity if we have revenue data
            from apps.model.weather_elasticity_analysis import estimate_weather_elasticity
            report = estimate_weather_elasticity(
                self.orders_frame,
                spend_cols=[],  # We'll add spend channels later
                weather_cols=["temp_c", "precip_mm"],
                revenue_col=TARGET_COLUMN
            )
            frame = frame.with_columns(pl.lit(report.weather_elasticity_mean).alias("weather_elasticity"))
        else:
            # No revenue data yet, use default elasticity of 0
            frame = frame.with_columns(pl.lit(0.0).alias("weather_elasticity"))

        missing = REQUIRED_WEATHER_COLS - set(frame.columns)
        if missing:
            raise ValueError(f"Weather dataset missing columns: {missing}")
        return frame

    def _weather_coverage_ratio(self, frame: pl.DataFrame) -> float:
        """Calculate weather data coverage ratio."""
        if frame.is_empty():
            return 0.0

        coverage_cols = [col for col in WEATHER_COVERAGE_COLS if col in frame.columns]
        if not coverage_cols:
            return 1.0

        mask = pl.col(coverage_cols[0]).is_not_null()
        for col in coverage_cols[1:]:
            mask = mask & pl.col(col).is_not_null()

        covered_rows = frame.filter(mask).height
        ratio = float(covered_rows) / float(frame.height)
        return max(0.0, min(1.0, ratio))