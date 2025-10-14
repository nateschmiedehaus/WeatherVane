from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest

from shared.libs.connectors import MetaAdsConfig, MetaAdsConnector
from shared.libs.connectors.meta_marketing import (
    MetaMarketingClient,
    CampaignSpec,
    AdSetSpec,
    CreativeSpec,
    AdSpec,
)


def _stub_connector() -> MetaAdsConnector:
    config = MetaAdsConfig(access_token="token", app_id="app", app_secret="secret")
    return MetaAdsConnector(config)


async def _close_client(client: MetaMarketingClient) -> None:
    await client.close()


@pytest.mark.asyncio
async def test_create_campaign_posts_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    connector = _stub_connector()
    client = MetaMarketingClient(connector, "12345")
    captured: dict[str, object] = {}

    async def fake_request(method: str, path: str, **kwargs):
        captured["method"] = method
        captured["path"] = path
        captured["json"] = kwargs.get("json")
        request = connector._client.build_request(method, path, **kwargs)
        return httpx.Response(200, json={"id": "cmp_1"}, request=request)

    monkeypatch.setattr(connector, "_request_with_refresh", fake_request)

    spec = CampaignSpec(
        name="Storm Surge",
        objective="SALES",
        special_ad_categories=("NONE",),
        daily_budget=5000,
    )

    result = await client.create_campaign(spec)

    assert result["id"] == "cmp_1"
    assert captured["method"] == "POST"
    assert captured["path"] == "/act_12345/campaigns"
    payload = captured["json"]
    assert payload == {
        "name": "Storm Surge",
        "objective": "SALES",
        "status": "PAUSED",
        "special_ad_categories": ["NONE"],
        "daily_budget": 5000,
    }

    await _close_client(client)


@pytest.mark.asyncio
async def test_update_campaign_filters_none(monkeypatch: pytest.MonkeyPatch) -> None:
    connector = _stub_connector()
    client = MetaMarketingClient(connector, "act_2468")
    captured: dict[str, object] = {}

    async def fake_request(method: str, path: str, **kwargs):
        captured["path"] = path
        captured["json"] = kwargs.get("json")
        request = connector._client.build_request(method, path, **kwargs)
        return httpx.Response(200, json={"success": True}, request=request)

    monkeypatch.setattr(connector, "_request_with_refresh", fake_request)

    response = await client.update_campaign(
        "cmp_2",
        {"name": "Updated", "daily_budget": None, "status": "PAUSED"},
    )

    assert response["success"] is True
    assert captured["path"] == "/cmp_2"
    assert captured["json"] == {"name": "Updated", "status": "PAUSED"}

    await _close_client(client)


@pytest.mark.asyncio
async def test_create_adset_serialises_datetimes(monkeypatch: pytest.MonkeyPatch) -> None:
    connector = _stub_connector()
    client = MetaMarketingClient(connector, "777")
    captured: dict[str, object] = {}

    async def fake_request(method: str, path: str, **kwargs):
        captured["path"] = path
        captured["json"] = kwargs.get("json")
        request = connector._client.build_request(method, path, **kwargs)
        return httpx.Response(200, json={"id": "adset_1"}, request=request)

    monkeypatch.setattr(connector, "_request_with_refresh", fake_request)

    start = datetime(2024, 5, 1, 12, 30, tzinfo=timezone.utc)
    end = datetime(2024, 5, 7, 18, 0, tzinfo=timezone.utc)
    spec = AdSetSpec(
        name="Rain Watchers",
        campaign_id="cmp_1",
        billing_event="IMPRESSIONS",
        optimization_goal="REACH",
        daily_budget=8000,
        pacing_type=("standard",),
        targeting={"geo_locations": {"cities": [{"key": "2420955"}]}},
        start_time=start,
        end_time=end,
    )

    result = await client.create_ad_set(spec)

    assert result["id"] == "adset_1"
    assert captured["path"] == "/act_777/adsets"
    payload = captured["json"]
    assert payload["start_time"] == "2024-05-01T12:30:00Z"
    assert payload["end_time"] == "2024-05-07T18:00:00Z"
    assert payload["pacing_type"] == ["standard"]
    assert payload["targeting"]["geo_locations"]["cities"][0]["key"] == "2420955"

    await _close_client(client)


