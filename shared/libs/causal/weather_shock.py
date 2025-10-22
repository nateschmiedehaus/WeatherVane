"""Weather shock effect estimation utilities."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
import math
from typing import Dict, Iterable, Mapping

import polars as pl


@dataclass(frozen=True)
class WeatherShockImpact:
    """Result container for weather shock analysis."""

    effect: float
    standard_error: float
    conf_low: float
    conf_high: float
    p_value: float
    treated_pre_mean: float
    treated_post_mean: float
    control_pre_mean: float
    control_post_mean: float
    n_pre: int
    n_post: int
    weights: Mapping[str, float]


def estimate_weather_shock_effect(
    frame: pl.DataFrame,
    *,
    geo_column: str = "geo",
    date_column: str = "date",
    value_column: str = "value",
    treatment_column: str = "is_treated",
    shock_start: date,
    synthetic_control: bool = True,
    weight_temperature: float = 0.25,
) -> WeatherShockImpact:
    """Estimate a weather shock effect using difference-in-differences.

    The input frame should contain one or more treated geographic units and at
    least one control unit. The effect is computed as the change in the treated
    series between the pre- and post-shock windows minus the change observed in a
    (possibly synthetic) control constructed from the control units.
    """

    if frame.is_empty():
        raise ValueError("Cannot estimate weather shock effect from an empty frame.")

    required_columns = {geo_column, date_column, value_column, treatment_column}
    missing = [col for col in required_columns if col not in frame.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(sorted(missing))}.")

    df = _normalise_columns(
        frame,
        geo_column=geo_column,
        date_column=date_column,
        value_column=value_column,
        treatment_column=treatment_column,
    )

    treated_df = df.filter(pl.col("is_treated") == 1)
    control_df = df.filter(pl.col("is_treated") == 0)

    if treated_df.height == 0:
        raise ValueError("Expected at least one treated geo (is_treated == 1).")
    if control_df.height == 0:
        raise ValueError("Expected at least one control geo (is_treated == 0).")

    pre_mask = pl.col("date") < pl.lit(shock_start)
    post_mask = pl.col("date") >= pl.lit(shock_start)

    treated_pre = treated_df.filter(pre_mask)
    treated_post = treated_df.filter(post_mask)
    control_pre = control_df.filter(pre_mask)
    control_post = control_df.filter(post_mask)

    if treated_pre.height == 0 or treated_post.height == 0:
        raise ValueError("Treated geo must have observations both before and after the shock.")
    if control_pre.height == 0 or control_post.height == 0:
        raise ValueError("Control geos must have observations both before and after the shock.")

    control_stats = _combine_control_stats(control_pre, control_post)
    if not control_stats:
        raise ValueError("No control geos contained data across both windows.")

    weights = _resolve_weights(
        control_stats,
        treated_pre_mean=treated_pre["value"].mean(),
        synthetic_control=synthetic_control,
        temperature=weight_temperature,
    )

    control_series = _build_weighted_series(control_df, weights)
    treated_series = _build_treated_series(treated_df)

    pre_dates = [dt for dt in treated_series if dt < shock_start and dt in control_series]
    post_dates = [dt for dt in treated_series if dt >= shock_start and dt in control_series]

    if not pre_dates or not post_dates:
        raise ValueError("Insufficient overlapping dates between treated and control series.")

    treated_pre_mean = _average(treated_series[d] for d in pre_dates)
    treated_post_mean = _average(treated_series[d] for d in post_dates)
    control_pre_mean = _average(control_series[d] for d in pre_dates)
    control_post_mean = _average(control_series[d] for d in post_dates)

    effect = (treated_post_mean - treated_pre_mean) - (control_post_mean - control_pre_mean)

    pre_diffs = [treated_series[d] - control_series[d] for d in pre_dates]
    post_diffs = [treated_series[d] - control_series[d] for d in post_dates]

    standard_error = math.sqrt(
        _variance(pre_diffs) / max(len(pre_diffs), 1) + _variance(post_diffs) / max(len(post_diffs), 1)
    )

    if standard_error < 1e-9:
        conf_low = conf_high = effect
        p_value = 0.0 if abs(effect) > 1e-9 else 1.0
    else:
        margin = 1.96 * standard_error
        conf_low = effect - margin
        conf_high = effect + margin
        z = effect / standard_error
        p_value = min(1.0, max(0.0, math.erfc(abs(z) / math.sqrt(2.0))))

    return WeatherShockImpact(
        effect=effect,
        standard_error=standard_error,
        conf_low=conf_low,
        conf_high=conf_high,
        p_value=p_value,
        treated_pre_mean=treated_pre_mean,
        treated_post_mean=treated_post_mean,
        control_pre_mean=control_pre_mean,
        control_post_mean=control_post_mean,
        n_pre=len(pre_dates),
        n_post=len(post_dates),
        weights=weights,
    )


def _normalise_columns(
    frame: pl.DataFrame,
    *,
    geo_column: str,
    date_column: str,
    value_column: str,
    treatment_column: str,
) -> pl.DataFrame:
    rename_map: Dict[str, str] = {}
    if geo_column != "geo":
        rename_map[geo_column] = "geo"
    if date_column != "date":
        rename_map[date_column] = "date"
    if value_column != "value":
        rename_map[value_column] = "value"
    if treatment_column != "is_treated":
        rename_map[treatment_column] = "is_treated"

    df = frame.rename(rename_map) if rename_map else frame.clone()

    if df["date"].dtype != pl.Date:
        df = df.with_columns(
            pl.col("date").map_elements(_coerce_date, return_dtype=pl.Date)  # type: ignore[arg-type]
        )
    df = df.with_columns(
        pl.col("value").cast(pl.Float64),
        pl.col("is_treated").cast(pl.Int8),
    )
    return df


def _coerce_date(value: object) -> date:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        return date.fromisoformat(value[:10])
    raise TypeError(f"Unable to coerce {value!r} to a date.")


def _combine_control_stats(
    control_pre: pl.DataFrame,
    control_post: pl.DataFrame,
) -> Dict[str, Dict[str, float]]:
    pre_stats = control_pre.group_by("geo").agg(
        pl.col("value").mean().alias("pre_mean"),
        pl.len().alias("pre_count"),
    )
    post_stats = control_post.group_by("geo").agg(
        pl.col("value").mean().alias("post_mean"),
        pl.len().alias("post_count"),
    )

    stats: Dict[str, Dict[str, float]] = {}
    for row in pre_stats.join(post_stats, on="geo", how="inner").iter_rows(named=True):
        geo = row["geo"]
        pre_count = int(row["pre_count"])
        post_count = int(row["post_count"])
        if pre_count > 0 and post_count > 0:
            stats[geo] = {
                "pre_mean": float(row["pre_mean"]),
                "post_mean": float(row["post_mean"]),
                "pre_count": float(pre_count),
                "post_count": float(post_count),
            }
    return stats


def _resolve_weights(
    control_stats: Mapping[str, Mapping[str, float]],
    *,
    treated_pre_mean: float,
    synthetic_control: bool,
    temperature: float,
) -> Dict[str, float]:
    geos = list(control_stats.keys())
    if not geos:
        raise ValueError("No control geos available for weighting.")

    if not synthetic_control or len(geos) == 1:
        weight = 1.0 / len(geos)
        return {geo: weight for geo in geos}

    temperature = max(temperature, 1e-6)
    scores = {
        geo: math.exp(-abs(control_stats[geo]["pre_mean"] - treated_pre_mean) / temperature)
        for geo in geos
    }
    total = sum(scores.values())
    if total <= 0:
        weight = 1.0 / len(geos)
        return {geo: weight for geo in geos}
    return {geo: score / total for geo, score in scores.items()}


def _build_weighted_series(frame: pl.DataFrame, weights: Mapping[str, float]) -> Dict[date, float]:
    daily = frame.group_by(["geo", "date"]).agg(pl.col("value").mean())
    series: Dict[date, float] = {}
    for geo, dt, value in daily.iter_rows():
        if geo in weights:
            series[dt] = series.get(dt, 0.0) + weights[geo] * float(value)
    return series


def _build_treated_series(frame: pl.DataFrame) -> Dict[date, float]:
    daily = frame.group_by("date").agg(pl.col("value").mean())
    return {dt: float(value) for dt, value in daily.iter_rows()}


def _average(values: Iterable[float]) -> float:
    values = list(values)
    if not values:
        raise ValueError("Cannot compute average of an empty collection.")
    return sum(values) / len(values)


def _variance(values: Iterable[float]) -> float:
    values = list(values)
    if len(values) <= 1:
        return 0.0
    mean = sum(values) / len(values)
    return sum((value - mean) ** 2 for value in values) / (len(values) - 1)
