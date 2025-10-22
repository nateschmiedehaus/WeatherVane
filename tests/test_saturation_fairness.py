from __future__ import annotations

import json

from apps.allocator.saturation_fairness import (
    Market,
    generate_saturation_report,
    optimise_cross_market_allocation,
)


def test_optimise_cross_market_respects_fairness_limits():
    markets = [
        Market(
            name="north",
            base_roas=2.3,
            saturation_spend=320.0,
            fairness_weight=1.0,
            current_spend=210.0,
            min_spend=140.0,
            max_spend=360.0,
            weather_multiplier=1.05,
            curvature=1.4,
        ),
        Market(
            name="south",
            base_roas=2.0,
            saturation_spend=280.0,
            fairness_weight=0.8,
            current_spend=150.0,
            min_spend=110.0,
            max_spend=320.0,
            weather_multiplier=0.98,
            curvature=1.3,
        ),
        Market(
            name="west",
            base_roas=2.6,
            saturation_spend=260.0,
            fairness_weight=0.6,
            current_spend=120.0,
            min_spend=90.0,
            max_spend=260.0,
            weather_multiplier=1.1,
            curvature=1.25,
        ),
    ]
    report = optimise_cross_market_allocation(
        markets,
        total_budget=560.0,
        fairness_floor=0.85,
        roas_floor=1.12,
        seed=5,
    )
    markets_report = report["markets"]
    total_spend = sum(entry["allocated_spend"] for entry in markets_report)
    assert total_spend > 0
    for entry in markets_report:
        share = entry["allocated_spend"] / total_spend
        assert share + 1e-6 >= entry["min_share"] - 1e-6
        assert entry["roas"] >= 1.12 - 1e-6
        assert abs(entry["fairness_gap"]) <= 1.0
        assert entry["floor_shortfall"] >= 0.0
        if entry["fair_share"] > 0:
            assert entry["fairness_ratio"] is not None
            assert entry["fairness_ratio"] >= 0.0
        else:
            assert entry["fairness_ratio"] is None
        assert abs(entry["spend_delta_vs_target"]) <= total_spend


def test_generate_saturation_report_writes_payload(tmp_path):
    destination = tmp_path / "saturation.json"
    payload = generate_saturation_report(
        output_path=str(destination),
        fairness_floor=0.75,
        roas_floor=1.18,
        seed=11,
    )
    assert destination.exists()
    stored = json.loads(destination.read_text())
    assert stored["fairness_floor"] == 0.75
    assert abs(payload["summary"]["profit"] - stored["summary"]["profit"]) <= 1e-9
    summary = stored["summary"]
    assert summary["under_allocated_markets"] >= 0
    assert summary["total_floor_shortfall"] >= 0.0
