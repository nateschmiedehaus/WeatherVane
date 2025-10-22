from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from apps.api.schemas.consensus import ConsensusWorkloadResponse
from apps.api.schemas.orchestration import OrchestrationMetricsResponse
from apps.api.services.consensus_service import ConsensusService, ConsensusSnapshotUnavailable
from apps.api.services.orchestration_metrics_service import (
    OrchestrationMetricsService,
    OrchestrationMetricsUnavailable,
)

router = APIRouter(prefix="/operations", tags=["operations"])


def get_consensus_service() -> ConsensusService:
    return ConsensusService()


def get_orchestration_metrics_service() -> OrchestrationMetricsService:
    return OrchestrationMetricsService()


@router.get(
    "/consensus",
    response_model=ConsensusWorkloadResponse,
    summary="Retrieve consensus workload telemetry.",
)
async def get_consensus_workload(
    service: ConsensusService = Depends(get_consensus_service),
) -> ConsensusWorkloadResponse:
    """Expose hierarchical consensus and escalation telemetry for WeatherOps surfaces."""

    try:
        snapshot = service.get_workload_snapshot()
    except ConsensusSnapshotUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": str(exc)},
        ) from exc
    return ConsensusWorkloadResponse.model_validate(snapshot)


@router.get(
    "/orchestration-metrics",
    response_model=OrchestrationMetricsResponse,
    summary="Retrieve dynamic staffing telemetry and history.",
)
async def get_orchestration_metrics(
    service: OrchestrationMetricsService = Depends(get_orchestration_metrics_service),
) -> OrchestrationMetricsResponse:
    """Expose aggregate staffing telemetry for the dynamic orchestration pipeline."""

    try:
        snapshot = service.get_metrics_snapshot()
    except OrchestrationMetricsUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"message": str(exc)},
        ) from exc
    return OrchestrationMetricsResponse.model_validate(snapshot)


__all__ = [
    "get_consensus_service",
    "get_consensus_workload",
    "get_orchestration_metrics",
    "get_orchestration_metrics_service",
    "router",
]
