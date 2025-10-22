from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest

from apps.worker.monitoring.modeling_watch import (
    ModelingDataWatchError,
    ModelingWatchConfig,
    run_modeling_data_watch,
)


def _write_monitoring(payload: dict[str, object], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def test_modeling_data_watch_pass(tmp_path: Path) -> None:
    monitoring_path = tmp_path / "dq.json"
    summary_path = tmp_path / "summary.json"
    now = datetime.now(timezone.utc)
    payload = {
        "runs": [
            {
                "timestamp": now.isoformat(),
                "overall_severity": "ok",
                "alerts": [],
                "datasets": {
                    "shopify_orders": {
                        "severity": "ok",
                        "alerts": [],
                        "row_count": 120,
                        "metadata": {"geocoded_ratio": 0.92},
                    }
                },
            }
        ]
    }
    _write_monitoring(payload, monitoring_path)

    summary = run_modeling_data_watch(
        monitoring_path=monitoring_path,
        summary_path=summary_path,
        config=ModelingWatchConfig(max_staleness_hours=48),
        now=now,
    )

    assert summary["status"] == "ok"
    assert summary_path.exists()


def test_modeling_data_watch_detects_alert(tmp_path: Path) -> None:
    monitoring_path = tmp_path / "dq.json"
    summary_path = tmp_path / "summary.json"
    now = datetime.now(timezone.utc)
    payload = {
        "runs": [
            {
                "timestamp": now.isoformat(),
                "overall_severity": "warning",
                "alerts": ["geocoded_ratio_warning"],
                "datasets": {
                    "shopify_orders": {
                        "severity": "warning",
                        "alerts": ["geocoded_ratio_critical"],
                        "row_count": 12,
                        "metadata": {"geocoded_ratio": 0.5},
                    }
                },
            }
        ]
    }
    _write_monitoring(payload, monitoring_path)

    with pytest.raises(ModelingDataWatchError) as excinfo:
        run_modeling_data_watch(
            monitoring_path=monitoring_path,
            summary_path=summary_path,
            config=ModelingWatchConfig(max_staleness_hours=48),
            now=now,
        )

    message = str(excinfo.value)
    assert "critical" in message
    assert "Failing alerts" in message


def test_modeling_data_watch_detects_staleness(tmp_path: Path) -> None:
    monitoring_path = tmp_path / "dq.json"
    summary_path = tmp_path / "summary.json"
    now = datetime.now(timezone.utc)
    stale_time = now - timedelta(hours=50)
    payload = {
        "runs": [
            {
                "timestamp": stale_time.isoformat(),
                "overall_severity": "ok",
                "alerts": [],
                "datasets": {
                    "shopify_orders": {
                        "severity": "ok",
                        "alerts": [],
                        "row_count": 100,
                        "metadata": {},
                    }
                },
            }
        ]
    }
    _write_monitoring(payload, monitoring_path)

    with pytest.raises(ModelingDataWatchError) as excinfo:
        run_modeling_data_watch(
            monitoring_path=monitoring_path,
            summary_path=summary_path,
            config=ModelingWatchConfig(max_staleness_hours=24),
            now=now,
        )

    message = str(excinfo.value).lower()
    assert "50.0h" in message or "max 24h" in message
