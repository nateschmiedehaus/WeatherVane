"""Tests for scenario snapshot service."""

import json
from datetime import datetime
from pathlib import Path

import pytest

from apps.api.services.scenario_snapshot_service import ScenarioSnapshotService
from shared.schemas.base import (
    ConfidenceLevel,
    PlanQuantiles,
    PlanRationale,
    PlanResponse,
    PlanSlice,
    ScenarioSnapshot,
)


@pytest.fixture
def temp_storage(tmp_path: Path) -> Path:
    """Create a temporary storage directory for tests."""
    storage_dir = tmp_path / "scenarios"
    storage_dir.mkdir(parents=True, exist_ok=True)
    return storage_dir


@pytest.fixture
def service(temp_storage: Path) -> ScenarioSnapshotService:
    """Create a scenario snapshot service with temp storage."""
    return ScenarioSnapshotService(storage_root=temp_storage)


@pytest.mark.asyncio
async def test_save_snapshot_creates_file(service: ScenarioSnapshotService, temp_storage: Path):
    """Test that saving a snapshot creates a JSON file."""
    tenant_id = "test-tenant"
    name = "Test Scenario"
    adjustments = {"Meta": 1.15, "Google": 0.9}

    snapshot = await service.save_snapshot(
        tenant_id=tenant_id,
        name=name,
        adjustments=adjustments,
        horizon_days=7,
    )

    assert snapshot.id is not None
    assert snapshot.tenant_id == tenant_id
    assert snapshot.name == name
    assert snapshot.adjustments == adjustments
    assert snapshot.horizon_days == 7

    # Verify file was created
    snapshot_file = temp_storage / tenant_id / f"{snapshot.id}.json"
    assert snapshot_file.exists()

    # Verify file content
    data = json.loads(snapshot_file.read_text())
    assert data["name"] == name
    assert data["adjustments"] == adjustments


@pytest.mark.asyncio
async def test_save_snapshot_with_metadata(service: ScenarioSnapshotService):
    """Test saving a snapshot with full metadata."""
    snapshot = await service.save_snapshot(
        tenant_id="test-tenant",
        name="Full Metadata Scenario",
        adjustments={"Meta": 1.2},
        horizon_days=14,
        description="This is a test scenario with all metadata",
        tags=["test", "high-confidence"],
        created_by="test-user",
    )

    assert snapshot.description == "This is a test scenario with all metadata"
    assert snapshot.tags == ["test", "high-confidence"]
    assert snapshot.created_by == "test-user"
    assert snapshot.horizon_days == 14


def _build_sample_plan() -> PlanResponse:
    now = datetime.utcnow()
    return PlanResponse(
        tenant_id="test-tenant",
        generated_at=now,
        horizon_days=7,
        slices=[
            PlanSlice(
                plan_date=now,
                geo_group_id="Gulf",
                category="Cooling",
                channel="Meta",
                recommended_spend=1000.0,
                expected_revenue=PlanQuantiles(p10=1200.0, p50=1600.0, p90=2100.0),
                expected_roas=PlanQuantiles(p10=1.1, p50=1.6, p90=2.2),
                confidence=ConfidenceLevel.HIGH,
                assumptions=["connector healthy"],
                rationale=PlanRationale(
                    primary_driver="Heat spike",
                    supporting_factors=["Geo coverage uplift"],
                    confidence_level=ConfidenceLevel.HIGH,
                    data_quality="complete",
                    assumptions=["inventory stable"],
                    risks=["creative fatigue"],
                ),
            ),
            PlanSlice(
                plan_date=now,
                geo_group_id="Rockies",
                category="Outerwear",
                channel="Google",
                recommended_spend=800.0,
                expected_revenue=PlanQuantiles(p10=900.0, p50=1200.0, p90=1500.0),
                expected_roas=PlanQuantiles(p10=1.0, p50=1.5, p90=1.9),
                confidence=ConfidenceLevel.MEDIUM,
                assumptions=["demand rising"],
                rationale=PlanRationale(
                    primary_driver="Early cold front",
                    supporting_factors=["Sustained search trend"],
                    confidence_level=ConfidenceLevel.MEDIUM,
                    data_quality="complete",
                    assumptions=["bid efficiency steady"],
                    risks=["category competition"],
                ),
            ),
        ],
    )


