"""Weather-aware marketing mix budget solver.

This module bridges the MMM model outputs with the allocator so we can
recommend cross-channel budgets that respond to upcoming weather signals.
It converts media mix elasticity estimates into ROI curves, injects
weather multipliers, and routes the optimisation through the cvxpy-based
constraint-aware allocator.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Mapping, Sequence, Tuple

import math

from apps.allocator.heuristics import AllocationInput, AllocationResult, Guardrails, allocate
from apps.allocator.optimizer import (
    BudgetItem,
    HierarchyConstraint,
    OptimizationError,
    OptimizerRequest,
    OptimizerResult,
    _clean_roi_curve,
    _evaluate_roi_from_cleaned,
    optimize_allocation,
)
from apps.model.mmm import MMMModel


@dataclass(frozen=True)
class _AllocationComponents:
    cells: List[str]
    expected_roas: Dict[str, float]
    roi_curves: Dict[str, List[Dict[str, float]]]
    current_spend: Dict[str, float]
    min_by_cell: Dict[str, float]
    max_by_cell: Dict[str, float]
    cleaned_roi_curves: Dict[str, List[Tuple[float, float]]]
    precomputed_roi_lookup: Dict[str, Tuple[Tuple[float, ...], Tuple[float, ...]]]


@dataclass(frozen=True)
class PreparedMarketingMix:
    """Pre-computed channel artefacts for reuse across solver invocations."""

    components: _AllocationComponents
    channel_lookup: Dict[str, ChannelConstraint]


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


def _build_allocation_components(
    model: MMMModel,
    channels: Sequence[ChannelConstraint],
) -> _AllocationComponents:
    cells: List[str] = []
    expected_roas: Dict[str, float] = {}
    roi_curves: Dict[str, List[Dict[str, float]]] = {}
    current_spend: Dict[str, float] = {}
    min_by_cell: Dict[str, float] = {}
    max_by_cell: Dict[str, float] = {}
    cleaned_roi_curves: Dict[str, List[Tuple[float, float]]] = {}
    precomputed_roi_lookup: Dict[str, Tuple[Tuple[float, ...], Tuple[float, ...]]] = {}

    for channel in channels:
        cell_id = channel.name
        cells.append(cell_id)
        curve = _build_roi_curve(model, channel)
        roi_curves[cell_id] = curve
        cleaned_roi_curves[cell_id] = _clean_roi_curve(curve)
        cleaned = cleaned_roi_curves[cell_id]
        if cleaned:
            spends, revenues = zip(*cleaned)
            precomputed_roi_lookup[cell_id] = (tuple(float(s) for s in spends), tuple(float(r) for r in revenues))
        expected_roas[cell_id] = _expected_roas(model, channel)
        current_spend[cell_id] = float(channel.current_spend)
        min_by_cell[cell_id] = float(max(channel.min_spend, 0.0))
        max_by_cell[cell_id] = float(max(channel.max_spend, channel.min_spend))

    return _AllocationComponents(
        cells=cells,
        expected_roas=expected_roas,
        roi_curves=roi_curves,
        current_spend=current_spend,
        min_by_cell=min_by_cell,
        max_by_cell=max_by_cell,
        cleaned_roi_curves=cleaned_roi_curves,
        precomputed_roi_lookup=precomputed_roi_lookup,
    )


def prepare_marketing_mix(scenario: MarketingMixScenario) -> PreparedMarketingMix:
    """Pre-compute channel artefacts for re-use across marketing-mix solves."""

    scenario.validate()
    components = _build_allocation_components(scenario.mmm_model, scenario.channels)
    channel_lookup = {channel.name: channel for channel in scenario.channels}
    return PreparedMarketingMix(components=components, channel_lookup=channel_lookup)


def _build_allocation_input(
    scenario: MarketingMixScenario,
    *,
    components: _AllocationComponents | None = None,
    channel_lookup: Dict[str, ChannelConstraint] | None = None,
) -> Tuple[AllocationInput, Dict[str, ChannelConstraint]]:
    scenario.validate()
    if components is None:
        components = _build_allocation_components(scenario.mmm_model, scenario.channels)
    if channel_lookup is None:
        channel_lookup = {channel.name: channel for channel in scenario.channels}

    min_spend = min(components.min_by_cell.values()) if components.min_by_cell else 0.0
    max_spend = max(components.max_by_cell.values()) if components.max_by_cell else scenario.total_budget
    guardrails = Guardrails(
        min_spend=min_spend,
        max_spend=max_spend,
        roas_floor=scenario.roas_floor,
        learning_cap=scenario.learning_cap,
        min_spend_by_cell=dict(components.min_by_cell),
        max_spend_by_cell=dict(components.max_by_cell),
    )

    tags = ["marketing_mix", *scenario.context_tags]
    if scenario.roas_floor > 0:
        tags.append("roas_floor")
    tags.append("weather_adjusted")

    allocation_input = AllocationInput(
        cells=list(components.cells),
        total_budget=scenario.total_budget,
        current_spend=dict(components.current_spend),
        expected_roas=dict(components.expected_roas),
        roi_curves={name: [dict(point) for point in curve] for name, curve in components.roi_curves.items()},
        precomputed_roi_lookup={
            name: (tuple(spends), tuple(revenues))
            for name, (spends, revenues) in components.precomputed_roi_lookup.items()
        },
        guardrails=guardrails,
        context_tags=tags,
        quantile_factors=dict(scenario.quantile_factors),
        risk_aversion=scenario.risk_aversion,
    )
    return allocation_input, channel_lookup


def _build_optimizer_request(
    scenario: MarketingMixScenario,
    *,
    components: _AllocationComponents,
    channel_lookup: Mapping[str, ChannelConstraint],
) -> OptimizerRequest:
    members: List[str] = []
    items: List[BudgetItem] = []

    for cell in components.cells:
        channel = channel_lookup[cell]
        platform_minimum = float(channel.min_spend) if channel.min_spend > 0 else 0.0
        items.append(
            BudgetItem(
                id=cell,
                name=channel.name,
                min_spend=float(components.min_by_cell.get(cell, 0.0)),
                max_spend=float(components.max_by_cell.get(cell, scenario.total_budget)),
                current_spend=float(components.current_spend.get(cell, channel.current_spend)),
                expected_roas=float(components.expected_roas.get(cell, scenario.mmm_model.base_roas)),
                roi_curve=[dict(point) for point in components.roi_curves.get(cell, [])],
                hierarchy_path={"channel": channel.name},
                platform_minimum=platform_minimum,
            )
        )
        members.append(cell)

    hierarchy_constraints = [
        HierarchyConstraint(
            id="total_budget",
            members=members,
            min_spend=scenario.total_budget,
            max_spend=scenario.total_budget,
        )
    ]

    return OptimizerRequest(
        total_budget=scenario.total_budget,
        items=items,
        hierarchy_constraints=hierarchy_constraints,
        name="marketing_mix",
        learning_cap=scenario.learning_cap,
        roas_floor=scenario.roas_floor,
    )


def _allocation_from_optimizer(result: OptimizerResult) -> AllocationResult:
    diagnostics = dict(result.diagnostics)
    diagnostics.setdefault("optimizer", "cvxpy")
    diagnostics.setdefault("optimizer_winner", "cvxpy")
    diagnostics.setdefault("success", 1.0)
    diagnostics.setdefault("total_revenue", result.total_revenue)
    diagnostics.setdefault("optimizer_candidates", [{"optimizer": "cvxpy", "profit": result.profit, "success": 1.0}])
    return AllocationResult(
        spends=dict(result.spends),
        profit=float(result.profit),
        diagnostics=diagnostics,
    )


def _marginal_roas(
    spend: float,
    cleaned_curve: Sequence[Tuple[float, float]] | None,
    expected_roas: float,
) -> float:
    epsilon = max(spend * 0.05, 1.0)
    base_revenue = _evaluate_roi_from_cleaned(cleaned_curve or (), spend, expected_roas)
    bumped_revenue = _evaluate_roi_from_cleaned(cleaned_curve or (), spend + epsilon, expected_roas)
    delta_spend = epsilon if epsilon > 0 else 1.0
    marginal = (bumped_revenue - base_revenue) / delta_spend if delta_spend > 0 else base_revenue
    return float(max(marginal, 0.0))


def _summarise_allocation(
    allocation: AllocationResult,
    scenario: MarketingMixScenario,
    channel_lookup: Mapping[str, ChannelConstraint],
    components: _AllocationComponents,
) -> Tuple[Dict[str, ChannelRecommendation], float, float]:
    recommendations: Dict[str, ChannelRecommendation] = {}
    total_revenue = 0.0
    total_spend = sum(allocation.spends.values())

    for name, spend in allocation.spends.items():
        channel = channel_lookup[name]
        cleaned_curve = components.cleaned_roi_curves.get(name)
        expected_roas = components.expected_roas.get(name, scenario.mmm_model.base_roas)
        revenue = _evaluate_roi_from_cleaned(cleaned_curve or (), spend, expected_roas)
        if spend > 0:
            roas = revenue / spend
        else:
            roas = expected_roas
        total_revenue += revenue
        marginal_roas = _marginal_roas(spend, cleaned_curve, expected_roas)
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
    prepared: PreparedMarketingMix | None = None,
) -> MarketingMixResult:
    """Solve for weather-aware marketing mix budgets."""

    components = prepared.components if prepared else _build_allocation_components(scenario.mmm_model, scenario.channels)
    channel_lookup = prepared.channel_lookup if prepared else {channel.name: channel for channel in scenario.channels}
    allocation_input, channel_lookup = _build_allocation_input(
        scenario,
        components=components,
        channel_lookup=dict(channel_lookup),
    )

    optimizer_request = _build_optimizer_request(
        scenario,
        components=components,
        channel_lookup=channel_lookup,
    )

    try:
        optimized = optimize_allocation(optimizer_request)
        allocation = _allocation_from_optimizer(optimized)
    except OptimizationError as exc:
        allocation = allocate(allocation_input, seed=seed)
        allocation.diagnostics.setdefault("optimizer", "heuristic_fallback")
        allocation.diagnostics["optimizer_failure"] = str(exc)

    recommendations, total_revenue, profit = _summarise_allocation(
        allocation, scenario, channel_lookup, components
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
    "PreparedMarketingMix",
    "prepare_marketing_mix",
    "solve_marketing_mix",
]