@pytest.mark.asyncio
async def test_create_creative_requires_story_spec(monkeypatch: pytest.MonkeyPatch) -> None:
    connector = _stub_connector()
    client = MetaMarketingClient(connector, "999")
    captured: dict[str, object] = {}

    async def fake_request(method: str, path: str, **kwargs):
        captured["path"] = path
        captured["json"] = kwargs.get("json")
        request = connector._client.build_request(method, path, **kwargs)
        return httpx.Response(200, json={"id": "cr_1"}, request=request)

    monkeypatch.setattr(connector, "_request_with_refresh", fake_request)

    spec = CreativeSpec(
        name="Umbrella Carousel",
        object_story_spec={
            "page_id": "pg_1",
            "link_data": {
                "message": "Stay dry this weekend.",
                "link": "https://example.com/rain",
                "call_to_action": {"type": "SHOP_NOW"},
            },
        },
    )

    result = await client.create_creative(spec)

    assert result["id"] == "cr_1"
    assert captured["path"] == "/act_999/adcreatives"
    payload = captured["json"]
    assert payload["object_story_spec"]["link_data"]["call_to_action"]["type"] == "SHOP_NOW"

    await _close_client(client)


def test_creative_spec_requires_payload_fields() -> None:
    spec = CreativeSpec(name="Empty Creative")
    with pytest.raises(ValueError):
        spec.to_payload()


def test_ad_spec_requires_creative_reference() -> None:
    spec = AdSpec(name="Invalid", adset_id="adset_1")
    with pytest.raises(ValueError):
        spec.to_payload()


@pytest.mark.asyncio
async def test_create_ad_wraps_creative_id(monkeypatch: pytest.MonkeyPatch) -> None:
    connector = _stub_connector()
    client = MetaMarketingClient(connector, "1357")
    captured: dict[str, object] = {}

    async def fake_request(method: str, path: str, **kwargs):
        captured["path"] = path
        captured["json"] = kwargs.get("json")
        request = connector._client.build_request(method, path, **kwargs)
        return httpx.Response(200, json={"id": "ad_1"}, request=request)

    monkeypatch.setattr(connector, "_request_with_refresh", fake_request)

    spec = AdSpec(
        name="Storm Surge Ad",
        adset_id="adset_1",
        creative_id="cr_1",
        tracking_specs=(
            {"action.type": ["purchase"]},
        ),
    )

    result = await client.create_ad(spec)

    assert result["id"] == "ad_1"
    assert captured["path"] == "/act_1357/ads"
    payload = captured["json"]
    assert payload["creative"] == {"creative_id": "cr_1"}
    assert payload["tracking_specs"] == [{"action.type": ["purchase"]}]

    await _close_client(client)


@pytest.mark.asyncio
async def test_iter_campaigns_forwards_filters(monkeypatch: pytest.MonkeyPatch) -> None:
    connector = _stub_connector()
    client = MetaMarketingClient(connector, "4242")
    captured: dict[str, object] = {}

    async def fake_iter_edges(endpoint: str, params=None):
        captured["endpoint"] = endpoint
        captured["params"] = params
        yield {"id": "cmp1"}
        yield {"id": "cmp2"}

    monkeypatch.setattr(connector, "iter_edges", fake_iter_edges)

    items = [
        item
        async for item in client.iter_campaigns(
            fields=("name", "status"),
            effective_status=("ACTIVE", "PAUSED"),
            limit=5,
        )
    ]

    assert captured["endpoint"] == "/act_4242/campaigns"
    assert captured["params"] == {
        "fields": "name,status",
        "effective_status": "ACTIVE,PAUSED",
        "limit": 5,
    }
    assert [item["id"] for item in items] == ["cmp1", "cmp2"]

    await _close_client(client)
