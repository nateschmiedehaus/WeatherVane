"""Weather-aware budget allocation optimizer."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, Mapping, Sequence

import polars as pl

from shared.feature_store.weather_cache import WeatherCache, hydrate_weather_cells
from .optimizer import (
    BudgetItem,
    HierarchyConstraint,
    OptimizerRequest,
    OptimizerResult,
    OptimizationError,
    optimize_allocation,
)


@dataclass(frozen=True)
class WeatherThresholds:
    """Weather conditions that affect budget allocation."""

    # Temperature thresholds (Celsius)
    min_temperature: float | None = None  # Reduce spend below this temp
    max_temperature: float | None = None  # Reduce spend above this temp
    temperature_window: float | None = 2.0  # Temperature tolerance window (±°C)

    # Precipitation thresholds
    max_precipitation_prob: float | None = None  # Reduce spend above this probability (0-1)
    max_precipitation_mm: float | None = None  # Reduce spend above this amount (mm/day)

    # Condition flags
    reduce_on_freeze: bool = False  # Reduce spend during freeze events
    reduce_on_heatwave: bool = False  # Reduce spend during heatwaves
    reduce_on_snow: bool = False  # Reduce spend during snow events
    reduce_on_high_wind: bool = False  # Reduce spend during high wind
    reduce_on_high_uv: bool = False  # Reduce spend during high UV

    # Modifier for bad weather conditions (0 to 1)
    weather_reduction_factor: float = 0.5  # Must be between 0 and 1

    def __post_init__(self):
        # Validate temperature thresholds
        if self.min_temperature is not None and self.max_temperature is not None:
            if self.min_temperature >= self.max_temperature:
                raise ValueError("min_temperature must be less than max_temperature")

        # Validate weather reduction factor
        if not 0.0 <= self.weather_reduction_factor <= 1.0:
            raise ValueError("weather_reduction_factor must be between 0 and 1")

        # Validate precipitation probability
        if (self.max_precipitation_prob is not None and
            not 0.0 <= self.max_precipitation_prob <= 1.0):
            raise ValueError("max_precipitation_prob must be between 0 and 1")

        # Validate precipitation amount
        if self.max_precipitation_mm is not None and self.max_precipitation_mm < 0:
            raise ValueError("max_precipitation_mm must be non-negative")


@dataclass(frozen=True)
class WeatherAwareBudgetItem(BudgetItem):
    """Budget item with weather-based constraints."""

    weather_thresholds: WeatherThresholds = field(default_factory=WeatherThresholds)
    location_lat: float | None = None  # Required for weather lookups
    location_lon: float | None = None  # Required for weather lookups


@dataclass(frozen=True)
class WeatherAwareOptimizerRequest(OptimizerRequest):
    """Optimization request with weather-aware budget items."""

    items: Sequence[WeatherAwareBudgetItem]
    hierarchy_constraints: Sequence[HierarchyConstraint] = ()
    forecast_date: date | None = None  # Date to check weather for, defaults to today if not specified


async def optimize_weather_aware_allocation(
    request: WeatherAwareOptimizerRequest,
    weather_cache: WeatherCache,
    *,
    solver: str | None = None,
    relax_infeasible: bool = True
) -> OptimizerResult:
    """Optimize budget allocation considering weather conditions."""

    # Extract items with location data
    weather_items = [
        item for item in request.items
        if item.location_lat is not None and item.location_lon is not None
    ]

    if not weather_items:
        # No weather-aware items, fall back to regular optimization
        return optimize_allocation(request, solver=solver, relax_infeasible=relax_infeasible)

    # Fetch weather data for all locations
    coords = [
        (float(item.location_lat), float(item.location_lon))  # type: ignore
        for item in weather_items
    ]
    weather_results = await hydrate_weather_cells(
        weather_cache,
        coords,
        start=request.forecast_date,
        end=request.forecast_date,
        max_concurrency=5
    )

    # Create weather condition lookup by location
    weather_by_loc: Dict[tuple[float, float], pl.DataFrame] = {}
    for result in weather_results:
        lat = result.latitude
        lon = result.longitude
        weather_by_loc[(lat, lon)] = result.frame

    # Modify budget constraints based on weather
    modified_items: list[BudgetItem] = []
    for item in request.items:
        if not isinstance(item, WeatherAwareBudgetItem):
            modified_items.append(item)
            continue

        if item.location_lat is None or item.location_lon is None:
            modified_items.append(item)
            continue

        weather = weather_by_loc.get((item.location_lat, item.location_lon))
        if weather is None or weather.is_empty():
            modified_items.append(item)
            continue

        # Get weather conditions for the target date
        conditions = weather.filter(pl.col("date") == request.forecast_date.isoformat())
        if conditions.is_empty():
            modified_items.append(item)
            continue

        thresholds = item.weather_thresholds
        reduction_needed = False

        # Check temperature thresholds with window tolerance
        window = float(thresholds.temperature_window or 0.0)

        if thresholds.min_temperature is not None:
            temp = float(conditions["temp_c"].min() or 0)
            # Only reduce if temp is below threshold by more than window
            if temp < (thresholds.min_temperature - window):
                reduction_needed = True
                # Scale reduction based on distance from threshold
                factor = max(0.0, (temp - (thresholds.min_temperature - window * 2)) / window)
                reduction_factor = max(factor, thresholds.weather_reduction_factor)
            else:
                reduction_factor = 1.0

        if thresholds.max_temperature is not None:
            temp = float(conditions["temp_c"].max() or 0)
            # Only reduce if temp is above threshold by more than window
            if temp > (thresholds.max_temperature + window):
                reduction_needed = True
                # Scale reduction based on distance from threshold
                factor = max(0.0, 1.0 - (temp - thresholds.max_temperature) / window)
                reduction_factor = max(factor, thresholds.weather_reduction_factor)
            else:
                reduction_factor = 1.0

        # Check precipitation thresholds
        if thresholds.max_precipitation_prob is not None:
            prob = float(conditions["precip_probability"].max() or 0)
            if prob > thresholds.max_precipitation_prob:
                reduction_needed = True

        if thresholds.max_precipitation_mm is not None:
            amount = float(conditions["precip_mm"].max() or 0)
            if amount > thresholds.max_precipitation_mm:
                reduction_needed = True

        # Check condition flags
        row = conditions.row(0, named=True)
        if thresholds.reduce_on_freeze and row["freeze_flag"]:
            reduction_needed = True
        if thresholds.reduce_on_heatwave and row["heatwave_flag"]:
            reduction_needed = True
        if thresholds.reduce_on_snow and row["snow_event_flag"]:
            reduction_needed = True
        if thresholds.reduce_on_high_wind and row["high_wind_flag"]:
            reduction_needed = True
        if thresholds.reduce_on_high_uv and row["uv_alert_flag"]:
            reduction_needed = True

        if reduction_needed:
            factor = max(0.0, min(1.0, thresholds.weather_reduction_factor))
            modified_max = item.max_spend * factor
            modified_items.append(BudgetItem(
                id=item.id,
                name=item.name,
                min_spend=item.min_spend,
                max_spend=modified_max,
                current_spend=item.current_spend,
                expected_roas=item.expected_roas,
                roi_curve=item.roi_curve,
                hierarchy_path=item.hierarchy_path,
                inventory_status=item.inventory_status,
                inventory_multiplier=item.inventory_multiplier,
                platform_minimum=item.platform_minimum,
            ))
        else:
            modified_items.append(item)

    # Run optimization with weather-adjusted constraints
    modified_request = OptimizerRequest(
        total_budget=request.total_budget,
        items=modified_items,
        hierarchy_constraints=request.hierarchy_constraints,
        name=request.name,
        learning_cap=request.learning_cap,
        roas_floor=request.roas_floor,
    )

    return optimize_allocation(
        modified_request,
        solver=solver,
        relax_infeasible=relax_infeasible
    )