from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path

from shared.schemas.allocator import SaturationReport, ShadowRunReport

from apps.api.services.allocator_service import load_saturation_report, load_shadow_report

router = APIRouter()


@router.get("/shadow/{tenant_id}", response_model=ShadowRunReport)
def get_shadow_mode_report(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> ShadowRunReport:
    try:
        return load_shadow_report()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/saturation/{tenant_id}", response_model=SaturationReport)
def get_saturation_report(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> SaturationReport:
    try:
        return load_saturation_report()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


__all__ = ["router", "get_shadow_mode_report", "get_saturation_report"]
