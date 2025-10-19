from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Mapping

import pytest

from apps.worker.reporting.dashboard import (
    load_suggestion_telemetry,
    load_suggestion_telemetry_with_summary,
)
from apps.worker.validation.harness import run_ingest_to_plan_harness
from shared.observability import metrics
from shared.services.dashboard_analytics import (
    DashboardSuggestionEvent,
    record_dashboard_suggestion_event,
)
from shared.schemas.dashboard import DashboardSuggestionTelemetry


def _emit_sample_suggestion_events(
    base_time: datetime,
    *,
    tenant_id: str = "demo-tenant",
    region: str = "Gulf Coast",
    reason: str = "High-risk weather events incoming.",
    metadata: Mapping[str, object] | None = None,
) -> None:
    metadata_payload = {
        "layoutVariant": "dense",
        "tenantMode": "demo",
        "guardrailStatus": "watch",
        "criticalAlertCount": 4,
    }
    if metadata:
        metadata_payload.update(metadata)
    view_event = DashboardSuggestionEvent(
        tenant_id=tenant_id,
        name="dashboard.weather_focus.suggestion.view",
        region=region,
        severity="high",
        high_risk_count=2,
        event_count=3,
        next_event_starts_at="2025-05-01T14:00:00Z",
        has_scheduled_start=True,
        viewport_breakpoint="desktop",
        reason=reason,
        occurred_at=base_time,
        metadata=metadata_payload,
    )
    focus_event = DashboardSuggestionEvent(
        tenant_id=tenant_id,
        name="dashboard.weather_focus.suggestion.focus",
        region=region,
        severity="high",
        high_risk_count=2,
        event_count=3,
        next_event_starts_at="2025-05-01T14:00:00Z",
        has_scheduled_start=True,
        viewport_breakpoint="desktop",
        reason=reason,
        occurred_at=base_time + timedelta(minutes=2),
        metadata=metadata_payload,
    )
    record_dashboard_suggestion_event(view_event)
    record_dashboard_suggestion_event(focus_event)


def test_load_suggestion_telemetry_includes_rate_fields(tmp_path: Path) -> None:
    metrics.reset_run_directory()
    run_dir = metrics.configure_run(base_dir=str(tmp_path), ensure_clean=True)

    base_time = datetime(2025, 5, 1, 12, 0, tzinfo=timezone.utc)
    stale_time = base_time - timedelta(days=3)
    _emit_sample_suggestion_events(stale_time)
    _emit_sample_suggestion_events(base_time)

    telemetry = load_suggestion_telemetry(run_dir)

    assert telemetry, "expected telemetry entries from metrics file"
    entry = telemetry[0]
    assert entry.focus_rate == pytest.approx(1.0)
    assert entry.dismiss_rate == pytest.approx(0.0)
    assert entry.engagement_rate == pytest.approx(1.0)

    metrics.reset_run_directory()


def test_load_suggestion_telemetry_with_summary_surfaces_rates(tmp_path: Path) -> None:
    metrics.reset_run_directory()
    run_dir = metrics.configure_run(base_dir=str(tmp_path), ensure_clean=True)

    base_time = datetime(2025, 5, 1, 12, 0, tzinfo=timezone.utc)
    _emit_sample_suggestion_events(base_time)

    telemetry, summary = load_suggestion_telemetry_with_summary(run_dir)

    assert telemetry, "expected telemetry entries from metrics file"
    assert summary.total_suggestions == len(telemetry)
    assert summary.average_focus_rate == pytest.approx(1.0)
    assert summary.average_dismiss_rate == pytest.approx(0.0)
    assert summary.average_engagement_rate == pytest.approx(1.0)
    assert summary.top_signature == telemetry[0].signature
    assert summary.top_focus_rate == pytest.approx(1.0)
    assert summary.top_engagement_rate == pytest.approx(1.0)

    metrics.reset_run_directory()


