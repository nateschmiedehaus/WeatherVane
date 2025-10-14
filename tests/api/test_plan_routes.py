from __future__ import annotations

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from apps.api.main import create_app
from apps.api.routes import plans
from apps.api.services.exceptions import SchemaValidationError
from shared.schemas.base import (
    ConfidenceLevel,
    ContextWarning,
    PlanQuantiles,
    PlanRationale,
    PlanResponse,
    PlanSlice,
)


@pytest.fixture(name="api_app")
def api_app_fixture():
    app = create_app()
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


def _build_sample_plan() -> PlanResponse:
    now = datetime.utcnow()
    return PlanResponse(
        tenant_id="tenant-demo",
        generated_at=now,
        horizon_days=7,
        slices=[
            PlanSlice(
                plan_date=now,
                geo_group_id="PNW",
                category="Rain Jackets",
                channel="meta",
                recommended_spend=135.0,
                expected_revenue=PlanQuantiles(p10=950.0, p50=1230.0, p90=1495.0),
                expected_roas=PlanQuantiles(p10=2.1, p50=2.6, p90=3.1),
                confidence=ConfidenceLevel.HIGH,
                assumptions=["Connector readiness verified"],
                rationale=PlanRationale(
                    primary_driver="Warm front drives demand",
                    supporting_factors=["Meta conversions trending upward"],
                    confidence_level=ConfidenceLevel.HIGH,
                    data_quality="complete",
                    assumptions=["Budget stays at baseline"],
                    risks=["Inventory may run low"],
                ),
            ),
        ],
        context_tags=["weather:alert", "allocator:shadow"],
        context_warnings=[
            ContextWarning(
                code="budget_high",
                message="Daily budget nearing guardrail threshold",
                severity="warning",
                tags=["allocator"],
            ),
        ],
    )


def test_get_plan_returns_serialised_payload_and_headers(api_app):
    sample_plan = _build_sample_plan()

    class _StubPlanService:
        async def get_latest_plan(self, tenant_id: str, horizon_days: int) -> PlanResponse:
            assert tenant_id == sample_plan.tenant_id
            assert horizon_days == 5
            return sample_plan

    api_app.dependency_overrides[plans.get_plan_service] = lambda: _StubPlanService()

    with TestClient(api_app) as client:
        response = client.get(f"/v1/plans/{sample_plan.tenant_id}", params={"horizon_days": 5})

    assert response.status_code == 200
    payload = response.json()
    assert payload["tenant_id"] == sample_plan.tenant_id
    assert payload["horizon_days"] == 7
    assert payload["context_tags"] == sample_plan.context_tags
    assert response.headers["X-WeatherVane-Context"] == ",".join(sample_plan.context_tags)
    assert response.headers["X-WeatherVane-Warnings"] == ",".join(
        warning.code for warning in sample_plan.context_warnings
    )


def test_get_plan_surfaces_schema_validation_errors(api_app):
    error = SchemaValidationError(
        "Plan slices failed schema validation",
        schema="plan_slice",
        tenant_id="tenant-broken",
        path=("slices", 0, "expected_revenue"),
        reason="p90 below p50",
    )

    class _ErrorPlanService:
        async def get_latest_plan(self, tenant_id: str, horizon_days: int) -> PlanResponse:
            raise error

    api_app.dependency_overrides[plans.get_plan_service] = lambda: _ErrorPlanService()

    with TestClient(api_app) as client:
        response = client.get("/v1/plans/tenant-broken")

    assert response.status_code == 500
    assert response.json() == {
        "detail": {
            "message": error.message,
            "schema": error.schema,
            "tenant_id": error.tenant_id,
            "path": list(error.path),
            "reason": error.reason,
        }
    }
