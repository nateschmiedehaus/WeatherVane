from fastapi import APIRouter, Depends, HTTPException, Path, Response
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.config import get_settings
from apps.api.dependencies import db_session
from apps.api.services.exceptions import SchemaValidationError
from apps.api.services.plan_service import PlanService
from apps.api.services.repositories import PlanRepository
from shared.data_context import default_context_service
from shared.schemas.base import PlanResponse

router = APIRouter()


def get_plan_service(session: AsyncSession = Depends(db_session)) -> PlanService:
    repo = PlanRepository(session)
    settings = get_settings()
    warning_engine = settings.build_warning_engine()
    return PlanService(repo, default_context_service, warning_engine)


@router.get("/{tenant_id}", response_model=PlanResponse)
async def get_plan(
    response: Response,
    tenant_id: str = Path(..., description="Tenant identifier"),
    horizon_days: int = 7,
    service: PlanService = Depends(get_plan_service),
) -> PlanResponse:
    """Return the latest plan for a tenant.

    Falls back to a synthetic example plan if no persisted plan exists yet.
    """
    try:
        plan = await service.get_latest_plan(tenant_id, horizon_days=horizon_days)
    except SchemaValidationError as exc:
        raise HTTPException(status_code=500, detail=exc.to_detail()) from exc
    if plan.context_tags:
        response.headers["X-WeatherVane-Context"] = ",".join(plan.context_tags)
    if plan.context_warnings:
        response.headers["X-WeatherVane-Warnings"] = ",".join(
            warning.code for warning in plan.context_warnings
        )
    return plan
