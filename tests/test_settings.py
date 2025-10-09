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
    assert isinstance(data.get("context_tags"), list)
    assert isinstance(data.get("context_warnings"), list)
    assert data.get("data_context") in (None, {}) or isinstance(data.get("data_context"), dict)


def test_update_automation_settings_roundtrip():
    client = TestClient(app)
    payload = {
        "mode": "assist",
        "pushes_enabled": True,
        "daily_push_cap": 5,
        "push_window_start_utc": "08:00",
        "push_window_end_utc": "18:00",
        "guardrails": {
            "max_daily_budget_delta_pct": 10.0,
            "min_daily_spend": 100.0,
            "roas_floor": 1.8,
            "cpa_ceiling": 60.0,
            "change_windows": ["weekdays"]
        },
        "consent": {
            "status": "granted",
            "version": "1.1",
            "actor": "ops@brand.com"
        },
        "retention_days": 180,
        "notes": "Assist mode with consent",
        "updated_by": "ops@brand.com"
    }

    put_response = client.put("/v1/settings/demo-tenant/automation", json=payload)
    assert put_response.status_code == 200
    updated = put_response.json()
    assert updated["settings"]["mode"] == "assist"
    assert updated["settings"]["pushes_enabled"] is True
    assert updated["settings"]["guardrails"]["change_windows"] == ["weekdays"]
    assert updated["settings"]["consent"]["status"] == "granted"
    assert updated["settings"]["consent"]["actor"] == "ops@brand.com"
    assert isinstance(updated.get("context_tags"), list)
    assert isinstance(updated.get("context_warnings"), list)

    get_response = client.get("/v1/settings/demo-tenant/automation")
    assert get_response.status_code == 200
    persisted = get_response.json()
    assert persisted["settings"]["mode"] == "assist"
    assert persisted["settings"]["consent"]["status"] == "granted"
    assert isinstance(persisted.get("context_tags"), list)
    assert isinstance(persisted.get("context_warnings"), list)


def test_automation_settings_audit_log():
    client = TestClient(app)
    payload = {
        "mode": "autopilot",
        "pushes_enabled": True,
        "daily_push_cap": 3,
        "push_window_start_utc": "07:00",
        "push_window_end_utc": "19:00",
        "guardrails": {
            "max_daily_budget_delta_pct": 12.0,
            "min_daily_spend": 50.0,
            "roas_floor": 1.6,
            "cpa_ceiling": None,
            "change_windows": []
        },
        "consent": {
            "status": "granted",
            "version": "1.0",
            "actor": "ops@brand.com"
        },
        "retention_days": 365,
        "notes": "Autopilot opt-in",
        "updated_by": "ops@brand.com"
    }

    client.put("/v1/settings/demo-tenant/automation", json=payload)
    audit = client.get("/v1/audit/demo-tenant")
    assert audit.status_code == 200
    entries = audit.json().get("logs", [])
    assert entries
    latest = entries[0]
    assert latest["action"] in {"automation.settings.updated", "privacy.request.export", "privacy.request.delete"}
