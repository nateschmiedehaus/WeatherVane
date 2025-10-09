import asyncio
from datetime import datetime

import pytest

pytest.importorskip("prefect", reason="integration test requires Prefect stub")

from apps.worker.flows.poc_pipeline import orchestrate_poc_flow
from shared.data_context import default_context_service


@pytest.mark.asyncio
async def test_orchestrate_poc_flow_generates_plan(tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_LAKE_ROOT", str(tmp_path / "lake"))
    monkeypatch.setenv("STORAGE_WEATHER_ROOT", str(tmp_path / "weather"))

    tenant_id = "integration-tenant"
    default_context_service.reset(tenant_id)

    result = await orchestrate_poc_flow(
        tenant_id=tenant_id,
        start_date=datetime(2024, 1, 1),
        end_date=datetime(2024, 1, 7),
    )

    plan = result["plan"]
    assert "plan" in plan
    assert isinstance(plan["plan"], list)
    assert plan["status"] in {"FULL", "DEGRADED"}
    guardrails = plan["guardrails"]
    if guardrails.get("fallback_alloc"):
        assert "risk_penalty" in guardrails
    else:
        assert "scenario_profit_p10" in guardrails
        assert "risk_penalty" in guardrails

    snapshot = result["data_context"]
    assert snapshot["tenant_id"] == tenant_id
    assert "orders_geocoded_ratio" in snapshot["metadata"]
    assert isinstance(snapshot["tags"], list)

    coverage = result["geocoding_validation"]
    assert coverage["tenant_id"] == tenant_id
    assert "ratio" in coverage

    summaries = result["sources"]
    assert summaries["shopify"] in {"shopify_api", "stub"}
    assert "meta_rows" in result["ads_summary"]
