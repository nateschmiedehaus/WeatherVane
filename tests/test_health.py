from fastapi.testclient import TestClient

from apps.api.main import app


def test_health_endpoint_returns_ok():
    client = TestClient(app)
    response = client.get("/v1/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "api"
