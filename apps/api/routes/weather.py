from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from apps.api.schemas.weather import WeatherShockAnalysisRequest, WeatherShockAnalysisResponse
from apps.api.services.weather_service import analyze_weather_shock

router = APIRouter()


@router.post(
    "/weather/shock-analysis",
    response_model=WeatherShockAnalysisResponse,
    status_code=status.HTTP_200_OK,
)
async def weather_shock_analysis_endpoint(
    payload: WeatherShockAnalysisRequest,
) -> WeatherShockAnalysisResponse:
    """Estimate weather shock impact for a treated geo."""

    try:
        return analyze_weather_shock(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
