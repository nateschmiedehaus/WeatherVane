from __future__ import annotations

from typing import Any, Iterable, Mapping, Tuple

from urllib.parse import urlparse, parse_qs

import asyncio
import httpx

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
        self._lock = asyncio.Lock()

    async def fetch(self, resource: str, **params: Any) -> dict[str, Any]:
        payload, cursor = await self.fetch_page(resource, params=params)
        if cursor:
            payload["next_page_info"] = cursor
        return payload

    async def fetch_page(
        self,
        resource: str,
        params: Mapping[str, Any] | None = None,
        cursor: str | None = None,
    ) -> Tuple[dict[str, Any], str | None]:
        query = dict(params or {})
        if cursor:
            query["page_info"] = cursor
        path = REST_ENDPOINT.format(version=self.config.api_version, resource=resource)
        response = await self._request_with_refresh("GET", path, params=query)
        payload = response.json()
        next_cursor = self._extract_next_page(response)
        return payload, next_cursor

    async def iter_rest(
        self,
        resource: str,
        params: Mapping[str, Any] | None = None,
    ) -> Iterable[Mapping[str, Any]]:
        cursor: str | None = None
        while True:
            payload, cursor = await self.fetch_page(resource, params=params, cursor=cursor)
            items = self._extract_items(resource, payload)
            if not items:
                break
            for item in items:
                yield item
            if not cursor:
                break

    async def fetch_graphql(self, query: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
        path = GRAPHQL_ENDPOINT.format(version=self.config.api_version)
        response = await self._request_with_refresh("POST", path, json={"query": query, "variables": variables or {}})
        return response.json()

    async def push(self, resource: str, payload: dict[str, Any]) -> dict[str, Any]:
        path = REST_ENDPOINT.format(version=self.config.api_version, resource=resource)
        response = await self._request_with_refresh("POST", path, json=payload)
        return response.json()

    async def _after_success(self, response: httpx.Response) -> None:
        await super()._after_success(response)
        await self._throttle_from_call_limit(response)

    async def close(self) -> None:
        await super().close()

    async def _request_with_refresh(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            return await super()._request(method, path, **kwargs)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401 and await self._refresh_access_token():
                return await super()._request(method, path, **kwargs)
            raise

    async def _throttle_from_call_limit(self, response: httpx.Response) -> None:
        header = response.headers.get("X-Shopify-Shop-Api-Call-Limit")
        if not header:
            return
        try:
            used_str, capacity_str = header.split("/", maxsplit=1)
            used = int(used_str.strip())
            capacity = int(capacity_str.strip())
        except (ValueError, AttributeError):
            return
        if capacity <= 0:
            return
        rate = self.config.rate_limit_per_second or 0.0
        if rate <= 0:
            return
        threshold = max(int(capacity * 0.9), capacity - 5)
        if used < threshold:
            return
        deficit = used - threshold + 1
        if deficit <= 0:
            return
        wait_time = deficit / rate
        if wait_time <= 0:
            return
        await asyncio.sleep(min(wait_time, self.config.max_backoff))

    async def _refresh_access_token(self) -> bool:
        if not self._can_refresh():
            return False
        async with self._lock:
            # Another coroutine may have already refreshed the token.
            if self._client.headers.get("X-Shopify-Access-Token") != self.config.access_token:
                return True
            payload = {
                "client_id": self.config.client_id,
                "client_secret": self.config.client_secret,
                "refresh_token": self.config.refresh_token,
            }
            response = await super()._request("POST", "/admin/oauth/access_token", json=payload)
            data = response.json()
            token = data.get("access_token")
            if not token:
                return False
            self.config.access_token = token
            self._client.headers["X-Shopify-Access-Token"] = token
            return True

    def _can_refresh(self) -> bool:
        return bool(self.config.client_id and self.config.client_secret and self.config.refresh_token)

    @staticmethod
    def _extract_items(resource: str, payload: Mapping[str, Any]) -> Iterable[Mapping[str, Any]]:
        if resource in payload:
            return payload[resource]  # type: ignore[return-value]
        singular = resource.rstrip("s")
        return payload.get(singular, [])  # type: ignore[return-value]

    @staticmethod
    def _extract_next_page(response: httpx.Response) -> str | None:
        link_header = response.headers.get("Link")
        if not link_header:
            return None
        for segment in link_header.split(","):
            parts = [part.strip() for part in segment.split(";")]
            if not parts:
                continue
            url_part = parts[0].strip("<>")
            rel = None
            for attr in parts[1:]:
                if attr.startswith("rel="):
                    rel = attr.split("=", 1)[1].strip('"')
                    break
            if rel != "next":
                continue
            parsed = urlparse(url_part)
            page_info = parse_qs(parsed.query).get("page_info")
            if page_info:
                return page_info[0]
        return None
