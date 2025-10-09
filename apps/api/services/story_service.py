from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, List

from shared.schemas.base import StoriesResponse, WeatherStory

from .plan_service import PlanService


@dataclass
class StoryService:
    plan_service: PlanService

    async def latest_stories(
        self,
        tenant_id: str,
        horizon_days: int = 7,
        limit: int = 6,
    ) -> StoriesResponse:
        plan = await self.plan_service.get_latest_plan(tenant_id, horizon_days=horizon_days)
        slices = sorted(
            plan.slices,
            key=lambda slice_: slice_.expected_revenue.p90 if slice_.expected_revenue else 0.0,
            reverse=True,
        )
        selected = list(slices[:limit]) if slices else []
        generated_at = plan.generated_at if hasattr(plan, "generated_at") else datetime.utcnow()
        stories = self._stories_from_slices(selected)
        return StoriesResponse(
            tenant_id=tenant_id,
            generated_at=generated_at,
            stories=stories,
            context_tags=list(getattr(plan, "context_tags", []) or []),
            data_context=getattr(plan, "data_context", None),
            context_warnings=list(getattr(plan, "context_warnings", []) or []),
        )

    def _stories_from_slices(self, slices: Iterable) -> List[WeatherStory]:  # type: ignore[no-untyped-def]
        stories: List[WeatherStory] = []
        for slice_ in slices:
            icon = self._icon_for_channel(slice_.channel)
            summary = (
                f"Recommend {slice_.recommended_spend:,.0f} USD with expected revenue {slice_.expected_revenue.p50:,.0f} USD "
                f"({slice_.expected_roas.p50:.2f}× ROAS)"
                if slice_.expected_roas
                else f"Recommend {slice_.recommended_spend:,.0f} USD with expected revenue {slice_.expected_revenue.p50:,.0f} USD"
            )
            detail = self._story_detail(slice_)
            stories.append(
                WeatherStory(
                    title=f"{slice_.category} · {slice_.geo_group_id}",
                    summary=summary,
                    detail=detail,
                    icon=icon,
                    confidence=slice_.confidence,
                    plan_date=slice_.plan_date,
                    category=slice_.category,
                    channel=slice_.channel,
                )
            )
        return stories

    @staticmethod
    def _icon_for_channel(channel: str | None) -> str:
        mapping = {
            "meta": "📱",
            "google": "🔍",
            "tiktok": "🎵",
            "email": "✉️",
        }
        if channel is None:
            return "🌤"
        return mapping.get(channel.lower(), "🌤")

    @staticmethod
    def _story_detail(slice_) -> str:  # type: ignore[no-untyped-def]
        driver = slice_.rationale.primary_driver if slice_.rationale else "Weather opportunity"
        assumptions = ", ".join(slice_.assumptions) if slice_.assumptions else "Guardrails respected"
        confidence = slice_.confidence.value if hasattr(slice_.confidence, "value") else slice_.confidence
        return f"Driver: {driver}. Confidence: {confidence}. {assumptions}."
