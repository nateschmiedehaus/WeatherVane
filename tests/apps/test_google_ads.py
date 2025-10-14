from __future__ import annotations

from datetime import date
from typing import Any, Mapping

import pytest

from shared.libs.connectors.config import GoogleAdsConfig
from shared.libs.connectors.google_ads import GoogleAdsConnector
from shared.libs.connectors.google_marketing import (
    GoogleAdsMarketingClient,
    GoogleCampaignBudgetSpec,
    GoogleCampaignSpec,
)


class _StubResponse:
    def __init__(self, payload: Mapping[str, Any]) -> None:
        self._payload = payload

    def json(self) -> Mapping[str, Any]:
        return self._payload


class _StubConnector(GoogleAdsConnector):
    def __init__(self) -> None:
        config = GoogleAdsConfig(
            developer_token="dev",
            client_id="cid",
            client_secret="secret",
            refresh_token="refresh",
            login_customer_id=None,
        )
        super().__init__(config)
        self.requests: list[tuple[str, str, dict[str, Any]]] = []

    async def _request_with_refresh(self, method: str, path: str, **kwargs: Any) -> _StubResponse:  # noqa: SLF001
        json_payload = kwargs.get("json") or {}
        self.requests.append((method, path, json_payload))
        return _StubResponse({"results": [{"resourceName": "stub"}]})


@pytest.mark.asyncio
async def test_create_campaign_budget_builds_mutation() -> None:
    connector = _StubConnector()
    client = GoogleAdsMarketingClient(connector, "123")

    spec = GoogleCampaignBudgetSpec(
        name="Shared Weather Budget",
        amount_micros=5_000_000,
        delivery_method="STANDARD",
    )

    result = await client.create_campaign_budget(spec)

    assert result["results"][0]["resourceName"] == "stub"
    method, path, payload = connector.requests[0]
    assert method == "POST"
    assert path == "/v14/customers/123/campaignBudgets:mutate"
    assert payload == {
        "operations": [
            {
                "create": {
                    "name": "Shared Weather Budget",
                    "amountMicros": 5_000_000,
                    "deliveryMethod": "STANDARD",
                    "explicitlyShared": True,
                }
            }
        ]
    }

    await client.close()


@pytest.mark.asyncio
async def test_create_campaign_serialises_dates() -> None:
    connector = _StubConnector()
    client = GoogleAdsMarketingClient(connector, "456")

    spec = GoogleCampaignSpec(
        name="Storm Surge Awareness",
        advertising_channel_type="SEARCH",
        campaign_budget="customers/456/campaignBudgets/999",
        start_date=date(2024, 3, 1),
        end_date="2024-03-31",
        additional_fields={"targetSpend": {"targetSpendMicros": 1_500_000}},
    )

    await client.create_campaign(spec, validate_only=True)

    method, path, payload = connector.requests[0]
    assert method == "POST"
    assert path == "/v14/customers/456/campaigns:mutate"
    create_payload = payload["operations"][0]["create"]
    assert create_payload["startDate"] == "2024-03-01"
    assert create_payload["endDate"] == "2024-03-31"
    assert create_payload["targetSpend"]["targetSpendMicros"] == 1_500_000
    assert payload["validateOnly"] is True

    await client.close()


@pytest.mark.asyncio
async def test_update_campaign_builds_field_mask() -> None:
    connector = _StubConnector()
    client = GoogleAdsMarketingClient(connector, "789")

    await client.update_campaign(
        "customers/789/campaigns/111",
        {"status": "ENABLED", "campaignBudget": "customers/789/campaignBudgets/321"},
    )

    _, _, payload = connector.requests[0]
    operation = payload["operations"][0]
    assert operation["updateMask"] == "status,campaignBudget"
    assert operation["update"]["resourceName"] == "customers/789/campaigns/111"
    assert operation["update"]["status"] == "ENABLED"

    await client.close()


@pytest.mark.asyncio
async def test_update_campaign_budget_uses_explicit_mask() -> None:
    connector = _StubConnector()
    client = GoogleAdsMarketingClient(connector, "789")

    await client.update_campaign_budget(
        "customers/789/campaignBudgets/1",
        {"amountMicros": 8_000_000, "deliveryMethod": None},
        field_mask=("amountMicros",),
        partial_failure=True,
    )

    _, _, payload = connector.requests[0]
    operation = payload["operations"][0]
    assert operation["updateMask"] == "amountMicros"
    assert "deliveryMethod" not in operation["update"]
    assert payload["partialFailure"] is True

    await client.close()
