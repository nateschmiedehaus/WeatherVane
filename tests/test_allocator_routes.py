from __future__ import annotations

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
