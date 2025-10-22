from __future__ import annotations

from datetime import datetime, timedelta

import jsonschema
import pytest

from apps.api.services.exceptions import SchemaValidationError
from apps.api.services.report_service import ReportService
from shared.schemas.base import (
    ConfidenceLevel,
    PlanQuantiles,
    PlanRationale,
    PlanResponse,
    PlanSlice,
)


def _plan_slice(
    *,
    plan_date: datetime,
    geo: str,
    category: str,
    channel: str,
    spend: float,
    revenue_mid: float,
    revenue_low: float,
    revenue_high: float,
    confidence: ConfidenceLevel,
    driver: str,
) -> PlanSlice:
    rationale = PlanRationale(
        primary_driver=driver,
        supporting_factors=["Allocator uplift"],
        confidence_level=confidence,
        data_quality="FULL",
        assumptions=["Demand holds"],
        risks=["Inventory lag"],
    )
    return PlanSlice(
        plan_date=plan_date,
        geo_group_id=geo,
        category=category,
        channel=channel,
        cell=channel,
        recommended_spend=spend,
        expected_revenue=PlanQuantiles(p10=revenue_low, p50=revenue_mid, p90=revenue_high),
        expected_roas=PlanQuantiles(p10=0.8, p50=1.2, p90=1.6),
        confidence=confidence,
        assumptions=["Demand holds"],
        rationale=rationale,
        status="ready",
    )


def _plan_response() -> PlanResponse:
    now = datetime.utcnow()
    slices = [
        _plan_slice(
            plan_date=now,
            geo="NYC",
            category="Paid Social",
            channel="Meta",
            spend=12500,
            revenue_mid=32500,
            revenue_low=28000,
            revenue_high=36000,
            confidence=ConfidenceLevel.HIGH,
            driver="Heatwave drives boardwalk traffic",
        ),
        _plan_slice(
            plan_date=now + timedelta(days=1),
            geo="Chicago",
            category="Search",
            channel="Google",
            spend=8400,
            revenue_mid=15400,
            revenue_low=12000,
            revenue_high=19000,
            confidence=ConfidenceLevel.MEDIUM,
            driver="Lake effect storms boost conversion intent",
        ),
        _plan_slice(
            plan_date=now + timedelta(days=2),
            geo="Austin",
            category="Email",
            channel="ESP",
            spend=3100,
            revenue_mid=4200,
            revenue_low=2600,
            revenue_high=5100,
            confidence=ConfidenceLevel.LOW,
            driver="Humidity swing needs nurturing sequence",
        ),
    ]
    return PlanResponse(
        tenant_id="tenant-xyz",
        generated_at=now,
        horizon_days=7,
        slices=slices,
        context_tags=["demo"],
        data_context={"weather_source": "noaa"},
        context_warnings=[],
    )


class _StubPlanService:
    def __init__(self, plan: PlanResponse) -> None:
        self.plan = plan

    async def get_latest_plan(self, tenant_id: str, horizon_days: int = 7) -> PlanResponse:
        return self.plan


@pytest.mark.asyncio
async def test_report_service_raises_when_schema_validation_fails(monkeypatch):
    plan = _plan_response()
    service = ReportService(plan_service=_StubPlanService(plan))

    def _broken_validator(payload):
        raise jsonschema.ValidationError("invalid", path=["hero_tiles", 0, "value"])

    monkeypatch.setattr(
        "apps.api.services.report_service.validate_reports_response",
        _broken_validator,
    )

    with pytest.raises(SchemaValidationError) as excinfo:
        await service.latest_report("tenant-xyz")

    assert excinfo.value.schema == "reports_response"
    assert excinfo.value.tenant_id == "tenant-xyz"
    assert tuple(excinfo.value.path) == ("hero_tiles", 0, "value")


@pytest.mark.asyncio
async def test_report_service_summarises_slices_into_report_payload():
    plan = _plan_response()
    service = ReportService(plan_service=_StubPlanService(plan))

    report = await service.latest_report(plan.tenant_id)

    assert report.tenant_id == plan.tenant_id
    assert len(report.hero_tiles) == 3
    roi_tile = next(tile for tile in report.hero_tiles if tile.id == "roi")
    assert roi_tile.value > 1.0
    assert roi_tile.delta_value is not None
    assert report.narratives
    assert report.trend.points
    assert report.schedule.status in {"active", "demo"}
    assert report.success.headline
