import json
from datetime import datetime
from pathlib import Path

import polars as pl
import pytest

from apps.worker.ingestion.promo import PromoIngestor
from shared.libs.storage.lake import LakeWriter


class StubKlaviyoConnector:
    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload

    async def fetch(self, endpoint: str, **params: object) -> dict[str, object]:
        # Return a deep copy so mutations in tests don't leak across calls.
        return json.loads(json.dumps(self._payload))


@pytest.mark.asyncio
async def test_incremental_promo_dedup_and_updates(tmp_path: Path) -> None:
    initial_payload = {
        "data": [
            {
                "id": "promo-123",
                "attributes": {
                    "name": "Launch Campaign",
                    "channel": "email",
                    "scheduled_at": "2024-01-01T00:00:00Z",
                    "status": "draft",
                },
            }
        ]
    }
    connector = StubKlaviyoConnector(initial_payload)
    ingestor = PromoIngestor(writer=LakeWriter(root=tmp_path), connector=connector)

    start = datetime(2024, 1, 1)
    end = datetime(2024, 1, 2)

    first = await ingestor.ingest_campaigns("tenant-1", start, end)
    assert first.row_count == 1
    assert first.metadata["total_rows"] == 1
    assert first.metadata["new_rows"] == 1

    second = await ingestor.ingest_campaigns("tenant-1", start, end)
    assert second.row_count == 0
    assert second.metadata["total_rows"] == 1
    assert second.metadata["new_rows"] == 0
    assert second.metadata["updated_rows"] == 0

    frame = pl.read_parquet(second.path)
    assert frame.height == 1
    assert frame[0, "status"] == "draft"

    connector._payload["data"][0]["attributes"]["status"] = "sent"

    third = await ingestor.ingest_campaigns("tenant-1", start, end)
    assert third.row_count == 1
    assert third.metadata["total_rows"] == 1
    assert third.metadata["new_rows"] == 0
    assert third.metadata["updated_rows"] == 1

    updated_frame = pl.read_parquet(third.path)
    assert updated_frame.height == 1
    assert updated_frame[0, "status"] == "sent"
