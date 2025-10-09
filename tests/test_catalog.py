from fastapi.testclient import TestClient

from apps.api.main import app


def test_get_catalog_returns_categories():
    client = TestClient(app)
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
