import asyncio
from datetime import datetime
from pathlib import Path

import pytest

from apps.worker.flows.poc_pipeline import orchestrate_poc_flow
from shared.libs.testing.synthetic import seed_synthetic_tenant, WeatherShock


@pytest.mark.asyncio
async def test_orchestrate_flow_with_synthetic_data(tmp_path: Path, monkeypatch):
    tenant_id = "tenantFlow"
    seed_synthetic_tenant(tmp_path, tenant_id, days=5, shocks=[WeatherShock(0,2, temp_delta=5, rain_mm=8)])

    monkeypatch.setenv("STORAGE_LAKE_ROOT", str(tmp_path))
    monkeypatch.setenv("STORAGE_WEATHER_ROOT", str(tmp_path / "weather"))

    result = await orchestrate_poc_flow(tenant_id=tenant_id, start_date=datetime(2024, 1, 3), end_date=datetime(2024, 1, 7))

    assert result["plan"] is not None
    assert result["context"].tenant_id == tenant_id
    assert result["plan"] == {"plan": [], "guardrails": {}}
