from __future__ import annotations

import asyncio
import httpx
import pytest

from shared.libs.connectors.base import HTTPConnector
from shared.libs.connectors.config import ConnectorConfig
from shared.libs.connectors.rate_limit import AsyncRateLimiter
import shared.libs.connectors.base as base_module
import shared.libs.connectors.rate_limit as rate_limit_module


class _SleepRecorder:
    def __init__(self) -> None:
        self.durations: list[float] = []

    async def __call__(self, duration: float) -> None:
        self.durations.append(duration)


class _StubClient:
    def __init__(self, responses: list[httpx.Response]) -> None:
        self._responses = responses
        self._cursor = 0

    async def request(self, method: str, path: str, **kwargs: object) -> httpx.Response:
        if self._cursor >= len(self._responses):
            raise AssertionError("HTTPConnector performed more requests than expected")
        response = self._responses[self._cursor]
        self._cursor += 1
        return response

    async def aclose(self) -> None:
        return None


def _build_response(status_code: int, *, headers: dict[str, str] | None = None) -> httpx.Response:
    request = httpx.Request("GET", "https://example.com/resource")
    return httpx.Response(status_code, headers=headers or {}, request=request)


@pytest.mark.asyncio
async def test_async_rate_limiter_enforces_rate(monkeypatch: pytest.MonkeyPatch) -> None:
    current_time = 0.0

    async def fake_sleep(duration: float) -> None:
        nonlocal current_time
        current_time += duration

    def fake_monotonic() -> float:
        return current_time

    monkeypatch.setattr(rate_limit_module.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(rate_limit_module.time, "monotonic", fake_monotonic)

    limiter = AsyncRateLimiter(rate=2.0, capacity=1.0)

    await limiter.acquire()
    assert current_time == pytest.approx(0.0)

    await limiter.acquire()
    assert current_time == pytest.approx(0.5)

    await limiter.acquire()
    assert current_time == pytest.approx(1.0)


@pytest.mark.asyncio
async def test_http_connector_honours_retry_after(monkeypatch: pytest.MonkeyPatch) -> None:
    config = ConnectorConfig(max_retries=3, backoff_factor=0.25, max_backoff=4.0)
    connector = HTTPConnector(config, base_url="https://example.com")
    connector._client = _StubClient(
        [
            _build_response(429, headers={"Retry-After": "1.5"}),
            _build_response(200),
        ]
    )

    sleep_recorder = _SleepRecorder()
    monkeypatch.setattr(base_module.asyncio, "sleep", sleep_recorder)

    response = await connector._request("GET", "/resource")
    assert response.status_code == 200
    assert len(sleep_recorder.durations) == 1
    assert sleep_recorder.durations[0] == pytest.approx(1.5)

    await connector.close()


@pytest.mark.asyncio
async def test_http_connector_exponential_backoff_when_retry_after_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = ConnectorConfig(max_retries=3, backoff_factor=0.1, max_backoff=1.0)
    connector = HTTPConnector(config, base_url="https://example.com")
    connector._client = _StubClient(
        [
            _build_response(429),
            _build_response(429),
            _build_response(200),
        ]
    )

    sleep_recorder = _SleepRecorder()
    monkeypatch.setattr(base_module.asyncio, "sleep", sleep_recorder)

    response = await connector._request("GET", "/resource")
    assert response.status_code == 200
    assert len(sleep_recorder.durations) == 2
    assert sleep_recorder.durations[0] == pytest.approx(0.1)
    assert sleep_recorder.durations[1] == pytest.approx(0.2)

    await connector.close()
