from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from apps.api.schemas.taxonomy import (
    TaxonomyClassificationRequest,
    TaxonomyClassificationResponse,
    WeatherTaxonomyResponse,
)
from apps.api.services.product_taxonomy import ProductTaxonomyService
from shared.services.weather_taxonomy import WeatherTaxonomyClassifier

router = APIRouter()


def get_taxonomy_service() -> ProductTaxonomyService:
    return ProductTaxonomyService()


def get_weather_taxonomy_service() -> WeatherTaxonomyClassifier:
    return WeatherTaxonomyClassifier()


@router.post(
    "/taxonomy/classify",
    response_model=TaxonomyClassificationResponse,
    status_code=status.HTTP_200_OK,
)
async def classify_products(
    payload: TaxonomyClassificationRequest,
    service: ProductTaxonomyService = Depends(get_taxonomy_service),
) -> TaxonomyClassificationResponse:
    """Classify product records into the WeatherVane taxonomy."""

    try:
        entries = service.classify(payload.records)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return TaxonomyClassificationResponse(entries=entries, count=len(entries))


@router.post(
    "/taxonomy/classify-weather",
    response_model=WeatherTaxonomyResponse,
    status_code=status.HTTP_200_OK,
)
async def classify_products_with_weather(
    payload: TaxonomyClassificationRequest,
    service: Annotated[WeatherTaxonomyClassifier, Depends(get_weather_taxonomy_service)],
) -> WeatherTaxonomyResponse:
    """
    Classify products with weather-aware taxonomy analysis.

    Returns enhanced classification including weather sensitivity scores
    and correlation signals with temperature, UV index, and precipitation.
    """
    try:
        result = service.classify_with_weather(
            payload.records,
            combined_text=payload.combined_text
        )
        if not result:
            raise ValueError("Classification failed")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Failed to classify products. Check input data and try again."
        ) from exc

    return WeatherTaxonomyResponse(
        category_l1=result.category_l1,
        category_l2=result.category_l2,
        weather_affinity=result.weather_affinity,
        seasonality=result.seasonality,
        confidence=result.confidence,
        reasoning=result.reasoning,
        weather_sensitivity=result.weather_sensitivity,
        temperature_correlation=result.temperature_correlation,
        uv_correlation=result.uv_correlation,
        precipitation_correlation=result.precipitation_correlation
    )

