from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from apps.worker.monitoring import MonitoringThresholds, update_dq_monitoring


def _build_report(
    *,
    row_count: int,
    geocoded_ratio: float | None = 1.0,
    status: str = "ok",
    issues: list[str] | None = None,
    new_rows: int | None = None,
    updated_rows: int | None = None,
) -> dict[str, object]:
    generated_at = datetime.now(timezone.utc)
    dataset = {
        "dataset": "shopify_orders",
        "status": status,
        "row_count": row_count,
        "issues": list(issues or []),
        "metadata": {},
        "path": "lake/tenant_shopify_orders/latest.parquet",
        "source": "stub",
    }
    if geocoded_ratio is not None:
        dataset["metadata"]["geocoded_ratio"] = geocoded_ratio
    if new_rows is not None:
        dataset["metadata"]["new_rows"] = new_rows
    if updated_rows is not None:
        dataset["metadata"]["updated_rows"] = updated_rows

    return {
        "tenant_id": "tenant-123",
        "generated_at": generated_at.isoformat(),
        "window": {
            "start": (generated_at - timedelta(days=1)).isoformat(),
            "end": generated_at.isoformat(),
        },
        "datasets": {"shopify_orders": dataset},
        "sources": {"shopify": "stub"},
    }


def test_update_dq_monitoring_creates_snapshot(tmp_path: Path) -> None:
    path = tmp_path / "dq_monitoring.json"
    report = _build_report(row_count=120, geocoded_ratio=0.92)

    run = update_dq_monitoring(report, monitoring_path=path)

    assert path.exists()
    payload = json.loads(path.read_text())
    assert payload["runs"]
    dataset = run["datasets"]["shopify_orders"]
    assert dataset["severity"] == "ok"
    assert dataset["history"]["row_count"] == [120]
    assert run["overall_severity"] == "ok"


def test_update_dq_monitoring_detects_drop_and_ratio(tmp_path: Path) -> None:
    path = tmp_path / "dq_monitoring.json"
    baseline = _build_report(row_count=100, geocoded_ratio=0.9)
    degraded = _build_report(row_count=10, geocoded_ratio=0.4)

    update_dq_monitoring(baseline, monitoring_path=path)
    run = update_dq_monitoring(degraded, monitoring_path=path)

    dataset = run["datasets"]["shopify_orders"]
    assert dataset["severity"] == "critical"
    assert "row_count_drop_critical" in dataset["alerts"]
    assert "geocoded_ratio_critical" in dataset["alerts"]
    assert dataset["history"]["row_count"] == [100, 10]
    assert dataset["history"]["geocoded_ratio"] == [0.9, 0.4]
    assert run["overall_severity"] == "critical"


def test_update_dq_monitoring_enforces_max_history(tmp_path: Path) -> None:
    path = tmp_path / "dq_monitoring.json"
    thresholds = MonitoringThresholds(history_length=3)

    for day in range(5):
        report = _build_report(row_count=day + 1, geocoded_ratio=0.8)
        update_dq_monitoring(
            report,
            monitoring_path=path,
            thresholds=thresholds,
            max_history=3,
        )

    payload = json.loads(path.read_text())
    assert len(payload["runs"]) == 3
    latest_dataset = payload["runs"][-1]["datasets"]["shopify_orders"]
    assert latest_dataset["history"]["row_count"][-1] == 5


def test_update_dq_monitoring_detects_new_rows_drop(tmp_path: Path) -> None:
    path = tmp_path / "dq_monitoring.json"
    thresholds = MonitoringThresholds(
        new_rows_baseline=10,
        new_rows_warning_drop=0.6,
        new_rows_critical_drop=0.2,
    )

    baseline = _build_report(row_count=100, geocoded_ratio=0.9, new_rows=50)
    degraded = _build_report(row_count=120, geocoded_ratio=0.9, new_rows=5)

    update_dq_monitoring(baseline, monitoring_path=path, thresholds=thresholds)
    run = update_dq_monitoring(degraded, monitoring_path=path, thresholds=thresholds)

    dataset = run["datasets"]["shopify_orders"]
    assert dataset["severity"] == "critical"
    assert "new_rows_drop_critical" in dataset["alerts"]
    assert dataset["metrics"]["new_rows"] == 5
    assert dataset["metrics"]["new_rows_change_pct"] < 0


def test_update_dq_monitoring_flags_zero_new_rows_streak(tmp_path: Path) -> None:
    path = tmp_path / "dq_monitoring.json"
    thresholds = MonitoringThresholds(
        zero_new_rows_warning_streak=2,
        zero_new_rows_critical_streak=3,
    )

    baseline = _build_report(row_count=80, geocoded_ratio=0.9, new_rows=20)
    update_dq_monitoring(baseline, monitoring_path=path, thresholds=thresholds)

    zero_payload = _build_report(row_count=80, geocoded_ratio=0.9, new_rows=0)
    update_dq_monitoring(zero_payload, monitoring_path=path, thresholds=thresholds)
    run = update_dq_monitoring(zero_payload, monitoring_path=path, thresholds=thresholds)
    dataset = run["datasets"]["shopify_orders"]

    assert "new_rows_zero_streak_warning" in dataset["alerts"]

    run = update_dq_monitoring(zero_payload, monitoring_path=path, thresholds=thresholds)
    dataset = run["datasets"]["shopify_orders"]
    assert "new_rows_zero_streak_critical" in dataset["alerts"]
    assert dataset["history"]["new_rows"][-3:] == [0, 0, 0]
