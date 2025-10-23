from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from shared.schemas.incrementality import IncrementalityDesign, IncrementalitySummary


class APIModel(BaseModel):
    """Base schema with sensible defaults."""

    model_config = ConfigDict(from_attributes=True)


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


class ExperimentLift(APIModel):
    """Lift and confidence metrics from experiment execution."""

    absolute_lift: float = Field(
        description="Absolute lift in revenue or ROAS, e.g., +0.15 for 15% lift"
    )
    lift_pct: float = Field(description="Lift as percentage, e.g., 15.0 for 15%")
    confidence_low: float = Field(description="Lower bound of 95% confidence interval")
    confidence_high: float = Field(description="Upper bound of 95% confidence interval")
    p_value: float = Field(description="Statistical significance p-value")
    sample_size: int = Field(description="Number of observations used in experiment")
    is_significant: bool = Field(
        default=False, description="Whether lift is statistically significant (p < 0.05)"
    )
    generated_at: datetime | None = None


class ExperimentPayload(APIModel):
    """API payload for experiment execution and results."""

    experiment_id: str = Field(description="Unique experiment identifier")
    status: str = Field(
        description="Experiment status: pending, running, completed, failed"
    )
    start_date: datetime | None = None
    end_date: datetime | None = None
    treatment_geos: list[str] = Field(default_factory=list, description="Geos in treatment group")
    control_geos: list[str] = Field(default_factory=list, description="Geos in control group")
    treatment_spend: float | None = None
    control_spend: float | None = None
    metric_name: str = Field(default="roas", description="Metric being measured")
    lift: ExperimentLift | None = None


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
    experiments: list[ExperimentPayload] = Field(
        default_factory=list, description="Active and historical experiments"
    )
    lift_summary: ExperimentLift | None = Field(
        default=None, description="Aggregated lift metrics across all experiments"
    )


class ScenarioRecommendationAdjustment(APIModel):
    channel: str
    multiplier: float = Field(gt=0)
    rationale: str
    confidence: ConfidenceLevel


class ScenarioRecommendation(APIModel):
    id: str
    label: str
    description: str
    adjustments: list[ScenarioRecommendationAdjustment] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class ScenarioRecommendationResponse(APIModel):
    tenant_id: str
    generated_at: datetime
    horizon_days: int
    recommendations: list[ScenarioRecommendation] = Field(default_factory=list)


class ScenarioSnapshot(APIModel):
    """A saved scenario configuration for what-if analysis."""

    id: str | None = None
    tenant_id: str
    name: str = Field(description="Human-readable scenario name")
    description: str | None = Field(default=None, description="Optional scenario description")
    horizon_days: int
    adjustments: dict[str, float] = Field(
        description="Channel-to-multiplier mapping (e.g., {'Meta': 1.15, 'Google': 0.9})"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str | None = Field(default=None, description="User who created the scenario")
    tags: list[str] = Field(default_factory=list, description="Scenario classification tags")

    # Computed outcome summary (optional, populated when loading)
    total_base_spend: float | None = None
    total_scenario_spend: float | None = None
    total_base_revenue: float | None = None
    total_scenario_revenue: float | None = None
    scenario_roi: float | None = None


class ScenarioSnapshotListResponse(APIModel):
    """List of saved scenario snapshots."""

    tenant_id: str
    snapshots: list[ScenarioSnapshot] = Field(default_factory=list)


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


class ReportHeroTile(APIModel):
    id: str
    label: str
    value: float
    unit: str
    narrative: str
    delta_pct: float | None = None
    delta_value: float | None = None


class ReportNarrativeCard(APIModel):
    id: str
    headline: str
    summary: str
    weather_driver: str
    spend: float
    expected_revenue: float
    confidence: ConfidenceLevel
    plan_date: datetime
    category: str
    channel: str


class ReportTrendPoint(APIModel):
    date: datetime
    recommended_spend: float
    weather_index: float
    guardrail_score: float


class ReportTrend(APIModel):
    cadence: str
    points: list[ReportTrendPoint]


class ReportSchedule(APIModel):
    status: str
    cadence: str
    recipients: list[str] = Field(default_factory=list)
    delivery_format: str = Field(default="email")
    next_delivery_at: datetime | None = None
    last_sent_at: datetime | None = None
    can_edit: bool = False
    time_zone: str | None = None
    note: str | None = None


class ReportSuccessHighlight(APIModel):
    headline: str
    summary: str
    metric_label: str
    metric_value: float
    metric_unit: str
    cta_label: str
    cta_href: str
    persona: str


class ReportsResponse(APIModel):
    tenant_id: str
    generated_at: datetime
    hero_tiles: list[ReportHeroTile]
    narratives: list[ReportNarrativeCard]
    trend: ReportTrend
    schedule: ReportSchedule
    success: ReportSuccessHighlight
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
