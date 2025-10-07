from datetime import datetime
from pathlib import Path

import polars as pl
import pytest

from apps.worker.ingestion.promo import PromoIngestor
from shared.libs.storage.lake import LakeWriter


class StubKlaviyoConnector:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    async def fetch(self, resource, **params):
        self.calls.append((resource, params))
        return self.payload


@pytest.mark.asyncio
async def test_promo_ingestor(tmp_path: Path):
    payload = {
        "data": [
            {
                "id": "abc",
                "attributes": {
                    "name": "Flash Sale",
                    "channel": "email",
                    "scheduled_at": "2024-01-02T00:00:00Z",
                    "status": "sent",
                },
            }
        ]
    }
    connector = StubKlaviyoConnector(payload)
    ingestor = PromoIngestor(connector=connector, writer=LakeWriter(root=tmp_path))
    summary = await ingestor.ingest_campaigns("tenantA", datetime(2024, 1, 1), datetime(2024, 1, 31))

    assert summary is not None
    assert summary.row_count == 1
    frame = pl.read_parquet(summary.path)
    assert frame[0, "name"] == "Flash Sale"
