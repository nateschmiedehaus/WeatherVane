from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from shared.schemas.incrementality import IncrementalityDesign, IncrementalitySummary


class APIModel(BaseModel):
    """Base schema with sensible defaults."""

    class Config:
        from_attributes = True
        json_encoders = {datetime: lambda value: value.isoformat()}


class HealthResponse(APIModel):
    status: str = Field(default="ok")
    service: str = Field(default="api")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ConfidenceLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class PlanQuantiles(APIModel):
    p10: float
    p50: float
    p90: float


class PlanRationale(APIModel):
    primary_driver: str
    supporting_factors: list[str]
    confidence_level: ConfidenceLevel
    data_quality: str
    assumptions: list[str]
    risks: list[str]


class PlanSlice(APIModel):
    plan_date: datetime
    geo_group_id: str
    category: str
    channel: str
    cell: str | None = None
    recommended_spend: float
    expected_revenue: PlanQuantiles
    expected_roas: PlanQuantiles | None = None
    confidence: ConfidenceLevel
    assumptions: list[str]
    rationale: PlanRationale
    status: str | None = None


class PlanResponse(APIModel):
    tenant_id: str
    generated_at: datetime
    horizon_days: int
    slices: list[PlanSlice]
    context_tags: list[str] = Field(default_factory=list)
    data_context: dict[str, Any] | None = None
    context_warnings: list[ContextWarning] = Field(default_factory=list)
    incrementality_design: "IncrementalityDesign | None" = None
    incrementality_summary: "IncrementalitySummary | None" = None


class AutomationMode(str, Enum):
    manual = "manual"
    assist = "assist"
    autopilot = "autopilot"


class GuardrailSettings(APIModel):
    max_daily_budget_delta_pct: float = Field(default=15.0)
    min_daily_spend: float = Field(default=0.0)
    roas_floor: float | None = None
    cpa_ceiling: float | None = None
    change_windows: list[str] = Field(default_factory=list)


class ConsentStatus(str, Enum):
    pending = "pending"
    granted = "granted"
    revoked = "revoked"


class AutomationConsent(APIModel):
    status: ConsentStatus = Field(default=ConsentStatus.pending)
    version: str = Field(default="1.0")
    granted_at: datetime | None = None
    revoked_at: datetime | None = None
    actor: str | None = None
    channel: str = Field(default="in-app")


class AutomationSettings(APIModel):
    mode: AutomationMode = Field(default=AutomationMode.manual)
    pushes_enabled: bool = Field(default=False)
    daily_push_cap: int = Field(default=0, ge=0)
    push_window_start_utc: str | None = None
    push_window_end_utc: str | None = None
    guardrails: GuardrailSettings = Field(default_factory=GuardrailSettings)
    consent: AutomationConsent = Field(default_factory=AutomationConsent)
    retention_days: int = Field(default=365, ge=0)
    last_export_at: datetime | None = None
    last_delete_at: datetime | None = None
    last_updated_at: datetime | None = None
    updated_by: str | None = None
    notes: str | None = Field(
        default=(
            "Read-only Plan & Proof mode. Enable Assist or Autopilot per tenant when ready."
        )
    )
    data_context_tags: list[str] = Field(default_factory=list)


class ContextWarning(APIModel):
    code: str
    message: str
    severity: str = Field(default="warning")
    tags: list[str] = Field(default_factory=list)


class AutomationSettingsResponse(APIModel):
    tenant_id: str
    settings: AutomationSettings
    updated_at: datetime | None = None
    context_tags: list[str] = Field(default_factory=list)
    data_context: dict[str, Any] | None = None
    context_warnings: list[ContextWarning] = Field(default_factory=list)


class DataRequestType(str, Enum):
    export = "export"
    delete = "delete"


class DataRequestPayload(APIModel):
    requested_by: str | None = None
    notes: str | None = None


class DataRequestResponse(APIModel):
    request_id: int
    tenant_id: str
    request_type: DataRequestType
    status: str
    requested_by: str | None = None
    requested_at: datetime
    processed_at: datetime | None = None


class WeatherStory(APIModel):
    title: str
    summary: str
    detail: str
    icon: str | None = None
    confidence: ConfidenceLevel
    plan_date: datetime
    category: str
    channel: str


class StoriesResponse(APIModel):
    tenant_id: str
    generated_at: datetime
    stories: list[WeatherStory]
    context_tags: list[str] = Field(default_factory=list)
    data_context: dict[str, Any] | None = None
    context_warnings: list[ContextWarning] = Field(default_factory=list)


class CatalogCategory(APIModel):
    name: str
    geo_group_id: str
    channel: str
    weather_tags: list[str]
    season_tags: list[str]
    status: str
    lift: str


class CatalogResponse(APIModel):
    tenant_id: str
    generated_at: datetime
    categories: list[CatalogCategory]
    context_tags: list[str] = Field(default_factory=list)
    data_context: dict[str, Any] | None = None
    context_warnings: list[ContextWarning] = Field(default_factory=list)


class AuditLogEntry(APIModel):
    id: int
    tenant_id: str
    actor_type: str
    actor_id: str | None = None
    action: str
    payload: dict[str, Any] | None = None
    created_at: datetime


class AuditLogResponse(APIModel):
    tenant_id: str
    logs: list[AuditLogEntry]
