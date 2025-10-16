from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CreativePolicy(BaseModel):
    roas_floor: float
    warn_threshold: float
    block_threshold: float
    min_impressions: int


class CreativeSummary(BaseModel):
    creative_count: int
    active_creatives: int
    blocked_creatives: int
    watchlist_creatives: int
    average_roas: float
    median_roas: float
    active_spend_share: float
    watchlist_spend_share: float
    blocked_spend_share: float
    guardrail_counts: dict[str, int] = Field(default_factory=dict)


class CreativeHighlight(BaseModel):
    creative_id: str
    channel: str
    roas_adjusted: float
    brand_safety_score: float
    status: str


class CreativeRow(BaseModel):
    creative_id: str
    channel: str
    impressions: int
    clicks: int
    conversions: int
    spend: float
    revenue: float
    brand_safety_score: float
    brand_safety_tier: str
    brand_safety_factor: float
    sample_size_factor: float
    ctr: float
    cvr: float
    aov: float
    roas_smoothed: float
    roas_adjusted: float
    guardrail_factor: float
    status: str
    guardrail: str | None
    spend_share: float
    profit_expectation: float


class CreativeResponseReport(BaseModel):
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    policy: CreativePolicy
    summary: CreativeSummary
    top_creatives: list[CreativeHighlight]
    creatives: list[CreativeRow]


__all__ = [
    "CreativePolicy",
    "CreativeResponseReport",
    "CreativeRow",
    "CreativeSummary",
    "CreativeHighlight",
]
