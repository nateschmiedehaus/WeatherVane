from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from apps.api.main import create_app
from apps.api.routes import ad_push
from apps.api.schemas.ad_push import (
    AdPushDiffResponse,
    AdPushMetric,
    AdPushRollbackManifest,
    EntityDiff,
    GuardrailBreach,
    SectionDiff,
)
from shared.schemas.base import GuardrailSettings


@pytest.fixture(name="api_app")
def api_app_fixture():
    app = create_app()
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


def _build_sample_diff() -> AdPushDiffResponse:
    now = datetime.now(timezone.utc)
    return AdPushDiffResponse(
        run_id="run-123",
        tenant_id="tenant-abc",
        generation_mode="assist",
        generated_at=now,
        window_start=None,
        window_end=None,
        summary=[
            AdPushMetric(
                name="total_spend_after",
                value=1250.0,
                unit="usd",
                label="Total spend after",
                direction="increase",
            )
        ],
        entities=[
            EntityDiff(
                entity_type="ad_set",
                entity_id="adset-42",
                name="Prospecting",
                change_type="update",
                sections=[
                    SectionDiff(
                        section="spend",
                        summary=[],
                        changes=[],
                    )
                ],
                guardrails=[
                    GuardrailBreach(
                        code="budget_delta_exceeds_limit",
                        severity="warning",
                        message="Budget delta over threshold",
                        limit=15.0,
                        observed=20.0,
                    )
                ],
            )
        ],
        guardrails=[],
        notes=["Preflight smoke"],
        source_plan_id="plan-555",
    )


def test_get_latest_ad_push_diff_returns_payload(api_app):
    diff = _build_sample_diff()

    class _StubService:
        async def get_latest(self, tenant_id: str) -> AdPushDiffResponse | None:
            assert tenant_id == diff.tenant_id
            return diff

        async def get_by_run(self, tenant_id: str, run_id: str) -> AdPushDiffResponse | None:
            raise AssertionError("get_by_run should not be called")

    api_app.dependency_overrides[ad_push.get_ad_push_service] = lambda: _StubService()

    with TestClient(api_app) as client:
        response = client.get(f"/v1/tenants/{diff.tenant_id}/ad-pushes/latest")

    assert response.status_code == 200
    payload = response.json()
    assert payload["run_id"] == diff.run_id
    assert payload["tenant_id"] == diff.tenant_id
    assert payload["summary"][0]["name"] == "total_spend_after"


def test_get_ad_push_diff_by_run_returns_payload(api_app):
    diff = _build_sample_diff()

    class _StubService:
        async def get_latest(self, tenant_id: str) -> AdPushDiffResponse | None:
            raise AssertionError("get_latest should not be called")

        async def get_by_run(self, tenant_id: str, run_id: str) -> AdPushDiffResponse | None:
            assert tenant_id == diff.tenant_id
            assert run_id == diff.run_id
            return diff

    api_app.dependency_overrides[ad_push.get_ad_push_service] = lambda: _StubService()

    with TestClient(api_app) as client:
        response = client.get(f"/v1/tenants/{diff.tenant_id}/ad-pushes/{diff.run_id}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_plan_id"] == diff.source_plan_id


def test_get_ad_push_diff_returns_404_when_missing(api_app):
    class _MissingService:
        async def get_latest(self, tenant_id: str) -> AdPushDiffResponse | None:
            return None

        async def get_by_run(self, tenant_id: str, run_id: str) -> AdPushDiffResponse | None:
            return None
        async def get_rollback_manifest(
            self, tenant_id: str, run_id: str
        ) -> AdPushRollbackManifest | None:
            return None

    api_app.dependency_overrides[ad_push.get_ad_push_service] = lambda: _MissingService()

    with TestClient(api_app) as client:
        latest_response = client.get("/v1/tenants/tenant-missing/ad-pushes/latest")
        run_response = client.get("/v1/tenants/tenant-missing/ad-pushes/run-404")
        rollback_response = client.get(
            "/v1/tenants/tenant-missing/ad-pushes/run-404/rollback"
        )

    assert latest_response.status_code == 404
    assert run_response.status_code == 404
    assert rollback_response.status_code == 404


def test_get_ad_push_rollback_manifest_returns_payload(api_app):
    now = datetime.now(timezone.utc)
    manifest = AdPushRollbackManifest(
        run_id="run-abc",
        tenant_id="tenant-xyz",
        generated_at=now,
        baseline={"entities": []},
        proposed={"entities": []},
        guardrails=GuardrailSettings(),
        guardrail_breaches=[
            GuardrailBreach(
                code="spend_below_minimum",
                severity="critical",
                message="Spend below minimum threshold",
                limit=150.0,
                observed=120.0,
            )
        ],
        notes=["Autopilot smoke"],
        rollback_recommended=True,
        critical_guardrail_codes=["spend_below_minimum"],
    )

    class _StubService:
        async def get_latest(self, tenant_id: str) -> AdPushDiffResponse | None:
            raise AssertionError("get_latest should not be called")

        async def get_by_run(self, tenant_id: str, run_id: str) -> AdPushDiffResponse | None:
            raise AssertionError("get_by_run should not be called")

        async def get_rollback_manifest(
            self,
            tenant_id: str,
            run_id: str,
        ) -> AdPushRollbackManifest | None:
            assert tenant_id == manifest.tenant_id
            assert run_id == manifest.run_id
            return manifest

    api_app.dependency_overrides[ad_push.get_ad_push_service] = lambda: _StubService()

    with TestClient(api_app) as client:
        response = client.get(
            f"/v1/tenants/{manifest.tenant_id}/ad-pushes/{manifest.run_id}/rollback"
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["rollback_recommended"] is True
    assert payload["critical_guardrail_codes"] == ["spend_below_minimum"]
