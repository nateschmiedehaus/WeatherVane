from __future__ import annotations

import json

from apps.api.services.repositories import AdPushDiffRepository, AdPushRollbackRepository


def test_ad_push_repository_reads_latest_and_by_run(tmp_path) -> None:
    state_path = tmp_path / "ad_push_diffs.json"
    payload = [
        {
            "run_id": "run-002",
            "tenant_id": "tenant-1",
            "generation_mode": "assist",
        },
        {
            "run_id": "run-001",
            "tenant_id": "tenant-1",
            "generation_mode": "manual",
        },
        {
            "run_id": "run-100",
            "tenant_id": "tenant-2",
            "generation_mode": "autopilot",
        },
    ]
    state_path.write_text(json.dumps(payload))

    repository = AdPushDiffRepository(state_path)

    latest = repository.latest("tenant-1")
    assert latest is not None
    assert latest["run_id"] == "run-002"

    specific = repository.get("tenant-1", "run-001")
    assert specific is not None
    assert specific["run_id"] == "run-001"

    missing = repository.get("tenant-3", "run-999")
    assert missing is None


def test_ad_push_rollback_repository_reads_manifest(tmp_path) -> None:
    root = tmp_path / "rollback"
    manifest_path = root / "tenant-1" / "run-42.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(
        json.dumps(
            {
                "run_id": "run-42",
                "tenant_id": "tenant-1",
                "generated_at": "2025-01-01T00:00:00Z",
                "baseline": {"entities": []},
                "proposed": {"entities": []},
                "guardrails": {"max_daily_budget_delta_pct": 15.0, "min_daily_spend": 0.0},
                "guardrail_breaches": [],
                "rollback_recommended": False,
            }
        )
    )

    repository = AdPushRollbackRepository(root)
    payload = repository.get("tenant-1", "run-42")

    assert payload is not None
    assert payload["run_id"] == "run-42"
    assert payload["tenant_id"] == "tenant-1"
