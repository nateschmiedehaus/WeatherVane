from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from apps.api.main import create_app
from shared.observability import metrics


@pytest.fixture(name="api_app")
def api_app_fixture():
    app = create_app()
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


def test_record_dashboard_suggestion_event_records_metrics(api_app, tmp_path, monkeypatch):
    monkeypatch.setenv("METRICS_OUTPUT_DIR", str(tmp_path))
    metrics.reset_run_directory()

    payload = {
        "tenantId": "demo-tenant",
        "event": "dashboard.weather_focus.suggestion.view",
        "payload": {
            "region": "Gulf Coast",
            "severity": "high",
            "highRiskCount": 2,
            "eventCount": 3,
            "nextEventStartsAt": "2025-05-01T14:00:00Z",
            "hasScheduledStart": True,
            "reason": "High-risk weather events incoming.",
            "viewportBreakpoint": "desktop",
            "metadata": {
                "layoutVariant": "dense",
                "ctaShown": True,
            },
        },
        "occurredAt": "2025-05-01T12:00:00Z",
    }

    with TestClient(api_app) as client:
        response = client.post("/v1/analytics/dashboard/suggestion-events", json=payload)

    assert response.status_code == 202
    assert response.json() == {"status": "recorded"}

    run_dir = metrics.get_run_directory()
    metrics_file = run_dir / "metrics.jsonl"
    assert metrics_file.exists()
    records = [json.loads(line) for line in metrics_file.read_text().splitlines() if line]
    assert records, "expected analytics record to be written"
    assert records[0]["payload"]["tenant_id"] == "demo-tenant"
    assert records[0]["payload"]["action"] == "view"
    assert records[0]["payload"]["region"] == "Gulf Coast"
    assert records[0]["payload"]["high_risk_count"] == 2
    assert records[0]["payload"]["event_count"] == 3
    assert records[0]["payload"]["metadata"] == {
        "layoutVariant": "dense",
        "ctaShown": True,
        "signature": "Gulf Coast|High-risk weather events incoming.|2025-05-01T14:00:00Z|2|3",
    }
    metrics.reset_run_directory()


def test_record_dashboard_suggestion_event_backfills_signature(api_app, tmp_path, monkeypatch):
    monkeypatch.setenv("METRICS_OUTPUT_DIR", str(tmp_path))
    metrics.reset_run_directory()

    payload = {
        "tenantId": "demo-tenant",
        "event": "dashboard.weather_focus.suggestion.focus",
        "payload": {
            "region": "Gulf Coast",
            "severity": "high",
            "highRiskCount": 2,
            "eventCount": 3,
            "nextEventStartsAt": "2025-05-01T14:00:00Z",
            "hasScheduledStart": True,
            "reason": "High-risk weather events incoming.",
            "viewportBreakpoint": "desktop",
            "metadata": {},
        },
        "occurredAt": "2025-05-01T12:00:00Z",
    }

    with TestClient(api_app) as client:
        response = client.post("/v1/analytics/dashboard/suggestion-events", json=payload)

    assert response.status_code == 202

    run_dir = metrics.get_run_directory()
    metrics_file = run_dir / "metrics.jsonl"
    assert metrics_file.exists()
    records = [json.loads(line) for line in metrics_file.read_text().splitlines() if line]
    signature = "Gulf Coast|High-risk weather events incoming.|2025-05-01T14:00:00Z|2|3"
    assert records[0]["payload"]["metadata"]["signature"] == signature
    metrics.reset_run_directory()


def test_record_dashboard_suggestion_event_rejects_invalid_payload(api_app):
    with TestClient(api_app) as client:
        response = client.post(
            "/v1/analytics/dashboard/suggestion-events",
            json={
                "tenantId": "demo-tenant",
                "event": "dashboard.weather_focus.suggestion.view",
                "payload": {
                    "region": "Gulf Coast",
                    "severity": "high",
                    "highRiskCount": -1,
                    "eventCount": 3,
                    "nextEventStartsAt": None,
                    "hasScheduledStart": False,
                    "reason": "invalid",
                    "viewportBreakpoint": "desktop",
                },
            },
        )

    assert response.status_code == 422


def test_record_dashboard_suggestion_event_rejects_blank_metadata_key(api_app):
    with TestClient(api_app) as client:
        response = client.post(
            "/v1/analytics/dashboard/suggestion-events",
            json={
                "tenantId": "demo-tenant",
                "event": "dashboard.weather_focus.suggestion.view",
                "payload": {
                    "region": "Gulf Coast",
                    "severity": "high",
                    "highRiskCount": 2,
                    "eventCount": 2,
                    "nextEventStartsAt": None,
                    "hasScheduledStart": False,
                    "reason": "invalid metadata",
                    "viewportBreakpoint": "desktop",
                    "metadata": {"": "bad"},
                },
            },
        )

    assert response.status_code == 422
