"""Weather-responsive budget allocation constraints based on forecasts.

This module builds constraints that adjust channel budget boundaries based on
weather forecasts. Unlike weather_aware_allocation.py which applies current
weather multipliers, this module plans ahead using forecast data to reshape
allocation constraints across multiple time periods.

Key features:
1. Aggregates forecast data across time windows (daily, weekly, scenario)
2. Calculates forecast-based constraint multipliers per channel
3. Applies constraints to ChannelConstraint objects for planning
4. Tracks confidence levels and constraint uncertainty
5. Supports multi-period forecast scenarios
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, date
from typing import Dict, List, Tuple, Any
from enum import Enum

import numpy as np

from apps.allocator.marketing_mix import ChannelConstraint
from apps.allocator.weather_aware_allocation import (
    WeatherSensitivityCoefficient,
    WeatherMultiplierConfig,
    estimate_weather_sensitivity,
)
from apps.model.mmm import MMMModel

_LOGGER = logging.getLogger(__name__)


class ForecastAggregationPeriod(Enum):
    """Time period over which to aggregate forecast constraints."""

    DAILY = "daily"
    WEEKLY = "weekly"
    SCENARIO = "scenario"  # Aggregate across entire forecast window


@dataclass(frozen=True)
class WeatherForecast:
    """Single timestep of weather forecast data."""

    timestamp: datetime
    date: date
    features: Dict[str, float]  # e.g., {"temp_c": 22.5, "precip_mm": 2.0}
    confidence: float = 0.95  # 0-1 scale, higher = more confident


@dataclass(frozen=True)
class ForecastWindow:
    """Collection of weather forecasts over a time period."""

    start: datetime
    end: datetime
    forecasts: List[WeatherForecast]
    aggregation_period: ForecastAggregationPeriod = ForecastAggregationPeriod.SCENARIO
    description: str = ""

    def validate(self) -> None:
        """Validate forecast window consistency."""
        if not self.forecasts:
            raise ValueError("forecast window must contain at least one forecast")
        if self.start >= self.end:
            raise ValueError("forecast start must be before end")
        for forecast in self.forecasts:
            if not (self.start <= forecast.timestamp <= self.end):
                raise ValueError(f"forecast {forecast.timestamp} outside window [{self.start}, {self.end}]")


@dataclass(frozen=True)
class ConstraintMultiplier:
    """Forecast-derived constraint multiplier for a channel."""

    channel: str
    min_spend_multiplier: float  # Apply to channel.min_spend
    max_spend_multiplier: float  # Apply to channel.max_spend
    current_spend_multiplier: float  # Apply to channel.current_spend (for baseline)
    confidence: float  # 0-1, reflects forecast confidence
    reasoning: str  # Human-readable explanation
    forecast_features_used: Dict[str, float]  # Aggregated weather features


@dataclass(frozen=True)
class WeatherConstraintScenario:
    """Complete scenario for weather-responsive constraint application."""

    mmm_model: MMMModel
    channels: List[ChannelConstraint]
    forecast_window: ForecastWindow
    multiplier_config: WeatherMultiplierConfig = field(default_factory=WeatherMultiplierConfig)
    context_tags: List[str] = field(default_factory=list)

    def validate(self) -> None:
        """Validate scenario consistency."""
        if not self.channels:
            raise ValueError("scenario must include at least one channel")
        if self.multiplier_config.max_multiplier < self.multiplier_config.min_multiplier:
            raise ValueError("max_multiplier must be >= min_multiplier")
        self.forecast_window.validate()


@dataclass(frozen=True)
class ConstrainedChannelResult:
    """Result of applying weather constraints to a channel."""

    channel_name: str
    original_constraint: ChannelConstraint
    constrained_constraint: ChannelConstraint
    multiplier: ConstraintMultiplier


@dataclass(frozen=True)
class WeatherConstraintResult:
    """Result of applying weather forecast constraints to all channels."""

    constrained_channels: List[ConstraintMultiplier]
    adjusted_channels: List[ChannelConstraint]
    aggregate_forecast_features: Dict[str, float]
    period_multipliers: Dict[str, Dict[str, float]]  # By period: {"daily": {"channel": multiplier}}
    confidence_score: float  # 0-1, overall confidence
    diagnostics: Dict[str, Any]


def _aggregate_forecast_features(
    forecasts: List[WeatherForecast],
    aggregation_period: ForecastAggregationPeriod,
) -> Tuple[Dict[str, float], Dict[str, Dict[str, float]]]:
    """Aggregate weather forecast features across time periods.

    Args:
        forecasts: List of weather forecasts
        aggregation_period: How to aggregate (daily, weekly, scenario)

    Returns:
        Tuple of:
        - Aggregated features across entire forecast window
        - Period-specific features dict
    """
    if not forecasts:
        return {}, {}

    period_features: Dict[str, Dict[str, float]] = {}
    all_features: Dict[str, List[float]] = {}

    for forecast in forecasts:
        # Determine period key
        if aggregation_period == ForecastAggregationPeriod.DAILY:
            period_key = forecast.date.isoformat()
        elif aggregation_period == ForecastAggregationPeriod.WEEKLY:
            week_start = forecast.date - timedelta(days=forecast.date.weekday())
            period_key = f"week_{week_start.isoformat()}"
        else:  # SCENARIO
            period_key = "scenario"

        # Accumulate features by period
        if period_key not in period_features:
            period_features[period_key] = {}

        for feature_name, feature_value in forecast.features.items():
            if feature_name not in all_features:
                all_features[feature_name] = []
            all_features[feature_name].append(feature_value)

            if feature_name not in period_features[period_key]:
                period_features[period_key][feature_name] = 0.0
            period_features[period_key][feature_name] += feature_value / len(forecasts)

    # Aggregate across entire forecast window (mean values)
    aggregated = {
        feature: float(np.mean(values)) for feature, values in all_features.items()
    }

    return aggregated, period_features


def _calculate_constraint_multipliers(
    mmm_model: MMMModel,
    sensitivity_scores: Dict[str, WeatherSensitivityCoefficient],
    aggregated_features: Dict[str, float],
    period_features: Dict[str, Dict[str, float]],
    config: WeatherMultiplierConfig,
) -> Tuple[Dict[str, ConstraintMultiplier], Dict[str, Dict[str, float]]]:
    """Calculate forecast-based constraint multipliers for channels.

    Args:
        mmm_model: Trained MMM model
        sensitivity_scores: Weather sensitivity per channel
        aggregated_features: Aggregated forecast features
        period_features: Features per time period
        config: Multiplier configuration

    Returns:
        Tuple of:
        - Constraint multipliers per channel
        - Period-specific multipliers
    """
    constraint_multipliers: Dict[str, ConstraintMultiplier] = {}
    period_multipliers: Dict[str, Dict[str, float]] = {}

    # Calculate per-channel constraint multipliers
    for channel_name, sensitivity in sensitivity_scores.items():
        if not sensitivity.weather_features:
            # No weather sensitivity -> neutral multiplier
            multiplier = ConstraintMultiplier(
                channel=channel_name,
                min_spend_multiplier=1.0,
                max_spend_multiplier=1.0,
                current_spend_multiplier=1.0,
                confidence=1.0,
                reasoning="No weather sensitivity for this channel",
                forecast_features_used={},
            )
            constraint_multipliers[channel_name] = multiplier
            continue

        # Calculate weighted weather impact
        weather_impact = 0.0
        total_weight = 0.0
        features_used: Dict[str, float] = {}

        for feature_name, elasticity in sensitivity.weather_features.items():
            if feature_name in aggregated_features:
                feature_value = aggregated_features[feature_name]
                impact = elasticity * feature_value
                weather_impact += impact
                total_weight += abs(elasticity)
                features_used[feature_name] = feature_value

        if total_weight == 0:
            # No relevant weather features
            multiplier = ConstraintMultiplier(
                channel=channel_name,
                min_spend_multiplier=1.0,
                max_spend_multiplier=1.0,
                current_spend_multiplier=1.0,
                confidence=1.0,
                reasoning="No relevant weather features in forecast",
                forecast_features_used={},
            )
            constraint_multipliers[channel_name] = multiplier
            continue

        # Normalize impact and apply config constraints
        normalized_impact = (weather_impact / max(total_weight, 1.0)) * config.interaction_strength
        base_multiplier = 1.0 + normalized_impact

        # Apply bounds
        constrained_multiplier = max(
            config.min_multiplier, min(base_multiplier, config.max_multiplier)
        )

        # Asymmetric constraints: bounds can diverge based on impact direction
        # Negative impact (bad weather) -> reduce max_spend more than min_spend
        # Positive impact (good weather) -> increase max_spend more than min_spend
        if normalized_impact < 0:
            # Bad weather: tighter constraints
            min_mult = 0.85 * constrained_multiplier  # Allow some minimum
            max_mult = constrained_multiplier  # Cap at reduced level
        else:
            # Good weather: expand opportunity
            min_mult = constrained_multiplier  # Maintain baseline
            max_mult = 1.15 * constrained_multiplier  # Allow upside

        # Ensure bounds are within config limits
        min_mult = max(config.min_multiplier, min_mult)
        max_mult = min(config.max_multiplier, max_mult)

        reasoning = (
            f"Forecast impact: {normalized_impact:.3f} "
            f"(elasticity: {list(sensitivity.weather_features.values())}, "
            f"weather: {list(features_used.values())})"
        )

        multiplier = ConstraintMultiplier(
            channel=channel_name,
            min_spend_multiplier=min_mult,
            max_spend_multiplier=max_mult,
            current_spend_multiplier=constrained_multiplier,
            confidence=0.9,  # Forecast-based multipliers are slightly less confident
            reasoning=reasoning,
            forecast_features_used=features_used,
        )
        constraint_multipliers[channel_name] = multiplier

    # Calculate period-specific multipliers
    for period_key, period_feature_dict in period_features.items():
        period_multipliers[period_key] = {}
        for channel_name, sensitivity in sensitivity_scores.items():
            if not sensitivity.weather_features:
                period_multipliers[period_key][channel_name] = 1.0
                continue

            period_impact = 0.0
            total_weight = 0.0

            for feature_name, elasticity in sensitivity.weather_features.items():
                if feature_name in period_feature_dict:
                    feature_value = period_feature_dict[feature_name]
                    period_impact += elasticity * feature_value
                    total_weight += abs(elasticity)

            if total_weight == 0:
                period_multipliers[period_key][channel_name] = 1.0
                continue

            normalized_impact = (period_impact / max(total_weight, 1.0)) * config.interaction_strength
            period_mult = 1.0 + normalized_impact
            period_mult = max(config.min_multiplier, min(period_mult, config.max_multiplier))
            period_multipliers[period_key][channel_name] = period_mult

    return constraint_multipliers, period_multipliers


def build_weather_constraints(
    scenario: WeatherConstraintScenario,
) -> WeatherConstraintResult:
    """Build weather forecast-based budget constraints for allocation planning.

    This function:
    1. Aggregates forecast data across the time window
    2. Calculates weather impact on each channel
    3. Derives constraint multipliers (min/max spend bounds)
    4. Returns adjusted ChannelConstraint objects ready for allocation

    Args:
        scenario: WeatherConstraintScenario with all parameters

    Returns:
        WeatherConstraintResult with constrained channels and diagnostics
    """
    scenario.validate()

    # Estimate weather sensitivity
    sensitivity_scores = estimate_weather_sensitivity(
        scenario.mmm_model,
        [f for f in scenario.forecast_window.forecasts[0].features.keys()
         if f in scenario.mmm_model.elasticity],
    )

    # Aggregate forecast features
    aggregated_features, period_features = _aggregate_forecast_features(
        scenario.forecast_window.forecasts,
        scenario.forecast_window.aggregation_period,
    )

    # Calculate constraint multipliers
    constraint_multipliers, period_multipliers = _calculate_constraint_multipliers(
        scenario.mmm_model,
        sensitivity_scores,
        aggregated_features,
        period_features,
        scenario.multiplier_config,
    )

    # Apply multipliers to channels
    adjusted_channels: List[ChannelConstraint] = []
    for channel in scenario.channels:
        if channel.name not in constraint_multipliers:
            # Channel not in sensitivity analysis, pass through unchanged
            adjusted_channels.append(channel)
            continue

        multiplier_obj = constraint_multipliers[channel.name]

        # Apply multipliers to constraint bounds
        adjusted_channel = ChannelConstraint(
            name=channel.name,
            current_spend=channel.current_spend * multiplier_obj.current_spend_multiplier,
            min_spend=channel.min_spend * multiplier_obj.min_spend_multiplier,
            max_spend=channel.max_spend * multiplier_obj.max_spend_multiplier,
            weather_multiplier=multiplier_obj.current_spend_multiplier,
            elasticity_override=channel.elasticity_override,
            commentary=(
                f"Forecast-constrained: {multiplier_obj.reasoning} | "
                f"min: {multiplier_obj.min_spend_multiplier:.2%}, "
                f"max: {multiplier_obj.max_spend_multiplier:.2%}"
            ),
        )
        adjusted_channels.append(adjusted_channel)

    # Calculate overall confidence (minimum across all channels)
    confidence_scores = [m.confidence for m in constraint_multipliers.values()]
    overall_confidence = float(np.min(confidence_scores)) if confidence_scores else 0.9

    # Compile diagnostics
    diagnostics: Dict[str, Any] = {
        "forecast_start": scenario.forecast_window.start.isoformat(),
        "forecast_end": scenario.forecast_window.end.isoformat(),
        "forecast_count": len(scenario.forecast_window.forecasts),
        "aggregation_period": scenario.forecast_window.aggregation_period.value,
        "aggregated_features": aggregated_features,
        "period_features": period_features,
        "constraint_multipliers": {
            ch: {
                "min_spend_multiplier": float(m.min_spend_multiplier),
                "max_spend_multiplier": float(m.max_spend_multiplier),
                "current_spend_multiplier": float(m.current_spend_multiplier),
                "confidence": float(m.confidence),
                "reasoning": m.reasoning,
                "forecast_features_used": m.forecast_features_used,
            }
            for ch, m in constraint_multipliers.items()
        },
    }

    return WeatherConstraintResult(
        constrained_channels=list(constraint_multipliers.values()),
        adjusted_channels=adjusted_channels,
        aggregate_forecast_features=aggregated_features,
        period_multipliers=period_multipliers,
        confidence_score=overall_confidence,
        diagnostics=diagnostics,
    )


def apply_forecast_window_constraints(
    base_channels: List[ChannelConstraint],
    scenario: WeatherConstraintScenario,
) -> Dict[str, Any]:
    """Apply forecast window constraints to create time-segmented allocations.

    This is useful for multi-period planning where different periods may have
    different weather constraints.

    Args:
        base_channels: Base channel constraints
        scenario: WeatherConstraintScenario

    Returns:
        Dict with time-segmented constraint assignments
    """
    result = build_weather_constraints(scenario)

    # Create time segments if aggregation period is not scenario-wide
    time_segments: Dict[str, List[ChannelConstraint]] = {}

    if scenario.forecast_window.aggregation_period == ForecastAggregationPeriod.SCENARIO:
        # Single scenario-wide set of constraints
        time_segments["scenario"] = result.adjusted_channels
    else:
        # Build period-specific constraints
        for period_key in result.period_multipliers.keys():
            period_mults = result.period_multipliers[period_key]
            period_channels = []

            for channel in base_channels:
                mult = period_mults.get(channel.name, 1.0)
                adjusted = ChannelConstraint(
                    name=channel.name,
                    current_spend=channel.current_spend * mult,
                    min_spend=channel.min_spend * mult,
                    max_spend=channel.max_spend * mult,
                    weather_multiplier=mult,
                    elasticity_override=channel.elasticity_override,
                    commentary=f"Period {period_key} weather constraint: {mult:.2%}",
                )
                period_channels.append(adjusted)

            time_segments[period_key] = period_channels

    return {
        "time_segments": time_segments,
        "overall_constraints": result.adjusted_channels,
        "confidence": result.confidence_score,
        "diagnostics": result.diagnostics,
    }
