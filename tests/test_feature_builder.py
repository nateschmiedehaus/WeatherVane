from datetime import datetime
from pathlib import Path

import pytest
import polars as pl

from shared.feature_store.feature_builder import FeatureBuilder, FeatureLeakageError
from shared.libs.storage.lake import LakeWriter, read_parquet
from shared.libs.testing.synthetic import WeatherShock, seed_synthetic_tenant


@pytest.mark.asyncio
async def test_feature_builder_with_synthetic_data(tmp_path: Path):
    tenant_id = "tenantSynthetic"
    seed_synthetic_tenant(tmp_path, tenant_id, days=30, shocks=[WeatherShock(start_day=1, end_day=2, temp_delta=5, rain_mm=10)])

    builder = FeatureBuilder(lake_root=tmp_path)
    matrix = builder.build(tenant_id, start=datetime(2023, 12, 10), end=datetime(2024, 1, 7))

    assert matrix.frame.height > 0
    expected_columns = {"date", "net_revenue", "meta_spend", "google_spend", "promos_sent"}
    assert expected_columns.issubset(set(matrix.frame.columns))
    lagged_expected = {
        "net_revenue_lag1",
        "net_revenue_roll7",
        "meta_spend_lag1",
        "meta_spend_roll7",
        "google_spend_lag1",
        "google_spend_roll7",
        "temp_c_lag1",
        "temp_c_roll7",
    }
    assert lagged_expected.issubset(set(matrix.frame.columns))
    assert matrix.frame.get_column("net_revenue_lag1").drop_nulls().len() > 0
    assert "target_available" in matrix.frame.columns
    assert "leakage_risk" in matrix.frame.columns
    assert matrix.leakage_risk_rows == 0
    assert matrix.frame.filter(pl.col("leakage_risk")).is_empty()
    assert matrix.forward_leakage_rows == 0
    assert matrix.forward_leakage_dates == []
    assert matrix.forecast_leakage_rows == 0
    assert matrix.forecast_leakage_dates == []
    assert matrix.orders_rows > 0
    assert matrix.ads_rows > 0
    assert matrix.promo_rows > 0
    assert matrix.observed_rows == matrix.observed_frame.height
    assert matrix.observed_rows == matrix.frame.filter(pl.col("target_available")).height
    assert matrix.latest_observed_date is not None


@pytest.mark.asyncio
async def test_feature_builder_marks_missing_targets(tmp_path: Path):
    tenant_id = "tenantLeakage"
    seed_synthetic_tenant(tmp_path, tenant_id, days=5)

    writer = LakeWriter(root=tmp_path)
    orders_path = writer.latest(f"{tenant_id}_shopify_orders")
    assert orders_path is not None

    orders_frame = read_parquet(orders_path)
    latest_date = orders_frame.with_columns(pl.col("created_at").str.slice(0, 10).alias("date")).get_column("date").max()
    assert latest_date is not None

    trimmed_orders = orders_frame.filter(pl.col("created_at").str.slice(0, 10) != latest_date)
    trimmed_orders.write_parquet(orders_path)

    builder = FeatureBuilder(lake_root=tmp_path)
    with pytest.raises(FeatureLeakageError) as excinfo:
        builder.build(tenant_id, start=datetime(2024, 1, 3), end=datetime(2024, 1, 7))

    err = excinfo.value
    assert err.forward_rows == 1
    assert err.forecast_rows == 0
    assert len(err.leakage_dates) == 1
    assert err.leakage_dates == err.forward_dates
    assert tenant_id == err.tenant_id
    assert err.matrix is not None
    matrix = err.matrix
    assert matrix.leakage_risk_rows == 1
    assert matrix.forward_leakage_rows == 1
    assert matrix.forecast_leakage_rows == 0
    assert matrix.frame.filter(pl.col("leakage_risk")).is_empty()
    assert matrix.observed_rows == matrix.frame.filter(pl.col("target_available")).height


@pytest.mark.asyncio
async def test_feature_builder_flags_forecast_weather_for_observed(tmp_path: Path):
    tenant_id = "tenantForecast"
    seed_synthetic_tenant(tmp_path, tenant_id, days=5)

    writer = LakeWriter(root=tmp_path)
    weather_path = writer.latest(f"{tenant_id}_weather_daily")
    assert weather_path is not None

    weather_frame = read_parquet(weather_path)
    assert not weather_frame.is_empty()
    weather_frame = weather_frame.with_columns(
        [
            pl.lit("forecast").alias("observation_type"),
            pl.lit("2024-01-01T00:00:00Z").alias("as_of_utc"),
        ]
    )
    weather_frame.write_parquet(weather_path)

    builder = FeatureBuilder(lake_root=tmp_path)
    with pytest.raises(FeatureLeakageError) as excinfo:
        builder.build(tenant_id, start=datetime(2024, 1, 3), end=datetime(2024, 1, 7))

    err = excinfo.value
    assert err.forecast_rows > 0
    assert err.forward_rows == 0
    assert err.leakage_rows == err.forecast_rows
    assert err.leakage_dates == err.forecast_dates
    assert err.matrix is not None
    matrix = err.matrix
    assert matrix.leakage_risk_rows == err.leakage_rows
    assert matrix.forecast_leakage_rows == err.forecast_rows
    assert matrix.frame.filter(pl.col("leakage_risk")).is_empty()
    assert matrix.observed_rows == matrix.frame.filter(pl.col("target_available")).height
