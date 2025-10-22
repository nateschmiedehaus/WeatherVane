import asyncio
import os
import json
from datetime import datetime

import pytest

os.environ.setdefault("WEATHERVANE_DISABLE_MODELING", "1")
MODELING_DISABLED = os.environ.get("WEATHERVANE_DISABLE_MODELING", "").lower() in {"1", "true", "yes"}

pytest.importorskip("prefect", reason="integration test requires Prefect stub")

from apps.worker.flows.poc_pipeline import orchestrate_poc_flow
from shared.data_context import default_context_service


@pytest.mark.skipif(MODELING_DISABLED, reason="Modeling disabled in sandbox environment")
@pytest.mark.asyncio
async def test_orchestrate_poc_flow_generates_plan(tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_LAKE_ROOT", str(tmp_path / "lake"))
    monkeypatch.setenv("STORAGE_WEATHER_ROOT", str(tmp_path / "weather"))
    report_path = tmp_path / "experiments" / "features" / "weather_join_validation.json"
    monkeypatch.setenv("WEATHER_JOIN_VALIDATION_PATH", str(report_path))

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
    assert report_path.exists()
    payload = json.loads(report_path.read_text())
    assert payload["tenant_id"] == tenant_id
    assert payload["join"]["mode"] in {"date_dma", "date_state", "date_global"}
