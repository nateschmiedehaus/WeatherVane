from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from shared.schemas.base import APIModel, GuardrailSettings


class AdPushMetric(APIModel):
    name: str
    value: float
    unit: str
    label: str | None = None
    direction: str | None = None


class GuardrailBreach(APIModel):
    code: str
    severity: Literal["warning", "critical"]
    message: str
    limit: float | None = None
    observed: float | None = None


class FieldChange(APIModel):
    field_path: str
    label: str
    before: Any | None
    after: Any | None
    delta: float | None = None
    percent_delta: float | None = None
    unit: str | None = None
    forecast_delta: dict[str, float] | None = None
    guardrails: list[GuardrailBreach] = Field(default_factory=list)


class SectionDiff(APIModel):
    section: Literal["spend", "audience", "creative", "delivery"]
    summary: list[AdPushMetric] = Field(default_factory=list)
    changes: list[FieldChange] = Field(default_factory=list)


class EntityDiff(APIModel):
    entity_type: Literal["campaign", "ad_set", "ad", "creative"]
    entity_id: str | None = None
    name: str | None = None
    change_type: Literal["create", "update", "delete", "noop"]
    sections: list[SectionDiff] = Field(default_factory=list)
    guardrails: list[GuardrailBreach] = Field(default_factory=list)


class SpendGuardrailPlatformReport(APIModel):
    platform: str
    baseline_spend: float
    proposed_spend: float
    spend_delta: float
    percent_delta: float | None = None
    direction: str | None = None
    guardrails: list[GuardrailBreach] = Field(default_factory=list)


class SpendGuardrailTotals(APIModel):
    baseline_spend: float
    proposed_spend: float
    spend_delta: float
    percent_delta: float | None = None
    direction: str | None = None


class SpendGuardrailReport(APIModel):
    totals: SpendGuardrailTotals
    platforms: list[SpendGuardrailPlatformReport] = Field(default_factory=list)
    guardrails: list[GuardrailBreach] = Field(default_factory=list)


class AdPushDiffResponse(APIModel):
    run_id: str
    tenant_id: str
    generation_mode: Literal["assist", "autopilot", "manual"]
    generated_at: datetime
    window_start: datetime | None = None
    window_end: datetime | None = None
    summary: list[AdPushMetric] = Field(default_factory=list)
    entities: list[EntityDiff] = Field(default_factory=list)
    guardrails: list[GuardrailBreach] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    source_plan_id: str | None = None
    spend_guardrail_report: SpendGuardrailReport | None = None


class AdPushRollbackManifest(APIModel):
    run_id: str
    tenant_id: str
    generated_at: datetime
    baseline: Any | None = None
    proposed: Any | None = None
    guardrails: GuardrailSettings
    guardrail_breaches: list[GuardrailBreach] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    rollback_recommended: bool = Field(default=False)
    critical_guardrail_codes: list[str] = Field(default_factory=list)
