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
    monkeypatch.setenv("STORAGE_STATE_ROOT", str(tmp_path / "state"))

    result = await orchestrate_poc_flow(tenant_id=tenant_id, start_date=datetime(2024, 1, 3), end_date=datetime(2024, 1, 7))

    plan_payload = result["plan"]
    assert isinstance(plan_payload, dict)
    assert result["context"].tenant_id == tenant_id
    assert "plan" in plan_payload
    assert isinstance(plan_payload["plan"], list)
    assert plan_payload["plan"], "expected synthetic flow to emit allocation slices"
    for slice_ in plan_payload["plan"]:
        assert "cell" in slice_
        assert "confidence" in slice_
        assert "expected_revenue" in slice_
    assert "guardrails" in plan_payload
    assert isinstance(plan_payload["guardrails"], dict)
    assert "status" in plan_payload
