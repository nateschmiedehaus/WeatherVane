from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import polars as pl

from apps.worker.monitoring.weather_guardrail import (
    WeatherGuardrailError,
    WeatherGuardrailThresholds,
    run_weather_guardrail,
)
from shared.libs.storage.lake import LakeWriter, read_parquet
from shared.libs.testing.synthetic import seed_synthetic_tenant


def _latest_weather_path(root: Path, tenant_id: str) -> Path:
    writer = LakeWriter(root=root)
    path = writer.latest(f"{tenant_id}_weather_daily")
    assert path is not None
    return path


def test_weather_guardrail_seeds_baseline(tmp_path: Path) -> None:
    tenant_id = "tenantWeatherGuardrail"
    seed_synthetic_tenant(tmp_path, tenant_id, days=30)

    summary_path = tmp_path / "watch.json"
    baseline_path = tmp_path / "baseline.json"
    report_path = tmp_path / "report.json"

    summary = run_weather_guardrail(
        tenant_id,
        lookback_days=14,
        lake_root=tmp_path,
        summary_path=summary_path,
        baseline_path=baseline_path,
        report_path=report_path,
        coverage_summary_root=tmp_path / "state",
        thresholds=WeatherGuardrailThresholds(minimum_geocoded_ratio=0.5),
        now=datetime(2024, 1, 7, tzinfo=timezone.utc),
    )

    assert summary["status"] == "ok"
    assert summary_path.exists()
    assert baseline_path.exists()
    baseline_payload = baseline_path.read_text(encoding="utf-8")
    assert "tenantWeatherGuardrail" in baseline_payload


def test_weather_guardrail_detects_regression(tmp_path: Path) -> None:
    tenant_id = "tenantWeatherRegression"
    seed_synthetic_tenant(tmp_path, tenant_id, days=14)

    summary_path = tmp_path / "summary.json"
    baseline_path = tmp_path / "baseline.json"
    report_path = tmp_path / "report.json"

    run_weather_guardrail(
        tenant_id,
        lookback_days=10,
        lake_root=tmp_path,
        summary_path=summary_path,
        baseline_path=baseline_path,
        report_path=report_path,
        coverage_summary_root=tmp_path / "state",
        thresholds=WeatherGuardrailThresholds(minimum_geocoded_ratio=0.5),
        now=datetime(2024, 1, 7, tzinfo=timezone.utc),
    )

    weather_path = _latest_weather_path(tmp_path, tenant_id)
    frame = read_parquet(weather_path)
    trimmed = frame.filter(pl.col("date") != frame.get_column("date").max())
    trimmed.write_parquet(weather_path)

    if summary_path.exists():
        summary_path.unlink()
    if report_path.exists():
        report_path.unlink()

    try:
        run_weather_guardrail(
            tenant_id,
            lookback_days=10,
            lake_root=tmp_path,
            summary_path=summary_path,
            baseline_path=baseline_path,
            report_path=report_path,
            coverage_summary_root=tmp_path / "state",
            thresholds=WeatherGuardrailThresholds(minimum_geocoded_ratio=0.5, maximum_missing_rows=0),
            now=datetime(2024, 1, 8, tzinfo=timezone.utc),
        )
    except WeatherGuardrailError as exc:
        payload = str(exc)
        assert "critical" in payload
        assert "Weather missing rows increased" in payload or "guardrail" in payload
    else:  # pragma: no cover - defensive
        raise AssertionError("Expected guardrail to raise WeatherGuardrailError")
