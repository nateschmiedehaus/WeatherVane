from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest

from apps.worker.validation.tenant_coverage import evaluate_tenant_data_coverage
from shared.libs.storage.lake import LakeWriter


def _write_parquet_dataset(writer: LakeWriter, dataset: str, rows: list[dict[str, object]]) -> None:
    writer.write_records(dataset, rows)


def _orders_rows(tenant_id: str, dates: list[date]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for index, current in enumerate(dates):
        rows.append(
            {
                "tenant_id": tenant_id,
                "order_id": f"O-{index}",
                "name": f"Order {index}",
                "created_at": current.isoformat(),
                "currency": "USD",
                "total_price": 100.0,
                "subtotal_price": 90.0,
                "total_tax": 5.0,
                "total_discounts": 5.0,
                "ship_geohash": "9q8yy",
            }
        )
    return rows


def _meta_rows(tenant_id: str, dates: list[date]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for index, current in enumerate(dates):
        rows.append(
            {
                "tenant_id": tenant_id,
                "date": current.isoformat(),
                "campaign_id": f"C-{index}",
                "adset_id": f"A-{index}",
                "spend": 25.5,
                "impressions": 1200 + index,
                "clicks": 100 + index,
                "conversions": 4.0,
            }
        )
    return rows


def _google_rows(tenant_id: str, dates: list[date]) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for index, current in enumerate(dates):
        rows.append(
            {
                "tenant_id": tenant_id,
                "date": current.isoformat(),
                "campaign_id": f"G-{index}",
                "spend": 13.0,
                "impressions": 800 + index,
                "clicks": 55 + index,
                "conversions": 2.0,
            }
        )
    return rows


def test_evaluate_tenant_data_coverage_combines_sources(tmp_path: Path) -> None:
    tenant_id = "tenant-a"
    lake_root = tmp_path / "lake"
    writer = LakeWriter(root=lake_root)

    end_date = date(2024, 3, 31)
    window_days = 90

    order_dates = sorted(end_date - timedelta(days=offset) for offset in range(window_days))
    meta_dates = sorted(end_date - timedelta(days=offset) for offset in range(59, 19, -1))
    google_dates = sorted(end_date - timedelta(days=offset) for offset in range(19, -1, -1))

    _write_parquet_dataset(writer, f"{tenant_id}_shopify_orders", _orders_rows(tenant_id, order_dates))
    _write_parquet_dataset(writer, f"{tenant_id}_meta_ads", _meta_rows(tenant_id, meta_dates))
    _write_parquet_dataset(writer, f"{tenant_id}_google_ads", _google_rows(tenant_id, google_dates))

    weather_report = tmp_path / "weather.json"
    weather_payload = {
        "tenant_id": tenant_id,
        "generated_at": datetime.utcnow().isoformat(),
        "window": {"start": order_dates[0].isoformat(), "end": end_date.isoformat()},
        "join": {
            "mode": "geohash",
            "orders_rows": 220,
            "weather_rows": 220,
            "feature_rows": 215,
            "observed_target_rows": 215,
            "geocoded_order_ratio": 0.92,
        },
        "weather_gaps": {
            "rows": 5,
            "dates": ["2024-02-01", "2024-02-08", "2024-02-15", "2024-02-22", "2024-03-05"],
        },
        "coverage": {
            "unique_geohash_count": 6,
            "geohashes": [],
        },
        "issues": [],
    }
    weather_report.write_text(json.dumps(weather_payload, indent=2))

    summary = evaluate_tenant_data_coverage(
        tenant_id,
        lake_root=lake_root,
        weather_report_path=weather_report,
        window_days=90,
        end_date=end_date,
    )

    assert summary.status == "warning"
    sales = summary.buckets["sales"]
    spend = summary.buckets["spend"]
    weather = summary.buckets["weather"]

    assert sales.status == "ok"
    assert sales.observed_days == 90
    assert pytest.approx(sales.coverage_ratio) == 1.0
    assert spend.status == "warning"
    assert spend.observed_days == 60
    assert weather.status == "ok"
    assert weather.observed_days == 85
    assert weather.extra_metrics["geocoded_order_ratio"] == 0.92


def test_evaluate_tenant_data_coverage_handles_missing_sources(tmp_path: Path) -> None:
    tenant_id = "tenant-b"
    lake_root = tmp_path / "lake"
    writer = LakeWriter(root=lake_root)

    orders_start = date(2024, 1, 1)
    order_dates = [orders_start + timedelta(days=index) for index in range(10)]
    _write_parquet_dataset(writer, f"{tenant_id}_shopify_orders", _orders_rows(tenant_id, order_dates))

    summary = evaluate_tenant_data_coverage(
        tenant_id,
        lake_root=lake_root,
        weather_report_path=tmp_path / "missing_weather.json",
        window_days=30,
        end_date=date(2024, 1, 30),
    )

    assert summary.status == "critical"
    assert summary.buckets["sales"].status == "critical"
    assert summary.buckets["spend"].status == "critical"
    assert summary.buckets["weather"].status == "critical"
    assert any("Weather coverage report missing" in issue for issue in summary.buckets["weather"].issues)
