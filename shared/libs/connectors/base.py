from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import httpx

from .config import ConnectorConfig
from .rate_limit import AsyncRateLimiter, NullRateLimiter


class Connector(ABC):
    """Base connector with rate limiting and lifecycle hooks."""

    name: str

    def __init__(
        self,
        config: ConnectorConfig,
        rate_limiter: AsyncRateLimiter | None = None,
    ) -> None:
        self.config = config
        self.rate_limiter = rate_limiter or NullRateLimiter()

    @abstractmethod
    async def close(self) -> None:
        """Release underlying resources."""


class HTTPConnector(Connector):
    """HTTP-based connector using httpx with retry and throttling support."""

    def __init__(
        self,
        config: ConnectorConfig,
        base_url: str,
        rate_limiter: AsyncRateLimiter | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(config, rate_limiter)
        self._client = httpx.AsyncClient(base_url=base_url, timeout=config.timeout, headers=headers)

    async def close(self) -> None:
        await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        last_exc: Exception | None = None
        for attempt in range(self.config.max_retries):
            await self.rate_limiter.acquire()
            try:
                response = await self._client.request(method, path, **kwargs)
                response.raise_for_status()
                return response
            except httpx.HTTPError as exc:  # pragma: no cover - network stub
                last_exc = exc
                if attempt + 1 == self.config.max_retries:
                    raise
        assert last_exc is not None
        raise last_exc
