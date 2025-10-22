from __future__ import annotations

import json
from pathlib import Path

import pytest

from apps.api.services.orchestration_metrics_service import (
    OrchestrationMetricsService,
    OrchestrationMetricsUnavailable,
)


def test_orchestration_metrics_service_normalises_snapshot(tmp_path: Path):
    raw_snapshot = {
        "updatedAt": "2025-10-20T07:20:00Z",
        "totalDecisions": 3,
        "byType": {"critical": 1.0, "strategic": 1.0, "specialist": "1"},
        "history": [
            {
                "id": "decision-1",
                "taskId": "T1",
                "type": "critical",
                "timestamp": "2025-10-20T07:15:00Z",
                "quorumSatisfied": True,
                "participants": ["Atlas", "director_dana"],
                "durationSeconds": 1204.2,
                "tokenCostUsd": 0.013968,
            }
        ],
        "staffingGuidance": {
            "source": "state/analytics/consensus_workload.json",
            "sampleWindow": {"start": "2025-10-10T00:00:00Z", "end": "2025-10-20T07:15:16Z"},
            "profiles": {
                "critical": {
                    "defaultParticipants": ["Atlas", "Director Dana", "security_critic"],
                    "medianDurationSeconds": 1204,
                    "p90DurationSeconds": 3263.9,
                    "expectedIterations": 2,
                    "tokenCostUsd": 0.01397,
                    "notes": "Promotes security pairing.",
                }
            },
            "escalationTriggers": {
                "durationP90Seconds": 900,
                "retryThreshold": 1,
                "signals": [
                    {
                        "signal": "duration_p90_gt_900s",
                        "recommendedAction": "Promote to critical quorum.",
                        "thresholdSeconds": 900,
                        "observedValue": 1204,
                    }
                ],
            },
            "tokenBudgetUsd": {"baseline": 0.0059, "critical": 0.01397, "total": 0.01987},
        },
    }

    metrics_path = tmp_path / "orchestration_metrics.json"
    metrics_path.write_text(json.dumps(raw_snapshot), encoding="utf8")

    critics_dir = tmp_path / "critics"
    critics_dir.mkdir()
    (critics_dir / "allocator.json").write_text(
        json.dumps(
            {
                "critic": "allocator",
                "passed": True,
                "code": 0,
                "timestamp": "2025-10-20T07:22:00Z",
                "analysis": "Allocator critic executed in 3.2s (cached hot path).",
                "identity": {"title": "Allocator Sentinel", "domain": "operations"},
            }
        ),
        encoding="utf8",
    )
    (critics_dir / "integrationfury.json").write_text(
        json.dumps(
            {
                "critic": "integrationfury",
                "passed": False,
                "code": 1,
                "timestamp": "2025-10-20T07:30:00Z",
                "stderr": "IntegrationFury failed: missing webhook secret in env.",
                "identity": {"title": "Integration Fury", "domain": "integrations"},
            }
        ),
        encoding="utf8",
    )

    service = OrchestrationMetricsService(
        metrics_path=metrics_path,
        critic_snapshots_path=critics_dir,
    )
    snapshot = service.get_metrics_snapshot()

    assert snapshot["updated_at"] == raw_snapshot["updatedAt"]
    assert snapshot["total_decisions"] == 3
    assert snapshot["by_type"] == {"critical": 1, "strategic": 1, "specialist": 1}

    history = snapshot["history"]
    assert len(history) == 1
    entry = history[0]
    assert entry["participants"] == ["atlas", "director_dana"]
    assert entry["duration_seconds"] == pytest.approx(1204.2)
    assert entry["token_cost_usd"] == pytest.approx(0.01397, rel=1e-5)

    guidance = snapshot["staffing_guidance"]
    assert guidance["source"] == "state/analytics/consensus_workload.json"
    assert guidance["sample_window"]["start"] == "2025-10-10T00:00:00Z"
    profile = guidance["profiles"]["critical"]
    assert profile["default_participants"] == ["atlas", "director_dana", "security_critic"]
    assert profile["token_cost_usd"] == pytest.approx(0.01397, rel=1e-5)
    triggers = guidance["escalation_triggers"]
    assert triggers["duration_p90_seconds"] == 900
    assert triggers["retry_threshold"] == 1
    assert triggers["signals"][0]["signal"] == "duration_p90_gt_900s"
    assert guidance["token_budget_usd"]["total"] == pytest.approx(0.01987, rel=1e-5)

    critic_perf = snapshot["critic_performance"]
    assert critic_perf["summary"]["total"] == 2
    assert critic_perf["summary"]["passing"] == 1
    assert critic_perf["summary"]["failing"] == 1
    assert critic_perf["summary"]["last_updated"] == "2025-10-20T07:30:00+00:00"

    critics = critic_perf["critics"]
    assert critics[0]["critic"] == "integrationfury"
    assert critics[0]["passed"] is False
    assert critics[0]["summary"] == "IntegrationFury failed: missing webhook secret in env."
    assert critics[1]["critic"] == "allocator"
    assert critics[1]["passed"] is True


def test_orchestration_metrics_service_handles_missing_snapshot(tmp_path: Path):
    service = OrchestrationMetricsService(metrics_path=tmp_path / "missing.json")
    with pytest.raises(OrchestrationMetricsUnavailable):
        service.get_metrics_snapshot()
