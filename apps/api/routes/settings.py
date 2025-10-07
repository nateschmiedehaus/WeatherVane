from fastapi import APIRouter, Depends, Path

from shared.schemas.base import AutomationSettings, AutomationSettingsResponse

router = APIRouter(prefix="/settings")


@router.get("/{tenant_id}/automation", response_model=AutomationSettingsResponse)
async def get_automation_settings(
    tenant_id: str = Path(..., description="Tenant identifier")
) -> AutomationSettingsResponse:
    """Return default automation settings (read-only Plan & Proof mode)."""

    return AutomationSettingsResponse(
        tenant_id=tenant_id,
        settings=AutomationSettings(),
    )
