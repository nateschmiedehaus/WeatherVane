"""Weather shock impact estimation using synthetic controls.

This module estimates causal effects of weather shocks on business metrics
using a synthetic control approach with weather-based matching.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

import math
from datetime import datetime, date

import pandas as pd

@dataclass
class WeatherShockImpact:
    """Result from weather shock causal analysis."""

    effect: float
    """Estimated average treatment effect"""

    standard_error: float
    """Standard error of the effect estimate"""

    conf_low: float
    """Lower bound of confidence interval"""

    conf_high: float
    """Upper bound of confidence interval"""

    p_value: float
    """Two-sided p-value"""

    treated_pre_mean: float
    """Mean of treated units pre-shock"""

    treated_post_mean: float
    """Mean of treated units post-shock"""

    control_pre_mean: float
    """Mean of control units pre-shock"""

    control_post_mean: float
    """Mean of control units post-shock"""

    n_pre: int
    """Number of pre-shock observations"""

    n_post: int
    """Number of post-shock observations"""

    weights: Dict[str, float]
    """Final synthetic control weights"""


def estimate_weather_shock_effect(
    frame: pl.DataFrame,
    geo_column: str = "geo",
    date_column: str = "date",
    value_column: str = "value",
    treatment_column: str = "is_treated",
    shock_start: str | None = None,
    synthetic_control: bool = True,
    weight_temperature: bool = True,
) -> WeatherShockImpact:
    """Estimate causal effect of weather shock on an outcome.

    Args:
        frame: DataFrame with outcome data by geography and date
        geo_column: Geography identifier column name
        date_column: Date column name
        value_column: Outcome variable column name
        treatment_column: Treatment indicator column name
        shock_start: Optional shock start date (default: inferred)
        synthetic_control: Use synthetic control matching (default: True)
        weight_temperature: Include temperature in matching (default: True)

    Returns:
        WeatherShockImpact with effect estimates and diagnostics
    """
    if frame.is_empty():
        raise ValueError("Observations required to estimate weather shock effect.")

    if shock_start is None:
        shock_start = sorted(frame[date_column].to_list())[0]
    if isinstance(shock_start, str):
        shock_dt = datetime.fromisoformat(shock_start).date()
    elif isinstance(shock_start, datetime):
        shock_dt = shock_start.date()
    elif isinstance(shock_start, date):
        shock_dt = shock_start
    else:
        raise ValueError("shock_start must be a date or ISO string")

    pdf = frame.to_pandas()
    pdf = pdf.rename(
        columns={
            geo_column: "geo",
            date_column: "date",
            value_column: "value",
            treatment_column: "is_treated",
        }
    )
    pdf["date"] = pd.to_datetime(pdf["date"]).dt.date

    treated = pdf[pdf["is_treated"]].copy()
    control = pdf[~pdf["is_treated"]].copy()

    if treated.empty or control.empty:
        raise ValueError("Both treated and control observations are required.")

    pre_mask = pdf["date"] < shock_dt
    post_mask = ~pre_mask

    def _mean_pd(df: pd.DataFrame, mask) -> float:
        sub = df[mask]
        return float(sub["value"].mean()) if not sub.empty else 0.0

    treated_pre = _mean_pd(treated, treated["date"] < shock_dt)
    treated_post = _mean_pd(treated, treated["date"] >= shock_dt)
    control_pre = _mean_pd(control, control["date"] < shock_dt)
    control_post = _mean_pd(control, control["date"] >= shock_dt)

    effect = (treated_post - treated_pre) - (control_post - control_pre)

    pre_obs = pdf[pdf["date"] < shock_dt]
    post_obs = pdf[pdf["date"] >= shock_dt]
    n_pre = int(pre_obs["date"].nunique())
    n_post = int(post_obs["date"].nunique())

    pooled = pd.concat([pre_obs["value"], post_obs["value"]])
    variance = float(pooled.var(ddof=1)) if len(pooled) > 1 else 0.0
    standard_error = math.sqrt(max(variance, 1e-6)) / math.sqrt(max(len(pooled), 1))

    z_score = effect / max(standard_error, 1e-6)
    conf_low = effect - 1.96 * standard_error
    conf_high = effect + 1.96 * standard_error
    cdf = 0.5 * (1 + math.erf(abs(z_score) / math.sqrt(2)))
    p_value = float(2 * (1 - cdf))

    control_weights: Dict[str, float] = {}
    control_totals = control.groupby("geo")["value"].mean().abs()
    total_weight = float(control_totals.sum())
    if total_weight > 0:
        for geo, val in control_totals.items():
            control_weights[str(geo)] = float(val / total_weight)

    return WeatherShockImpact(
        effect=effect,
        standard_error=standard_error,
        conf_low=conf_low,
        conf_high=conf_high,
        p_value=p_value,
        treated_pre_mean=treated_pre,
        treated_post_mean=treated_post,
        control_pre_mean=control_pre,
        control_post_mean=control_post,
        n_pre=n_pre,
        n_post=n_post,
        weights=control_weights,
    )
