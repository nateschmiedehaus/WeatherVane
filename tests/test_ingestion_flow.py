import json
import os
from datetime import datetime
from pathlib import Path

import pytest
import polars as pl

os.environ.setdefault("WEATHERVANE_DISABLE_PGEOCODE", "1")

from apps.worker.flows.ingestion_pipeline import orchestrate_ingestion_flow
from shared.libs.storage.state import JsonStateStore
from shared.validation.schemas import (
    validate_google_ads,
    validate_meta_ads,
    validate_promos,
    validate_shopify_orders,
    validate_shopify_products,
)


@pytest.mark.asyncio
async def test_ingestion_flow_persists_state_and_report(tmp_path: Path) -> None:
    lake_root = tmp_path / "lake"
    state_root = tmp_path / "state"
    report_path = tmp_path / "experiments" / "ingest" / "dq_report.json"

    start = datetime(2024, 1, 1)
    end = datetime(2024, 1, 2)

    result = await orchestrate_ingestion_flow(
        tenant_id="tenant-123",
        start_date=start,
        end_date=end,
        lake_root=lake_root,
        state_root=state_root,
        dq_report_path=report_path,
    )

    assert report_path.exists()
    report = json.loads(report_path.read_text())
    assert report["tenant_id"] == "tenant-123"
    assert report["window"]["start"].startswith("2024-01-01")
    assert report["datasets"]["shopify_orders"]["row_count"] >= 0
    assert result["sources"]["shopify"] in {"stub", "shopify_api"}

    summaries = result["summaries"]
    shopify_orders_path = Path(summaries["shopify_orders"]["path"])
    shopify_products_path = Path(summaries["shopify_products"]["path"])
    meta_ads_path = Path(summaries["meta_ads"]["path"])
    google_ads_path = Path(summaries["google_ads"]["path"])
    promos_path = Path(summaries["promos"]["path"])

    assert shopify_orders_path.exists()
    assert shopify_products_path.exists()
    assert meta_ads_path.exists()
    assert google_ads_path.exists()
    assert promos_path.exists()

    validate_shopify_orders(pl.read_parquet(shopify_orders_path))
    validate_shopify_products(pl.read_parquet(shopify_products_path))
    validate_meta_ads(pl.read_parquet(meta_ads_path))
    validate_google_ads(pl.read_parquet(google_ads_path))
    validate_promos(pl.read_parquet(promos_path))

    store = JsonStateStore(root=state_root)
    window_state = store.load("ingestion", "tenant-123_window")
    assert window_state["last_end"].startswith("2024-01-02")

    second_result = await orchestrate_ingestion_flow(
        tenant_id="tenant-123",
        end_date=datetime(2024, 1, 5),
        lake_root=lake_root,
        state_root=state_root,
        dq_report_path=report_path,
    )

    second_window = second_result["window"]
    assert second_window["start"].startswith("2024-01-02")
    assert second_window["end"].startswith("2024-01-05")
