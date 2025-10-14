import json
from datetime import datetime
from pathlib import Path

import polars as pl

from apps.worker.validation.weather import evaluate_weather_coverage
from shared.libs.storage.lake import LakeWriter, read_parquet
from shared.libs.testing.synthetic import seed_synthetic_tenant


def test_evaluate_weather_coverage_ok(tmp_path: Path) -> None:
    tenant_id = "tenantCoverage"
    seed_synthetic_tenant(tmp_path, tenant_id, days=30)

    start = datetime(2023, 12, 15)
    end = datetime(2024, 1, 7)
    report_path = tmp_path / "weather_join_report.json"
    summary_root = tmp_path / "state"

    result, report = evaluate_weather_coverage(
        tenant_id,
        start=start,
        end=end,
        lake_root=tmp_path,
        report_path=report_path,
        summary_root=summary_root,
    )

    assert result.status == "ok"
    assert result.guardrail_triggered is False
    assert result.weather_rows > 0
    assert result.leakage_rows == 0
    assert result.weather_missing_rows == 0
    assert report_path.exists()
    assert report["issues"] == []

    saved_path = summary_root / "weather" / f"{tenant_id}.json"
    assert saved_path.exists()
    payload = json.loads(saved_path.read_text())
    assert payload["status"] == "ok"
    assert payload["weather_rows"] == result.weather_rows


def test_evaluate_weather_coverage_guardrail_triggered(tmp_path: Path) -> None:
    tenant_id = "tenantCoverageLeakage"
    seed_synthetic_tenant(tmp_path, tenant_id, days=5)

    writer = LakeWriter(root=tmp_path)
    orders_path = writer.latest(f"{tenant_id}_shopify_orders")
    assert orders_path is not None
    orders_frame = read_parquet(orders_path)
    latest_date = (
        orders_frame.with_columns(pl.col("created_at").str.slice(0, 10).alias("date"))
        .get_column("date")
        .max()
    )
    assert latest_date is not None
    trimmed_orders = orders_frame.filter(pl.col("created_at").str.slice(0, 10) != latest_date)
    trimmed_orders.write_parquet(orders_path)

    start = datetime(2024, 1, 3)
    end = datetime(2024, 1, 7)
    report_path = tmp_path / "weather_join_report_leakage.json"

    result, report = evaluate_weather_coverage(
        tenant_id,
        start=start,
        end=end,
        lake_root=tmp_path,
        report_path=report_path,
        summary_root=None,
    )

    assert result.status == "error"
    assert result.guardrail_triggered is True
    assert result.leakage_rows > 0
    assert "Leakage guardrail" in " ".join(result.issues)
    assert report_path.exists()
    assert report["leakage"]["total_rows"] == result.leakage_rows
