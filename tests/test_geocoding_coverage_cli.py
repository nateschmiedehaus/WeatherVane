import polars as pl
import pytest

from apps.worker.maintenance.geocoding_coverage import (
    discover_tenants,
    run_geocoding_checks,
)


def _write_orders_snapshot(dataset_dir, geohashes):
    dataset_dir.mkdir(parents=True, exist_ok=True)
    frame = pl.DataFrame({"ship_geohash": geohashes})
    frame.write_parquet(dataset_dir / "2024-01-01.parquet")


def test_discover_tenants(tmp_path):
    lake_root = tmp_path / "lake" / "raw"
    _write_orders_snapshot(lake_root / "tenantA_shopify_orders", ["abcde"])
    _write_orders_snapshot(lake_root / "tenantB_shopify_orders", ["fghij"])
    (lake_root / "unrelated_dataset").mkdir(parents=True, exist_ok=True)

    tenants = discover_tenants(lake_root)
    assert tenants == ["tenantA", "tenantB"]


def test_run_geocoding_checks_success(tmp_path, capsys):
    lake_root = tmp_path / "lake" / "raw"
    summary_root = tmp_path / "metadata"
    _write_orders_snapshot(lake_root / "tenant_shopify_orders", ["abcde", "fghij"])

    results = run_geocoding_checks(
        ["tenant"],
        lake_root=lake_root,
        summary_root=summary_root,
        min_ratio=0.8,
        fail_on_warning=True,
    )

    captured = capsys.readouterr()
    assert "tenant=tenant" in captured.out
    assert results[0].status == "ok"
    summary_path = summary_root / "geocoding" / "tenant.json"
    assert summary_path.exists()


def test_run_geocoding_checks_fail_on_warning(tmp_path):
    lake_root = tmp_path / "lake" / "raw"
    summary_root = tmp_path / "metadata"
    _write_orders_snapshot(lake_root / "tenant_shopify_orders", ["abcde", None])

    with pytest.raises(SystemExit) as excinfo:
        run_geocoding_checks(
            ["tenant"],
            lake_root=lake_root,
            summary_root=summary_root,
            min_ratio=0.8,
            fail_on_warning=True,
        )

    assert "tenant (warning)" in str(excinfo.value)
    summary_path = summary_root / "geocoding" / "tenant.json"
    assert summary_path.exists()
