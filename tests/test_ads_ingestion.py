from datetime import datetime
from pathlib import Path

import polars as pl
import pytest

from apps.worker.ingestion.ads import AdsIngestor
from shared.libs.storage.lake import LakeWriter


class StubMetaConnector:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    async def fetch(self, endpoint, **params):
        self.calls.append((endpoint, params))
        return self.payload


class StubGoogleConnector:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    async def fetch(self, service, **params):
        self.calls.append((service, params))
        return self.payload


@pytest.mark.asyncio
async def test_ads_ingestor_writes_parquet(tmp_path: Path):
    meta_payload = {
        "data": [
            {
                "date_start": "2024-01-01",
                "campaign_id": "111",
                "adset_id": "222",
                "spend": "10.50",
                "impressions": "100",
                "clicks": "5",
                "conversions": "2",
            }
        ]
    }
    google_payload = {
        "results": [
            {
                "segments": {"date": "2024-01-01"},
                "campaign": {"id": "333"},
                "metrics": {
                    "cost_micros": "25000000",
                    "impressions": "200",
                    "clicks": "10",
                    "conversions": "3",
                },
            }
        ]
    }

    ingestor = AdsIngestor(
        writer=LakeWriter(root=tmp_path),
        meta_connector=StubMetaConnector(meta_payload),
        google_connector=StubGoogleConnector(google_payload),
    )
    start = datetime(2024, 1, 1)
    end = datetime(2024, 1, 7)

    meta_summary = await ingestor.ingest_meta("tenantA", start, end)
    google_summary = await ingestor.ingest_google("tenantA", start, end)

    assert meta_summary and meta_summary.row_count == 1
    assert google_summary and google_summary.row_count == 1

    meta_frame = pl.read_parquet(meta_summary.path)
    google_frame = pl.read_parquet(google_summary.path)

    assert meta_frame[0, "spend"] == 10.50
    assert google_frame[0, "spend"] == 25.0
