from __future__ import annotations

from datetime import datetime
from typing import Dict

from pydantic import BaseModel, Field


class ShadowEpisode(BaseModel):
    index: int
    variant: str
    reward: float
    candidate_profit: float
    baseline_profit: float
    guardrail_violated: bool
    realised_roas: Dict[str, float]
    disabled_after_episode: bool
    safety_override: bool


class ShadowRunReport(BaseModel):
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    average_reward: float
    guardrail_violations: int
    q_values: Dict[str, float]
    selection_counts: Dict[str, int]
    episodes: list[ShadowEpisode]
    guardrail_breach_counts: Dict[str, int]
    disabled_variants: list[str]
    diagnostics: Dict[str, float]
    config: Dict[str, object]
    scenario: Dict[str, object]


class SaturationMarket(BaseModel):
    name: str
    allocated_spend: float
    share: float
    fair_share: float
    min_share: float
    revenue: float
    roas: float
    saturation_ratio: float
    lift_vs_current: float | None
    current_spend: float
    weather_multiplier: float
    guardrail_binding: bool


class SaturationSummary(BaseModel):
    profit: float
    baseline_profit: float
    profit_lift: float
    weighted_fairness_gap: float
    max_fairness_gap: float
    total_revenue: float
    total_spend: float


class SaturationReport(BaseModel):
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    total_budget: float
    fairness_floor: float
    roas_floor: float
    summary: SaturationSummary
    markets: list[SaturationMarket]
    allocator: Dict[str, object]


__all__ = [
    "SaturationMarket",
    "SaturationReport",
    "SaturationSummary",
    "ShadowEpisode",
    "ShadowRunReport",
]
