from __future__ import annotations

import json
from datetime import datetime, timezone

from shared.observability import metrics
from shared.services.dashboard_analytics import (
    DashboardSuggestionEvent,
    generate_dashboard_suggestion_signature,
    record_dashboard_suggestion_event,
)


def test_record_dashboard_suggestion_event_emits_metrics(tmp_path, monkeypatch):
    monkeypatch.setenv("METRICS_OUTPUT_DIR", str(tmp_path))
    metrics.reset_run_directory()

    event = DashboardSuggestionEvent(
        tenant_id="demo-tenant",
        name="dashboard.weather_focus.suggestion.view",
        region="Gulf Coast",
        severity="high",
        high_risk_count=2,
        event_count=3,
        next_event_starts_at="2025-05-01T14:00:00Z",
        has_scheduled_start=True,
        viewport_breakpoint="desktop",
        reason="High-risk weather events incoming.",
        occurred_at=datetime(2025, 5, 1, 12, 0, tzinfo=timezone.utc),
        metadata={"viewport": "desktop"},
    )

    record_dashboard_suggestion_event(event)

    run_dir = metrics.get_run_directory()
    metrics_file = run_dir / "metrics.jsonl"
    assert metrics_file.exists()
    contents = metrics_file.read_text().strip().splitlines()
    assert len(contents) == 1
    record = json.loads(contents[0])
    assert record["event"] == "dashboard.weather_focus.suggestion"
    payload = record["payload"]
    assert payload["tenant_id"] == "demo-tenant"
    assert payload["action"] == "view"
    assert payload["region"] == "Gulf Coast"
    assert payload["next_event_starts_at"] == "2025-05-01T14:00:00Z"
    expected_signature = "Gulf Coast|High-risk weather events incoming.|2025-05-01T14:00:00Z|2|3"
    assert payload["metadata"]["viewport"] == "desktop"
    assert payload["metadata"]["signature"] == expected_signature
    metrics.reset_run_directory()


def test_generate_dashboard_suggestion_signature_matches_client_logic():
    event = DashboardSuggestionEvent(
        tenant_id="demo-tenant",
        name="dashboard.weather_focus.suggestion.focus",
        region="Gulf Coast",
        severity="high",
        high_risk_count=2,
        event_count=3,
        next_event_starts_at=" 2025-05-01T14:00:00Z ",
        has_scheduled_start=True,
        viewport_breakpoint="desktop",
        reason="High-risk weather events incoming.",
        metadata={},
    )

    signature = generate_dashboard_suggestion_signature(event)

    assert signature == "Gulf Coast|High-risk weather events incoming.|2025-05-01T14:00:00Z|2|3"


def test_record_dashboard_suggestion_event_backfills_signature(tmp_path, monkeypatch):
    monkeypatch.setenv("METRICS_OUTPUT_DIR", str(tmp_path))
    metrics.reset_run_directory()

    event = DashboardSuggestionEvent(
        tenant_id="demo-tenant",
        name="dashboard.weather_focus.suggestion.dismiss",
        region="Gulf Coast",
        severity="high",
        high_risk_count=2,
        event_count=3,
        next_event_starts_at="2025-05-01T14:00:00Z",
        has_scheduled_start=True,
        viewport_breakpoint="desktop",
        reason="High-risk weather events incoming.",
        metadata={"layoutVariant": "dense", "signature": "   "},
    )

    record_dashboard_suggestion_event(event)

    run_dir = metrics.get_run_directory()
    metrics_file = run_dir / "metrics.jsonl"
    assert metrics_file.exists()
    contents = metrics_file.read_text().strip().splitlines()
    assert len(contents) == 1
    record = json.loads(contents[0])
    metadata = record["payload"]["metadata"]
    assert metadata["layoutVariant"] == "dense"
    assert metadata["signature"] == "Gulf Coast|High-risk weather events incoming.|2025-05-01T14:00:00Z|2|3"
    metrics.reset_run_directory()
