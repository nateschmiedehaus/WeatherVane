import asyncio
import os
from datetime import datetime

import pytest

os.environ.setdefault("WEATHERVANE_DISABLE_MODELING", "1")

pytest.importorskip("prefect", reason="integration test requires Prefect stub")

from apps.worker.flows.poc_pipeline import orchestrate_poc_flow
from apps.worker.ingestion.ads import AdsIngestor
from shared.libs.storage.lake import LakeWriter
from shared.data_context import default_context_service


class StubMetaConnector:
    async def fetch(self, endpoint, **params):
        return {
            "data": [
                {
                    "date_start": "2024-01-01",
                    "campaign_id": "c1",
                    "adset_id": "a1",
                    "spend": "12.5",
                    "impressions": "1000",
                    "clicks": "50",
                    "conversions": "5",
                },
                {
                    "date_start": "2024-01-02",
                    "campaign_id": "c2",
                    "adset_id": "a2",
                    "spend": "8.0",
                    "impressions": "500",
                    "clicks": "20",
                    "conversions": "2",
                },
            ],
        }

    async def close(self):
        return


class StubGoogleConnector:
    async def fetch(self, service: str, **params):
        return {
            "results": [
                {
                    "segments": {"date": "2024-01-01"},
                    "campaign": {"id": "g1"},
                    "metrics": {
                        "cost_micros": "1000000",
                        "impressions": "200",
                        "clicks": "10",
                        "conversions": "1",
                    },
                }
            ]
        }

    async def close(self):
        return


@pytest.mark.asyncio
async def test_pipeline_uses_ads_connectors(tmp_path, monkeypatch):
    monkeypatch.setenv("STORAGE_LAKE_ROOT", str(tmp_path / "lake"))
    monkeypatch.setenv("STORAGE_WEATHER_ROOT", str(tmp_path / "weather"))

    writer = LakeWriter(root=tmp_path / "lake")
    ingestor = AdsIngestor(
        writer=writer,
        meta_connector=StubMetaConnector(),
        google_connector=StubGoogleConnector(),
    )

    monkeypatch.setattr(
        "apps.worker.flows.poc_pipeline.build_ads_ingestor_from_env",
        lambda lake_root: ingestor,
    )

    tenant_id = "ads-tenant"
    default_context_service.reset(tenant_id)

    result = await orchestrate_poc_flow(
        tenant_id=tenant_id,
        start_date=datetime(2024, 1, 1),
        end_date=datetime(2024, 1, 3),
    )

    ads_summary = result["ads_summary"]
    assert ads_summary["meta_rows"] == 2
    assert ads_summary["google_rows"] == 1
    assert result["sources"]["ads"] == "ads_api"

    latest_meta = writer.latest(f"{tenant_id}_meta_ads")
    assert latest_meta is not None

    await ingestor.meta_connector.close()
    await ingestor.google_connector.close()
