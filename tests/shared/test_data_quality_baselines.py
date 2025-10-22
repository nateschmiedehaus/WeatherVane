from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from shared.data_quality.baselines import (
    build_baseline_payload,
    build_geocoding_report,
    compute_dataset_baselines,
    compute_geocoding_stats,
    generate_reports,
)


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True))


def test_compute_dataset_baselines_produces_stats() -> None:
    runs = [
        {
            "datasets": {
                "shopify_orders": {
                    "row_count": 240,
                    "metrics": {"new_rows": 48, "updated_rows": 12, "geocoded_ratio": 0.92},
                    "alerts": ["row_count_drop_warning"],
                    "severity": "warning",
                }
            }
        },
        {
            "datasets": {
                "shopify_orders": {
                    "row_count": 250,
                    "metrics": {"new_rows": 52, "updated_rows": 10, "geocoded_ratio": 0.9},
                    "severity": "ok",
                }
            }
        },
    ]

    baselines = compute_dataset_baselines(runs)

    assert set(baselines) == {"shopify_orders"}
    orders = baselines["shopify_orders"]
    assert orders["row_count"]["min"] == pytest.approx(240)
    assert orders["row_count"]["max"] == pytest.approx(250)
    assert orders["row_count"]["count"] == 2
    assert orders["geocoded_ratio"]["mean"] == pytest.approx(0.91, rel=1e-3)
    assert orders["top_alerts"][0]["code"] == "row_count_drop_warning"
    assert orders["severity_distribution"]["warning"] == 1
    guardrails = orders["recommended_guardrails"]
    assert guardrails["geocoded_ratio"]["warning"] == pytest.approx(0.88)
    assert guardrails["row_count_drop"]["critical"] == pytest.approx(0.6)


def test_compute_geocoding_stats_flags_under_threshold(tmp_path: Path) -> None:
    tenant_a = tmp_path / "geocoding" / "tenant-a.json"
    tenant_b = tmp_path / "geocoding" / "tenant-b.json"
    _write_json(
        tenant_a,
        {
            "tenant_id": "tenant-a",
            "ratio": 0.82,
            "row_count": 120,
            "status": "warning",
            "details": {"threshold": 0.85},
        },
    )
    _write_json(
        tenant_b,
        {
            "tenant_id": "tenant-b",
            "ratio": 0.94,
            "row_count": 300,
            "status": "ok",
            "details": {"threshold": 0.85},
        },
    )

    stats = compute_geocoding_stats(sorted((tenant_a, tenant_b)))

    assert stats["ratio_summary"]["min"] == pytest.approx(0.82)
    assert stats["ratio_summary"]["max"] == pytest.approx(0.94)
    assert stats["tenants_below_threshold"] == ["tenant-a"]


def test_generate_reports_integration(tmp_path: Path) -> None:
    dq_path = tmp_path / "state" / "dq_monitoring.json"
    runs = [
        {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "datasets": {
                "shopify_orders": {
                    "row_count": 240,
                    "metrics": {"geocoded_ratio": 0.91, "new_rows": 48},
                    "alerts": [],
                    "severity": "ok",
                }
            },
        }
    ]
    _write_json(dq_path, {"runs": runs})

    geocoding_root = tmp_path / "storage" / "metadata" / "state" / "geocoding"
    _write_json(
        geocoding_root / "tenant.json",
        {
            "tenant_id": "tenant",
            "ratio": 0.9,
            "row_count": 200,
            "status": "ok",
            "details": {"threshold": 0.85},
        },
    )

    weather_report = tmp_path / "experiments" / "features" / "weather_join_validation.json"
    _write_json(
        weather_report,
        {
            "coverage": {
                "unique_geohash_count": 2,
                "geohashes": [{"geohash": "9q8yy", "row_count": 10, "target_rows": 12}],
            },
            "join": {
                "geocoded_order_ratio": 0.91,
                "feature_rows": 180,
                "orders_rows": 200,
                "weather_rows": 210,
            },
        },
    )

    baseline_output = tmp_path / "out" / "data_quality_baselines.json"
    coverage_output = tmp_path / "out" / "geocoding_coverage_report.json"

    generate_reports(dq_path, geocoding_root, weather_report, baseline_output, coverage_output)

    baseline_payload = json.loads(baseline_output.read_text())
    assert baseline_payload["datasets"]["shopify_orders"]["geocoded_ratio"]["mean"] == pytest.approx(0.91)

    coverage_payload = json.loads(coverage_output.read_text())
    assert coverage_payload["geocoding"]["ratio_summary"]["count"] == 1
    assert coverage_payload["weather"]["unique_geohash_count"] == 2
    assert coverage_payload["weather"]["geocoded_order_ratio"] == pytest.approx(0.91)
