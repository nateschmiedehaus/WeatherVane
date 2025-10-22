"""Service for managing scenario snapshots - saved what-if configurations."""

from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

from shared.schemas.base import PlanResponse, ScenarioSnapshot, ScenarioSnapshotListResponse
from shared.services.scenario_builder import apply_scenario_adjustments, build_scenario_baseline


class ScenarioSnapshotService:
    """Manages persistent scenario snapshots for what-if analysis.

    Snapshots are stored as JSON files in storage/scenarios/{tenant_id}/{snapshot_id}.json
    This simple file-based approach works for MVP; migrate to DB for production scale.
    """

    def __init__(self, storage_root: Path | None = None) -> None:
        """Initialize the snapshot service.

        Args:
            storage_root: Root directory for scenario storage. Defaults to ./storage/scenarios
        """
        if storage_root is None:
            storage_root = Path("storage/scenarios")
        self._storage_root = storage_root
        self._storage_root.mkdir(parents=True, exist_ok=True)

    def _tenant_dir(self, tenant_id: str) -> Path:
        """Get the storage directory for a tenant."""
        tenant_path = self._storage_root / tenant_id
        tenant_path.mkdir(parents=True, exist_ok=True)
        return tenant_path

    def _snapshot_path(self, tenant_id: str, snapshot_id: str) -> Path:
        """Get the file path for a specific snapshot."""
        return self._tenant_dir(tenant_id) / f"{snapshot_id}.json"

    async def save_snapshot(
        self,
        tenant_id: str,
        name: str,
        adjustments: dict[str, float],
        *,
        horizon_days: int = 7,
        description: str | None = None,
        created_by: str | None = None,
        tags: list[str] | None = None,
        plan: PlanResponse | None = None,
    ) -> ScenarioSnapshot:
        """Save a new scenario snapshot.

        Args:
            tenant_id: Tenant identifier
            name: Human-readable scenario name
            adjustments: Channel-to-multiplier mapping
            horizon_days: Planning horizon in days
            description: Optional scenario description
            created_by: Optional user identifier
            tags: Optional classification tags
            plan: Optional plan data to compute outcome summary

        Returns:
            The created snapshot with generated ID
        """
        snapshot_id = str(uuid.uuid4())
        snapshot = ScenarioSnapshot(
            id=snapshot_id,
            tenant_id=tenant_id,
            name=name,
            description=description,
            horizon_days=horizon_days,
            adjustments=adjustments,
            created_at=datetime.utcnow(),
            created_by=created_by,
            tags=tags or [],
        )

        # If plan is provided, compute and store outcome summary for quick recall
        if plan:
            baseline = build_scenario_baseline(plan)
            outcome = apply_scenario_adjustments(baseline, adjustments)
            summary = outcome.summary

            snapshot.total_base_spend = summary.total_base_spend
            snapshot.total_scenario_spend = summary.total_scenario_spend
            snapshot.total_base_revenue = summary.total_base_revenue
            snapshot.total_scenario_revenue = summary.total_scenario_revenue
            snapshot.scenario_roi = summary.scenario_roi

        # Write to disk
        snapshot_file = self._snapshot_path(tenant_id, snapshot_id)
        snapshot_file.write_text(snapshot.model_dump_json(indent=2))

        return snapshot

    async def get_snapshot(self, tenant_id: str, snapshot_id: str) -> ScenarioSnapshot | None:
        """Retrieve a specific scenario snapshot.

        Args:
            tenant_id: Tenant identifier
            snapshot_id: Snapshot identifier

        Returns:
            The snapshot if found, None otherwise
        """
        snapshot_file = self._snapshot_path(tenant_id, snapshot_id)
        if not snapshot_file.exists():
            return None

        data = json.loads(snapshot_file.read_text())
        return ScenarioSnapshot.model_validate(data)

    async def list_snapshots(self, tenant_id: str) -> ScenarioSnapshotListResponse:
        """List all scenario snapshots for a tenant.

        Args:
            tenant_id: Tenant identifier

        Returns:
            List of snapshots, ordered by creation time (newest first)
        """
        tenant_dir = self._tenant_dir(tenant_id)
        snapshots: list[ScenarioSnapshot] = []

        for snapshot_file in tenant_dir.glob("*.json"):
            try:
                data = json.loads(snapshot_file.read_text())
                snapshot = ScenarioSnapshot.model_validate(data)
                snapshots.append(snapshot)
            except Exception:
                # Skip invalid files
                continue

        # Sort by creation time, newest first
        snapshots.sort(key=lambda s: s.created_at, reverse=True)

        return ScenarioSnapshotListResponse(
            tenant_id=tenant_id,
            snapshots=snapshots,
        )

    async def delete_snapshot(self, tenant_id: str, snapshot_id: str) -> bool:
        """Delete a scenario snapshot.

        Args:
            tenant_id: Tenant identifier
            snapshot_id: Snapshot identifier

        Returns:
            True if deleted, False if not found
        """
        snapshot_file = self._snapshot_path(tenant_id, snapshot_id)
        if not snapshot_file.exists():
            return False

        snapshot_file.unlink()
        return True

    async def update_snapshot(
        self,
        tenant_id: str,
        snapshot_id: str,
        *,
        name: str | None = None,
        description: str | None = None,
        tags: list[str] | None = None,
    ) -> ScenarioSnapshot | None:
        """Update snapshot metadata (name, description, tags).

        Args:
            tenant_id: Tenant identifier
            snapshot_id: Snapshot identifier
            name: New name (if provided)
            description: New description (if provided)
            tags: New tags (if provided)

        Returns:
            Updated snapshot if found, None otherwise
        """
        snapshot = await self.get_snapshot(tenant_id, snapshot_id)
        if snapshot is None:
            return None

        # Update fields
        if name is not None:
            snapshot.name = name
        if description is not None:
            snapshot.description = description
        if tags is not None:
            snapshot.tags = tags

        # Save updated snapshot
        snapshot_file = self._snapshot_path(tenant_id, snapshot_id)
        snapshot_file.write_text(snapshot.model_dump_json(indent=2))

        return snapshot
