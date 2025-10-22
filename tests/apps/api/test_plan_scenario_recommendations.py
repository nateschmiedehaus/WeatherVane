from __future__ import annotations

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services.scenario_service import ScenarioRecommendationService
from shared.schemas.base import (
    ConfidenceLevel,
    PlanQuantiles,
    PlanResponse,
    PlanRationale,
    PlanSlice,
)


def _make_slice(
    *,
    channel: str,
    spend: float,
    revenue: float,
    confidence: ConfidenceLevel,
) -> PlanSlice:
    return PlanSlice(
        plan_date=datetime.utcnow(),
        geo_group_id="us-national",
        category="awareness",
        channel=channel,
        cell=f"{channel}-cell",
        recommended_spend=spend,
        expected_revenue=PlanQuantiles(p10=revenue * 0.8, p50=revenue, p90=revenue * 1.2),
        expected_roas=PlanQuantiles(p10=1.0, p50=1.0, p90=1.0),
        confidence=confidence,
        assumptions=["Baseline derived from allocator backtest"],
        rationale=PlanRationale(
            primary_driver="Weather uplift",
            supporting_factors=["Demand surge"],
            confidence_level=confidence,
            data_quality="COMPLETE",
            assumptions=[],
            risks=[],
        ),
        status="active",
    )


class StubPlanService:
    def __init__(self, plan: PlanResponse):
        self._plan = plan
        self.requests: list[tuple[str, int]] = []

    async def get_latest_plan(self, tenant_id: str, *, horizon_days: int = 7) -> PlanResponse:
        self.requests.append((tenant_id, horizon_days))
        return self._plan


@pytest.fixture()
def sample_plan() -> PlanResponse:
    generated_at = datetime.utcnow()
    slices = [
        _make_slice(channel="search", spend=4200, revenue=16800, confidence=ConfidenceLevel.HIGH),
        _make_slice(channel="display", spend=3100, revenue=3410, confidence=ConfidenceLevel.LOW),
        _make_slice(channel="video", spend=3300, revenue=7425, confidence=ConfidenceLevel.MEDIUM),
    ]
    return PlanResponse(
        tenant_id="tenant-123",
        generated_at=generated_at,
        horizon_days=7,
        slices=slices,
        context_tags=[],
    )


@pytest.mark.asyncio()
async def test_recommendations_prioritise_high_confidence_growth(sample_plan: PlanResponse) -> None:
    stub_plan_service = StubPlanService(sample_plan)
    service = ScenarioRecommendationService(stub_plan_service)  # type: ignore[arg-type]

    response = await service.get_recommendations("tenant-123", horizon_days=7)

    assert response.tenant_id == "tenant-123"
    assert response.horizon_days == 7
    accelerate = next(rec for rec in response.recommendations if rec.id == "accelerate_high_confidence")
    stabilise = next(rec for rec in response.recommendations if rec.id == "stabilise_low_signal")
    rebalance = next(rec for rec in response.recommendations if rec.id == "rebalance_mix")

    assert accelerate.adjustments[0].channel == "search"
    assert pytest.approx(accelerate.adjustments[0].multiplier, rel=1e-4) == 1.15
    assert "4.0x ROI" in accelerate.adjustments[0].rationale
    assert stabilise.adjustments[0].channel == "display"
    assert pytest.approx(stabilise.adjustments[0].multiplier, rel=1e-4) == 0.9
    assert "low confidence" in stabilise.adjustments[0].rationale.lower()
    rebalance_channels = {adj.channel for adj in rebalance.adjustments}
    assert rebalance_channels == {"search", "display"}


def test_route_returns_recommendations_payload(sample_plan: PlanResponse) -> None:
    stub_plan_service = StubPlanService(sample_plan)
    service = ScenarioRecommendationService(stub_plan_service)  # type: ignore[arg-type]

    def override_service():
        return service

    from apps.api.routes import plans as plans_route

    app.dependency_overrides[plans_route.get_scenario_service] = override_service
    try:
        with TestClient(app) as client:
            response = client.get("/v1/plans/tenant-123/scenarios/recommendations?horizon_days=10")
    finally:
        app.dependency_overrides.pop(plans_route.get_scenario_service, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["tenant_id"] == "tenant-123"
    assert payload["horizon_days"] == 7  # echo from plan response
    assert isinstance(payload["recommendations"], list)
    assert payload["recommendations"], "Expected at least one recommendation"
    first = payload["recommendations"][0]
    assert {"id", "label", "description", "adjustments", "tags"} <= first.keys()
    assert first["adjustments"], "Expected channel adjustments"
