from __future__ import annotations

import json
from pathlib import Path

from apps.api.services.consensus_service import ConsensusService


def test_consensus_service_normalises_workload_snapshot(tmp_path: Path):
    raw_snapshot = {
        "generated_at": "2025-10-20T07:20:00Z",
        "sample_window": {"start": "2025-10-10T00:00:00Z", "end": "2025-10-20T07:15:16Z"},
        "decision_mix": {"critical": 3.0, "strategic": 1.0, "specialist": 0.0},
        "token_cost_per_run_usd": 0.00594,
        "token_budget_per_run": {"prompt": 402.365, "completion": 51.62},
        "quorum_profiles": {
            "strategic": {
                "default_participants": ["Atlas", "Research Orchestrator", "Claude Council"],
                "expected_duration_seconds": {"median": 509.14, "p90": 890.48},
                "expected_iterations": 1,
                "token_cost_usd": 0.007093,
                "notes": "Adds research orchestrator.",
            },
            "critical": {
                "default_participants": ["Director Dana", "security_critic", "atlas"],
                "expected_duration_seconds": {"median": 1204, "p90": 3263.9},
                "expected_iterations": 2,
                "token_cost_usd": 0.013965,
            },
        },
        "escalation_signals": [
            {
                "signal": "duration_p90_gt_900s",
                "threshold_seconds": 900,
                "recommended_action": "Promote to critical quorum with Director Dana + security critic.",
            },
            {
                "signal": "repeat_retries_gt_1",
                "threshold": 1,
                "recommended_action": "Add Research Orchestrator context.",
            },
        ],
        "execution_health": {"success_rate": 0.315, "error_rate": 0.511},
    }

    snapshot_path = tmp_path / "consensus_workload.json"
    snapshot_path.write_text(json.dumps(raw_snapshot), encoding="utf8")

    service = ConsensusService(workload_path=snapshot_path)
    snapshot = service.get_workload_snapshot()

    assert snapshot["decision_mix"]["critical"] == 3
    assert snapshot["token_cost_per_run_usd"] == 0.00594

    profiles = snapshot["quorum_profiles"]
    assert isinstance(profiles, list)
    assert profiles[0]["name"] == "critical"
    assert profiles[0]["default_participants"] == ["director_dana", "security_critic", "atlas"]
    assert profiles[0]["token_cost_usd"] == 0.01397

    signals = snapshot["escalation_signals"]
    assert signals[0]["signal"] == "duration_p90_gt_900s"
    assert signals[0]["recommended_action"].startswith("Promote to critical quorum")
