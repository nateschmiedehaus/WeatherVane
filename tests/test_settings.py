from fastapi.testclient import TestClient

from apps.api.main import app


def test_automation_settings_default_read_only():
    client = TestClient(app)
    response = client.get("/v1/settings/demo-tenant/automation")
    assert response.status_code == 200
    data = response.json()
    assert data["tenant_id"] == "demo-tenant"
    assert data["settings"]["mode"] == "manual"
    assert data["settings"]["pushes_enabled"] is False
    assert data["settings"]["guardrails"]["max_daily_budget_delta_pct"] == 15.0
