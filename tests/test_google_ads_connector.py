import httpx
import pytest

from shared.libs.connectors.google_ads import GoogleAdsConnector
from shared.libs.connectors.config import GoogleAdsConfig


@pytest.mark.asyncio
async def test_search_iter_paginates(monkeypatch):
    config = GoogleAdsConfig(
        developer_token="dev",
        client_id="cid",
        client_secret="secret",
        refresh_token="refresh",
        access_token="token",
    )
    connector = GoogleAdsConnector(config)

    responses = [
        {"results": [{"foo": 1}], "nextPageToken": "abc"},
        {"results": [{"foo": 2}]},
    ]
    calls = 0

    async def fake_request(method, path, **kwargs):
        nonlocal calls
        payload = responses[calls]
        calls += 1
        request = connector._client.build_request(method, path, **kwargs)
        return httpx.Response(200, json=payload, request=request)

    monkeypatch.setattr(connector, "_request_with_refresh", fake_request)

    rows = [row async for row in connector.search_iter("123", "SELECT foo")]
    assert rows == [{"foo": 1}, {"foo": 2}]
    assert calls == 2

    await connector.close()


@pytest.mark.asyncio
async def test_refresh_token_on_unauthorised(monkeypatch):
    config = GoogleAdsConfig(
        developer_token="dev",
        client_id="cid",
        client_secret="secret",
        refresh_token="refresh",
        access_token="short",
    )
    connector = GoogleAdsConnector(config)

    real_client = connector._client

    class StubAsyncClient:
        def __init__(self, *args, **kwargs):
            self._request = None

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, data=None):
            request = real_client.build_request("POST", url, data=data)
            return httpx.Response(200, json={"access_token": "long"}, request=request)

    async def fake_request(method, path, **kwargs):
        request = real_client.build_request(method, path, **kwargs)
        if path.endswith(":search"):
            if real_client.headers.get("Authorization") == "Bearer short":
                response = httpx.Response(401, json={}, request=request)
                raise httpx.HTTPStatusError("unauthorised", request=request, response=response)
            return httpx.Response(200, json={"results": []}, request=request)
        return httpx.Response(200, json={}, request=request)

    monkeypatch.setattr(real_client, "request", fake_request)
    monkeypatch.setattr("shared.libs.connectors.google_ads.httpx.AsyncClient", StubAsyncClient)

    result = await connector.search("123", "SELECT foo")
    assert result["results"] == []
    assert real_client.headers["Authorization"] == "Bearer long"

    await connector.close()
