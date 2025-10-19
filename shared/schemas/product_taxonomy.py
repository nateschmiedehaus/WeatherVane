from __future__ import annotations

from typing import Any

from pydantic import Field

from shared.schemas.base import APIModel


class ProductSourceRecord(APIModel):
    """Normalized view of a product pulled from any ingestion source."""

    tenant_id: str
    canonical_product_id: str
    product_id: str
    source: str
    product_name: str | None = None
    title: str | None = None
    category: str | None = None
    subcategory: str | None = None
    vendor: str | None = None
    brand: str | None = None
    tags: list[str] = Field(default_factory=list)
    description: str | None = None
    language: str | None = None
    raw_attributes: dict[str, Any] = Field(default_factory=dict)


class ProductTaxonomyEntry(APIModel):
    """Standardized classification record driving downstream modeling."""

    tenant_id: str
    canonical_product_id: str
    product_name: str
    category_l1: str
    category_l2: str
    weather_affinity: str
    seasonality: str
    cross_brand_key: str
    product_ids: list[str] = Field(default_factory=list)
    brand_ids: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    evidence: dict[str, Any] = Field(default_factory=dict)
