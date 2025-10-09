import json

from apps.worker.maintenance.reporting import (
    GeocodingReport,
    RetentionReport,
    export_geocoding_reports,
    export_retention_report,
    load_geocoding_reports,
    load_retention_report,
)
from shared.libs.storage.state import JsonStateStore


def test_load_retention_report(tmp_path):
    store = JsonStateStore(root=tmp_path)
    payload = {
        "summaries": [
            {
                "tenant_id": "t1",
                "removed": [],
                "removed_count": 0,
                "retention_days": 365,
                "context_tags": ["geo.partial"],
                "context_warnings": [],
            }
        ],
        "total_removed": 5,
        "tenant_count": 1,
        "warning_counts": {"warning": 1},
        "tag_counts": {"geo.partial": 1},
    }
    store.save("retention", "latest", payload)

    report = load_retention_report(str(tmp_path))
    assert isinstance(report, RetentionReport)
    assert report.total_removed == 5
    assert report.warning_counts == {"warning": 1}

    exported = export_retention_report(report, tmp_path / "retention.json")
    data = json.loads(exported.read_text())
    assert data["total_removed"] == 5


def test_load_geocoding_reports(tmp_path):
    store = JsonStateStore(root=tmp_path)
    store.save(
        "geocoding",
        "tenant-a",
        {"ratio": 0.5, "status": "warning"},
    )
    store.save(
        "geocoding",
        "tenant-b",
        {"ratio": 0.9, "status": "ok"},
    )

    reports = load_geocoding_reports(str(tmp_path))
    assert len(reports) == 2
    lookup = {report.tenant_id: report for report in reports}
    assert lookup["tenant-a"].status == "warning"
    assert lookup["tenant-b"].ratio == 0.9

    exported = export_geocoding_reports(reports, tmp_path / "geocoding.json")
    data = json.loads(exported.read_text())
    assert len(data) == 2
