"""Geo holdout experiment helpers for proving weather impact."""

from __future__ import annotations

import random
from dataclasses import dataclass, asdict
from math import sqrt
from statistics import NormalDist
from typing import Iterable, Optional

import polars as pl


@dataclass(frozen=True)
class GeoHoldoutConfig:
    holdout_ratio: float = 0.2
    min_holdout_units: int = 4
    seed: int | None = None


@dataclass(frozen=True)
class HoldoutAssignment:
    geo: str
    group: str  # "treatment" or "control"
    weight: float


@dataclass(frozen=True)
class ExperimentEstimate:
    treatment_mean: float
    control_mean: float
    lift: float
    absolute_lift: float
    t_stat: float
    p_value: float
    conf_low: float
    conf_high: float
    sample_size_treatment: int
    sample_size_control: int

    @property
    def is_significant(self) -> bool:
        return self.p_value < 0.05


def assign_geo_holdout(
    metrics: pl.DataFrame,
    config: GeoHoldoutConfig,
) -> pl.DataFrame:
    """Assign each geo to treatment/control using weighted random sampling.

    Parameters
    ----------
    metrics:
        DataFrame with at least columns ``geo`` and ``weight`` (e.g., revenue share).
    config:
        Assignment parameters.
    """

    if "geo" not in metrics.columns:
        raise ValueError("metrics DataFrame must contain a 'geo' column")

    assign_df = metrics.with_columns([
        pl.col("weight").fill_null(1.0).alias("weight"),
    ])
    weights = assign_df.get_column("weight").to_list()
    if not weights:
        raise ValueError("metrics DataFrame must contain at least one geo record")

    rng = random.Random(config.seed)

    holdout_count = max(int(round(len(weights) * config.holdout_ratio)), config.min_holdout_units)
    holdout_count = min(holdout_count, len(weights))  # guard for small datasets

    holdout_indices = _weighted_sample_without_replacement(weights, holdout_count, rng)

    groups = ["control" if idx in holdout_indices else "treatment" for idx in range(len(weights))]

    return assign_df.with_columns(pl.Series("group", groups))


def _weighted_sample_without_replacement(weights: list[float], k: int, rng: random.Random) -> list[int]:
    if k <= 0:
        return []
    available = list(range(len(weights)))
    selected: list[int] = []
    for _ in range(min(k, len(available))):
        total = sum(weights[idx] for idx in available if weights[idx] > 0)
        if total <= 0:
            break
        threshold = rng.random() * total
        cumulative = 0.0
        for idx in list(available):
            w = weights[idx]
            if w <= 0:
                continue
            cumulative += w
            if cumulative >= threshold:
                selected.append(idx)
                available.remove(idx)
                break
    return selected


def geo_revenue_metrics(orders: pl.DataFrame) -> tuple[pl.DataFrame, str | None]:
    """Summarise order revenue per geo for experiment design."""

    if orders.is_empty():
        return pl.DataFrame(), None

    geo_column = None
    for column in ("ship_geohash", "ship_region", "ship_city"):
        if column in orders.columns:
            geo_column = column
            break
    if geo_column is None:
        return pl.DataFrame(), None

    frame = orders.drop_nulls(subset=[geo_column, "net_revenue"])
    if frame.is_empty():
        return pl.DataFrame(), geo_column

    summary = (
        frame.group_by(geo_column)
        .agg(pl.col("net_revenue").sum().alias("revenue"))
        .filter(pl.col("revenue") > 0)
        .rename({geo_column: "geo"})
        .with_columns(pl.col("geo").cast(pl.Utf8))
        .sort("revenue", descending=True)
    )
    if summary.is_empty():
        return summary, geo_column

    total = float(summary.get_column("revenue").sum())
    if total <= 0:
        return pl.DataFrame(), geo_column

    return summary.with_columns((pl.col("revenue") / total).alias("weight")), geo_column


def design_holdout_from_orders(
    orders: pl.DataFrame,
    config: GeoHoldoutConfig,
) -> dict[str, object]:
    """Return a geo holdout design recommendation."""

    metrics, geo_column = geo_revenue_metrics(orders)
    geo_count = int(metrics.height)
    if geo_count < max(config.min_holdout_units * 2, 4):
        return {
            "status": "insufficient_geo",
            "geo_count": geo_count,
            "holdout_ratio": config.holdout_ratio,
        }

    assigned = assign_geo_holdout(metrics, config)
    control_mask = pl.col("group") == "control"
    control_share = float(assigned.filter(control_mask).get_column("weight").sum())
    holdout_count = int(assigned.filter(control_mask).height)

    return {
        "status": "ready",
        "geo_count": geo_count,
        "holdout_count": holdout_count,
        "control_share": control_share,
        "holdout_ratio": config.holdout_ratio,
        "geo_column": geo_column,
        "assignment": assigned.select(["geo", "group", "weight"]).to_dicts(),
    }


