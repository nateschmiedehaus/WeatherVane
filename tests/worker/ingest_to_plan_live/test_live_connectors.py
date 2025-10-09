import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Iterable

import pytest

from apps.worker.validation.harness import run_ingest_to_plan_harness
from shared.feature_store.feature_builder import FeatureBuilder, REQUIRED_WEATHER_COLS
from shared.observability import metrics


SYNTHETIC_LOOKBACK_DAYS = int(os.getenv("HARNESS_SYNTHETIC_LOOKBACK_DAYS", "30"))
LIVE_LOOKBACK_DAYS = int(os.getenv("HARNESS_LIVE_LOOKBACK_DAYS", "30"))

LIVE_SHOPIFY_VARS = ("SHOPIFY_SHOP_DOMAIN", "SHOPIFY_ACCESS_TOKEN")
LIVE_META_VARS = ("META_ACCESS_TOKEN", "META_APP_ID", "META_APP_SECRET")
LIVE_GOOGLE_VARS = (
    "GOOGLEADS_DEVELOPER_TOKEN",
    "GOOGLEADS_CUSTOMER_ID",
    "GOOGLEADS_REFRESH_TOKEN",
    "GOOGLEADS_OAUTH_CLIENT_ID",
    "GOOGLEADS_OAUTH_CLIENT_SECRET",
)


@pytest.fixture()
def metrics_run(tmp_path_factory) -> Path:
    base_dir = tmp_path_factory.mktemp("metrics")
    run_dir = metrics.configure_run(base_dir=str(base_dir), ensure_clean=True)
    yield run_dir
    metrics.reset_run_directory()


def _has_env(vars_to_check: Iterable[str]) -> bool:
    return all(os.getenv(name) for name in vars_to_check)


def _has_live_connectors() -> bool:
    return any(
        [
            _has_env(LIVE_SHOPIFY_VARS),
            _has_env(LIVE_META_VARS),
            _has_env(LIVE_GOOGLE_VARS),
        ]
    )


@pytest.mark.asyncio
async def test_ingest_to_plan_harness_synthetic(metrics_run: Path) -> None:
    tenant_id = os.getenv("HARNESS_SYNTHETIC_TENANT", "synthetic-harness")
    end = datetime.utcnow()
    start = end - timedelta(days=SYNTHETIC_LOOKBACK_DAYS)

    artifacts = await run_ingest_to_plan_harness(tenant_id, start_date=start, end_date=end)
    summary = artifacts.summary

    assert summary.plan_status in {"FULL", "DEGRADED"}
    assert "shopify" in summary.sources
    assert set(REQUIRED_WEATHER_COLS).issubset(FeatureBuilder().build(tenant_id, start, end).frame.columns)

    metrics_file = artifacts.run_directory / "metrics.jsonl"
    assert metrics_file.exists()
    content = metrics_file.read_text(encoding="utf-8").strip().splitlines()
    assert any('"event": "harness.summary"' in line for line in content)

    records = [json.loads(line) for line in content if line.strip()]
    summary_record = next(record for record in records if record["event"] == "harness.summary")
    assert summary_record["payload"]["plan_status"] == summary.plan_status
    assert summary_record["tags"]["mode"] == "synthetic"


@pytest.mark.asyncio
@pytest.mark.skipif(not _has_live_connectors(), reason="Live connector credentials not configured.")
async def test_ingest_to_plan_harness_live_connectors(metrics_run: Path) -> None:
    tenant_id = os.getenv("HARNESS_LIVE_TENANT", "live-harness")
    end = datetime.utcnow()
    start = end - timedelta(days=LIVE_LOOKBACK_DAYS)

    artifacts = await run_ingest_to_plan_harness(tenant_id, start_date=start, end_date=end)
    summary = artifacts.summary

    assert any(source for source in summary.sources.values() if isinstance(source, str) and source.endswith("_api"))
    assert summary.plan_status in {"FULL", "DEGRADED"}

    metrics_file = artifacts.run_directory / "metrics.jsonl"
    content = metrics_file.read_text(encoding="utf-8").strip().splitlines()
    records = [json.loads(line) for line in content if line.strip()]
    summary_record = next(record for record in records if record["event"] == "harness.summary")

    assert summary_record["tags"]["mode"] == "live"
    assert summary_record["payload"]["orders_rows"] >= 0
    assert summary_record["payload"]["ads_rows"] is not None
