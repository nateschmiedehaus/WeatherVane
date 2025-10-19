from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal, Sequence

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
    acknowledged_at: datetime | None = None
    escalated_to: str | None = None
    escalated_at: datetime | None = None
    escalation_channel: str | None = None
    related_objects: Sequence[str] = Field(default_factory=list)


class AllocatorMode(str, Enum):
    autopilot = "autopilot"
    assist = "assist"
    demo = "demo"
    fallback = "fallback"


class RecommendationSeverity(str, Enum):
    critical = "critical"
    warning = "warning"
    info = "info"


class AllocatorRecommendation(APIModel):
    platform: str
    spend_delta: float
    spend_delta_pct: float
    spend_after: float
    severity: RecommendationSeverity = Field(default=RecommendationSeverity.info)
    guardrail_count: int = Field(default=0, ge=0)
    top_guardrail: str | None = None
    notes: str | None = None


class AllocatorSummary(APIModel):
    run_id: str | None = None
    generated_at: datetime | None = None
    mode: AllocatorMode = Field(default=AllocatorMode.fallback)
    total_spend: float = Field(default=0.0)
    total_spend_delta: float = Field(default=0.0)
    total_spend_delta_pct: float = Field(default=0.0)
    guardrail_breaches: int = Field(default=0, ge=0)
    notes: list[str] = Field(default_factory=list)
    recommendations: list[AllocatorRecommendation] = Field(default_factory=list)


class WeatherKpiUnit(str, Enum):
    usd = "usd"
    pct = "pct"
    count = "count"
    index = "index"
    hours = "hours"


class WeatherKpi(APIModel):
    id: str
    label: str
    value: float
    unit: WeatherKpiUnit = Field(default=WeatherKpiUnit.count)
    delta_pct: float | None = None
    sparkline: list[float] = Field(default_factory=list)
    description: str


class DashboardSuggestionTelemetry(APIModel):
    signature: str
    region: str
    reason: str
    view_count: int = Field(default=0, ge=0)
    focus_count: int = Field(default=0, ge=0)
    dismiss_count: int = Field(default=0, ge=0)
    high_risk_count: int = Field(default=0, ge=0)
    event_count: int = Field(default=0, ge=0)
    focus_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    dismiss_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    engagement_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    has_scheduled_start: bool
    next_event_starts_at: datetime | None = None
    first_occurred_at: datetime | None = None
    last_occurred_at: datetime | None = None
    tenants: list[str] = Field(default_factory=list)
    severities: list[str] = Field(default_factory=list)
    viewport_breakpoints: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DashboardSuggestionTelemetrySummary(APIModel):
    total_suggestions: int = Field(default=0, ge=0)
    total_view_count: int = Field(default=0, ge=0)
    total_focus_count: int = Field(default=0, ge=0)
    total_dismiss_count: int = Field(default=0, ge=0)
    average_focus_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    average_dismiss_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    average_engagement_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    top_signature: str | None = None
    top_region: str | None = None
    top_region_summary: str | None = None
    top_reason: str | None = None
    top_focus_rate: float | None = None
    top_dismiss_rate: float | None = None
    top_engagement_rate: float | None = None
    top_focus_count: int | None = Field(default=None, ge=0)
    top_dismiss_count: int | None = Field(default=None, ge=0)
    top_view_count: int | None = Field(default=None, ge=0)
    top_event_count: int | None = Field(default=None, ge=0)
    top_high_risk_count: int | None = Field(default=None, ge=0)
    top_has_scheduled_start: bool | None = None
    top_guardrail_status: str | None = None
    top_layout_variant: str | None = None
    top_last_occurred_at: datetime | None = None
    top_engagement_confidence_level: Literal["low", "medium", "high"] | None = None
    top_engagement_confidence_label: str | None = None


class DashboardResponse(APIModel):
    tenant_id: str
    generated_at: datetime
    guardrails: list[GuardrailSegment] = Field(default_factory=list)
    spend_trackers: list[SpendTracker] = Field(default_factory=list)
    weather_events: list[WeatherRiskEvent] = Field(default_factory=list)
    automation: list[AutomationLane] = Field(default_factory=list)
    ingestion: list[IngestionConnector] = Field(default_factory=list)
    alerts: list[DashboardAlert] = Field(default_factory=list)
    allocator: AllocatorSummary | None = None
    weather_kpis: list[WeatherKpi] = Field(default_factory=list)
    suggestion_telemetry: list[DashboardSuggestionTelemetry] = Field(default_factory=list)
    suggestion_telemetry_summary: DashboardSuggestionTelemetrySummary | None = None
    context_tags: list[str] = Field(default_factory=list)
    context_warnings: list[ContextWarning] = Field(default_factory=list)


class AlertAcknowledgeRequest(APIModel):
    acknowledged_by: str | None = Field(default=None, max_length=120)
    note: str | None = Field(default=None, max_length=500)


class AlertAcknowledgeResponse(APIModel):
    tenant_id: str
    alert_id: str
    acknowledged_at: datetime
    acknowledged_by: str | None = None
    note: str | None = None


class AlertEscalateRequest(APIModel):
    channel: str = Field(default="slack", max_length=50)
    target: str = Field(max_length=120)
    note: str | None = Field(default=None, max_length=500)


class AlertEscalateResponse(APIModel):
    tenant_id: str
    alert_id: str
    escalated_at: datetime
    channel: str
    target: str
    note: str | None = None