def test_api_and_worker_suggestion_telemetry_alignment(tmp_path: Path) -> None:
    metrics.reset_run_directory()
    run_dir = metrics.configure_run(base_dir=str(tmp_path), ensure_clean=True)

    base_time = datetime(2025, 5, 1, 12, 0, tzinfo=timezone.utc)
    _emit_sample_suggestion_events(base_time)

    try:
        from apps.api.services.dashboard_service import DashboardService
    except ModuleNotFoundError as exc:  # pragma: no cover - environment misconfiguration
        pytest.fail(f"Failed to import DashboardService: {exc}")

    service = DashboardService(suggestion_metrics_root=run_dir)
    api_entries = service._load_suggestion_telemetry("demo-tenant")
    worker_entries = load_suggestion_telemetry(run_dir, tenant_id="demo-tenant")

    assert api_entries, "expected API service to surface suggestion telemetry"
    assert worker_entries, "expected worker loader to surface suggestion telemetry"
    assert len(api_entries) == len(worker_entries)

    api_payloads = [entry.model_dump(mode="json") for entry in api_entries]
    worker_payloads = [entry.model_dump(mode="json") for entry in worker_entries]
    assert api_payloads == worker_payloads

    since = base_time - timedelta(days=1)
    api_filtered = service._load_suggestion_telemetry("demo-tenant", since=since)
    worker_filtered = load_suggestion_telemetry(run_dir, tenant_id="demo-tenant", since=since)

    assert api_filtered, "expected API service to surface telemetry after applying since filter"
    assert worker_filtered, "expected worker loader to surface telemetry after applying since filter"
    assert len(api_filtered) == len(worker_filtered) == 1
    assert api_filtered[0].last_occurred_at is not None
    assert api_filtered[0].last_occurred_at >= since
    assert api_filtered[0].model_dump(mode="json") == worker_filtered[0].model_dump(mode="json")

    metrics.reset_run_directory()


def test_worker_suggestion_telemetry_filters_by_tenant(tmp_path: Path) -> None:
    metrics.reset_run_directory()
    run_dir = metrics.configure_run(base_dir=str(tmp_path), ensure_clean=True)

    base_time = datetime(2025, 5, 1, 12, 0, tzinfo=timezone.utc)
    _emit_sample_suggestion_events(base_time)
    _emit_sample_suggestion_events(
        base_time + timedelta(minutes=5),
        tenant_id="alt-tenant",
        region="Pacific Northwest",
        reason="Monitoring rain bands headed for the coast.",
        metadata={"guardrailStatus": "healthy"},
    )

    all_entries = load_suggestion_telemetry(run_dir)
    primary_entries = load_suggestion_telemetry(run_dir, tenant_id="demo-tenant")
    alt_entries = load_suggestion_telemetry(run_dir, tenant_id="alt-tenant")

    assert len(all_entries) >= 2
    assert primary_entries
    assert alt_entries
    assert all("demo-tenant" in entry.tenants for entry in primary_entries)
    assert all("alt-tenant" not in entry.tenants for entry in primary_entries)
    assert all("alt-tenant" in entry.tenants for entry in alt_entries)

    primary = next(entry for entry in primary_entries if entry.region == "Gulf Coast")
    alt = next(entry for entry in alt_entries if entry.region == "Pacific Northwest")

    assert primary.view_count == 1
    assert primary.focus_count == 1
    assert primary.focus_rate == pytest.approx(1.0)
    assert alt.view_count == 1
    assert alt.focus_count == 1
    assert alt.focus_rate == pytest.approx(1.0)

    metrics.reset_run_directory()


def test_load_suggestion_telemetry_since_filters_entries(tmp_path: Path) -> None:
    metrics.reset_run_directory()
    run_dir = metrics.configure_run(base_dir=str(tmp_path), ensure_clean=True)

    base_time = datetime(2025, 5, 1, 12, 0, tzinfo=timezone.utc)
    _emit_sample_suggestion_events(base_time, region="Gulf Coast", reason="Primary live signal.")
    stale_time = base_time - timedelta(days=2)
    _emit_sample_suggestion_events(
        stale_time,
        region="Northern Plains",
        reason="Legacy weather window; should be filtered when requesting fresh telemetry.",
    )

    telemetry = load_suggestion_telemetry(run_dir)
    assert len(telemetry) == 2

    since = base_time - timedelta(days=1)
    filtered = load_suggestion_telemetry(run_dir, since=since)
    assert len(filtered) == 1
    assert filtered[0].region == "Gulf Coast"
    assert filtered[0].last_occurred_at is not None
    assert filtered[0].last_occurred_at >= since

    metrics.reset_run_directory()


