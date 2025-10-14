from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from apps.api.main import create_app
from apps.api.routes import onboarding as onboarding_route
from shared.observability import metrics
from shared.services.onboarding.models import (
    AutomationAuditRecord,
    ConnectorProgressRecord,
    OnboardingMode,
    OnboardingSnapshot,
)


@pytest.fixture(name="api_app")
def api_app_fixture():
    app = create_app()
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


def test_fetch_onboarding_progress_demo_mode_returns_demo_payload(api_app):
    with TestClient(api_app) as client:
        response = client.get("/v1/onboarding/progress", params={"tenant_id": "demo-tenant"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["tenant_id"] == "demo-tenant"
    assert payload["mode"] == "demo"
    assert payload["fallback_reason"] is None

    connectors = payload["connectors"]
    assert isinstance(connectors, list)
    assert connectors, "Expected demo connectors"
    first_connector = connectors[0]
    assert {"slug", "label", "status", "progress"}.issubset(first_connector.keys())

    audits = payload["audits"]
    assert isinstance(audits, list)
    assert audits, "Expected demo audits"
    assert {"headline", "status", "occurred_at"}.issubset(audits[0].keys())


def test_fetch_onboarding_progress_live_mode_aggregates_state(api_app):
    with TestClient(api_app) as client:
        response = client.get(
            "/v1/onboarding/progress",
            params={"tenant_id": "demo-tenant", "mode": "live"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "live"
    assert payload["fallback_reason"] is None
    connectors = payload["connectors"]
    assert connectors, "Expected live connectors to be aggregated"
    slugs = {entry["slug"] for entry in connectors}
    assert {"shopify", "meta-primary", "google-ads"}.issubset(slugs)
    assert payload["audits"], "Expected automation audits to be surfaced"


def test_fetch_onboarding_progress_surfaces_schema_validation_error(api_app, monkeypatch):
    async def _broken_snapshot(tenant_id: str, mode: OnboardingMode) -> OnboardingSnapshot:
        invalid_connector = ConnectorProgressRecord(
            slug="demo",
            label="Demo Connector",
            status="ready",
            progress=150,  # exceeds schema upper bound
            summary="Invalid snapshot for testing.",
        )
        audit = AutomationAuditRecord(
            id="audit-1",
            status="ok",
            headline="Demo audit",
            detail=None,
            actor=None,
            occurred_at=None,
        )
        return OnboardingSnapshot(
            tenant_id=tenant_id,
            mode=mode,
            connectors=[invalid_connector],
            audits=[audit],
        )

    monkeypatch.setattr(onboarding_route, "get_onboarding_snapshot", _broken_snapshot)

    with TestClient(api_app) as client:
        response = client.get("/v1/onboarding/progress", params={"tenant_id": "demo-tenant"})

    assert response.status_code == 500
    detail = response.json()["detail"]
    assert detail["schema"] == "onboarding_progress"
    assert detail["path"], "Expected validation path"
    assert "less than or equal to 100" in detail.get("reason", "")


def test_record_onboarding_event_emits_metrics(api_app, tmp_path, monkeypatch):
    monkeypatch.setenv("METRICS_OUTPUT_DIR", str(tmp_path))
    metrics.reset_run_directory()

    with TestClient(api_app) as client:
        response = client.post(
            "/v1/onboarding/events",
            json={"tenant_id": "demo-tenant", "name": "drawer.viewed", "mode": "demo"},
        )

    assert response.status_code == 202
    assert response.json() == {"status": "recorded"}

    metrics_dir = metrics.get_run_directory()
    metrics_file = metrics_dir / "metrics.jsonl"
    assert metrics_file.exists()
    contents = metrics_file.read_text()
    assert "onboarding.event" in contents
    assert "drawer.viewed" in contents
    metrics.reset_run_directory()
