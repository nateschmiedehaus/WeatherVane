from __future__ import annotations

from datetime import datetime

import jsonschema
import pytest

from apps.api.services.catalog_service import CatalogService
from apps.api.services.exceptions import SchemaValidationError
from shared.schemas.base import (
    ConfidenceLevel,
    PlanQuantiles,
    PlanRationale,
    PlanResponse,
    PlanSlice,
)


def _plan_response() -> PlanResponse:
    slice_rationale = PlanRationale(
        primary_driver="Storm surge expected",
        supporting_factors=["Allocator uplift"],
        confidence_level=ConfidenceLevel.HIGH,
        data_quality="FULL",
        assumptions=["No supply constraints"],
        risks=["Inventory shortfall"],
    )
    slice_quantiles = PlanQuantiles(p10=90.0, p50=110.0, p90=130.0)
    plan_slice = PlanSlice(
        plan_date=datetime.utcnow(),
        geo_group_id="PNW",
        category="Rain Jackets",
        channel="meta",
        cell="meta",
        recommended_spend=100.0,
        expected_revenue=slice_quantiles,
        expected_roas=PlanQuantiles(p10=0.9, p50=1.1, p90=1.3),
        confidence=ConfidenceLevel.HIGH,
        assumptions=["Spend cap respected"],
        rationale=slice_rationale,
        status="FULL",
    )
    return PlanResponse(
        tenant_id="tenant-123",
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
async def test_catalog_service_raises_when_schema_validation_fails(monkeypatch):
    plan = _plan_response()
    service = CatalogService(plan_service=_StubPlanService(plan))

    def _broken_validator(payload):
        raise jsonschema.ValidationError("invalid", path=["categories", 0, "name"])

    monkeypatch.setattr(
        "apps.api.services.catalog_service.validate_catalog_response",
        _broken_validator,
    )

    with pytest.raises(SchemaValidationError) as excinfo:
        await service.fetch_catalog("tenant-123")

    assert excinfo.value.schema == "catalog_response"
    assert excinfo.value.tenant_id == "tenant-123"
    assert tuple(excinfo.value.path) == ("categories", 0, "name")
