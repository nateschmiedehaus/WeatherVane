import httpx
import pytest

from shared.libs.connectors.meta import MetaAdsConnector
from shared.libs.connectors.config import MetaAdsConfig


@pytest.mark.asyncio
async def test_fetch_page_extracts_cursor(monkeypatch):
    config = MetaAdsConfig(access_token="token", app_id="app", app_secret="secret")
    connector = MetaAdsConnector(config)

    payload = {
        "data": [{"id": "1"}],
        "paging": {
            "cursors": {"after": "cursor123"},
        },
    }

    async def fake_request(method, path, **kwargs):
        request = connector._client.build_request(method, path, **kwargs)
        return httpx.Response(200, json=payload, request=request)

    monkeypatch.setattr(connector, "_request_with_refresh", fake_request)

    page, cursor = await connector.fetch_page("/act_1/insights")
    assert page["data"][0]["id"] == "1"
    assert cursor == "cursor123"

    await connector.close()


@pytest.mark.asyncio
async def test_iter_edges_paginates(monkeypatch):
    config = MetaAdsConfig(access_token="token", app_id="app", app_secret="secret")
    connector = MetaAdsConnector(config)

    responses = [
        {
            "data": [{"id": "1"}],
            "paging": {"cursors": {"after": "cursor2"}},
        },
        {
            "data": [{"id": "2"}],
        },
    ]
    calls = 0

    async def fake_request(method, path, **kwargs):
        nonlocal calls
        payload = responses[calls]
        calls += 1
        request = connector._client.build_request(method, path, **kwargs)
        return httpx.Response(200, json=payload, request=request)

    monkeypatch.setattr(connector, "_request_with_refresh", fake_request)

    items = await _collect_async(connector.iter_edges("/act_1/insights"))
    assert [item["id"] for item in items] == ["1", "2"]
    assert calls == 2

    await connector.close()


@pytest.mark.asyncio
async def test_refresh_token_on_unauthorised(monkeypatch):
    config = MetaAdsConfig(access_token="short", app_id="app", app_secret="secret")
    connector = MetaAdsConnector(config)

    real_client = connector._client

    async def fake_request(method, path, **kwargs):
        request = real_client.build_request(method, path, **kwargs)
        if path == "/oauth/access_token":
            return httpx.Response(
                200,
                json={"access_token": "long"},
                request=request,
            )
        if real_client.headers["Authorization"] == "Bearer short":
            response = httpx.Response(401, json={}, request=request)
            raise httpx.HTTPStatusError("unauthorised", request=request, response=response)
        return httpx.Response(200, json={"data": []}, request=request)

    monkeypatch.setattr(real_client, "request", fake_request)

    result = await connector.fetch("/act_1/insights")
    assert result["data"] == []
    assert real_client.headers["Authorization"] == "Bearer long"

    await connector.close()


async def _collect_async(aiter):
    items = []
    async for item in aiter:
        items.append(item)
    return items
