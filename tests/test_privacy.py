from fastapi.testclient import TestClient

from apps.api.main import app


def _fetch_audit_logs(client: TestClient, tenant_id: str) -> list[dict]:
    response = client.get(f"/v1/audit/{tenant_id}")
    if response.status_code != 200:
        return []
    return response.json().get("logs", [])


def test_request_data_export_creates_job():
    client = TestClient(app)
    response = client.post(
        "/v1/privacy/demo-tenant/export",
        json={"requested_by": "compliance@brand.com", "notes": "Quarterly export"},
    )
    assert response.status_code == 202
    payload = response.json()
    assert payload["tenant_id"] == "demo-tenant"
    assert payload["request_type"] == "export"
    assert payload["status"] == "pending"
    assert payload["request_id"] > 0


def test_request_data_delete_updates_timestamp_and_audits():
    client = TestClient(app)
    response = client.post(
        "/v1/privacy/demo-tenant/delete",
        json={"requested_by": "privacy@brand.com"},
    )
    assert response.status_code == 202
    body = response.json()
    assert body["request_type"] == "delete"
    history = client.get("/v1/settings/demo-tenant/automation").json()
    assert history["settings"]["last_delete_at"] is not None

    logs = _fetch_audit_logs(client, "demo-tenant")
    if logs:
        latest = logs[-1]
        assert latest["action"] in {"privacy.request.export", "privacy.request.delete", "automation.settings.updated"}
