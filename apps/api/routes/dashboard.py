from datetime import datetime

from fastapi import APIRouter, Body, Depends, HTTPException, Path, Query, status

from apps.api.services.dashboard_service import DashboardService
from shared.schemas.dashboard import (
    AlertAcknowledgeRequest,
    AlertAcknowledgeResponse,
    AlertEscalateRequest,
    AlertEscalateResponse,
    DashboardResponse,
)

router = APIRouter()


def get_dashboard_service() -> DashboardService:
    return DashboardService()


@router.get("/{tenant_id}", response_model=DashboardResponse)
async def get_dashboard(
    tenant_id: str = Path(..., description="Tenant identifier"),
    since: datetime | None = Query(default=None, description="Return suggestion telemetry occurring after this timestamp."),
    service: DashboardService = Depends(get_dashboard_service),
) -> DashboardResponse:
    """Return guardrail, weather, and automation telemetry for WeatherOps."""

    return await service.get_dashboard(tenant_id, since=since)


@router.post(
    "/{tenant_id}/alerts/{alert_id}/ack",
    response_model=AlertAcknowledgeResponse,
    status_code=status.HTTP_200_OK,
)
async def acknowledge_alert(
    tenant_id: str = Path(..., description="Tenant identifier"),
    alert_id: str = Path(..., description="Dashboard alert identifier"),
    payload: AlertAcknowledgeRequest = Body(default=AlertAcknowledgeRequest()),
    service: DashboardService = Depends(get_dashboard_service),
) -> AlertAcknowledgeResponse:
    """Mark a dashboard alert as acknowledged and persist the audit record."""

    try:
        return service.acknowledge_alert(
            tenant_id,
            alert_id,
            acknowledged_by=payload.acknowledged_by,
            note=payload.note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post(
    "/{tenant_id}/alerts/{alert_id}/escalate",
    response_model=AlertEscalateResponse,
    status_code=status.HTTP_200_OK,
)
async def escalate_alert(
    tenant_id: str = Path(..., description="Tenant identifier"),
    alert_id: str = Path(..., description="Dashboard alert identifier"),
    payload: AlertEscalateRequest = Body(...),
    service: DashboardService = Depends(get_dashboard_service),
) -> AlertEscalateResponse:
    """Trigger an escalation workflow for a dashboard alert."""

    try:
        return service.escalate_alert(
            tenant_id,
            alert_id,
            channel=payload.channel,
            target=payload.target,
            note=payload.note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
