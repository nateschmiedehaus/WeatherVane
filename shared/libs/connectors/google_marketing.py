from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Mapping, MutableMapping, Sequence

from .google_ads import GoogleAdsConnector


def _clean_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Drop fields that were left unset so Google ignores them."""
    return {key: value for key, value in payload.items() if value is not None}


def _format_date(value: date | datetime | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        return value.date().isoformat()
    return value.isoformat()


def _join_mask(fields: Sequence[str]) -> str:
    if not fields:
        raise ValueError("update field mask requires at least one field")
    return ",".join(field for field in fields if field)


@dataclass(slots=True)
class GoogleCampaignBudgetSpec:
    """Parameters for creating shared Google Ads campaign budgets."""

    name: str
    amount_micros: int
    delivery_method: str = "STANDARD"
    explicitly_shared: bool = True
    type: str | None = None
    period: str | None = None
    additional_fields: Mapping[str, Any] | None = None

    def to_payload(self) -> dict[str, Any]:
        payload: MutableMapping[str, Any] = {
            "name": self.name,
            "amountMicros": self.amount_micros,
            "deliveryMethod": self.delivery_method,
            "explicitlyShared": self.explicitly_shared,
        }
        if self.type:
            payload["type"] = self.type
        if self.period:
            payload["period"] = self.period
        if self.additional_fields:
            payload.update(self.additional_fields)
        return _clean_payload(payload)


@dataclass(slots=True)
class GoogleCampaignSpec:
    """Parameters for creating Google Ads campaigns."""

    name: str
    advertising_channel_type: str
    campaign_budget: str
    status: str = "PAUSED"
    advertising_channel_sub_type: str | None = None
    bidding_strategy_type: str | None = None
    bidding_strategy: Mapping[str, Any] | None = None
    start_date: date | datetime | str | None = None
    end_date: date | datetime | str | None = None
    network_settings: Mapping[str, Any] | None = None
    geo_target_type_setting: Mapping[str, Any] | None = None
    additional_fields: Mapping[str, Any] | None = None

    def to_payload(self) -> dict[str, Any]:
        payload: MutableMapping[str, Any] = {
            "name": self.name,
            "status": self.status,
            "advertisingChannelType": self.advertising_channel_type,
            "campaignBudget": self.campaign_budget,
        }
        if self.advertising_channel_sub_type:
            payload["advertisingChannelSubType"] = self.advertising_channel_sub_type
        if self.bidding_strategy_type:
            payload["biddingStrategyType"] = self.bidding_strategy_type
        if self.bidding_strategy:
            payload.update(self.bidding_strategy)
        if start := _format_date(self.start_date):
            payload["startDate"] = start
        if end := _format_date(self.end_date):
            payload["endDate"] = end
        if self.network_settings:
            payload["networkSettings"] = self.network_settings
        if self.geo_target_type_setting:
            payload["geoTargetTypeSetting"] = self.geo_target_type_setting
        if self.additional_fields:
            payload.update(self.additional_fields)
        return _clean_payload(payload)


class GoogleAdsMarketingClient:
    """High-level helper for Google Ads campaign + budget mutations."""

    def __init__(self, connector: GoogleAdsConnector, customer_id: str) -> None:
        self.connector = connector
        self.customer_id = customer_id

    @property
    def _api_version(self) -> str:
        return self.connector.config.api_version.rstrip("/")

    async def create_campaign_budget(
        self,
        spec: GoogleCampaignBudgetSpec,
        *,
        partial_failure: bool = False,
        validate_only: bool = False,
    ) -> dict[str, Any]:
        operation = {"create": spec.to_payload()}
        return await self._mutate(
            "campaignBudgets",
            operations=[operation],
            partial_failure=partial_failure,
            validate_only=validate_only,
        )

    async def create_campaign(
        self,
        spec: GoogleCampaignSpec,
        *,
        partial_failure: bool = False,
        validate_only: bool = False,
    ) -> dict[str, Any]:
        operation = {"create": spec.to_payload()}
        return await self._mutate(
            "campaigns",
            operations=[operation],
            partial_failure=partial_failure,
            validate_only=validate_only,
        )

    async def update_campaign(
        self,
        resource_name: str,
        updates: Mapping[str, Any],
        *,
        field_mask: Sequence[str] | None = None,
        partial_failure: bool = False,
        validate_only: bool = False,
    ) -> dict[str, Any]:
        if not updates:
            raise ValueError("Campaign updates require at least one field")
        mask = _join_mask(list(field_mask) if field_mask else list(updates.keys()))
        update_payload = {"resourceName": resource_name, **_clean_payload(updates)}
        operation = {"update": update_payload, "updateMask": mask}
        return await self._mutate(
            "campaigns",
            operations=[operation],
            partial_failure=partial_failure,
            validate_only=validate_only,
        )

    async def update_campaign_budget(
        self,
        resource_name: str,
        updates: Mapping[str, Any],
        *,
        field_mask: Sequence[str] | None = None,
        partial_failure: bool = False,
        validate_only: bool = False,
    ) -> dict[str, Any]:
        if not updates:
            raise ValueError("Campaign budget updates require at least one field")
        mask = _join_mask(list(field_mask) if field_mask else list(updates.keys()))
        update_payload = {"resourceName": resource_name, **_clean_payload(updates)}
        operation = {"update": update_payload, "updateMask": mask}
        return await self._mutate(
            "campaignBudgets",
            operations=[operation],
            partial_failure=partial_failure,
            validate_only=validate_only,
        )

    async def _mutate(
        self,
        resource: str,
        *,
        operations: Sequence[Mapping[str, Any]],
        partial_failure: bool = False,
        validate_only: bool = False,
    ) -> dict[str, Any]:
        if not operations:
            raise ValueError("Mutations require at least one operation")
        payload: MutableMapping[str, Any] = {"operations": list(operations)}
        if partial_failure:
            payload["partialFailure"] = True
        if validate_only:
            payload["validateOnly"] = True
        response = await self.connector._request_with_refresh(  # noqa: SLF001
            "POST",
            self._mutation_path(resource),
            json=payload,
        )
        return response.json()

    def _mutation_path(self, resource: str) -> str:
        return f"/{self._api_version}/customers/{self.customer_id}/{resource}:mutate"

    async def close(self) -> None:
        await self.connector.close()
