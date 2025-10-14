from __future__ import annotations

from fastapi import APIRouter, HTTPException, Path

from shared.schemas.creative import CreativeResponseReport

from apps.api.services.creative_service import load_creative_response

router = APIRouter()


@router.get("/{tenant_id}", response_model=CreativeResponseReport)
def get_creative_response(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> CreativeResponseReport:
    try:
        return load_creative_response()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


__all__ = ["router", "get_creative_response"]
