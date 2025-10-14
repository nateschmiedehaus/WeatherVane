from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Mapping, MutableMapping, Sequence

from .meta import MetaAdsConnector


def _normalise_account_id(account_id: str) -> str:
    account = account_id.strip()
    if account.startswith("act_"):
        return account
    return f"act_{account}"


def _isoformat(dt: datetime) -> str:
    moment = dt
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    else:
        moment = moment.astimezone(timezone.utc)
    moment = moment.replace(microsecond=0)
    value = moment.isoformat()
    if value.endswith("+00:00"):
        return value[:-6] + "Z"
    return value


def _clean_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}


@dataclass(slots=True)
class CampaignSpec:
    """Parameters for creating Meta campaigns."""

    name: str
    objective: str
    status: str = "PAUSED"
    special_ad_categories: Sequence[str] = field(default_factory=tuple)
    buying_type: str | None = None
    daily_budget: int | None = None
    lifetime_budget: int | None = None
    spend_cap: int | None = None
    start_time: datetime | None = None
    stop_time: datetime | None = None
    additional_fields: Mapping[str, Any] | None = None

    def to_payload(self) -> dict[str, Any]:
        payload: MutableMapping[str, Any] = {
            "name": self.name,
            "objective": self.objective,
            "status": self.status,
        }
        if self.special_ad_categories:
            payload["special_ad_categories"] = list(self.special_ad_categories)
        if self.buying_type:
            payload["buying_type"] = self.buying_type
        if self.daily_budget is not None:
            payload["daily_budget"] = self.daily_budget
        if self.lifetime_budget is not None:
            payload["lifetime_budget"] = self.lifetime_budget
        if self.spend_cap is not None:
            payload["spend_cap"] = self.spend_cap
        if self.start_time is not None:
            payload["start_time"] = _isoformat(self.start_time)
        if self.stop_time is not None:
            payload["stop_time"] = _isoformat(self.stop_time)
        if self.additional_fields:
            payload.update(self.additional_fields)
        return _clean_payload(payload)


@dataclass(slots=True)
class AdSetSpec:
    """Parameters for creating Meta ad sets."""

    name: str
    campaign_id: str
    billing_event: str
    optimization_goal: str
    status: str = "PAUSED"
    daily_budget: int | None = None
    lifetime_budget: int | None = None
    bid_amount: int | None = None
    bid_strategy: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    pacing_type: Sequence[str] | None = None
    targeting: Mapping[str, Any] | None = None
    attribution_spec: Sequence[Mapping[str, Any]] | None = None
    promoted_object: Mapping[str, Any] | None = None
    additional_fields: Mapping[str, Any] | None = None

    def to_payload(self) -> dict[str, Any]:
        payload: MutableMapping[str, Any] = {
            "name": self.name,
            "campaign_id": self.campaign_id,
            "billing_event": self.billing_event,
            "optimization_goal": self.optimization_goal,
            "status": self.status,
        }
        if self.daily_budget is not None:
            payload["daily_budget"] = self.daily_budget
        if self.lifetime_budget is not None:
            payload["lifetime_budget"] = self.lifetime_budget
        if self.bid_amount is not None:
            payload["bid_amount"] = self.bid_amount
        if self.bid_strategy:
            payload["bid_strategy"] = self.bid_strategy
        if self.start_time is not None:
            payload["start_time"] = _isoformat(self.start_time)
        if self.end_time is not None:
            payload["end_time"] = _isoformat(self.end_time)
        if self.pacing_type:
            payload["pacing_type"] = list(self.pacing_type)
        if self.targeting is not None:
            payload["targeting"] = self.targeting
        if self.attribution_spec:
            payload["attribution_spec"] = list(self.attribution_spec)
        if self.promoted_object is not None:
            payload["promoted_object"] = self.promoted_object
        if self.additional_fields:
            payload.update(self.additional_fields)
        return _clean_payload(payload)


@dataclass(slots=True)
class CreativeSpec:
    """Parameters for creating Meta ad creatives."""

    name: str
    object_story_spec: Mapping[str, Any] | None = None
    asset_feed_spec: Mapping[str, Any] | None = None
    link_url: str | None = None
    template_data: Mapping[str, Any] | None = None
    additional_fields: Mapping[str, Any] | None = None

    def to_payload(self) -> dict[str, Any]:
        payload: MutableMapping[str, Any] = {"name": self.name}
        if self.object_story_spec is not None:
            payload["object_story_spec"] = self.object_story_spec
        if self.asset_feed_spec is not None:
            payload["asset_feed_spec"] = self.asset_feed_spec
        if self.link_url is not None:
            payload["link_url"] = self.link_url
        if self.template_data is not None:
            payload["template_data"] = self.template_data
        if self.additional_fields:
            payload.update(self.additional_fields)
        if not any(
            key in payload
            for key in ("object_story_spec", "asset_feed_spec", "link_url", "template_data")
        ):
            raise ValueError("CreativeSpec requires at least one creative payload field.")
        return _clean_payload(payload)


