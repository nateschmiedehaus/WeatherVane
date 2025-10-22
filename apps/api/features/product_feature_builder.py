from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from math import sqrt
from typing import Iterable, List, Sequence

import polars as pl

from shared.schemas.product_taxonomy import ProductTaxonomyEntry


@dataclass(slots=True)
class ProductFeatureResult:
    """
    Container for the hierarchical feature tables required by downstream models.
    """

    product_features: pl.DataFrame
    category_features: pl.DataFrame
    brand_features: pl.DataFrame
    cross_brand_features: pl.DataFrame
    category_weather_performance: pl.DataFrame
    weather_correlations: pl.DataFrame
    metadata: dict[str, object]


class ProductFeatureBuilder:
    """
    Build product-level modelling features with category/brand roll-ups and
    weather-aware diagnostics.
    """

    REQUIRED_COLUMNS: Sequence[str] = (
        "tenant_id",
        "canonical_product_id",
        "date",
        "net_revenue",
    )

    def __init__(self, *, seasonal_ratio_threshold: float = 1.8, seasonal_peak_share: float = 0.45) -> None:
        self.seasonal_ratio_threshold = seasonal_ratio_threshold
        self.seasonal_peak_share = seasonal_peak_share

    def build(
        self,
        *,
        product_daily: pl.DataFrame,
        taxonomy: Iterable[ProductTaxonomyEntry],
        weather_daily: pl.DataFrame | None = None,
    ) -> ProductFeatureResult:
        """
        Generate hierarchical features for product → category → brand using daily product metrics.
        """

        self._validate_inputs(product_daily)

        if weather_daily is None:
            weather_daily = pl.DataFrame({"date": [], "temp_c": [], "precip_mm": []})

        taxonomy_df = self._taxonomy_frame(taxonomy)
        enriched = self._enrich_with_taxonomy(product_daily, taxonomy_df)

        latest_date = self._latest_date(enriched)
        window_7 = latest_date - timedelta(days=6)
        window_28 = latest_date - timedelta(days=27)

        enriched = self._normalise_metrics(enriched)

        joined_weather = self._attach_weather(enriched, weather_daily)
        weather_correlations = self._weather_correlations(joined_weather)
        weather_affinity = self._weather_affinity_scores(joined_weather)

        seasonal_summary = self._seasonality_summary(enriched)

        product_features = self._product_rollups(enriched, window_7, window_28)
        product_features = (
            product_features.join(weather_affinity, on=["tenant_id", "canonical_product_id"], how="left", suffix="_wa")
            .join(weather_correlations, on=["tenant_id", "canonical_product_id"], how="left", suffix="_corr")
            .join(seasonal_summary, on=["tenant_id", "canonical_product_id"], how="left", suffix="_season")
        )

        category_features = self._category_rollups(enriched, window_7, window_28)
        brand_features = self._brand_rollups(enriched, window_7, window_28)
        cross_brand_features = self._cross_brand_rollups(enriched, window_7, window_28)
        category_weather = self._category_weather_performance(joined_weather, window_28)

        metadata = {
            "latest_observation_date": latest_date.isoformat(),
            "product_rows": enriched.height,
            "taxonomy_count": taxonomy_df.height if taxonomy_df is not None else 0,
        }

        return ProductFeatureResult(
            product_features=product_features,
            category_features=category_features,
            brand_features=brand_features,
            cross_brand_features=cross_brand_features,
            category_weather_performance=category_weather,
            weather_correlations=weather_correlations,
            metadata=metadata,
        )

    def _validate_inputs(self, frame: pl.DataFrame) -> None:
        missing = [column for column in self.REQUIRED_COLUMNS if column not in frame.columns]
        if missing:
            raise ValueError(f"product_daily missing required columns: {missing}")

    def _taxonomy_frame(self, taxonomy: Iterable[ProductTaxonomyEntry]) -> pl.DataFrame:
        rows = []
        for entry in taxonomy:
            rows.append(
                {
                    "tenant_id": entry.tenant_id,
                    "canonical_product_id": entry.canonical_product_id,
                    "product_name": entry.product_name,
                    "category_l1": entry.category_l1,
                    "category_l2": entry.category_l2,
                    "weather_affinity": entry.weather_affinity,
                    "seasonality": entry.seasonality,
                    "cross_brand_key": entry.cross_brand_key,
                    "primary_brand_id": entry.brand_ids[0] if entry.brand_ids else None,
                }
            )
        if not rows:
            return pl.DataFrame(
                schema={
                    "tenant_id": pl.Utf8,
                    "canonical_product_id": pl.Utf8,
                    "product_name": pl.Utf8,
                    "category_l1": pl.Utf8,
                    "category_l2": pl.Utf8,
                    "weather_affinity": pl.Utf8,
                    "seasonality": pl.Utf8,
                    "cross_brand_key": pl.Utf8,
                    "primary_brand_id": pl.Utf8,
                }
            )
        return pl.DataFrame(rows)

    def _enrich_with_taxonomy(self, product_daily: pl.DataFrame, taxonomy_df: pl.DataFrame) -> pl.DataFrame:
        frame = product_daily.with_columns(pl.col("date").str.strptime(pl.Date, strict=False))
        additional_cols = [column for column in ("category_l1", "category_l2", "weather_affinity", "seasonality") if column not in frame.columns]
        if taxonomy_df.height > 0:
            frame = frame.join(
                taxonomy_df,
                on=["tenant_id", "canonical_product_id"],
                how="left",
                suffix="_taxonomy",
            )
        for column in additional_cols:
            if column not in frame.columns:
                frame = frame.with_columns(pl.lit(None).alias(column))
        if "primary_brand_id" not in frame.columns:
            frame = frame.with_columns(pl.lit(None).alias("primary_brand_id"))
        if "cross_brand_key" not in frame.columns:
            frame = frame.with_columns(pl.lit(None).alias("cross_brand_key"))
        return frame

    def _latest_date(self, frame: pl.DataFrame) -> date:
        if frame.is_empty():
            raise ValueError("product_daily has no rows; cannot compute features")
        max_date = frame.select(pl.col("date").max()).item()
        if max_date is None:
            raise ValueError("product_daily `date` column cannot be null")
        return max_date

    def _normalise_metrics(self, frame: pl.DataFrame) -> pl.DataFrame:
        spend_columns = [column for column in frame.columns if column.endswith("_spend") or column == "spend"]
        units_col = "units_sold" if "units_sold" in frame.columns else None
        base = frame
        if not spend_columns:
            base = base.with_columns(pl.lit(0.0).alias("total_spend"))
        else:
            spend_exprs = [pl.col(column).cast(pl.Float64).fill_null(0.0) for column in spend_columns]
            base = base.with_columns(pl.sum_horizontal(spend_exprs).alias("total_spend"))
        if units_col is None:
            base = base.with_columns(pl.lit(0).alias("units_sold"))
        else:
            base = base.with_columns(pl.col(units_col).fill_null(0).cast(pl.Int64))
        base = base.with_columns(
            pl.when(pl.col("total_spend") > 0)
            .then(pl.col("net_revenue") / pl.col("total_spend"))
            .otherwise(None)
            .alias("daily_roas")
        )
        return base

    def _attach_weather(self, frame: pl.DataFrame, weather: pl.DataFrame) -> pl.DataFrame:
        if weather.is_empty():
            return frame.with_columns(
                [
                    pl.lit(None).alias("temp_c"),
                    pl.lit(None).alias("precip_mm"),
                    pl.lit(None).alias("weather_bucket"),
                ]
            )
        prepared_weather = weather.with_columns(
            [
                pl.col("date").str.strptime(pl.Date, strict=False),
                pl.when(pl.col("precip_mm").cast(pl.Float64) >= 5.0)
                .then(pl.lit("rain"))
                .when(pl.col("temp_c").cast(pl.Float64) <= 5.0)
                .then(pl.lit("cold"))
                .when(pl.col("temp_c").cast(pl.Float64) >= 26.0)
                .then(pl.lit("heat"))
                .otherwise(pl.lit("neutral"))
                .alias("weather_bucket"),
            ]
        )
        join_on = ["date"]
        if "geo_scope" in frame.columns and "geo_scope" in prepared_weather.columns:
            join_on.append("geo_scope")
        joined = frame.join(prepared_weather, on=join_on, how="left", suffix="_weather")
        if "weather_bucket" not in joined.columns:
            joined = joined.with_columns(pl.lit("neutral").alias("weather_bucket"))
        return joined

    def _product_rollups(self, frame: pl.DataFrame, window_7: date, window_28: date) -> pl.DataFrame:
        per_product = frame.with_columns(
            [
                pl.col("date").max().over(["tenant_id", "canonical_product_id"]).alias("latest_date"),
            ]
        ).with_columns(
            (pl.col("latest_date").cast(pl.Int32) - pl.col("date").cast(pl.Int32)).alias("days_from_latest")
        )
        base = per_product.group_by(["tenant_id", "canonical_product_id"]).agg(
            [
                pl.col("net_revenue").sum().alias("revenue_total"),
                pl.col("units_sold").sum().alias("units_total"),
                pl.col("total_spend").sum().alias("spend_total"),
                pl.col("daily_roas").mean().alias("avg_daily_roas"),
                pl.col("date").min().alias("first_observed_date"),
                pl.col("date").max().alias("last_observed_date"),
                pl.len().alias("days_observed"),
            ]
        )
        recent_7 = per_product.filter(pl.col("days_from_latest") <= 6).group_by(["tenant_id", "canonical_product_id"]).agg(
            [
                pl.len().alias("days_7d"),
                pl.col("net_revenue").sum().alias("revenue_7d"),
                pl.col("units_sold").sum().alias("units_7d"),
                pl.col("total_spend").sum().alias("spend_7d"),
            ]
        )
        recent_28 = per_product.filter(pl.col("days_from_latest") <= 27).group_by(["tenant_id", "canonical_product_id"]).agg(
            [
                pl.len().alias("days_28d"),
                pl.col("net_revenue").sum().alias("revenue_28d"),
                pl.col("units_sold").sum().alias("units_28d"),
                pl.col("total_spend").sum().alias("spend_28d"),
            ]
        )
        result = (
            base.join(recent_7, on=["tenant_id", "canonical_product_id"], how="left")
            .join(recent_28, on=["tenant_id", "canonical_product_id"], how="left")
            .with_columns(
                [
                    pl.when(pl.col("spend_7d") > 0)
                    .then(pl.col("revenue_7d") / pl.col("spend_7d"))
                    .otherwise(None)
                    .alias("roas_7d"),
                    pl.when(pl.col("spend_28d") > 0)
                    .then(pl.col("revenue_28d") / pl.col("spend_28d"))
                    .otherwise(None)
                    .alias("roas_28d"),
                    pl.when(
                        pl.col("revenue_7d").is_not_null()
                        & pl.col("revenue_28d").is_not_null()
                        & pl.col("days_7d").is_not_null()
                        & pl.col("days_28d").is_not_null()
                        & (pl.col("days_7d") > 0)
                        & (pl.col("days_28d") > 0)
                        & (pl.col("revenue_28d") > 0)
                    )
                    .then(
                        (pl.col("revenue_7d") / pl.col("days_7d").cast(pl.Float64))
                        / (pl.col("revenue_28d") / pl.col("days_28d").cast(pl.Float64))
                    )
                    .otherwise(None)
                    .alias("revenue_velocity_index"),
                    pl.when(
                        pl.col("units_7d").is_not_null()
                        & pl.col("units_28d").is_not_null()
                        & pl.col("days_7d").is_not_null()
                        & pl.col("days_28d").is_not_null()
                        & (pl.col("days_7d") > 0)
                        & (pl.col("days_28d") > 0)
                        & (pl.col("units_28d") > 0)
                    )
                    .then(
                        (pl.col("units_7d") / pl.col("days_7d").cast(pl.Float64))
                        / (pl.col("units_28d") / pl.col("days_28d").cast(pl.Float64))
                    )
                    .otherwise(None)
                    .alias("units_velocity_index"),
                ]
            )
        )
        return result

    def _category_rollups(self, frame: pl.DataFrame, window_7: date, window_28: date) -> pl.DataFrame:
        filtered = frame.filter(pl.col("category_l2").is_not_null())
        summaries = filtered.group_by(["tenant_id", "category_l2"]).agg(
            [
                pl.col("net_revenue").sum().alias("category_revenue_total"),
                pl.col("units_sold").sum().alias("category_units_total"),
                pl.col("total_spend").sum().alias("category_spend_total"),
            ]
        )
        recent_28 = filtered.filter(pl.col("date") >= window_28).group_by(["tenant_id", "category_l2"]).agg(
            [
                pl.col("net_revenue").sum().alias("category_revenue_28d"),
                pl.col("units_sold").sum().alias("category_units_28d"),
                pl.col("total_spend").sum().alias("category_spend_28d"),
            ]
        )
        recent_7 = filtered.filter(pl.col("date") >= window_7).group_by(["tenant_id", "category_l2"]).agg(
            pl.col("net_revenue").sum().alias("category_revenue_7d")
        )
        return (
            summaries.join(recent_28, on=["tenant_id", "category_l2"], how="left")
            .join(recent_7, on=["tenant_id", "category_l2"], how="left")
            .with_columns(
                pl.when(pl.col("category_spend_28d") > 0)
                .then(pl.col("category_revenue_28d") / pl.col("category_spend_28d"))
                .otherwise(None)
                .alias("category_roas_28d")
            )
        )

    def _brand_rollups(self, frame: pl.DataFrame, window_7: date, window_28: date) -> pl.DataFrame:
        filtered = frame.filter(pl.col("primary_brand_id").is_not_null())
        summaries = filtered.group_by(["tenant_id", "primary_brand_id"]).agg(
            [
                pl.col("net_revenue").sum().alias("brand_revenue_total"),
                pl.col("units_sold").sum().alias("brand_units_total"),
                pl.col("total_spend").sum().alias("brand_spend_total"),
            ]
        )
        recent_28 = filtered.filter(pl.col("date") >= window_28).group_by(["tenant_id", "primary_brand_id"]).agg(
            [
                pl.col("net_revenue").sum().alias("brand_revenue_28d"),
                pl.col("units_sold").sum().alias("brand_units_28d"),
                pl.col("total_spend").sum().alias("brand_spend_28d"),
            ]
        )
        return summaries.join(recent_28, on=["tenant_id", "primary_brand_id"], how="left").with_columns(
            pl.when(pl.col("brand_spend_28d") > 0)
            .then(pl.col("brand_revenue_28d") / pl.col("brand_spend_28d"))
            .otherwise(None)
            .alias("brand_roas_28d")
        )

    def _cross_brand_rollups(self, frame: pl.DataFrame, window_7: date, window_28: date) -> pl.DataFrame:
        filtered = frame.filter(pl.col("cross_brand_key").is_not_null())
        summaries = filtered.group_by(["tenant_id", "cross_brand_key"]).agg(
            [
                pl.col("net_revenue").sum().alias("cross_brand_revenue_total"),
                pl.col("units_sold").sum().alias("cross_brand_units_total"),
                pl.col("total_spend").sum().alias("cross_brand_spend_total"),
                pl.n_unique("canonical_product_id").alias("product_count"),
            ]
        )
        recent_28 = filtered.filter(pl.col("date") >= window_28).group_by(["tenant_id", "cross_brand_key"]).agg(
            [
                pl.col("net_revenue").sum().alias("cross_brand_revenue_28d"),
                pl.col("units_sold").sum().alias("cross_brand_units_28d"),
            ]
        )
        return summaries.join(recent_28, on=["tenant_id", "cross_brand_key"], how="left")

    def _category_weather_performance(self, frame: pl.DataFrame, window_28: date) -> pl.DataFrame:
        filtered = frame.filter(pl.col("date") >= window_28).filter(pl.col("category_l2").is_not_null())
        if filtered.is_empty():
            return pl.DataFrame(
                schema={
                    "tenant_id": pl.Utf8,
                    "category_l2": pl.Utf8,
                    "weather_bucket": pl.Utf8,
                    "avg_revenue": pl.Float64,
                    "lift_vs_neutral": pl.Float64,
                }
            )
        grouped = filtered.group_by(["tenant_id", "category_l2", "weather_bucket"]).agg(
            [
                pl.col("net_revenue").mean().alias("avg_revenue"),
                pl.col("units_sold").mean().alias("avg_units"),
            ]
        )
        neutral = grouped.filter(pl.col("weather_bucket") == "neutral").select(
            ["tenant_id", "category_l2", pl.col("avg_revenue").alias("neutral_revenue")]
        )
        combined = grouped.join(neutral, on=["tenant_id", "category_l2"], how="left")
        combined = combined.with_columns(
            pl.when(pl.col("neutral_revenue").is_null() | (pl.col("neutral_revenue") == 0))
            .then(None)
            .otherwise((pl.col("avg_revenue") - pl.col("neutral_revenue")) / pl.col("neutral_revenue"))
            .alias("lift_vs_neutral")
        )
        return combined

    def _weather_correlations(self, frame: pl.DataFrame) -> pl.DataFrame:
        empty_schema = {
            "tenant_id": pl.Utf8,
            "canonical_product_id": pl.Utf8,
            "corr_temp_c": pl.Float64,
            "corr_precip_mm": pl.Float64,
        }
        if frame.is_empty():
            return pl.DataFrame(schema=empty_schema)
        partitions = frame.filter(pl.col("temp_c").is_not_null() | pl.col("precip_mm").is_not_null()).partition_by(
            ["tenant_id", "canonical_product_id"],
            as_dict=True,
        )
        rows: List[dict[str, object]] = []
        for key, slice_df in partitions.items():
            tenant_id, product_id = key
            temp_series = slice_df.get_column("temp_c") if "temp_c" in slice_df.columns else None
            precip_series = slice_df.get_column("precip_mm") if "precip_mm" in slice_df.columns else None
            revenue_series = slice_df.get_column("net_revenue")
            corr_temp = self._pearson(revenue_series, temp_series) if temp_series is not None else None
            corr_precip = self._pearson(revenue_series, precip_series) if precip_series is not None else None
            rows.append(
                {
                    "tenant_id": tenant_id,
                    "canonical_product_id": product_id,
                    "corr_temp_c": corr_temp,
                    "corr_precip_mm": corr_precip,
                }
            )
        return pl.DataFrame(rows) if rows else pl.DataFrame(schema=empty_schema)

    def _pearson(self, revenue: pl.Series, weather: pl.Series | None) -> float | None:
        if weather is None:
            return None
        values = list(zip(revenue.to_list(), weather.to_list()))
        filtered = [(x, y) for x, y in values if x is not None and y is not None]
        if len(filtered) < 2:
            return None
        xs, ys = zip(*filtered)
        mean_x = sum(xs) / len(xs)
        mean_y = sum(ys) / len(ys)
        n = len(filtered)
        cov = sum((x - mean_x) * (y - mean_y) for x, y in filtered) / (n - 1)
        var_x = sum((x - mean_x) ** 2 for x in xs) / (n - 1)
        var_y = sum((y - mean_y) ** 2 for y in ys) / (n - 1)
        if var_x == 0 or var_y == 0:
            return 0.0
        return cov / sqrt(var_x * var_y)

    def _weather_affinity_scores(self, frame: pl.DataFrame) -> pl.DataFrame:
        empty_schema = {
            "tenant_id": pl.Utf8,
            "canonical_product_id": pl.Utf8,
            "weather_affinity_score": pl.Float64,
            "matching_weather_days": pl.Int64,
        }
        if frame.is_empty() or "weather_affinity" not in frame.columns:
            return pl.DataFrame(schema=empty_schema)
        available = frame.filter(pl.col("weather_bucket").is_not_null() & pl.col("weather_affinity").is_not_null())
        if available.is_empty():
            return pl.DataFrame(schema=empty_schema)
        partitions = available.partition_by(["tenant_id", "canonical_product_id"], as_dict=True)
        rows: List[dict[str, object]] = []
        for key, slice_df in partitions.items():
            tenant_id, product_id = key
            affinity = slice_df.get_column("weather_affinity")
            if affinity is None or affinity.is_null().all():
                continue
            target = affinity[0]
            revenue = slice_df.get_column("net_revenue")
            bucket = slice_df.get_column("weather_bucket")
            pairs = list(zip(revenue.to_list(), bucket.to_list()))
            matching = [value for value, bucket_value in pairs if bucket_value == target and value is not None]
            baseline = [value for value, bucket_value in pairs if bucket_value != target and value is not None]
            if not matching:
                score = None
            elif not baseline:
                score = float("inf")
            else:
                avg_match = sum(matching) / len(matching)
                avg_other = sum(baseline) / len(baseline)
                if avg_other == 0:
                    score = float("inf") if avg_match > 0 else 0.0
                else:
                    score = (avg_match - avg_other) / avg_other
            rows.append(
                {
                    "tenant_id": tenant_id,
                    "canonical_product_id": product_id,
                    "weather_affinity_score": score,
                    "matching_weather_days": len(matching),
                }
            )
        return pl.DataFrame(rows) if rows else pl.DataFrame(schema=empty_schema)

    def _seasonality_summary(self, frame: pl.DataFrame) -> pl.DataFrame:
        dated = frame.with_columns(pl.col("date").dt.month().alias("month"))
        grouped = dated.group_by(["tenant_id", "canonical_product_id", "month"]).agg(
            pl.col("net_revenue").sum().alias("monthly_revenue")
        )
        if grouped.is_empty():
            return pl.DataFrame(
                schema={
                    "tenant_id": pl.Utf8,
                    "canonical_product_id": pl.Utf8,
                    "seasonality_label": pl.Utf8,
                    "seasonality_score": pl.Float64,
                    "peak_month": pl.Int64,
                }
            )
        rows: List[dict[str, object]] = []
        for key, slice_df in grouped.partition_by(["tenant_id", "canonical_product_id"], as_dict=True).items():
            tenant_id, product_id = key
            totals = slice_df.get_column("monthly_revenue").to_list()
            months = slice_df.get_column("month").to_list()
            total_revenue = sum(totals)
            if total_revenue <= 0:
                label = "evergreen"
                score = 0.0
                peak_month = None
            else:
                max_value = max(totals)
                peak_index = totals.index(max_value)
                peak_month = months[peak_index]
                sorted_totals = sorted(totals)
                mid = len(sorted_totals) // 2
                if len(sorted_totals) % 2 == 0:
                    median = (sorted_totals[mid - 1] + sorted_totals[mid]) / 2 if mid > 0 else sorted_totals[0]
                else:
                    median = sorted_totals[mid]
                if median == 0:
                    score = float("inf") if max_value > 0 else 0.0
                else:
                    score = max_value / median
                peak_share = max_value / total_revenue if total_revenue > 0 else 0.0
                label = "seasonal" if score >= self.seasonal_ratio_threshold and peak_share >= self.seasonal_peak_share else "evergreen"
            rows.append(
                {
                    "tenant_id": tenant_id,
                    "canonical_product_id": product_id,
                    "seasonality_label": label,
                    "seasonality_score": score,
                    "peak_month": peak_month,
                }
            )
        return pl.DataFrame(rows)