def test_load_suggestion_telemetry_with_summary_respects_since(tmp_path: Path) -> None:
    metrics.reset_run_directory()
    run_dir = metrics.configure_run(base_dir=str(tmp_path), ensure_clean=True)

    base_time = datetime(2025, 5, 1, 12, 0, tzinfo=timezone.utc)
    _emit_sample_suggestion_events(base_time, region="Atlantic Coast", reason="Active engagement story.")
    _emit_sample_suggestion_events(
        base_time - timedelta(days=3),
        region="Great Lakes",
        reason="Dormant signal awaiting refresh.",
    )

    since = base_time - timedelta(hours=6)
    telemetry, summary = load_suggestion_telemetry_with_summary(run_dir, since=since)

    assert len(telemetry) == 1
    active = telemetry[0]
    assert active.region == "Atlantic Coast"
    assert summary.total_suggestions == 1
    assert summary.top_signature == active.signature
    assert summary.top_region == active.region

    metrics.reset_run_directory()


@pytest.mark.asyncio
async def test_harness_artifacts_surface_suggestion_rates(monkeypatch, tmp_path: Path) -> None:
    metrics.reset_run_directory()
    run_dir = metrics.configure_run(base_dir=str(tmp_path), ensure_clean=True)

    base_time = datetime(2025, 5, 1, 12, 0, tzinfo=timezone.utc)
    _emit_sample_suggestion_events(base_time)

    async def _fake_flow(
        *,
        tenant_id: str,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
    ) -> dict[str, object]:
        return {
            "plan": {"status": "FULL", "guardrails": {}},
            "geocoding_validation": {"status": "ok"},
            "sources": {"shopify": "stub"},
            "data_context": {"tags": ["history.short"]},
            "shopify_summary": {"orders": 1},
            "ads_summary": {"meta_rows": 0},
        }

    monkeypatch.setattr(
        "apps.worker.validation.harness.orchestrate_poc_flow",
        _fake_flow,
    )

    artifacts = await run_ingest_to_plan_harness(
        "demo-tenant",
        start_date=base_time - timedelta(days=7),
        end_date=base_time,
    )

    assert artifacts.suggestion_telemetry, "expected harness to expose suggestion telemetry"
    entry = artifacts.suggestion_telemetry[0]
    assert entry.focus_rate == pytest.approx(1.0)
    assert entry.engagement_rate == pytest.approx(1.0)

    summary = artifacts.suggestion_telemetry_summary
    assert summary is not None
    assert summary.total_suggestions == len(artifacts.suggestion_telemetry)
    assert summary.average_focus_rate == pytest.approx(1.0)
    assert summary.top_signature == entry.signature
    assert summary.top_region == entry.region
    assert summary.top_engagement_confidence_level == "low"
    assert summary.top_engagement_confidence_label == "Low sample · 1 views"

    assert "suggestion_telemetry" in artifacts.raw
    raw_entry = artifacts.raw["suggestion_telemetry"][0]
    assert raw_entry["focus_rate"] == pytest.approx(1.0)
    assert raw_entry["dismiss_rate"] == pytest.approx(0.0)
    raw_summary = artifacts.raw["suggestion_telemetry_summary"]
    assert raw_summary["average_focus_rate"] == pytest.approx(1.0)
    assert raw_summary["average_engagement_rate"] == pytest.approx(1.0)
    assert raw_summary["top_engagement_rate"] == pytest.approx(1.0)
    assert raw_summary["top_signature"] == entry.signature

    metrics_file = metrics.get_run_directory() / "metrics.jsonl"
    records = [json.loads(line) for line in metrics_file.read_text().splitlines() if line]
    telemetry_records = [record for record in records if record["event"] == "harness.suggestion_telemetry"]
    assert telemetry_records, "expected metrics event capturing suggestion telemetry summary"
    emitted_payload = telemetry_records[-1]["payload"]
    assert emitted_payload["average_focus_rate"] == pytest.approx(1.0)
    assert emitted_payload["top_signature"] == entry.signature
    assert emitted_payload["top_engagement_rate"] == pytest.approx(1.0)
    assert emitted_payload["top_engagement_confidence_level"] == "low"
    assert emitted_payload["top_engagement_confidence_label"] == "Low sample · 1 views"

    metrics.reset_run_directory()
