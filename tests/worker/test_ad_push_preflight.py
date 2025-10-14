from __future__ import annotations

import json
from pathlib import Path

import pytest

from apps.worker.preflight import ad_push as cli


def _write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True))


def test_execute_generates_artifacts(tmp_path, monkeypatch) -> None:
    proposed_path = tmp_path / "proposed.json"
    baseline_path = tmp_path / "baseline.json"
    guardrails_path = tmp_path / "guardrails.json"
    state_path = tmp_path / "state.json"
    output_dir = tmp_path / "artifacts"
    rollback_root = tmp_path / "rollback"
    alerts_path = tmp_path / "alerts.json"

    baseline_payload = {
        "entities": [
            {
                "entity_type": "ad_set",
                "entity_id": "adset-123",
                "name": "Baseline",
                "metadata": {"platform": "meta"},
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
                "metadata": {"platform": "meta"},
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
    guardrails_payload = {
        "max_daily_budget_delta_pct": 50.0,
        "min_daily_spend": 150.0,
    }

    _write_json(baseline_path, baseline_payload)
    _write_json(proposed_path, proposed_payload)
    _write_json(guardrails_path, guardrails_payload)
    monkeypatch.setenv("AD_PUSH_ROLLBACK_ROOT", str(rollback_root))
    monkeypatch.setenv("AD_PUSH_ALERT_STATE_PATH", str(alerts_path))

    args = cli.parse_args(
        [
            "--tenant-id",
            "tenant-1",
            "--mode",
            "assist",
            "--run-id",
            "test-run",
            "--proposed-path",
            str(proposed_path),
            "--baseline-path",
            str(baseline_path),
            "--guardrails-path",
            str(guardrails_path),
            "--generated-at",
            "2025-01-01T00:00:00Z",
            "--output-dir",
            str(output_dir),
            "--state-path",
            str(state_path),
            "--max-state-records",
            "2",
            "--notes",
            "Preflight smoke",
        ]
    )

    diff, artifact_path, aggregated_path = cli.execute(args)

    assert artifact_path.exists()
    artifact = json.loads(artifact_path.read_text())
    assert artifact["run_id"] == "test-run"
    assert artifact["tenant_id"] == "tenant-1"
    assert artifact["entities"], "artifact must include entity diffs"
    report = artifact.get("spend_guardrail_report")
    assert report is not None
    assert report["totals"]["proposed_spend"] == pytest.approx(110.0)
    platform_codes = {item["platform"] for item in report["platforms"]}
    assert "meta" in platform_codes

    aggregated = json.loads(aggregated_path.read_text())
    assert isinstance(aggregated, list)
    assert aggregated[0]["run_id"] == "test-run"
    assert aggregated[0]["notes"] == ["Preflight smoke"]
    aggregated_report = aggregated[0].get("spend_guardrail_report")
    assert aggregated_report is not None

    manifest_path = rollback_root / "tenant-1" / "test-run.json"
    assert manifest_path.exists()
    manifest = json.loads(manifest_path.read_text())
    assert manifest["rollback_recommended"] is True
    critical_codes = set(manifest.get("critical_guardrail_codes", []))
    assert "spend_below_minimum" in critical_codes
    assert "platform_spend_below_minimum" in critical_codes
    assert manifest["baseline"]["entities"][0]["sections"]["spend"]["daily_budget"]["value"] == 90.0

    assert alerts_path.exists()
    alerts = json.loads(alerts_path.read_text())
    assert alerts[0]["run_id"] == "test-run"
    assert alerts[0]["severity"] == "critical"

    # Re-run to confirm aggregation order and truncation
    args.run_id = "test-run-2"
    _, _, aggregated_path = cli.execute(args)
    aggregated = json.loads(aggregated_path.read_text())
    run_ids = [item["run_id"] for item in aggregated]
    assert run_ids == ["test-run-2", "test-run"]
    assert len(run_ids) == 2


def test_execute_uses_environment_roots_for_baseline_and_guardrails(tmp_path, monkeypatch) -> None:
    tenant_id = "tenant-9"
    baseline_root = tmp_path / "baseline-store"
    automation_root = tmp_path / "automation-store"
    baseline_root.mkdir()
    automation_root.mkdir()

    proposed_path = tmp_path / "proposed.json"
    state_path = tmp_path / "state.json"
    output_dir = tmp_path / "artifacts"

    baseline_payload = {
        "entities": [
            {
                "entity_type": "ad_set",
                "entity_id": "adset-789",
                "name": "Retargeting",
                "metadata": {"platform": "meta"},
                "sections": {
                    "spend": {
                        "daily_budget": {
                            "field_path": "ad_set.daily_budget",
                            "label": "Daily budget",
                            "kind": "numeric",
                            "unit": "usd",
                            "value": 80.0,
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
                "entity_id": "adset-789",
                "name": "Retargeting",
                "metadata": {"platform": "meta"},
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
    guardrails_payload = {
        "max_daily_budget_delta_pct": 10.0,
        "min_daily_spend": 15.0,
    }

    baseline_store_file = baseline_root / f"{tenant_id}.json"
    automation_store_file = automation_root / f"{tenant_id}.json"

    _write_json(baseline_store_file, baseline_payload)
    _write_json(proposed_path, proposed_payload)
    _write_json(
        automation_store_file,
        {
            "settings": {
                "guardrails": guardrails_payload,
            }
        },
    )

    monkeypatch.setenv("AD_PUSH_ROLLBACK_ROOT", str(tmp_path / "rollback-env"))
    monkeypatch.setenv("AD_PUSH_ALERT_STATE_PATH", str(tmp_path / "alerts-env.json"))

    monkeypatch.setenv("AD_PUSH_BASELINE_ROOT", str(baseline_root))
    monkeypatch.setenv("AUTOMATION_SETTINGS_ROOT", str(automation_root))

    args = cli.parse_args(
        [
            "--tenant-id",
            tenant_id,
            "--mode",
            "assist",
            "--run-id",
            "env-run",
            "--proposed-path",
            str(proposed_path),
            "--generated-at",
            "2025-02-01T12:00:00Z",
            "--output-dir",
            str(output_dir),
            "--state-path",
            str(state_path),
        ]
    )

    diff, artifact_path, aggregated_path = cli.execute(args)

    assert artifact_path.exists()
    assert artifact_path.parent == output_dir / tenant_id

    assert diff.entities
    entity = diff.entities[0]
    assert entity.change_type == "update"
    spend_section = next(section for section in entity.sections if section.section.value == "spend")
    change = next(item for item in spend_section.changes if item.field_path == "ad_set.daily_budget")
    guardrail_codes = {breach.code for breach in change.guardrails}
    assert "budget_delta_exceeds_limit" in guardrail_codes
    spend_report = diff.spend_guardrail_report
    assert spend_report is not None
    assert {item.platform for item in spend_report.platforms} == {"meta"}
    report_codes = {breach.code for breach in spend_report.guardrails}
    assert "platform_spend_delta_exceeds_limit" in report_codes

    aggregated = json.loads(aggregated_path.read_text())
    assert aggregated[0]["run_id"] == "env-run"
