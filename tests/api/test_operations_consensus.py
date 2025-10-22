from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from apps.api.main import create_app
from apps.api.routes import operations
from apps.api.services.consensus_service import ConsensusSnapshotUnavailable


@pytest.fixture(name="api_app")
def api_app_fixture():
    app = create_app()
    try:
        yield app
    finally:
        app.dependency_overrides.clear()


def test_get_consensus_workload_returns_normalised_snapshot(api_app):
    snapshot = {
        "generated_at": "2025-10-20T07:20:00Z",
        "sample_window": {"start": "2025-10-10T00:00:00Z", "end": "2025-10-20T07:15:16Z"},
        "decision_mix": {"critical": 3, "strategic": 2},
        "token_cost_per_run_usd": 0.00594,
        "token_budget_per_run": {"prompt": 402.365, "completion": 51.62},
        "quorum_profiles": [
            {
                "name": "critical",
                "display_name": "Critical",
                "hierarchy_rank": 0,
                "default_participants": ["director_dana", "security_critic", "atlas"],
                "median_duration_seconds": 1204.0,
                "p90_duration_seconds": 3263.9,
                "expected_iterations": 2,
                "token_cost_usd": 0.01397,
                "notes": None,
            },
            {
                "name": "strategic",
                "display_name": "Strategic",
                "hierarchy_rank": 1,
                "default_participants": ["atlas", "research_orchestrator", "claude_council"],
                "median_duration_seconds": 509.1,
                "p90_duration_seconds": 890.5,
                "expected_iterations": 1,
                "token_cost_usd": 0.00709,
                "notes": "Adds research orchestrator.",
            },
        ],
        "escalation_signals": [
            {
                "signal": "duration_p90_gt_900s",
                "threshold_seconds": 900,
                "recommended_action": "Promote to critical quorum.",
            },
            {
                "signal": "repeat_retries_gt_1",
                "threshold": 1,
                "recommended_action": "Add Research Orchestrator context.",
            },
        ],
        "execution_health": {"success_rate": 0.315, "error_rate": 0.511},
    }

    class _StubConsensusService:
        def get_workload_snapshot(self):
            return snapshot

    api_app.dependency_overrides[operations.get_consensus_service] = lambda: _StubConsensusService()

    with TestClient(api_app) as client:
        response = client.get("/v1/operations/consensus")

    assert response.status_code == 200
    payload = response.json()
    assert payload["generated_at"] == snapshot["generated_at"]
    assert payload["sample_window"]["start"] == snapshot["sample_window"]["start"]
    assert payload["decision_mix"]["critical"] == 3
    assert payload["token_cost_per_run_usd"] == pytest.approx(0.00594, rel=1e-5)

    quorum_profiles = payload["quorum_profiles"]
    assert quorum_profiles[0]["name"] == "critical"
    assert quorum_profiles[0]["display_name"] == "Critical"
    assert quorum_profiles[0]["hierarchy_rank"] == 0
    assert quorum_profiles[0]["default_participants"] == ["director_dana", "security_critic", "atlas"]
    assert quorum_profiles[0]["token_cost_usd"] == pytest.approx(0.01397, rel=1e-5)

    signals = payload["escalation_signals"]
    assert signals[0]["signal"] == "duration_p90_gt_900s"
    assert signals[0]["recommended_action"] == "Promote to critical quorum."
    assert payload["execution_health"]["success_rate"] == pytest.approx(0.315, rel=1e-5)


def test_get_consensus_workload_surfaces_snapshot_errors(api_app):
    class _ErrorService:
        def get_workload_snapshot(self):
            raise ConsensusSnapshotUnavailable("Consensus snapshot offline")

    api_app.dependency_overrides[operations.get_consensus_service] = lambda: _ErrorService()

    with TestClient(api_app) as client:
        response = client.get("/v1/operations/consensus")

    assert response.status_code == 503
    assert response.json() == {"detail": {"message": "Consensus snapshot offline"}}