@dataclass(slots=True)
class AdSpec:
    """Parameters for creating Meta ads."""

    name: str
    adset_id: str
    status: str = "PAUSED"
    creative_id: str | None = None
    creative: Mapping[str, Any] | None = None
    tracking_specs: Sequence[Mapping[str, Any]] | None = None
    additional_fields: Mapping[str, Any] | None = None

    def to_payload(self) -> dict[str, Any]:
        payload: MutableMapping[str, Any] = {
            "name": self.name,
            "adset_id": self.adset_id,
            "status": self.status,
        }
        if self.creative_id:
            payload["creative"] = {"creative_id": self.creative_id}
        if self.creative is not None:
            payload["creative"] = self.creative
        if "creative" not in payload:
            raise ValueError("AdSpec requires either creative_id or creative payload.")
        if self.tracking_specs:
            payload["tracking_specs"] = list(self.tracking_specs)
        if self.additional_fields:
            payload.update(self.additional_fields)
        return _clean_payload(payload)


class MetaMarketingClient:
    """High-level Meta Marketing API helper for campaign and creative management."""

    def __init__(self, connector: MetaAdsConnector, account_id: str) -> None:
        self.connector = connector
        self.account_id = _normalise_account_id(account_id)

    async def create_campaign(self, spec: CampaignSpec) -> dict[str, Any]:
        response = await self.connector._request_with_refresh(  # noqa: SLF001
            "POST",
            f"/{self.account_id}/campaigns",
            json=spec.to_payload(),
        )
        return response.json()

    async def update_campaign(self, campaign_id: str, updates: Mapping[str, Any]) -> dict[str, Any]:
        response = await self.connector._request_with_refresh(  # noqa: SLF001
            "POST",
            f"/{campaign_id}",
            json=_clean_payload(updates),
        )
        return response.json()

    async def create_ad_set(self, spec: AdSetSpec) -> dict[str, Any]:
        response = await self.connector._request_with_refresh(  # noqa: SLF001
            "POST",
            f"/{self.account_id}/adsets",
            json=spec.to_payload(),
        )
        return response.json()

    async def update_ad_set(self, adset_id: str, updates: Mapping[str, Any]) -> dict[str, Any]:
        response = await self.connector._request_with_refresh(  # noqa: SLF001
            "POST",
            f"/{adset_id}",
            json=_clean_payload(updates),
        )
        return response.json()

    async def create_creative(self, spec: CreativeSpec) -> dict[str, Any]:
        response = await self.connector._request_with_refresh(  # noqa: SLF001
            "POST",
            f"/{self.account_id}/adcreatives",
            json=spec.to_payload(),
        )
        return response.json()

    async def create_ad(self, spec: AdSpec) -> dict[str, Any]:
        response = await self.connector._request_with_refresh(  # noqa: SLF001
            "POST",
            f"/{self.account_id}/ads",
            json=spec.to_payload(),
        )
        return response.json()

    async def get_campaign(
        self,
        campaign_id: str,
        *,
        fields: Sequence[str] | None = None,
    ) -> dict[str, Any]:
        params = {}
        if fields:
            params["fields"] = ",".join(fields)
        response = await self.connector._request_with_refresh(  # noqa: SLF001
            "GET",
            f"/{campaign_id}",
            params=params or None,
        )
        return response.json()

    async def iter_campaigns(
        self,
        *,
        fields: Sequence[str] | None = None,
        effective_status: Sequence[str] | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[Mapping[str, Any]]:
        params: dict[str, Any] = {}
        if fields:
            params["fields"] = ",".join(fields)
        if effective_status:
            params["effective_status"] = ",".join(effective_status)
        if limit is not None:
            params["limit"] = limit
        async for item in self.connector.iter_edges(  # noqa: SLF001
            f"/{self.account_id}/campaigns",
            params=_clean_payload(params),
        ):
            yield item

    async def close(self) -> None:
        await self.connector.close()