def summarise_experiment(
    observations: pl.DataFrame,
    value_column: str,
    group_column: str = "group",
    treatment_value: str = "treatment",
    control_value: str = "control",
) -> ExperimentEstimate:
    """Compute lift statistics between treatment and control groups."""

    if group_column not in observations.columns:
        raise ValueError(f"observations missing group column '{group_column}'")
    if value_column not in observations.columns:
        raise ValueError(f"observations missing value column '{value_column}'")

    treatment = [float(value) for value in observations.filter(pl.col(group_column) == treatment_value).get_column(value_column).to_list()]
    control = [float(value) for value in observations.filter(pl.col(group_column) == control_value).get_column(value_column).to_list()]

    if len(treatment) < 2 or len(control) < 2:
        raise ValueError("Treatment and control require at least two observations each")

    treatment_mean = _mean(treatment)
    control_mean = _mean(control)
    absolute_lift = treatment_mean - control_mean
    lift = absolute_lift / control_mean if control_mean else 0.0

    treatment_var = _sample_variance(treatment)
    control_var = _sample_variance(control)

    se = sqrt(treatment_var / len(treatment) + control_var / len(control))
    if se > 0:
        t_stat = absolute_lift / se
        p_value = 2 * (1 - NormalDist().cdf(abs(t_stat)))
    else:
        t_stat = 0.0
        p_value = 1.0

    z_critical = 1.96
    conf_low = absolute_lift - z_critical * se
    conf_high = absolute_lift + z_critical * se

    return ExperimentEstimate(
        treatment_mean=treatment_mean,
        control_mean=control_mean,
        lift=lift,
        absolute_lift=absolute_lift,
        t_stat=float(t_stat),
        p_value=float(p_value),
        conf_low=conf_low,
        conf_high=conf_high,
        sample_size_treatment=len(treatment),
        sample_size_control=len(control),
    )


def compute_holdout_summary(
    orders: pl.DataFrame,
    assignment: Iterable[dict[str, object]],
    *,
    geo_column: str,
    value_column: str = "net_revenue",
) -> ExperimentEstimate:
    """Aggregate order outcomes by geo and compute lift between treatment/control."""

    assignment = [entry for entry in assignment if entry.get("geo") and entry.get("group")]
    if not assignment:
        raise ValueError("Assignment data required to compute holdout summary")
    if geo_column not in orders.columns:
        raise ValueError(f"orders missing geo column '{geo_column}'")
    if value_column not in orders.columns:
        raise ValueError(f"orders missing value column '{value_column}'")

    mapping = {str(entry["geo"]): str(entry["group"]) for entry in assignment}
    frame = (
        orders.drop_nulls(subset=[geo_column, value_column])
        .group_by(geo_column)
        .agg(pl.col(value_column).sum().alias(value_column))
        .with_columns(pl.col(geo_column).cast(pl.Utf8))
        .with_columns(pl.col(geo_column).replace(mapping).alias("group"))
        .drop_nulls(subset=["group"])
    )
    if frame.is_empty():
        raise ValueError("No matching observations for experiment assignment")

    return summarise_experiment(frame, value_column=value_column)


def estimate_to_payload(estimate: ExperimentEstimate) -> dict[str, object]:
    """Serialize experiment estimate for persistence."""

    payload = asdict(estimate)
    payload["is_significant"] = estimate.is_significant
    return payload


def _mean(values: Iterable[float]) -> float:
    values = list(values)
    if not values:
        raise ValueError("Cannot compute mean of empty sequence")
    return sum(values) / len(values)


def _sample_variance(values: Iterable[float]) -> float:
    values = list(values)
    if len(values) < 2:
        raise ValueError("At least two observations required for variance")
    mean_value = _mean(values)
    return sum((value - mean_value) ** 2 for value in values) / (len(values) - 1)


def aggregate_metric(
    frame: pl.DataFrame,
    value_column: str,
    group_columns: Iterable[str],
    agg: str = "mean",
) -> pl.DataFrame:
    """Aggregate metric per group before summarising.

    Example:
        aggregate_metric(df, value_column=\"revenue\", group_columns=[\"geo\", \"group\"], agg=\"sum\")
    """

    if value_column not in frame.columns:
        raise ValueError(f"value column '{value_column}' not present")

    aggregations = {
        "mean": pl.col(value_column).mean().alias(value_column),
        "sum": pl.col(value_column).sum().alias(value_column),
        "median": pl.col(value_column).median().alias(value_column),
    }
    if agg not in aggregations:
        raise ValueError(f"Unsupported aggregation '{agg}'. Valid options: {list(aggregations)}")

    return frame.group_by(group_columns).agg(aggregations[agg])
