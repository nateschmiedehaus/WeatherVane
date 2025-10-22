from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class ConsensusSampleWindow(BaseModel):
    """Represents the sampling window for consensus telemetry."""

    start: Optional[datetime] = None
    end: Optional[datetime] = None


class ConsensusQuorumProfile(BaseModel):
    """Normalised quorum profile describing participants and duration targets."""

    name: str
    display_name: str
    hierarchy_rank: int = Field(ge=0)
    default_participants: List[str] = Field(default_factory=list)
    median_duration_seconds: Optional[float] = None
    p90_duration_seconds: Optional[float] = None
    expected_iterations: Optional[int] = None
    token_cost_usd: Optional[float] = None
    notes: Optional[str] = None


class ConsensusEscalationSignal(BaseModel):
    """Signal that can promote a quorum or trigger escalation."""

    signal: str
    threshold_seconds: Optional[float] = None
    threshold: Optional[float] = None
    recommended_action: Optional[str] = None


class ConsensusWorkloadResponse(BaseModel):
    """Response payload for consensus workload telemetry."""

    generated_at: Optional[datetime] = None
    sample_window: Optional[ConsensusSampleWindow] = None
    decision_mix: Dict[str, int] = Field(default_factory=dict)
    token_cost_per_run_usd: Optional[float] = None
    token_budget_per_run: Dict[str, float] = Field(default_factory=dict)
    quorum_profiles: List[ConsensusQuorumProfile] = Field(default_factory=list)
    escalation_signals: List[ConsensusEscalationSignal] = Field(default_factory=list)
    execution_health: Dict[str, float] = Field(default_factory=dict)


__all__ = [
    "ConsensusEscalationSignal",
    "ConsensusQuorumProfile",
    "ConsensusSampleWindow",
    "ConsensusWorkloadResponse",
]
