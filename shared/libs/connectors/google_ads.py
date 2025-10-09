from __future__ import annotations

from __future__ import annotations

from typing import Any, AsyncIterator, Mapping

import asyncio
import httpx

from .base import HTTPConnector
from .config import GoogleAdsConfig
from .rate_limit import AsyncRateLimiter


class GoogleAdsConnector(HTTPConnector):
    name = "google_ads"

    def __init__(
        self,
        config: GoogleAdsConfig,
        rate_limiter: AsyncRateLimiter | None = None,
    ) -> None:
        headers: dict[str, str] = {
            "developer-token": config.developer_token,
        }
        if config.login_customer_id:
            headers["login-customer-id"] = config.login_customer_id
        if config.access_token:
            headers["Authorization"] = f"Bearer {config.access_token}"

        base_url = "https://googleads.googleapis.com"
        super().__init__(config, base_url=base_url, rate_limiter=rate_limiter, headers=headers)
        self.config = config
        self._lock = asyncio.Lock()

    async def search(
        self,
        customer_id: str,
        query: str,
        page_size: int | None = None,
        page_token: str | None = None,
        summary_row_setting: str | None = None,
    ) -> dict[str, Any]:
        endpoint = self._search_endpoint(customer_id)
        body: dict[str, Any] = {"query": query}
        if page_size is not None:
            body["pageSize"] = page_size
        if page_token:
            body["pageToken"] = page_token
        if summary_row_setting:
            body["summaryRowSetting"] = summary_row_setting

        response = await self._request_with_refresh("POST", endpoint, json=body)
        payload = response.json()
        return payload

    async def search_iter(
        self,
        customer_id: str,
        query: str,
        page_size: int | None = None,
        summary_row_setting: str | None = None,
    ) -> AsyncIterator[Mapping[str, Any]]:
        page_token: str | None = None
        while True:
            payload = await self.search(
                customer_id,
                query,
                page_size=page_size,
                page_token=page_token,
                summary_row_setting=summary_row_setting,
            )
            results = payload.get("results")
            if isinstance(results, list):
                for row in results:
                    yield row
            page_token = payload.get("nextPageToken")
            if not page_token:
                break

    async def close(self) -> None:
        await super().close()

    async def _request_with_refresh(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        await self._ensure_access_token()
        try:
            return await super()._request(method, path, **kwargs)
        except httpx.HTTPStatusError as exc:  # pragma: no cover - network stub
            if exc.response.status_code == 401 and await self._refresh_access_token(force=True):
                return await super()._request(method, path, **kwargs)
            raise

    async def _ensure_access_token(self) -> None:
        header = self._client.headers.get("Authorization")
        if not header and self.config.access_token:
            self._client.headers["Authorization"] = f"Bearer {self.config.access_token}"
            return
        if not header:
            await self._refresh_access_token(force=True)

    async def _refresh_access_token(self, force: bool = False) -> bool:
        if not self._can_refresh():
            return False
        async with self._lock:
            current = self._client.headers.get("Authorization")
            if not force and current and current == f"Bearer {self.config.access_token}":
                return True
            data = {
                "grant_type": "refresh_token",
                "client_id": self.config.client_id,
                "client_secret": self.config.client_secret,
                "refresh_token": self.config.refresh_token,
            }
            async with httpx.AsyncClient(timeout=self.config.timeout) as client:
                response = await client.post(self.config.token_uri, data=data)
                response.raise_for_status()
                payload = response.json()
            token = payload.get("access_token")
            if not token:
                return False
            self.config.access_token = token
            self._client.headers["Authorization"] = f"Bearer {token}"
            return True

    def _can_refresh(self) -> bool:
        return bool(
            self.config.client_id
            and self.config.client_secret
            and self.config.refresh_token
        )

    def _search_endpoint(self, customer_id: str) -> str:
        version = self.config.api_version.rstrip("/")
        return f"/{version}/customers/{customer_id}/googleAds:search"
