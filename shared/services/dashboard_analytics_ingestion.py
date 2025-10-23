"""Ingestion utilities for WeatherOps dashboard suggestion analytics."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence, cast

from shared.services.dashboard_analytics import (
    DashboardSuggestionEvent,
    SuggestionEventName,
    generate_dashboard_suggestion_signature,
)

_SUGGESTION_METRIC_EVENT = "dashboard.weather_focus.suggestion"
_ACTION_BY_EVENT: dict[SuggestionEventName, str] = {
    "dashboard.weather_focus.suggestion.view": "view",
    "dashboard.weather_focus.suggestion.focus": "focus",
    "dashboard.weather_focus.suggestion.dismiss": "dismiss",
}


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        dt = value
    else:
        text = str(value).strip()
        if not text:
            return datetime.now(timezone.utc)
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _coerce_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y"}
    return bool(value)


@dataclass(slots=True)
class DashboardSuggestionMetricRecord:
    """Single dashboard suggestion analytics record loaded from metrics."""

    event: SuggestionEventName
    action: str
    tenant_id: str
    region: str
    reason: str
    severity: str
    high_risk_count: int
    event_count: int
    has_scheduled_start: bool
    next_event_starts_at: str | None
    occurred_at: datetime
    recorded_at: datetime
    viewport_breakpoint: str
    metadata: dict[str, Any]
    signature: str
    tags: dict[str, str]


def load_dashboard_suggestion_metrics(metrics_file: Path) -> list[DashboardSuggestionMetricRecord]:
    """Load suggestion analytics records from a metrics JSONL file."""

    if not metrics_file.exists():
        return []

    records: list[DashboardSuggestionMetricRecord] = []
    for line in metrics_file.read_text(encoding="utf-8").splitlines():
        entry = line.strip()
        if not entry:
            continue
        try:
            decoded = json.loads(entry)
        except json.JSONDecodeError:
            continue
        if decoded.get("event") != _SUGGESTION_METRIC_EVENT:
            continue
        payload = decoded.get("payload")
        if not isinstance(payload, Mapping):
            continue
        event_name = cast(SuggestionEventName, payload.get("event") or decoded.get("event"))
        if event_name not in _ACTION_BY_EVENT:
            continue
        tenant_id = payload.get("tenant_id")
        region = payload.get("region")
        reason = payload.get("reason")
        severity = payload.get("severity")
        viewport_breakpoint = payload.get("viewport_breakpoint")
        action = payload.get("action") or _ACTION_BY_EVENT[event_name]
        if not all(
            isinstance(value, str) and value.strip()
            for value in (tenant_id, region, reason, severity, viewport_breakpoint, action)
        ):
            continue

        metadata_raw = payload.get("metadata") or {}
        metadata = dict(metadata_raw) if isinstance(metadata_raw, Mapping) else {}

        occurred_at = _parse_datetime(payload.get("occurred_at") or decoded.get("timestamp"))
        recorded_at = _parse_datetime(decoded.get("timestamp"))
        high_risk_count = _coerce_int(payload.get("high_risk_count"))
        event_count = _coerce_int(payload.get("event_count"))
        has_scheduled_start = _coerce_bool(payload.get("has_scheduled_start"))
        next_event_starts_at = payload.get("next_event_starts_at")
        if isinstance(next_event_starts_at, str):
            next_event_starts_at = next_event_starts_at.strip() or None
        else:
            next_event_starts_at = None

        signature_value = metadata.get("signature")
        signature: str | None = signature_value.strip() if isinstance(signature_value, str) else None
        if not signature:
            domain_event = DashboardSuggestionEvent(
                tenant_id=tenant_id.strip(),
                name=event_name,
                region=region.strip(),
                severity=severity.strip(),
                high_risk_count=high_risk_count,
                event_count=event_count,
                next_event_starts_at=next_event_starts_at,
                has_scheduled_start=has_scheduled_start,
                viewport_breakpoint=viewport_breakpoint.strip(),
                reason=reason.strip(),
                occurred_at=occurred_at,
                metadata=metadata,
            )
            signature = generate_dashboard_suggestion_signature(domain_event)
        metadata["signature"] = signature

        tags_raw = decoded.get("tags") or {}
        tags = {str(key): str(value) for key, value in tags_raw.items()} if isinstance(tags_raw, Mapping) else {}

        record = DashboardSuggestionMetricRecord(
            event=event_name,
            action=str(action).strip(),
            tenant_id=tenant_id.strip(),
            region=region.strip(),
            reason=reason.strip(),
            severity=severity.strip(),
            high_risk_count=high_risk_count,
            event_count=event_count,
            has_scheduled_start=has_scheduled_start,
            next_event_starts_at=next_event_starts_at,
            occurred_at=occurred_at,
            recorded_at=recorded_at,
            viewport_breakpoint=viewport_breakpoint.strip(),
            metadata=metadata,
            signature=signature,
            tags=tags,
        )
        records.append(record)

    records.sort(key=lambda record: record.occurred_at)
    return records


@dataclass(slots=True)
class DashboardSuggestionAggregate:
    """Aggregated telemetry for a dashboard suggestion signature."""

    signature: str
    region: str
    reason: str
    metadata: dict[str, Any]
    high_risk_count: int
    event_count: int
    has_scheduled_start: bool
    next_event_starts_at: str | None
    tenants: set[str] = field(default_factory=set)
    severities: set[str] = field(default_factory=set)
    viewport_breakpoints: set[str] = field(default_factory=set)
    first_occurred_at: datetime | None = None
    last_occurred_at: datetime | None = None
    view_count: int = 0
    focus_count: int = 0
    dismiss_count: int = 0

    def register(self, record: DashboardSuggestionMetricRecord) -> None:
        self.tenants.add(record.tenant_id)
        self.severities.add(record.severity)
        self.viewport_breakpoints.add(record.viewport_breakpoint)
        if self.first_occurred_at is None or record.occurred_at < self.first_occurred_at:
            self.first_occurred_at = record.occurred_at
        if self.last_occurred_at is None or record.occurred_at > self.last_occurred_at:
            previous_cta = bool(self.metadata.get("ctaShown"))
            self.last_occurred_at = record.occurred_at
            self.high_risk_count = record.high_risk_count
            self.event_count = record.event_count
            self.next_event_starts_at = record.next_event_starts_at
            self.has_scheduled_start = record.has_scheduled_start
            self.metadata.update(record.metadata)
            if "ctaShown" in record.metadata or previous_cta:
                current_cta = bool(record.metadata.get("ctaShown"))
                self.metadata["ctaShown"] = previous_cta or current_cta
            self.metadata["signature"] = self.signature

        if record.action == "view":
            self.view_count += 1
        elif record.action == "focus":
            self.focus_count += 1
        elif record.action == "dismiss":
            self.dismiss_count += 1

    def to_dict(self) -> dict[str, Any]:
        focus_rate = self._rate(self.focus_count, self.view_count)
        dismiss_rate = self._rate(self.dismiss_count, self.view_count)
        engagement_rate = self._rate(self.focus_count + self.dismiss_count, self.view_count)
        return {
            "signature": self.signature,
            "region": self.region,
            "reason": self.reason,
            "high_risk_count": self.high_risk_count,
            "event_count": self.event_count,
            "has_scheduled_start": self.has_scheduled_start,
            "next_event_starts_at": self.next_event_starts_at,
            "view_count": self.view_count,
            "focus_count": self.focus_count,
            "dismiss_count": self.dismiss_count,
            "focus_rate": focus_rate,
            "dismiss_rate": dismiss_rate,
            "engagement_rate": engagement_rate,
            "tenants": sorted(self.tenants),
            "severities": sorted(self.severities),
            "viewport_breakpoints": sorted(self.viewport_breakpoints),
            "first_occurred_at": self.first_occurred_at.isoformat() if self.first_occurred_at else None,
            "last_occurred_at": self.last_occurred_at.isoformat() if self.last_occurred_at else None,
            "metadata": dict(self.metadata),
        }

    @staticmethod
    def _rate(numerator: int, denominator: int) -> float:
        if denominator <= 0 or numerator <= 0:
            return 0.0
        try:
            ratio = numerator / denominator
        except ZeroDivisionError:
            return 0.0
        if ratio <= 0:
            return 0.0
        return min(1.0, float(ratio))


def aggregate_dashboard_suggestion_metrics(
    records: Sequence[DashboardSuggestionMetricRecord],
) -> list[DashboardSuggestionAggregate]:
    """Roll up dashboard suggestion metrics by canonical signature."""

    aggregates: dict[str, DashboardSuggestionAggregate] = {}
    for record in records:
        bucket = aggregates.get(record.signature)
        if bucket is None:
            initial_metadata = dict(record.metadata)
            initial_metadata.setdefault("signature", record.signature)
            bucket = DashboardSuggestionAggregate(
                signature=record.signature,
                region=record.region,
                reason=record.reason,
                metadata=initial_metadata,
                high_risk_count=record.high_risk_count,
                event_count=record.event_count,
                has_scheduled_start=record.has_scheduled_start,
                next_event_starts_at=record.next_event_starts_at,
            )
            aggregates[record.signature] = bucket
        bucket.register(record)
    return sorted(
        aggregates.values(),
        key=lambda aggregate: aggregate.last_occurred_at or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )


__all__ = [
    "DashboardSuggestionAggregate",
    "DashboardSuggestionMetricRecord",
    "aggregate_dashboard_suggestion_metrics",
    "load_dashboard_suggestion_metrics",
]
