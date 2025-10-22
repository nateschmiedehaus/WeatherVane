from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from apps.api.schemas.consensus import ConsensusSampleWindow


class OrchestrationHistoryEntry(BaseModel):
    """Represents a single consensus decision used for staffing telemetry."""

    id: str
    task_id: str
    type: str
    timestamp: datetime
    quorum_satisfied: bool
    participants: List[str] = Field(default_factory=list)
    duration_seconds: Optional[float] = None
    token_cost_usd: Optional[float] = None


class StaffingGuidanceProfile(BaseModel):
    """Profile metadata that informs default staffing for a quorum tier."""

    default_participants: List[str] = Field(default_factory=list)
    median_duration_seconds: Optional[float] = None
    p90_duration_seconds: Optional[float] = None
    expected_iterations: Optional[int] = None
    token_cost_usd: Optional[float] = None
    notes: Optional[str] = None


class StaffingGuidanceSignal(BaseModel):
    """Escalation or staffing signal derived from historical telemetry."""

    signal: str
    recommended_action: Optional[str] = None
    threshold_seconds: Optional[float] = None
    observed_value: Optional[float] = None


class StaffingEscalationTriggers(BaseModel):
    """Aggregated escalation guidance for the staffing pipeline."""

    duration_p90_seconds: Optional[float] = None
    retry_threshold: Optional[float] = None
    signals: List[StaffingGuidanceSignal] = Field(default_factory=list)


class StaffingGuidance(BaseModel):
    """Structured staffing guidance derived from recorded consensus workload."""

    source: Optional[str] = None
    sample_window: Optional[ConsensusSampleWindow] = None
    profiles: Dict[str, StaffingGuidanceProfile] = Field(default_factory=dict)
    escalation_triggers: StaffingEscalationTriggers = Field(
        default_factory=StaffingEscalationTriggers,
    )
    token_budget_usd: Dict[str, Optional[float]] = Field(default_factory=dict)


class OrchestrationMetricsResponse(BaseModel):
    """Response payload surfacing dynamic staffing telemetry metrics."""

    updated_at: datetime
    total_decisions: int
    by_type: Dict[str, int] = Field(default_factory=dict)
    history: List[OrchestrationHistoryEntry] = Field(default_factory=list)
    staffing_guidance: Optional[StaffingGuidance] = None
    critic_performance: Optional["CriticPerformanceSnapshot"] = None


class CriticPerformanceSummary(BaseModel):
    """Aggregated critic pass/fail counts and latest snapshot time."""

    total: int
    passing: int
    failing: int
    last_updated: Optional[datetime] = None


class CriticPerformanceEntry(BaseModel):
    """Minimal critic snapshot for surfacing performance posture."""

    critic: str
    title: Optional[str] = None
    domain: Optional[str] = None
    passed: bool
    exit_code: Optional[int] = None
    timestamp: Optional[datetime] = None
    summary: Optional[str] = None


class CriticPerformanceSnapshot(BaseModel):
    """Structured critic performance summary used by Atlas & Director Dana."""

    summary: CriticPerformanceSummary
    critics: List[CriticPerformanceEntry] = Field(default_factory=list)


__all__ = [
    "CriticPerformanceEntry",
    "CriticPerformanceSnapshot",
    "CriticPerformanceSummary",
    "OrchestrationHistoryEntry",
    "OrchestrationMetricsResponse",
    "StaffingEscalationTriggers",
    "StaffingGuidance",
    "StaffingGuidanceProfile",
    "StaffingGuidanceSignal",
]
