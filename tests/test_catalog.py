from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from apps.api.main import create_app
from apps.api.routes import catalog as catalog_route
from apps.api.services.exceptions import SchemaValidationError
from shared.schemas.base import CatalogResponse


@pytest.fixture(name="api_app")
def api_app_fixture():
    app = create_app()
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


def test_get_catalog_returns_categories(api_app):
    with TestClient(api_app) as client:
        response = client.get("/v1/catalog/demo-tenant")

    assert response.status_code == 200
    payload = response.json()
    assert payload["tenant_id"] == "demo-tenant"
    assert isinstance(payload["categories"], list)
    assert isinstance(payload.get("context_warnings"), list)
    if payload["categories"]:
        category = payload["categories"][0]
        assert "name" in category
        assert "weather_tags" in category
        assert "season_tags" in category


def test_get_catalog_surfaces_schema_validation_error(api_app):
    sample_error = SchemaValidationError(
        "Catalog contract violated",
        schema="plan_slice",
        tenant_id="tenant-broken",
        path=("slices", 0, "expected_revenue"),
        reason="p90 below p50",
    )

    class _FailingService:
        async def fetch_catalog(self, tenant_id: str, horizon_days: int, limit: int) -> CatalogResponse:
            raise sample_error

    api_app.dependency_overrides[catalog_route.get_catalog_service] = lambda: _FailingService()

    with TestClient(api_app) as client:
        response = client.get("/v1/catalog/tenant-broken")

    assert response.status_code == 500
    assert response.json() == {"detail": sample_error.to_detail()}
