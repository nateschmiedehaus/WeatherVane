import asyncio

import httpx
import pytest

from shared.libs.connectors import ShopifyConfig
from shared.libs.connectors.shopify import ShopifyConnector


def build_response(json_payload, link: str | None = None) -> httpx.Response:
    headers = {"Link": link} if link else {}
    request = httpx.Request("GET", "https://demo.myshopify.com")
    return httpx.Response(200, json=json_payload, headers=headers, request=request)


def test_extract_next_page_parses_link():
    link = '<https://demo.myshopify.com/admin/api/2024-04/orders.json?page_info=cursor123&limit=250>; rel="next"'
    response = build_response({"orders": []}, link)
    assert ShopifyConnector._extract_next_page(response) == "cursor123"


@pytest.mark.asyncio
async def test_fetch_page_returns_items_and_cursor(monkeypatch):
    config = ShopifyConfig(shop_domain="demo.myshopify.com", access_token="token", api_version="2024-04")
    connector = ShopifyConnector(config)

    async def fake_request(method: str, path: str, **kwargs):
        assert method == "GET"
        assert "orders" in path
        return build_response({"orders": [{"id": 1}]}, '<https://demo.myshopify.com/admin/api/2024-04/orders.json?page_info=nextcursor>; rel="next"')

    monkeypatch.setattr(connector, "_request_with_refresh", fake_request)
    payload, cursor = await connector.fetch_page("orders", params={"limit": 5})
    assert cursor == "nextcursor"
    assert payload["orders"][0]["id"] == 1

    await connector.close()


@pytest.mark.asyncio
async def test_refresh_token_on_unauthorised(monkeypatch):
    config = ShopifyConfig(
        shop_domain="demo.myshopify.com",
        access_token="expired",
        api_version="2024-04",
        client_id="client",
        client_secret="secret",
        refresh_token="refresh",
    )
    connector = ShopifyConnector(config)

    class StubClient:
        def __init__(self):
            self.headers = {"X-Shopify-Access-Token": "expired"}
            self.calls = []

        async def request(self, method, path, **kwargs):
            self.calls.append((method, path))
            request = httpx.Request(method, f"https://demo.myshopify.com{path}")
            if path.endswith("/oauth/access_token"):
                self.headers["X-Shopify-Access-Token"] = "fresh"
                return httpx.Response(200, json={"access_token": "fresh"}, request=request)
            if self.headers.get("X-Shopify-Access-Token") == "expired":
                return httpx.Response(401, json={}, request=request)
            return httpx.Response(200, json={"orders": []}, request=request)

        async def aclose(self):
            return None

    connector._client = StubClient()

    payload = await connector.fetch("orders", limit=5)
    assert payload["orders"] == []
    assert connector._client.headers["X-Shopify-Access-Token"] == "fresh"
    await connector.close()
