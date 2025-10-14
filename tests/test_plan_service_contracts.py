from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace

import jsonschema
import pytest

from apps.api.services.exceptions import SchemaValidationError
from apps.api.services.plan_service import PlanService


class _StubContextService:
    def latest_snapshot(self, tenant_id: str):
        return None


class _StubWarningEngine:
    def evaluate(self, tags, autopilot_enabled, pushes_enabled):
        return []


class _ValidPlanRepository:
    async def latest_plan(self, tenant_id: str):
        return SimpleNamespace(
            tenant_id=tenant_id,
            generated_at=datetime.utcnow(),
            horizon_days=7,
            metadata_payload={},
            slices=[
                SimpleNamespace(
                    plan_date=datetime.utcnow(),
                    geo_group_id="PNW",
                    category="Rain Jackets",
                    channel="meta",
                    recommended_spend=125.0,
                    expected_revenue_low=1100.0,
                    expected_revenue_mid=1325.0,
                    expected_revenue_high=1560.0,
                    expected_roas_low=2.4,
                    expected_roas_mid=2.9,
                    expected_roas_high=3.3,
                    rationale={},
                )
            ],
        )


class _EmptyPlanRepository:
    async def latest_plan(self, tenant_id: str):
        return None


@pytest.mark.asyncio
async def test_plan_service_raises_when_schema_validation_fails(monkeypatch):
    service = PlanService(
        _ValidPlanRepository(),
        context_service=_StubContextService(),
        warning_engine=_StubWarningEngine(),
    )

    def _broken_validator(slices):
        raise jsonschema.ValidationError("boom")

    monkeypatch.setattr(
        "apps.api.services.plan_service.validate_plan_slices",
        _broken_validator,
    )

    with pytest.raises(SchemaValidationError) as excinfo:
        await service.get_latest_plan("tenant-a", horizon_days=3)

    assert excinfo.value.schema == "plan_slice"
    assert excinfo.value.tenant_id == "tenant-a"


@pytest.mark.asyncio
async def test_fallback_plan_runs_schema_validation(monkeypatch):
    service = PlanService(
        _EmptyPlanRepository(),
        context_service=_StubContextService(),
        warning_engine=_StubWarningEngine(),
    )
    observed_counts: list[int] = []

    def _recording_validator(slices):
        observed_counts.append(len(list(slices)))

    monkeypatch.setattr(
        "apps.api.services.plan_service.validate_plan_slices",
        _recording_validator,
    )

    plan = await service.get_latest_plan("tenant-b", horizon_days=2)

    assert observed_counts
    assert observed_counts[0] == len(plan.slices)
