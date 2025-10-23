from fastapi import APIRouter, Body, Depends, HTTPException, Path, Response
from sqlalchemy.ext.asyncio import AsyncSession

from apps.api.config import get_settings
from apps.api.dependencies import db_session
from apps.api.services.exceptions import SchemaValidationError
from apps.api.services.plan_service import PlanService
from apps.api.services.scenario_service import ScenarioRecommendationService
from apps.api.services.scenario_snapshot_service import ScenarioSnapshotService
from apps.api.services.repositories import PlanRepository
from shared.data_context import default_context_service
from shared.schemas.base import (
    PlanResponse,
    ScenarioRecommendationResponse,
    ScenarioSnapshot,
    ScenarioSnapshotListResponse,
)
from shared.validation.schemas import enforce_schema

router = APIRouter()


def get_plan_service(session: AsyncSession = Depends(db_session)) -> PlanService:
    repo = PlanRepository(session)
    settings = get_settings()
    warning_engine = settings.build_warning_engine()
    return PlanService(repo, default_context_service, warning_engine)


def get_scenario_service(
    plan_service: PlanService = Depends(get_plan_service),
) -> ScenarioRecommendationService:
    return ScenarioRecommendationService(plan_service)


def get_snapshot_service() -> ScenarioSnapshotService:
    return ScenarioSnapshotService()


@router.get("/{tenant_id}", response_model=PlanResponse)
@enforce_schema("plan_response")
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


@router.get(
    "/{tenant_id}/scenarios/recommendations",
    response_model=ScenarioRecommendationResponse,
)
async def get_scenario_recommendations(
    tenant_id: str = Path(..., description="Tenant identifier"),
    horizon_days: int = 7,
    service: ScenarioRecommendationService = Depends(get_scenario_service),
) -> ScenarioRecommendationResponse:
    try:
        return await service.get_recommendations(tenant_id, horizon_days=horizon_days)
    except SchemaValidationError as exc:
        raise HTTPException(status_code=500, detail=exc.to_detail()) from exc


