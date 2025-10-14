from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from apps.api.main import create_app
from apps.api.routes import stories as stories_route
from apps.api.services.exceptions import SchemaValidationError
from shared.schemas.base import StoriesResponse


@pytest.fixture(name="api_app")
def api_app_fixture():
    app = create_app()
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


def test_get_stories_returns_payload(api_app):
    with TestClient(api_app) as client:
        response = client.get("/v1/stories/demo-tenant")

    assert response.status_code == 200
    data = response.json()
    assert data["tenant_id"] == "demo-tenant"
    assert "stories" in data
    assert isinstance(data["stories"], list)
    assert isinstance(data.get("context_warnings"), list)
    if data["stories"]:
        story = data["stories"][0]
        assert "title" in story
        assert "summary" in story
        assert "detail" in story


def test_get_stories_surfaces_schema_validation_error(api_app):
    sample_error = SchemaValidationError(
        "Stories contract violated",
        schema="plan_slice",
        tenant_id="tenant-stories",
        path=("slices", 0, "expected_roas"),
        reason="missing p90",
    )

    class _FailingService:
        async def latest_stories(
            self,
            tenant_id: str,
            horizon_days: int,
            limit: int,
        ) -> StoriesResponse:
            raise sample_error

    api_app.dependency_overrides[stories_route.get_story_service] = lambda: _FailingService()

    with TestClient(api_app) as client:
        response = client.get("/v1/stories/tenant-stories")

    assert response.status_code == 500
    assert response.json() == {"detail": sample_error.to_detail()}
