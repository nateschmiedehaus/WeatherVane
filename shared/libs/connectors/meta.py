from __future__ import annotations

from typing import Any, AsyncIterator, Mapping, Tuple

import asyncio
from urllib.parse import parse_qs, urlparse

import httpx

from .base import HTTPConnector
from .config import MetaAdsConfig
from .rate_limit import AsyncRateLimiter


class MetaAdsConnector(HTTPConnector):
    name = "meta_ads"

    def __init__(self, config: MetaAdsConfig, rate_limiter: AsyncRateLimiter | None = None) -> None:
        base_url = f"https://graph.facebook.com/{config.graph_version}"
        headers = {
            "Authorization": f"Bearer {config.access_token}",
        }
        super().__init__(config, base_url=base_url, rate_limiter=rate_limiter, headers=headers)
        self.config = config
        self._lock = asyncio.Lock()

    async def fetch(self, endpoint: str, **params: Any) -> dict[str, Any]:
        payload, cursor = await self.fetch_page(endpoint, params=params)
        if cursor:
            paging = payload.setdefault("paging", {})
            if isinstance(paging, dict):
                paging["next_cursor"] = cursor
        return payload

    async def fetch_page(
        self,
        endpoint: str,
        params: Mapping[str, Any] | None = None,
        cursor: str | None = None,
    ) -> Tuple[dict[str, Any], str | None]:
        query = dict(params or {})
        if cursor:
            query["after"] = cursor
        response = await self._request_with_refresh("GET", endpoint, params=query)
        payload = response.json()
        next_cursor = self._extract_cursor(payload)
        return payload, next_cursor

    async def iter_edges(
        self,
        endpoint: str,
        params: Mapping[str, Any] | None = None,
    ) -> AsyncIterator[Mapping[str, Any]]:
        cursor: str | None = None
        while True:
            payload, cursor = await self.fetch_page(endpoint, params=params, cursor=cursor)
            items = self._extract_items(payload)
            if not items:
                break
            for item in items:
                yield item
            if not cursor:
                break

    async def push(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._request_with_refresh("POST", endpoint, json=payload)
        return response.json()

    async def _request_with_refresh(self, method: str, path: str, **kwargs: Any):
        try:
            return await self._request(method, path, **kwargs)
        except httpx.HTTPStatusError as exc:  # pragma: no cover - network stub
            if exc.response.status_code == 401 and await self._refresh_access_token():
                return await self._request(method, path, **kwargs)
            raise

    async def _handle_http_status_error(self, exc: httpx.HTTPStatusError, attempt: int) -> bool:
        if exc.response.status_code == 400 and self._is_rate_limit_error(exc.response):
            await asyncio.sleep(self._backoff_delay(attempt))
            return True
        return await super()._handle_http_status_error(exc, attempt)

    async def _refresh_access_token(self) -> bool:
        if not self._can_refresh():
            return False
        async with self._lock:
            current_header = self._client.headers.get("Authorization")
            if current_header == f"Bearer {self.config.access_token}":
                params = {
                    "grant_type": "fb_exchange_token",
                    "client_id": self.config.app_id,
                    "client_secret": self.config.app_secret,
                    "fb_exchange_token": self.config.access_token,
                }
                response = await super()._request("GET", "/oauth/access_token", params=params)
                data = response.json()
                token = data.get("access_token")
                if token:
                    self.config.access_token = token
                    self._client.headers["Authorization"] = f"Bearer {token}"
                    return True
            return self._client.headers.get("Authorization") == f"Bearer {self.config.access_token}"

    def _can_refresh(self) -> bool:
        return bool(self.config.app_id and self.config.app_secret and self.config.access_token)

    @staticmethod
    def _is_rate_limit_error(response: httpx.Response) -> bool:
        try:
            payload = response.json()
        except ValueError:
            return False
        error = payload.get("error")
        if not isinstance(error, dict):
            return False
        code = error.get("code")
        error_subcode = error.get("error_subcode")
        rate_limit_codes = {4, 17, 32, 613}
        rate_limit_subcodes = {2108006, 36005}
        if isinstance(code, int) and code in rate_limit_codes:
            return True
        if isinstance(error_subcode, int) and error_subcode in rate_limit_subcodes:
            return True
        return False

    @staticmethod
    def _extract_items(payload: Mapping[str, Any]) -> list[Mapping[str, Any]]:
        items = payload.get("data")
        if isinstance(items, list):
            return items
        return []

    @staticmethod
    def _extract_cursor(payload: Mapping[str, Any]) -> str | None:
        paging = payload.get("paging")
        if not isinstance(paging, dict):
            return None
        cursors = paging.get("cursors")
        if isinstance(cursors, dict):
            after = cursors.get("after")
            if isinstance(after, str) and after:
                return after
        next_url = paging.get("next")
        if isinstance(next_url, str):
            parsed = urlparse(next_url)
            after_values = parse_qs(parsed.query).get("after")
            if after_values:
                return after_values[0]
        return None
