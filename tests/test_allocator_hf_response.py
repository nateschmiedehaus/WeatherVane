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
    assert report["optimizer_diagnostics"]["optimizer"] in {"coordinate_ascent", "trust_constr", "differential_evolution", "fallback"}


def test_write_intraday_report(tmp_path: Path) -> None:
    output = tmp_path / "hf_response.json"
    report = write_intraday_report(output)

    assert output.exists()
    parsed = json.loads(output.read_text())
    assert parsed["budget"] == report["budget"]
    assert parsed["scenario"]["total_budget"] == report["scenario"]["total_budget"]
