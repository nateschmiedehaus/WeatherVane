"""Geographic and weather-based taxonomy services."""

from __future__ import annotations

import logging
import pandas as pd
import polars as pl
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence
from loguru import logger

from shared.libs.geography import GeographyMapper, GeographyResolution
from shared.schemas.product_taxonomy import ProductSourceRecord
from shared.services.product_taxonomy import (
    AFFINITY_SEASONALITY,
    VALID_WEATHER_AFFINITIES,
    ProductTaxonomyClassifier,
    ProductTaxonomyLLMResult,
)

WEATHER_SYSTEM_PROMPT = (
    "You are a retail merchandising analyst specializing in weather-driven demand. "
    "Classify catalog products with a focus on weather sensitivity and seasonal patterns. "
    "Use title, description, category, and tags to determine:\n"
    "1. Primary weather affinity (winter, summer, rain, heat, neutral)\n"
    "2. Weather sensitivity score (0-1)\n"
    "3. Weather correlation signals\n"
    "Respond with strict JSON including all standard taxonomy fields plus weather_signals."
)

WEATHER_EXAMPLE = """### Example
Input:
source=shopify; title=UV Protection Beach Umbrella; tags=['summer','beach','sun protection']
Output:
{
    "category_l1": "outdoor",
    "category_l2": "sun_protection",
    "weather_affinity": "heat",
    "seasonality": "seasonal_q2_q3",
    "confidence": 0.95,
    "reasoning": "Explicit UV protection for hot, sunny conditions",
    "weather_signals": {
        "sensitivity": 0.9,
        "correlations": {
            "temperature": "positive",
            "uv_index": "strong_positive",
            "precipitation": "negative"
        }
    }
}
"""

@dataclass(frozen=True)
class WeatherTaxonomyResult(ProductTaxonomyLLMResult):
    """Extends standard taxonomy with weather-specific signals"""
    weather_sensitivity: float
    temperature_correlation: str
    uv_correlation: str
    precipitation_correlation: str

    @classmethod
    def from_llm_result(
        cls,
        base: ProductTaxonomyLLMResult,
        weather_data: Dict[str, Any]
    ) -> WeatherTaxonomyResult:
        sensitivity = float(weather_data.get("sensitivity", 0.0))
        correlations = weather_data.get("correlations", {})

        return cls(
            category_l1=base.category_l1,
            category_l2=base.category_l2,
            weather_affinity=base.weather_affinity,
            seasonality=base.seasonality,
            confidence=base.confidence,
            reasoning=base.reasoning,
            model=base.model,
            raw_payload=base.raw_payload,
            weather_sensitivity=max(0.0, min(1.0, sensitivity)),
            temperature_correlation=correlations.get("temperature", "neutral"),
            uv_correlation=correlations.get("uv_index", "neutral"),
            precipitation_correlation=correlations.get("precipitation", "neutral")
        )

