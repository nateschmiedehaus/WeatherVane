from __future__ import annotations

from typing import Literal, Optional

from pydantic import Field, field_validator, confloat

from shared.schemas.base import APIModel
from shared.schemas.product_taxonomy import ProductSourceRecord, ProductTaxonomyEntry

CorrelationType = Literal[
    "strong_positive",
    "positive",
    "neutral",
    "negative",
    "strong_negative"
]

class TaxonomyClassificationRequest(APIModel):
    """API payload requesting taxonomy classification for product records."""

    records: list[ProductSourceRecord] = Field(default_factory=list)
    combined_text: Optional[str] = Field(
        None,
        description="Optional combined text for classification context"
    )

    @field_validator("records")
    @classmethod
    def _validate_records(cls, value: list[ProductSourceRecord]) -> list[ProductSourceRecord]:
        if not value:
            raise ValueError("records must contain at least one product source record")
        return value


class WeatherTaxonomyResponse(APIModel):
    """Enhanced taxonomy classification with weather-specific signals."""

    category_l1: str = Field(..., min_length=1)
    category_l2: str = Field(..., min_length=1)
    weather_affinity: str = Field(..., min_length=1)
    seasonality: str = Field(..., min_length=1)
    confidence: confloat(ge=0.0, le=1.0)
    reasoning: str = Field(..., min_length=1)
    weather_sensitivity: confloat(ge=0.0, le=1.0)
    temperature_correlation: CorrelationType
    uv_correlation: CorrelationType
    precipitation_correlation: CorrelationType


class TaxonomyClassificationResponse(APIModel):
    """Classification results for the supplied product records."""

    entries: list[ProductTaxonomyEntry] = Field(default_factory=list)
    count: int = Field(description="Number of classified product entries")

