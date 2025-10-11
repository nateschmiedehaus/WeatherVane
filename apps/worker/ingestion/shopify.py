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
from typing import Any, Dict, List, Mapping

from shared.libs.connectors import ShopifyConfig, ShopifyConnector
from shared.libs.storage.lake import LakeWriter
from shared.libs.storage.state import JsonStateStore
from shared.validation.schemas import validate_shopify_orders, validate_shopify_products

from .base import BaseIngestor, IngestionSummary, iso
from .geocoding import Geocoder, enrich_order_with_geo

DEFAULT_PAGE_LIMIT = 250


@dataclass
class ShopifyIngestor(BaseIngestor):
    connector: ShopifyConnector
    geocoder: Geocoder | None = None
    state_store: JsonStateStore | None = None

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
            "order": "updated_at asc",
            "created_at_min": iso(start_date),
            "created_at_max": iso(end_date),
        }

        state_key = f"{tenant_id}_orders"
        state = self.state_store.load("shopify", state_key) if self.state_store else {}
        since = state.get("updated_at_min")
        if since:
            params["updated_at_min"] = since

        orders = await self._collect_rest("orders", params=params)
        geocoder = self.geocoder or Geocoder(state_store=self.state_store)
        enriched = [enrich_order_with_geo(order, geocoder) for order in orders]
        rows = [self._normalise_order(tenant_id, order) for order in enriched]
        if rows:
            validate_shopify_orders(rows)
        geocoded_count = sum(1 for row in rows if row.get("ship_geohash"))
        geocoded_ratio = geocoded_count / len(rows) if rows else 0.0
        summary = self._write_records(
            dataset=f"{tenant_id}_shopify_orders",
            rows=rows,
            source="shopify_api",
            metadata={
                "geocoded_count": geocoded_count,
                "geocoded_ratio": geocoded_ratio,
            },
        )
        if rows and self.state_store:
            latest_updated = max((order.get("updated_at") for order in orders if order.get("updated_at")), default=None)
            if latest_updated:
                self.state_store.save(
                    "shopify",
                    state_key,
                    {
                        "updated_at_min": latest_updated,
                        "last_run_at": datetime.utcnow().isoformat(),
                        "row_count": summary.row_count,
                    },
                )
        return summary

    async def ingest_products(self, tenant_id: str) -> IngestionSummary:
        params = {"limit": DEFAULT_PAGE_LIMIT}
        products = await self._collect_rest("products", params=params)
        rows = [self._normalise_product(tenant_id, product) for product in products]
        if rows:
            validate_shopify_products(rows)
        return self._write_records(
            dataset=f"{tenant_id}_shopify_products", rows=rows, source="shopify_api"
        )

    async def _collect_rest(self, resource: str, params: Dict[str, Any]) -> List[Mapping[str, Any]]:
        """Iterate through Shopify REST pagination until there are no more pages."""

        cursor = None
        results: List[Mapping[str, Any]] = []
        base_params = params.copy()
        while True:
            payload, cursor = await self.connector.fetch_page(resource, params=base_params, cursor=cursor)
            items = ShopifyConnector._extract_items(resource, payload)
            if not items:
                break
            results.extend(items)
            if not cursor:
                break
        return results

    def _normalise_order(self, tenant_id: str, order: Mapping[str, Any]) -> Dict[str, Any]:
        shipping = order.get("shipping_address") or {}
        order_id = self._coerce_str(order.get("id"))
        currency = self._coerce_str(order.get("currency"))
        created_at = self._coerce_str(order.get("created_at"))
        return {
            "tenant_id": tenant_id,
            "order_id": order_id or "",
            "name": self._coerce_str(order.get("name")),
            "created_at": created_at or "",
            "currency": currency or "",
            "total_price": float(order.get("total_price") or 0),
            "subtotal_price": float(order.get("subtotal_price") or 0),
            "total_tax": float(order.get("total_tax") or 0),
            "total_discounts": float(order.get("total_discounts") or 0),
            "shipping_postal_code": self._coerce_str(
                shipping.get("zip") or shipping.get("postal_code")
            ),
            "shipping_country": self._coerce_str(
                shipping.get("country_code") or shipping.get("country")
            ),
            "ship_latitude": order.get("ship_latitude"),
            "ship_longitude": order.get("ship_longitude"),
            "ship_geohash": order.get("ship_geohash"),
        }

    def _normalise_product(self, tenant_id: str, product: Mapping[str, Any]) -> Dict[str, Any]:
        return {
            "tenant_id": tenant_id,
            "product_id": self._coerce_str(product.get("id")) or "",
            "title": self._coerce_str(product.get("title")),
            "product_type": self._coerce_str(product.get("product_type")),
            "vendor": self._coerce_str(product.get("vendor")),
            "created_at": self._coerce_str(product.get("created_at")),
            "updated_at": self._coerce_str(product.get("updated_at")),
        }

    @staticmethod
    def _coerce_str(value: Any) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None


def build_shopify_ingestor_from_env(
    lake_root: str,
    *,
    state_root: str | os.PathLike[str] | None = None,
) -> ShopifyIngestor | None:
    """Convenience factory that returns an ingestor when env vars are present."""

    shop_domain = os.getenv("SHOPIFY_SHOP_DOMAIN")
    access_token = os.getenv("SHOPIFY_ACCESS_TOKEN")
    if not shop_domain or not access_token:
        return None
    api_version = os.getenv("SHOPIFY_API_VERSION", "2024-04")
    client_id = os.getenv("SHOPIFY_CLIENT_ID")
    client_secret = os.getenv("SHOPIFY_CLIENT_SECRET")
    refresh_token = os.getenv("SHOPIFY_REFRESH_TOKEN")
    config = ShopifyConfig(
        shop_domain=shop_domain,
        access_token=access_token,
        api_version=api_version,
        client_id=client_id,
        client_secret=client_secret,
        refresh_token=refresh_token,
    )
    state_store = JsonStateStore(root=state_root) if state_root else JsonStateStore()
    return ShopifyIngestor(
        connector=ShopifyConnector(config),
        writer=LakeWriter(root=lake_root),
        state_store=state_store,
    )
