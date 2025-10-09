import json
from datetime import datetime

import pytest

from apps.worker.ingestion.ads import AdsIngestor, build_ads_ingestor_from_env
from shared.libs.storage.lake import LakeWriter


@pytest.mark.asyncio
async def test_ads_ingestor_with_fixtures(tmp_path, monkeypatch):
    lake_root = tmp_path / "lake"
    writer = LakeWriter(root=lake_root)

    meta_fixture = tmp_path / "meta.json"
    meta_fixture.write_text(json.dumps({
        "data": [
            {
                "date_start": "2024-01-01",
                "campaign_id": "c1",
                "adset_id": "a1",
                "spend": "10.0",
                "impressions": "100",
                "clicks": "5",
                "conversions": "1",
            }
        ]
    }))
    google_fixture = tmp_path / "google.json"
    google_fixture.write_text(json.dumps({
        "results": [
            {
                "segments": {"date": "2024-01-01"},
                "campaign": {"id": "g1"},
                "metrics": {
                    "cost_micros": "500000",
                    "impressions": "50",
                    "clicks": "2",
                    "conversions": "0.5",
                },
            }
        ]
    }))

    monkeypatch.setenv("META_INSIGHTS_FIXTURE", str(meta_fixture))
    monkeypatch.setenv("GOOGLEADS_FIXTURE", str(google_fixture))

    ingestor = build_ads_ingestor_from_env(str(lake_root))
    assert isinstance(ingestor, AdsIngestor)

    meta_summary = await ingestor.ingest_meta("tenant", datetime(2024, 1, 1), datetime(2024, 1, 2))
    google_summary = await ingestor.ingest_google("tenant", datetime(2024, 1, 1), datetime(2024, 1, 2))

    assert meta_summary.row_count == 1
    assert google_summary.row_count == 1
    assert (lake_root / "tenant_meta_ads").exists()
    assert (lake_root / "tenant_google_ads").exists()
