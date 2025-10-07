from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field


class APIModel(BaseModel):
    """Base schema with sensible defaults."""

    class Config:
        from_attributes = True
        json_encoders = {datetime: lambda value: value.isoformat()}


class HealthResponse(APIModel):
    status: str = Field(default="ok")
    service: str = Field(default="api")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class PlanSlice(APIModel):
    plan_date: datetime
    geo_group_id: str
    category: str
    channel: str
    recommended_spend: float
    expected_revenue_low: float
    expected_revenue_mid: float
    expected_revenue_high: float
    expected_roas_low: float
    expected_roas_mid: float
    expected_roas_high: float
    rationale: dict[str, str] | None = None


class PlanResponse(APIModel):
    tenant_id: str
    generated_at: datetime
    horizon_days: int
    slices: list[PlanSlice]


from enum import Enum


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


class AutomationSettings(APIModel):
    mode: AutomationMode = Field(default=AutomationMode.manual)
    pushes_enabled: bool = Field(default=False)
    guardrails: GuardrailSettings = Field(default_factory=GuardrailSettings)
    notes: str | None = Field(
        default=(
            "Read-only Plan & Proof mode. Enable Assist or Autopilot per tenant when ready."
        )
    )


class AutomationSettingsResponse(APIModel):
    tenant_id: str
    settings: AutomationSettings

