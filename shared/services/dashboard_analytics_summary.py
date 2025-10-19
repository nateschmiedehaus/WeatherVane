"""Summaries for WeatherOps dashboard suggestion telemetry."""

from __future__ import annotations

import math
from datetime import datetime, timezone
from statistics import fmean
from typing import Sequence

from shared.schemas.dashboard import (
    DashboardSuggestionTelemetry,
    DashboardSuggestionTelemetrySummary,
)

_HIGH_CONFIDENCE_VIEW_THRESHOLD = 60
_HIGH_CONFIDENCE_INTERACTION_THRESHOLD = 20
_MEDIUM_CONFIDENCE_VIEW_THRESHOLD = 20
_MEDIUM_CONFIDENCE_INTERACTION_THRESHOLD = 6
_CONFIDENCE_PRIORITY = {"low": 0, "medium": 1, "high": 2}


def _normalize_rate(value: float | int | None) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numeric) or numeric < 0:
        return None
    if numeric > 1:
        return 1.0
    return float(numeric)


def _aggregate_rate(
    numerator: int,
    denominator: int,
    fallbacks: Sequence[float],
) -> float:
    if denominator > 0 and numerator > 0:
        ratio = numerator / denominator
        if math.isfinite(ratio) and ratio > 0:
            return min(1.0, float(ratio))

    valid = [value for value in fallbacks if math.isfinite(value) and value >= 0]
    if valid:
        return float(min(1.0, max(0.0, fmean(valid))))
    return 0.0


def _compute_engagement_confidence(
    view_count: int,
    focus_count: int,
    dismiss_count: int,
) -> tuple[str, str]:
    engagement_count = focus_count + dismiss_count

    if view_count <= 0:
        if engagement_count >= _MEDIUM_CONFIDENCE_INTERACTION_THRESHOLD:
            return "medium", f"Directional signal · {engagement_count} interactions"
        if engagement_count > 0:
            return "low", f"Low sample · {engagement_count} interactions"
        return "low", "No direct views yet"

    if (
        view_count >= _HIGH_CONFIDENCE_VIEW_THRESHOLD
        or engagement_count >= _HIGH_CONFIDENCE_INTERACTION_THRESHOLD
    ):
        return "high", f"High confidence · {view_count} views"

    if (
        view_count >= _MEDIUM_CONFIDENCE_VIEW_THRESHOLD
        or engagement_count >= _MEDIUM_CONFIDENCE_INTERACTION_THRESHOLD
    ):
        return "medium", f"Directional signal · {view_count} views"

    return "low", f"Low sample · {view_count} views"


def _confidence_score(view_count: int, focus_count: int, dismiss_count: int) -> int:
    level, _ = _compute_engagement_confidence(view_count, focus_count, dismiss_count)
    return _CONFIDENCE_PRIORITY.get(level, 0)


def _timestamp_score(candidate: datetime | None) -> float:
    if candidate is None:
        return float("-inf")
    if candidate.tzinfo is None:
        candidate = candidate.replace(tzinfo=timezone.utc)
    return candidate.timestamp()


def summarize_dashboard_suggestion_telemetry(
    entries: Sequence[DashboardSuggestionTelemetry],
) -> DashboardSuggestionTelemetrySummary:
    """Build aggregate metrics for a collection of suggestion telemetry rows."""

    entries = list(entries)
    total_views = sum(entry.view_count for entry in entries)
    total_focus = sum(entry.focus_count for entry in entries)
    total_dismiss = sum(entry.dismiss_count for entry in entries)
    total_engagement = total_focus + total_dismiss

    focus_rates: list[float] = []
    dismiss_rates: list[float] = []
    engagement_rates: list[float] = []
    for entry in entries:
        focus = _normalize_rate(entry.focus_rate)
        if focus is not None:
            focus_rates.append(focus)
        dismiss = _normalize_rate(entry.dismiss_rate)
        if dismiss is not None:
            dismiss_rates.append(dismiss)
        engagement = _normalize_rate(entry.engagement_rate)
        if engagement is not None:
            engagement_rates.append(engagement)

    average_focus_rate = _aggregate_rate(total_focus, total_views, focus_rates)
    average_dismiss_rate = _aggregate_rate(total_dismiss, total_views, dismiss_rates)
    average_engagement_rate = _aggregate_rate(total_engagement, total_views, engagement_rates)

    summary = DashboardSuggestionTelemetrySummary(
        total_suggestions=len(entries),
        total_view_count=total_views,
        total_focus_count=total_focus,
        total_dismiss_count=total_dismiss,
        average_focus_rate=average_focus_rate,
        average_dismiss_rate=average_dismiss_rate,
        average_engagement_rate=average_engagement_rate,
    )

    if not entries:
        return summary

    def _sort_key(
        entry: DashboardSuggestionTelemetry,
    ) -> tuple[float, float, int, int, float, float, float, str]:
        engagement_rate = _normalize_rate(entry.engagement_rate) or 0.0
        engagement_count = entry.focus_count + entry.dismiss_count
        focus_rate = _normalize_rate(entry.focus_rate) or 0.0
        return (
            float(_confidence_score(entry.view_count, entry.focus_count, entry.dismiss_count)),
            engagement_rate,
            engagement_count,
            entry.view_count,
            focus_rate,
            max(0.0, float(entry.high_risk_count)),
            _timestamp_score(entry.last_occurred_at),
            entry.signature,
        )

    top_entry = max(entries, key=_sort_key)

    summary.top_signature = top_entry.signature
    summary.top_region = top_entry.region
    region_summary = top_entry.metadata.get("regionSummary")
    if isinstance(region_summary, str):
        region_summary = region_summary.strip()
    reason_copy = top_entry.reason.strip() if isinstance(top_entry.reason, str) else None
    summary.top_region_summary = region_summary or reason_copy
    summary.top_reason = reason_copy
    summary.top_focus_rate = _normalize_rate(top_entry.focus_rate) or 0.0
    summary.top_dismiss_rate = _normalize_rate(top_entry.dismiss_rate) or 0.0
    summary.top_engagement_rate = _normalize_rate(top_entry.engagement_rate) or 0.0
    summary.top_focus_count = top_entry.focus_count
    summary.top_dismiss_count = top_entry.dismiss_count
    summary.top_view_count = top_entry.view_count
    summary.top_event_count = top_entry.event_count
    summary.top_high_risk_count = top_entry.high_risk_count
    summary.top_has_scheduled_start = top_entry.has_scheduled_start

    guardrail_status = top_entry.metadata.get("guardrailStatus")
    if isinstance(guardrail_status, str):
        guardrail_status = guardrail_status.strip()
    summary.top_guardrail_status = guardrail_status or None

    layout_variant = top_entry.metadata.get("layoutVariant")
    if isinstance(layout_variant, str):
        layout_variant = layout_variant.strip()
    summary.top_layout_variant = layout_variant or None

    summary.top_last_occurred_at = top_entry.last_occurred_at
    (
        summary.top_engagement_confidence_level,
        summary.top_engagement_confidence_label,
    ) = _compute_engagement_confidence(
        top_entry.view_count,
        top_entry.focus_count,
        top_entry.dismiss_count,
    )

    return summary


__all__ = ["summarize_dashboard_suggestion_telemetry"]
