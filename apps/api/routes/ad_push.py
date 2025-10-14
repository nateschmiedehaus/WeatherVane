from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Path

from apps.api.schemas.ad_push import AdPushDiffResponse, AdPushRollbackManifest
from apps.api.services.ad_push_service import AdPushDiffService

router = APIRouter(prefix="/tenants")


def get_ad_push_service() -> AdPushDiffService:
    return AdPushDiffService()


@router.get(
    "/{tenant_id}/ad-pushes/latest",
    response_model=AdPushDiffResponse,
    summary="Fetch the latest ad push preflight diff for a tenant",
)
async def get_latest_ad_push_diff(
    tenant_id: str = Path(..., description="Tenant identifier"),
    service: AdPushDiffService = Depends(get_ad_push_service),
) -> AdPushDiffResponse:
    diff = await service.get_latest(tenant_id)
    if diff is None:
        raise HTTPException(status_code=404, detail="Preflight diff not found")
    return diff


@router.get(
    "/{tenant_id}/ad-pushes/{run_id}",
    response_model=AdPushDiffResponse,
    summary="Fetch a specific ad push preflight diff by run identifier",
)
async def get_ad_push_diff_by_run(
    tenant_id: str = Path(..., description="Tenant identifier"),
    run_id: str = Path(..., description="Preflight run identifier"),
    service: AdPushDiffService = Depends(get_ad_push_service),
) -> AdPushDiffResponse:
    diff = await service.get_by_run(tenant_id, run_id)
    if diff is None:
        raise HTTPException(status_code=404, detail="Preflight diff not found")
    return diff


@router.get(
    "/{tenant_id}/ad-pushes/{run_id}/rollback",
    response_model=AdPushRollbackManifest,
    summary="Fetch rollback manifest for an ad push run",
)
async def get_ad_push_rollback_manifest(
    tenant_id: str = Path(..., description="Tenant identifier"),
    run_id: str = Path(..., description="Preflight run identifier"),
    service: AdPushDiffService = Depends(get_ad_push_service),
) -> AdPushRollbackManifest:
    manifest = await service.get_rollback_manifest(tenant_id, run_id)
    if manifest is None:
        raise HTTPException(status_code=404, detail="Rollback manifest not found")
    return manifest
