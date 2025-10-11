"""Klaviyo promo ingestion."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Mapping

from shared.libs.connectors import KlaviyoConfig, KlaviyoConnector
from shared.libs.storage.lake import LakeWriter

from .base import BaseIngestor, IngestionSummary
from shared.validation.schemas import validate_promos

DEFAULT_PAGE_SIZE = 100


@dataclass
class PromoIngestor(BaseIngestor):
    connector: KlaviyoConnector | None = None

    async def ingest_campaigns(
        self,
        tenant_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> IngestionSummary | None:
        if not self.connector:
            return None
        params = {
            "page[size]": DEFAULT_PAGE_SIZE,
            "filter": f"greater-or-equal(created_at,'{start_date.isoformat()}')",
        }
        payload = await self.connector.fetch("campaigns", **params)
        data = payload.get("data", [])
        rows = [self._normalise_campaign(tenant_id, campaign) for campaign in data]
        if rows:
            validate_promos(rows)
        return self._write_records(f"{tenant_id}_promos", rows, source="klaviyo_api")

    def _normalise_campaign(self, tenant_id: str, campaign: Mapping[str, Any]) -> Dict[str, Any]:
        attributes = campaign.get("attributes", {})
        return {
            "tenant_id": tenant_id,
            "campaign_id": campaign.get("id"),
            "name": attributes.get("name"),
            "channel": attributes.get("channel"),
            "scheduled_at": attributes.get("scheduled_at"),
            "status": attributes.get("status"),
        }


def build_promo_ingestor_from_env(lake_root: str):
    api_key = os.getenv("KLAVIYO_API_KEY")
    if not api_key:
        return PromoIngestor(writer=LakeWriter(root=lake_root), connector=None)
    config = KlaviyoConfig(api_key=api_key)
    return PromoIngestor(writer=LakeWriter(root=lake_root), connector=KlaviyoConnector(config))
