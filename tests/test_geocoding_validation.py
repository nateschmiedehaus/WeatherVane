from datetime import datetime

from apps.worker.validation.geocoding import evaluate_geocoding_coverage
from shared.libs.storage.lake import LakeWriter


def _order_record(order_id: str, ship_geohash: str | None) -> dict[str, object]:
    base_created_at = datetime(2024, 1, 7).isoformat() + "Z"
    subtotal = 130.0
    total_discounts = 5.0
    total_tax = 10.4
    total_price = subtotal + total_tax
    net_revenue = subtotal - total_discounts
    return {
        "tenant_id": "tenant",
        "order_id": order_id,
        "name": f"Order {order_id}",
        "created_at": base_created_at,
        "currency": "USD",
        "total_price": total_price,
        "subtotal_price": subtotal,
        "total_tax": total_tax,
        "total_discounts": total_discounts,
        "net_revenue": net_revenue,
        "shipping_postal_code": "94107",
        "shipping_country": "US",
        "ship_latitude": 37.7749,
        "ship_longitude": -122.4194,
        "ship_geohash": ship_geohash,
    }


def test_evaluate_geocoding_coverage_ok(tmp_path):
    writer = LakeWriter(root=tmp_path / "lake")
    dataset = "tenant_shopify_orders"
    rows = [
        _order_record("order-1", "abc"),
        _order_record("order-2", "def"),
        _order_record("order-3", None),
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
        _order_record("order-1", ""),
        _order_record("order-2", None),
        _order_record("order-3", None),
        _order_record("order-4", "ghi"),
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
        _order_record("order-1", None),
        _order_record("order-2", None),
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
