from __future__ import annotations

import datetime as dt
from typing import Dict, List

from pydantic import BaseModel, Field, field_validator


class WeatherShockObservation(BaseModel):
    geo: str = Field(..., description="Geographic region identifier")
    date: dt.date = Field(..., description="Observation date")
    value: float = Field(..., description="Outcome or KPI value")
    is_treated: bool = Field(..., description="Whether the geo experienced the weather shock")


class WeatherShockAnalysisRequest(BaseModel):
    observations: List[WeatherShockObservation]
    shock_start: dt.date = Field(..., description="First date the shock applies")
    synthetic_control: bool = Field(
        True, description="Apply similarity-weighted synthetic control matching"
    )
    weight_temperature: float = Field(
        0.05,
        description="Controls the sharpness of similarity weighting; lower focuses on closest matches.",
    )

    @field_validator("observations")
    @classmethod
    def _validate_observations(cls, value: List[WeatherShockObservation]) -> List[WeatherShockObservation]:
        if not value:
            raise ValueError("At least one observation is required")
        return value

    @field_validator("weight_temperature")
    @classmethod
    def _validate_temperature(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("weight_temperature must be positive")
        return value


class WeatherShockAnalysisResponse(BaseModel):
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
    weights: Dict[str, float]
