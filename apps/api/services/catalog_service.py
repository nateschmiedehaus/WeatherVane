from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, List

from shared.schemas.base import CatalogCategory, CatalogResponse

from apps.api.services.plan_service import PlanService

SEASON_KEYWORDS = {
    "winter": "Winter",
    "spring": "Spring",
    "summer": "Summer",
    "fall": "Fall",
    "holiday": "Holiday",
}

WEATHER_KEYWORDS = {
    "rain": "Rain",
    "storm": "Storm",
    "snow": "Snow",
    "heat": "Heat",
    "cold": "Cold",
    "uv": "UV",
    "wind": "Wind",
    "humidity": "Humidity",
}


@dataclass
class CatalogService:
    plan_service: PlanService

    async def fetch_catalog(
        self,
        tenant_id: str,
        horizon_days: int = 7,
        limit: int = 12,
    ) -> CatalogResponse:
        plan = await self.plan_service.get_latest_plan(tenant_id, horizon_days=horizon_days)
        slices = list(plan.slices[:limit]) if plan.slices else []
        categories = self._derive_categories(slices)
        generated_at = plan.generated_at if hasattr(plan, "generated_at") else datetime.utcnow()
        return CatalogResponse(
            tenant_id=tenant_id,
            generated_at=generated_at,
            categories=categories,
            context_tags=list(getattr(plan, "context_tags", []) or []),
            data_context=getattr(plan, "data_context", None),
            context_warnings=list(getattr(plan, "context_warnings", []) or []),
        )

    def _derive_categories(self, slices: Iterable) -> List[CatalogCategory]:  # type: ignore[no-untyped-def]
        categories: List[CatalogCategory] = []
        for slice_ in slices:
            weather_tags = self._tags_from_text(
                f"{slice_.geo_group_id} {slice_.rationale.primary_driver if slice_.rationale else ''}",
                WEATHER_KEYWORDS,
            )
            season_tags = self._tags_from_text(
                f"{slice_.geo_group_id} {slice_.rationale.primary_driver if slice_.rationale else ''}",
                SEASON_KEYWORDS,
            )
            lift = self._lift_summary(slice_)
            categories.append(
                CatalogCategory(
                    name=slice_.category,
                    geo_group_id=slice_.geo_group_id,
                    channel=slice_.channel,
                    weather_tags=weather_tags or ["Seasonal"],
                    season_tags=season_tags,
                    status="Auto-tagged" if weather_tags else "Review",
                    lift=lift,
                )
            )
        return categories

    @staticmethod
    def _tags_from_text(text: str, vocab: dict[str, str]) -> List[str]:
        text_lower = text.lower()
        tags = []
        for key, label in vocab.items():
            if key in text_lower:
                tags.append(label)
        return sorted(set(tags))

    @staticmethod
    def _lift_summary(slice_) -> str:  # type: ignore[no-untyped-def]
        if slice_.expected_roas:
            return f"Median ROAS {slice_.expected_roas.p50:.1f}×"
        return "Guardrails respected"
