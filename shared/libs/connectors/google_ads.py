from __future__ import annotations

from typing import Any

from .config import GoogleAdsConfig
from .rate_limit import AsyncRateLimiter


class GoogleAdsConnector:
    name = "google_ads"

    def __init__(self, config: GoogleAdsConfig, rate_limiter: AsyncRateLimiter | None = None) -> None:
        self.config = config
        self.rate_limiter = rate_limiter

    async def fetch(self, service: str, **params: Any) -> dict[str, Any]:
        # Placeholder: gRPC client wiring will live here.
        return {"service": service, "params": params}

    async def push(self, service: str, payload: dict[str, Any]) -> dict[str, Any]:
        return {"service": service, "payload": payload}

    async def close(self) -> None:  # pragma: no cover - placeholder
        return
