"""
Scenario analysis utilities shared between API and worker layers.

These helpers mirror the scenario-builder logic used in the web client so
back-end services can generate consistent summaries when persisting or
evaluating what-if mixes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Mapping

from shared.schemas.base import ConfidenceLevel, PlanResponse, PlanSlice


# Confidence scoring mirrors the TypeScript implementation to keep outputs
# consistent across front-end and back-end callers.
_CONFIDENCE_WEIGHT: dict[ConfidenceLevel, int] = {
    ConfidenceLevel.HIGH: 3,
    ConfidenceLevel.MEDIUM: 2,
    ConfidenceLevel.LOW: 1,
}

_CONFIDENCE_RISK_ADJUSTMENT: dict[ConfidenceLevel, float] = {
    ConfidenceLevel.HIGH: 0.05,
    ConfidenceLevel.MEDIUM: 0.15,
    ConfidenceLevel.LOW: 0.3,
}


@dataclass(slots=True)
class ScenarioChannelBaseline:
    channel: str
    spend: float
    revenue: float
    confidence: ConfidenceLevel
    base_roi: float | None


@dataclass(slots=True)
class ScenarioBaseline:
    channels: list[ScenarioChannelBaseline]
    total_spend: float
    total_revenue: float
    horizon_days: int


@dataclass(slots=True)
class ScenarioChannelOutcome:
    channel: str
    confidence: ConfidenceLevel
    base_spend: float
    base_revenue: float
    scenario_spend: float
    scenario_revenue: float
    delta_spend: float
    delta_revenue: float
    base_roi: float | None
    scenario_roi: float | None


@dataclass(slots=True)
class ScenarioOutcomeSummary:
    total_base_spend: float
    total_scenario_spend: float
    total_base_revenue: float
    total_scenario_revenue: float
    delta_spend: float
    delta_revenue: float
    base_roi: float | None
    scenario_roi: float | None
    weighted_confidence: ConfidenceLevel


@dataclass(slots=True)
class ScenarioOutcome:
    summary: ScenarioOutcomeSummary
    channels: list[ScenarioChannelOutcome]


def _normalise_confidence(value: ConfidenceLevel | None) -> ConfidenceLevel:
    if value is None:
        return ConfidenceLevel.MEDIUM
    if isinstance(value, ConfidenceLevel):
        return value
    # ConfidenceLevel is an enum, but callers might pass str values when
    # validated via pydantic; coerce cautiously.
    try:
        return ConfidenceLevel(value)
    except ValueError:  # pragma: no cover - defensive branch
        return ConfidenceLevel.MEDIUM


def _compute_roi(spend: float, revenue: float) -> float | None:
    if spend <= 0 or not float(spend):
        return None
    if not float(revenue):
        return None
    return revenue / spend


def _sum_slices(slices: Iterable[PlanSlice], attr: str) -> float:
    total = 0.0
    for slice_ in slices:
        value = getattr(slice_, attr)
        if isinstance(value, (int, float)):
            total += float(value)
        elif value is not None:
            # expected_revenue / expected_roas are PlanQuantiles with p10/p50/p90
            p50 = getattr(value, "p50", None)
            if isinstance(p50, (int, float)):
                total += float(p50)
    return total


def _compute_channel_confidence(slices: Iterable[PlanSlice]) -> ConfidenceLevel:
    worst_weight = None
    for slice_ in slices:
        weight = _CONFIDENCE_WEIGHT[_normalise_confidence(slice_.confidence)]
        if worst_weight is None or weight < worst_weight:
            worst_weight = weight
    if worst_weight is None:
        return ConfidenceLevel.MEDIUM
    for level, weight in _CONFIDENCE_WEIGHT.items():
        if weight == worst_weight:
            return level
    return ConfidenceLevel.MEDIUM


def build_scenario_baseline(plan: PlanResponse) -> ScenarioBaseline:
    """Aggregate plan slices into per-channel baselines."""

    channels: list[ScenarioChannelBaseline] = []
    slices_by_channel: dict[str, list[PlanSlice]] = {}

    for slice_ in plan.slices:
        channel = (slice_.channel or "Unassigned channel").strip()
        slices_by_channel.setdefault(channel, []).append(slice_)

    for channel, slices in slices_by_channel.items():
        spend = _sum_slices(slices, "recommended_spend")
        revenue = _sum_slices(slices, "expected_revenue")
        confidence = _compute_channel_confidence(slices)
        channels.append(
            ScenarioChannelBaseline(
                channel=channel,
                spend=spend,
                revenue=revenue,
                confidence=confidence,
                base_roi=_compute_roi(spend, revenue),
            )
        )

    channels.sort(key=lambda item: item.spend, reverse=True)

    total_spend = sum(channel.spend for channel in channels)
    total_revenue = sum(channel.revenue for channel in channels)

    return ScenarioBaseline(
        channels=channels,
        total_spend=total_spend,
        total_revenue=total_revenue,
        horizon_days=plan.horizon_days,
    )


def _clamp_multiplier(value: float) -> float:
    if not isinstance(value, (int, float)):
        return 1.0
    if value < 0:
        return 0.0
    return float(value)


def _derive_weighted_confidence(
    channels: Iterable[ScenarioChannelOutcome],
    total_scenario_spend: float,
) -> ConfidenceLevel:
    if total_scenario_spend <= 0:
        return ConfidenceLevel.MEDIUM

    weighted_score = 0.0
    for channel in channels:
        weight = channel.scenario_spend / total_scenario_spend
        weighted_score += weight * _CONFIDENCE_WEIGHT[channel.confidence]

    if weighted_score >= 2.5:
        return ConfidenceLevel.HIGH
    if weighted_score >= 1.75:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.LOW


def apply_scenario_adjustments(
    baseline: ScenarioBaseline,
    adjustments: Mapping[str, float],
) -> ScenarioOutcome:
    """Apply per-channel multipliers to the baseline and return outcome deltas."""

    channel_outcomes: list[ScenarioChannelOutcome] = []

    for channel in baseline.channels:
        multiplier = _clamp_multiplier(adjustments.get(channel.channel, 1.0))
        delta = multiplier - 1.0
        risk = _CONFIDENCE_RISK_ADJUSTMENT[channel.confidence]

        if delta >= 0:
            revenue_multiplier = 1.0 + delta * (1.0 - risk)
        else:
            revenue_multiplier = 1.0 + delta * (1.0 + risk)

        revenue_multiplier = max(revenue_multiplier, 0.0)

        scenario_spend = channel.spend * multiplier
        scenario_revenue = channel.revenue * revenue_multiplier

        channel_outcomes.append(
            ScenarioChannelOutcome(
                channel=channel.channel,
                confidence=channel.confidence,
                base_spend=channel.spend,
                base_revenue=channel.revenue,
                scenario_spend=scenario_spend,
                scenario_revenue=scenario_revenue,
                delta_spend=scenario_spend - channel.spend,
                delta_revenue=scenario_revenue - channel.revenue,
                base_roi=channel.base_roi,
                scenario_roi=_compute_roi(scenario_spend, scenario_revenue),
            )
        )

    total_base_spend = baseline.total_spend
    total_base_revenue = baseline.total_revenue
    total_scenario_spend = sum(channel.scenario_spend for channel in channel_outcomes)
    total_scenario_revenue = sum(channel.scenario_revenue for channel in channel_outcomes)

    summary = ScenarioOutcomeSummary(
        total_base_spend=total_base_spend,
        total_scenario_spend=total_scenario_spend,
        total_base_revenue=total_base_revenue,
        total_scenario_revenue=total_scenario_revenue,
        delta_spend=total_scenario_spend - total_base_spend,
        delta_revenue=total_scenario_revenue - total_base_revenue,
        base_roi=_compute_roi(total_base_spend, total_base_revenue),
        scenario_roi=_compute_roi(total_scenario_spend, total_scenario_revenue),
        weighted_confidence=_derive_weighted_confidence(
            channel_outcomes, total_scenario_spend
        ),
    )

    return ScenarioOutcome(summary=summary, channels=channel_outcomes)


__all__ = [
    "ScenarioBaseline",
    "ScenarioChannelBaseline",
    "ScenarioChannelOutcome",
    "ScenarioOutcome",
    "ScenarioOutcomeSummary",
    "apply_scenario_adjustments",
    "build_scenario_baseline",
]
