from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Response
from sqlalchemy.ext.asyncio import AsyncSession

from shared.schemas.base import CatalogResponse

from apps.api.config import get_settings
from apps.api.dependencies import db_session
from apps.api.services.exceptions import SchemaValidationError
from apps.api.services.catalog_service import CatalogService
from apps.api.services.plan_service import PlanService
from apps.api.services.repositories import PlanRepository
from shared.data_context import default_context_service

router = APIRouter(prefix="/catalog")


def get_catalog_service(session: AsyncSession = Depends(db_session)) -> CatalogService:
    plan_repo = PlanRepository(session)
    settings = get_settings()
    warning_engine = settings.build_warning_engine()
    plan_service = PlanService(plan_repo, default_context_service, warning_engine)
    return CatalogService(plan_service)


@router.get("/{tenant_id}", response_model=CatalogResponse)
async def get_catalog(
    response: Response,
    tenant_id: str = Path(..., description="Tenant identifier"),
    horizon_days: int = 7,
    limit: int = 12,
    service: CatalogService = Depends(get_catalog_service),
) -> CatalogResponse:
    try:
        catalog = await service.fetch_catalog(tenant_id, horizon_days=horizon_days, limit=limit)
    except SchemaValidationError as exc:
        raise HTTPException(status_code=500, detail=exc.to_detail()) from exc
    if catalog.context_tags:
        response.headers["X-WeatherVane-Context"] = ",".join(catalog.context_tags)
    if catalog.context_warnings:
        response.headers["X-WeatherVane-Warnings"] = ",".join(
            warning.code for warning in catalog.context_warnings
        )
    return catalog
