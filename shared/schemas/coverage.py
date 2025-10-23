from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import Field

from .base import APIModel


class CoverageStatus(str, Enum):
    ok = "ok"
    warning = "warning"
    critical = "critical"


class CoverageBucket(APIModel):
    name: str
    status: CoverageStatus
    observed_days: int = Field(ge=0)
    window_days: int = Field(gt=0)
    coverage_ratio: float = Field(ge=0.0)
    latest_date: str | None = None
    sources: list[str] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)
    extra_metrics: dict[str, Any] = Field(default_factory=dict)


class TenantCoverageSummary(APIModel):
    tenant_id: str
    window_days: int = Field(gt=0)
    end_date: str
    generated_at: str
    status: CoverageStatus
    buckets: dict[str, CoverageBucket] = Field(default_factory=dict)

