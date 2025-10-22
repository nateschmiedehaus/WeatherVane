from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path, Response
from sqlalchemy.ext.asyncio import AsyncSession

from shared.schemas.base import ReportsResponse

from apps.api.config import get_settings
from apps.api.dependencies import db_session
from apps.api.services.exceptions import SchemaValidationError
from apps.api.services.plan_service import PlanService
from apps.api.services.report_service import ReportService
from apps.api.services.repositories import PlanRepository
from shared.data_context import default_context_service

router = APIRouter(prefix="/reports")


def get_report_service(session: AsyncSession = Depends(db_session)) -> ReportService:
    plan_repo = PlanRepository(session)
    settings = get_settings()
    warning_engine = settings.build_warning_engine()
    plan_service = PlanService(plan_repo, default_context_service, warning_engine)
    return ReportService(plan_service)


@router.get("/{tenant_id}", response_model=ReportsResponse)
async def get_reports(
    response: Response,
    tenant_id: str = Path(..., description="Tenant identifier"),
    horizon_days: int = 7,
    service: ReportService = Depends(get_report_service),
) -> ReportsResponse:
    """Return the latest executive report narratives, hero metrics, and schedule metadata."""
    try:
        report = await service.latest_report(tenant_id, horizon_days=horizon_days)
    except SchemaValidationError as exc:
        raise HTTPException(status_code=500, detail=exc.to_detail()) from exc

    if report.context_tags:
        response.headers["X-WeatherVane-Context"] = ",".join(report.context_tags)
    if report.context_warnings:
        response.headers["X-WeatherVane-Warnings"] = ",".join(
            warning.code for warning in report.context_warnings
        )
    return report

