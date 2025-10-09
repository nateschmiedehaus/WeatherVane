import json
from pathlib import Path

import pytest

from apps.model.feedback import calculate_summary, load_performance_records, prepare_backtest, run_performance_check
from apps.model.feedback.tracker import PerformanceRecord


def test_calculate_summary_basic():
    records = [
        PerformanceRecord(actual=120.0, predicted_p10=100.0, predicted_p50=130.0, predicted_p90=150.0, horizon_days=1, timestamp="2024-01-01T00:00:00Z"),
        PerformanceRecord(actual=90.0, predicted_p10=70.0, predicted_p50=100.0, predicted_p90=130.0, horizon_days=3, timestamp="2024-01-02T00:00:00Z"),
    ]
    summary = calculate_summary(records)
    assert summary.count == 2
    assert pytest.approx(summary.mae, rel=1e-2) == 10.0
    assert summary.coverage.coverage == 1.0

    timeline = prepare_backtest(records)
    assert len(timeline) == 2
    assert timeline[0]["timestamp"] == "2024-01-01T00:00:00Z"
    assert timeline[-1]["cumulative_actual"] > 0
    assert timeline[-1]["cumulative_lift"] == pytest.approx((130.0 + 100.0) - (120.0 + 90.0))


def test_load_and_run_performance_check(tmp_path: Path):
    payload = {
        "tenant_id": "demo",
        "records": [
            {
                "timestamp": "2024-01-01T00:00:00Z",
                "actual": 100.0,
                "predicted": {"p10": 80.0, "p50": 110.0, "p90": 140.0},
                "horizon_days": 1,
            },
            {
                "timestamp": "2024-01-02T00:00:00Z",
                "actual": 150.0,
                "predicted": {"p10": 120.0, "p50": 140.0, "p90": 180.0},
                "horizon_days": 3,
            },
        ],
    }
    store = tmp_path / "demo.json"
    store.write_text(json.dumps(payload))

    records = load_performance_records("demo", root=tmp_path)
    assert len(records) == 2

    result = run_performance_check("demo", root=tmp_path)
    assert result["status"] == "ok"
    summary = result["summary"]
    assert summary["count"] == 2
    assert 0 <= summary["coverage"]["coverage"] <= 1
    assert set(summary["coverage_by_horizon"].keys()) == {"1", "3"}

    low_threshold = run_performance_check("demo", root=tmp_path, coverage_threshold=1.01, emit_metrics=False)
    assert low_threshold["status"] == "coverage_below_threshold"
    assert low_threshold["failing_horizons"]


def test_run_performance_check_missing(tmp_path: Path):
    result = run_performance_check("missing", root=tmp_path)
    assert result["status"] == "missing_data"
