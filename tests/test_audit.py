from fastapi.testclient import TestClient

from apps.api.main import app


def test_audit_logs_endpoint():
    client = TestClient(app)
    response = client.get("/v1/audit/demo-tenant")
    assert response.status_code == 200
    body = response.json()
    assert body["tenant_id"] == "demo-tenant"
    assert isinstance(body["logs"], list)
