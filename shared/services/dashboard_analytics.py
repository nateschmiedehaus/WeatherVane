"""Telemetry helpers for WeatherOps dashboard analytics."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Literal, Mapping

from shared.observability import metrics

SuggestionEventName = Literal["dashboard.weather_focus.suggestion.view", "dashboard.weather_focus.suggestion.focus", "dashboard.weather_focus.suggestion.dismiss"]
ViewportBreakpoint = Literal["mobile", "tablet", "desktop", "unknown"]


@dataclass(slots=True)
class DashboardSuggestionEvent:
    """Represents a WeatherOps dashboard suggestion analytics event."""

    tenant_id: str
    name: SuggestionEventName
    region: str
    severity: str
    high_risk_count: int
    event_count: int
    has_scheduled_start: bool
    viewport_breakpoint: ViewportBreakpoint
    reason: str
    next_event_starts_at: str | None = None
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Mapping[str, object] = field(default_factory=dict)

    @property
    def action(self) -> str:
        return self.name.rsplit(".", 1)[-1]


def generate_dashboard_suggestion_signature(event: DashboardSuggestionEvent) -> str:
    """Create a deterministic signature for dashboard suggestions.

    Mirrors the client-side signature builder so downstream aggregation can
    consistently group view/focus/dismiss telemetry even when clients omit the
    enriched metadata envelope.
    """

    normalized_schedule = (event.next_event_starts_at or "").strip()
    parts = (
        event.region,
        event.reason,
        normalized_schedule,
        str(event.high_risk_count),
        str(event.event_count),
    )
    return "|".join(parts)


def record_dashboard_suggestion_event(event: DashboardSuggestionEvent) -> None:
    """Persist dashboard suggestion telemetry via the metrics sink."""

    metadata = dict(event.metadata)
    signature = metadata.get("signature")
    if not isinstance(signature, str) or not signature.strip():
        metadata["signature"] = generate_dashboard_suggestion_signature(event)

    payload = {
        "tenant_id": event.tenant_id,
        "action": event.action,
        "event": event.name,
        "region": event.region,
        "severity": event.severity,
        "high_risk_count": event.high_risk_count,
        "event_count": event.event_count,
        "next_event_starts_at": event.next_event_starts_at,
        "has_scheduled_start": event.has_scheduled_start,
        "viewport_breakpoint": event.viewport_breakpoint,
        "reason": event.reason,
        "occurred_at": event.occurred_at.isoformat(),
        "metadata": metadata,
    }

    metrics.emit("dashboard.weather_focus.suggestion", payload)


__all__ = [
    "DashboardSuggestionEvent",
    "generate_dashboard_suggestion_signature",
    "SuggestionEventName",
    "ViewportBreakpoint",
    "record_dashboard_suggestion_event",
]
