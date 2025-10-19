from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from shared.observability import metrics
from shared.services.dashboard_analytics import DashboardSuggestionEvent, record_dashboard_suggestion_event
from shared.services.dashboard_analytics_ingestion import (
    DashboardSuggestionMetricRecord,
    aggregate_dashboard_suggestion_metrics,
    load_dashboard_suggestion_metrics,
)


def test_load_dashboard_suggestion_metrics_filters_and_canonicalises(tmp_path):
    metrics_file = tmp_path / "metrics.jsonl"
    canonical_signature = "Gulf Coast|High-risk weather events incoming.|2025-05-01T14:00:00Z|2|3"
    valid_record = {
        "timestamp": "2025-05-01T12:00:00Z",
        "event": "dashboard.weather_focus.suggestion",
        "payload": {
            "tenant_id": "demo-tenant",
            "event": "dashboard.weather_focus.suggestion.view",
            "action": "view",
            "region": "Gulf Coast",
            "severity": "high",
            "high_risk_count": 2,
            "event_count": 3,
            "next_event_starts_at": "2025-05-01T14:00:00Z",
            "has_scheduled_start": True,
            "viewport_breakpoint": "desktop",
            "reason": "High-risk weather events incoming.",
            "occurred_at": "2025-05-01T12:00:00Z",
            "metadata": {
                "layoutVariant": "dense",
                "ctaShown": True,
                "signature": "   ",
            },
        },
    }
    unrelated_record = {
        "timestamp": "2025-05-01T12:01:00Z",
        "event": "retention.sweep_summary",
        "payload": {"tenant_id": "demo-tenant"},
    }
    metrics_file.write_text(
        "\n".join(
            [
                "not-json",
                json.dumps(unrelated_record),
                json.dumps(valid_record),
            ]
        ),
        encoding="utf-8",
    )

    records = load_dashboard_suggestion_metrics(metrics_file)

    assert len(records) == 1
    record = records[0]
    assert record.signature == canonical_signature
    assert record.metadata["signature"] == canonical_signature
    assert record.action == "view"
    assert record.tenant_id == "demo-tenant"


