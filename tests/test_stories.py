from fastapi.testclient import TestClient

from apps.api.main import app


def test_get_stories_returns_payload():
    client = TestClient(app)
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
