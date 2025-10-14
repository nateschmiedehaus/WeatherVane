from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from apps.allocator.rollback_executor import simulate_rollback, write_rollback_simulation
from shared.libs.automation.rollback import RollbackManifest
from shared.libs.diffs import GuardrailBreach
from shared.libs.diffs.ad_push import GuardrailSeverity
from shared.schemas.base import GuardrailSettings


def _build_manifest() -> RollbackManifest:
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
                            "value": 110.0,
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
        observed=110.0,
    )

    return RollbackManifest(
        run_id="test-run",
        tenant_id="tenant-1",
        generated_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
        baseline=baseline_payload,
        proposed=proposed_payload,
        guardrails=GuardrailSettings(max_daily_budget_delta_pct=50.0, min_daily_spend=150.0),
        guardrail_breaches=[guardrail],
        notes=["Preflight smoke"],
    )


def test_simulate_rollback_produces_action_summary() -> None:
    manifest = _build_manifest()
    simulated_at = datetime(2025, 1, 2, tzinfo=timezone.utc)

    report = simulate_rollback(manifest, simulated_at=simulated_at)

    assert report["run_id"] == "test-run"
    assert report["tenant_id"] == "tenant-1"
    assert report["simulated_at"] == simulated_at.isoformat()
    assert report["rollback_recommended"] is True
    assert report["rollback_ready"] is True
    assert report["guardrail_summary"]["critical_count"] == 1
    assert report["action_count"] == 1

    action = report["actions"][0]
    assert action["field_path"] == "ad_set.daily_budget"
    assert action["baseline_value"] == 90.0
    assert action["proposed_value"] == 110.0
    assert action["direction"] == "decrease"


def test_write_rollback_simulation_persists_report(tmp_path: Path) -> None:
    manifest = _build_manifest()
    output = tmp_path / "rollback_sim.json"
    simulated_at = datetime(2025, 1, 3, tzinfo=timezone.utc)

    report = write_rollback_simulation(output, manifest, simulated_at=simulated_at)

    assert output.exists()
    payload = json.loads(output.read_text())
    assert payload == report
    assert payload["simulated_at"] == simulated_at.isoformat()
    assert payload["action_count"] == len(payload["actions"])
