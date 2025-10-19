from __future__ import annotations

from datetime import datetime, timezone

import pytest

from shared.schemas.dashboard import DashboardSuggestionTelemetry
from shared.services.dashboard_analytics_summary import summarize_dashboard_suggestion_telemetry


def _build_entry(
    *,
    signature: str,
    region: str,
    reason: str,
    view_count: int,
    focus_count: int,
    dismiss_count: int,
    focus_rate: float,
    dismiss_rate: float,
    engagement_rate: float,
    last_occurred_at: datetime | None = None,
    metadata: dict[str, object] | None = None,
) -> DashboardSuggestionTelemetry:
    return DashboardSuggestionTelemetry(
        signature=signature,
        region=region,
        reason=reason,
        view_count=view_count,
        focus_count=focus_count,
        dismiss_count=dismiss_count,
        focus_rate=focus_rate,
        dismiss_rate=dismiss_rate,
        engagement_rate=engagement_rate,
        high_risk_count=2,
        event_count=3,
        has_scheduled_start=True,
        last_occurred_at=last_occurred_at,
        metadata=metadata or {},
    )


def test_summarize_handles_zero_views_with_rate_fallbacks() -> None:
    entries = [
        _build_entry(
            signature="sig-a",
            region="Region A",
            reason="Primary reason",
            view_count=0,
            focus_count=0,
            dismiss_count=0,
            focus_rate=0.6,
            dismiss_rate=0.2,
            engagement_rate=0.8,
            metadata={"guardrailStatus": "watch"},
            last_occurred_at=datetime(2025, 5, 1, 12, 0, tzinfo=timezone.utc),
        ),
        _build_entry(
            signature="sig-b",
            region="Region B",
            reason="Secondary reason",
            view_count=0,
            focus_count=0,
            dismiss_count=0,
            focus_rate=0.4,
            dismiss_rate=0.1,
            engagement_rate=0.5,
            metadata={"guardrailStatus": "healthy"},
            last_occurred_at=datetime(2025, 5, 1, 11, 0, tzinfo=timezone.utc),
        ),
    ]

    summary = summarize_dashboard_suggestion_telemetry(entries)

    assert summary.total_suggestions == 2
    assert summary.total_view_count == 0
    assert summary.average_focus_rate == pytest.approx(0.5)
    assert summary.average_engagement_rate == pytest.approx(0.65)
    assert summary.top_signature == "sig-a"
    assert summary.top_guardrail_status == "watch"
    assert summary.top_last_occurred_at == datetime(2025, 5, 1, 12, 0, tzinfo=timezone.utc)
    assert summary.top_engagement_confidence_level == "low"
    assert summary.top_engagement_confidence_label == "No direct views yet"
    assert summary.top_reason == "Primary reason"
    assert summary.top_region_summary == "Primary reason"


def test_summarize_selects_top_entry_by_engagement_then_focus() -> None:
    first = _build_entry(
        signature="sig-prime",
        region="Region Prime",
        reason="Primary reason",
        view_count=10,
        focus_count=5,
        dismiss_count=1,
        focus_rate=0.5,
        dismiss_rate=0.1,
        engagement_rate=0.6,
        metadata={"layoutVariant": "dense", "regionSummary": "Localized region wrap"},
        last_occurred_at=datetime(2025, 5, 1, 10, 0, tzinfo=timezone.utc),
    )
    contender = _build_entry(
        signature="sig-alt",
        region="Region Alt",
        reason="Alt reason",
        view_count=8,
        focus_count=3,
        dismiss_count=1,
        focus_rate=0.375,
        dismiss_rate=0.125,
        engagement_rate=0.5,
        metadata={"layoutVariant": "expanded"},
        last_occurred_at=datetime(2025, 5, 1, 11, 0, tzinfo=timezone.utc),
    )

    summary = summarize_dashboard_suggestion_telemetry([contender, first])

    assert summary.total_suggestions == 2
    assert summary.total_view_count == 18
    assert summary.total_focus_count == 8
    assert summary.top_signature == "sig-prime"
    assert summary.top_region == "Region Prime"
    assert summary.top_layout_variant == "dense"
    assert summary.top_focus_rate == pytest.approx(0.5)
    assert summary.top_engagement_rate == pytest.approx(0.6)
    assert summary.top_engagement_confidence_level == "medium"
    assert summary.top_engagement_confidence_label == "Directional signal · 10 views"
    assert summary.top_reason == "Primary reason"
    assert summary.top_region_summary == "Localized region wrap"


def test_summarize_prefers_high_confidence_over_perfect_rate() -> None:
    low_sample = _build_entry(
        signature="sig-low",
        region="Region Low Sample",
        reason="Only a handful of views so far.",
        view_count=1,
        focus_count=1,
        dismiss_count=0,
        focus_rate=1.0,
        dismiss_rate=0.0,
        engagement_rate=1.0,
        last_occurred_at=datetime(2025, 5, 1, 13, 0, tzinfo=timezone.utc),
    )
    high_confidence = _build_entry(
        signature="sig-stable",
        region="Region Stable",
        reason="Consistent engagement with heavier traffic.",
        view_count=80,
        focus_count=32,
        dismiss_count=8,
        focus_rate=0.4,
        dismiss_rate=0.1,
        engagement_rate=0.5,
        last_occurred_at=datetime(2025, 5, 1, 12, 30, tzinfo=timezone.utc),
    )

    summary = summarize_dashboard_suggestion_telemetry([low_sample, high_confidence])

    assert summary.top_signature == "sig-stable"
    assert summary.top_region == "Region Stable"
    assert summary.top_engagement_rate == pytest.approx(0.5)
    assert summary.top_engagement_confidence_level == "high"
    assert summary.top_engagement_confidence_label == "High confidence · 80 views"
    assert summary.top_reason == "Consistent engagement with heavier traffic."
    assert summary.top_region_summary == "Consistent engagement with heavier traffic."


def test_summary_confidence_uses_interactions_when_views_missing() -> None:
    entries = [
        _build_entry(
            signature="sig-zero",
            region="Region Zero",
            reason="No direct views recorded.",
            view_count=0,
            focus_count=4,
            dismiss_count=3,
            focus_rate=0.0,
            dismiss_rate=0.0,
            engagement_rate=0.0,
        ),
    ]

    summary = summarize_dashboard_suggestion_telemetry(entries)

    assert summary.top_engagement_confidence_level == "medium"
    assert summary.top_engagement_confidence_label == "Directional signal · 7 interactions"
