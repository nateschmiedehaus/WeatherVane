from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from statistics import mean
from typing import Iterable, Sequence

from shared.schemas.base import (
    ConfidenceLevel,
    PlanResponse,
    PlanSlice,
    ScenarioRecommendation,
    ScenarioRecommendationAdjustment,
    ScenarioRecommendationResponse,
)

from .plan_service import PlanService


CONFIDENCE_WEIGHTS: dict[ConfidenceLevel, float] = {
    ConfidenceLevel.HIGH: 1.0,
    ConfidenceLevel.MEDIUM: 0.6,
    ConfidenceLevel.LOW: 0.3,
}


def _confidence_label(value: ConfidenceLevel) -> str:
    if value is ConfidenceLevel.HIGH:
        return "high"
    if value is ConfidenceLevel.MEDIUM:
        return "moderate"
    return "low"


@dataclass
class ChannelMetrics:
    channel: str
    total_spend: float = 0.0
    total_revenue: float = 0.0
    confidence_weight: float = 0.0
    observations: int = 0
    confidence_counts: Counter[ConfidenceLevel] = field(default_factory=Counter)

    def register(self, slice_: PlanSlice) -> None:
        self.total_spend += slice_.recommended_spend
        self.total_revenue += slice_.expected_revenue.p50
        self.confidence_weight += CONFIDENCE_WEIGHTS.get(slice_.confidence, 0.0)
        self.confidence_counts[slice_.confidence] += 1
        self.observations += 1

    @property
    def average_confidence(self) -> float:
        if self.observations <= 0:
            return 0.0
        return self.confidence_weight / self.observations

    @property
    def roi(self) -> float:
        if self.total_spend <= 0:
            return 0.0
        return self.total_revenue / self.total_spend

    @property
    def dominant_confidence(self) -> ConfidenceLevel:
        if not self.confidence_counts:
            return ConfidenceLevel.MEDIUM
        return max(self.confidence_counts.items(), key=lambda item: (item[1], CONFIDENCE_WEIGHTS[item[0]]))[0]


class ScenarioRecommendationService:
    """Builds weather-aware scenario recommendations from plan telemetry."""

    def __init__(self, plan_service: PlanService) -> None:
        self._plan_service = plan_service

    async def get_recommendations(
        self,
        tenant_id: str,
        *,
        horizon_days: int = 7,
    ) -> ScenarioRecommendationResponse:
        plan = await self._plan_service.get_latest_plan(tenant_id, horizon_days=horizon_days)
        recommendations = self._build_recommendations(plan)
        return ScenarioRecommendationResponse(
            tenant_id=plan.tenant_id,
            generated_at=plan.generated_at,
            horizon_days=plan.horizon_days,
            recommendations=recommendations,
        )

    def _build_recommendations(self, plan: PlanResponse) -> list[ScenarioRecommendation]:
        metrics = list(self._aggregate_channels(plan.slices))
        if not metrics:
            return []

        roi_values = [metric.roi for metric in metrics if metric.total_spend > 0]
        avg_roi = mean(roi_values) if roi_values else 0.0

        confidence_values = [
            metric.average_confidence for metric in metrics if metric.observations > 0
        ]
        avg_confidence = mean(confidence_values) if confidence_values else 0.0

        growth_candidates = [
            metric
            for metric in metrics
            if metric.roi >= avg_roi and metric.average_confidence >= max(avg_confidence, 0.55)
        ]
        if not growth_candidates:
            growth_candidates = [max(metrics, key=lambda item: (item.roi, item.total_revenue, item.total_spend))]

        trim_candidates = [
            metric
            for metric in metrics
            if metric.average_confidence <= max(avg_confidence - 0.05, 0.45)
            or metric.roi <= avg_roi * 0.85
        ]
        if not trim_candidates:
            trim_candidates = [min(metrics, key=lambda item: (item.roi, -item.total_spend, -item.total_revenue))]

        balanced_pair = self._pick_balanced_pair(metrics)

        recommendations = [
            ScenarioRecommendation(
                id="accelerate_high_confidence",
                label="Accelerate high-confidence reach",
                description="Increase exposure on channels with resilient ROI and strong weather confidence.",
                adjustments=self._build_adjustments(growth_candidates, increase=True, bump=0.15),
                tags=["growth", "high-confidence"],
            ),
            ScenarioRecommendation(
                id="stabilise_low_signal",
                label="Stabilise low-signal spend",
                description="Dial back budget from channels showing weak ROI or low confidence until telemetry firms up.",
                adjustments=self._build_adjustments(trim_candidates, increase=False, bump=0.1),
                tags=["risk", "confidence"],
            ),
        ]

        if balanced_pair:
            increase_metric, decrease_metric = balanced_pair
            recommendations.append(
                ScenarioRecommendation(
                    id="rebalance_mix",
                    label="Rebalance mix for weather swings",
                    description="Shift budget toward resilient performers while easing pressure on softer channels.",
                    adjustments=self._build_adjustments([increase_metric], increase=True, bump=0.12)
                    + self._build_adjustments([decrease_metric], increase=False, bump=0.08),
                    tags=["balanced", "mix-shift"],
                )
            )

        return recommendations

    @staticmethod
    def _aggregate_channels(slices: Sequence[PlanSlice]) -> Iterable[ChannelMetrics]:
        by_channel: dict[str, ChannelMetrics] = {}
        for slice_ in slices:
            metrics = by_channel.setdefault(slice_.channel, ChannelMetrics(channel=slice_.channel))
            metrics.register(slice_)
        return by_channel.values()

    def _build_adjustments(
        self,
        metrics: Iterable[ChannelMetrics],
        *,
        increase: bool,
        bump: float,
    ) -> list[ScenarioRecommendationAdjustment]:
        adjustments: list[ScenarioRecommendationAdjustment] = []
        for metric in metrics:
            multiplier = 1 + bump if increase else 1 - bump
            delta_descriptor = "increase" if increase else "reduce"
            rationale = (
                f"{delta_descriptor.capitalize()} by {int(bump * 100)}% "
                f"({metric.roi:.1f}x ROI, {_confidence_label(metric.dominant_confidence)} confidence)."
            )
            adjustments.append(
                ScenarioRecommendationAdjustment(
                    channel=metric.channel,
                    multiplier=multiplier,
                    rationale=rationale,
                    confidence=metric.dominant_confidence,
                )
            )
        return adjustments

    @staticmethod
    def _pick_balanced_pair(metrics: Sequence[ChannelMetrics]) -> tuple[ChannelMetrics, ChannelMetrics] | None:
        if len(metrics) < 2:
            return None
        sorted_metrics = sorted(metrics, key=lambda item: (item.roi, item.total_revenue))
        lowest = sorted_metrics[0]
        highest = sorted_metrics[-1]
        if lowest.channel == highest.channel:
            return None
        return (highest, lowest)
