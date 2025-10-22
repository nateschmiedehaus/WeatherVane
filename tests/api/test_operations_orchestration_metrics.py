from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from apps.api.main import create_app
from apps.api.routes import operations
from apps.api.services.orchestration_metrics_service import OrchestrationMetricsUnavailable


@pytest.fixture(name="api_app")
def api_app_fixture():
    app = create_app()
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


def test_get_orchestration_metrics_returns_snapshot(api_app):
    snapshot = {
        "updated_at": "2025-10-20T07:20:00Z",
        "total_decisions": 4,
        "by_type": {"critical": 2, "strategic": 2},
        "history": [
            {
                "id": "decision-1",
                "task_id": "T1",
                "type": "critical",
                "timestamp": "2025-10-20T07:18:00Z",
                "quorum_satisfied": True,
                "participants": ["atlas", "director_dana"],
                "duration_seconds": 1204.0,
                "token_cost_usd": 0.01397,
            }
        ],
        "staffing_guidance": {
            "profiles": {
                "critical": {
                    "default_participants": ["atlas", "director_dana"],
                    "median_duration_seconds": 1204.0,
                    "p90_duration_seconds": 3263.9,
                }
            },
            "escalation_triggers": {"signals": []},
            "token_budget_usd": {"baseline": 0.0059},
        },
        "critic_performance": {
            "summary": {"total": 1, "passing": 1, "failing": 0, "last_updated": "2025-10-20T07:30:00Z"},
            "critics": [
                {
                    "critic": "allocator",
                    "passed": True,
                    "timestamp": "2025-10-20T07:30:00Z",
                    "summary": "Allocator critic executed in 3.2s (cached hot path).",
                }
            ],
        },
    }

    class _StubMetricsService:
        def get_metrics_snapshot(self):
            return snapshot

    api_app.dependency_overrides[
        operations.get_orchestration_metrics_service
    ] = lambda: _StubMetricsService()

    with TestClient(api_app) as client:
        response = client.get("/v1/operations/orchestration-metrics")

    assert response.status_code == 200
    payload = response.json()
    assert payload["updated_at"] == snapshot["updated_at"]
    assert payload["total_decisions"] == 4
    assert payload["by_type"]["critical"] == 2
    assert payload["history"][0]["task_id"] == "T1"
    assert payload["critic_performance"]["summary"]["total"] == 1
    assert payload["critic_performance"]["critics"][0]["critic"] == "allocator"


def test_get_orchestration_metrics_surfaces_errors(api_app):
    class _ErrorService:
        def get_metrics_snapshot(self):
            raise OrchestrationMetricsUnavailable("Metrics unavailable")

    api_app.dependency_overrides[
        operations.get_orchestration_metrics_service
    ] = lambda: _ErrorService()

    with TestClient(api_app) as client:
        response = client.get("/v1/operations/orchestration-metrics")

    assert response.status_code == 503
    assert response.json() == {"detail": {"message": "Metrics unavailable"}}
