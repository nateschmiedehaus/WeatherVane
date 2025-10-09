from __future__ import annotations

from fastapi import APIRouter, Depends, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from shared.schemas.base import DataRequestPayload, DataRequestResponse, DataRequestType

from apps.api.config import get_settings
from apps.api.dependencies import db_session
from apps.api.services.automation_service import AutomationService
from apps.api.services.notifications import WebhookPublisher
from apps.api.services.repositories import AutomationRepository, AuditLogRepository

router = APIRouter()


def get_automation_service(session: AsyncSession = Depends(db_session)) -> AutomationService:
    repository = AutomationRepository(session)
    audit_repo = AuditLogRepository(session)
    settings = get_settings()
    publisher = WebhookPublisher(settings.automation_webhook_url)
    warning_engine = settings.build_warning_engine()
    return AutomationService(
        repository=repository,
        audit_repo=audit_repo,
        publisher=publisher,
        warning_engine=warning_engine,
    )


@router.post(
    "/{tenant_id}/export",
    response_model=DataRequestResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_data_export(
    payload: DataRequestPayload,
    tenant_id: str = Path(..., description="Tenant identifier"),
    service: AutomationService = Depends(get_automation_service),
) -> DataRequestResponse:
    """Request a full data export for the tenant."""

    return await service.create_data_request(tenant_id, DataRequestType.export, payload)


@router.post(
    "/{tenant_id}/delete",
    response_model=DataRequestResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_data_delete(
    payload: DataRequestPayload,
    tenant_id: str = Path(..., description="Tenant identifier"),
    service: AutomationService = Depends(get_automation_service),
) -> DataRequestResponse:
    """Request deletion of tenant data per retention guarantees."""

    return await service.create_data_request(tenant_id, DataRequestType.delete, payload)
