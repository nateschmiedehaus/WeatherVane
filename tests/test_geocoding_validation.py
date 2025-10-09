from apps.worker.validation.geocoding import evaluate_geocoding_coverage
from shared.libs.storage.lake import LakeWriter


def test_evaluate_geocoding_coverage_ok(tmp_path):
    writer = LakeWriter(root=tmp_path / "lake")
    dataset = "tenant_shopify_orders"
    rows = [
        {"id": 1, "ship_geohash": "abc"},
        {"id": 2, "ship_geohash": "def"},
        {"id": 3, "ship_geohash": None},
    ]
    writer.write_records(dataset, rows)

    result = evaluate_geocoding_coverage(
        "tenant",
        lake_root=str(tmp_path / "lake"),
        summary_root=str(tmp_path / "state"),
        min_ratio=0.5,
    )
    assert result.row_count == 3
    assert result.geocoded_count == 2
    assert result.status == "ok"


def test_evaluate_geocoding_coverage_missing_dataset(tmp_path):
    result = evaluate_geocoding_coverage(
        "tenant",
        lake_root=str(tmp_path / "lake"),
        summary_root=str(tmp_path / "state"),
    )
    assert result.status == "missing"


def test_evaluate_geocoding_coverage_warning(tmp_path):
    writer = LakeWriter(root=tmp_path / "lake")
    dataset = "tenant_shopify_orders"
    rows = [
        {"id": 1, "ship_geohash": ""},
        {"id": 2, "ship_geohash": None},
        {"id": 3, "ship_geohash": None},
        {"id": 4, "ship_geohash": "ghi"},
    ]
    writer.write_records(dataset, rows)

    result = evaluate_geocoding_coverage(
        "tenant",
        lake_root=str(tmp_path / "lake"),
        summary_root=str(tmp_path / "state"),
        min_ratio=0.9,
    )
    assert result.status == "warning"
    assert 0 < result.ratio < 0.9


def test_evaluate_geocoding_coverage_persists_state(tmp_path):
    writer = LakeWriter(root=tmp_path / "lake")
    dataset = "tenant_shopify_orders"
    rows = [
        {"id": 1, "ship_geohash": None},
        {"id": 2, "ship_geohash": None},
    ]
    writer.write_records(dataset, rows)

    summary_root = tmp_path / "state"
    result = evaluate_geocoding_coverage(
        "tenant",
        lake_root=str(tmp_path / "lake"),
        summary_root=str(summary_root),
    )
    assert result.status == "critical"

    stored = (summary_root / "geocoding" / "tenant.json").read_text()
    assert "critical" in stored
