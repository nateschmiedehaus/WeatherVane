from __future__ import annotations

import polars as pl

from apps.api.schemas.weather import WeatherShockAnalysisRequest, WeatherShockAnalysisResponse
from shared.libs.causal import estimate_weather_shock_effect


def analyze_weather_shock(payload: WeatherShockAnalysisRequest) -> WeatherShockAnalysisResponse:
    """Run weather shock effect estimation for API consumers."""

    frame = pl.DataFrame(
        {
            "geo": [obs.geo for obs in payload.observations],
            "date": [obs.date for obs in payload.observations],
            "value": [obs.value for obs in payload.observations],
            "is_treated": [obs.is_treated for obs in payload.observations],
        }
    )

    impact = estimate_weather_shock_effect(
        frame,
        geo_column="geo",
        date_column="date",
        value_column="value",
        treatment_column="is_treated",
        shock_start=payload.shock_start,
        synthetic_control=payload.synthetic_control,
        weight_temperature=payload.weight_temperature,
    )

    return WeatherShockAnalysisResponse(
        effect=impact.effect,
        standard_error=impact.standard_error,
        conf_low=impact.conf_low,
        conf_high=impact.conf_high,
        p_value=impact.p_value,
        treated_pre_mean=impact.treated_pre_mean,
        treated_post_mean=impact.treated_post_mean,
        control_pre_mean=impact.control_pre_mean,
        control_post_mean=impact.control_post_mean,
        n_pre=impact.n_pre,
        n_post=impact.n_post,
        weights=dict(impact.weights),
    )
