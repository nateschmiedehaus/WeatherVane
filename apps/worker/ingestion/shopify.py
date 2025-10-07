"""Shopify ingestion helpers.

This module shows how to collect Shopify data in a way that is easy to read and extend.
It deliberately avoids clever abstractions so junior engineers can follow the flow:

1. page through Shopify REST endpoints with `fetch`
2. normalise records into small dicts
3. persist them via `LakeWriter`
4. return a simple `IngestionSummary`
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Iterable, List, Mapping

from shared.libs.connectors import ShopifyConfig, ShopifyConnector
from shared.libs.storage.lake import LakeWriter

from .base import BaseIngestor, IngestionSummary, iso

DEFAULT_PAGE_LIMIT = 250


@dataclass
class ShopifyIngestor(BaseIngestor):
    connector: ShopifyConnector

    async def ingest_orders(
        self,
        tenant_id: str,
        start_date: datetime,
        end_date: datetime,
        status: str = "any",
    ) -> IngestionSummary:
        params = {
            "status": status,
            "limit": DEFAULT_PAGE_LIMIT,
            "created_at_min": iso(start_date),
            "created_at_max": iso(end_date),
        }
        orders = await self._collect_rest("orders", params=params)
        enriched = [enrich_order_with_geo(order, self.geocoder or Geocoder()) for order in orders]
        rows = [self._normalise_order(tenant_id, order) for order in enriched]
        return self._write_records(
            dataset=f"{tenant_id}_shopify_orders", rows=rows, source="shopify_api"
        )

    async def ingest_products(self, tenant_id: str) -> IngestionSummary:
        params = {"limit": DEFAULT_PAGE_LIMIT}
        products = await self._collect_rest("products", params=params)
        rows = [self._normalise_product(tenant_id, product) for product in products]
        return self._write_records(
            dataset=f"{tenant_id}_shopify_products", rows=rows, source="shopify_api"
        )

    async def _collect_rest(self, resource: str, params: Dict[str, Any]) -> List[Mapping[str, Any]]:
        """Iterate through Shopify REST pagination until there are no more pages."""

        cursor = None
        results: List[Mapping[str, Any]] = []
        while True:
            query = params.copy()
            if cursor:
                query["page_info"] = cursor
            response = await self.connector.fetch(resource, **query)
            items = self._extract_items(resource, response)
            if not items:
                break
            results.extend(items)
            cursor = response.get("next_page_info")
            if not cursor:
                break
        return results

    def _extract_items(self, resource: str, response: Mapping[str, Any]) -> Iterable[Mapping[str, Any]]:
        if resource in response:
            return response[resource]  # type: ignore[return-value]
        singular = resource.rstrip("s")
        return response.get(singular, [])  # type: ignore[return-value]

    def _normalise_order(self, tenant_id: str, order: Mapping[str, Any]) -> Dict[str, Any]:
        shipping = order.get("shipping_address") or {}
        return {
            "tenant_id": tenant_id,
            "order_id": order.get("id"),
            "name": order.get("name"),
            "created_at": order.get("created_at"),
            "currency": order.get("currency"),
            "total_price": float(order.get("total_price") or 0),
            "subtotal_price": float(order.get("subtotal_price") or 0),
            "total_tax": float(order.get("total_tax") or 0),
            "total_discounts": float(order.get("total_discounts") or 0),
            "shipping_postal_code": shipping.get("zip") or shipping.get("postal_code"),
            "shipping_country": shipping.get("country_code") or shipping.get("country"),
            "ship_latitude": order.get("ship_latitude"),
            "ship_longitude": order.get("ship_longitude"),
            "ship_geohash": order.get("ship_geohash"),
        }

    def _normalise_product(self, tenant_id: str, product: Mapping[str, Any]) -> Dict[str, Any]:
        return {
            "tenant_id": tenant_id,
            "product_id": product.get("id"),
            "title": product.get("title"),
            "product_type": product.get("product_type"),
            "vendor": product.get("vendor"),
            "created_at": product.get("created_at"),
            "updated_at": product.get("updated_at"),
        }


def build_shopify_ingestor_from_env(lake_root: str) -> ShopifyIngestor | None:
    """Convenience factory that returns an ingestor when env vars are present."""

    shop_domain = os.getenv("SHOPIFY_SHOP_DOMAIN")
    access_token = os.getenv("SHOPIFY_ACCESS_TOKEN")
    if not shop_domain or not access_token:
        return None
    api_version = os.getenv("SHOPIFY_API_VERSION", "2024-04")
    config = ShopifyConfig(shop_domain=shop_domain, access_token=access_token, api_version=api_version)
    return ShopifyIngestor(connector=ShopifyConnector(config), writer=LakeWriter(root=lake_root))
