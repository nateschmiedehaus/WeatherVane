import json
from datetime import datetime
from pathlib import Path

import polars as pl
import pytest

from apps.worker.ingestion.promo import PromoIngestor
from shared.libs.storage.lake import LakeWriter
from shared.libs.storage.state import JsonStateStore


class StubKlaviyoConnector:
    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload
        self.calls: list[dict[str, object]] = []

    async def fetch(self, endpoint: str, **params: object) -> dict[str, object]:
        # Return a deep copy so mutations in tests don't leak across calls.
        self.calls.append({"endpoint": endpoint, "params": dict(params)})
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
                    "updated_at": "2024-01-01T00:00:00Z",
                },
            }
        ]
    }
    connector = StubKlaviyoConnector(initial_payload)
    ingestor = PromoIngestor(
        writer=LakeWriter(root=tmp_path / "lake"),
        connector=connector,
        state_store=JsonStateStore(root=tmp_path / "state"),
    )

    start = datetime(2024, 1, 1)
    end = datetime(2024, 1, 2)

    first = await ingestor.ingest_campaigns("tenant-1", start, end)
    assert first.row_count == 1
    assert first.metadata["total_rows"] == 1
    assert first.metadata["new_rows"] == 1
    assert first.metadata["checkpoint"] == "2024-01-01T00:00:00Z"
    state = ingestor.state_store.load("klaviyo", "tenant-1_promos") if ingestor.state_store else {}
    assert state["updated_at_min"] == "2024-01-01T00:00:00Z"
    assert "greater-or-equal(created_at,'2024-01-01T00:00:00')" in connector.calls[0]["params"]["filter"]

    second = await ingestor.ingest_campaigns("tenant-1", start, end)
    assert second.row_count == 0
    assert second.metadata["total_rows"] == 1
    assert second.metadata["new_rows"] == 0
    assert second.metadata["updated_rows"] == 0
    assert "greater-than(updated_at,'2024-01-01T00:00:00Z')" in connector.calls[1]["params"]["filter"]

    frame = pl.read_parquet(second.path)
    assert frame.height == 1
    assert frame[0, "status"] == "draft"

    connector._payload["data"][0]["attributes"]["status"] = "sent"
    connector._payload["data"][0]["attributes"]["updated_at"] = "2024-01-03T12:00:00Z"

    third = await ingestor.ingest_campaigns("tenant-1", start, end)
    assert third.row_count == 1
    assert third.metadata["total_rows"] == 1
    assert third.metadata["new_rows"] == 0
    assert third.metadata["updated_rows"] == 1
    assert third.metadata["checkpoint"] == "2024-01-03T12:00:00Z"

    updated_frame = pl.read_parquet(third.path)
    assert updated_frame.height == 1
    assert updated_frame[0, "status"] == "sent"
    state_after_update = ingestor.state_store.load("klaviyo", "tenant-1_promos") if ingestor.state_store else {}
    assert state_after_update["updated_at_min"] == "2024-01-03T12:00:00Z"
