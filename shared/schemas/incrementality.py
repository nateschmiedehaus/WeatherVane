from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class HoldoutAssignmentSchema(BaseModel):
    geo: str
    group: str
    weight: float = Field(ge=0.0, le=1.0)


class IncrementalityDesign(BaseModel):
    status: str
    geo_count: int | None = None
    holdout_count: int | None = None
    holdout_ratio: float | None = None
    control_share: float | None = None
    assignment: list[HoldoutAssignmentSchema] = Field(default_factory=list)
    tenant_id: str | None = None
    lookback_days: int | None = None
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    notes: list[str] = Field(default_factory=list)
    geo_column: str | None = None

    @property
    def ready(self) -> bool:
        return self.status == "ready"

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "IncrementalityDesign":
        notes: list[str] = []
        status = str(payload.get("status", "unknown"))
        geo_count = payload.get("geo_count")
        holdout_count = payload.get("holdout_count")

        if status == "insufficient_geo":
            notes.append("Need more geos with revenue history for holdout experiment.")
        elif status == "missing_orders":
            notes.append("Recent orders dataset missing; backfill Shopify to design experiment.")

        return cls(
            status=status,
            geo_count=geo_count,
            holdout_count=holdout_count,
            holdout_ratio=payload.get("holdout_ratio"),
            control_share=payload.get("control_share"),
            assignment=[
                HoldoutAssignmentSchema(**entry) for entry in payload.get("assignment", [])
            ],
            tenant_id=payload.get("tenant_id"),
            lookback_days=payload.get("lookback_days"),
            geo_column=payload.get("geo_column"),
            notes=notes,
        )


class IncrementalitySummary(BaseModel):
    treatment_mean: float
    control_mean: float
    absolute_lift: float
    lift: float
    p_value: float
    conf_low: float
    conf_high: float
    sample_size_treatment: int
    sample_size_control: int
    generated_at: datetime | None = None
    is_significant: bool | None = None


class BacktestPoint(BaseModel):
    timestamp: datetime | None = None
    horizon_days: int | None = None
    actual: float
    predicted: float
    error: float
    absolute_error: float
    cumulative_actual: float
    cumulative_predicted: float
    cumulative_lift: float | None = None
    cumulative_lift_pct: float | None = None


class IncrementalityReport(BaseModel):
    tenant_id: str
    generated_at: datetime
    design: IncrementalityDesign
    summary: IncrementalitySummary | None = None
    performance_summary: dict[str, object] | None = None
    backtest: list[BacktestPoint] | None = None
