import asyncio
from datetime import datetime

import pytest

pytest.importorskip("prefect", reason="Worker context smoke test requires Prefect")

from apps.worker.flows.poc_pipeline import orchestrate_poc_flow
from shared.data_context import default_context_service


@pytest.mark.asyncio
async def test_worker_flow_emits_context_tags(tmp_path, monkeypatch):
    lake_root = tmp_path / "lake"
    weather_root = tmp_path / "weather"
    monkeypatch.setenv("STORAGE_LAKE_ROOT", str(lake_root))
    monkeypatch.setenv("STORAGE_WEATHER_ROOT", str(weather_root))

    tenant_id = "test-tenant"
    default_context_service.reset(tenant_id)

    result = await orchestrate_poc_flow(
        tenant_id=tenant_id,
        start_date=datetime(2024, 1, 1),
        end_date=datetime(2024, 1, 3),
    )

    snapshot = default_context_service.latest_snapshot(tenant_id)

    assert result["data_context"]["tenant_id"] == tenant_id
    assert snapshot is not None
    assert isinstance(result["data_context"]["tags"], list)
    # With stubbed data we expect at least one sparsity or stub tag.
    assert any(tag.endswith("stubbed") or tag.endswith("sparse") for tag in result["data_context"]["tags"])