@pytest.mark.asyncio
async def test_save_snapshot_enriches_summary_when_plan_provided(
    service: ScenarioSnapshotService,
):
    """Providing a plan should persist back-calculated outcome metrics."""
    plan = _build_sample_plan()

    snapshot = await service.save_snapshot(
        tenant_id=plan.tenant_id,
        name="Scenario with summary",
        adjustments={"Meta": 1.1, "Google": 0.9},
        plan=plan,
    )

    assert snapshot.total_base_spend == pytest.approx(1800.0)
    assert snapshot.total_base_revenue == pytest.approx(2800.0)
    assert snapshot.total_scenario_spend is not None
    assert snapshot.total_scenario_revenue is not None
    assert snapshot.scenario_roi is not None


@pytest.mark.asyncio
async def test_get_snapshot_returns_saved_snapshot(service: ScenarioSnapshotService):
    """Test retrieving a saved snapshot."""
    tenant_id = "test-tenant"
    saved_snapshot = await service.save_snapshot(
        tenant_id=tenant_id,
        name="Retrievable Scenario",
        adjustments={"Meta": 1.1},
    )

    retrieved_snapshot = await service.get_snapshot(tenant_id, saved_snapshot.id or "")

    assert retrieved_snapshot is not None
    assert retrieved_snapshot.id == saved_snapshot.id
    assert retrieved_snapshot.name == saved_snapshot.name
    assert retrieved_snapshot.adjustments == saved_snapshot.adjustments


@pytest.mark.asyncio
async def test_get_snapshot_returns_none_for_nonexistent(service: ScenarioSnapshotService):
    """Test that getting a nonexistent snapshot returns None."""
    snapshot = await service.get_snapshot("test-tenant", "nonexistent-id")
    assert snapshot is None


@pytest.mark.asyncio
async def test_list_snapshots_returns_all_snapshots(service: ScenarioSnapshotService):
    """Test listing all snapshots for a tenant."""
    tenant_id = "test-tenant"

    # Create multiple snapshots
    snapshot1 = await service.save_snapshot(
        tenant_id=tenant_id,
        name="Scenario 1",
        adjustments={"Meta": 1.1},
    )
    snapshot2 = await service.save_snapshot(
        tenant_id=tenant_id,
        name="Scenario 2",
        adjustments={"Google": 0.9},
    )

    result = await service.list_snapshots(tenant_id)

    assert result.tenant_id == tenant_id
    assert len(result.snapshots) == 2
    assert any(s.id == snapshot1.id for s in result.snapshots)
    assert any(s.id == snapshot2.id for s in result.snapshots)


@pytest.mark.asyncio
async def test_list_snapshots_ordered_by_creation_time(service: ScenarioSnapshotService):
    """Test that snapshots are ordered by creation time, newest first."""
    tenant_id = "test-tenant"

    # Create snapshots in sequence
    snapshot1 = await service.save_snapshot(
        tenant_id=tenant_id,
        name="First",
        adjustments={"Meta": 1.0},
    )
    snapshot2 = await service.save_snapshot(
        tenant_id=tenant_id,
        name="Second",
        adjustments={"Meta": 1.0},
    )

    result = await service.list_snapshots(tenant_id)

    # Newest first
    assert result.snapshots[0].id == snapshot2.id
    assert result.snapshots[1].id == snapshot1.id


@pytest.mark.asyncio
async def test_list_snapshots_returns_empty_for_new_tenant(service: ScenarioSnapshotService):
    """Test listing snapshots for a tenant with no saved scenarios."""
    result = await service.list_snapshots("new-tenant")

    assert result.tenant_id == "new-tenant"
    assert len(result.snapshots) == 0


