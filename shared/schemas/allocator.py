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


class ShadowValidationCheck(BaseModel):
    name: str
    status: bool
    value: float
    threshold: float
    observed_baseline_runs: int | None = None
    required_baseline_runs: int | None = None


class ShadowValidationSummary(BaseModel):
    episodes: int
    safety_override_rate: float
    disabled_variants: list[str]


class ShadowValidationStressEpisode(BaseModel):
    index: int
    variant: str
    guardrail_violated: bool
    disabled_after_episode: bool


class ShadowValidationStressConfig(BaseModel):
    episodes: int
    epsilon: float
    seed: int
    max_guardrail_breaches: int


class ShadowValidationStressTest(BaseModel):
    config: ShadowValidationStressConfig
    guardrail_violations: int
    guardrail_breach_counts: Dict[str, int]
    selection_counts: Dict[str, int]
    disabled_variants: list[str]
    episodes: list[ShadowValidationStressEpisode]
    assertions: Dict[str, bool]


class ShadowValidation(BaseModel):
    checks: list[ShadowValidationCheck]
    summary: ShadowValidationSummary
    notes: list[str]
    stress_test: ShadowValidationStressTest


class ShadowRunReport(BaseModel):
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    average_reward: float
    guardrail_violations: int
    q_values: Dict[str, float | None]
    selection_counts: Dict[str, int]
    episodes: list[ShadowEpisode]
    guardrail_breach_counts: Dict[str, int]
    disabled_variants: list[str]
    diagnostics: Dict[str, float]
    config: Dict[str, object]
    scenario: Dict[str, object]
    validation: ShadowValidation


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
    fairness_gap: float
    fairness_ratio: float | None = None
    target_spend: float
    spend_delta_vs_target: float
    floor_shortfall: float


class SaturationSummary(BaseModel):
    profit: float
    baseline_profit: float
    profit_lift: float
    weighted_fairness_gap: float
    max_fairness_gap: float
    total_revenue: float
    total_spend: float
    normalized_fairness_gap: float
    under_allocated_markets: int
    total_floor_shortfall: float
    max_floor_shortfall: float


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
    "ShadowValidation",
    "ShadowValidationCheck",
    "ShadowValidationStressConfig",
    "ShadowValidationStressEpisode",
    "ShadowValidationStressTest",
    "ShadowValidationSummary",
]
