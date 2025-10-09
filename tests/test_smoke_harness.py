import asyncio
import json
from datetime import datetime

import pytest

from apps.worker.validation.harness import (
    run_ingest_to_plan_harness,
    run_smoke_test,
    run_smoke_test_sync,
    SmokeTestSummary,
)
from shared.observability import metrics


@pytest.mark.asyncio
async def test_run_smoke_test(monkeypatch):
    async def fake_orchestrate(tenant_id, start_date=None, end_date=None):
        return {
            "plan": {"status": "FULL"},
            "geocoding_validation": {"status": "ok"},
            "sources": {"shopify": "shopify_api", "ads": "ads_api", "promo": "stub", "weather": "stub"},
            "ads_summary": {"meta_rows": 10, "google_rows": 5},
            "shopify_summary": {"orders": 123},
            "data_context": {"tags": ["geo.partial"]},
        }

    monkeypatch.setattr("apps.worker.validation.harness.orchestrate_poc_flow", fake_orchestrate)

    summary = await run_smoke_test("tenant")
    assert isinstance(summary, SmokeTestSummary)
    assert summary.plan_status == "FULL"
    assert summary.geocoding_status == "ok"
    assert summary.sources["ads"] == "ads_api"
    assert summary.ads_rows["meta_rows"] == 10
    assert summary.tags == ["geo.partial"]


def test_run_smoke_test_sync(monkeypatch):
    async def fake_orchestrate(tenant_id, start_date=None, end_date=None):
        return {
            "plan": {"status": "DEGRADED"},
            "geocoding_validation": {"status": "critical"},
            "sources": {},
            "ads_summary": {},
            "shopify_summary": {},
            "data_context": {"tags": []},
        }

    monkeypatch.setattr("apps.worker.validation.harness.orchestrate_poc_flow", fake_orchestrate)

    summary = run_smoke_test_sync("tenant", start_date=datetime(2024, 1, 1), end_date=datetime(2024, 1, 7))
    assert summary.plan_status == "DEGRADED"
    assert summary.geocoding_status == "critical"


@pytest.mark.asyncio
async def test_run_ingest_to_plan_harness_retention(monkeypatch, tmp_path):
    class StubContext:
        def __init__(self) -> None:
            self.start_date = datetime(2024, 1, 1)
            self.end_date = datetime(2024, 1, 31)

    orchestrated = {
        "plan": {"status": "FULL", "guardrails": {"success": True}},
        "geocoding_validation": {"status": "ok"},
        "sources": {"shopify": "shopify_api", "ads": "meta_api", "promo": "stub", "weather": "cache"},
        "ads_summary": {"meta_rows": 5},
        "shopify_summary": {"orders": 25},
        "data_context": {"tags": ["geo.full"]},
        "context": StubContext(),
    }

    async def fake_orchestrate(*_args, **_kwargs):
        return orchestrated

    monkeypatch.setattr("apps.worker.validation.harness.orchestrate_poc_flow", fake_orchestrate)

    retention_payload = {"total_removed": 1, "timestamp": "2024-05-22T00:00:00Z"}
    retention_calls: list[dict[str, object]] = []

    def fake_retention(**kwargs):
        retention_calls.append(kwargs)
        return retention_payload

    monkeypatch.setattr("apps.worker.validation.harness.run_retention_sweep", fake_retention)

    metrics_dir = metrics.configure_run(base_dir=str(tmp_path / "metrics"), ensure_clean=True)
    try:
        result = await run_ingest_to_plan_harness(
            "tenant",
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 31),
            run_retention=True,
            retention_days=90,
        )
    finally:
        metrics.reset_run_directory()

    assert retention_calls
    assert result.retention_summary == retention_payload

    metrics_file = metrics_dir / "metrics.jsonl"
    records = [json.loads(line) for line in metrics_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    retention_event = next(record for record in records if record["event"] == "harness.retention")
    assert retention_event["payload"]["removed_files"] == 1
    assert retention_event["tags"]["removed"] == "yes"
