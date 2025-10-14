from __future__ import annotations

from datetime import datetime

import jsonschema
import pytest

from apps.api.services.exceptions import SchemaValidationError
from apps.api.services.story_service import StoryService
from shared.schemas.base import (
    ConfidenceLevel,
    PlanQuantiles,
    PlanRationale,
    PlanResponse,
    PlanSlice,
)


def _plan_response() -> PlanResponse:
    slice_rationale = PlanRationale(
        primary_driver="Cold front approaching",
        supporting_factors=["Allocator uplift"],
        confidence_level=ConfidenceLevel.MEDIUM,
        data_quality="FULL",
        assumptions=[],
        risks=["Inventory lag"],
    )
    plan_slice = PlanSlice(
        plan_date=datetime.utcnow(),
        geo_group_id="NYC",
        category="Umbrellas",
        channel="email",
        cell="email",
        recommended_spend=50.0,
        expected_revenue=PlanQuantiles(p10=40.0, p50=60.0, p90=80.0),
        expected_roas=PlanQuantiles(p10=0.8, p50=1.2, p90=1.6),
        confidence=ConfidenceLevel.MEDIUM,
        assumptions=["Seasonal demand"],
        rationale=slice_rationale,
        status="FULL",
    )
    return PlanResponse(
        tenant_id="tenant-xyz",
        generated_at=datetime.utcnow(),
        horizon_days=7,
        slices=[plan_slice],
        context_tags=["demo"],
        data_context=None,
        context_warnings=[],
    )


class _StubPlanService:
    def __init__(self, plan: PlanResponse) -> None:
        self.plan = plan

    async def get_latest_plan(self, tenant_id: str, horizon_days: int = 7) -> PlanResponse:
        return self.plan


@pytest.mark.asyncio
async def test_story_service_raises_when_schema_validation_fails(monkeypatch):
    plan = _plan_response()
    service = StoryService(plan_service=_StubPlanService(plan))

    def _broken_validator(payload):
        raise jsonschema.ValidationError("invalid", path=["stories", 0, "title"])

    monkeypatch.setattr(
        "apps.api.services.story_service.validate_stories_response",
        _broken_validator,
    )

    with pytest.raises(SchemaValidationError) as excinfo:
        await service.latest_stories("tenant-xyz")

    assert excinfo.value.schema == "stories_response"
    assert excinfo.value.tenant_id == "tenant-xyz"
    assert tuple(excinfo.value.path) == ("stories", 0, "title")