@pytest.mark.asyncio
async def test_delete_snapshot_removes_file(service: ScenarioSnapshotService, temp_storage: Path):
    """Test that deleting a snapshot removes the file."""
    tenant_id = "test-tenant"
    snapshot = await service.save_snapshot(
        tenant_id=tenant_id,
        name="To Delete",
        adjustments={"Meta": 1.0},
    )

    snapshot_file = temp_storage / tenant_id / f"{snapshot.id}.json"
    assert snapshot_file.exists()

    deleted = await service.delete_snapshot(tenant_id, snapshot.id or "")
    assert deleted is True
    assert not snapshot_file.exists()


@pytest.mark.asyncio
async def test_delete_snapshot_returns_false_for_nonexistent(service: ScenarioSnapshotService):
    """Test that deleting a nonexistent snapshot returns False."""
    deleted = await service.delete_snapshot("test-tenant", "nonexistent-id")
    assert deleted is False


@pytest.mark.asyncio
async def test_update_snapshot_modifies_metadata(service: ScenarioSnapshotService):
    """Test updating snapshot metadata."""
    tenant_id = "test-tenant"
    snapshot = await service.save_snapshot(
        tenant_id=tenant_id,
        name="Original Name",
        adjustments={"Meta": 1.0},
        description="Original description",
        tags=["original"],
    )

    updated = await service.update_snapshot(
        tenant_id=tenant_id,
        snapshot_id=snapshot.id or "",
        name="Updated Name",
        description="Updated description",
        tags=["updated", "new"],
    )

    assert updated is not None
    assert updated.name == "Updated Name"
    assert updated.description == "Updated description"
    assert updated.tags == ["updated", "new"]
    # Adjustments should remain unchanged
    assert updated.adjustments == {"Meta": 1.0}


@pytest.mark.asyncio
async def test_update_snapshot_partial_update(service: ScenarioSnapshotService):
    """Test partially updating snapshot metadata."""
    tenant_id = "test-tenant"
    snapshot = await service.save_snapshot(
        tenant_id=tenant_id,
        name="Original Name",
        adjustments={"Meta": 1.0},
        description="Original description",
    )

    # Only update name
    updated = await service.update_snapshot(
        tenant_id=tenant_id,
        snapshot_id=snapshot.id or "",
        name="New Name",
    )

    assert updated is not None
    assert updated.name == "New Name"
    assert updated.description == "Original description"  # Unchanged


@pytest.mark.asyncio
async def test_update_snapshot_returns_none_for_nonexistent(service: ScenarioSnapshotService):
    """Test that updating a nonexistent snapshot returns None."""
    updated = await service.update_snapshot(
        tenant_id="test-tenant",
        snapshot_id="nonexistent-id",
        name="New Name",
    )
    assert updated is None


@pytest.mark.asyncio
async def test_tenant_isolation(service: ScenarioSnapshotService):
    """Test that snapshots are isolated by tenant."""
    tenant1_snapshot = await service.save_snapshot(
        tenant_id="tenant-1",
        name="Tenant 1 Scenario",
        adjustments={"Meta": 1.0},
    )
    tenant2_snapshot = await service.save_snapshot(
        tenant_id="tenant-2",
        name="Tenant 2 Scenario",
        adjustments={"Google": 1.0},
    )

    # List snapshots for tenant 1
    tenant1_result = await service.list_snapshots("tenant-1")
    assert len(tenant1_result.snapshots) == 1
    assert tenant1_result.snapshots[0].id == tenant1_snapshot.id

    # List snapshots for tenant 2
    tenant2_result = await service.list_snapshots("tenant-2")
    assert len(tenant2_result.snapshots) == 1
    assert tenant2_result.snapshots[0].id == tenant2_snapshot.id
