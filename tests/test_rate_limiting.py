from __future__ import annotations

import httpx
import pytest

from shared.libs.connectors.base import HTTPConnector
from shared.libs.connectors.config import (
    ConnectorConfig,
    GoogleAdsConfig,
    MetaAdsConfig,
    ShopifyConfig,
    WeatherConfig,
)
from shared.libs.connectors.google_ads import GoogleAdsConnector
from shared.libs.connectors.meta import MetaAdsConnector
from shared.libs.connectors.rate_limit import AsyncRateLimiter
from shared.libs.connectors.shopify import ShopifyConnector
from shared.libs.connectors.weather import WeatherConnector
import shared.libs.connectors.base as base_module
import shared.libs.connectors.google_ads as google_ads_module
import shared.libs.connectors.meta as meta_module
import shared.libs.connectors.rate_limit as rate_limit_module
import shared.libs.connectors.shopify as shopify_module


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


def _build_response(
    status_code: int, *, headers: dict[str, str] | None = None, json_body: object | None = None
) -> httpx.Response:
    request = httpx.Request("GET", "https://example.com/resource")
    if json_body is not None:
        return httpx.Response(status_code, headers=headers or {}, json=json_body, request=request)
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


@pytest.mark.asyncio
async def test_shopify_connector_throttles_when_call_limit_header_high(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = ShopifyConfig(shop_domain="example.myshopify.com", access_token="token")
    connector = ShopifyConnector(config)
    connector._client = _StubClient(
        [
            _build_response(
                200,
                headers={"X-Shopify-Shop-Api-Call-Limit": "39/40"},
                json_body={"orders": []},
            ),
        ]
    )

    sleep_recorder = _SleepRecorder()
    monkeypatch.setattr(rate_limit_module.asyncio, "sleep", sleep_recorder)
    monkeypatch.setattr(base_module.asyncio, "sleep", sleep_recorder)
    monkeypatch.setattr(shopify_module.asyncio, "sleep", sleep_recorder)

    response = await connector._request_with_refresh("GET", "/admin/api/2024-04/orders.json")
    assert response.status_code == 200
    assert sleep_recorder.durations, "expected throttling pause to be recorded"
    assert sleep_recorder.durations[-1] == pytest.approx(2.0)

    await connector.close()


@pytest.mark.asyncio
async def test_meta_connector_retries_on_rate_limit_error(monkeypatch: pytest.MonkeyPatch) -> None:
    config = MetaAdsConfig(access_token="token", app_id="app", app_secret="secret")
    connector = MetaAdsConnector(config)
    connector._client = _StubClient(
        [
            _build_response(
                400,
                json_body={"error": {"code": 4, "message": "Call limit reached"}},
            ),
            _build_response(200, json_body={"data": []}),
        ]
    )

    sleep_recorder = _SleepRecorder()
    monkeypatch.setattr(rate_limit_module.asyncio, "sleep", sleep_recorder)
    monkeypatch.setattr(base_module.asyncio, "sleep", sleep_recorder)
    monkeypatch.setattr(meta_module.asyncio, "sleep", sleep_recorder)

    result = await connector.fetch("/act_123/insights")
    assert result["data"] == []
    assert sleep_recorder.durations, "expected retry backoff to record a pause"
    assert sleep_recorder.durations[0] == pytest.approx(connector.config.backoff_factor)

    await connector.close()


@pytest.mark.asyncio
async def test_weather_connector_rate_limiter_waits_when_exhausted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    config = WeatherConfig(rate_limit_per_second=2.0, rate_limit_capacity=1.0)
    connector = WeatherConnector(config)
    connector._client = _StubClient(
        [
            _build_response(200, json_body={"temperature": 20}),
            _build_response(200, json_body={"temperature": 21}),
        ]
    )

    sleep_recorder = _SleepRecorder()
    current_time = 0.0

    async def fake_sleep(duration: float) -> None:
        nonlocal current_time
        current_time += duration
        sleep_recorder.durations.append(duration)

    def fake_monotonic() -> float:
        return current_time

    monkeypatch.setattr(rate_limit_module.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(rate_limit_module.time, "monotonic", fake_monotonic)
    monkeypatch.setattr(base_module.asyncio, "sleep", fake_sleep)

    await connector.fetch_forecast(10.0, 20.0)
    await connector.fetch_forecast(10.0, 20.0)

    assert sleep_recorder.durations, "rate limiter should enforce a wait"
    assert sleep_recorder.durations[-1] == pytest.approx(0.5)

    await connector.close()


@pytest.mark.asyncio
async def test_google_ads_connector_retries_on_quota_error(monkeypatch: pytest.MonkeyPatch) -> None:
    config = GoogleAdsConfig(
        developer_token="dev",
        client_id="cid",
        client_secret="secret",
        refresh_token="refresh",
        access_token="token",
    )
    connector = GoogleAdsConnector(config)
    quota_error_payload = {
        "error": {
            "code": 400,
            "status": "RESOURCE_EXHAUSTED",
            "details": [
                {
                    "@type": "type.googleapis.com/google.ads.googleads.v14.errors.GoogleAdsFailure",
                    "errors": [
                        {
                            "errorCode": {"quotaError": "RESOURCE_EXHAUSTED"},
                        }
                    ],
                }
            ],
        }
    }
    connector._client = _StubClient(
        [
            _build_response(400, json_body=quota_error_payload),
            _build_response(200, json_body={"results": []}),
        ]
    )
    connector._client.headers = {"Authorization": "Bearer token"}  # type: ignore[attr-defined]

    sleep_recorder = _SleepRecorder()
    monkeypatch.setattr(rate_limit_module.asyncio, "sleep", sleep_recorder)
    monkeypatch.setattr(base_module.asyncio, "sleep", sleep_recorder)
    monkeypatch.setattr(google_ads_module.asyncio, "sleep", sleep_recorder)

    result = await connector.search("1234567890", "SELECT metrics.clicks FROM customer")
    assert result["results"] == []
    assert sleep_recorder.durations, "expected retry backoff to record a pause"
    assert sleep_recorder.durations[0] == pytest.approx(connector.config.backoff_factor)

    await connector.close()
