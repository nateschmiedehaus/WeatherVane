"""Klaviyo promo ingestion."""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, Iterable, Mapping

from shared.libs.connectors import KlaviyoConfig, KlaviyoConnector
from shared.libs.storage.lake import LakeWriter
from shared.libs.storage.state import JsonStateStore

from .base import BaseIngestor, IngestionSummary
from shared.validation.schemas import validate_promos

DEFAULT_PAGE_SIZE = 100


@dataclass
class PromoIngestor(BaseIngestor):
    connector: KlaviyoConnector | None = None
    state_store: JsonStateStore | None = None

    async def ingest_campaigns(
        self,
        tenant_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> IngestionSummary | None:
        if not self.connector:
            return None
        state_key = f"{tenant_id}_promos"
        state = self.state_store.load("klaviyo", state_key) if self.state_store else {}
        since = state.get("updated_at_min")
        filters = [
            f"greater-or-equal(created_at,'{start_date.isoformat()}')",
            f"less-or-equal(created_at,'{end_date.isoformat()}')",
        ]
        if since:
            filters.append(f"greater-than(updated_at,'{since}')")
        params = {
            "page[size]": DEFAULT_PAGE_SIZE,
            "filter": " and ".join(filters),
        }
        payload = await self.connector.fetch("campaigns", **params)
        data = payload.get("data", [])
        rows = [self._normalise_campaign(tenant_id, campaign) for campaign in data]
        if rows:
            validate_promos(rows)
        dataset = f"{tenant_id}_promos"
        combined_rows, new_rows, updated_rows = self._merge_incremental(dataset, rows, ("tenant_id", "campaign_id"))
        metadata = {
            "new_rows": new_rows,
            "updated_rows": updated_rows,
            "total_rows": len(combined_rows),
        }
        latest_update = self._max_timestamp(combined_rows, "updated_at")
        if latest_update:
            metadata["checkpoint"] = self._format_timestamp(latest_update)
        summary = self._write_records(
            dataset=dataset,
            rows=combined_rows,
            source="klaviyo_api",
            metadata=metadata,
        )
        summary.row_count = new_rows + updated_rows
        summary.metadata = metadata
        if self.state_store and latest_update:
            self.state_store.save(
                "klaviyo",
                state_key,
                {
                    "updated_at_min": metadata["checkpoint"],
                    "last_run_at": datetime.utcnow().isoformat(),
                    "row_count": summary.row_count,
                    "total_rows": metadata["total_rows"],
                },
            )
        return summary

    def _normalise_campaign(self, tenant_id: str, campaign: Mapping[str, Any]) -> Dict[str, Any]:
        attributes = campaign.get("attributes", {})
        return {
            "tenant_id": tenant_id,
            "campaign_id": campaign.get("id"),
            "name": attributes.get("name"),
            "channel": attributes.get("channel"),
            "scheduled_at": attributes.get("scheduled_at"),
            "status": attributes.get("status"),
            "updated_at": attributes.get("updated_at"),
        }

    @staticmethod
    def _parse_timestamp(raw: Any) -> datetime | None:
        if not raw or not isinstance(raw, str):
            return None
        text = raw.strip()
        if not text:
            return None
        normalised = text.replace("Z", "+00:00") if text.endswith("Z") else text
        try:
            return datetime.fromisoformat(normalised)
        except ValueError:
            return None

    @classmethod
    def _max_timestamp(cls, rows: Iterable[Mapping[str, Any]], field: str) -> datetime | None:
        latest: datetime | None = None
        for row in rows:
            candidate = cls._parse_timestamp(row.get(field))
            if candidate is None:
                continue
            if latest is None or candidate > latest:
                latest = candidate
        return latest

    @staticmethod
    def _format_timestamp(value: datetime) -> str:
        iso_value = value.isoformat()
        return iso_value.replace("+00:00", "Z")


def build_promo_ingestor_from_env(
    lake_root: str,
    *,
    state_root: str | os.PathLike[str] | None = None,
):
    api_key = os.getenv("KLAVIYO_API_KEY")
    state_store = JsonStateStore(root=state_root) if state_root else JsonStateStore()
    if not api_key:
        return PromoIngestor(writer=LakeWriter(root=lake_root), connector=None, state_store=state_store)
    config = KlaviyoConfig(api_key=api_key)
    return PromoIngestor(
        writer=LakeWriter(root=lake_root),
        connector=KlaviyoConnector(config),
        state_store=state_store,
    )
