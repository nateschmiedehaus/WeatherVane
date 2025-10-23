"""Routes for dashboard analytics ingestion."""

from __future__ import annotations

from fastapi import APIRouter, status

from apps.api.schemas.analytics import (
    DashboardSuggestionEventRequest,
    DashboardSuggestionEventResponse,
)
from shared.services.dashboard_analytics import record_dashboard_suggestion_event as record_dashboard_suggestion_metric
from shared.validation.schemas import validate_analytics_event_request

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.post(
    "/dashboard/suggestion-events",
    response_model=DashboardSuggestionEventResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def record_dashboard_suggestion_event_endpoint(
    payload: DashboardSuggestionEventRequest,
) -> DashboardSuggestionEventResponse:
    """Record WeatherOps suggestion analytics events."""

    # Validate input request
    validate_analytics_event_request(payload)

    event = payload.to_domain_model()
    record_dashboard_suggestion_metric(event)
    return DashboardSuggestionEventResponse()