@router.get("/{tenant_id}/experiments", response_model=list[dict])
async def get_experiment_payloads(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> list[dict]:
    """Return active and completed experiments for a tenant.

    This endpoint returns experiment metadata and results including:
    - Geo holdout assignments
    - Treatment vs control performance
    - Lift and confidence intervals
    - Statistical significance

    Falls back to empty list if no experiments are available.
    """
    from apps.worker.validation import load_experiment_results

    try:
        experiment_data = load_experiment_results(tenant_id)
        if not experiment_data or experiment_data.get("status") == "missing":
            return []

        # Transform stored experiment design + summary into ExperimentPayload format
        design = experiment_data.get("design", {})
        summary = experiment_data.get("summary", {})

        # Build experiment payload from design and summary
        payload = {
            "experiment_id": f"geo-holdout-{tenant_id}",
            "status": "completed" if summary else "pending",
            "treatment_geos": design.get("treatment_geos", []),
            "control_geos": design.get("control_geos", []),
            "metric_name": "revenue",
            "start_date": design.get("start_date"),
            "end_date": design.get("end_date"),
        }

        # Add lift metrics if summary is available
        if summary:
            payload["lift"] = {
                "absolute_lift": summary.get("lift", 0.0),
                "lift_pct": summary.get("lift", 0.0) * 100,
                "confidence_low": summary.get("conf_low", 0.0),
                "confidence_high": summary.get("conf_high", 0.0),
                "p_value": summary.get("p_value", 1.0),
                "sample_size": summary.get("sample_size_treatment", 0) + summary.get("sample_size_control", 0),
                "is_significant": summary.get("p_value", 1.0) < 0.05,
                "generated_at": experiment_data.get("generated_at"),
            }

        return [payload] if payload.get("treatment_geos") or payload.get("control_geos") else []
    except Exception:
        # Best-effort: return empty list if experiment data cannot be loaded
        return []


# Scenario Snapshot Endpoints


@router.post(
    "/{tenant_id}/scenarios/snapshots",
    response_model=ScenarioSnapshot,
    status_code=201,
)
async def create_scenario_snapshot(
    tenant_id: str = Path(..., description="Tenant identifier"),
    name: str = Body(..., description="Scenario name"),
    adjustments: dict[str, float] = Body(..., description="Channel adjustments"),
    horizon_days: int = Body(7, description="Planning horizon"),
    description: str | None = Body(None, description="Optional description"),
    tags: list[str] | None = Body(None, description="Optional tags"),
    created_by: str | None = Body(None, description="User who created the scenario"),
    service: ScenarioSnapshotService = Depends(get_snapshot_service),
    plan_service: PlanService = Depends(get_plan_service),
) -> ScenarioSnapshot:
    """Save a new scenario snapshot for later reference.

    Snapshots allow users to save and compare different what-if scenarios.
    Each snapshot captures channel adjustments and metadata.
    """
    plan: PlanResponse | None = None
    try:
        plan = await plan_service.get_latest_plan(tenant_id, horizon_days=horizon_days)
    except SchemaValidationError as exc:
        raise HTTPException(status_code=500, detail=exc.to_detail()) from exc
    except Exception:
        # Snapshot creation should still succeed even if plan retrieval fails,
        # so we fall back to storing without computed summary.
        plan = None

    try:
        return await service.save_snapshot(
            tenant_id=tenant_id,
            name=name,
            adjustments=adjustments,
            horizon_days=horizon_days,
            description=description,
            tags=tags or [],
            created_by=created_by,
            plan=plan,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save snapshot: {exc}") from exc


@router.get(
    "/{tenant_id}/scenarios/snapshots",
    response_model=ScenarioSnapshotListResponse,
)
async def list_scenario_snapshots(
    tenant_id: str = Path(..., description="Tenant identifier"),
    service: ScenarioSnapshotService = Depends(get_snapshot_service),
) -> ScenarioSnapshotListResponse:
    """List all saved scenario snapshots for a tenant.

    Returns snapshots ordered by creation time (newest first).
    """
    try:
        return await service.list_snapshots(tenant_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to list snapshots: {exc}") from exc


@router.get(
    "/{tenant_id}/scenarios/snapshots/{snapshot_id}",
    response_model=ScenarioSnapshot,
)
async def get_scenario_snapshot(
    tenant_id: str = Path(..., description="Tenant identifier"),
    snapshot_id: str = Path(..., description="Snapshot identifier"),
    service: ScenarioSnapshotService = Depends(get_snapshot_service),
) -> ScenarioSnapshot:
    """Retrieve a specific scenario snapshot."""
    snapshot = await service.get_snapshot(tenant_id, snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snapshot


@router.delete(
    "/{tenant_id}/scenarios/snapshots/{snapshot_id}",
    status_code=204,
)
async def delete_scenario_snapshot(
    tenant_id: str = Path(..., description="Tenant identifier"),
    snapshot_id: str = Path(..., description="Snapshot identifier"),
    service: ScenarioSnapshotService = Depends(get_snapshot_service),
) -> None:
    """Delete a scenario snapshot."""
    deleted = await service.delete_snapshot(tenant_id, snapshot_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Snapshot not found")


@router.patch(
    "/{tenant_id}/scenarios/snapshots/{snapshot_id}",
    response_model=ScenarioSnapshot,
)
async def update_scenario_snapshot(
    tenant_id: str = Path(..., description="Tenant identifier"),
    snapshot_id: str = Path(..., description="Snapshot identifier"),
    name: str | None = Body(None, description="New scenario name"),
    description: str | None = Body(None, description="New description"),
    tags: list[str] | None = Body(None, description="New tags"),
    service: ScenarioSnapshotService = Depends(get_snapshot_service),
) -> ScenarioSnapshot:
    """Update scenario snapshot metadata (name, description, tags)."""
    snapshot = await service.update_snapshot(
        tenant_id=tenant_id,
        snapshot_id=snapshot_id,
        name=name,
        description=description,
        tags=tags,
    )
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return snapshot
