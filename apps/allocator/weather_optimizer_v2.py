"""Weather-aware budget allocation optimizer v2."""

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
    optimize_allocation,
)

# Weather-aware constraints using WeatherVane's weather categories:
#
# 1. Weather Sensitivity:
# - Reduce spend during adverse weather (freeze, heatwave, snow, high wind, etc.)
# - Increase spend during favorable weather conditions
# - Use weather anomaly data to adjust for seasonal patterns
#
# 2. Weather Flags:
# - freeze_flag: Temperature ≤ 0°C
# - heatwave_flag: Temperature ≥ 30°C
# - snow_event_flag: Snowfall > 0mm
# - high_wind_flag: Wind speed ≥ 50km/h
# - uv_alert_flag: UV index ≥ 7
# - high_precip_prob_flag: Precipitation probability ≥ 70%
#
# 3. Weather Metrics:
# - temp_c: Mean temperature in Celsius
# - precip_mm: Precipitation in millimeters
# - precip_probability: Probability of precipitation (0-1)
# - temp_anomaly: Deviation from historical average
# - precip_anomaly: Deviation from historical average


@dataclass(frozen=True)
class WeatherThresholds:
    """Weather conditions that affect budget allocation."""

    # Temperature thresholds (Celsius)
    min_temperature: float | None = None  # Reduce spend below this temp
    max_temperature: float | None = None  # Reduce spend above this temp

    # Precipitation thresholds
    max_precipitation_prob: float | None = None  # Reduce spend above this probability
    max_precipitation_mm: float | None = None  # Reduce spend above this amount

    # Condition flags
    reduce_on_freeze: bool = False  # Reduce spend during freeze events
    reduce_on_heatwave: bool = False  # Reduce spend during heatwaves
    reduce_on_snow: bool = False  # Reduce spend during snow events
    reduce_on_high_wind: bool = False  # Reduce spend during high wind
    reduce_on_high_uv: bool = False  # Reduce spend during high UV

    # Modifier for bad weather conditions (0 to 1)
    weather_reduction_factor: float = 0.5


@dataclass(frozen=True)
class WeatherAwareBudgetItem(BudgetItem):
    """Budget item with weather-based constraints."""

    weather_thresholds: WeatherThresholds = field(default_factory=WeatherThresholds)
    location_lat: float | None = None  # Required for weather lookups
    location_lon: float | None = None  # Required for weather lookups

    @property
    def has_weather_constraints(self) -> bool:
        """Check if item has any weather constraints configured."""
        if self.weather_thresholds.min_temperature is not None:
            return True
        if self.weather_thresholds.max_temperature is not None:
            return True
        if self.weather_thresholds.max_precipitation_prob is not None:
            return True
        if self.weather_thresholds.max_precipitation_mm is not None:
            return True
        if self.weather_thresholds.reduce_on_freeze:
            return True
        if self.weather_thresholds.reduce_on_heatwave:
            return True
        if self.weather_thresholds.reduce_on_snow:
            return True
        if self.weather_thresholds.reduce_on_high_wind:
            return True
        if self.weather_thresholds.reduce_on_high_uv:
            return True
        return False


@dataclass(frozen=True)
class WeatherAwareOptimizerRequest:
    """Optimization request with weather-aware budget items."""

    total_budget: float
    items: Sequence[WeatherAwareBudgetItem]
    forecast_date: date
    hierarchy_constraints: Sequence[HierarchyConstraint] = field(default_factory=tuple)
    name: str | None = None
    learning_cap: float | None = None
    roas_floor: float = 0.0


def weather_requires_reduction(
    weather_row: Mapping[str, Any],
    thresholds: WeatherThresholds,
) -> bool:
    """Check if weather conditions require spend reduction."""
    # Temperature thresholds
    if thresholds.min_temperature is not None:
        temp = float(weather_row.get("temp_c") or 0)
        if temp < thresholds.min_temperature:
            return True

    if thresholds.max_temperature is not None:
        temp = float(weather_row.get("temp_c") or 0)
        if temp > thresholds.max_temperature:
            return True

    # Precipitation thresholds
    if thresholds.max_precipitation_prob is not None:
        prob = float(weather_row.get("precip_probability") or 0)
        if prob > thresholds.max_precipitation_prob:
            return True

    if thresholds.max_precipitation_mm is not None:
        amount = float(weather_row.get("precip_mm") or 0)
        if amount > thresholds.max_precipitation_mm:
            return True

    # Weather flags
    if (thresholds.reduce_on_freeze and
        bool(weather_row.get("freeze_flag") or 0)):
        return True

    if (thresholds.reduce_on_heatwave and
        bool(weather_row.get("heatwave_flag") or 0)):
        return True

    if (thresholds.reduce_on_snow and
        bool(weather_row.get("snow_event_flag") or 0)):
        return True

    if (thresholds.reduce_on_high_wind and
        bool(weather_row.get("high_wind_flag") or 0)):
        return True

    if (thresholds.reduce_on_high_uv and
        bool(weather_row.get("uv_alert_flag") or 0)):
        return True

    return False


