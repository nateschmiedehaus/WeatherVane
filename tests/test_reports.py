from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from apps.api.main import create_app
from apps.api.routes import reports as reports_route
from apps.api.services.exceptions import SchemaValidationError
from shared.schemas.base import ReportsResponse


@pytest.fixture(name="api_app")
def api_app_fixture():
    app = create_app()
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


def test_get_reports_returns_payload(api_app):
    with TestClient(api_app) as client:
        response = client.get("/v1/reports/demo-tenant")

    assert response.status_code == 200
    payload = response.json()
    assert payload["tenant_id"] == "demo-tenant"
    assert isinstance(payload.get("hero_tiles"), list)
    assert "narratives" in payload
    assert "trend" in payload
    assert "schedule" in payload
    assert "success" in payload


def test_get_reports_surfaces_schema_validation_error(api_app):
    sample_error = SchemaValidationError(
        "Reports contract violated",
        schema="reports_response",
        tenant_id="tenant-reports",
        path=("hero_tiles", 0, "value"),
        reason="must be number",
    )

    class _FailingService:
        async def latest_report(
            self,
            tenant_id: str,
            horizon_days: int,
        ) -> ReportsResponse:
            raise sample_error

    api_app.dependency_overrides[reports_route.get_report_service] = lambda: _FailingService()

    with TestClient(api_app) as client:
        response = client.get("/v1/reports/tenant-reports")

    assert response.status_code == 500
    assert response.json() == {"detail": sample_error.to_detail()}
