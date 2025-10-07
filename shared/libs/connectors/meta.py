from __future__ import annotations

from typing import Any

from .base import HTTPConnector
from .config import MetaAdsConfig
from .rate_limit import AsyncRateLimiter


class MetaAdsConnector(HTTPConnector):
    name = "meta_ads"

    def __init__(self, config: MetaAdsConfig, rate_limiter: AsyncRateLimiter | None = None) -> None:
        base_url = f"https://graph.facebook.com/{config.graph_version}"
        headers = {"Authorization": f"Bearer {config.access_token}"}
        super().__init__(config, base_url=base_url, rate_limiter=rate_limiter, headers=headers)
        self.config = config

    async def fetch(self, endpoint: str, **params: Any) -> dict[str, Any]:
        response = await self._request("GET", endpoint, params=params)
        return response.json()

    async def push(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._request("POST", endpoint, json=payload)
        return response.json()
