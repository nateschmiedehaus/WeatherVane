from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import asyncio
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
                if response.status_code == 429:
                    retry_after = response.headers.get("Retry-After")
                    if retry_after:
                        try:
                            await asyncio.sleep(min(float(retry_after), self.config.max_backoff))
                        except ValueError:
                            await asyncio.sleep(self._backoff_delay(attempt))
                    else:
                        await asyncio.sleep(self._backoff_delay(attempt))
                    continue
                response.raise_for_status()
                return response
            except httpx.HTTPStatusError as exc:  # pragma: no cover - network stub
                status = exc.response.status_code
                last_exc = exc
                if status >= 500 or status == 429:
                    await asyncio.sleep(self._backoff_delay(attempt))
                    continue
                raise
            except httpx.HTTPError as exc:  # pragma: no cover - network stub
                last_exc = exc
                await asyncio.sleep(self._backoff_delay(attempt))
        if last_exc is not None:
            raise last_exc
        raise RuntimeError("HTTP request failed without exception")

    def _backoff_delay(self, attempt: int) -> float:
        delay = self.config.backoff_factor * (2 ** attempt)
        return min(delay, self.config.max_backoff)
