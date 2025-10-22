from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from apps.allocator.rollback_cli import main
from shared.libs.automation.rollback import RollbackManifest, RollbackManifestStore
from shared.libs.diffs import GuardrailBreach
from shared.libs.diffs.ad_push import GuardrailSeverity
from shared.schemas.base import GuardrailSettings


def _build_manifest(*, run_id: str = "run-1", tenant_id: str = "tenant-123") -> RollbackManifest:
    baseline_payload = {
        "entities": [
            {
                "entity_type": "ad_set",
                "entity_id": "adset-123",
                "name": "Baseline",
                "sections": {
                    "spend": {
                        "daily_budget": {
                            "field_path": "ad_set.daily_budget",
                            "label": "Daily budget",
                            "kind": "numeric",
                            "unit": "usd",
                            "value": 90.0,
                        }
                    }
                },
            }
        ]
    }

    proposed_payload = {
        "entities": [
            {
                "entity_type": "ad_set",
                "entity_id": "adset-123",
                "name": "Baseline",
                "sections": {
                    "spend": {
                        "daily_budget": {
                            "field_path": "ad_set.daily_budget",
                            "label": "Daily budget",
                            "kind": "numeric",
                            "unit": "usd",
                            "value": 120.0,
                        }
                    }
                },
            }
        ]
    }

    guardrail = GuardrailBreach(
        code="spend_below_minimum",
        severity=GuardrailSeverity.CRITICAL,
        message="Daily spend breached minimum guardrail",
        limit=150.0,
        observed=120.0,
    )

    return RollbackManifest(
        run_id=run_id,
        tenant_id=tenant_id,
        generated_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        baseline=baseline_payload,
        proposed=proposed_payload,
        guardrails=GuardrailSettings(max_daily_budget_delta_pct=50.0, min_daily_spend=150.0),
        guardrail_breaches=[guardrail],
        notes=["Preflight smoke"],
    )


def _seed_manifest(store_root: Path, manifest: RollbackManifest) -> None:
    RollbackManifestStore(root=store_root).save(manifest)


def test_refresh_simulation_generates_report(tmp_path: Path) -> None:
    manifest = _build_manifest(run_id="run-refresh", tenant_id="tenant-refresh")
    manifest_root = tmp_path / "storage" / "metadata" / "ad_push_rollback"
    _seed_manifest(manifest_root, manifest)

    output_path = tmp_path / "experiments" / "allocator" / "rollback_sim.json"
    simulated_at = "2025-10-20T00:00:00+00:00"

    exit_code = main(
        [
            "refresh-simulation",
            "--tenant-id",
            manifest.tenant_id,
            "--run-id",
            manifest.run_id,
            "--output",
            str(output_path),
            "--manifest-root",
            str(manifest_root),
            "--simulated-at",
            simulated_at,
        ]
    )

    assert exit_code == 0
    assert output_path.exists()

    payload = json.loads(output_path.read_text())
    assert payload["run_id"] == manifest.run_id
    assert payload["tenant_id"] == manifest.tenant_id
    assert payload["simulated_at"] == simulated_at
    assert payload["rollback_ready"] is True
    assert payload["action_count"] == len(payload["actions"])
    assert payload["critical_guardrail_codes"] == ["spend_below_minimum"]


def test_refresh_simulation_missing_manifest_returns_error(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    manifest_root = tmp_path / "storage" / "metadata" / "ad_push_rollback"
    output_path = tmp_path / "experiments" / "allocator" / "rollback_sim.json"

    exit_code = main(
        [
            "refresh-simulation",
            "--tenant-id",
            "tenant-missing",
            "--run-id",
            "run-missing",
            "--output",
            str(output_path),
            "--manifest-root",
            str(manifest_root),
        ]
    )

    assert exit_code == 1
    assert not output_path.exists()

    captured = capsys.readouterr()
    assert "Rollback manifest missing" in captured.err
