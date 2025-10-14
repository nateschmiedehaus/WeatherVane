from fastapi import APIRouter, Depends, Path

from apps.api.services.dashboard_service import DashboardService
from shared.schemas.dashboard import DashboardResponse

router = APIRouter()


def get_dashboard_service() -> DashboardService:
    return DashboardService()


@router.get("/{tenant_id}", response_model=DashboardResponse)
async def get_dashboard(
    tenant_id: str = Path(..., description="Tenant identifier"),
    service: DashboardService = Depends(get_dashboard_service),
) -> DashboardResponse:
    """Return guardrail, weather, and automation telemetry for WeatherOps."""

    return await service.get_dashboard(tenant_id)

