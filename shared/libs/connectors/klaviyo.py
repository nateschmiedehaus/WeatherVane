from __future__ import annotations

from typing import Any

from .base import HTTPConnector
from .config import KlaviyoConfig
from .rate_limit import AsyncRateLimiter


class KlaviyoConnector(HTTPConnector):
    name = "klaviyo"

    def __init__(self, config: KlaviyoConfig, rate_limiter: AsyncRateLimiter | None = None) -> None:
        headers = {"Authorization": f"Klaviyo-API-Key {config.api_key}"}
        super().__init__(config, base_url="https://a.klaviyo.com/api", rate_limiter=rate_limiter, headers=headers)
        self.config = config

    async def fetch(self, resource: str, **params: Any) -> dict[str, Any]:
        response = await self._request("GET", resource, params=params)
        return response.json()

    async def push(self, resource: str, payload: dict[str, Any]) -> dict[str, Any]:
        response = await self._request("POST", resource, json=payload)
        return response.json()
