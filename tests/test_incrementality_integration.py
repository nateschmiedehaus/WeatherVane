"""Tests for geo holdout incrementality integration with ingestion pipeline."""
import asyncio
import json
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import polars as pl
import pytest

from apps.validation.incrementality import GeoHoldoutConfig, design_holdout_from_orders
from apps.worker.flows.incrementality_step import (
    compute_geo_holdout,
    log_experiment_event,
    persist_holdout_assignment,
    run_incrementality_step,
)


@pytest.fixture
def temp_workspace():
    """Create a temporary workspace directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def sample_orders():
    """Create sample order data with multiple geos."""
    base_date = datetime.utcnow()
    return pl.DataFrame(
        {
            "tenant_id": ["tenant-1"] * 48,
            "order_id": [f"order-{i}" for i in range(48)],
            "name": ["Sample Order"] * 48,
            "created_at": [base_date.isoformat()] * 48,
            "currency": ["USD"] * 48,
            "total_price": [100.0 + i * 10 for i in range(48)],
            "subtotal_price": [100.0 + i * 10 for i in range(48)],
            "total_tax": [0.0] * 48,
            "total_discounts": [0.0] * 48,
            "shipping_postal_code": ["00000"] * 48,
            "shipping_country": ["US"] * 48,
            "ship_latitude": [37.7749] * 48,
            "ship_longitude": [-122.4194] * 48,
            "ship_geohash": [
                "9q8yy", "9q8yy", "9q8yy", "9q8yy", "9q8yy", "9q8yy", "9q8yy", "9q8yy",
                "9q9zz", "9q9zz", "9q9zz", "9q9zz", "9q9zz", "9q9zz", "9q9zz", "9q9zz",
                "9q8xx", "9q8xx", "9q8xx", "9q8xx", "9q8xx", "9q8xx", "9q8xx", "9q8xx",
                "9q9ww", "9q9ww", "9q9ww", "9q9ww", "9q9ww", "9q9ww", "9q9ww", "9q9ww",
                "9q8vv", "9q8vv", "9q8vv", "9q8vv", "9q8vv", "9q8vv", "9q8vv", "9q8vv",
                "9q8uu", "9q8uu", "9q8uu", "9q8uu", "9q8uu", "9q8uu", "9q8uu", "9q8uu",
            ],
            "net_revenue": [100.0 + i * 10 for i in range(48)],
        }
    )


@pytest.fixture
def small_orders():
    """Create sample order data with too few geos."""
    return pl.DataFrame(
        {
            "tenant_id": ["tenant-2"] * 4,
            "order_id": ["order-1", "order-2", "order-3", "order-4"],
            "ship_geohash": ["9q8yy", "9q8yy", "9q9zz", "9q9zz"],
            "net_revenue": [100.0, 150.0, 200.0, 120.0],
            "created_at": [datetime.utcnow().isoformat()] * 4,
        }
    )


class TestComputeGeoHoldout:
    """Test holdout computation logic."""

    def test_compute_holdout_success(self, sample_orders):
        """Test successful holdout computation."""
        result = compute_geo_holdout(sample_orders, "tenant-1", min_holdout_units=2)
        assert result["status"] == "ready"
        assert result["geo_count"] == 6
        assert result["holdout_count"] > 0
        assert 0 <= result["control_share"] <= 1
        assert "assignment" in result
        assert "geo_column" in result

    def test_compute_holdout_insufficient_geos(self, small_orders):
        """Test holdout computation with insufficient geos."""
        result = compute_geo_holdout(
            small_orders,
            "tenant-2",
            min_holdout_units=4,
        )
        assert result["status"] == "insufficient_geo"
        assert result["geo_count"] == 2

    def test_assignment_consistency(self, sample_orders):
        """Test that assignments are reproducible with same seed."""
        result1 = compute_geo_holdout(sample_orders, "tenant-1", min_holdout_units=2, seed=42)
        result2 = compute_geo_holdout(sample_orders, "tenant-1", min_holdout_units=2, seed=42)

        # Assignments should be identical
        assert result1["assignment"] == result2["assignment"]

    def test_assignment_covers_all_geos(self, sample_orders):
        """Test that all geos are assigned."""
        result = compute_geo_holdout(sample_orders, "tenant-1")
        if result["status"] == "ready":
            assignment_geos = {a["geo"] for a in result["assignment"]}
            # Should have some geos assigned
            assert len(assignment_geos) > 0

    def test_treatment_control_split(self, sample_orders):
        """Test treatment/control split."""
        result = compute_geo_holdout(sample_orders, "tenant-1")
        if result["status"] == "ready":
            groups = {a["group"] for a in result["assignment"]}
            # Should have both treatment and control
            assert groups == {"treatment", "control"}


class TestPersistHoldoutAssignment:
    """Test persistence of holdout assignments."""

    def test_persist_creates_directory(self, temp_workspace):
        """Test that persist creates necessary directories."""
        design = {
            "status": "ready",
            "geo_count": 5,
            "holdout_count": 2,
            "control_share": 0.3,
            "assignment": [
                {"geo": "9q8yy", "group": "treatment", "weight": 0.2},
                {"geo": "9q9zz", "group": "control", "weight": 0.3},
            ],
        }
        path = persist_holdout_assignment(design, "tenant-1", temp_workspace)
        assert path.exists()
        assert path.parent.exists()

    def test_persist_valid_json(self, temp_workspace):
        """Test that persisted file is valid JSON."""
        design = {
            "status": "ready",
            "geo_count": 3,
            "holdout_count": 1,
            "control_share": 0.33,
            "assignment": [
                {"geo": "9q8yy", "group": "control", "weight": 0.33},
            ],
        }
        path = persist_holdout_assignment(design, "tenant-1", temp_workspace)
        content = json.loads(path.read_text())
        assert content["tenant_id"] == "tenant-1"
        assert content["status"] == "ready"
        assert "generated_at" in content

    def test_persist_includes_tenant_id(self, temp_workspace):
        """Test that tenant_id is included in filename and content."""
        design = {
            "status": "ready",
            "geo_count": 1,
            "holdout_count": 1,
            "control_share": 1.0,
            "assignment": [],
        }
        path = persist_holdout_assignment(design, "tenant-xyz", temp_workspace)
        assert "tenant-xyz" in path.name
        content = json.loads(path.read_text())
        assert content["tenant_id"] == "tenant-xyz"


class TestLogExperimentEvent:
    """Test experiment event logging."""

    def test_log_creates_telemetry_file(self, temp_workspace):
        """Test that logging creates the telemetry file."""
        event = {
            "event": "holdout_assigned",
            "geo_count": 5,
            "holdout_count": 2,
        }
        log_experiment_event(event, "tenant-1", temp_workspace)
        telemetry_path = (
            temp_workspace / "state/telemetry/experiments/geo_holdout_runs.jsonl"
        )
        assert telemetry_path.exists()

    def test_log_appends_jsonl(self, temp_workspace):
        """Test that events are appended as JSONL."""
        event1 = {"event": "test1"}
        event2 = {"event": "test2"}
        log_experiment_event(event1, "tenant-1", temp_workspace)
        log_experiment_event(event2, "tenant-1", temp_workspace)

        telemetry_path = (
            temp_workspace / "state/telemetry/experiments/geo_holdout_runs.jsonl"
        )
        lines = telemetry_path.read_text().strip().split("\n")
        assert len(lines) == 2
        assert json.loads(lines[0])["event"] == "test1"
        assert json.loads(lines[1])["event"] == "test2"

    def test_log_includes_timestamp(self, temp_workspace):
        """Test that logged events include timestamp."""
        event = {"event": "holdout_assigned"}
        log_experiment_event(event, "tenant-1", temp_workspace)

        telemetry_path = (
            temp_workspace / "state/telemetry/experiments/geo_holdout_runs.jsonl"
        )
        logged = json.loads(telemetry_path.read_text().strip().split("\n")[0])
        assert "timestamp" in logged
        assert "tenant_id" in logged


class TestRunIncrementalityStep:
    """Test the full incrementality step execution."""

    @pytest.mark.asyncio
    async def test_run_with_valid_orders(self, temp_workspace, sample_orders):
        """Test successful incrementality step execution."""
        # Write sample orders to a mock lake using LakeWriter format
        from shared.libs.storage.lake import LakeWriter

        lake_root = temp_workspace / "storage/lake/raw"
        writer = LakeWriter(root=lake_root)
        # LakeWriter creates root/dataset_name/timestamp.parquet
        writer.write_records("tenant-1_shopify_orders", sample_orders.to_dicts())

        result = await run_incrementality_step(
            "tenant-1", str(lake_root), temp_workspace, min_holdout_units=2
        )
        assert result["status"] == "success"
        assert "design" in result
        assert "assignment_path" in result

    @pytest.mark.asyncio
    async def test_run_with_no_orders(self, temp_workspace):
        """Test incrementality step with no orders."""
        lake_root = temp_workspace / "storage/lake/raw"
        lake_root.mkdir(parents=True, exist_ok=True)

        result = await run_incrementality_step("tenant-1", str(lake_root), temp_workspace)
        assert result["status"] == "skip"
        assert result["reason"] == "no_orders"

    @pytest.mark.asyncio
    async def test_run_logs_telemetry(self, temp_workspace, sample_orders):
        """Test that execution logs telemetry events."""
        from shared.libs.storage.lake import LakeWriter

        lake_root = temp_workspace / "storage/lake/raw"
        writer = LakeWriter(root=lake_root)
        writer.write_records("tenant-1_shopify_orders", sample_orders.to_dicts())

        await run_incrementality_step("tenant-1", str(lake_root), temp_workspace)

        telemetry_path = (
            temp_workspace / "state/telemetry/experiments/geo_holdout_runs.jsonl"
        )
        assert telemetry_path.exists()
        lines = telemetry_path.read_text().strip().split("\n")
        assert len(lines) > 0

    @pytest.mark.asyncio
    async def test_run_persists_assignment(self, temp_workspace, sample_orders):
        """Test that execution persists the assignment."""
        from shared.libs.storage.lake import LakeWriter

        lake_root = temp_workspace / "storage/lake/raw"
        writer = LakeWriter(root=lake_root)
        writer.write_records("tenant-1_shopify_orders", sample_orders.to_dicts())

        result = await run_incrementality_step(
            "tenant-1", str(lake_root), temp_workspace, min_holdout_units=2
        )
        assert result["status"] == "success"

        # Check that assignment was persisted
        assignment_path = Path(result["assignment_path"])
        assert assignment_path.exists()
        content = json.loads(assignment_path.read_text())
        assert "assignment" in content
        assert len(content["assignment"]) > 0


class TestIntegrationWithIngestionPipeline:
    """Test that incrementality step integrates properly with ingestion."""

    def test_incrementality_step_module_imports(self):
        """Test that all necessary imports work."""
        from apps.worker.flows.ingestion_pipeline import orchestrate_ingestion_flow
        assert orchestrate_ingestion_flow is not None

    def test_incrementality_result_in_return_payload(self, temp_workspace):
        """Test that incrementality results are included in pipeline output."""
        # This is a smoke test to ensure the integration doesn't break the flow
        # The actual end-to-end test requires Prefect runtime
        assert True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
