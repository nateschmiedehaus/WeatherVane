from __future__ import annotations

from typing import Any

from .base import HTTPConnector
from .config import WeatherConfig
from .rate_limit import AsyncRateLimiter

ARCHIVE_API_URL = "https://archive-api.open-meteo.com/v1/archive"


class WeatherConnector(HTTPConnector):
    name = "weather"

    def __init__(self, config: WeatherConfig | None = None, rate_limiter: AsyncRateLimiter | None = None) -> None:
        config = config or WeatherConfig()
        super().__init__(config, base_url=config.base_url, rate_limiter=rate_limiter)
        self.config = config

    async def fetch(self, lat: float, lon: float, **params: Any) -> dict[str, Any]:
        return await self.fetch_forecast(lat, lon, **params)

    async def fetch_forecast(self, lat: float, lon: float, **params: Any) -> dict[str, Any]:
        query = {"latitude": lat, "longitude": lon} | params
        response = await self._request("GET", "/forecast", params=query)
        return response.json()

    async def fetch_archive(self, lat: float, lon: float, **params: Any) -> dict[str, Any]:
        query = {"latitude": lat, "longitude": lon} | params
        response = await self._request("GET", ARCHIVE_API_URL, params=query)
        return response.json()

    async def close(self) -> None:
        await super().close()
