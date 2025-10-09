import asyncio
from datetime import datetime

import pytest

from apps.worker.ingestion.shopify import ShopifyIngestor
from shared.libs.storage.lake import LakeWriter
from shared.libs.storage.state import JsonStateStore


class FakeConnector:
    def __init__(self):
        self.calls = []

    async def fetch_page(self, resource, params=None, cursor=None):
        self.calls.append((resource, params, cursor))
        if cursor is None:
            return {"orders": [{"id": 1, "updated_at": "2024-01-01T00:00:00Z", "shipping_address": {"zip": "98052"}}]}, "cursor1"
        return {"orders": [{"id": 2, "updated_at": "2024-01-02T00:00:00Z", "shipping_address": {"zip": "98052"}}]}, None


class StubGeocoder:
    def lookup(self, postal_code, country=None):
        return type("Geo", (), {"latitude": 47.0, "longitude": -122.0, "geohash": "c23nb"})()


def test_shopify_ingestor_persists_state(tmp_path):
    connector = FakeConnector()
    writer = LakeWriter(root=tmp_path / "lake")
    state_store = JsonStateStore(root=tmp_path / "state")
    ingestor = ShopifyIngestor(
        connector=connector,
        writer=writer,
        state_store=state_store,
        geocoder=StubGeocoder(),
    )

    summary = asyncio.run(
        ingestor.ingest_orders(
            tenant_id="tenant",
            start_date=datetime(2024, 1, 1),
            end_date=datetime(2024, 1, 3),
        )
    )

    assert summary.row_count == 2
    assert summary.metadata["geocoded_ratio"] == 1.0
    state = state_store.load("shopify", "tenant_orders")
    assert state["updated_at_min"] == "2024-01-02T00:00:00Z"
