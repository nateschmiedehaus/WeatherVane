import pytest

from shared.libs.storage.state import JsonStateStore


def test_geocoding_summary_rollup(tmp_path):
    store = JsonStateStore(root=tmp_path)
    payload = {
        "retention_days": 365,
        "summaries": [
            {
                "tenant_id": "t1",
                "removed": [],
                "removed_count": 0,
                "context_tags": ["geo.partial"],
                "context_warnings": [
                    {
                        "code": "geo_partial",
                        "severity": "warning",
                        "message": "Geo coverage partial",
                        "tags": ["geo.partial"],
                    }
                ],
            }
        ],
        "total_removed": 0,
        "tenant_count": 1,
        "tag_counts": {"geo.partial": 1},
        "warning_counts": {"warning": 1},
        "warning_codes": {"geo_partial": 1},
        "timestamp": "2024-01-01T00:00:00Z",
    }
    store.save("retention", "latest", payload)
    loaded = store.load("retention", "latest")
    assert loaded["tag_counts"]["geo.partial"] == 1