def test_aggregate_dashboard_suggestion_metrics_rolls_up_counts(tmp_path, monkeypatch):
    metrics_root = tmp_path / "metrics"
    monkeypatch.setenv("METRICS_OUTPUT_DIR", str(metrics_root))
    metrics.reset_run_directory()
    run_dir = metrics.configure_run(base_dir=str(metrics_root), ensure_clean=True)

    base_time = datetime(2025, 5, 1, 12, 0, tzinfo=timezone.utc)
    canonical_signature = "Gulf Coast|High-risk weather events incoming.|2025-05-01T14:00:00Z|2|3"

    view_event = DashboardSuggestionEvent(
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
        occurred_at=base_time,
        metadata={
            "layoutVariant": "dense",
            "ctaShown": True,
            "tenantMode": "live",
            "guardrailStatus": "watch",
            "criticalAlertCount": 4,
            "regionSummary": "3 events · 2 high-risk alerts · Next starts in 2 hours",
            "suggestionSummary": "High-risk weather events incoming.",
        },
    )
    focus_event = DashboardSuggestionEvent(
        tenant_id="demo-tenant",
        name="dashboard.weather_focus.suggestion.focus",
        region="Gulf Coast",
        severity="high",
        high_risk_count=2,
        event_count=3,
        next_event_starts_at="2025-05-01T14:00:00Z",
        has_scheduled_start=True,
        viewport_breakpoint="desktop",
        reason="High-risk weather events incoming.",
        occurred_at=base_time + timedelta(minutes=5),
        metadata={
            "regionSlug": "gulf-coast",
            "ctaShown": False,
            "tenantMode": "demo",
            "guardrailStatus": "breach",
            "criticalAlertCount": 6,
        },
    )
    second_signature_event = DashboardSuggestionEvent(
        tenant_id="demo-tenant",
        name="dashboard.weather_focus.suggestion.dismiss",
        region="Pacific Northwest",
        severity="medium",
        high_risk_count=1,
        event_count=1,
        next_event_starts_at="2025-05-02T08:00:00Z",
        has_scheduled_start=False,
        viewport_breakpoint="tablet",
        reason="Monitoring heavy rain bands.",
        occurred_at=base_time + timedelta(minutes=10),
        metadata={"layoutVariant": "stacked"},
    )

    record_dashboard_suggestion_event(view_event)
    record_dashboard_suggestion_event(focus_event)
    record_dashboard_suggestion_event(second_signature_event)

    metrics_file = run_dir / "metrics.jsonl"
    records = load_dashboard_suggestion_metrics(metrics_file)
    aggregates = aggregate_dashboard_suggestion_metrics(records)

    assert len(records) == 3
    assert len(aggregates) == 2

    by_signature = {aggregate.signature: aggregate for aggregate in aggregates}
    first = by_signature[canonical_signature]
    second = by_signature["Pacific Northwest|Monitoring heavy rain bands.|2025-05-02T08:00:00Z|1|1"]

    assert first.view_count == 1
    assert first.focus_count == 1
    assert first.dismiss_count == 0
    assert first.event_count == 3
    assert first.metadata["signature"] == canonical_signature
    assert first.metadata["layoutVariant"] == "dense"
    assert first.metadata["regionSlug"] == "gulf-coast"
    assert first.metadata["ctaShown"] is True
    assert first.metadata["tenantMode"] == "demo"
    assert first.metadata["guardrailStatus"] == "breach"
    assert first.metadata["criticalAlertCount"] == 6
    assert first.metadata["regionSummary"] == "3 events · 2 high-risk alerts · Next starts in 2 hours"
    assert first.metadata["suggestionSummary"] == "High-risk weather events incoming."
    assert sorted(first.viewport_breakpoints) == ["desktop"]
    assert sorted(first.severities) == ["high"]
    assert sorted(first.tenants) == ["demo-tenant"]
    assert first.first_occurred_at == base_time
    assert first.last_occurred_at == base_time + timedelta(minutes=5)
    assert first.next_event_starts_at == "2025-05-01T14:00:00Z"

    assert second.view_count == 0
    assert second.focus_count == 0
    assert second.dismiss_count == 1
    assert sorted(second.viewport_breakpoints) == ["tablet"]
    assert sorted(second.severities) == ["medium"]
    assert second.next_event_starts_at == "2025-05-02T08:00:00Z"
    assert sorted(second.tenants) == ["demo-tenant"]

    as_dict = first.to_dict()
    assert as_dict["signature"] == canonical_signature
    assert as_dict["view_count"] == 1
    assert as_dict["metadata"]["signature"] == canonical_signature
    assert as_dict["focus_rate"] == 1.0
    assert as_dict["dismiss_rate"] == 0.0
    assert as_dict["engagement_rate"] == 1.0

    metrics.reset_run_directory()


def test_dashboard_suggestion_aggregate_rates_handle_zero_views():
    aggregate = aggregate_dashboard_suggestion_metrics(
        [
            DashboardSuggestionMetricRecord(
                event="dashboard.weather_focus.suggestion.focus",
                action="focus",
                tenant_id="demo-tenant",
                region="Gulf Coast",
                reason="Testing rate calculation without views.",
                severity="medium",
                high_risk_count=0,
                event_count=1,
                has_scheduled_start=False,
                next_event_starts_at=None,
                occurred_at=datetime(2025, 5, 1, 12, 0, tzinfo=timezone.utc),
                recorded_at=datetime(2025, 5, 1, 12, 1, tzinfo=timezone.utc),
                viewport_breakpoint="desktop",
                metadata={"signature": "demo|rate-test|2025|0|1"},
                signature="demo|rate-test|2025|0|1",
                tags={},
            )
        ]
    )[0]

    payload = aggregate.to_dict()
    assert payload["view_count"] == 0
    assert payload["focus_count"] == 1
    assert payload["focus_rate"] == 0.0
    assert payload["dismiss_rate"] == 0.0
    assert payload["engagement_rate"] == 0.0
