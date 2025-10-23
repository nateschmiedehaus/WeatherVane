from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

import polars as pl


@dataclass
class WeatherBudgetConstraint:
    """Defines budget allocation constraints based on weather conditions."""
    min_budget_multiplier: float  # Minimum budget multiplier (e.g., 0.5 = 50% of base budget)
    max_budget_multiplier: float  # Maximum budget multiplier (e.g., 2.0 = 200% of base budget)


def calculate_weather_budget_multiplier(
    weather_frame: pl.DataFrame,
    target_date: date,
    min_temp_c: Optional[float] = None,
    max_temp_c: Optional[float] = None,
    precipitation_threshold_mm: Optional[float] = None,
    heatwave_sensitive: bool = False,
    cold_sensitive: bool = False,
    base_constraint: WeatherBudgetConstraint = WeatherBudgetConstraint(0.5, 2.0)
) -> float:
    """
    Calculate budget multiplier based on weather conditions.

    Args:
        weather_frame: Weather data frame from WeatherCache
        target_date: Date to calculate budget multiplier for
        min_temp_c: Minimum temperature threshold (Celsius)
        max_temp_c: Maximum temperature threshold (Celsius)
        precipitation_threshold_mm: Precipitation threshold (mm)
        heatwave_sensitive: Whether the budget should respond to heatwaves
        cold_sensitive: Whether the budget should respond to cold weather
        base_constraint: Base budget constraint parameters

    Returns:
        Float between min_budget_multiplier and max_budget_multiplier
    """
    if weather_frame.is_empty():
        return 1.0  # Default multiplier when no weather data

    # Filter to target date
    date_str = target_date.isoformat()
    day_data = weather_frame.filter(pl.col("date") == date_str)
    if day_data.is_empty():
        return 1.0

    multiplier = 1.0

    # Apply temperature constraints if specified
    if min_temp_c is not None and "temp_c" in day_data.columns:
        temp = day_data.get_column("temp_c")[0]
        if temp is not None and temp < min_temp_c:
            multiplier *= 0.8  # Reduce budget in cold weather

    if max_temp_c is not None and "temp_c" in day_data.columns:
        temp = day_data.get_column("temp_c")[0]
        if temp is not None and temp > max_temp_c:
            multiplier *= 0.8  # Reduce budget in hot weather

    # Apply precipitation constraints
    if precipitation_threshold_mm is not None and "precip_mm" in day_data.columns:
        precip = day_data.get_column("precip_mm")[0]
        if precip is not None and precip > precipitation_threshold_mm:
            multiplier *= 0.7  # Reduce budget on rainy days

    # Apply heatwave constraints
    if heatwave_sensitive and "heatwave_flag" in day_data.columns:
        heatwave = bool(day_data.get_column("heatwave_flag")[0])
        if heatwave:
            multiplier *= 0.6  # Significant reduction during heatwaves

    # Apply cold weather constraints
    if cold_sensitive and "freeze_flag" in day_data.columns:
        freeze = bool(day_data.get_column("freeze_flag")[0])
        if freeze:
            multiplier *= 0.6  # Significant reduction during freezing weather

    # Ensure multiplier stays within constraints
    multiplier = max(base_constraint.min_budget_multiplier,
                    min(base_constraint.max_budget_multiplier, multiplier))

    return multiplier