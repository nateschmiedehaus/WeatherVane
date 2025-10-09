from fastapi import APIRouter, Depends, Path, Response
from sqlalchemy.ext.asyncio import AsyncSession

from shared.schemas.base import AutomationSettings, AutomationSettingsResponse

from apps.api.config import get_settings
from apps.api.dependencies import db_session
from apps.api.services.automation_service import AutomationService
from apps.api.services.notifications import WebhookPublisher
from apps.api.services.repositories import AutomationRepository, AuditLogRepository
from shared.data_context import default_context_service

router = APIRouter(prefix="/settings")


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
        context_service=default_context_service,
        warning_engine=warning_engine,
    )


@router.get("/{tenant_id}/automation", response_model=AutomationSettingsResponse)
async def get_automation_settings(
    response: Response,
    tenant_id: str = Path(..., description="Tenant identifier"),
    service: AutomationService = Depends(get_automation_service),
) -> AutomationSettingsResponse:
    """Return guided automation settings for a tenant."""
    settings = await service.get_settings(tenant_id)
    if settings.context_tags:
        response.headers["X-WeatherVane-Context"] = ",".join(settings.context_tags)
    if settings.context_warnings:
        response.headers["X-WeatherVane-Warnings"] = ",".join(
            warning.code for warning in settings.context_warnings
        )
    return settings


@router.put("/{tenant_id}/automation", response_model=AutomationSettingsResponse)
async def update_automation_settings(
    payload: AutomationSettings,
    response: Response,
    tenant_id: str = Path(..., description="Tenant identifier"),
    service: AutomationService = Depends(get_automation_service),
) -> AutomationSettingsResponse:
    """Persist guided automation settings including consent and push guardrails."""
    settings = await service.update_settings(tenant_id, payload)
    if settings.context_tags:
        response.headers["X-WeatherVane-Context"] = ",".join(settings.context_tags)
    if settings.context_warnings:
        response.headers["X-WeatherVane-Warnings"] = ",".join(
            warning.code for warning in settings.context_warnings
        )
    return settings
