from __future__ import annotations

import json

from apps.worker.flows.rl_shadow_pipeline import orchestrate_rl_shadow_flow


def test_orchestrate_rl_shadow_flow_persists_report(tmp_path):
    destination = tmp_path / "shadow.json"
    payload = orchestrate_rl_shadow_flow.fn(
        episodes=8,
        epsilon=0.3,
        reward_noise=0.0,
        seed=9,
        output_path=str(destination),
    )

    assert destination.exists()
    stored = json.loads(destination.read_text())
    assert stored["config"]["episodes"] == 8
    assert stored["config"]["epsilon"] == 0.3
    assert stored["config"]["seed"] == 9
    assert stored["config"]["min_baseline_fraction"] == 0.2
    assert stored["config"]["max_variant_fraction"] == 0.5
    assert len(payload["episodes"]) == 8
    assert payload["average_reward"] == stored["average_reward"]
    assert stored["scenario"]["total_budget"] > 0
    assert stored["guardrail_violations"] >= 0
    assert "validation" in stored
    validation = stored["validation"]
    baseline_checks = [check for check in validation["checks"] if check["name"] == "baseline_fraction"]
    assert baseline_checks and baseline_checks[0]["status"] is True
    stress = validation["stress_test"]
    assert stress["assertions"]["risk_off_disabled"] is True
    assert stress["guardrail_violations"] == 1
