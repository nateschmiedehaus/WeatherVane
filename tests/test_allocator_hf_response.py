from __future__ import annotations

import json
from pathlib import Path

from apps.allocator.hf_response import (
    HOURS_PER_DAY,
    generate_intraday_report,
    write_intraday_report,
)


def test_generate_intraday_report_structure() -> None:
    report = generate_intraday_report()

    assert "budget" in report and report["budget"] > 0
    assert "total_revenue" in report and report["total_revenue"] >= report["budget"]
    assert "channels" in report and len(report["channels"]) >= 2
    assert "timeline" in report and len(report["timeline"]) == HOURS_PER_DAY

    total_spend = 0.0
    profiles = report["scenario"]["demand_profile"]
    max_base = {channel["channel"]: channel["max_hourly_spend"] for channel in report["channels"]}

    for entry in report["timeline"]:
        total_spend += sum(entry["spend"].values())
        hour = entry["hour"]
        for channel in report["channels"]:
            name = channel["channel"]
            multiplier = profiles[name][hour]
            max_cap = max_base[name] * max(multiplier, 0.25)
            assert entry["spend"][name] <= max_cap + 1e-6
            if entry["spend"][name] > 0:
                assert entry["roi"][name] >= report["roas_floor"] - 0.2

    assert abs(total_spend - report["budget"]) <= report["budget"] * 0.02
    assert report["optimizer_diagnostics"]["optimizer"] in {
        "coordinate_ascent",
        "trust_constr",
        "differential_evolution",
        "projected_gradient",
        "fallback",
    }


def test_write_intraday_report(tmp_path: Path) -> None:
    output = tmp_path / "hf_response.json"
    report = write_intraday_report(output)

    assert output.exists()
    parsed = json.loads(output.read_text())
    assert parsed["budget"] == report["budget"]
    assert parsed["scenario"]["total_budget"] == report["scenario"]["total_budget"]


def test_generate_intraday_report_uses_cache(monkeypatch) -> None:
    from apps.allocator import hf_response

    hf_response._SCENARIO_CACHE.clear()
    call_counter = {"count": 0}

    def fake_optimise(scenario: hf_response.IntradayScenario, seed: int = 42):
        call_counter["count"] += 1
        allocation = hf_response.AllocationResult(
            spends={"meta_h00": 10.0},
            profit=5.0,
            diagnostics={"optimizer": "stub"},
        )
        meta = {
            "meta_h00": (
                scenario.channels[0],
                0,
                scenario.demand_profile[scenario.channels[0].name][0],
            )
        }
        return allocation, meta

    def fake_summarise(*_args, **_kwargs):
        timeline = [
            {
                "hour": hour,
                "spend": {"meta": 0.42},
                "revenue": {"meta": 0.63},
                "roi": {"meta": 1.5},
            }
            for hour in range(hf_response.HOURS_PER_DAY)
        ]
        return {
            "budget": 10.0,
            "total_revenue": 15.0,
            "profit": 5.0,
            "average_roas": 1.5,
            "roas_floor": 1.1,
            "channels": [
                {
                    "channel": "meta",
                    "total_spend": 10.0,
                    "total_revenue": 15.0,
                    "average_roas": 1.5,
                    "peak_roas": 2.0,
                    "saturation_spend": 100.0,
                    "max_hourly_spend": 5.0,
                    "min_hourly_spend": 1.0,
                }
            ],
            "timeline": timeline,
            "optimizer_diagnostics": {"optimizer": "stub", "success": 1.0},
        }

    monkeypatch.setattr(hf_response, "optimise_intraday_schedule", fake_optimise)
    monkeypatch.setattr(hf_response, "summarise_intraday_result", fake_summarise)

    scenario = hf_response.IntradayScenario(
        channels=[
            hf_response.IntradayChannel(
                name="meta",
                peak_roas=2.0,
                saturation_spend=100.0,
                diminishing=1.2,
                max_hourly_spend=5.0,
                min_hourly_spend=1.0,
            )
        ],
        demand_profile={"meta": [1.0] * hf_response.HOURS_PER_DAY},
        total_budget=10.0,
        roas_floor=1.1,
    )

    first = hf_response.generate_intraday_report(scenario=scenario, seed=7)
    second = hf_response.generate_intraday_report(scenario=scenario, seed=7)

    assert call_counter["count"] == 1
    assert first == second
    assert first is not second
