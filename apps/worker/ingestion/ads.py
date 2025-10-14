"""Meta & Google Ads ingestion helpers."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Mapping

import json

from shared.libs.connectors import GoogleAdsConfig, GoogleAdsConnector, MetaAdsConnector, MetaAdsConfig
from shared.libs.storage.lake import LakeWriter

from .base import BaseIngestor, IngestionSummary, iso
from shared.validation.schemas import (
    validate_google_ads,
    validate_meta_ads,
)

DEFAULT_DAYS_LOOKBACK = 90


@dataclass
class AdsIngestor(BaseIngestor):
    meta_connector: MetaAdsConnector | None = None
    google_connector: GoogleAdsConnector | None = None

    async def ingest_meta(
        self,
        tenant_id: str,
        start_date: datetime,
        end_date: datetime,
        level: str = "adset",
    ) -> IngestionSummary | None:
        if not self.meta_connector:
            return None
        params = {
            "time_range": {"since": iso(start_date), "until": iso(end_date)},
            "level": level,
            "time_increment": 1,
        }
        response = await self.meta_connector.fetch("insights", **params)
        data = response.get("data", [])
        rows = [self._normalise_meta_row(tenant_id, row) for row in data]
        if rows:
            validate_meta_ads(rows)
        return self._write_incremental(
            dataset=f"{tenant_id}_meta_ads",
            rows=rows,
            unique_keys=("tenant_id", "date", "campaign_id", "adset_id"),
            source="meta_api",
        )

    async def ingest_google(
        self,
        tenant_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> IngestionSummary | None:
        if not self.google_connector:
            return None
        service = "GoogleAdsService"
        params = {
            "query": (
                "SELECT campaign.id, metrics.cost_micros, metrics.conversions, metrics.impressions, "
                " metrics.clicks, segments.date "
                "FROM campaign WHERE segments.date BETWEEN '{start}' AND '{end}'"
            ).format(start=iso(start_date), end=iso(end_date)),
        }
        response = await self.google_connector.fetch(service, **params)
        data = response.get("results", [])
        rows = [self._normalise_google_row(tenant_id, row) for row in data]
        if rows:
            validate_google_ads(rows)
        return self._write_incremental(
            dataset=f"{tenant_id}_google_ads",
            rows=rows,
            unique_keys=("tenant_id", "date", "campaign_id"),
            source="google_api",
        )

    def _normalise_meta_row(self, tenant_id: str, row: Mapping[str, Any]) -> Dict[str, Any]:
        return {
            "tenant_id": tenant_id,
            "date": row.get("date_start"),
            "campaign_id": row.get("campaign_id"),
            "adset_id": row.get("adset_id"),
            "spend": float(row.get("spend") or 0),
            "impressions": int(row.get("impressions") or 0),
            "clicks": int(row.get("clicks") or 0),
            "conversions": float(row.get("conversions") or 0),
        }

    def _normalise_google_row(self, tenant_id: str, row: Mapping[str, Any]) -> Dict[str, Any]:
        metrics = row.get("metrics", {})
        segments = row.get("segments", {})
        campaign = row.get("campaign", {})
        cost_micros = float(metrics.get("cost_micros") or 0)
        spend = cost_micros / 1_000_000
        return {
            "tenant_id": tenant_id,
            "date": segments.get("date"),
            "campaign_id": campaign.get("id"),
            "spend": spend,
            "impressions": int(metrics.get("impressions") or 0),
            "clicks": int(metrics.get("clicks") or 0),
            "conversions": float(metrics.get("conversions") or 0),
        }


def build_ads_ingestor_from_env(lake_root: str) -> AdsIngestor:
    writer = LakeWriter(root=lake_root)
    meta = None
    google = None

    meta_fixture = os.getenv("META_INSIGHTS_FIXTURE")
    if meta_fixture:
        meta = MetaFixtureConnector(Path(meta_fixture))
    else:
        meta_access_token = os.getenv("META_ACCESS_TOKEN")
        meta_app_id = os.getenv("META_APP_ID")
        meta_app_secret = os.getenv("META_APP_SECRET")
        if meta_access_token and meta_app_id and meta_app_secret:
            meta_config = MetaAdsConfig(
                access_token=meta_access_token,
                app_id=meta_app_id,
                app_secret=meta_app_secret,
            )
            meta = MetaAdsConnector(meta_config)

    google_fixture = os.getenv("GOOGLEADS_FIXTURE")
    if google_fixture:
        google = GoogleFixtureConnector(Path(google_fixture))
    else:
        google_dev_token = os.getenv("GOOGLEADS_DEVELOPER_TOKEN")
        google_customer_id = os.getenv("GOOGLEADS_CUSTOMER_ID")
        refresh_token = os.getenv("GOOGLEADS_REFRESH_TOKEN")
        client_id = os.getenv("GOOGLEADS_OAUTH_CLIENT_ID")
        client_secret = os.getenv("GOOGLEADS_OAUTH_CLIENT_SECRET")
        if google_dev_token and google_customer_id and refresh_token and client_id and client_secret:
            google_config = GoogleAdsConfig(
                developer_token=google_dev_token,
                client_id=client_id,
                client_secret=client_secret,
                refresh_token=refresh_token,
                login_customer_id=google_customer_id,
            )
            google = GoogleAdsConnector(google_config)

    return AdsIngestor(writer=writer, meta_connector=meta, google_connector=google)


class MetaFixtureConnector:
    name = "meta_ads_fixture"

    def __init__(self, path: Path) -> None:
        self.path = path

    async def fetch(self, endpoint: str, **params: Any) -> dict[str, Any]:
        return json.loads(self.path.read_text())


class GoogleFixtureConnector:
    name = "google_ads_fixture"

    def __init__(self, path: Path) -> None:
        self.path = path

    async def fetch(self, service: str, **params: Any) -> dict[str, Any]:
        return json.loads(self.path.read_text())
