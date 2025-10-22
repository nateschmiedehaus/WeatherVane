from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from apps.model.ensemble import run_multi_horizon_ensemble, save_ensemble_metrics_as_json


def _build_design_matrix(days: int = 30) -> dict[str, list]:
    start = date(2024, 1, 1)
    dates = [start + timedelta(days=idx) for idx in range(days)]
    temp_c = [10.0 + 0.5 * idx for idx in range(days)]
    meta_spend = [100.0 + 5.0 * np.sin(idx / 4.0) for idx in range(days)]
    revenue = [200.0 + 8.0 * idx + 0.75 * temp_c[idx] for idx in range(days)]
    return {
        "date": [value.isoformat() for value in dates],
        "temp_c": temp_c,
        "temp_roll7": temp_c,
        "precip_mm": [0.25 * np.cos(idx / 5.0) for idx in range(days)],
        "meta_spend": meta_spend,
        "net_revenue": revenue,
        "target_available": [True] * days,
    }


def _build_weather_rows(horizon: int = 3) -> list[dict[str, float | str]]:
    start = date(2024, 1, 31)
    rows: list[dict[str, float | str]] = []
    for offset in range(1, horizon + 1):
        current = start + timedelta(days=offset)
        rows.append(
            {
                "date": current.isoformat(),
                "temp_c": 12.0 + offset,
                "temp_roll7": 12.0 + offset,
                "precip_mm": 0.5,
                "observation_type": "forecast",
            }
        )
    return rows


def test_run_multi_horizon_ensemble_produces_forecasts():
    design_matrix = _build_design_matrix()
    weather_rows = _build_weather_rows()
    result = run_multi_horizon_ensemble(design_matrix, weather_rows, horizon_days=3, seed=123)

    assert result.forecasts, "Expected forecasts to be generated"
    assert len(result.forecasts) == 3

    horizons = {point.horizon_days for point in result.forecasts}
    assert horizons == {1, 2, 3}

    for point in result.forecasts:
        assert set(point.quantiles.keys()) == {"p10", "p50", "p90"}
        assert point.quantiles["p10"] <= point.quantiles["p50"] <= point.quantiles["p90"]

    weights = result.metrics["component_weights"]
    assert abs(sum(weights.values()) - 1.0) < 1e-6
    assert result.metrics["forecast_rows"] == 3


def test_save_ensemble_metrics_as_json(tmp_path: Path):
    design_matrix = _build_design_matrix()
    weather_rows = _build_weather_rows()
    result = run_multi_horizon_ensemble(design_matrix, weather_rows, horizon_days=2, seed=2024)

    output_path = tmp_path / "ensemble.json"
    save_ensemble_metrics_as_json(result, output_path)
    assert output_path.exists()

    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert "forecasts" in payload
    assert "metrics" in payload
    assert "diagnostics" in payload
    assert len(payload["forecasts"]) == 2


def test_run_multi_horizon_ensemble_handles_suffix_collisions():
    design_matrix = _build_design_matrix()
    count = len(design_matrix["date"])
    design_matrix.update(
        {
            "geo_level": ["dma"] * count,
            "geo_level_right": ["dma"] * count,
            "state_abbr": ["CA"] * count,
            "state_abbr_right": ["CA"] * count,
        }
    )

    result = run_multi_horizon_ensemble(design_matrix, horizon_days=3, seed=77)

    assert result.forecasts, "Expected ensemble to produce forecasts with duplicated geo columns"
    assert len(result.forecasts) == 3
    assert result.metrics["forecast_rows"] == 3
