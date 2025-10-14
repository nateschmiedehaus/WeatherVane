"""Weather-aware marketing mix budget solver.

This module bridges the MMM model outputs with the allocator so we can
recommend cross-channel budgets that respond to upcoming weather signals.
It converts media mix elasticity estimates into ROI curves, injects
weather multipliers, and relies on the existing allocator heuristics to
solve the constrained optimisation problem.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Mapping, Sequence, Tuple

import math

from apps.allocator.heuristics import (
    AllocationInput,
    AllocationResult,
    Guardrails,
    allocate,
)
from apps.model.mmm import MMMModel


@dataclass(frozen=True)
class ChannelConstraint:
    """Channel-level parameters describing current and permitted spend."""

    name: str
    current_spend: float
    min_spend: float
    max_spend: float
    weather_multiplier: float = 1.0
    elasticity_override: float | None = None
    commentary: str | None = None

    def validate(self) -> None:
        if not self.name:
            raise ValueError("channel name must be provided")
        if self.min_spend < 0.0:
            raise ValueError(f"min_spend must be non-negative for '{self.name}'")
        if self.max_spend < self.min_spend:
            raise ValueError(f"max_spend must be >= min_spend for '{self.name}'")
        if self.weather_multiplier < 0.0:
            raise ValueError(f"weather_multiplier must be non-negative for '{self.name}'")
        if self.current_spend < 0.0:
            raise ValueError(f"current_spend must be non-negative for '{self.name}'")


@dataclass(frozen=True)
class MarketingMixScenario:
    """Inputs required to solve the marketing mix allocation problem."""

    mmm_model: MMMModel
    channels: Sequence[ChannelConstraint]
    total_budget: float
    roas_floor: float = 1.0
    learning_cap: float = 0.30
    risk_aversion: float = 0.25
    quantile_factors: Mapping[str, float] = field(
        default_factory=lambda: {"p10": 0.85, "p50": 1.0, "p90": 1.2}
    )
    context_tags: Sequence[str] = ()

    def validate(self) -> None:
        if self.total_budget <= 0.0:
            raise ValueError("total_budget must be positive")
        if not self.channels:
            raise ValueError("scenario must include at least one channel")
        for channel in self.channels:
            channel.validate()


@dataclass(frozen=True)
class ChannelRecommendation:
    """Final recommendation per channel."""

    name: str
    recommended_spend: float
    average_roas: float
    marginal_roas: float
    expected_revenue: float
    weather_multiplier: float
    commentary: str | None


@dataclass(frozen=True)
class MarketingMixResult:
    allocation: AllocationResult
    recommendations: Dict[str, ChannelRecommendation]
    total_revenue: float
    profit: float
    diagnostics: Dict[str, object]


def _spend_grid(min_spend: float, max_spend: float, *, current: float) -> List[float]:
    minimum = max(min_spend, 0.0)
    maximum = max(max_spend, minimum)
    if math.isclose(minimum, maximum, rel_tol=1e-9, abs_tol=1e-9):
        return [round(minimum, 4)]

    baseline = max(minimum, min(current, maximum))
    spread = maximum - minimum
    pivots = {
        0.0,
        minimum,
        maximum,
        baseline,
        minimum + 0.25 * spread,
        minimum + 0.5 * spread,
        minimum + 0.75 * spread,
    }
    cleaned = sorted(round(value, 4) for value in pivots if value >= 0.0)
    deduped: List[float] = []
    for value in cleaned:
        if not deduped or not math.isclose(value, deduped[-1], abs_tol=1e-6):
            deduped.append(value)
    return deduped


def _channel_roas(
    model: MMMModel,
    channel: ChannelConstraint,
    spend: float,
) -> float:
    weather_multiplier = channel.weather_multiplier if channel.weather_multiplier > 0 else 0.0
    elasticity_override = channel.elasticity_override
    if elasticity_override is not None and channel.name in model.mean_spend:
        mean = model.mean_spend.get(channel.name, 0.0)
        base = model.mean_roas.get(channel.name, model.base_roas)
        if mean <= 0.0:
            roas = base
        else:
            ratio = (spend - mean) / max(mean, 1e-6)
            roas = base + elasticity_override * ratio
    else:
        roas = model.roas_for(channel.name, spend)
    adjusted = max(roas, 0.0) * weather_multiplier
    return adjusted


def _build_roi_curve(
    model: MMMModel,
    channel: ChannelConstraint,
) -> List[Dict[str, float]]:
    grid = _spend_grid(channel.min_spend, channel.max_spend, current=channel.current_spend)
    curve: List[Dict[str, float]] = []
    for spend in grid:
        roas = _channel_roas(model, channel, spend)
        revenue = roas * spend
        curve.append({"spend": float(spend), "revenue": float(revenue)})
    return curve


def _expected_roas(
    model: MMMModel,
    channel: ChannelConstraint,
) -> float:
    probe_spend = max(channel.current_spend, channel.min_spend, 1e-3)
    return _channel_roas(model, channel, probe_spend)


def _build_allocation_input(
    scenario: MarketingMixScenario,
) -> Tuple[AllocationInput, Dict[str, ChannelConstraint]]:
    scenario.validate()

    cells: List[str] = []
    expected_roas: Dict[str, float] = {}
    roi_curves: Dict[str, List[Dict[str, float]]] = {}
    current_spend: Dict[str, float] = {}
    min_by_cell: Dict[str, float] = {}
    max_by_cell: Dict[str, float] = {}

    for channel in scenario.channels:
        cell_id = channel.name
        cells.append(cell_id)
        roi_curves[cell_id] = _build_roi_curve(scenario.mmm_model, channel)
        expected_roas[cell_id] = _expected_roas(scenario.mmm_model, channel)
        current_spend[cell_id] = float(channel.current_spend)
        min_by_cell[cell_id] = float(max(channel.min_spend, 0.0))
        max_by_cell[cell_id] = float(max(channel.max_spend, channel.min_spend))

    guardrails = Guardrails(
        min_spend=min(min_by_cell.values()) if min_by_cell else 0.0,
        max_spend=max(max_by_cell.values()) if max_by_cell else scenario.total_budget,
        roas_floor=scenario.roas_floor,
        learning_cap=scenario.learning_cap,
        min_spend_by_cell=min_by_cell,
        max_spend_by_cell=max_by_cell,
    )

    tags = ["marketing_mix"]
    tags.extend(scenario.context_tags)
    if scenario.roas_floor > 0:
        tags.append("roas_floor")
    tags.append("weather_adjusted")

    allocation_input = AllocationInput(
        cells=cells,
        total_budget=scenario.total_budget,
        current_spend=current_spend,
        expected_roas=expected_roas,
        roi_curves=roi_curves,
        guardrails=guardrails,
        context_tags=tags,
        quantile_factors=dict(scenario.quantile_factors),
        risk_aversion=scenario.risk_aversion,
    )
    return allocation_input, {channel.name: channel for channel in scenario.channels}


def _marginal_roas(
    model: MMMModel,
    channel: ChannelConstraint,
    spend: float,
) -> float:
    epsilon = max(spend * 0.05, 1.0)
    base_revenue = _channel_roas(model, channel, spend) * spend
    bumped_revenue = _channel_roas(model, channel, spend + epsilon) * (spend + epsilon)
    delta_spend = epsilon
    marginal = (bumped_revenue - base_revenue) / delta_spend if delta_spend > 0 else base_revenue
    return float(max(marginal, 0.0))


def _summarise_allocation(
    allocation: AllocationResult,
    scenario: MarketingMixScenario,
    channel_lookup: Mapping[str, ChannelConstraint],
) -> Tuple[Dict[str, ChannelRecommendation], float, float]:
    recommendations: Dict[str, ChannelRecommendation] = {}
    total_revenue = 0.0
    total_spend = sum(allocation.spends.values())

    for name, spend in allocation.spends.items():
        channel = channel_lookup[name]
        roas = _channel_roas(scenario.mmm_model, channel, spend)
        revenue = roas * spend
        total_revenue += revenue
        marginal_roas = _marginal_roas(scenario.mmm_model, channel, spend)
        recommendations[name] = ChannelRecommendation(
            name=name,
            recommended_spend=float(spend),
            average_roas=float(roas),
            marginal_roas=float(marginal_roas),
            expected_revenue=float(revenue),
            weather_multiplier=float(channel.weather_multiplier),
            commentary=channel.commentary,
        )

    profit = total_revenue - total_spend
    return recommendations, float(total_revenue), float(profit)


def solve_marketing_mix(
    scenario: MarketingMixScenario,
    *,
    seed: int = 17,
) -> MarketingMixResult:
    """Solve for weather-aware marketing mix budgets."""

    allocation_input, channel_lookup = _build_allocation_input(scenario)
    allocation = allocate(allocation_input, seed=seed)
    recommendations, total_revenue, profit = _summarise_allocation(
        allocation, scenario, channel_lookup
    )
    diagnostics = dict(allocation.diagnostics)
    diagnostics.setdefault("roas_floor", scenario.roas_floor)
    diagnostics.setdefault(
        "weather_multipliers",
        {name: channel_lookup[name].weather_multiplier for name in allocation.spends},
    )
    diagnostics.setdefault("mmm_features", list(scenario.mmm_model.features))
    diagnostics.setdefault("allocation_total_budget", scenario.total_budget)
    return MarketingMixResult(
        allocation=allocation,
        recommendations=recommendations,
        total_revenue=total_revenue,
        profit=profit,
        diagnostics=diagnostics,
    )


__all__ = [
    "ChannelConstraint",
    "ChannelRecommendation",
    "MarketingMixScenario",
    "MarketingMixResult",
    "solve_marketing_mix",
]
