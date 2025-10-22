from __future__ import annotations

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from apps.api.main import create_app
from apps.api.routes import plans
from apps.api.services.exceptions import SchemaValidationError
from apps.api.services.scenario_snapshot_service import ScenarioSnapshotService
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


def test_create_scenario_snapshot_uses_plan_for_summary(api_app, tmp_path):
    sample_plan = _build_sample_plan()

    class _StubPlanService:
        async def get_latest_plan(self, tenant_id: str, horizon_days: int) -> PlanResponse:
            assert tenant_id == sample_plan.tenant_id
            assert horizon_days == sample_plan.horizon_days
            return sample_plan

    snapshot_service = ScenarioSnapshotService(storage_root=tmp_path / "scenarios")

    api_app.dependency_overrides[plans.get_plan_service] = lambda: _StubPlanService()
    api_app.dependency_overrides[plans.get_snapshot_service] = lambda: snapshot_service

    payload = {
        "name": "Scenario A",
        "adjustments": {"meta": 1.1},
        "horizon_days": sample_plan.horizon_days,
        "description": "Test snapshot",
        "tags": ["growth"],
        "created_by": "tester",
    }

    with TestClient(api_app) as client:
        response = client.post(f"/v1/plans/{sample_plan.tenant_id}/scenarios/snapshots", json=payload)

    assert response.status_code == 201
    body = response.json()
    assert body["tenant_id"] == sample_plan.tenant_id
    assert body["total_base_spend"] is not None
    assert body["total_scenario_spend"] is not None
    assert body["scenario_roi"] is not None


def test_list_scenario_snapshots_returns_all_saved_snapshots(api_app, tmp_path):
    sample_plan = _build_sample_plan()
    snapshot_service = ScenarioSnapshotService(storage_root=tmp_path / "scenarios")

    class _StubPlanService:
        async def get_latest_plan(self, tenant_id: str, horizon_days: int) -> PlanResponse:
            return sample_plan

    api_app.dependency_overrides[plans.get_plan_service] = lambda: _StubPlanService()
    api_app.dependency_overrides[plans.get_snapshot_service] = lambda: snapshot_service

    with TestClient(api_app) as client:
        # Create first snapshot
        client.post(
            f"/v1/plans/{sample_plan.tenant_id}/scenarios/snapshots",
            json={
                "name": "Scenario A",
                "adjustments": {"meta": 1.1},
                "horizon_days": sample_plan.horizon_days,
            },
        )
        # Create second snapshot
        client.post(
            f"/v1/plans/{sample_plan.tenant_id}/scenarios/snapshots",
            json={
                "name": "Scenario B",
                "adjustments": {"meta": 0.9},
                "horizon_days": sample_plan.horizon_days,
            },
        )

        # List snapshots
        response = client.get(f"/v1/plans/{sample_plan.tenant_id}/scenarios/snapshots")

    assert response.status_code == 200
    body = response.json()
    assert body["tenant_id"] == sample_plan.tenant_id
    assert len(body["snapshots"]) == 2
    # Newest first
    assert body["snapshots"][0]["name"] == "Scenario B"
    assert body["snapshots"][1]["name"] == "Scenario A"


def test_get_scenario_snapshot_returns_specific_snapshot(api_app, tmp_path):
    sample_plan = _build_sample_plan()
    snapshot_service = ScenarioSnapshotService(storage_root=tmp_path / "scenarios")

    class _StubPlanService:
        async def get_latest_plan(self, tenant_id: str, horizon_days: int) -> PlanResponse:
            return sample_plan

    api_app.dependency_overrides[plans.get_plan_service] = lambda: _StubPlanService()
    api_app.dependency_overrides[plans.get_snapshot_service] = lambda: snapshot_service

    with TestClient(api_app) as client:
        # Create snapshot
        response = client.post(
            f"/v1/plans/{sample_plan.tenant_id}/scenarios/snapshots",
            json={
                "name": "Test Scenario",
                "adjustments": {"meta": 1.2},
                "horizon_days": sample_plan.horizon_days,
                "description": "A test scenario",
            },
        )
        snapshot_id = response.json()["id"]

        # Get snapshot
        response = client.get(
            f"/v1/plans/{sample_plan.tenant_id}/scenarios/snapshots/{snapshot_id}"
        )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == snapshot_id
    assert body["name"] == "Test Scenario"
    assert body["description"] == "A test scenario"
    assert body["adjustments"]["meta"] == 1.2


def test_delete_scenario_snapshot_removes_snapshot(api_app, tmp_path):
    sample_plan = _build_sample_plan()
    snapshot_service = ScenarioSnapshotService(storage_root=tmp_path / "scenarios")

    class _StubPlanService:
        async def get_latest_plan(self, tenant_id: str, horizon_days: int) -> PlanResponse:
            return sample_plan

    api_app.dependency_overrides[plans.get_plan_service] = lambda: _StubPlanService()
    api_app.dependency_overrides[plans.get_snapshot_service] = lambda: snapshot_service

    with TestClient(api_app) as client:
        # Create snapshot
        response = client.post(
            f"/v1/plans/{sample_plan.tenant_id}/scenarios/snapshots",
            json={
                "name": "Test Scenario",
                "adjustments": {"meta": 1.2},
                "horizon_days": sample_plan.horizon_days,
            },
        )
        snapshot_id = response.json()["id"]

        # Delete snapshot
        response = client.delete(
            f"/v1/plans/{sample_plan.tenant_id}/scenarios/snapshots/{snapshot_id}"
        )
        assert response.status_code == 204

        # Verify it's deleted
        response = client.get(
            f"/v1/plans/{sample_plan.tenant_id}/scenarios/snapshots/{snapshot_id}"
        )
        assert response.status_code == 404


def test_update_scenario_snapshot_modifies_metadata(api_app, tmp_path):
    sample_plan = _build_sample_plan()
    snapshot_service = ScenarioSnapshotService(storage_root=tmp_path / "scenarios")

    class _StubPlanService:
        async def get_latest_plan(self, tenant_id: str, horizon_days: int) -> PlanResponse:
            return sample_plan

    api_app.dependency_overrides[plans.get_plan_service] = lambda: _StubPlanService()
    api_app.dependency_overrides[plans.get_snapshot_service] = lambda: snapshot_service

    with TestClient(api_app) as client:
        # Create snapshot
        response = client.post(
            f"/v1/plans/{sample_plan.tenant_id}/scenarios/snapshots",
            json={
                "name": "Original Name",
                "adjustments": {"meta": 1.2},
                "horizon_days": sample_plan.horizon_days,
                "description": "Original description",
            },
        )
        snapshot_id = response.json()["id"]

        # Update snapshot
        response = client.patch(
            f"/v1/plans/{sample_plan.tenant_id}/scenarios/snapshots/{snapshot_id}",
            json={
                "name": "Updated Name",
                "description": "Updated description",
                "tags": ["growth", "test"],
            },
        )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Updated Name"
    assert body["description"] == "Updated description"
    assert body["tags"] == ["growth", "test"]
