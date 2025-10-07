from __future__ import annotations

from typing import Any

from .base import HTTPConnector
from .config import WeatherConfig
from .rate_limit import AsyncRateLimiter


class WeatherConnector(HTTPConnector):
    name = "weather"

    def __init__(self, config: WeatherConfig | None = None, rate_limiter: AsyncRateLimiter | None = None) -> None:
        config = config or WeatherConfig()
        super().__init__(config, base_url=config.base_url, rate_limiter=rate_limiter)
        self.config = config

    async def fetch(self, lat: float, lon: float, **params: Any) -> dict[str, Any]:
        query = {"latitude": lat, "longitude": lon} | params
        response = await self._request("GET", "/forecast", params=query)
        return response.json()

    async def close(self) -> None:
        await super().close()
