from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Response
from sqlalchemy.ext.asyncio import AsyncSession

from shared.schemas.base import StoriesResponse

from apps.api.config import get_settings
from apps.api.dependencies import db_session
from apps.api.services.plan_service import PlanService
from apps.api.services.repositories import PlanRepository
from apps.api.services.story_service import StoryService
from shared.data_context import default_context_service

router = APIRouter(prefix="/stories")


def get_story_service(session: AsyncSession = Depends(db_session)) -> StoryService:
    plan_repo = PlanRepository(session)
    settings = get_settings()
    warning_engine = settings.build_warning_engine()
    plan_service = PlanService(plan_repo, default_context_service, warning_engine)
    return StoryService(plan_service)


@router.get("/{tenant_id}", response_model=StoriesResponse)
async def get_stories(
    response: Response,
    tenant_id: str = Path(..., description="Tenant identifier"),
    horizon_days: int = 7,
    limit: int = 6,
    service: StoryService = Depends(get_story_service),
) -> StoriesResponse:
    """Return narrative weather stories derived from the latest plan."""
    stories = await service.latest_stories(tenant_id, horizon_days=horizon_days, limit=limit)
    if stories.context_tags:
        response.headers["X-WeatherVane-Context"] = ",".join(stories.context_tags)
    if stories.context_warnings:
        response.headers["X-WeatherVane-Warnings"] = ",".join(
            warning.code for warning in stories.context_warnings
        )
    return stories
