from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import polars as pl
import pytest

from apps.worker.flows.poc_pipeline import (
    TenantContext,
    build_feature_matrix,
    fetch_ads_data,
    fetch_promo_data,
    fetch_shopify_data,
    fetch_weather_data,
)
from shared.feature_store.weather_cache import WeatherCache
from shared.libs.storage.state import JsonStateStore
from shared.validation.schemas import (
    validate_google_ads,
    validate_meta_ads,
    validate_promos,
    validate_shopify_orders,
    validate_shopify_products,
    validate_weather_daily,
)


def _clear_env(monkeypatch: pytest.MonkeyPatch, keys: list[str]) -> None:
    for key in keys:
        monkeypatch.delenv(key, raising=False)


@pytest.mark.asyncio
async def test_fetch_shopify_stub_data_respects_schema(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _clear_env(
        monkeypatch,
        [
            "SHOPIFY_SHOP_DOMAIN",
            "SHOPIFY_ACCESS_TOKEN",
            "SHOPIFY_API_VERSION",
        ],
    )
    context = TenantContext(
        tenant_id="tenant-1",
        start_date=datetime(2024, 1, 1, tzinfo=timezone.utc),
        end_date=datetime(2024, 1, 7, tzinfo=timezone.utc),
    )
    lake_root = tmp_path / "lake"
    state_root = tmp_path / "state"
    result = await fetch_shopify_data.fn(context, lake_root=str(lake_root), state_root=str(state_root))

    orders_frame = pl.read_parquet(Path(result["orders_path"]))
    products_frame = pl.read_parquet(Path(result["products_path"]))

    validate_shopify_orders(orders_frame.to_dicts())
    validate_shopify_products(products_frame.to_dicts())

    assert result["summary"]["orders_new_rows"] == 1
    assert result["summary"]["orders_updated_rows"] == 0
    assert result["summary"]["orders_total_rows"] == 1

    store = JsonStateStore(root=state_root)
    state_payload = store.load("ingestion", "tenant-1_shopify")
    assert state_payload["orders_total_rows"] == 1
    assert state_payload["orders_new_rows"] == 1
    assert state_payload["source"] == "stub"


@pytest.mark.asyncio
async def test_fetch_ads_stub_data_respects_schema(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _clear_env(
        monkeypatch,
        [
            "META_INSIGHTS_FIXTURE",
            "META_ACCESS_TOKEN",
            "META_APP_ID",
            "META_APP_SECRET",
            "GOOGLEADS_FIXTURE",
            "GOOGLEADS_DEVELOPER_TOKEN",
            "GOOGLEADS_CUSTOMER_ID",
            "GOOGLEADS_REFRESH_TOKEN",
            "GOOGLEADS_OAUTH_CLIENT_ID",
            "GOOGLEADS_OAUTH_CLIENT_SECRET",
        ],
    )
    context = TenantContext(
        tenant_id="tenant-1",
        start_date=datetime(2024, 2, 1, tzinfo=timezone.utc),
        end_date=datetime(2024, 2, 7, tzinfo=timezone.utc),
    )
    lake_root = tmp_path / "lake"
    state_root = tmp_path / "state"
    result = await fetch_ads_data.fn(context, lake_root=str(lake_root), state_root=str(state_root))

    meta_path = result["meta_path"]
    google_path = result["google_path"]

    if meta_path:
        meta_frame = pl.read_parquet(Path(meta_path))
        validate_meta_ads(meta_frame.to_dicts())
    if google_path:
        google_frame = pl.read_parquet(Path(google_path))
        validate_google_ads(google_frame.to_dicts())

    assert result["summary"]["meta_new_rows"] == 1
    assert result["summary"]["google_new_rows"] == 1

    store = JsonStateStore(root=state_root)
    state_payload = store.load("ingestion", "tenant-1_ads")
    assert state_payload["meta_new_rows"] == 1
    assert state_payload["google_new_rows"] == 1
    assert state_payload["source"] == "stub"


@pytest.mark.asyncio
async def test_fetch_promo_stub_data_respects_schema(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _clear_env(monkeypatch, ["KLAVIYO_API_KEY"])
    context = TenantContext(
        tenant_id="tenant-1",
        start_date=datetime(2024, 3, 1, tzinfo=timezone.utc),
        end_date=datetime(2024, 3, 7, tzinfo=timezone.utc),
    )
    lake_root = tmp_path / "lake"
    state_root = tmp_path / "state"
    result = await fetch_promo_data.fn(context, lake_root=str(lake_root), state_root=str(state_root))

    promo_frame = pl.read_parquet(Path(result["promo_path"]))
    validate_promos(promo_frame.to_dicts())

    assert result["summary"]["promo_new_rows"] == 1
    store = JsonStateStore(root=state_root)
    state_payload = store.load("ingestion", "tenant-1_promo")
    assert state_payload["promo_new_rows"] == 1
    assert state_payload["source"] == "stub"


@pytest.mark.asyncio
async def test_fetch_weather_stub_data_respects_schema(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    async def _fail_fetch(*args, **kwargs):
        raise RuntimeError("stub fetch failure")

    monkeypatch.setattr(WeatherCache, "ensure_range", _fail_fetch, raising=False)

    context = TenantContext(
        tenant_id="tenant-1",
        start_date=datetime(2024, 4, 1, tzinfo=timezone.utc),
        end_date=datetime(2024, 4, 7, tzinfo=timezone.utc),
    )
    lake_root = tmp_path / "lake"
    weather_root = tmp_path / "weather"
    result = await fetch_weather_data.fn(
        context,
        shopify_payload=None,
        cache_root=str(weather_root),
        lake_root=str(lake_root),
    )

    weather_frame = pl.read_parquet(Path(result["weather_path"]))
    validate_weather_daily(weather_frame)


@pytest.mark.asyncio
async def test_build_feature_matrix_includes_geography_metadata(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    async def _fail_fetch(*args, **kwargs):
        raise RuntimeError("stub fetch failure")

    for keys in (
        ["SHOPIFY_SHOP_DOMAIN", "SHOPIFY_ACCESS_TOKEN", "SHOPIFY_API_VERSION"],
        [
            "META_INSIGHTS_FIXTURE",
            "META_ACCESS_TOKEN",
            "META_APP_ID",
            "META_APP_SECRET",
            "GOOGLEADS_FIXTURE",
            "GOOGLEADS_DEVELOPER_TOKEN",
            "GOOGLEADS_CUSTOMER_ID",
            "GOOGLEADS_REFRESH_TOKEN",
            "GOOGLEADS_OAUTH_CLIENT_ID",
            "GOOGLEADS_OAUTH_CLIENT_SECRET",
        ],
        ["KLAVIYO_API_KEY"],
    ):
        _clear_env(monkeypatch, keys)

    monkeypatch.setattr(WeatherCache, "ensure_range", _fail_fetch, raising=False)

    context = TenantContext(
        tenant_id="tenant-geography",
        start_date=datetime(2024, 5, 1, tzinfo=timezone.utc),
        end_date=datetime(2024, 5, 7, tzinfo=timezone.utc),
    )
    lake_root = tmp_path / "lake"
    state_root = tmp_path / "state"
    weather_root = tmp_path / "weather"

    shopify_payload = await fetch_shopify_data.fn(context, lake_root=str(lake_root), state_root=str(state_root))
    ads_payload = await fetch_ads_data.fn(context, lake_root=str(lake_root), state_root=str(state_root))
    promo_payload = await fetch_promo_data.fn(context, lake_root=str(lake_root), state_root=str(state_root))
    weather_payload = await fetch_weather_data.fn(
        context,
        shopify_payload=shopify_payload,
        cache_root=str(weather_root),
        lake_root=str(lake_root),
    )

    report_path = tmp_path / "weather_join_validation.json"
    feature_payload = await build_feature_matrix.fn(
        shopify_payload,
        ads_payload,
        promo_payload,
        weather_payload,
        context,
        lake_root=str(lake_root),
        join_report_path=report_path,
    )

    metadata = feature_payload.get("metadata") or {}
    weather_join = metadata.get("weather_join") or {}

    assert metadata.get("geography_level") in {"dma", "state", "global"}
    assert isinstance(metadata.get("weather_coverage_ratio"), float)
    assert "weather_coverage_threshold" in metadata
    assert weather_join.get("geography_level") == metadata.get("geography_level")
    assert pytest.approx(weather_join.get("weather_coverage_ratio")) == metadata.get("weather_coverage_ratio")
    assert weather_join.get("weather_coverage_threshold") == metadata.get("weather_coverage_threshold")
    assert "geography_fallback_reason" in weather_join
    assert report_path.exists()
