from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Sequence

from pydantic import Field

from .base import APIModel, ContextWarning


class GuardrailStatus(str, Enum):
    healthy = "healthy"
    watch = "watch"
    breach = "breach"


class GuardrailSegment(APIModel):
    name: str
    status: GuardrailStatus
    value: float
    target: float
    unit: str = Field(default="pct")
    delta_pct: float = Field(default=0.0)
    notes: str | None = None


class SpendTracker(APIModel):
    name: str
    channel: str
    value: float
    change_pct: float
    target: float | None = None
    unit: str = Field(default="usd")
    sparkline: list[float] = Field(default_factory=list)


class WeatherRiskSeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class WeatherRiskEvent(APIModel):
    id: str
    title: str
    description: str
    severity: WeatherRiskSeverity
    geo_region: str
    starts_at: datetime
    ends_at: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None
    weather_type: str | None = None


class AutomationLaneStatus(str, Enum):
    normal = "normal"
    degraded = "degraded"
    paused = "paused"


class AutomationLane(APIModel):
    name: str
    uptime_pct: float
    incidents_7d: int = Field(default=0)
    last_incident_at: datetime | None = None
    status: AutomationLaneStatus = Field(default=AutomationLaneStatus.normal)
    notes: str | None = None


class ConnectorStatus(str, Enum):
    syncing = "syncing"
    healthy = "healthy"
    delayed = "delayed"
    failed = "failed"


class IngestionConnector(APIModel):
    name: str
    source: str
    status: ConnectorStatus
    lag_minutes: int = Field(ge=0)
    sla_minutes: int = Field(ge=0, default=15)
    last_synced_at: datetime | None = None
    notes: str | None = None


class AlertSeverity(str, Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class DashboardAlert(APIModel):
    id: str
    title: str
    detail: str
    severity: AlertSeverity
    occurred_at: datetime
    acknowledged: bool = Field(default=False)
    escalated_to: str | None = None
    related_objects: Sequence[str] = Field(default_factory=list)


class DashboardResponse(APIModel):
    tenant_id: str
    generated_at: datetime
    guardrails: list[GuardrailSegment] = Field(default_factory=list)
    spend_trackers: list[SpendTracker] = Field(default_factory=list)
    weather_events: list[WeatherRiskEvent] = Field(default_factory=list)
    automation: list[AutomationLane] = Field(default_factory=list)
    ingestion: list[IngestionConnector] = Field(default_factory=list)
    alerts: list[DashboardAlert] = Field(default_factory=list)
    context_tags: list[str] = Field(default_factory=list)
    context_warnings: list[ContextWarning] = Field(default_factory=list)

