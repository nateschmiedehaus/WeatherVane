"""Weather-aware allocation model incorporating MMM elasticity and weather sensitivity.

This module builds on top of the MMM baseline to create allocation recommendations
that account for weather-driven demand elasticity. It:

1. Loads trained MMM models with weather elasticity estimates
2. Extracts weather sensitivity coefficients for each channel
3. Applies weather multipliers to elasticity estimates
4. Optimizes budget allocation based on weather-adjusted ROI curves
5. Validates results against baseline allocation performance
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, asdict, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import numpy as np

from apps.allocator.marketing_mix import (
    ChannelConstraint,
    MarketingMixScenario,
    solve_marketing_mix,
)
from apps.model.mmm import MMMModel

_LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class WeatherSensitivityCoefficient:
    """Weather sensitivity for a single channel."""

    channel: str
    base_elasticity: float
    weather_features: Dict[str, float]  # e.g., {"temp_c": 0.15, "precip_mm": -0.08}
    mean_weather_multiplier: float
    sensitivity_score: float  # 0-1 scale indicating how responsive to weather


@dataclass(frozen=True)
class WeatherConditions:
    """Current/forecasted weather state."""

    timestamp: datetime
    features: Dict[str, float]  # e.g., {"temp_c": 22.5, "precip_mm": 0.0, "temp_anomaly": -2.0}
    region: str = "global"


@dataclass(frozen=True)
class WeatherMultiplierConfig:
    """Configuration for weather multiplier calculation."""

    min_multiplier: float = 0.7  # Don't reduce spend below 70%
    max_multiplier: float = 1.3  # Don't increase spend above 130%
    interaction_strength: float = 0.5  # How strongly weather influences allocation (0-1)
    base_roas_adjustment: float = 0.1  # Adjust base ROAS by this factor per unit weather sensitivity


@dataclass(frozen=True)
class WeatherAwareAllocationRequest:
    """Request for weather-aware allocation."""

    mmm_model: MMMModel
    channels: List[ChannelConstraint]
    total_budget: float
    weather: WeatherConditions
    config: WeatherMultiplierConfig = field(default_factory=WeatherMultiplierConfig)
    roas_floor: float = 1.0
    learning_cap: float = 0.30
    risk_aversion: float = 0.25
    context_tags: List[str] = field(default_factory=list)


@dataclass(frozen=True)
class WeatherAwareAllocationResult:
    """Result of weather-aware allocation."""

    allocation_spends: Dict[str, float]
    weather_multipliers: Dict[str, float]
    total_revenue: float
    profit: float
    weather_sensitivity_scores: Dict[str, WeatherSensitivityCoefficient]
    baseline_allocation_spends: Dict[str, float]  # For comparison
    diagnostics: Dict[str, Any]


def estimate_weather_sensitivity(
    mmm_model: MMMModel,
    weather_features: List[str],
) -> Dict[str, WeatherSensitivityCoefficient]:
    """Estimate weather sensitivity for each channel in MMM model.

    Args:
        mmm_model: Trained MMM model with elasticity and weather_elasticity estimates
        weather_features: List of weather feature names to consider

    Returns:
        Dict mapping channel names to WeatherSensitivityCoefficient objects
    """
    sensitivity_map: Dict[str, WeatherSensitivityCoefficient] = {}

    # Get channel elasticities from MMM
    channel_elasticities = {
        feature: elasticity
        for feature, elasticity in mmm_model.elasticity.items()
        if feature in mmm_model.features and "spend" in feature.lower()
    }

    # Weather elasticity interactions (from MMM training)
    weather_elasticities = mmm_model.elasticity  # This includes weather_elasticity estimates

    for channel, base_elasticity in channel_elasticities.items():
        # Extract weather sensitivities for this channel
        weather_sensitivities = {}
        for weather_feature in weather_features:
            if weather_feature in weather_elasticities:
                # Get elasticity estimate for weather-channel interaction
                elasticity = weather_elasticities.get(weather_feature, 0.0)
                weather_sensitivities[weather_feature] = elasticity

        # Calculate mean weather multiplier (average impact of weather)
        if weather_sensitivities:
            mean_multiplier = float(np.mean(list(weather_sensitivities.values())))
        else:
            mean_multiplier = 0.0

        # Sensitivity score: how strongly this channel is affected by weather (0-1)
        sensitivity_score = min(1.0, abs(mean_multiplier) * 2)  # Normalize to 0-1

        sensitivity_map[channel] = WeatherSensitivityCoefficient(
            channel=channel,
            base_elasticity=base_elasticity,
            weather_features=weather_sensitivities,
            mean_weather_multiplier=mean_multiplier,
            sensitivity_score=sensitivity_score,
        )

    return sensitivity_map


def calculate_weather_multiplier(
    weather: WeatherConditions,
    sensitivity: WeatherSensitivityCoefficient,
    config: WeatherMultiplierConfig,
) -> float:
    """Calculate weather multiplier for a channel.

    Args:
        weather: Current/forecasted weather conditions
        sensitivity: Weather sensitivity coefficient for the channel
        config: Configuration for multiplier calculation

    Returns:
        Weather multiplier (typically 0.7-1.3)
    """
    if not sensitivity.weather_features:
        return 1.0  # No weather sensitivity

    # Calculate weighted sum of weather feature impacts
    weather_impact = 0.0
    total_weight = 0.0

    for feature_name, elasticity in sensitivity.weather_features.items():
        if feature_name in weather.features:
            feature_value = weather.features[feature_name]
            # Normalize feature value (assume standard deviation ~= 1 for anomalies)
            impact = elasticity * feature_value
            weather_impact += impact
            total_weight += abs(elasticity)

    if total_weight == 0:
        return 1.0

    # Apply interaction strength configuration
    normalized_impact = (weather_impact / max(total_weight, 1.0)) * config.interaction_strength

    # Convert impact to multiplier (1.0 = no change)
    multiplier = 1.0 + normalized_impact

    # Clamp to configured bounds
    multiplier = max(config.min_multiplier, min(multiplier, config.max_multiplier))

    return multiplier


def allocate_with_weather(
    request: WeatherAwareAllocationRequest,
) -> WeatherAwareAllocationResult:
    """Perform weather-aware budget allocation.

    Args:
        request: WeatherAwareAllocationRequest with all parameters

    Returns:
        WeatherAwareAllocationResult with allocation and diagnostics
    """
    # Estimate weather sensitivity for all channels
    sensitivity_scores = estimate_weather_sensitivity(
        request.mmm_model,
        [f for f in request.weather.features.keys() if f in request.mmm_model.elasticity],
    )

    # Calculate weather multipliers for each channel
    weather_multipliers: Dict[str, float] = {}
    adjusted_channels: List[ChannelConstraint] = []

    for channel in request.channels:
        if channel.name in sensitivity_scores:
            multiplier = calculate_weather_multiplier(
                request.weather,
                sensitivity_scores[channel.name],
                request.config,
            )
            weather_multipliers[channel.name] = multiplier
        else:
            multiplier = 1.0

        # Apply multiplier to channel constraints
        adjusted_channel = ChannelConstraint(
            name=channel.name,
            current_spend=channel.current_spend * multiplier,
            min_spend=channel.min_spend * multiplier,
            max_spend=channel.max_spend * multiplier,
            weather_multiplier=multiplier,
            elasticity_override=channel.elasticity_override,
            commentary=f"Weather-adjusted by {multiplier:.2%}",
        )
        adjusted_channels.append(adjusted_channel)

    # Create baseline allocation (without weather adjustment)
    baseline_request = MarketingMixScenario(
        mmm_model=request.mmm_model,
        channels=request.channels,
        total_budget=request.total_budget,
        roas_floor=request.roas_floor,
        learning_cap=request.learning_cap,
        risk_aversion=request.risk_aversion,
        context_tags=list(request.context_tags) + ["baseline"],
    )
    baseline_result = solve_marketing_mix(baseline_request)

    # Create weather-aware allocation
    weather_request = MarketingMixScenario(
        mmm_model=request.mmm_model,
        channels=adjusted_channels,
        total_budget=request.total_budget,
        roas_floor=request.roas_floor,
        learning_cap=request.learning_cap,
        risk_aversion=request.risk_aversion,
        context_tags=list(request.context_tags) + ["weather-aware"],
    )
    weather_result = solve_marketing_mix(weather_request)

    # Compile diagnostics
    diagnostics: Dict[str, Any] = {
        "weather_timestamp": request.weather.timestamp.isoformat(),
        "weather_region": request.weather.region,
        "weather_features": request.weather.features,
        "sensitivity_scores": {
            ch: {
                "base_elasticity": s.base_elasticity,
                "mean_weather_multiplier": s.mean_weather_multiplier,
                "sensitivity_score": s.sensitivity_score,
            }
            for ch, s in sensitivity_scores.items()
        },
        "multiplier_config": asdict(request.config),
        "baseline_revenue": baseline_result.total_revenue,
        "baseline_profit": baseline_result.profit,
        "revenue_lift_pct": (
            (weather_result.total_revenue - baseline_result.total_revenue)
            / max(baseline_result.total_revenue, 1.0)
            * 100.0
        ),
    }

    return WeatherAwareAllocationResult(
        allocation_spends=weather_result.allocation.spends,
        weather_multipliers=weather_multipliers,
        total_revenue=weather_result.total_revenue,
        profit=weather_result.profit,
        weather_sensitivity_scores=sensitivity_scores,
        baseline_allocation_spends=baseline_result.allocation.spends,
        diagnostics=diagnostics,
    )


def save_allocation_result(
    result: WeatherAwareAllocationResult,
    output_path: Path,
) -> None:
    """Save weather-aware allocation result to JSON file.

    Args:
        result: WeatherAwareAllocationResult to persist
        output_path: Path to save JSON file
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Convert to serializable dict
    output_data = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "allocation_spends": result.allocation_spends,
        "weather_multipliers": result.weather_multipliers,
        "total_revenue": float(result.total_revenue),
        "profit": float(result.profit),
        "baseline_allocation_spends": result.baseline_allocation_spends,
        "weather_sensitivity_scores": {
            ch: {
                "channel": s.channel,
                "base_elasticity": float(s.base_elasticity),
                "weather_features": {k: float(v) for k, v in s.weather_features.items()},
                "mean_weather_multiplier": float(s.mean_weather_multiplier),
                "sensitivity_score": float(s.sensitivity_score),
            }
            for ch, s in result.weather_sensitivity_scores.items()
        },
        "diagnostics": result.diagnostics,
    }

    output_path.write_text(json.dumps(output_data, indent=2, sort_keys=True))
    _LOGGER.info("Saved weather-aware allocation result to %s", output_path)


def load_allocation_result(
    input_path: Path,
) -> WeatherAwareAllocationResult:
    """Load weather-aware allocation result from JSON file.

    Args:
        input_path: Path to JSON file

    Returns:
        WeatherAwareAllocationResult deserialized from file
    """
    data = json.loads(input_path.read_text())

    sensitivity_scores = {
        ch: WeatherSensitivityCoefficient(
            channel=s["channel"],
            base_elasticity=s["base_elasticity"],
            weather_features=s["weather_features"],
            mean_weather_multiplier=s["mean_weather_multiplier"],
            sensitivity_score=s["sensitivity_score"],
        )
        for ch, s in data["weather_sensitivity_scores"].items()
    }

    return WeatherAwareAllocationResult(
        allocation_spends=data["allocation_spends"],
        weather_multipliers=data["weather_multipliers"],
        total_revenue=data["total_revenue"],
        profit=data["profit"],
        weather_sensitivity_scores=sensitivity_scores,
        baseline_allocation_spends=data["baseline_allocation_spends"],
        diagnostics=data["diagnostics"],
    )
