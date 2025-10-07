from fastapi import APIRouter, Depends, Path
from sqlalchemy.ext.asyncio import AsyncSession

from shared.schemas.base import PlanResponse

from apps.api.dependencies import db_session
from apps.api.services.plan_service import PlanService
from apps.api.services.repositories import PlanRepository

router = APIRouter()


def get_plan_service(session: AsyncSession = Depends(db_session)) -> PlanService:
    repo = PlanRepository(session)
    return PlanService(repo)


@router.get("/{tenant_id}", response_model=PlanResponse)
async def get_plan(
    tenant_id: str = Path(..., description="Tenant identifier"),
    horizon_days: int = 7,
    service: PlanService = Depends(get_plan_service),
) -> PlanResponse:
    """Return the latest plan for a tenant.

    Falls back to a synthetic example plan if no persisted plan exists yet.
    """

    return await service.get_latest_plan(tenant_id, horizon_days=horizon_days)
