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
        if rate_limiter is not None:
            self.rate_limiter = rate_limiter
        elif config.rate_limit_per_second is not None:
            self.rate_limiter = AsyncRateLimiter(
                config.rate_limit_per_second,
                config.rate_limit_capacity,
            )
        else:
            self.rate_limiter = NullRateLimiter()

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
                    await self._handle_rate_limit_response(response, attempt)
                    continue
                response.raise_for_status()
                await self._after_success(response)
                return response
            except httpx.HTTPStatusError as exc:  # pragma: no cover - network stub
                last_exc = exc
                if await self._handle_http_status_error(exc, attempt):
                    continue
                raise
            except httpx.HTTPError as exc:  # pragma: no cover - network stub
                last_exc = exc
                await self._handle_network_error(exc, attempt)
                continue
        if last_exc is not None:
            raise last_exc
        raise RuntimeError("HTTP request failed without exception")

    def _backoff_delay(self, attempt: int) -> float:
        delay = self.config.backoff_factor * (2 ** attempt)
        return min(delay, self.config.max_backoff)

    async def _handle_rate_limit_response(self, response: httpx.Response, attempt: int) -> None:
        retry_after = response.headers.get("Retry-After")
        delay = self._backoff_delay(attempt)
        if retry_after:
            try:
                delay = float(retry_after)
            except ValueError:
                pass
        await asyncio.sleep(min(delay, self.config.max_backoff))

    async def _handle_http_status_error(self, exc: httpx.HTTPStatusError, attempt: int) -> bool:
        status = exc.response.status_code
        if status >= 500:
            await asyncio.sleep(self._backoff_delay(attempt))
            return True
        if status == 429:
            await self._handle_rate_limit_response(exc.response, attempt)
            return True
        return False

    async def _handle_network_error(self, exc: httpx.HTTPError, attempt: int) -> None:
        await asyncio.sleep(self._backoff_delay(attempt))

    async def _after_success(self, response: httpx.Response) -> None:
        return None