def convert_to_optimizer_request(request: WeatherAwareOptimizerRequest) -> OptimizerRequest:
    """Convert weather-aware request to standard request."""
    return OptimizerRequest(
        total_budget=request.total_budget,
        items=request.items,
        hierarchy_constraints=request.hierarchy_constraints,
        name=request.name,
        learning_cap=request.learning_cap,
        roas_floor=request.roas_floor,
    )

async def optimize_weather_aware_allocation(
    request: WeatherAwareOptimizerRequest,
    weather_cache: WeatherCache,
    *,
    solver: str | None = None,
    relax_infeasible: bool = True
) -> OptimizerResult:
    """Optimize budget allocation considering weather conditions."""

    # Extract items with location data and weather constraints
    weather_items = [
        item for item in request.items
        if (item.location_lat is not None and
            item.location_lon is not None and
            item.has_weather_constraints)
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

    # Create mapping for budget adjustments
    adjustments: Dict[str, float] = {}

    # First pass: determine adjustments needed
    for item in request.items:
        if not isinstance(item, WeatherAwareBudgetItem):
            continue

        if not item.has_weather_constraints:
            continue

        if item.location_lat is None or item.location_lon is None:
            continue

        weather = weather_by_loc.get((item.location_lat, item.location_lon))
        if weather is None or weather.is_empty():
            continue

        # Get weather conditions for the target date
        conditions = weather.filter(pl.col("date") == request.forecast_date.isoformat())
        if conditions.is_empty():
            continue

        thresholds = item.weather_thresholds
        weather_row = conditions.row(0, named=True)

        reduction_needed = weather_requires_reduction(weather_row, thresholds)

        if reduction_needed:
            # Apply reduction factor to max_spend
            factor = max(0.0, min(1.0, thresholds.weather_reduction_factor))
            adjustments[item.id] = factor

    # Second pass: create modified items with adjustments
    modified_items: list[BudgetItem] = []
    # First normalize max_spend values to total budget
    total_budget = request.total_budget
    total_max_spend = sum(item.max_spend for item in request.items)
    spend_scale = total_budget / total_max_spend

    # Calculate base budget allocation
    base_allocations: Dict[str, float] = {}
    for item in request.items:
        base_allocations[item.id] = item.max_spend * spend_scale

    # Apply weather-based reductions and calculate excess budget
    adjusted_spends: Dict[str, float] = {}
    total_adjusted = 0.0
    for item in request.items:
        if item.id in adjustments:
            # Apply weather reduction
            factor = adjustments[item.id]
            reduced_spend = base_allocations[item.id] * factor
            adjusted_spends[item.id] = reduced_spend
            total_adjusted += reduced_spend

    # Calculate remaining budget for non-reduced items
    remaining_budget = total_budget - total_adjusted
    non_reduced_items = [
        item for item in request.items
        if item.id not in adjustments
    ]

    # Allocate remaining budget proportionally to non-reduced items
    if non_reduced_items:
        non_reduced_base = sum(base_allocations[item.id] for item in non_reduced_items)
        for item in non_reduced_items:
            proportion = base_allocations[item.id] / non_reduced_base
            adjusted_spends[item.id] = remaining_budget * proportion

    # Ensure total matches budget exactly
    total = sum(adjusted_spends.values())
    if total > 0:
        scale = total_budget / total
        for item_id in adjusted_spends:
            adjusted_spends[item_id] *= scale

    # Set modified max_spend values from adjusted spends
    modified_max_spends = adjusted_spends

    # Build modified items list with adjusted max_spend values
    modified_items: list[BudgetItem] = []
    for item in request.items:
        modified_items.append(BudgetItem(
            id=item.id,
            name=item.name,
            min_spend=item.min_spend,
            max_spend=modified_max_spends[item.id],
            current_spend=item.current_spend,
            expected_roas=item.expected_roas,
            roi_curve=item.roi_curve,
            hierarchy_path=item.hierarchy_path,
            inventory_status=item.inventory_status,
            inventory_multiplier=item.inventory_multiplier,
            platform_minimum=item.platform_minimum,
        ))

    # Run optimization with weather-adjusted constraints
    if modified_items:
        modified_request = OptimizerRequest(
            total_budget=request.total_budget,
            items=modified_items,
            hierarchy_constraints=request.hierarchy_constraints,
            name=request.name,
            learning_cap=request.learning_cap,
            roas_floor=request.roas_floor,
        )
    else:
        modified_request = convert_to_optimizer_request(request)

    return optimize_allocation(
        modified_request,
        solver=solver,
        relax_infeasible=relax_infeasible
    )