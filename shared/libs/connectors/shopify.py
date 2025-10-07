from __future__ import annotations

from typing import Any

from .base import HTTPConnector
from .config import ShopifyConfig
from .rate_limit import AsyncRateLimiter

GRAPHQL_ENDPOINT = "/admin/api/{version}/graphql.json"
REST_ENDPOINT = "/admin/api/{version}/{resource}.json"


class ShopifyConnector(HTTPConnector):
    name = "shopify"

    def __init__(self, config: ShopifyConfig, rate_limiter: AsyncRateLimiter | None = None) -> None:
        headers = {"X-Shopify-Access-Token": config.access_token}
        base_url = f"https://{config.shop_domain}"
        super().__init__(config, base_url=base_url, rate_limiter=rate_limiter, headers=headers)
        self.config = config

    async def fetch(self, resource: str, **params: Any) -> dict[str, Any]:
        path = REST_ENDPOINT.format(version=self.config.api_version, resource=resource)
        response = await self._request("GET", path, params=params)
        return response.json()

    async def fetch_graphql(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        path = GRAPHQL_ENDPOINT.format(version=self.config.api_version)
        response = await self._request("POST", path, json={"query": query, "variables": variables or {}})
        return response.json()

    async def push(self, resource: str, payload: dict[str, Any]) -> dict[str, Any]:
        path = REST_ENDPOINT.format(version=self.config.api_version, resource=resource)
        response = await self._request("POST", path, json=payload)
        return response.json()
