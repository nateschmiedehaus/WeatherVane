from datetime import datetime
from pathlib import Path

import polars as pl
import pytest

from apps.worker.ingestion.geocoding import GeoResult
from apps.worker.ingestion.shopify import ShopifyIngestor
from shared.libs.storage.lake import LakeWriter
from shared.validation.schemas import validate_shopify_orders, validate_shopify_products


class StubConnector:
    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    async def fetch(self, resource, **params):
        self.calls.append((resource, params))
        return self.responses.pop(0)

    async def fetch_page(self, resource, params, cursor=None):
        payload = await self.fetch(resource, **params)
        return payload, None


class StubGeocoder:
    """Minimal geocoder stub to avoid loading the heavy pgeocode dataset in tests."""

    precision = 5

    def lookup(self, postal_code, country=None):
        return GeoResult(latitude=None, longitude=None, geohash=None)

    def lookup_city(self, city, *, country=None, region=None):
        return GeoResult(latitude=None, longitude=None, geohash=None)


@pytest.mark.asyncio
async def test_ingest_orders_and_products(tmp_path: Path):
    responses = [
        {
            "orders": [
                {
                    "id": 1,
                    "name": "#1001",
                    "total_price": "12.34",
                    "created_at": "2024-01-01T00:00:00Z",
                    "currency": "USD",
                    "shipping_address": {"zip": "98052", "country_code": "US"},
                }
            ]
        },
        {
            "products": [
                {
                    "id": 5,
                    "title": "Rain Jacket",
                    "product_type": "Outerwear",
                    "vendor": "WeatherVane",
                }
            ]
        },
    ]
    connector = StubConnector(responses)
    ingestor = ShopifyIngestor(
        connector=connector,
        writer=LakeWriter(root=tmp_path),
        geocoder=StubGeocoder(),
    )
    start = datetime(2024, 1, 1)
    end = datetime(2024, 1, 31)

    orders_summary = await ingestor.ingest_orders("tenantA", start, end)
    products_summary = await ingestor.ingest_products("tenantA")

    orders_frame = pl.read_parquet(orders_summary.path)
    products_frame = pl.read_parquet(products_summary.path)

    validate_shopify_orders(orders_frame)
    validate_shopify_products(products_frame)

    assert orders_summary.row_count == 1
    assert products_summary.row_count == 1
    assert orders_frame[0, "total_price"] == 12.34
    assert products_frame[0, "title"] == "Rain Jacket"
    assert connector.calls[0][0] == "orders"
    assert connector.calls[1][0] == "products"
