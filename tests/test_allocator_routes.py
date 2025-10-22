from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services import allocator_service
from apps.allocator.saturation_fairness import generate_saturation_report
from apps.worker.flows.rl_shadow_pipeline import orchestrate_rl_shadow_flow


def test_get_shadow_mode_report(monkeypatch, tmp_path):
    destination = tmp_path / "shadow.json"
    orchestrate_rl_shadow_flow.fn(
        episodes=6,
        epsilon=0.35,
        reward_noise=0.0,
        seed=21,
        output_path=str(destination),
    )
    monkeypatch.setattr(allocator_service, "DEFAULT_SHADOW_PATH", destination)

    client = TestClient(app)
    response = client.get("/v1/allocator/shadow/demo-tenant")
    assert response.status_code == 200
    payload = response.json()
    assert payload["config"]["episodes"] == 6
    assert len(payload["episodes"]) == 6
    validation = payload["validation"]
    assert isinstance(validation["checks"], list)
    assert validation["summary"]["episodes"] == 6
    assert validation["stress_test"]["guardrail_violations"] >= 0


def test_get_shadow_mode_report_regenerates_missing(monkeypatch, tmp_path):
    destination = tmp_path / "shadow.json"
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "average_reward": 2.0,
        "guardrail_violations": 0,
        "q_values": {"baseline": 0.0},
        "selection_counts": {"baseline": 1},
        "episodes": [
            {
                "index": 0,
                "variant": "baseline",
                "reward": 0.0,
                "candidate_profit": 100.0,
                "baseline_profit": 100.0,
                "guardrail_violated": False,
                "realised_roas": {"baseline": 1.0},
                "disabled_after_episode": False,
                "safety_override": False,
            }
        ],
        "guardrail_breach_counts": {"baseline": 0},
        "disabled_variants": [],
        "diagnostics": {"baseline_fraction": 0.2, "safety_override_rate": 0.0},
        "config": {"episodes": 1},
        "scenario": {
            "total_budget": 100.0,
            "roas_floor": 1.0,
            "learning_cap": 0.2,
            "risk_aversion": 0.5,
            "channels": [],
        },
        "validation": {
            "checks": [],
            "summary": {"episodes": 1, "safety_override_rate": 0.0, "disabled_variants": []},
            "notes": [],
            "stress_test": {
                "config": {"episodes": 1, "epsilon": 0.0, "max_guardrail_breaches": 1, "seed": 1},
                "guardrail_violations": 0,
                "guardrail_breach_counts": {},
                "selection_counts": {},
                "disabled_variants": [],
                "episodes": [],
                "assertions": {},
            },
        },
    }

    calls = []

    def fake_generate(path):
        calls.append(path)
        path.write_text(json.dumps(payload), encoding="utf-8")
        return payload

    monkeypatch.setattr(allocator_service, "DEFAULT_SHADOW_PATH", destination)
    monkeypatch.setattr(allocator_service, "_generate_shadow_report", fake_generate)

    client = TestClient(app)
    response = client.get("/v1/allocator/shadow/demo-tenant")
    assert response.status_code == 200
    assert calls == [destination]
    body = response.json()
    assert body["average_reward"] == 2.0
    assert body["validation"]["summary"]["episodes"] == 1


def test_get_saturation_report(monkeypatch, tmp_path):
    destination = tmp_path / "saturation.json"
    generate_saturation_report(
        output_path=str(destination),
        fairness_floor=0.72,
        roas_floor=1.13,
        seed=23,
    )
    monkeypatch.setattr(allocator_service, "DEFAULT_SATURATION_PATH", destination)

    client = TestClient(app)
    response = client.get("/v1/allocator/saturation/demo-tenant")
    assert response.status_code == 200
    payload = response.json()
    assert payload["fairness_floor"] == 0.72
    assert payload["summary"]["total_spend"] > 0
    assert "normalized_fairness_gap" in payload["summary"]
    assert "under_allocated_markets" in payload["summary"]
    market_entry = payload["markets"][0]
    assert "fairness_gap" in market_entry
    assert "floor_shortfall" in market_entry
