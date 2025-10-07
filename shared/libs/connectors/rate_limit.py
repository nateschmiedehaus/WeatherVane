from __future__ import annotations

import asyncio
import time


class AsyncRateLimiter:
    """Token bucket rate limiter for async connectors."""

    def __init__(self, rate: float, capacity: float | None = None) -> None:
        self.rate = rate
        self.capacity = capacity or rate
        self._tokens = self.capacity
        self._updated_at = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            await self._refill()
            while self._tokens < 1:
                wait_time = (1 - self._tokens) / self.rate
                await asyncio.sleep(wait_time)
                await self._refill()
            self._tokens -= 1

    async def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._updated_at
        self._updated_at = now
        self._tokens = min(self.capacity, self._tokens + elapsed * self.rate)


class NullRateLimiter(AsyncRateLimiter):
    def __init__(self) -> None:
        super().__init__(rate=1)

    async def acquire(self) -> None:  # pragma: no cover - trivial override
        return
