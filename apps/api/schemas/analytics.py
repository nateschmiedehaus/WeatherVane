"""Schemas for dashboard analytics ingestion routes."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from enum import Enum
from typing import Any, cast

from pydantic import BaseModel, ConfigDict, Field, field_validator

from shared.services.dashboard_analytics import DashboardSuggestionEvent, SuggestionEventName


class SuggestionViewportBreakpoint(str, Enum):
    mobile = "mobile"
    tablet = "tablet"
    desktop = "desktop"
    unknown = "unknown"


class DashboardSuggestionEventName(str, Enum):
    view = "dashboard.weather_focus.suggestion.view"
    focus = "dashboard.weather_focus.suggestion.focus"
    dismiss = "dashboard.weather_focus.suggestion.dismiss"

    @property
    def action(self) -> str:
        return self.value.rsplit(".", 1)[-1]


class DashboardSuggestionPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    region: str = Field(..., min_length=1)
    severity: str = Field(..., min_length=1)
    high_risk_count: int = Field(..., ge=0, alias="highRiskCount")
    event_count: int = Field(..., ge=0, alias="eventCount")
    next_event_starts_at: str | None = Field(default=None, alias="nextEventStartsAt")
    has_scheduled_start: bool = Field(..., alias="hasScheduledStart")
    reason: str = Field(..., min_length=1)
    viewport_breakpoint: SuggestionViewportBreakpoint = Field(..., alias="viewportBreakpoint")
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("next_event_starts_at", mode="after")
    def _validate_next_event(cls, value: str | None) -> str | None:
        if value is None:
            return None
        trimmed = value.strip()
        if not trimmed:
            return None
        try:
            datetime.fromisoformat(trimmed.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("nextEventStartsAt must be ISO8601") from exc
        return trimmed

    @field_validator("metadata", mode="after")
    def _validate_metadata(cls, value: dict[str, Any]) -> dict[str, Any]:
        if not value:
            return {}

        sanitized: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str) or not key.strip():
                raise ValueError("metadata keys must be non-empty strings")
            normalized_key = key.strip()
            try:
                json.dumps(item)
            except TypeError as exc:
                raise ValueError("metadata values must be JSON-serializable") from exc
            sanitized[normalized_key] = item
        return sanitized


class DashboardSuggestionEventRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    tenant_id: str = Field(..., alias="tenantId")
    event: DashboardSuggestionEventName
    payload: DashboardSuggestionPayload
    occurred_at: datetime | None = Field(default=None, alias="occurredAt")

    def to_domain_model(self) -> DashboardSuggestionEvent:
        occurred = self.occurred_at or datetime.now(timezone.utc)
        return DashboardSuggestionEvent(
            tenant_id=self.tenant_id,
            name=cast(SuggestionEventName, self.event.value),
            region=self.payload.region,
            severity=self.payload.severity,
            high_risk_count=self.payload.high_risk_count,
            event_count=self.payload.event_count,
            next_event_starts_at=self.payload.next_event_starts_at,
            has_scheduled_start=self.payload.has_scheduled_start,
            viewport_breakpoint=self.payload.viewport_breakpoint.value,
            reason=self.payload.reason,
            occurred_at=occurred,
            metadata=self.payload.metadata,
        )


class DashboardSuggestionEventResponse(BaseModel):
    status: str = Field(default="recorded")
