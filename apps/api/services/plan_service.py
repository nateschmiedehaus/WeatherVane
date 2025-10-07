from __future__ import annotations

from datetime import datetime, timedelta

from shared.schemas.base import PlanResponse, PlanSlice
from apps.api.db import models
from .repositories import PlanRepository


class PlanService:
    def __init__(self, repository: PlanRepository) -> None:
        self.repository = repository

    async def get_latest_plan(self, tenant_id: str, *, horizon_days: int = 7) -> PlanResponse:
        plan = await self.repository.latest_plan(tenant_id)
        if plan is None or not plan.slices:
            return self._fallback_plan(tenant_id, horizon_days)
        return self._to_schema(plan)

    def _to_schema(self, plan: models.Plan) -> PlanResponse:
        return PlanResponse(
            tenant_id=plan.tenant_id,
            generated_at=plan.generated_at,
            horizon_days=plan.horizon_days,
            slices=[
                PlanSlice(
                    plan_date=s.plan_date,
                    geo_group_id=s.geo_group_id,
                    category=s.category,
                    channel=s.channel,
                    recommended_spend=s.recommended_spend,
                    expected_revenue_low=s.expected_revenue_low,
                    expected_revenue_mid=s.expected_revenue_mid,
                    expected_revenue_high=s.expected_revenue_high,
                    expected_roas_low=s.expected_roas_low,
                    expected_roas_mid=s.expected_roas_mid,
                    expected_roas_high=s.expected_roas_high,
                    rationale=s.rationale,
                )
                for s in plan.slices
            ],
        )

    def _fallback_plan(self, tenant_id: str, horizon_days: int) -> PlanResponse:
        now = datetime.utcnow()
        slices = []
        for day in range(horizon_days):
            slices.append(
                PlanSlice(
                    plan_date=now + timedelta(days=day),
                    geo_group_id="PNW_RAIN_COOL",
                    category="Rain Jackets",
                    channel="meta",
                    recommended_spend=1200 + day * 25,
                    expected_revenue_low=3200 + day * 50,
                    expected_revenue_mid=3600 + day * 60,
                    expected_revenue_high=4100 + day * 70,
                    expected_roas_low=2.5,
                    expected_roas_mid=3.0,
                    expected_roas_high=3.4,
                    rationale={
                        "weather": "Rain probability up 45% vs climatology",
                        "promo": "Spring shower promo active",
                    },
                )
            )
        return PlanResponse(
            tenant_id=tenant_id,
            generated_at=now,
            horizon_days=horizon_days,
            slices=slices,
        )