@dataclass
class WeatherTaxonomyClassifier(ProductTaxonomyClassifier):
    """Enhanced product classifier with weather-specific analysis"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.logger = logging.getLogger(__name__)

    def classify_with_weather(
        self,
        records: Sequence[ProductSourceRecord],
        *,
        combined_text: str | None = None
    ) -> Optional[WeatherTaxonomyResult]:
        """Classify products with enhanced weather affinity analysis"""
        base_result = super().classify(records, combined_text=combined_text)
        if not base_result:
            return None

        try:
            weather_signals = base_result.raw_payload.get("weather_signals", {})
            return WeatherTaxonomyResult.from_llm_result(base_result, weather_signals)
        except Exception:
            self.logger.exception("Failed to extract weather taxonomy signals")
            return None

    def _classification_prompt(
        self,
        records: Sequence[ProductSourceRecord],
        *,
        combined_text: str | None
    ) -> str:
        """Override to use weather-specific prompting"""
        lines: List[str] = [WEATHER_EXAMPLE, "### Task", "Catalog records:"]
        for index, record in enumerate(records, 1):
            lines.append(self._render_record(index, record))
        if combined_text:
            lines.append(f"Combined text: {combined_text[:4000]}")
        lines.append(
            "Return JSON with standard taxonomy plus weather_signals: {\n"
            "  'category_l1': string,\n"
            "  'category_l2': string,\n"
            "  'weather_affinity': winter|summer|rain|heat|neutral,\n"
            "  'seasonality': seasonal_q[1-4]|weather_triggered|evergreen,\n"
            "  'confidence': float 0-1,\n"
            "  'reasoning': string,\n"
            "  'weather_signals': {\n"
            "    'sensitivity': float 0-1,\n"
            "    'correlations': {\n"
            "      'temperature': strong_positive|positive|neutral|negative|strong_negative,\n"
            "      'uv_index': strong_positive|positive|neutral|negative|strong_negative,\n"
            "      'precipitation': strong_positive|positive|neutral|negative|strong_negative\n"
            "    }\n"
            "  }\n"
            "}"
        )
        return "\n".join(lines)

class WeatherGeographyService:
    """Service for DMA-first geographic aggregation with hierarchical fallback."""

    def __init__(
        self,
        geocoded_ratio: float | None = None,
        weather_coverage: float | None = None,
    ) -> None:
        """Initialize the weather geography service.

        Args:
            geocoded_ratio: Ratio of orders with valid geocoding (0-1)
            weather_coverage: Ratio of dates with weather data (0-1)
        """
        self.mapper = GeographyMapper(
            geocoded_ratio=geocoded_ratio,
            weather_coverage=weather_coverage,
        )

    def aggregate_frame(
        self,
        frame: pl.DataFrame,
        geohash_column: str = "geohash",
    ) -> pl.DataFrame:
        """Aggregate a data frame based on DMA-first geography with fallback.

        Args:
            frame: Data frame to aggregate
            geohash_column: Column containing geohash values

        Returns:
            Data frame with geographic aggregation levels
        """
        if geohash_column not in frame.columns:
            logger.warning("No geohash column found - returning original frame")
            return frame

        # Cache geohash resolutions
        resolutions: dict[str, GeographyResolution] = {}
        for geohash in frame[geohash_column].unique():
            if not geohash:
                continue
            resolutions[geohash] = self.mapper.lookup(geohash)

        # Add geographic columns
        with_geo = frame.with_columns([
            pl.col(geohash_column).map_elements(
                lambda gh: resolutions.get(gh, self.mapper._global(gh)).level
            ).alias("geo_level"),
            pl.col(geohash_column).map_elements(
                lambda gh: resolutions.get(gh, self.mapper._global(gh)).scope
            ).alias("geo_scope"),
            pl.col(geohash_column).map_elements(
                lambda gh: resolutions.get(gh, self.mapper._global(gh)).dma_code
            ).alias("dma_code"),
            pl.col(geohash_column).map_elements(
                lambda gh: resolutions.get(gh, self.mapper._global(gh)).state_abbr
            ).alias("state_abbr"),
        ])

        logger.info(
            "Geographic resolution breakdown: DMA={dma_count} STATE={state_count} GLOBAL={global_count}",
            dma_count=len([r for r in resolutions.values() if r.is_dma]),
            state_count=len([r for r in resolutions.values() if r.is_state]),
            global_count=len([r for r in resolutions.values() if r.is_global]),
        )

        return with_geo

    def aggregate_pandas(
        self,
        frame: pd.DataFrame,
        geohash_column: str = "geohash",
    ) -> pd.DataFrame:
        """Aggregate a pandas data frame based on DMA-first geography with fallback.

        Args:
            frame: Data frame to aggregate
            geohash_column: Column containing geohash values

        Returns:
            Data frame with geographic aggregation levels
        """
        polars_frame = pl.from_pandas(frame)
        result = self.aggregate_frame(polars_frame, geohash_column)
        return result.to_pandas()